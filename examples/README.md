# Examples

Sample `.bpm` diagrams for the CLI and visual checks.

## getting-started/

Minimal auto-layout diagrams.

| File | Notes |
|---|---|
| [`hello.bpm`](getting-started/hello.bpm) | Task → exclusive gateway → task → end |

```bash
npm run bpm -- validate examples/getting-started/hello.bpm
npm run bpm -- render examples/getting-started/hello.bpm -o /tmp/hello.svg
```

## manual-mode/

Larger diagrams that use `positioning: manual` and exact `at (x, y)` coordinates. See [`manual-mode/README.md`](manual-mode/README.md).

## mind-maps/ and flowcharts/

Representative family examples selected with `diagram: mindmap` and `diagram: flowchart`. Validate them with:

```bash
npm run bpm -- validate examples/mind-maps/launch.bpm-equivalent
npm run bpm -- validate examples/flowcharts/request-routing.bpm-equivalent
```

## architecture/

Representative C4-style architecture family example with nested system, container, and component nodes:

```bash
npm run bpm -- validate examples/architecture/ordering-system.bpm
npm run bpm -- export --target architecture-c4-json examples/architecture/ordering-system.bpm
```

## gantt/

Representative bounded project timeline with a group, scheduled tasks, a milestone, progress,
weekday scheduling, and finish-to-start dependencies:

```bash
npm run bpm -- validate examples/gantt/release-plan.bpm
npm run bpm -- render examples/gantt/release-plan.bpm -o /tmp/release-plan.svg
npm run bpm -- export --target gantt-json examples/gantt/release-plan.bpm
```
