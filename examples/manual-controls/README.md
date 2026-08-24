# Manual text controls

Examples for text controls: `via`, `size`, grouped `shapeSize`, node/edge label placement, and `layoutSpacing`.

| # | File | What it shows |
|---|------|---------------|
| 01 | `01-via-and-labels.bpm` | Manual positioning with `via` waypoints and label options |
| 02 | `02-spacing-presets.bpm` | `layoutSpacing: compact` directive with auto-layout |
| 03 | `03-size-hints.bpm` | `size (w,h)` on events, tasks, and gateways (manual positioning) |
| 04 | `04-edge-label-placement.bpm` | `labelAt` and `labelSide` on edge labels (auto-layout) |
| 05 | `05-shape-size-groups.bpm` | Leading fixed sizes grouped by shape family, with one conflicting task size warning |

```bash
npm run bpm -- validate examples/manual-controls/01-via-and-labels.bpm
npm run bpm -- render examples/manual-controls/01-via-and-labels.bpm -o /tmp/01-via-and-labels.svg

npm run bpm -- validate examples/manual-controls/02-spacing-presets.bpm
npm run bpm -- render examples/manual-controls/02-spacing-presets.bpm -o /tmp/02-spacing-presets.svg

npm run bpm -- validate examples/manual-controls/03-size-hints.bpm
npm run bpm -- render examples/manual-controls/03-size-hints.bpm -o /tmp/03-size-hints.svg

npm run bpm -- validate examples/manual-controls/04-edge-label-placement.bpm
npm run bpm -- render examples/manual-controls/04-edge-label-placement.bpm -o /tmp/04-edge-label-placement.svg

npm run bpm -- validate examples/manual-controls/05-shape-size-groups.bpm
npm run bpm -- render examples/manual-controls/05-shape-size-groups.bpm -o /tmp/05-shape-size-groups.svg
```
