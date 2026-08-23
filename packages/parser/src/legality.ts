import type { EventCategory, EventTrigger } from '@bpm/ast';
import type { ParseError } from './errors.js';

/** BPMN 2.0 category × trigger combinations allowed by the spec. */
const ALLOWED_TRIGGERS: Record<EventCategory, ReadonlySet<EventTrigger>> = {
  start: new Set([
    'none', 'message', 'timer', 'conditional', 'signal', 'multiple', 'parallelMultiple', 'error', 'escalation',
  ]),
  intermediate: new Set([
    'none', 'message', 'timer', 'error', 'escalation', 'conditional', 'link', 'signal',
    'multiple', 'parallelMultiple', 'compensation',
  ]),
  end: new Set([
    'none', 'message', 'error', 'escalation', 'cancel', 'compensation', 'signal',
    'multiple', 'parallelMultiple', 'terminate',
  ]),
};

/** Boundary events attach to activities; these triggers are valid on boundary events. */
const BOUNDARY_TRIGGERS: ReadonlySet<EventTrigger> = new Set([
  'message', 'timer', 'error', 'escalation', 'cancel', 'compensation', 'conditional',
  'signal', 'multiple', 'parallelMultiple',
]);

export function checkEventTriggerLegality(
  category: EventCategory,
  trigger: EventTrigger,
  line: number,
  attachedToId?: string,
): ParseError | undefined {
  if (attachedToId !== undefined) {
    if (!BOUNDARY_TRIGGERS.has(trigger)) {
      return {
        line,
        column: 1,
        message: `Boundary event trigger "${trigger}" is not valid in BPMN — allowed: ${[...BOUNDARY_TRIGGERS].join(', ')}`,
      };
    }
    return undefined;
  }

  const allowed = ALLOWED_TRIGGERS[category];
  if (!allowed.has(trigger)) {
    const categoryLabel = category === 'start' ? 'start event' : category === 'end' ? 'end event' : 'intermediate event';
    return {
      line,
      column: 1,
      message: `Trigger "${trigger}" is not valid on a ${categoryLabel} in BPMN — allowed: ${[...allowed].join(', ')}`,
    };
  }
  return undefined;
}
