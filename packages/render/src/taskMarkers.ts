import type { TaskType } from '@bpm/ast';

/** Small BPMN-style task-type marker in the upper-left of activity boxes. */
export function taskMarkerSvg(activityType: string, x: number, y: number): string {
  const ox = x + 6;
  const oy = y + 6;
  const g = (paths: string) => `<g transform="translate(${ox},${oy})">${paths}</g>`;

  switch (activityType as TaskType) {
    case 'userTask':
      return g('<circle cx="6" cy="4" r="3" fill="none" stroke="black" stroke-width="1"/><path d="M2 14 Q6 10 10 14" fill="none" stroke="black" stroke-width="1"/>');
    case 'serviceTask':
      return g('<circle cx="6" cy="6" r="5" fill="none" stroke="black" stroke-width="1"/><circle cx="6" cy="6" r="1.5" fill="black"/><path d="M6 1 L6 3 M6 9 L6 11 M1 6 L3 6 M9 6 L11 6" stroke="black" stroke-width="1"/>');
    case 'sendTask':
      return g('<rect x="1" y="3" width="10" height="7" fill="black" stroke="black"/><path d="M1 3 L6 7 L11 3" fill="none" stroke="white" stroke-width="0.8"/><path d="M11 6 L13 6 L13 8" fill="none" stroke="black" stroke-width="1"/>');
    case 'receiveTask':
      return g('<rect x="1" y="3" width="10" height="7" fill="white" stroke="black" stroke-width="1"/><path d="M1 3 L6 7 L11 3" fill="none" stroke="black" stroke-width="1"/>');
    case 'manualTask':
      return g('<path d="M2 12 L2 8 Q2 4 6 4 Q8 4 8 6 L8 10 Q8 12 6 12 Z" fill="none" stroke="black" stroke-width="1"/><path d="M8 8 L10 6 L10 10 Z" fill="none" stroke="black" stroke-width="1"/>');
    case 'businessRuleTask':
      return g('<rect x="1" y="2" width="10" height="10" fill="none" stroke="black" stroke-width="1"/><line x1="1" y1="5" x2="11" y2="5" stroke="black"/><line x1="1" y1="8" x2="11" y2="8" stroke="black"/><line x1="5" y1="2" x2="5" y2="12" stroke="black"/>');
    case 'scriptTask':
      return g('<path d="M2 2 L8 2 L10 4 L10 12 L2 12 Z" fill="white" stroke="black" stroke-width="1"/><line x1="4" y1="6" x2="8" y2="6" stroke="black"/><line x1="4" y1="8" x2="8" y2="8" stroke="black"/>');
    default:
      return '';
  }
}
