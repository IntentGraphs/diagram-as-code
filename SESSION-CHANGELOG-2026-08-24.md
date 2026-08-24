# Session changelog — 2026-08-24

This is a release-preparation note for the web-editor and rendering work completed in this session. It is intentionally separate from `CHANGELOG.md`; fold the relevant entries into the next versioned release section after review.

## Complete manual scene snapshots and Diagram-mode replay

- Added **Freeze as Manual** next to Edit as Diagram in the web editor.
- Freeze now serializes the full renderer-facing scene currently representable by the DSL:
  - pool and lane canvas frames (`at (x, y) size (w, h)`);
  - node positions and measured sizes, including nested subprocess content;
  - edge flow semantics, labels, styles, corners, label placement, ports, port offsets, and route waypoints;
  - fractional coordinates preserved to three decimal places instead of being rounded to whole pixels.
- Updated the manual layout engine to consume captured pool/lane frames on replay rather than recomputing their stack geometry.
- Extended BPMN XML → DSL conversion used by Diagram-mode **Import to Text** to retain pool/lane DI frames and non-central edge docking offsets from bpmn-js.
- Added round-trip tests proving imported/frozen pool frames, node boxes, and edge point arrays replay identically through the manual layout engine.
- Verified the local browser Freeze as Manual flow and the focused import/freeze/parser/layout suites.

The snapshot is geometry-equivalent for the supported DSL scene. It does not promise byte-identical SVG output for font rasterization, renderer-specific label paint, or BPMN semantics that the DSL intentionally does not represent.

## Rendering and persistence

- Corrected BPMN gateway edge docking so fresh automatic layouts use the gateway's cardinal diamond vertices for entry and exit; route-level fan-out separation no longer moves ports onto sloped edges.
- Bumped the web renderer cache generation after the routing change so stale previews are not restored across the updated geometry rules.
- Added a bounded persistent render cache for the web editor.
  - Cache identity includes project, diagram, source fingerprint, engine override, and renderer version.
  - Successful render snapshots persist in the `renders` IndexedDB store and fall back to memory when IndexedDB is unavailable.
  - Switching diagrams, reloading a project, or repeating a render can restore a matching snapshot without rebuilding the same DSL.
  - Deleting a diagram removes its cached render snapshots.
- Preserved the existing `render: manual` and complexity policy.
  - Manual mode always waits for the explicit Render action.
  - Small incremental edits to soft-heavy diagrams can auto-render when the source delta and recent render cost remain within the safe thresholds.
  - Larger heavy edits remain explicit, while hard-blocked diagrams stop automatic rendering immediately and preserve the last valid preview.
- Reused the render worker after successful renders and terminated it on cancellation or failure.

## Web-editor UI

- Renamed the main header identity to **Diagram as Code**, removed the old leading square icon, and increased the headline size.
- Moved the Text/Diagram mode toggle below the headline and retained clear active-mode highlighting.
- Grouped Open, Save, Fullscreen, and Edit as Diagram on the lower header control row, with Edit as Diagram immediately after Fullscreen.
- Converted Open, Save, Fullscreen, and Export to icon-first controls with accessible labels and titles.
- Added fixed Clear and Render controls below the scrollable DSL pane.
- Moved engine, family, and render state out of the header into a muted diagram-information log below Clear/Render.
- Added visible top grips and pointer/keyboard resizing for the bottom Review, Generate, and Settings panels.
- Updated the local workspace-tour screenshot to reflect the reviewed header and editor layout.
- Kept the Text/Diagram toggle visible in Diagram mode and after Import to Text, fixing the protected-`main` CI regression where mode-switch tests could not click the hidden Text button.

## Verification completed

- Production workspace build passed.
- Style check and `git diff --check` passed.
- Full unit suite passed earlier in the session: 112 files / 931 tests.
- Focused live-render browser suite passed: 21 tests.
- Workspace-tour screenshot smoke test passed.
- Focused panel-layout checks passed for project-panel behavior and Settings persistence/resizing. One unrelated diagram-mode close-flow test timed out while waiting for `#diagram-new`; no assertion failure was caused by the new bottom-panel resize code.

## Text-mode rendered-element source selection

- Added `DiagramSourceMap` / `SourceLocation` to the shared AST and runtime parse result. BPMN parser declarations now map semantic node, edge, pool, and lane IDs to their one-based DSL declaration lines and ranges.
- Added stable label metadata (`data-node-label-id`, `data-edge-label-id`, and `data-lane-label-id`) alongside existing shape/container IDs, so final-pass SVG labels remain selectable without changing the established shape selectors.
- Added Text-mode preview event delegation: clicking a rendered node, edge, pool, lane, or matching label highlights the SVG element and selects/scrolls to its source declaration in the textarea. Selection survives a successful rerender when the semantic ID still exists.
- Kept the reusable source mapping independent of browser APIs. Future CLI/IDE/workspace clients can consume runtime locations as document ranges; only SVG event handling, CSS highlighting, and textarea scrolling live in `apps/web`.
- Added parser/render tests and a focused Playwright regression for node/edge selection and source-line navigation.
- Added floating preview tooltips (`kind · id · DSL line`) and a visible line marker behind the textarea selection. Source navigation now restores the target scroll position after focus/layout, and is covered for both normal and full manual DSL.

The current source map is declaration-line granular rather than token-granular. It deliberately selects the whole declaration because editing a node or edge usually changes its label, ID, or attributes together. A future IDE integration can refine the same contract with token spans without changing the semantic-ID model.

## Source-navigation risk containment

- Kept the web source editor in `wrap="off"` mode with explicit non-wrapping CSS. This preserves the current declaration-line source map and makes textarea scrolling/highlighting deterministic; long declarations remain horizontally scrollable.
- Added a 12px transparent SVG edge hit path behind each 1.5px visible edge. The hit path carries no visual style, while delegated preview hover/click behavior can target the full route.
- Cleared preview selection and source markers on typed or programmatic source replacement. Generated edge ids are positional, so retaining a selection across a source edit could otherwise select a different edge after parsing.
- Normalized CRLF/CR input before BPMN parsing so grammar matching and source columns are consistent for CLI/IDE callers as well as browser textareas.
- Bumped the render cache generation to `web-render-v4` and rejected BPMN cache results without all four source-map collections. Valid cached renders still restore normally; only older/incomplete snapshots require one fresh render.

These changes intentionally contain false-navigation and stale-cache risks without introducing a new editor dependency. Wrapped visual editing, token-level source spans, and equivalent source maps for non-BPMN families remain separate follow-up work.

## Complete session merge summary

The session now documents and implements the complete path from visual BPMN editing back to reproducible text:

- **Diagram-mode conversion:** added **Import to Text** and **Freeze as Manual** workflows with explicit preview/confirmation boundaries.
- **Manual scene fidelity:** preserved pool/lane frames, node positions and sizes, edge waypoints, endpoint ports, port offsets, edge styles, corners, labels, and label placement in the supported DSL scene.
- **Routing corrections:** aligned gateway ports with cardinal diamond vertices and retained the renderer/layout information needed to replay automatic output as manual DSL.
- **Text-mode inspection:** added semantic SVG identities, node/edge/pool/lane selection, labels, floating tooltips, source-line selection, scrolling, and visible source markers.
- **Risk containment:** added non-wrapping editor geometry, wider edge hit targets, CRLF normalization, source-edit invalidation, source-map-aware BPMN cache validation, and cache generation `web-render-v4`.
- **Workspace documentation:** updated the public changelog, project status, language/manual-layout notes, CLI/runtime source-map notes, migration guidance, and this session handoff.

The local merge boundary is intentionally separate from GitHub publication. Before committing or pushing, review the complete diff, run the release checks in [`docs/RELEASING.md`](docs/RELEASING.md), confirm the exact release/tag decision, and verify the browser suite in a host environment where Chromium can launch. No GitHub push, tag, or release action was performed during this session.

## Local merge-readiness verification

Latest checks completed in this worktree:

- `npx vitest run packages/render/test/edges.test.ts packages/parser/test/parser.test.ts apps/web/test/renderCache.test.ts` — **51 tests passed**.
- `npm run build` — **passed**, including the web production bundle.
- `npm run check:style` — **passed**.
- `git diff --check` — **passed**.
- `npm run validate:workflows` — **passed** for all three workflow files.
- `npm run check:third-party-notices` — **passed**.
- `npm run test:coverage` — **937 passed / 3 timed out** under the default 5-second per-test limit; the three heavy tests passed in isolation with a 15-second timeout (`50 passed` across the three selected files), confirming performance-budget timeouts rather than functional failures.

The focused Playwright command was attempted, but Chromium could not launch in the current macOS sandbox (`bootstrap_check_in … Permission denied`). This is an environment limitation rather than an application assertion failure; rerun the browser suite outside the restricted sandbox before GitHub publication.

## Release follow-up

- Review this file and fold the accepted entries into the next `CHANGELOG.md` release section.
- Confirm the release version and update the release line in `docs/STATUS.md` at tagging time.
- Run the complete release gates in `docs/RELEASING.md` from the final clean checkout.
- Commit, tag, push, and publish only after review and approval.

## Canvas navigation and manual-DSL view controls

- Added compact in-canvas controls in the Text-mode SVG preview, positioned inside the upper-right canvas boundary:
  - grid visibility toggle, enabled by default;
  - light/dark canvas theme toggle, with light mode as the default;
  - zoom out, zoom in, and percentage selection controls.
- Added horizontal and vertical SVG-coordinate rulers. Ruler tick spacing adapts to the fitted diagram scale and current zoom, and ruler labels remain synchronized with canvas scrolling.
- Made dark canvas mode readable for the renderer's theme-neutral SVG output by remapping black strokes, borders, markers, white fills, edge halos, and external labels at the preview boundary. Exported SVG markup is unchanged.
- Improved Ctrl/Cmd-trackpad zoom by batching wheel deltas per animation frame, reducing layout churn and lowering the per-delta sensitivity. Zoom remains cursor-anchored.
- Preserved the current preview zoom and scroll section across successful DSL rerenders. The next SVG is laid out with the previous viewport state restored; browser bounds still clamp naturally if the edited diagram becomes smaller.
- Increased the fit-relative zoom ceiling from 400% to 1200% for both the text preview and BPMN Diagram mode. Added 500%, 600%, 800%, 1000%, and 1200% percentage choices while retaining the 25% minimum.
- Documented the zoom decision: draw.io's current documentation describes a 1.2× zoom step and a separate fit `maxScale`, but does not publish a hard interactive maximum. A 1200% ceiling was selected as a bounded manual-placement inspection range rather than an unbounded stage size.

## Canvas verification

- Added viewport unit coverage for zoom/scroll restoration after replacing the rendered SVG.
- Added Playwright coverage for the canvas controls, ruler SVGs, dark-mode contrast colors, and the 1200% zoom option.
- `npm run build --workspace @bpm/web` passed.
- Focused viewport unit tests passed: 2 tests.
- Focused canvas Playwright check passed: 1 test.
- `git diff --check` passed.
