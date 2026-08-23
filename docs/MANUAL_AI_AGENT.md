# Manual BPMN AI agent

The web editor now has a deliberately manual AI workflow in `feat/manual-ai-bpmn-editor`.
The BPMN.js modeler is the source of truth. The agent proposes a bounded list of editor
actions, shows the list before changing the canvas, and applies actions one at a time or
all at once. Each agent step is undoable.

## Try it

1. Start the web app with `npm run dev -w @bpm/web`.
2. Open **Diagram** mode and click **New**.
3. Open **Manual AI Agent**.
4. Leave the provider as **Offline deterministic agent** and enter:
   `Review order -> Approve payment -> Ship order`.
5. Click **Plan actions**, inspect the explicit list, then use **Apply next** or **Apply all**.
6. Use **Undo agent step** to remove the most recently applied plan step.

Offline surgical examples:

- `move agent-task-1 to (420, 220)`
- `move agent-task-1 right of agent-task-2`
- `route agent-flow-1 around bottom`

The offline provider is intentionally small and deterministic. It is useful for checking the
editor contract without credentials; it is not intended to understand arbitrary natural language.

## Remote providers

The panel can call Ollama or an OpenAI-compatible endpoint. Configure the shared API key, base
URL, and model from **Text mode → Settings**, then return to Diagram mode. The API key is stored
in browser session storage by default; use **Remember API key on this device** only on a private
device if it should survive refreshes. Review, Generate, and the Diagram agent share the setting;
clear it from Settings when finished. Remote providers must return the JSON action contract
described in `apps/web/src/agent/provider.ts`.

The remote provider can propose complete diagrams or surgical changes. The browser validates the
response before it reaches BPMN.js, and the geometry gate rejects node overlaps, edges through
unrelated nodes, and invalid connection endpoints. A small deterministic candidate-router handles
requested top/bottom/left/right corridors; the model does not get to emit an opaque layout result.

## Deliberate boundaries

- There is no ELK or automatic layout path in this feature.
- The agent may create, move, rename, connect, reroute, or delete BPMN elements, but the user
  remains in the apply/undo loop.
- Geometry checks are safety gates, not a complete BPMN validator. BPMN semantics, lane/pool
  correctness, labels, and business intent still need review and should be covered by the existing
  validator/export checks before publishing.
- Chat is only the interaction surface. The important product boundary is the typed action plan;
  an eventual agent can inspect, propose alternatives, and repair rejected actions without gaining
  direct uncontrolled access to the canvas.
