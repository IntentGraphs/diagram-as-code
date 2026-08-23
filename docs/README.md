# Documentation map

This directory separates stable product documentation from release-internal and historical material.

## Public v1 documentation

The stable product surface remains at the `docs/` root:

- [`STATUS.md`](STATUS.md) — current capabilities, limitations, and verification
- [`LANGUAGE.md`](LANGUAGE.md) — diagram language reference
- [`CLI.md`](CLI.md) — CLI usage and checks
- [`AI_REVIEW.md`](AI_REVIEW.md) and [`AI-DATA-HANDLING.md`](AI-DATA-HANDLING.md) — optional AI behavior and data handling
- [`BPMN-GAP-SURVEY.md`](BPMN-GAP-SURVEY.md) — BPMN expressiveness limitations
- [`BROWSER-SUPPORT.md`](BROWSER-SUPPORT.md) — v1 browser and viewport contract
- [`RELEASING.md`](RELEASING.md) — exact verification and GitHub publication sequence
- [`COMING-FROM-DRAWIO-BPMNJS.md`](COMING-FROM-DRAWIO-BPMNJS.md) — draw.io/bpmn-js-to-`bpm` migration path
- [`MERMAID-SYNTAX-COMPARISON.md`](MERMAID-SYNTAX-COMPARISON.md) — optional side-by-side Mermaid syntax comparison; not a compatibility promise
- [`architecture.drawio`](architecture.drawio) — editable architecture artifact

The repository-level [`CITATION.cff`](../CITATION.cff) provides a stable citation
entry for research, teaching, and published examples.

## Maintainer-only release material

[`maintainer/`](maintainer/) contains release planning, engineering reviews, session handoffs, repository readiness, and QA records. These documents are intentionally separated from the public product navigation and must be refreshed before each release.

The current launch assessment is [`maintainer/LAUNCH-BLUEPRINT-ASSESSMENT.md`](maintainer/LAUNCH-BLUEPRINT-ASSESSMENT.md); it separates public-v1 gates from post-release maturity work.
The active bug triage log is [`maintainer/KNOWN-ISSUES-2026-08-19.md`](maintainer/KNOWN-ISSUES-2026-08-19.md); it separates confirmed defects from unconfirmed reports and retracted hypotheses.
The maintainer directory also contains dated engineering records that support
future development but are not part of the stable product promise.

## Historical material

[`archive/`](archive/) contains superseded assessment material. [`superpowers/`](superpowers/) retains dated design plans, specifications, and archived implementation history; those paths are preserved because they are cross-linked historical records.

Sensitive or domain-specific staging examples are intentionally excluded from
the v1 public candidate and are not part of the release snapshot.
