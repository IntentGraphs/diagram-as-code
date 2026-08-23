import type { Diagram } from '@bpm/ast';
import type { PositionedDiagram } from './types.js';

export interface LayoutEngine {
  name: string;
  matches(diagram: Diagram): boolean;
  layout(diagram: Diagram): Promise<PositionedDiagram>;
}

const engines: LayoutEngine[] = [];

export function registerEngine(engine: LayoutEngine): void {
  const existing = engines.findIndex((e) => e.name === engine.name);
  if (existing >= 0) engines[existing] = engine;
  else engines.push(engine);
}

/** Clears the registry — for tests only. */
export function clearEngines(): void {
  engines.length = 0;
}

export function getEngineByName(name: string): LayoutEngine {
  const named = engines.find((e) => e.name === name);
  if (!named) {
    throw new Error(
      `Unknown layout engine "${name}". Registered: ${engines.map((e) => e.name).join(', ') || '(none)'}`,
    );
  }
  return named;
}

export function selectEngine(diagram: Diagram): LayoutEngine {
  if (diagram.layout !== undefined) return getEngineByName(diagram.layout);
  const matched = engines.find((e) => e.matches(diagram));
  if (!matched) {
    throw new Error('No layout engine matched this diagram');
  }
  return matched;
}
