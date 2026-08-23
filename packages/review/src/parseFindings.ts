import type { VisualFinding } from './types.js';

function asFindingArray(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === 'object') {
    const obj = parsed as { findings?: unknown };
    if (Array.isArray(obj.findings)) return obj.findings;
    if (obj.findings && typeof obj.findings === 'object') return [obj.findings];
    if ('message' in obj || 'patch' in obj || 'severity' in obj) return [obj];
  }
  return [];
}

export function parseFindings(raw: string): VisualFinding[] {
  try {
    const parsed = JSON.parse(raw);
    const arr = asFindingArray(parsed);
    return arr.map((item) => {
      const f = item as {
        severity?: VisualFinding['severity'];
        category?: VisualFinding['category'];
        message?: string;
        suggestedFix?: string;
        confidence?: number;
        patch?: { find?: string; replace?: string };
      };
      return {
        severity: f.severity ?? 'note',
        category: f.category ?? 'other',
        message: f.message ?? 'Unknown issue',
        suggestedFix: f.suggestedFix,
        confidence: typeof f.confidence === 'number' ? f.confidence : undefined,
        source: 'model' as const,
        patch: f.patch?.find != null && f.patch.replace != null
          ? { find: f.patch.find, replace: f.patch.replace }
          : undefined,
      };
    });
  } catch {
    return [{
      severity: 'note',
      category: 'other',
      message: `Could not parse model response: ${raw.slice(0, 200)}`,
      source: 'model',
    }];
  }
}
