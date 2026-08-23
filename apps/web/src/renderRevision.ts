/**
 * Tracks which asynchronous render is allowed to become the committed UI
 * snapshot. A result is committed only when it belongs to the latest revision.
 */
export interface RevisionToken {
  revision: number;
  source: string;
}

export interface ExecutionSnapshot<T> {
  revision: number;
  source: string;
  value: T;
}

export interface RevisionTracker<T> {
  begin(source: string): RevisionToken;
  invalidate(): void;
  isCurrent(token: RevisionToken): boolean;
  commit(token: RevisionToken, value: T): ExecutionSnapshot<T> | null;
  committed(): ExecutionSnapshot<T> | undefined;
}

export function createRevisionTracker<T>(): RevisionTracker<T> {
  let revision = 0;
  let committed: ExecutionSnapshot<T> | undefined;

  return {
    begin(source) {
      revision += 1;
      return { revision, source };
    },
    invalidate() {
      revision += 1;
    },
    isCurrent(token) {
      return token.revision === revision;
    },
    commit(token, value) {
      if (token.revision !== revision) return null;
      committed = { revision: token.revision, source: token.source, value };
      return committed;
    },
    committed() {
      return committed;
    },
  };
}
