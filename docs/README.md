# Documentation map

This directory contains the stable product and contributor documentation for IntentGraphs Diagram-as-Code.

The repository-level [`ROADMAP.md`](../ROADMAP.md) is the single public roadmap. It describes direction and
boundaries without duplicating execution plans in individual documents.

## Public v1 documentation

The stable product surface remains at the `docs/` root:

- [`STATUS.md`](STATUS.md) — current capabilities, limitations, and verification
- [`LANGUAGE.md`](LANGUAGE.md) — diagram language reference
- [`CLI.md`](CLI.md) — CLI usage and checks
- [`AI_REVIEW.md`](AI_REVIEW.md) and [`AI-DATA-HANDLING.md`](AI-DATA-HANDLING.md) — optional AI behavior and data handling
- [`MANUAL_AI_AGENT.md`](MANUAL_AI_AGENT.md) and [`MANUAL_LAYOUT_AI.md`](MANUAL_LAYOUT_AI.md) — browser agent and geometry-aware AI workflows
- [`BROWSER-SUPPORT.md`](BROWSER-SUPPORT.md) — v1 browser and viewport contract
- [`RELEASING.md`](RELEASING.md) — exact verification and GitHub publication sequence
- [`COMING-FROM-DRAWIO-BPMNJS.md`](COMING-FROM-DRAWIO-BPMNJS.md) — draw.io/bpmn-js-to-`bpm` migration path
- [`architecture.drawio`](architecture.drawio) — editable architecture artifact

The repository-level [`CITATION.cff`](../CITATION.cff) provides a stable citation
entry for research, teaching, and published examples.

## Scope

Internal handoffs, dated design plans, abandoned experiments, and staging assessments are
kept out of the public tree. The repository's Git history is not the product documentation
surface; stable behavior belongs in the docs above and in executable tests.
