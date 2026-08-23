#!/usr/bin/env node

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const workflowsDir = join(root, ".github", "workflows");

// The release policy permits GitHub-maintained actions to use a major tag while
// Dependabot/review owns updates. Third-party actions must be immutable SHAs.
const approvedMutableActions = new Set([
  "actions/checkout",
  "actions/configure-pages",
  "actions/dependency-review-action",
  "actions/deploy-pages",
  "actions/setup-node",
  "actions/upload-pages-artifact",
  "github/codeql-action/init",
  "github/codeql-action/analyze",
]);
const majorTag = /^v\d+$/;
const fullSha = /^[0-9a-f]{40}$/;
const errors = [];
const reports = [];

function lineNumber(lines, index) {
  return index + 1;
}

function sectionIndent(lines, index, key) {
  const match = lines[index].match(/^(\s*)/);
  const indent = match?.[1].length ?? 0;
  return lines[index].trim() === `${key}:` ? indent : -1;
}

function collectMapping(lines, start, key) {
  const indent = sectionIndent(lines, start, key);
  if (indent < 0) return [];
  const values = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const currentIndent = line.match(/^(\s*)/)?.[1].length ?? 0;
    if (currentIndent <= indent) break;
    const entry = line.match(/^\s+([a-z-]+):\s*(\S+)\s*$/);
    if (entry) values.push({ key: entry[1], value: entry[2], line: lineNumber(lines, index) });
  }
  return values;
}

const names = (await readdir(workflowsDir)).filter((name) => /\.ya?ml$/.test(name)).sort();
if (names.length === 0) errors.push("no workflow files found");

for (const name of names) {
  const path = join(workflowsDir, name);
  const lines = (await readFile(path, "utf8")).split(/\r?\n/);
  const text = lines.join("\n");

  if (!/^name:\s*\S/m.test(text)) errors.push(`${name}: missing top-level name`);
  if (!/^on:\s*(?:$|#)/m.test(text)) errors.push(`${name}: missing top-level on trigger`);
  if (!/^jobs:\s*$/m.test(text)) errors.push(`${name}: missing top-level jobs mapping`);
  if (/^\s*permissions:\s*write-all\s*$/m.test(text)) errors.push(`${name}: write-all permissions are forbidden`);
  if (/^\s*permissions:\s*read-all\s*$/m.test(text)) errors.push(`${name}: read-all permissions must be explicit`);
  if (/^\s*pull_request_target\s*:/m.test(text)) errors.push(`${name}: pull_request_target requires explicit review`);

  if (name === "pages.yml") {
    const topLevelPermissions = lines.slice(0, lines.findIndex((line) => line.trim() === "jobs:")).join("\n");
    if (/^\s+(?:pages|id-token):\s*write\s*$/m.test(topLevelPermissions)) {
      errors.push("pages.yml: pages deployment permissions must be scoped to deploy.permissions");
    }
    const deployStart = lines.findIndex((line) => /^  deploy:\s*$/.test(line));
    const deployEnd = deployStart < 0 ? -1 : lines.findIndex((line, index) => index > deployStart && /^  [a-zA-Z0-9_-]+:\s*$/.test(line));
    const deployText = lines.slice(deployStart, deployEnd < 0 ? lines.length : deployEnd).join("\n");
    if (!/^    permissions:\s*$/m.test(deployText) || !/^      pages:\s*write\s*$/m.test(deployText) || !/^      id-token:\s*write\s*$/m.test(deployText)) {
      errors.push("pages.yml: deploy job must request pages: write and id-token: write");
    }
  }

  const permissions = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].trim() === "permissions:") permissions.push(...collectMapping(lines, index, "permissions"));
  }
  for (const permission of permissions) {
    if (permission.value === "write" && permission.key === "contents") {
      errors.push(`${name}:${permission.line}: contents: write is not allowed`);
    }
  }

  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^\s+-?\s*uses:\s*([^\s#]+)\s*(?:#.*)?$/);
    if (!match) continue;
    const reference = match[1];
    if (reference.startsWith("./")) continue;
    const action = reference.slice(0, reference.lastIndexOf("@"));
    const ref = reference.slice(reference.lastIndexOf("@") + 1);
    if (!action.includes("/") || !ref) {
      errors.push(`${name}:${lineNumber(lines, index)}: malformed action reference ${reference}`);
    } else if (fullSha.test(ref)) {
      reports.push(`${name}:${lineNumber(lines, index)} ${reference} (immutable SHA)`);
    } else if (approvedMutableActions.has(action) && majorTag.test(ref)) {
      reports.push(`${name}:${lineNumber(lines, index)} ${reference} (approved official major-tag exception)`);
    } else {
      errors.push(`${name}:${lineNumber(lines, index)}: action must use a full SHA or approved official major tag: ${reference}`);
    }
  }
}

for (const report of reports) console.log(`workflow: ${report}`);
if (errors.length) {
  for (const error of errors) console.error(`workflow error: ${error}`);
  process.exitCode = 1;
} else {
  console.log(`Validated ${names.length} workflow file(s) with ${reports.length} action reference(s).`);
}
