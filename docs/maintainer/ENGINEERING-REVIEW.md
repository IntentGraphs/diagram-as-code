# Current engineering and release review

_Review date: 2026-08-20. Current release-candidate review._

## Verified candidate state

The current local candidate includes five diagram families (BPMN, mind map, flowchart, architecture, and bounded Gantt), editable PPTX projection, Diagram Editor zoom controls, one-shot Diagram-mode → Text import, and the 18a–18k local stability work.

The latest full verification was rerun against the current release-candidate
worktree on 2026-08-19. The CLI package was independently rerun on 2026-08-20
while recording the simplification assessment below:

| Check | Result |
|---|---:|
| Workspace build | PASS |
| Coverage suite | 643/643 tests across 88 files |
| Source coverage | 65.63% statements, 66.38% lines, 68.44% functions, 60.12% branches; Vitest 4 thresholds 60% / 60% / 65% / 55% |
| CLI suite | 73 passed (2026-08-20 rerun) |
| Gantt package suite | 11 passed |
| PPTX package suite | 6 passed |
| Browser E2E | 55/55 passed |
| Production dependency audit | PASS: 0 vulnerabilities after clean install; bounded internal `image-size-safe` compatibility package |
| Style/whitespace check | PASS |

These results describe the current local candidate worktree. A later release tag
must point to the exact committed snapshot or to a new snapshot that repeats the
same verification and updates [`HANDOFF.md`](HANDOFF.md).

## Resolved findings from the previous assessment

- Async render ordering is protected by revision-gated committed snapshots.
- Structured exports consume the committed validated execution snapshot.
- IndexedDB save failures are visible and retryable.
- Browser and Node AI requests have bounded timeout, cancellation, and response-size behavior.
- Parser, layout, render, family, and controller boundaries have stronger typing and stricter compiler checks.
- Adversarial parser/XML tests, thresholded coverage, least-privilege CI, dependency review, and CodeQL workflow coverage are present.

## Remaining release risks

The remaining work is release-hardening rather than the core v1 feature set:

- 18g: domain-specific staging examples are excluded from v1; notices, clean-install checks, workflow validation, and runtime metadata are implemented and verified. The final commit/tag handoff remains.
- 18h: atomic/migrated persistence, XML/resource budgets, seeded mutation tests, and persistence failure-injection tests are implemented. User-facing reset/export recovery and generated-canvas bounds remain optional follow-up safeguards.
- 18i: download-failure injection is covered; the browser/viewport contract is documented, and accessible project naming is covered by the dialog flow and focused E2E tests.
- 18j: root/web toolchain isolation and clean-install CI commands are implemented and documented.
- 18k: the vulnerable transitive `image-size` path is replaced by the bounded internal compatibility package; clean-install strict npm audit is green and no exception is required.
- Item 12 remains an open investigation into reproducing the historical bpmn-js corruption organically; the export integrity gate is already shipped.
- Residual layout-crossing quality debt remains documented and non-blocking.

## CLI simplification assessment

The CLI is working, and the 2026-08-22 increment now gives it a documented human/JSON
stream contract, safe aliases, stdin/stdout pipelines, atomic writes, command-specific
help, and an explicit non-destructive `fix` workflow. The remaining concern is making it
as simple to extend as its feature set suggests; this is maintainability debt rather than
a known functional regression.

### Findings

- The parser now uses typed command metadata, rejects irrelevant options, and derives
  family/export choices from runtime capabilities. A fully discriminated command-args
  union would further reduce the remaining universal-shape debt.
- Command handlers own both domain orchestration and terminal presentation. Validation,
  rendering, export, review, import, generation, and freezing each repeat variations of
  diagnostic formatting, JSON serialization, and output-file handling.
- The core stream contract is now consistent: human summaries are the default, `--json`
  emits machine results on stdout, artifact stdout remains available for render/export/
  conversion, and non-JSON failures use stderr. File-read and command-specific option
  failures still need a fully centralized structured error path.
- `review` has separate valid/repair/image-output branches, `export` has a special PPTX
  branch, and `freeze`/`import-diagram` perform their own source-to-output pipelines.
  These are reasonable features, but the duplication will make future family and export
  additions harder to reason about.
- `npm run bpm` now builds the CLI dependency closure from a clean workspace install.
  A separately published, bundled npm consumer package remains a release/distribution
  decision rather than part of the workspace CLI contract.

### Recommended treatment

Track the remaining work as roadmap item [18n](ROADMAP.md#18n-cli-contract-ergonomics-and-packaging-hardening--incremental-not-closed).
The public command/stream/error contract, real-binary tests, stdin/stdout pipelines,
atomic writes, safe aliases, runtime capability registry, SARIF checks, and clean CLI
build path are now protected. Next introduce a fully discriminated command-args union
and thin domain-service adapters.

This should not block the current core feature claim, but it should be completed before
the CLI is presented as a stable automation interface for external agents, CI systems,
or public package consumers.

## Scope and ownership

Public product truth belongs in [`../STATUS.md`](../STATUS.md), [`../LANGUAGE.md`](../LANGUAGE.md), [`../CLI.md`](../CLI.md), and the root README/examples. Release decisions, organization settings, and handoff state belong in this `maintainer/` directory. Historical plans and superseded assessments remain under `archive/` and `superpowers/`; internal review records are excluded from the clean public snapshot.
