# Prompt template — manual-mode `.bpm` diagrams

A copy-paste prompt for handing to any AI (this one or another provider/model) so it
reliably produces a clean, non-overlapping, first-attempt-correct `.bpm` file using
`positioning: manual`. Fill in the `{{ }}` placeholders and send as-is.

Manual mode trades auto-layout's convenience for exact control over every node's
`(x, y)` — reach for it when you (or a downstream consumer) need pixel-stable,
hand-tuned geometry rather than "whatever the layout engine decides." The full grammar
this template distills is `docs/LANGUAGE.md`; paste that file in alongside this prompt
if the target AI can take a second attachment — it removes any ambiguity below.

---

## The prompt

```
You are writing a diagram in the `.bpm` text DSL — a Mermaid-like BPMN 2.0 authoring
language. Output ONLY a single fenced ```bpm code block containing the finished file.
No prose before or after it unless I ask a question.

PROCESS TO DIAGRAM:
{{describe the process here — steps, decision points, who does what, exceptions/
timeouts, systems/participants involved. The more concrete, the better.}}

STYLE:
{{optional — e.g. "flat, no pools", "one pool, lanes per role: Sales / Finance /
Warehouse", "two pools with a message handoff", "keep it to ~10 nodes"}}

Follow this grammar and process EXACTLY. This is a strict parser, not a suggestion:

1. FILE SHAPE
   First non-blank line: `positioning: manual`, then a blank line, then node/edge
   declarations. Do not also add a `layout:` directive — combining the two is a parse
   error.

2. INDENTATION
   Nesting (pool → lane → node, or subprocess → children) is exactly 2 spaces per
   level, space characters only, never tabs, never 4 spaces. This is the #1 first-
   attempt failure — get it exact.

3. NODE KINDS
   event <start|intermediate|end> <none|message|timer|error|escalation|cancel|
     compensation|conditional|link|signal|multiple|parallelMultiple|terminate>
     "<label>" as <id> at (x, y)
   boundary <trigger> <interrupting|nonInterrupting> "<label>" as <id> on <hostId>
     — NEVER give a boundary event `at (x, y)`; it always attaches to its host's
     border. Giving it one is a parse error.
   gateway <exclusive|parallel|inclusive|complex|eventBased> "<label>" as <id>
     at (x, y)
   task "<label>" as <id> at (x, y)
   subprocess "<label>" as <id> at (x, y)          ← opens a nested, indented block
   subprocess "<label>" as <id> at (x, y) collapsed ← no nested block, `+` marker
   transaction "<label>" as <id> at (x, y) [collapsed]  ← same as subprocess, double border
   callActivity "<label>" as <id> at (x, y)
   dataObject "<label>" as <id> at (x, y)
   dataStore "<label>" as <id> at (x, y)
   annotation "<label>" as <id> at (x, y)
   group "<label>" as <id> at (x, y)

   `at (x, y)` is REQUIRED on every node above (boundary events excepted — forbidden
   there). Missing or extra `at (x, y)` (relative to the manual-mode rule) is a parse
   error naming the offending node id.

4. IDS
   Match `[A-Za-z_][A-Za-z0-9_.-]*` — letter/underscore first. No spaces, no quotes.
   Every id used as an edge endpoint or `on <hostId>` must be declared with `as <id>`
   somewhere, and every declared id must be unique.

5. POOLS & LANES (only if the process has multiple participants/roles)
   pool "<name>"
     lane "<name>"
       <node declarations, indented one level deeper>
   Coordinates inside a lane are relative to that lane's own top-left, not the canvas
   — lanes auto-stack and auto-size, so you never need to know an earlier lane's
   final height. Coordinates at the top level (no pool/lane) are canvas-absolute.
   Cross-lane edges are detected automatically from which lane each id was declared
   in — no special edge syntax needed.

6. EDGES
   <sourceId> <arrow> <targetId>[: "<label>"] [attr: value, ...]
   Arrows:
     ->   sequence            — ordinary control flow
     =>   conditionalSequence — a labeled branch out of a gateway
     ->>  defaultSequence     — the else/default branch out of a gateway
     ~>   message             — ALWAYS use this for edges crossing between pools
     ..>  association         — linking a dataObject/annotation to a node (not a flow)
   Optional attribute block, any subset, any order:
     [style: solid|dashed|dotted, corner: sharp|round,
      from: left|right|top|bottom, to: left|right|top|bottom,
      via: (x,y) (x,y) ..., labelAt: 0..1, labelSide: above|below|left|right,
      labelOffset: (dx,dy)]
   Prefer leaving `from`/`to` unset on gateways/events unless you specifically need a
   vertical exit — bottom/top on those routes the edge through the node's own label.

7. COORDINATES — compute before writing, don't guess-and-fix
   Default node footprints (width × height) you must reason about before picking any
   `at (x, y)`:
     event, boundary        40 × 40
     gateway                50 × 50
     dataObject/dataStore/
       annotation           50 × 60
     group                  200 × 150
     task and all task subtypes/callActivity/
       collapsed subprocess/
       collapsed transaction  clamp(24 + 7×label.length, 100, 220) × 60
   Expanded (non-collapsed) subprocess/transaction boxes size from their children's
   bounding box plus padding — children's `at (x, y)` is relative to the subprocess's
   own content origin, same idea as lane-relative coordinates.
   Two nodes overlap (and the file is REJECTED at layout time, not parse time) if their
   axis-aligned boxes `[x, x+width] × [y, y+height]` intersect at all. Lay out left to
   right in rough process order, leave 20–40 units of clearance between adjacent boxes
   for edge routing, and verify every pair of boxes you place doesn't intersect before
   finalizing.

8. NEATNESS RULES (this is what makes the output look designed, not just parseable)
   - Keep labels to a short phrase, roughly 3–6 words — activity labels wrap at 3
     lines and the box only widens up to the clamp above before wrapping kicks in.
   - Don't add an edge the process doesn't need — fewer, more direct flows render
     more cleanly than crisscrossing shortcuts, especially across pools.
   - If using pools/lanes, keep content roughly balanced across a pool's lanes when
     presentation space matters. Each lane is sized from its own content; sparse lanes
     no longer inherit the tallest lane's height.
   - Get event category/trigger and gateway type combinations semantically right
     yourself (e.g. `terminate` only on end events). `bpm validate` also checks the
     documented BPMN legality subset and reports `semanticErrors`, including illegal
     event combinations, cancel-boundary hosts, event-based gateway targets, and
     non-association self-loops; it is not a complete BPMN semantics checker.

9. SELF-CHECK BEFORE YOU ANSWER
   - [ ] `positioning: manual` is the first line; no `layout:` directive present.
   - [ ] Every nested line is indented exactly 2 spaces per level, spaces only.
   - [ ] Every node except boundary events has `at (x, y)`; no boundary event does.
   - [ ] Every edge endpoint / `on <hostId>` id was declared with `as <id>`; all ids
         unique.
   - [ ] You computed every box's footprint from the table in §7 and checked every
         pair for overlap — not just eyeballed it.
   - [ ] Arrow choice matches intent (`->` / `=>` / `->>` / `~>` / `..>`).
   - [ ] Labels are short phrases, not sentences.

Output the finished ```bpm code block now.
```

---

## Using it

1. Fill in `PROCESS TO DIAGRAM` (and optionally `STYLE`) at the top of the prompt.
2. Send it to whichever AI you're using.
3. Validate the result against this workspace's actual parser before trusting it —
   the AI's self-check is best-effort, this command is authoritative:

   ```bash
   npm run bpm -- validate path/to/your-diagram.bpm
   ```

4. Render it to see the SVG:

   ```bash
   npm run bpm -- render path/to/your-diagram.bpm --out out.svg
   ```

If `validate` reports an overlap or a missing/extra `at (x, y)`, paste the exact error
back to the AI — the messages name the offending node id and, for overlaps, suggest a
concrete axis shift.

## When manual mode isn't actually what you want

If you don't need exact pixel control, drop `positioning: manual` and the `at (x, y)`
fields from the template entirely (step 1 and the `at (x, y)` requirements in step 3)
— auto-layout computes non-overlapping positions and routes every edge from topology
alone, which is less for the AI to get wrong and just as clean for most diagrams. See
`docs/LANGUAGE.md` §2 for the tradeoff in more detail, and `examples/manual-mode/` /
`examples/manual-controls/` for more worked examples of both modes.
