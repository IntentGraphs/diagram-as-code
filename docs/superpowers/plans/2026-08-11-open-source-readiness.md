# Open-Source Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the bpm monorepo legally, securely, and operationally ready, then host it on GitHub as a **private** repository (Phases 0–5). Phase 6 is an optional go/no-go for making the repo public, hosting a demo, and/or publishing npm packages.

**Architecture:** Keep the existing npm workspaces pipeline. Add community/legal files and CI at the repo root; harden parser ID rules, XML escaping, and web SVG mounting; tighten `.gitignore` and docs. Create any GitHub remote with **private** visibility. Do not make the repo public, publish npm packages, or host a demo until Phase 6.

**Tech Stack:** TypeScript, npm workspaces, Vitest, Vite, Playwright, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-11-open-source-readiness-design.md`  
**Living summary:** `docs/OPEN-SOURCE-READINESS.md`

## Global Constraints

- Do not claim Diagram mode ↔ text sync, Camunda runtime deployment, or full BPMN legality enforcement in any new public copy.
- Do not commit secrets, `.env`, or API keys.
- Do not force-push `main` or rewrite published history after the first remote push.
- Any GitHub repository created for this project in Phases 0–5 **must be private** (`gh repo create … --private`, or equivalent UI). Do not use `--public`.
- Prefer MIT unless `docs/OPEN-SOURCE-READINESS.md` Decisions table was updated to another SPDX id before Phase 1.
- Soft limits (Phase 3): max source length **100_000** characters; max nodes **500**; max edges **1000**. Exceeding any → structured validate/CLI error, no layout attempt.
- Identifier pattern (Phase 3): `^[A-Za-z_][A-Za-z0-9_.-]*$` for user-facing ids (`as <id>`, edge endpoints, `on <hostId>`).

## File map (create / modify)

| Path | Role |
|---|---|
| `LICENSE` | SPDX license text |
| `SECURITY.md` | Threat model + reporting |
| `CONTRIBUTING.md` | Dev/test/contribute |
| `CODE_OF_CONDUCT.md` | Community conduct |
| `CHANGELOG.md` | Version history |
| `.gitignore` | Hygiene |
| `.github/workflows/ci.yml` | Build + test |
| `.github/dependabot.yml` | Dependency PRs |
| `README.md` | User-facing entry |
| `docs/OPEN-SOURCE-READINESS.md` | Phase status |
| `docs/LANGUAGE.md` | Document ID alphabet |
| `packages/parser/src/parser.ts` | ID validation |
| `packages/parser/test/*.ts` | ID reject/accept tests |
| `packages/render/src/xml.ts` (+ call sites) | Escape ids in SVG attrs |
| `packages/export-xml/src/**` | Escape ids/refs in BPMN XML |
| `packages/validate/src/index.ts` | Size limits |
| `packages/cli/src/**` | Surface limit errors |
| `apps/web/src/main.ts` | Safer SVG mount |
| `examples/README.md` + samples | Getting-started examples |

---

### Task 1: Phase 0 — Lock decisions

**Files:**
- Modify: `docs/OPEN-SOURCE-READINESS.md` (Decisions + Phase 0 status)

**Interfaces:**
- Produces: Confirmed `License` and `Public repo name` rows (no longer “Confirm before…”)

- [ ] **Step 1: Confirm license, repo name, and GitHub visibility with the maintainer**

Defaults if unset: License = MIT, Repo name = `bpm`, GitHub visibility = **private**. The visibility row is already locked private (2026-08-11); do not change it to public in Phase 0. Write license/name Status as `Locked YYYY-MM-DD`.

- [ ] **Step 2: Update phase checklist**

Set Phase 0 Status to `Done`.

- [ ] **Step 3: Commit**

```bash
git add docs/OPEN-SOURCE-READINESS.md
git commit -m "$(cat <<'EOF'
docs: lock open-source Phase 0 decisions (private GitHub)

EOF
)"
```

---

### Task 2: Phase 1 — LICENSE

**Files:**
- Create: `LICENSE`

- [ ] **Step 1: Add MIT license text**

Use the standard MIT text. Copyright line: `Copyright (c) 2026` plus the maintainer’s legal name or handle as they specify (if unspecified, use the GitHub username that will own the repo).

- [ ] **Step 2: Commit**

```bash
git add LICENSE
git commit -m "$(cat <<'EOF'
docs: add MIT LICENSE

EOF
)"
```

---

### Task 3: Phase 1 — SECURITY.md

**Files:**
- Create: `SECURITY.md`

- [ ] **Step 1: Write SECURITY.md**

Required sections:

1. Supported versions (tag `v1.0.0` and `main`).
2. Threat model: local CLI + static web; no multi-tenant server in current release.
3. How to report: while the GitHub repo is **private**, use a private maintainer channel or GitHub private vulnerability reporting if enabled; after a future Phase 6 visibility flip to public, prefer GitHub Security Advisories. If no email is set, state that clearly.
4. Please include: reproduction, affected version/commit, impact.
5. Explicit non-goals: Camunda production hardening, sandboxing of arbitrary BPMN XML execution engines.

- [ ] **Step 2: Commit**

```bash
git add SECURITY.md
git commit -m "$(cat <<'EOF'
docs: add SECURITY policy and threat model

EOF
)"
```

---

### Task 4: Phase 1 — CONTRIBUTING + CODE_OF_CONDUCT + CHANGELOG

**Files:**
- Create: `CONTRIBUTING.md`
- Create: `CODE_OF_CONDUCT.md`
- Create: `CHANGELOG.md`
- Modify: `docs/OPEN-SOURCE-READINESS.md` (Phase 1 → Done)

- [ ] **Step 1: CONTRIBUTING.md**

Include: prerequisites (Node 20+ LTS), `npm install`, `npm run build --workspaces --if-present`, `npm test`, `npm run bpm -- validate examples/...`, web `cd apps/web && npm run dev`, pointer to `docs/ASSESSMENT-HANDOFF.md` for package map, note that large features should go through spec → plan → build, and PR expectation that CI must pass.

- [ ] **Step 2: CODE_OF_CONDUCT.md**

Use Contributor Covenant v2.1 text (or a short equivalent). Set enforcement contact to the same channel as SECURITY.md.

- [ ] **Step 3: CHANGELOG.md**

Use Keep a Changelog structure. Summarize existing tags:

- `1.0.0` — full notation, pluggable layout, manual positioning, validate + CLI, web text + Diagram mode
- `0.2.0` / `0.1.0` — brief “pre-1.0 milestones” one-liners if exact notes are unknown

Unreleased section empty or pointing at ROADMAP.

- [ ] **Step 4: Mark Phase 1 done in OPEN-SOURCE-READINESS.md**

- [ ] **Step 5: Commit**

```bash
git add CONTRIBUTING.md CODE_OF_CONDUCT.md CHANGELOG.md docs/OPEN-SOURCE-READINESS.md
git commit -m "$(cat <<'EOF'
docs: add contributing, conduct, and changelog

EOF
)"
```

---

### Task 5: Phase 2 — Gitignore and untrack junk

**Files:**
- Modify: `.gitignore`
- Untrack (do not delete locally unless asked): `apps/web/.vite/`, `out.svg`, `.DS_Store` files, `.claude/` if tracked

**`.gitignore` must include at least:**

```gitignore
node_modules/
dist/
*.tsbuildinfo
.DS_Store
playwright-report/
test-results/
.worktrees/
.superpowers/
.claude/
apps/web/.vite/
out.svg
*.log
.env
.env.*
```

- [ ] **Step 1: Update `.gitignore`**

- [ ] **Step 2: Remove tracked junk from the index if present**

```bash
git rm -r --cached apps/web/.vite 2>/dev/null || true
git rm --cached out.svg 2>/dev/null || true
git rm -r --cached .claude 2>/dev/null || true
find . -name .DS_Store -print
# git rm --cached any tracked .DS_Store paths
```

- [ ] **Step 3: `git status` — confirm junk is untracked/ignored**

- [ ] **Step 4: Mark Phase 2 hygiene portion done (or wait until Task 6 for docs nav)**

- [ ] **Step 5: Commit**

```bash
git add .gitignore
git commit -m "$(cat <<'EOF'
chore: ignore agent caches, Vite deps, and build junk

EOF
)"
```

---

### Task 6: Phase 2 — Examples index and doc pointers

**Files:**
- Create: `examples/README.md`
- Create or copy: at least one auto-layout example under `examples/getting-started/hello.bpm` (simple task/gateway/end, no `positioning: manual`)
- Modify: `docs/OPEN-SOURCE-READINESS.md` (Phase 2 → Done)

- [ ] **Step 1: Add `examples/getting-started/hello.bpm`**

```bpm
task "Review order" as t1
gateway exclusive "Approved?" as g1
task "Ship item" as t2
event end none "Done" as e1

t1 -> g1
g1 -> t2: "yes"
t2 -> e1
```

- [ ] **Step 2: Write `examples/README.md`**

List `getting-started/` and `manual-mode/` with one-line descriptions; show `npm run bpm -- validate examples/getting-started/hello.bpm`.

- [ ] **Step 3: Mark Phase 2 Done**

- [ ] **Step 4: Commit**

```bash
git add examples docs/OPEN-SOURCE-READINESS.md
git commit -m "$(cat <<'EOF'
docs: add getting-started example and examples index

EOF
)"
```

---

### Task 7: Phase 3 — Restrict identifier grammar

**Files:**
- Modify: `packages/parser/src/parser.ts`
- Modify: `packages/parser/test/parser.test.ts` (or dedicated `ids.test.ts`)
- Modify: `docs/LANGUAGE.md` (id rules)

**Interfaces:**
- Produces: `isValidId(id: string): boolean` (export from parser module or tokens)
- Pattern: `/^[A-Za-z_][A-Za-z0-9_.-]*$/`

- [ ] **Step 1: Write failing tests**

Accept: `t1`, `_x`, `order_1`, `a.b-c`  
Reject: `1x`, `a"b`, `a<b`, `a b`, empty

Assert reject paths yield a `ParseError` whose message mentions `id` / `identifier`.

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npx vitest run packages/parser
```

- [ ] **Step 3: Implement validation**

After capturing each `as <id>` / edge endpoint / `on <hostId>`, if `!isValidId(id)` push a parse error and skip adding the node/edge (same style as existing malformed-line handling).

- [ ] **Step 4: Run tests — expect PASS**

```bash
npx vitest run packages/parser
```

- [ ] **Step 5: Update LANGUAGE.md** — document allowed id characters under node declarations.

- [ ] **Step 6: Commit**

```bash
git add packages/parser docs/LANGUAGE.md
git commit -m "$(cat <<'EOF'
fix(parser): restrict ids to BPMN-safe identifier alphabet

EOF
)"
```

---

### Task 8: Phase 3 — Escape ids in SVG and BPMN XML

**Files:**
- Modify: `packages/render/src/**` wherever `id=` or url refs use raw node ids
- Modify: `packages/export-xml/src/elements.ts`, `collaboration.ts`, `diagramInterchange.ts` (any raw `id=` / `sourceRef=` / `targetRef=` / `attachedToRef=`)
- Test: `packages/render/test/`, `packages/export-xml/test/`

- [ ] **Step 1: Write failing tests**

Even with parser rejection, unit-test escape helpers: a hypothetical id containing `"` must not appear raw inside an attribute when passed through render/export helpers. Prefer testing `escapeXml` usage on id fields via a small exported fixture or by rendering a manually constructed positioned diagram if the public API allows (bypass parser).

- [ ] **Step 2: Implement — wrap every id/ref attribute value with `escapeXml(...)`**

- [ ] **Step 3: Run**

```bash
npx vitest run packages/render packages/export-xml
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/render packages/export-xml
git commit -m "$(cat <<'EOF'
fix(security): escape ids and refs in SVG and BPMN XML

EOF
)"
```

---

### Task 9: Phase 3 — Safer SVG mount in the web app

**Files:**
- Modify: `apps/web/src/main.ts`
- Create: `apps/web/src/mountSvg.ts` (preferred small helper)
- Test: unit test for helper if easy under vitest; else Playwright assertion that a label with `<` does not create an HTML element child

**Interfaces:**
- Produces: `mountSvg(container: HTMLElement, svgMarkup: string): void`

Recommended implementation:

1. `const doc = new DOMParser().parseFromString(svgMarkup, 'image/svg+xml')`
2. If `parsererror` present, show error strip and return
3. `container.replaceChildren(document.importNode(doc.documentElement, true))`

- [ ] **Step 1: Add `mountSvg` helper + test (or e2e)**

- [ ] **Step 2: Replace `preview.innerHTML = result.svg!` with `mountSvg(preview, result.svg!)`

- [ ] **Step 3: Run web unit/e2e as available**

```bash
npx vitest run apps/web
cd apps/web && npx playwright test
```

- [ ] **Step 4: Commit**

```bash
git add apps/web
git commit -m "$(cat <<'EOF'
fix(web): mount SVG via DOMParser instead of innerHTML

EOF
)"
```

---

### Task 10: Phase 3 — Validate/CLI size limits

**Files:**
- Modify: `packages/validate/src/index.ts`
- Modify: `packages/validate/test/` (create if needed)
- Modify: `packages/cli/test/` if CLI should assert exit codes
- Modify: `SECURITY.md` (document limits)
- Modify: `docs/OPEN-SOURCE-READINESS.md` (Phase 3 → Done)

**Interfaces:**
- Consumes: parse → layout path inside `validate`
- Produces: early `{ valid: false, errors: [...], warnings: [], metrics: ... }` when over limits

Limits: `100_000` chars; `500` nodes; `1000` edges (count from AST after successful parse for node/edge caps; char limit before parse).

- [ ] **Step 1: Failing tests for oversize text and oversize node count**

- [ ] **Step 2: Implement checks in `validate()`**

- [ ] **Step 3: Run**

```bash
npx vitest run packages/validate packages/cli
```

- [ ] **Step 4: Document limits in SECURITY.md; mark Phase 3 Done**

- [ ] **Step 5: Commit**

```bash
git add packages/validate packages/cli SECURITY.md docs/OPEN-SOURCE-READINESS.md
git commit -m "$(cat <<'EOF'
feat(validate): enforce diagram size limits for safe public use

EOF
)"
```

---

### Task 11: Phase 4 — GitHub Actions CI

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Add workflow**

```yaml
name: ci
on:
  push:
    branches: [main]
  pull_request:
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: npm
      - run: npm ci
      - run: npm run build --workspaces --if-present
      - run: npm test
      - run: npm audit --omit=dev
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "$(cat <<'EOF'
ci: add build, test, and production audit workflow

EOF
)"
```

---

### Task 12: Phase 4 — Dependabot

**Files:**
- Create: `.github/dependabot.yml`
- Modify: `docs/OPEN-SOURCE-READINESS.md` (Phase 4 → Done)

- [ ] **Step 1: Add Dependabot npm + github-actions weekly config**

- [ ] **Step 2: Mark Phase 4 Done**

- [ ] **Step 3: Commit**

```bash
git add .github/dependabot.yml docs/OPEN-SOURCE-READINESS.md
git commit -m "$(cat <<'EOF'
ci: enable Dependabot for npm and Actions

EOF
)"
```

---

### Task 13: Phase 5 — README public positioning

**Files:**
- Modify: `README.md`
- Modify: `docs/OPEN-SOURCE-READINESS.md` (Phase 5 → Done)

- [ ] **Step 1: Rewrite README sections**

Must include:

1. One-sentence product pitch (existing is fine if tightened).
2. Sample `.bpm` block + link to `examples/getting-started/hello.bpm`.
3. Install / build / test / CLI validate / web dev commands.
4. Table of docs including `OPEN-SOURCE-READINESS.md`, STATUS, LANGUAGE, CLI, ROADMAP.
5. **Is / is not** bullets per the design spec.
6. License line: `MIT` (or locked license) + link to `LICENSE`.
7. Note: packages are workspace-private until a Phase 6 publish.

- [ ] **Step 2: Mark Phase 5 Done**

- [ ] **Step 3: Full verification**

```bash
npm ci
npm run build --workspaces --if-present
npm test
npm run bpm -- validate examples/getting-started/hello.bpm
```

Expected: all green; validate JSON `valid: true`.

- [ ] **Step 4: Commit**

```bash
git add README.md docs/OPEN-SOURCE-READINESS.md
git commit -m "$(cat <<'EOF'
docs: prepare README for public open-source readers

EOF
)"
```

---

### Task 14: Phase 6 — Optional go/no-go (do not execute unless asked)

**Files:** (future) repo visibility settings; GitHub Pages or static host config; package `publishConfig`; npm 2FA

**Exit criteria for a later session (each item optional, explicit approval required):**

- [ ] Flip GitHub visibility from **private → public** (only after maintainer confirmation)
- [ ] Static demo deployed from `apps/web` build with SVG mount + limits active
- [ ] npm scope reserved; only selected packages published with aligned semver = git tag
- [ ] README badges: license, CI, version

Until the maintainer explicitly starts Phase 6, leave status `Deferred` in `docs/OPEN-SOURCE-READINESS.md`. Do **not** run `gh repo edit --visibility public` (or equivalent) as part of Tasks 1–13.

### Task 15: After Phase 5 — Create private GitHub remote (optional same session)

**Constraint:** Repository **must** be private.

- [ ] **Step 1: Create private remote and push** (only after Tasks 1–13 complete, and only if the maintainer asks)

```bash
# Example — adjust owner/name; ALWAYS --private
gh repo create <owner>/bpm --private --source=. --remote=origin --push
```

If `origin` already exists, verify it is private:

```bash
gh repo view --json visibility -q .visibility
# Expected: PRIVATE
```

- [ ] **Step 2: Confirm Actions run on the private repo**

Open the Actions tab; ensure `ci` workflow runs on the push.

---

## Spec coverage check

| Spec requirement | Task |
|---|---|
| Phase 0 decisions (incl. private GitHub) | Task 1 |
| LICENSE / SECURITY / CONTRIBUTING / CoC / CHANGELOG | Tasks 2–4 |
| Hygiene + examples nav | Tasks 5–6 |
| ID alphabet + LANGUAGE | Task 7 |
| Escape ids | Task 8 |
| Safer SVG mount | Task 9 |
| Size limits + SECURITY update | Task 10 |
| CI + Dependabot | Tasks 11–12 |
| README positioning | Task 13 |
| Optional public flip / demo / npm | Task 14 |
| Private remote create/push | Task 15 |

## Execution order

Run Tasks **1 → 13** in order. Task 15 (private remote) only on explicit request after Task 13. Task 14 (public visibility / demo / npm) only on separate explicit request.
