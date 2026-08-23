# Public launch blueprint assessment

_Reviewed 2026-08-19 against `BPM Launch Blueprint.pdf` and the current `main` release candidate._

_Public-release update: the first public repository is a clean `IntentGraphs/diagram-as-code` snapshot tagged `v1.0.0`; earlier staging history is not part of that release._

This document turns the launch blueprint into repository decisions. It distinguishes what must be true for a useful public v1 from valuable work that should not delay the first release.

## Product promise for public v1

`bpm` is a local-first, text-first diagramming workspace for BPMN, mind maps, flowcharts, architecture, and bounded Gantt timelines. Its differentiator is the combination of versionable source, BPMN semantics, deterministic validation/layout, agent-callable CLI operations, a visual BPMN editor, and editable presentation output.

The primary audiences are:

- diagram-as-code developers who want a reviewable source artifact;
- AI/LLM tooling builders who need structured validation and bounded generation/review;
- process and business analysts who want BPMN editing without making a GUI file the only source of truth.

The public expectation must remain explicit: this is not a hosted collaboration service, process execution engine, or full BPMN legality/runtime platform. BPMN XML is semantic; PPTX is visual and editable but not round-trippable; AI is optional and BYOK/local-provider based.

## Must close before public visibility

| Priority | Open item | Owner/surface | Current state |
|---|---|---|---|
| P0 | Create public `IntentGraphs/diagram-as-code` from the verified clean snapshot and tag `v1.0.0` | GitHub maintainer | Local snapshot prepared; repository creation, push, and tag publication remain owner-controlled |
| P0 | Configure branch protection, required CI/CodeQL checks, Dependabot, secret scanning/push protection, private vulnerability reporting, and issue policy | GitHub settings | Issues/templates, Dependabot, and CodeQL workflow are active; branch/security controls are blocked for this private repository on the current Free plan |
| P0 | Verify GitHub Pages deployment and the README playground URL after repository creation | GitHub settings + Pages workflow | Workflow and `/diagram-as-code/` base path are prepared; enable Pages from GitHub Actions after the public repository exists |
| P1 | Capture a 10–15 second hello-diagram GIF or screenshot and place it near the README promise | Public docs/assets | Complete locally: [`hello-diagram.png`](../assets/hello-diagram.png) is linked below the README promise |
| P1 | Confirm copyright wording/ownership for the organization repository | Maintainer/legal decision | Confirmed: use `Copyright (c) 2026 IntentGraphs` |
| P1 | Decide the final local branch/WIP cleanup before push | Maintainer Git hygiene | Completed locally: all three histories are under `archive/...` branch names; the clean QA worktree and its untracked artifacts are preserved under `.worktrees/archive-mindmap-browser-qa` |

The repository now contains the other launch-surface requirements: audience/promise, five-minute CLI/browser path, capability comparison, draw.io/bpmn-js migration guide, platform and fidelity expectations, visible trust/limitation links, Dev Container setup, scoped v1 boundaries, and capability-led changelog entries.

## V1 complete locally, but not a GitHub-side gate

- Gantt and editable PPTX are implemented and tested.
- Strict production audit is green after clean install with 0 vulnerabilities.
- Atomic persistence, XML/resource limits, cancellation/timeout, seeded adversarial tests, download-failure testing, layout-quality grading, and CI style/workflow gates are implemented.
- Domain-specific staging examples are excluded from the public candidate.
- Local candidate commit: verify with `git rev-parse HEAD`; release-artifact edits must be committed before tagging.

## Recommended after the first public release

These improve adoption or maturity, but do not justify delaying the source release once the P0/P1 launch items above are closed:

- package publication and a zero-install `npx` path, after package ownership, metadata, semver, consumer smoke tests, and provenance are settled;
- contributor Dev Container refinements, Docker workflows, and broader OS/browser support;
- family-specific layout-quality thresholds, generated-canvas bounds, user-facing persistence reset/export recovery, and broader generative fuzzing;
- SARIF/changed-file checks and a capability-driven consumer install path; human-readable
  CLI output and the intentionally stable JSON contract are now shipped;
- a fuller visual import/export interoperability matrix for draw.io and bpmn-js;
- the historical bpmn-js corruption investigation and any upstream fix;
- version history, hosted collaboration, team administration, workflow execution, enterprise identity, and managed AI.

## Explicitly not v1 requirements

- Mermaid compatibility, parsing, runtime integration, import/export, and migration support are not v1 requirements. The repository may provide only the optional side-by-side syntax comparison in [`MERMAID-SYNTAX-COMPARISON.md`](../MERMAID-SYNTAX-COMPARISON.md). The relevant public migration path is draw.io/bpmn-js → text-first `.bpm`.
- DOCX native-shape export, Microsoft Project/Primavera interoperability, resource leveling, critical-path guarantees, holidays/timezones, and Gantt baselines.
- Full BPMN execution semantics, complete legality enforcement, Camunda deployment/runtime integration, or automatic two-way Diagram Editor/text synchronization.
- Additional diagram families such as ER, sequence, state, class, or timeline until each receives its own scoped grammar/layout/export design.
- npm publication merely because the repository becomes public.
