# Manual Text Controls — Design

_Date: 2026-08-11. Phase A of the manual-controls / AI-review program. Companion plan: [`../plans/2026-08-11-manual-text-controls.md`](../plans/2026-08-11-manual-text-controls.md). Product truth: [`../../STATUS.md`](../../STATUS.md)._

## 1. Problem

Authors (humans and scripts) can place nodes with `at (x, y)` and pin edge anchors with `from`/`to`, but cannot control **route bends**, **node box size**, **label placement/wrapping**, or **global spacing** from `.bpm` text. Visual polish still depends on hoping auto-layout looks good or hand-editing SVG. That blocks precise diagrams without any AI dependency.

## 2. Goal

Extend the text language and pipeline so diagrams can be controlled precisely from `.bpm` alone:

1. Edge waypoints (`via:`)
2. Node size hints (`size (w, h)`)
3. Node label placement / wrap / font / align
4. Edge label placement along the route
5. Layout spacing presets

No AI, no `@bpm/review`, no API keys. Must remain useful to humans and `bpm validate` / `bpm render` by itself.

## 3. Non-goals

- Diagram mode ↔ text sync
- Camunda extension attributes
- Full BPMN legality validation (separate ROADMAP item)
- Replacing the orthogonal router with freeform curves
- Changing default layout appearance when new directives are absent (A5 regression gate)
- BPMN XML DI export of waypoints/label placement in v1 of this phase (SVG + validate first; XML DI tracked as follow-up)

## 4. Locked decisions

| Topic | Decision |
|---|---|
| Build order | A1 via → A2 size → A3 node labels → A4 edge labels → A5 spacing → A6 docs polish |
| `via` availability | Allowed on **any** edge (manual or auto). When present, layout uses explicit midpoints instead of Dijkstra for that edge’s interior |
| Coordinate space | Same as `at (x, y)`: canvas-absolute at top level; lane-relative inside a lane; subprocess-relative inside an expanded activity |
| Orthogonal policy | Waypoint segments **should** be axis-aligned. Non-orthogonal consecutive segments → **warning** in validate (not a parse error); still rendered |
| `via` + `from`/`to` | Exit stub from `from` (or auto) → first via → … → last via → entry stub to `to` (or auto). Via list is the **interior** polyline only |
| Node attrs | Introduce a node **suffix** grammar: optional `size (w, h)` then optional `[key: value, …]` after `as <id>` / `at (…)` (see §5) |
| Size semantics | Outer axis-aligned bbox; engines clamp to per-kind minimums; events stay circular (use max(w,h) as diameter); gateways stay diamond fitting the bbox |
| Label metrics | A3/A4 add approximate label bounding boxes into `analyzeLayout` / validate warnings (not pixel-perfect font metrics) |
| Spacing | Diagram directive `layoutSpacing: compact\|normal\|relaxed\|spacious`; default `normal` = today’s constants; numeric `spacing.*` deferred |
| Package deps | Only parser / ast / layout* / render / validate / cli / docs / examples — never `@bpm/review` |

## 5. Syntax (target)

```
[layout: swimlane|flat]
[positioning: manual]
[layoutSpacing: compact|normal|relaxed|spacious]

task "Review application" as review at (120, 80) size (180, 70) [label: inside, wrap: 3, font: normal, align: center]
gateway exclusive "Approved?" as g1 at (360, 90) size (70, 70) [label: below]

review -> g1 [from: right, to: left, via: (280,115) (320,115)]
g1 -> approve: "yes" [labelAt: 0.3, labelSide: above, labelOffset: (0,-4)]
```

### 5.1 Edge attribute additions

Existing: `style`, `corner`, `from`, `to`.

| Key | Value | Meaning |
|---|---|---|
| `via` | one or more `(x,y)` pairs | Interior waypoints |
| `labelAt` | float in `[0,1]` | Fraction along full routed polyline |
| `labelSide` | `above` \| `below` \| `left` \| `right` | Offset side relative to local segment tangent |
| `labelOffset` | `(dx,dy)` | Extra canvas-delta after side offset |

### 5.2 Node suffix additions

After id (and optional `at (x,y)`):

- `size (w, h)` — positive numbers
- `[label: inside\|below\|above\|left\|right]`
- `[wrap: 1..5]`
- `[font: small\|normal\|large]`
- `[align: left\|center]`

Multiple keys may share one `[…]` block. Unknown keys → parse error (same as edges).

### 5.3 Directives

`layoutSpacing:` may appear with other first-line directives (order-independent among directive lines). Incompatible with nothing except: if unknown value → parse error.

## 6. AST

```ts
interface Diagram {
  // existing fields…
  layoutSpacing?: 'compact' | 'normal' | 'relaxed' | 'spacious';
}

interface DiagramEdge {
  // existing fields…
  waypoints?: Position[];
  labelPlacement?: {
    at?: number;
    side?: 'above' | 'below' | 'left' | 'right';
    offset?: Position;
  };
}

// On every DiagramNode variant:
sizeHint?: { width: number; height: number };
visual?: {
  label?: 'inside' | 'below' | 'above' | 'left' | 'right';
  wrap?: 1 | 2 | 3 | 4 | 5;
  font?: 'small' | 'normal' | 'large';
  align?: 'left' | 'center';
};
```

## 7. Pipeline behavior

### A1 Waypoints

- Parser fills `edge.waypoints`.
- Layout: if `waypoints?.length`, build path = `[exitStub, ...waypoints, entryStub]` (stubs from existing anchor helpers); skip visibility-graph search for that edge; still apply `corner` cosmetics when drawing.
- Validate: warn if any segment is non-orthogonal; warn if a segment’s thick stroke would pass through an unrelated node AABB (reuse through-node ideas).

### A2 Size

- Layout engines / manual engine use `sizeHint` when present, else current defaults; clamp to kind minimums (document table in LANGUAGE).
- Manual overlap checks use the resolved size.
- Validate: `nodeSizeBelowMinimum`, `labelClippingLikely` (text length vs box / wrap).

### A3 Node labels

- Render reads `visual`; default remains today’s kind-based placement (activities inside/centered, events/gateways below).
- Validate: approximate label AABB vs other labels/nodes → warnings.

### A4 Edge labels

- Render places label using `labelPlacement` (default: midpoint + current halo behavior).
- Validate: `edgeLabelOverlapsNode`.

### A5 Spacing

- Map preset → numeric profile consumed by flat/swimlane/manual padding constants.
- Snapshot tests: verification diagrams with **no** `layoutSpacing` keep current metrics within known STATUS residuals.

## 8. Validation additions

New warning messages (severity `warning`), never flip `valid: false` unless parse/layout hard-fails:

- non-orthogonal via segment
- via / size-driven through-node (if not already covered)
- `nodeSizeBelowMinimum`
- `labelClippingLikely`
- node/edge label overlap / clipping
- `edgeLabelOverlapsNode`

## 9. Examples & docs

- `examples/manual-controls/*.bpm` — one file per slice minimum
- Update `docs/LANGUAGE.md`, `docs/ROADMAP.md`, `docs/STATUS.md`
- CLI: show validate JSON warnings on those examples in `docs/CLI.md` briefly

## 10. Success criteria

- All A slices have parser + unit tests and at least one example.
- Default (no new syntax) layout/render/validate behavior unchanged aside from intentional warning additions that are silent when unused.
- `npm test` green; `npm run bpm -- validate examples/manual-controls/…` shows expected warnings only where fixtures intend them.
