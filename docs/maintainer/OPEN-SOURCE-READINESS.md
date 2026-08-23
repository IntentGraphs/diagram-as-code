# Open-Source Readiness

_Living summary. Design: [`docs/superpowers/specs/2026-08-11-open-source-readiness-design.md`](../superpowers/specs/2026-08-11-open-source-readiness-design.md). Executable tasks: [`docs/superpowers/plans/2026-08-11-open-source-readiness.md`](../superpowers/plans/2026-08-11-open-source-readiness.md). Product truth: [`STATUS.md`](../STATUS.md)._

## Purpose

Prepare and verify the public release of this monorepo (legal clarity, security baseline, clean workspace, CI, honest docs). The public release uses a clean `IntentGraphs/diagram-as-code` repository snapshot; the staging workspace and its earlier private history are not copied into that repository.

## Decisions

| Item | Value | Status |
|---|---|---|
| License | MIT | **Locked 2026-08-11** |
| Product identity | `bpm` | **Locked 2026-08-11** — retained as the CLI/package identity |
| Public repository | `IntentGraphs/diagram-as-code` | **Selected 2026-08-23** — reflects BPMN plus the supported diagram families |
| GitHub visibility | **Public target** | Owner-controlled repository creation and settings remain to be completed |
| Public release tag | `v1.0.0` | First tag in the clean public history |
| npm publish | Not in Phases 0–5 | Phase 6 go/no-go |
| Hosted demo | Not in Phases 0–5 | Phase 6 go/no-go |

## Phase checklist

| Phase | Focus | Status |
|---|---|---|
| 0 | Lock license + product identity + clean public-repository strategy | **Done** |
| 1 | LICENSE, SECURITY, CONTRIBUTING, CODE_OF_CONDUCT, CHANGELOG | **Done** |
| 2 | `.gitignore`, untrack junk, docs navigation | **Done** |
| 3 | ID rules, XML escape, safer SVG mount, limits, threat model | **Done** |
| 4 | GitHub Actions, Dependabot, strict audit in CI | **Done — production audit green; no PPTX dependency exception required** |
| 5 | README + examples + open-source positioning copy | **Done** |
| 6 | Create the public clean repository, enable the static demo, and/or publish npm packages | Public repository prepared locally; GitHub-side publication remains |

The clean local snapshot may be pushed only after the public repository is created and the exact `v1.0.0` release commit has passed the verification gates. npm publication remains a separate decision.

## Threat model (short)

Local CLI and static browser app; diagram text stays on the user’s machine. No multi-tenant server is part of v1. Untrusted diagram text must not become executable script in the preview. Layout/validate must reject oversized inputs when limits are wired. Treat GitHub issues, pull requests, and CI logs as public-project surfaces.

## Related docs

| Doc | Role |
|---|---|
| [`../STATUS.md`](../STATUS.md) | What works today |
| [`ROADMAP.md`](ROADMAP.md) | Product features (legality, icons, projects) — separate from OSS gate |
| [`../LANGUAGE.md`](../LANGUAGE.md) | Grammar for humans and agents |
| [`../CLI.md`](../CLI.md) | CLI verification |
| [`../archive/ASSESSMENT-HANDOFF.md`](../archive/ASSESSMENT-HANDOFF.md) | Historical architecture brief |
| [`GITHUB-RELEASE-PLAN.md`](GITHUB-RELEASE-PLAN.md) | IntentGraphs public-repository v1 deployment handoff |

## Release disclosure artifacts

The repository includes [`THIRD-PARTY-NOTICES.md`](../../THIRD-PARTY-NOTICES.md), generated from the npm lockfile and installed workspace tree. It records exact versions, package metadata, source information where available, candidate license text, and explicit review markers when upstream license text is unavailable. The nested-workspace fallback issue identified in the 2026-08-19 assessment is resolved. Regenerate and verify it with `node scripts/generate-third-party-notices.mjs` and `npm run check:third-party-notices` after dependency or lockfile changes; CI enforces deterministic output.

[`../AI-DATA-HANDLING.md`](../AI-DATA-HANDLING.md) documents the optional OpenAI-compatible and Ollama request paths, browser credential/configuration storage, IndexedDB project persistence, and the absence of default telemetry.

The `bpmn-js` dependency is distributed under the bpmn.io license and its source code includes a required, fully visible bpmn.io project watermark. Diagram mode must retain that attribution unobscured; the inventory records the dependency and license text, but repository-wide settings/history review and final watermark verification remain separate release-gate work.

The generated inventory intentionally marks packages for manual review when
lockfile/package metadata declares a license but the installed package does not
contain a license file, primarily for optional platform-specific binaries. The
marker is not an independent license determination. Before distributing a
platform-specific binary, verify the upstream package's published license and
notice files for the exact version. Detection is automated; legal clearance is
not.

## How to execute

1. Confirm the public repository and product-identity decisions in the table above.
2. Follow tasks in the [implementation plan](../superpowers/plans/2026-08-11-open-source-readiness.md) phase by phase.
3. Mark phase status here when exit criteria pass.
4. Create `IntentGraphs/diagram-as-code` as a **public** GitHub repository from the clean snapshot, then push `main` and tag `v1.0.0`.
5. Enable Pages, branch protection, issue policy, and security controls that are available under the organization’s plan.
