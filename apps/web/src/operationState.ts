export type OperationStatus = 'idle' | 'loading' | 'preparing' | 'running' | 'success' | 'warning' | 'error' | 'cancelled';

export interface OperationIdentity {
  source?: string;
  projectId?: string;
  diagramId?: string;
}

export interface OperationSnapshot extends OperationIdentity {
  id: number;
  kind: string;
  status: OperationStatus;
  label: string;
  message: string;
}

export interface OperationHandle {
  readonly id: number;
  readonly kind: string;
  readonly identity: OperationIdentity;
  isCurrent(): boolean;
  update(status: OperationStatus, message: string): boolean;
  finish(status: Extract<OperationStatus, 'success' | 'warning' | 'error' | 'cancelled'>, message: string): boolean;
}

export interface OperationStateCoordinator {
  begin(kind: string, label: string, identity?: OperationIdentity): OperationHandle | undefined;
  snapshot(): OperationSnapshot | undefined;
  subscribe(listener: (snapshot: OperationSnapshot | undefined) => void): () => void;
}

/** Small UI-facing coordinator. A new operation supersedes older work in the same scope. */
export function createOperationStateCoordinator(): OperationStateCoordinator {
  let nextId = 0;
  let current: OperationSnapshot | undefined;
  const listeners = new Set<(snapshot: OperationSnapshot | undefined) => void>();

  function publish(snapshot: OperationSnapshot | undefined): void {
    current = snapshot;
    for (const listener of listeners) listener(current);
  }

  function sameScope(a: OperationSnapshot, kind: string, identity: OperationIdentity): boolean {
    return a.kind === kind
      && a.source === identity.source
      && a.projectId === identity.projectId
      && a.diagramId === identity.diagramId;
  }

  function begin(kind: string, label: string, identity: OperationIdentity = {}): OperationHandle | undefined {
    if (current && (current.status === 'loading' || current.status === 'preparing' || current.status === 'running')
      && sameScope(current, kind, identity)) return undefined;
    const id = ++nextId;
    publish({ id, kind, label, ...identity, status: 'loading', message: label });
    const isCurrent = () => current?.id === id && current.kind === kind;
    const update = (status: OperationStatus, message: string): boolean => {
      if (!isCurrent()) return false;
      publish({ id, kind, label, ...identity, status, message });
      return true;
    };
    const finish = (status: Extract<OperationStatus, 'success' | 'warning' | 'error' | 'cancelled'>, message: string): boolean => update(status, message);
    return { id, kind, identity, isCurrent, update, finish };
  }

  return {
    begin,
    snapshot: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
