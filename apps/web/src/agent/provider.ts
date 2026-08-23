import { fetchWithProviderPolicy, readJsonWithLimit, type ProviderRequestOptions } from '../reviewProviders.js';
import type { AgentDiagramState, AgentPlan, DiagramAction } from './diagramActions.js';
import { planFromDescription, validatePlan } from './diagramActions.js';

export type DiagramAgentMode = 'generate' | 'fix';

export interface DiagramAgentProvider {
  readonly id: string;
  plan(mode: DiagramAgentMode, instruction: string, state: AgentDiagramState, options?: ProviderRequestOptions): Promise<AgentPlan>;
}

export const DIAGRAM_AGENT_SYSTEM_PROMPT = `You are a BPMN diagram editing agent operating a visible web editor.

You must return ONLY JSON in this shape:
{"title":"short title","explanation":"short explanation","actions":[...actions]}

Allowed actions:
- {"type":"createShape","id":"stable-id","shapeType":"bpmn:Task|bpmn:UserTask|bpmn:ServiceTask|bpmn:StartEvent|bpmn:EndEvent|bpmn:IntermediateThrowEvent|bpmn:ExclusiveGateway|bpmn:ParallelGateway|bpmn:Participant|bpmn:Lane","label":"text","x":number,"y":number,"parentId":"optional"}
- {"type":"moveShape","id":"existing-id","x":number,"y":number}
- {"type":"updateLabel","id":"existing-id","label":"text"}
- {"type":"connect","id":"stable-id","sourceId":"existing-or-created-id","targetId":"existing-or-created-id","flowType":"bpmn:SequenceFlow|bpmn:MessageFlow|bpmn:Association","waypoints":[{"x":number,"y":number}]}
- {"type":"routeEdge","id":"existing-edge-id","preference":"direct|top|bottom|left|right"}
- {"type":"setWaypoints","id":"existing-edge-id","waypoints":[{"x":number,"y":number}]}
- {"type":"deleteElements","ids":["existing-id"]}

Rules:
- This is manual editing. Do not use ELK, auto-layout, or abstract layout instructions.
- Every created shape needs explicit coordinates. Prefer a readable left-to-right primary flow.
- Sequence flows stay within one process/pool. Message flows represent communication between pools.
- Gateways should have clear incoming/outgoing paths. Keep message flows in outer corridors when they cross busy pools.
- Do not route through unrelated nodes. Use orthogonal waypoints and keep parallel edges separated.
- Preserve existing IDs and unrelated geometry during a surgical fix.
- Return a small, bounded action list. Never return markdown or prose outside the JSON object.`;

function parsePlan(raw: string): AgentPlan {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const parsed = JSON.parse(trimmed) as AgentPlan | { plan?: AgentPlan };
  const plan = 'plan' in parsed && parsed.plan ? parsed.plan : parsed as AgentPlan;
  const errors = validatePlan(plan);
  if (errors.length > 0) throw new Error(`AI returned an invalid diagram plan: ${errors.join('; ')}`);
  return plan;
}

function userMessage(mode: DiagramAgentMode, instruction: string, state: AgentDiagramState): string {
  return JSON.stringify({
    mode,
    instruction,
    currentDiagram: state,
    request: mode === 'generate'
      ? 'Create a complete manual diagram. The editor may be empty; use explicit positions and connections.'
      : 'Propose the smallest safe set of actions that satisfies the requested surgical fix.',
  });
}

export function createChatDiagramAgentProvider(options: {
  id: 'openai' | 'ollama' | 'local';
  apiKey?: string;
  baseUrl: string;
  model: string;
}): DiagramAgentProvider {
  return {
    id: options.id,
    async plan(mode, instruction, state, requestOptions) {
      const isOllama = options.id === 'ollama' || options.id === 'local';
      const endpoint = isOllama ? `${options.baseUrl.replace(/\/$/, '')}/api/chat` : `${options.baseUrl.replace(/\/$/, '')}/chat/completions`;
      const body = isOllama
        ? {
            model: options.model,
            messages: [{ role: 'system', content: DIAGRAM_AGENT_SYSTEM_PROMPT }, { role: 'user', content: userMessage(mode, instruction, state) }],
            stream: false,
            format: 'json',
          }
        : {
            model: options.model,
            messages: [{ role: 'system', content: DIAGRAM_AGENT_SYSTEM_PROMPT }, { role: 'user', content: userMessage(mode, instruction, state) }],
            response_format: { type: 'json_object' },
          };
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (!isOllama && options.apiKey) headers.Authorization = `Bearer ${options.apiKey}`;
      const response = await fetchWithProviderPolicy(endpoint, { method: 'POST', headers, body: JSON.stringify(body) }, requestOptions);
      if (!response.ok) throw new Error(`Diagram agent request failed: ${response.status} ${response.statusText}`);
      const data = await readJsonWithLimit(response) as {
        choices?: Array<{ message?: { content?: string } }>;
        message?: { content?: string };
      };
      return parsePlan(data.choices?.[0]?.message?.content ?? data.message?.content ?? '');
    },
  };
}

export const manualDiagramAgentProvider: DiagramAgentProvider = {
  id: 'manual',
  async plan(mode, instruction, state) {
    const request = instruction.trim();
    if (mode === 'generate') return planFromDescription(request);
    const move = request.match(/^move\s+([A-Za-z0-9_.-]+)\s+to\s+\(([-\d.]+)\s*,\s*([-\d.]+)\)$/i);
    if (move) {
      const action: DiagramAction = { type: 'moveShape', id: move[1], x: Number(move[2]), y: Number(move[3]) };
      return { title: 'Manual move', explanation: 'A single explicit move action was parsed offline.', actions: [action] };
    }
    const relative = request.match(/^move\s+([A-Za-z0-9_.-]+)\s+(right|left|above|below)\s+of\s+([A-Za-z0-9_.-]+)$/i);
    if (relative) {
      const node = state.nodes.find((candidate) => candidate.id === relative[1]);
      const anchor = state.nodes.find((candidate) => candidate.id === relative[3]);
      if (!node || !anchor) throw new Error('The offline move needs two existing element ids');
      const gap = 40;
      const direction = relative[2].toLowerCase();
      const x = direction === 'right' ? anchor.x + anchor.width + gap : direction === 'left' ? anchor.x - node.width - gap : anchor.x;
      const y = direction === 'below' ? anchor.y + anchor.height + gap : direction === 'above' ? anchor.y - node.height - gap : anchor.y;
      return { title: 'Relative manual move', explanation: 'A single relative move was resolved from the current editor geometry.', actions: [{ type: 'moveShape', id: node.id, x, y }] };
    }
    const route = request.match(/^route\s+([A-Za-z0-9_.-]+)\s+(?:around|via)\s+(top|bottom|left|right|direct)$/i);
    if (route) {
      return { title: 'Manual edge route', explanation: 'The model-free route action lets the deterministic candidate router choose exact bends for the requested corridor.', actions: [{ type: 'routeEdge', id: route[1], preference: route[2].toLowerCase() as 'direct' | 'top' | 'bottom' | 'left' | 'right' }] };
    }
    throw new Error('Offline surgical examples: “move task-1 to (420, 220)”, “move task-1 right of task-2”, or “route flow-1 around bottom”.');
  },
};

export function providerFromSettings(providerId: string, apiKey: string, baseUrl: string, model: string): DiagramAgentProvider {
  if (providerId === 'manual') return manualDiagramAgentProvider;
  if (providerId === 'ollama') return createChatDiagramAgentProvider({ id: 'ollama', baseUrl: baseUrl || 'http://localhost:11434', model: model || 'llama3.2' });
  return createChatDiagramAgentProvider({ id: 'openai', apiKey, baseUrl: baseUrl || 'https://api.openai.com/v1', model: model || 'gpt-4o' });
}
