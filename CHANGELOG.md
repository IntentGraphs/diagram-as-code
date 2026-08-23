# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project uses [Semantic Versioning](https://semver.org/) via git tags.

## [1.0.0] - 2026-08-23

First public release of the clean `IntentGraphs/diagram-as-code` repository.
Packages remain internal `0.0.1` workspace metadata because npm publication is
not part of this release.

### Added

- Bounded Gantt/project timelines with deterministic weekday date arithmetic, milestones, groups, dependencies, SVG/PNG, JSON/CSV, and editable PPTX projection.
- Editable PowerPoint export for all supported diagram families through native shapes, text, and connectors; BPMN XML remains the canonical semantic export.
- Diagram-mode zoom controls, cursor-centered mouse-wheel zoom, fit-to-canvas, live zoom percentage, and the renamed Diagram Editor identity.
- Mind map, flowchart, and architecture diagram families with family-specific rendering and exports.
- One-shot, reviewable Diagram-mode **Import to Text** conversion and CLI parity.
- Camunda 7 export attributes, AI-assisted generation/repair, project persistence, and render/persistence/provider stability safeguards.
- Public-release dependency notices, bpmn.io attribution documentation, and AI data-handling disclosure.
- Atomic project persistence, bounded/cancellable BPMN XML import, seeded adversarial-input tests, machine-readable layout-quality grading, truthful download-failure handling, and a CI style gate.
- The production `image-size` audit path is resolved with a bounded internal compatibility package; clean-install production audit is green.

### Fixed

- CLI ergonomics now include human-readable defaults, stable `--json` stdout, `check`/`import` aliases, `--output`/`--layout`/export `--format` spellings, stdin via `-`, atomic writes, command-specific help/version output, multi-word generation descriptions, and an explicit non-destructive `bpm fix` workflow.
- CLI capability discovery now comes from the runtime family registry; `bpm capabilities` exposes it, while `bpm check --changed --format sarif` supports changed-file CI checks. `npm run bpm` now builds the CLI dependency closure from a clean workspace install.
- Wide Gantt PowerPoint exports now paginate into readable editable slides with a dedicated label column instead of rejecting the whole timeline because one-slide projection would make text unusably small.
- BPMN Diagram-mode/CLI imports now preserve conditional sequence-flow `conditionExpression` bodies through the DSL's `=>` edge labels and back into BPMN XML, including explicitly empty expressions. The current DSL still has one edge-label field, so a BPMN flow name and condition expression cannot both be preserved independently.
- BPMN event payloads now round-trip timer values, selected event references, and conditional expressions through text and XML; Import to Text shows preserved/transformed/dropped conversion accounting, and project bundles retain BPMN XML snapshots when available.
- Web AI keys are session-only by default, with an explicit private-device opt-in for local persistence and aligned data-handling documentation.

## [0.2.0] - 2026-08-09

### Added

- Pre-1.0 milestone: core pipeline and notation expansion toward v1 (see git history / `docs/STATUS.md`).

## [0.1.0] - 2026-08-09

### Added

- Initial tagged milestone of the text → layout → SVG pipeline.
