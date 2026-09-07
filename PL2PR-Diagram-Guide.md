# PL2PR diagram pack

This pack consolidates the following source documents:

- `/Users/pravinsail/Downloads/pljghvpr/resource/_wiki_compiled/PL2PR-01-End-to-End-Process.md`
- `/Users/pravinsail/Downloads/pljghvpr/resource/_wiki_compiled/PL2PR-02-Planning-and-MRP.md`
- `/Users/pravinsail/Downloads/pljghvpr/resource/_wiki_compiled/PL2PR-03-Workshop-Execution-and-Requirements.md`

The repository-native `.bpm` files under `examples/pl2pr/` are the semantic source of truth. Validate and render them with the workspace CLI described in `docs/CLI.md`. The generated SVG previews are under `artifacts/pl2pr/`.

The earlier `pl2pr_diagram_pack.drawio` file was generated directly as a presentation artifact and is retained for comparison only; it is not the source of truth for this version.

The native source contains seven views:

| File | Diagram type | Purpose |
|---|---|---|
| `01-bpmn-end-to-end.bpm` | BPMN | End-to-end demand → planning → process order → execution → release/delivery |
| `02-bpmn-planning-and-mrp.bpm` | BPMN | MTO/MTS/ATO strategy, planning horizons, MRP/pMRP, APS and order conversion |
| `03-bpmn-execution-and-kitting.bpm` | BPMN | FEFO/SLED/ATP kitting, staging, MES execution, GR/GI, QC and batch release |
| `04-architecture-logical.bpm` | Architecture | Logical system architecture and ownership by layer |
| `05-architecture-integration.bpm` | Architecture | S/4 ↔ PAS-X integration boundary with interface IDs 478–495 |
| `06-architecture-traceability.bpm` | Architecture / lineage | 4711 order-network and A/B plasmid batch genealogy |
| `07-supporting-operating-model.bpm` | Architecture | Planning hierarchy, resource hierarchy and resource network |

## Modeling conventions

- Blue = S/4 / planning / ERP responsibilities.
- Green = MES, EWM and execution responsibilities.
- Orange = manufacturing flow, data objects and open-point callouts.
- Yellow = QC, quality decisions and pMRP simulation.
- Dashed arrows = message/interface/data exchange.
- Orange note shapes = source-documented open points or items requiring validation.

## Important source-derived assumptions

- Patient ID and confirmation date are treated as the primary identity/date context and are carried from the sales order into the order network and APS/MES handoff.
- The 4711 chain is modeled as a two-leg A/B flow that converges at the final VuLuP pack freezer, while retaining the source’s simpler 4711-1 … 4711-11 naming.
- FEFO is modeled as the first-expiring batch per component; the minimum component SLED is inherited by the header kit.
- The kitting rule is modeled with no component batch split, unrestricted/QC-compliant batches, and a minimum 75% remaining lifespan rule.
- Interface IDs are preserved from the workshop material; the exact transport technology and runtime frequency are not specified in the sources.

## Validation points kept visible in the diagrams

- External APS / finite scheduling product and integration pattern.
- MTO/MTS class, requirements types, item category groups and strategy finalization.
- Upstream integration ownership and CMO solution.
- Whether staging applies to plasmid only or all materials; EWM versus MM-IM ownership.
- Batch numbering, process-order naming and number-range conventions.
- Exact mapping of the A/B order network to the 4711-1 … 4711-11 sequence.
- Interface frequency, exception handling and operational monitoring.

Validation status: all seven native DSL files returned `valid=true` with no syntax or semantic errors. The CLI emitted non-blocking route-fallback notices on some dense cross-lane views and architecture warnings where the source material did not specify a separate technology field.

SVG previews were generated with the workspace CLI. The architecture family can additionally export C4 JSON, Structurizr DSL, and draw.io XML from the native source.
