# Session changelog — 2026-08-24

This is a release-preparation note for the web-editor and rendering work completed in this session. It is intentionally separate from `CHANGELOG.md`; fold the relevant entries into the next versioned release section after review.

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

## Release follow-up

- Review this file and fold the accepted entries into the next `CHANGELOG.md` release section.
- Confirm the release version and update the release line in `docs/STATUS.md` at tagging time.
- Run the complete release gates in `docs/RELEASING.md` from the final clean checkout.
- Commit, tag, push, and publish only after review and approval.
