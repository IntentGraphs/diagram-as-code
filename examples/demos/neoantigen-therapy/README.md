# Neoantigen therapy demo

This is a social-video-sized cut of the larger end-to-end journey. It keeps the original clinical logic, but groups adjacent operational roles into eight lanes so the whole diagram can stay visible in a 16:9 recording.

The source is intentionally written as one growing document: each edge is placed near the node declarations it completes, so the diagram can be built in-place without maintaining a separate “shapes” section and “edges” section.

## Render the finished frame

From the repository root:

```bash
npm run --silent bpm -- validate examples/demos/neoantigen-therapy/neoantigen-therapy-demo.bpm
npm run --silent bpm -- render examples/demos/neoantigen-therapy/neoantigen-therapy-demo.bpm --format svg -o examples/demos/neoantigen-therapy/neoantigen-therapy-demo.svg
```

To generate cumulative PNG frames automatically, then a roughly 32-second GIF (4 seconds per beat):

```bash
node examples/demos/neoantigen-therapy/render-demo-frames.mjs --gif
```

Add `--mp4` when you also want an MP4 master. The generated `frames/sources/` files are valid native `.bpm` snapshots; each one contains the same pool and all lanes up to that beat.

Open the `.bpm` source in the web editor with `render: auto`. Add each beat below to the same file and let the preview update after each small edit. The editor may ask for an explicit Render action for a large paste; that is expected for a diagram with many routed connections.

## 35–45 second recording plan

1. 0–4s — Show the title and add Clinic: diagnosis → consent → profiling.
2. 4–9s — Add Specimen Intake: the parallel split and two samples.
3. 9–15s — Add Histology + Sequencing: assay split, WES/WGS, germline/HLA, and merge.
4. 15–20s — Add Bioinformatics and Tumor Board: ranked candidates plus the approval decision.
5. 20–27s — Add Vaccine Design + GMP: target selection → construct → manufacture.
6. 27–33s — Add QC + Supply Chain: pass/fail release and cold-chain handoff.
7. 33–39s — Add Administration: dose loop and “series complete?” decision.
8. 39–45s — Add Follow-up: stable surveillance versus re-biopsy and a new profiling cycle.

For a clean screen capture, keep the canvas fitted to the window, pause about 0.5 seconds after each render, and use the final frame for 2 seconds. Export the recording as MP4 first; convert that MP4 to GIF only if the resulting file remains small enough for the target post.

The arrow forms are native BPMN DSL: `->` is a normal flow, `=>` is a conditional branch, and `->>` is the default/else branch. The source uses normal sequence flow for cross-lane handoffs because this is one participant pool.

The source validates successfully with no node overlaps or edge-through-node defects. The remaining layout warnings are expected from the intentional dosing loop and the automatic router’s long-loop fallback.
