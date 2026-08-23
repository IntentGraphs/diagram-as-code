import { inspectAgentGeometry } from './geometry.js';
import { actionDescription, validatePlan, type AgentDiagramState, type AgentPlan, type DiagramAction } from './diagramActions.js';

export interface DiagramAgentAdapter {
  getState(): AgentDiagramState;
  applyAction(action: DiagramAction): void;
  undo(): void;
}

export interface AppliedAction {
  action: DiagramAction;
  report: ReturnType<typeof inspectAgentGeometry>;
}

export class DiagramAgentSession {
  private plan: AgentPlan | null = null;
  private cursor = 0;
  private applied: AppliedAction[] = [];

  constructor(private readonly adapter: DiagramAgentAdapter) {}

  getPlan(): AgentPlan | null { return this.plan; }
  getCursor(): number { return this.cursor; }
  getApplied(): AppliedAction[] { return [...this.applied]; }
  getState(): AgentDiagramState { return this.adapter.getState(); }
  getReport() { return inspectAgentGeometry(this.getState()); }

  setPlan(plan: AgentPlan): void {
    const errors = validatePlan(plan);
    if (errors.length > 0) throw new Error(errors.join('; '));
    this.plan = plan;
    this.cursor = 0;
    this.applied = [];
  }

  clearPlan(): void {
    this.plan = null;
    this.cursor = 0;
    this.applied = [];
  }

  applyNext(): AppliedAction | null {
    if (!this.plan || this.cursor >= this.plan.actions.length) return null;
    const action = this.plan.actions[this.cursor];
    this.adapter.applyAction(action);
    const report = this.getReport();
    if (!report.hardValid) {
      this.adapter.undo();
      throw new Error(`Rejected “${actionDescription(action)}”: ${[
        ...report.nodeOverlaps.map((id) => `overlap ${id}`),
        ...report.edgeThroughNode.map((id) => `edge through node ${id}`),
        ...report.endpointErrors.map((id) => `invalid endpoint ${id}`),
      ].join(', ')}`);
    }
    this.cursor += 1;
    const applied = { action, report };
    this.applied.push(applied);
    return applied;
  }

  applyAll(): AppliedAction[] {
    const applied: AppliedAction[] = [];
    while (this.cursor < (this.plan?.actions.length ?? 0)) {
      const next = this.applyNext();
      if (next) applied.push(next);
    }
    return applied;
  }

  undoLast(): void {
    if (this.applied.length === 0) return;
    this.adapter.undo();
    this.applied.pop();
    this.cursor = Math.max(0, this.cursor - 1);
  }
}
