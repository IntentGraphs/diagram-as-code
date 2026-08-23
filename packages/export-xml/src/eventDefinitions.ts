import type { EventDefinition, EventTrigger } from '@bpm/ast';
import { escapeXml } from './xml.js';

const DEFINITION_TAG: Record<Exclude<EventTrigger, 'none'>, string> = {
  message: 'messageEventDefinition',
  timer: 'timerEventDefinition',
  error: 'errorEventDefinition',
  escalation: 'escalationEventDefinition',
  cancel: 'cancelEventDefinition',
  compensation: 'compensateEventDefinition',
  conditional: 'conditionalEventDefinition',
  link: 'linkEventDefinition',
  signal: 'signalEventDefinition',
  // This tool doesn't model which sub-triggers compose a multiple/parallelMultiple event;
  // a single messageEventDefinition is emitted as a structurally-valid placeholder.
  multiple: 'messageEventDefinition',
  parallelMultiple: 'messageEventDefinition',
  terminate: 'terminateEventDefinition',
};

export function eventDefinitionXml(trigger: EventTrigger, definition?: EventDefinition): string {
  if (trigger === 'none') return '';
  const tag = DEFINITION_TAG[trigger];
  const attrs: string[] = [];
  const inner: string[] = [];
  if (trigger === 'message' && definition?.messageRef) attrs.push(` messageRef="${escapeXml(definition.messageRef)}"`);
  if (trigger === 'error' && definition?.errorRef) attrs.push(` errorRef="${escapeXml(definition.errorRef)}"`);
  if (trigger === 'escalation' && definition?.escalationRef) attrs.push(` escalationRef="${escapeXml(definition.escalationRef)}"`);
  if (trigger === 'signal' && definition?.signalRef) attrs.push(` signalRef="${escapeXml(definition.signalRef)}"`);
  if (trigger === 'timer') {
    if (definition?.timerDate) inner.push(`<bpmn2:timeDate>${escapeXml(definition.timerDate)}</bpmn2:timeDate>`);
    if (definition?.timerDuration) inner.push(`<bpmn2:timeDuration>${escapeXml(definition.timerDuration)}</bpmn2:timeDuration>`);
    if (definition?.timerCycle) inner.push(`<bpmn2:timeCycle>${escapeXml(definition.timerCycle)}</bpmn2:timeCycle>`);
  }
  if (trigger === 'conditional' && definition?.condition) {
    inner.push(`<bpmn2:condition xsi:type="bpmn2:tFormalExpression">${escapeXml(definition.condition)}</bpmn2:condition>`);
  }
  if (attrs.length === 0 && inner.length === 0) return `<bpmn2:${tag}/>`;
  return `<bpmn2:${tag}${attrs.join('')}>${inner.join('')}</bpmn2:${tag}>`;
}

export function isParallelMultiple(trigger: EventTrigger): boolean {
  return trigger === 'parallelMultiple';
}
