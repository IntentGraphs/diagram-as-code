# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project uses [Semantic Versioning](https://semver.org/) via git tags.

## [Unreleased]

### Added

- Added `@bpm/mcp`, a dependency-free local MCP stdio server exposing runtime capabilities, validation, rendering, inspection, generation, freezing, and structured export with bounded schemas and explicit non-persistence for write-intent candidates.
- Added `bpm mcp` to launch the MCP server without wrapping protocol traffic, plus compiled-process MCP E2E coverage.
- Added a registered-family adapter contract test covering required parse, layout, render, neutral scene conversion, validation, SVG/PNG, and structured-export metadata.
- Added the family-neutral `DiagramScene` contract, adapter-level validation boundary, source maps, and stable SVG identities to all six built-in diagram families; runtime inspection and CLI/web consumers now use the shared surfaces.
- Added the bounded Level-0 DFD family with external/process/data-store nodes, labeled data flows, deterministic orthogonal layout, SVG/PNG rendering, lossless `dfd-json` export, source navigation, and capability metadata.
- Added [`docs/EXTENDING-DIAGRAM-FAMILIES.md`](docs/EXTENDING-DIAGRAM-FAMILIES.md), documenting the family-neutral architecture boundary, DFD design, vertical-slice requirements, and release acceptance criteria.

### Fixed

- Re-routed ordinary BPMN edges that intersect boundary events added after swimlane banding, including nested subprocess edge collections, preserving the zero edge-through-node invariant in crowded pools.

### Changed

- CI now verifies the documented Node 20 and Node 22 support range instead of exercising only Node 20.
- Updated the public documentation to describe the six shipped diagram families, the bounded DFD scope, and the completed family-neutral scene, source-map, renderer-identity, and adapter-validation foundation.

### Documentation

- Aligned the README, language reference, project status, CLI guide, contributor guide, release procedure, migration guide, documentation index, and public roadmap with the same six-family list, DFD boundary, extension contract, and verification state.

### Verification

- 952/952 unit tests, 101/101 browser tests, all 27 workspace builds, workflow validation, third-party notice validation, style checks, and `git diff --check` pass in the local workspace.

## [1.0.3] - 2026-08-24

### Added

- Added the leading `shapeSize: <group> (w, h)` DSL directive for standardized geometry across shape families: `all`, `event`, `task`, `gateway`, `data`, `annotation`, and `group`.
- Added grouped shape-size examples and round-trip/parser/layout coverage, including full `positioning: manual` mode.
- Added a bounded persistent web-editor render cache keyed by project, diagram, source fingerprint, engine override, and renderer version, with IndexedDB persistence and memory fallback.
- Added focused web-editor controls for fixed Clear/Render actions, a diagram-information log, accessible icon controls, and draggable Review/Generate/Settings panels.
- Added **Freeze as Manual** beside Edit as Diagram, converting the complete available rendered BPMN scene into replayable manual DSL.
- Added manual DSL support for frozen pool/lane frames and non-central edge port offsets (`fromOffset` / `toOffset`).
- Added shared parser/runtime source locations for semantic nodes, edges, pools, and lanes, plus Text-mode SVG selection that highlights the rendered element and selects its DSL declaration.
- Added in-canvas Text-mode controls for grid visibility, light/dark canvas themes, adaptive coordinate rulers, zoom buttons, and percentage-based zoom selection.
- Added a Text-mode fit-to-canvas control that restores the complete rendered diagram to the preview pane.

### Changed

- Contained Text-mode source-navigation risks by keeping the source textarea non-wrapping for deterministic line geometry, normalizing CRLF parser input, clearing preview selections whenever source text changes, and correcting scroll centering for editor padding.
- Added a transparent 12px SVG edge hit path so thin visible edges remain visually unchanged while hover/click inspection works across the route instead of only on the exact 1.5px stroke.
- Bumped the web render-cache generation and made BPMN cache validation require a complete source map; older or incomplete BPMN snapshots are ignored once, then valid current renders continue to restore without repeated layout work.
- Preserved the active preview zoom and scroll section across successful DSL rerenders, batched trackpad zoom updates per animation frame, and raised the bounded fit-relative zoom ceiling to 1200% for detailed manual placement.
- Preserved the active Text-mode diagram region and fit-relative zoom when **Edit as Diagram** opens the same scene in bpmn-js, using a scene-coordinate anchor after BPMN XML import.
- Added dark-canvas contrast remapping for renderer-neutral SVG strokes, fills, markers, edge halos, and labels without changing exported SVG output.

- Routed BPMN gateway entries and exits through cardinal diamond vertices, keeping fan-out separation in the orthogonal route instead of placing ports on sloped gateway edges.
- Bumped the web renderer cache generation so previews created before the gateway-routing change are not restored as if they were current.
- Established parent-first size precedence: a matching top-level `shapeSize` now controls the final rendered dimensions in automatic and manual layouts. `shapeSize: task (220, 60)` therefore applies to every task even when a node also declares `size (198, 60)`.
- Preserved node-level `size (w, h)` as source-level intent and diagnostic context. When it conflicts with a parent `shapeSize`, the node request is ignored for geometry and reported as a non-blocking `shape_size_override` warning.
- Surfaced shape-size mismatch warnings through the web editor render pipeline as well as CLI/API validation, so warnings do not turn a valid diagram into a rendering error.
- Allowed blank lines between leading directives after shared web/runtime directives such as `render:` are normalized out of the source, keeping the CLI and web editor consistent for grouped `shapeSize:` declarations.
- Kept `render: manual` explicit while allowing safe small incremental edits to soft-heavy diagrams to auto-render; larger edits remain manual and hard-blocked diagrams stop automatically without replacing the previous preview.
- Reused successful render workers and restored matching cached previews during diagram switching, reload, and repeated renders instead of rebuilding identical DSL.
- Extended Diagram-mode **Import to Text** to preserve BPMN DI pool/lane frames, node geometry, edge waypoints, endpoint sides, and along-side port offsets so visual-editor layouts replay through the manual renderer.
- Added stable SVG label identities so node, edge, and lane labels participate in the same selection behavior as their visual shapes.
- Added hover tooltips showing the selected element identity and DSL line, plus a visible source-line marker and reliable textarea scrolling for both automatic and `positioning: manual` DSL.

### Fixed

- Kept the Text/Diagram mode toggle visible while the BPMN editor is open, including after importing converted text, so users can always return to the DSL editor.

### Documentation

- Updated `docs/LANGUAGE.md`, `docs/STATUS.md`, and manual-control examples to document the parent/child hierarchy, warning behavior, and local web-editor verification flow.
- Updated the language, status, README, and AI data-handling documentation for incremental rendering, local render snapshots, the new editor layout, and resizable bottom panels. Added `SESSION-CHANGELOG-2026-08-24.md` as the detailed session handoff.
- Updated the language, status, migration, and manual-layout documentation for complete rendered-scene freezing and Diagram-mode geometry replay. Expanded `SESSION-CHANGELOG-2026-08-24.md` with the implementation and verification record.
- Documented Text-mode rendered-element selection and the shared source-map boundary for future CLI, IDE, and workspace integrations.
- Replaced the README workspace-tour screenshot with the reviewed 2026-08-24 editor capture and added six reusable SVG process maps for the Workspace Tour, text-to-render, validation, Diagram Editor handoff, export, and AI-agent workflows.

### Reason

- Standardized parent-level geometry makes diagrams deterministic and visually consistent across labels, manual coordinates, SVG output, and the web editor while retaining visibility when individual declarations disagree.
- Avoiding duplicate browser layouts keeps diagram switching and incremental editing responsive while preserving explicit user control for genuinely expensive diagrams.

## [1.0.2] - 2026-08-23

### Fixed

- Preserve editor changes made while IndexedDB project bootstrap is still loading instead of overwriting them with the starter diagram.

## [1.0.1] - 2026-08-23

### Fixed

- Stabilized the external BPMN import browser regression test so project bootstrap cannot race its review-preservation assertions in CI.

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
