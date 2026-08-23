import type { TextPatch } from './repairTypes.js';

/** Apply a single exact find/replace patch. Returns updated text or null if find is missing/ambiguous. */
export function applyTextPatch(text: string, patch: TextPatch): string | null {
  const { find, replace } = patch;
  if (!find) return null;
  const first = text.indexOf(find);
  if (first === -1) return null;
  const second = text.indexOf(find, first + find.length);
  if (second !== -1) return null;
  return text.slice(0, first) + replace + text.slice(first + find.length);
}

/** Apply patches in order; skips patches that cannot be applied uniquely. */
export function applyTextPatches(text: string, patches: TextPatch[]): { text: string; applied: TextPatch[] } {
  let current = text;
  const applied: TextPatch[] = [];
  for (const patch of patches) {
    const next = applyTextPatch(current, patch);
    if (next === null) continue;
    current = next;
    applied.push(patch);
  }
  return { text: current, applied };
}
