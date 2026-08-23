# Open-Source Readiness — Design

_Date: 2026-08-11. Product context: `v1.0.0`. Companion living summary: [`docs/maintainer/OPEN-SOURCE-READINESS.md`](../../maintainer/OPEN-SOURCE-READINESS.md). Implementation plan: [`docs/superpowers/plans/2026-08-11-open-source-readiness.md`](../plans/2026-08-11-open-source-readiness.md)._

## 1. Problem

The workspace is a capable text-first BPMN 2.0 tool (parser → layout → SVG/XML, web editor, CLI validate loop). Internal docs and package boundaries are strong. It is **not** ready to publish as open source: no license, no security policy, no CI, incomplete ignore rules, process artifacts mixed with product files, and a few hardening gaps (SVG mount, ID alphabet) that matter once strangers can clone or host a demo.

## 2. Goal

Produce a phased readiness program that, when executed, leaves the repository:

1. Legally usable and contributable (license and community files in place even while private).
2. Safe enough for local CLI + static web use, with a documented threat model.
3. Maintainable by someone who did not write it (CI, changelog, contributing path).
4. Honest in positioning copy (what it is / is not).
5. Hosted on GitHub as a **private** remote after Phases 0–5, without making the project world-visible yet.
6. Optionally extendable later (Phase 6) to: flip visibility to **public**, hosted demo, and/or npm packages.

**Out of scope for this program:** Diagram↔text round-tripping, Camunda extension attributes, BPMN legality validation as a product feature (tracked in `ROADMAP.md`; only security-relevant ID/escape work is in scope here), renaming the entire product unless a collision forces it, making the GitHub repository public before Phase 6.

## 3. Decisions (gate before Phase 1)

| Decision | Default if unset | Who locks it |
|---|---|---|
| SPDX license | **MIT** | Maintainer before first remote push |
| Repo name | Keep `bpm` unless GitHub/npm collision | Maintainer |
| GitHub visibility | **Private** through Phases 0–5 | **Locked** — do not create a public repo |
| Make repo public | Deferred to Phase 6 go/no-go | Maintainer in Phase 6 |
| npm scope (if later publish) | Reserve later; do **not** publish in Phases 0–5 | Maintainer in Phase 6 |
| Hosted demo | Deferred to Phase 6 | Maintainer |
| Diagram mode in v1 story | Document as **separate, unsynced** authoring path | Locked by this design |

## 4. Target public shape

```text
<repo>/
├── README.md                 # User path: install → example → CLI → web
├── LICENSE
├── SECURITY.md
├── CONTRIBUTING.md
├── CODE_OF_CONDUCT.md        # Contributor Covenant or short equivalent
├── CHANGELOG.md
├── package.json              # private root workspaces
├── .gitignore                # covers OS, Vite cache, agent dirs, artifacts
├── .github/
│   ├── workflows/ci.yml
│   ├── ISSUE_TEMPLATE/
│   └── dependabot.yml        # or Renovate
├── apps/web/
├── packages/
├── examples/                 # auto + manual samples
└── docs/
    ├── OPEN-SOURCE-READINESS.md
    ├── STATUS.md / ROADMAP.md / LANGUAGE.md / CLI.md
    ├── ASSESSMENT-HANDOFF.md
    ├── guide/                # optional later; not required for Phase 5
    └── superpowers/          # design history — linked, not primary nav
```

**Never in the default public tree as tracked product:** `.superpowers/`, `.worktrees/`, `.claude/`, `apps/web/.vite/`, root `out.svg`, `.DS_Store`.

## 5. Phases

| Phase | Name | Exit criteria |
|---|---|---|
| **0** | Decisions | License + identity + **private** GitHub visibility recorded in OPEN-SOURCE-READINESS |
| **1** | Legal & community | LICENSE, SECURITY, CONTRIBUTING, CODE_OF_CONDUCT, CHANGELOG present |
| **2** | Workspace hygiene | `.gitignore` complete; junk untracked; docs nav points users correctly |
| **3** | Security hardening | ID alphabet restricted; IDs escaped in export/SVG; safer SVG mount; threat model in SECURITY.md |
| **4** | CI & supply chain | GitHub Actions green on PR (private repo); Dependabot; `npm audit --omit=dev` clean in CI |
| **5** | Docs & positioning | README user path; STATUS/ROADMAP linked; honest “is / is not”; examples linked |
| **6** | Optional productize | Make repo **public**, hosted static demo, and/or npm publish — separate go/no-go |

Phases 0–5 are the **minimum before creating/pushing a private GitHub remote**. Phase 6 is optional and is the only phase that may flip visibility to public.

## 6. Security design (Phase 3)

**Threat model (document in SECURITY.md):**

- Primary: local developer runs CLI and Vite web app; diagram text and files stay on the machine.
- Non-goal for Phases 0–5: multi-tenant hosted API.
- If a static demo is hosted later (Phase 6): untrusted diagram text must not execute script; layout must be size-capped.

**Hardening requirements:**

1. **Identifier grammar** — Restrict node/edge/pool-facing ids to `[A-Za-z_][A-Za-z0-9_.-]*` at parse time. Reject others with a clear parse error.
2. **Escape IDs** — Apply the same XML escape used for labels to every id/ref written into SVG or BPMN XML attributes.
3. **SVG mount** — Stop assigning raw SVG via `innerHTML` as the sole path. Prefer parsing into an SVG document and replacing children, or mounting via a sandboxed iframe / blob URL. Keep labels escaped as today.
4. **Resource limits (library hooks)** — Define documented soft limits (e.g. max source chars, max nodes/edges) enforced in `@bpm/validate` and CLI with structured errors; web editor may reuse them. Exact numbers live in the implementation plan.
5. **Dev server** — Document that Vite must not be exposed on public networks; upgrade Vite/esbuild when practical (Phase 4 dependency bump).

## 7. Documentation design (Phase 5)

**README** answers: what it is, one code sample, install/build/test, CLI one-liner, web `npm run dev`, links to LANGUAGE / STATUS / CLI / OPEN-SOURCE-READINESS, license.

**Do not** lead with `docs/superpowers/`. Keep STATUS as capability truth; ROADMAP as future work; ASSESSMENT-HANDOFF for deep reviewers.

**Public positioning (must stay true):**

- Is: text-first BPMN 2.0, auto swimlane/flat layout, SVG + BPMN XML export, agent-oriented validate.
- Is not: execution engine, Camunda deployment pack, Mermaid for all diagrams, synced text↔Diagram mode.

## 8. Maintenance design (Phase 4–5)

- CI: `npm ci` → workspace build → `npm test`; optional Playwright job (may be `workflow_dispatch` or main-only if flaky/costly).
- CHANGELOG: Keep a Change entries for `v0.1.0`–`v1.0.0` at summary level, then Keep a Changelog going forward.
- CONTRIBUTING: how to run tests, package map pointer to ASSESSMENT-HANDOFF §4, expectation that large features use spec → plan → build.
- Dependabot for npm weekly; ignore noisy majors until Phase 6 if needed.

## 9. Success metrics

- A stranger can clone, `npm install`, `npm test`, run `npm run bpm -- validate` on an example, and open the web app without private docs.
- `LICENSE` present; `SECURITY.md` has a contact path.
- CI badge (or Actions green) on default branch.
- No tracked OS/agent/cache junk.
- XSS/ID hardening tests green.
- README does not claim Diagram↔text sync or Camunda runtime support.

## 10. Non-goals (explicit)

- Rewriting the layout package graph.
- Publishing to npm before Phase 6 go/no-go.
- Making the GitHub repository **public** before Phase 6 go/no-go.
- Moving all superpowers history out of the repo (archive in place is fine).
- Implementing full BPMN legality (ROADMAP item 1) as part of readiness — only id/escape/limits.
