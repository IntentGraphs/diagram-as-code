# Full manual-mode examples

Complex BPMN text diagrams that use `positioning: manual` and explicit `at (x, y)` on every placeable node. Boundary events omit coordinates (the engine attaches them to the host).

Validate:

```bash
npm run bpm -- validate examples/manual-mode/01-flat-incident-management.bpm
```

| File | Style | What it exercises |
|------|--------|-------------------|
| `01-flat-incident-management.bpm` | Flat | Gateways, boundary timer, data object, annotation |
| `02-flat-checkout-with-subprocess.bpm` | Flat | Expanded subprocess, nested boundary, call activity, data store |
| `03-swimlane-order-to-cash.bpm` | One pool / 3 lanes | Cross-lane sequence, parallel split/join, boundary on lane task |
| `04-swimlane-two-pool-procurement.bpm` | Two pools | Message flows between pools, AP lane, parallel fulfillment |
| `05-swimlane-loan-origination.bpm` | One pool / 3 lanes | Error boundary, review loop, message back to applicant |

Coordinates are lane-local (and subprocess-local for nested bodies). Pools stack vertically in the manual engine.
