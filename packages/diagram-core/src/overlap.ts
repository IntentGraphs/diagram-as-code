/** A positioned node's bounds, generic across diagram families. */
export interface Bounds {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  children?: Bounds[];
}

function flattenNodes(nodes: Bounds[], acc: Bounds[] = []): Bounds[] {
  for (const n of nodes) {
    acc.push(n);
    if (n.children) flattenNodes(n.children, acc);
  }
  return acc;
}

function isAncestor(maybeAncestor: Bounds, node: Bounds): boolean {
  if (!maybeAncestor.children) return false;
  for (const c of maybeAncestor.children) {
    if (c.id === node.id || isAncestor(c, node)) return true;
  }
  return false;
}

export function describeOverlap(a: Bounds, b: Bounds): string {
  const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  const mover = a.x <= b.x && a.y <= b.y ? b : a;
  return overlapX <= overlapY
    ? `shift "${mover.id}" right by ${Math.ceil(overlapX)} (or the other node left)`
    : `shift "${mover.id}" down by ${Math.ceil(overlapY)} (or the other node up)`;
}

export function assertNoOverlaps(nodes: Bounds[]): void {
  const flat = flattenNodes(nodes);
  for (let i = 0; i < flat.length; i++) {
    for (let j = i + 1; j < flat.length; j++) {
      const a = flat[i];
      const b = flat[j];
      if (isAncestor(a, b) || isAncestor(b, a)) continue;
      const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
      if (overlap) {
        throw new Error(`Nodes "${a.id}" and "${b.id}" overlap at their given positions — ${describeOverlap(a, b)}.`);
      }
    }
  }
}
