import { DIAGRAM_FAMILIES, readDiagramHeader, type DiagramFamilyId } from '@bpm/diagram-runtime';
import {
  PROJECT_BUNDLE_FORMAT,
  PROJECT_BUNDLE_VERSION,
  type Project,
  type ProjectBundle,
  type ProjectBundleDiagram,
  type ProjectSeed,
  type SessionMeta,
  type StoredDiagram,
  type StoredRenderSnapshot,
} from './types.js';

const DB_NAME = 'bpm-projects';
const DB_VERSION = 3;

const STORE_META = 'meta';
const STORE_PROJECTS = 'projects';
const STORE_DIAGRAMS = 'diagrams';
const STORE_RENDERS = 'renders';

/** Persistence limits are deliberately conservative: they bound browser work without
 * changing the normal editing experience. Existing records outside these limits are ignored
 * and recovered from when possible. */
export const PROJECT_LIMITS = {
  idLength: 256,
  nameLength: 256,
  bodyBytes: 2 * 1024 * 1024,
  bundleBytes: 32 * 1024 * 1024,
} as const;

const META_SESSION_KEY = 'session';

interface MemoryBackend {
  projects: Map<string, Project>;
  diagrams: Map<string, StoredDiagram>;
  session: SessionMeta | null;
}

let memoryBackend: MemoryBackend | null = null;

function useMemoryBackend(): boolean {
  return memoryBackend !== null || typeof indexedDB === 'undefined';
}

function getMemoryBackend(): MemoryBackend {
  if (!memoryBackend) {
    memoryBackend = { projects: new Map(), diagrams: new Map(), session: null };
  }
  return memoryBackend;
}

export function enableMemoryBackend(): void {
  memoryBackend = { projects: new Map(), diagrams: new Map(), session: null };
}

function nowIso(): string {
  return new Date().toISOString();
}

function newId(): string {
  return crypto.randomUUID();
}

function isBoundedString(value: unknown, maxLength: number, nonEmpty = true): value is string {
  return typeof value === 'string' && value.length <= maxLength && (!nonEmpty || value.trim().length > 0);
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function isFamily(value: unknown): value is DiagramFamilyId {
  return typeof value === 'string' && (DIAGRAM_FAMILIES as readonly string[]).includes(value);
}

function bodyWithinLimit(value: unknown): value is string {
  return typeof value === 'string' && new TextEncoder().encode(value).byteLength <= PROJECT_LIMITS.bodyBytes;
}

function isProject(value: unknown): value is Project {
  if (!value || typeof value !== 'object') return false;
  const p = value as Partial<Project>;
  return isBoundedString(p.id, PROJECT_LIMITS.idLength)
    && isBoundedString(p.name, PROJECT_LIMITS.nameLength)
    && isTimestamp(p.createdAt) && isTimestamp(p.updatedAt)
    && (p.activeDiagramId === null || isBoundedString(p.activeDiagramId, PROJECT_LIMITS.idLength))
    && (p.family === undefined || isFamily(p.family));
}

function isStoredDiagram(value: unknown): value is StoredDiagram {
  if (!value || typeof value !== 'object') return false;
  const d = value as Partial<StoredDiagram>;
  return isBoundedString(d.id, PROJECT_LIMITS.idLength)
    && isBoundedString(d.projectId, PROJECT_LIMITS.idLength)
    && isBoundedString(d.name, PROJECT_LIMITS.nameLength)
    && d.kind === 'text' && bodyWithinLimit(d.body)
    && (d.diagramXml === undefined || bodyWithinLimit(d.diagramXml))
    && isTimestamp(d.createdAt) && isTimestamp(d.updatedAt)
    && (d.family === undefined || isFamily(d.family));
}

function isStoredRenderSnapshot(value: unknown): value is StoredRenderSnapshot {
  if (!value || typeof value !== 'object') return false;
  const snapshot = value as Partial<StoredRenderSnapshot>;
  return isBoundedString(snapshot.key, PROJECT_LIMITS.idLength * 4)
    && isBoundedString(snapshot.projectId, PROJECT_LIMITS.idLength)
    && isBoundedString(snapshot.diagramId, PROJECT_LIMITS.idLength)
    && isBoundedString(snapshot.sourceHash, 64)
    && (snapshot.engineOverride === null || typeof snapshot.engineOverride === 'string')
    && isBoundedString(snapshot.rendererVersion, 128)
    && snapshot.result !== undefined
    && isTimestamp(snapshot.updatedAt);
}

function isSessionMeta(value: unknown): value is SessionMeta {
  if (!value || typeof value !== 'object') return false;
  const meta = value as Partial<SessionMeta>;
  return isBoundedString(meta.activeProjectId, PROJECT_LIMITS.idLength)
    && isBoundedString(meta.activeDiagramId, PROJECT_LIMITS.idLength);
}

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is not available'));
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_META)) db.createObjectStore(STORE_META);
      if (!db.objectStoreNames.contains(STORE_PROJECTS)) db.createObjectStore(STORE_PROJECTS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORE_DIAGRAMS)) db.createObjectStore(STORE_DIAGRAMS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORE_RENDERS)) db.createObjectStore(STORE_RENDERS, { keyPath: 'key' });
      request.transaction?.objectStore(STORE_META).put(DB_VERSION, 'schemaVersion');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'));
  });
}

async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T | void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const request = run(store);
    tx.oncomplete = () => {
      db.close();
      if (request instanceof IDBRequest) resolve(request.result);
      else resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error ?? new Error('IndexedDB transaction failed'));
    };
  });
}

type StoreMap = Record<string, IDBObjectStore>;

/** Related project, diagram, and session writes commit as one IndexedDB unit. */
async function withStores(
  storeNames: string[],
  mode: IDBTransactionMode,
  run: (stores: StoreMap) => void,
): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeNames, mode);
    const stores = Object.fromEntries(storeNames.map((name) => [name, tx.objectStore(name)]));
    let runError: unknown;
    const close = () => db.close();
    tx.oncomplete = () => { close(); resolve(); };
    tx.onerror = () => { close(); reject(runError ?? tx.error ?? new Error('IndexedDB transaction failed')); };
    tx.onabort = () => { close(); reject(runError ?? tx.error ?? new Error('IndexedDB transaction aborted')); };
    try {
      run(stores);
    } catch (error) {
      runError = error;
      tx.abort();
    }
  });
}

export function isStorageAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

export async function resetStoreForTests(): Promise<void> {
  memoryBackend = typeof indexedDB === 'undefined' ? { projects: new Map(), diagrams: new Map(), session: null } : null;
  if (typeof indexedDB === 'undefined') return;
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('Failed to delete IndexedDB'));
    request.onblocked = () => resolve();
  });
}

async function getSessionMeta(): Promise<SessionMeta | undefined> {
  if (useMemoryBackend()) {
    const value = getMemoryBackend().session;
    return isSessionMeta(value) ? value : undefined;
  }
  const result = await withStore<SessionMeta | undefined>(STORE_META, 'readonly', (store) => store.get(META_SESSION_KEY));
  return isSessionMeta(result) ? result : undefined;
}

async function putSessionMeta(meta: SessionMeta): Promise<void> {
  if (useMemoryBackend()) {
    getMemoryBackend().session = meta;
    return;
  }
  await withStore(STORE_META, 'readwrite', (store) => {
    store.put(meta, META_SESSION_KEY);
  });
}

async function getProject(id: string): Promise<Project | undefined> {
  if (useMemoryBackend()) {
    const value = getMemoryBackend().projects.get(id);
    return isProject(value) ? value : undefined;
  }
  const result = await withStore<Project | undefined>(STORE_PROJECTS, 'readonly', (store) => store.get(id));
  return isProject(result) ? result : undefined;
}

async function putProject(project: Project): Promise<void> {
  if (useMemoryBackend()) {
    getMemoryBackend().projects.set(project.id, project);
    return;
  }
  await withStore(STORE_PROJECTS, 'readwrite', (store) => {
    store.put(project);
  });
}

async function getDiagram(id: string): Promise<StoredDiagram | undefined> {
  if (useMemoryBackend()) {
    const value = getMemoryBackend().diagrams.get(id);
    return isStoredDiagram(value) ? value : undefined;
  }
  const result = await withStore<StoredDiagram | undefined>(STORE_DIAGRAMS, 'readonly', (store) => store.get(id));
  return isStoredDiagram(result) ? result : undefined;
}

export async function getRenderSnapshot(key: string): Promise<StoredRenderSnapshot | undefined> {
  if (useMemoryBackend()) {
    const memory = getMemoryBackend() as MemoryBackend & { renders?: Map<string, StoredRenderSnapshot> };
    const renders = memory.renders ?? (memory.renders = new Map());
    const value = renders.get(key);
    return isStoredRenderSnapshot(value) ? value : undefined;
  }
  const result = await withStore<StoredRenderSnapshot | undefined>(STORE_RENDERS, 'readonly', (store) => store.get(key));
  return isStoredRenderSnapshot(result) ? result : undefined;
}

export async function putRenderSnapshot(snapshot: StoredRenderSnapshot): Promise<void> {
  if (!isStoredRenderSnapshot(snapshot)) throw new Error('Invalid render snapshot');
  if (useMemoryBackend()) {
    const memory = getMemoryBackend() as MemoryBackend & { renders?: Map<string, StoredRenderSnapshot> };
    const renders = memory.renders ?? (memory.renders = new Map());
    renders.set(snapshot.key, snapshot);
    return;
  }
  await withStore(STORE_RENDERS, 'readwrite', (store) => {
    store.put(snapshot);
  });
}

export async function deleteRenderSnapshotsForDiagram(diagramId: string): Promise<void> {
  if (useMemoryBackend()) {
    const memory = getMemoryBackend() as MemoryBackend & { renders?: Map<string, StoredRenderSnapshot> };
    memory.renders && [...memory.renders.values()]
      .filter((snapshot) => snapshot.diagramId === diagramId)
      .forEach((snapshot) => memory.renders!.delete(snapshot.key));
    return;
  }
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_RENDERS, 'readwrite');
    const store = tx.objectStore(STORE_RENDERS);
    const request = store.getAll();
    request.onsuccess = () => {
      for (const value of request.result as unknown[]) {
        if (isStoredRenderSnapshot(value) && value.diagramId === diagramId) store.delete(value.key);
      }
    };
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error ?? new Error('Failed to delete render snapshots')); };
    tx.onabort = () => { db.close(); reject(tx.error ?? new Error('Failed to delete render snapshots')); };
  });
}

async function putDiagram(diagram: StoredDiagram): Promise<void> {
  if (useMemoryBackend()) {
    getMemoryBackend().diagrams.set(diagram.id, diagram);
    return;
  }
  await withStore(STORE_DIAGRAMS, 'readwrite', (store) => {
    store.put(diagram);
  });
}

async function listDiagramsForProject(projectId: string): Promise<StoredDiagram[]> {
  if (useMemoryBackend()) {
    const all = [...getMemoryBackend().diagrams.values()].filter(isStoredDiagram).filter((d) => d.projectId === projectId);
    all.sort((a, b) => a.name.localeCompare(b.name));
    return all;
  }
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_DIAGRAMS, 'readonly');
    const store = tx.objectStore(STORE_DIAGRAMS);
    const request = store.getAll();
    request.onsuccess = () => {
      const all = (request.result as unknown[]).filter(isStoredDiagram).filter((d) => d.projectId === projectId);
      all.sort((a, b) => a.name.localeCompare(b.name));
      db.close();
      resolve(all);
    };
    request.onerror = () => {
      db.close();
      reject(request.error ?? new Error('Failed to list diagrams'));
    };
  });
}

async function listProjects(): Promise<Project[]> {
  if (useMemoryBackend()) return [...getMemoryBackend().projects.values()].filter(isProject);
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PROJECTS, 'readonly');
    const request = tx.objectStore(STORE_PROJECTS).getAll();
    request.onsuccess = () => { db.close(); resolve((request.result as unknown[]).filter(isProject)); };
    request.onerror = () => { db.close(); reject(request.error ?? new Error('Failed to list projects')); };
  });
}

export async function createDefaultProject(starter: string | ProjectSeed): Promise<{ project: Project; diagram: StoredDiagram; diagrams: StoredDiagram[]; activeDiagram: StoredDiagram }> {
  const seed: ProjectSeed = typeof starter === 'string'
    ? { name: 'Untitled project', diagrams: [{ name: 'main', body: starter }] }
    : starter;
  if (!seed.name.trim() || seed.name.length > PROJECT_LIMITS.nameLength) throw new Error('Project seed name is invalid');
  if (seed.diagrams.length === 0) throw new Error('Project seed must contain at least one diagram');
  for (const entry of seed.diagrams) {
    if (!entry.name.trim() || entry.name.length > PROJECT_LIMITS.nameLength) throw new Error('Project seed diagram name is invalid');
    if (!bodyWithinLimit(entry.body)) throw new Error(`Diagram body exceeds ${PROJECT_LIMITS.bodyBytes} bytes`);
  }
  const timestamp = nowIso();
  const projectId = newId();
  const diagrams: StoredDiagram[] = seed.diagrams.map((entry) => ({
    id: newId(),
    projectId,
    name: entry.name.trim(),
    kind: 'text',
    body: entry.body,
    createdAt: timestamp,
    updatedAt: timestamp,
    family: readDiagramHeader(entry.body).family,
  }));
  const activeDiagram = diagrams[0];
  const project: Project = {
    id: projectId,
    name: seed.name.trim(),
    createdAt: timestamp,
    updatedAt: timestamp,
    family: activeDiagram.family,
    activeDiagramId: activeDiagram.id,
  };
  const session = { activeProjectId: projectId, activeDiagramId: activeDiagram.id };
  if (useMemoryBackend()) {
    const memory = getMemoryBackend();
    memory.projects.set(project.id, project);
    for (const diagram of diagrams) memory.diagrams.set(diagram.id, diagram);
    memory.session = session;
  } else {
    await withStores([STORE_PROJECTS, STORE_DIAGRAMS, STORE_META], 'readwrite', (stores) => {
      stores[STORE_PROJECTS].put(project);
      for (const diagram of diagrams) stores[STORE_DIAGRAMS].put(diagram);
      stores[STORE_META].put(session, META_SESSION_KEY);
    });
  }
  return { project, diagram: activeDiagram, diagrams, activeDiagram };
}

export async function updateDiagramBody(id: string, body: string): Promise<void> {
  if (!bodyWithinLimit(body)) throw new Error(`Diagram body exceeds ${PROJECT_LIMITS.bodyBytes} bytes`);
  const diagram = await getDiagram(id);
  if (!diagram) throw new Error(`Diagram not found: ${id}`);
  const updatedAt = nowIso();
  const header = readDiagramHeader(body);
  const nextDiagram = { ...diagram, body, updatedAt, ...(header.diagnostics.length === 0 ? { family: header.family } : {}) };
  const project = await getProject(diagram.projectId);
  if (!project) throw new Error(`Project not found: ${diagram.projectId}`);
  const nextProject = { ...project, updatedAt, activeDiagramId: id, ...(header.diagnostics.length === 0 ? { family: header.family } : {}) };
  if (useMemoryBackend()) {
    const memory = getMemoryBackend();
    memory.diagrams.set(nextDiagram.id, nextDiagram);
    memory.projects.set(nextProject.id, nextProject);
  } else {
    await withStores([STORE_DIAGRAMS, STORE_PROJECTS], 'readwrite', (stores) => {
      stores[STORE_DIAGRAMS].put(nextDiagram);
      stores[STORE_PROJECTS].put(nextProject);
    });
  }
}

/** Persist the latest BPMN XML separately from the reviewable text source. */
export async function updateDiagramXml(id: string, diagramXml: string): Promise<void> {
  if (!bodyWithinLimit(diagramXml)) throw new Error(`Diagram XML exceeds ${PROJECT_LIMITS.bodyBytes} bytes`);
  const diagram = await getDiagram(id);
  if (!diagram) throw new Error(`Diagram not found: ${id}`);
  const updatedAt = nowIso();
  const nextDiagram = { ...diagram, diagramXml, updatedAt };
  const project = await getProject(diagram.projectId);
  if (!project) throw new Error(`Project not found: ${diagram.projectId}`);
  const nextProject = { ...project, updatedAt, activeDiagramId: id };
  if (useMemoryBackend()) {
    const memory = getMemoryBackend();
    memory.diagrams.set(nextDiagram.id, nextDiagram);
    memory.projects.set(nextProject.id, nextProject);
  } else {
    await withStores([STORE_DIAGRAMS, STORE_PROJECTS], 'readwrite', (stores) => {
      stores[STORE_DIAGRAMS].put(nextDiagram);
      stores[STORE_PROJECTS].put(nextProject);
    });
  }
}

export async function renameDiagram(id: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Diagram name cannot be empty');
  if (trimmed.length > PROJECT_LIMITS.nameLength) throw new Error('Diagram name is too long');
  const diagram = await getDiagram(id);
  if (!diagram) throw new Error(`Diagram not found: ${id}`);
  await putDiagram({ ...diagram, name: trimmed, updatedAt: nowIso() });
}

export async function renameProject(id: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Project name cannot be empty');
  if (trimmed.length > PROJECT_LIMITS.nameLength) throw new Error('Project name is too long');
  const project = await getProject(id);
  if (!project) throw new Error(`Project not found: ${id}`);
  await putProject({ ...project, name: trimmed, updatedAt: nowIso() });
}

function isProjectBundleDiagram(value: unknown): value is ProjectBundleDiagram {
  if (!value || typeof value !== 'object') return false;
  const diagram = value as Partial<ProjectBundleDiagram>;
  return isBoundedString(diagram.id, PROJECT_LIMITS.idLength)
    && isBoundedString(diagram.name, PROJECT_LIMITS.nameLength)
    && diagram.kind === 'text'
    && bodyWithinLimit(diagram.source)
    && (diagram.diagramXml === undefined || bodyWithinLimit(diagram.diagramXml))
    && isTimestamp(diagram.createdAt)
    && isTimestamp(diagram.updatedAt)
    && (diagram.family === undefined || isFamily(diagram.family))
    && (diagram.diagramXmlOrigin === undefined || diagram.diagramXmlOrigin === 'source-render' || diagram.diagramXmlOrigin === 'diagram-editor')
    && (diagram.replaySource === undefined || bodyWithinLimit(diagram.replaySource))
    && (diagram.render === undefined || (
      typeof diagram.render === 'object'
      && diagram.render !== null
      && (diagram.render.engine === null || typeof diagram.render.engine === 'string')
      && (diagram.render.positioning === 'auto' || diagram.render.positioning === 'manual')
      && typeof diagram.render.svg === 'string'
    ));
}

export function isProjectBundle(value: unknown): value is ProjectBundle {
  if (!value || typeof value !== 'object') return false;
  const bundle = value as Partial<ProjectBundle>;
  if (bundle.format !== PROJECT_BUNDLE_FORMAT || bundle.version !== PROJECT_BUNDLE_VERSION) return false;
  if (!isTimestamp(bundle.exportedAt) || !isProject(bundle.project) || !Array.isArray(bundle.diagrams) || bundle.diagrams.length === 0) return false;
  if (bundle.activeDiagramId !== null && !isBoundedString(bundle.activeDiagramId, PROJECT_LIMITS.idLength)) return false;
  const ids = new Set<string>();
  return bundle.diagrams.every((diagram) => {
    if (!isProjectBundleDiagram(diagram) || ids.has(diagram.id)) return false;
    ids.add(diagram.id);
    return true;
  });
}

/**
 * Restores a downloaded project as a new local project. New ids avoid overwriting an existing
 * project when a backup is imported into the same browser. BPMN bundles may carry a frozen
 * replaySource; using it here removes dependence on a future auto-layout implementation while
 * preserving the original source in the bundle for inspection.
 */
export async function importProjectBundle(bundle: ProjectBundle): Promise<{ project: Project; diagrams: StoredDiagram[]; activeDiagram: StoredDiagram }> {
  if (!isProjectBundle(bundle)) throw new Error('Invalid .bpm-project.json file');
  const timestamp = nowIso();
  const projectId = newId();
  const idMap = new Map(bundle.diagrams.map((diagram) => [diagram.id, newId()]));
  const diagrams = bundle.diagrams.map((entry) => {
    const body = entry.replaySource ?? entry.source;
    const header = readDiagramHeader(body);
    return {
      id: idMap.get(entry.id)!,
      projectId,
      name: entry.name,
      kind: 'text' as const,
      body,
      ...(entry.diagramXml ? { diagramXml: entry.diagramXml } : {}),
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
      ...(header.diagnostics.length === 0 ? { family: header.family } : entry.family ? { family: entry.family } : {}),
    } satisfies StoredDiagram;
  });
  const sourceActiveId = bundle.activeDiagramId && idMap.has(bundle.activeDiagramId)
    ? bundle.activeDiagramId
    : bundle.diagrams[0].id;
  const activeDiagram = diagrams.find((diagram) => diagram.id === idMap.get(sourceActiveId)) ?? diagrams[0];
  const project: Project = {
    ...bundle.project,
    id: projectId,
    name: bundle.project.name,
    createdAt: bundle.project.createdAt,
    updatedAt: timestamp,
    activeDiagramId: activeDiagram.id,
  };
  const session = { activeProjectId: projectId, activeDiagramId: activeDiagram.id };
  if (useMemoryBackend()) {
    const memory = getMemoryBackend();
    memory.projects.set(project.id, project);
    for (const diagram of diagrams) memory.diagrams.set(diagram.id, diagram);
    memory.session = session;
  } else {
    await withStores([STORE_PROJECTS, STORE_DIAGRAMS, STORE_META], 'readwrite', (stores) => {
      stores[STORE_PROJECTS].put(project);
      for (const diagram of diagrams) stores[STORE_DIAGRAMS].put(diagram);
      stores[STORE_META].put(session, META_SESSION_KEY);
    });
  }
  return { project, diagrams, activeDiagram };
}

export async function createDiagram(projectId: string, name: string, body = ''): Promise<StoredDiagram> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Diagram name cannot be empty');
  if (trimmed.length > PROJECT_LIMITS.nameLength) throw new Error('Diagram name is too long');
  if (!bodyWithinLimit(body)) throw new Error(`Diagram body exceeds ${PROJECT_LIMITS.bodyBytes} bytes`);
  const project = await getProject(projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);
  const timestamp = nowIso();
  const diagram: StoredDiagram = {
    id: newId(),
    projectId,
    name: trimmed,
    kind: 'text',
    body,
    createdAt: timestamp,
    updatedAt: timestamp,
    family: readDiagramHeader(body).family,
  };
  const nextProject = { ...project, updatedAt: timestamp, activeDiagramId: diagram.id };
  const session = { activeProjectId: projectId, activeDiagramId: diagram.id };
  if (useMemoryBackend()) {
    const memory = getMemoryBackend();
    memory.diagrams.set(diagram.id, diagram);
    memory.projects.set(nextProject.id, nextProject);
    memory.session = session;
  } else {
    await withStores([STORE_DIAGRAMS, STORE_PROJECTS, STORE_META], 'readwrite', (stores) => {
      stores[STORE_DIAGRAMS].put(diagram);
      stores[STORE_PROJECTS].put(nextProject);
      stores[STORE_META].put(session, META_SESSION_KEY);
    });
  }
  return diagram;
}

export async function deleteDiagram(id: string): Promise<void> {
  const diagram = await getDiagram(id);
  if (!diagram) throw new Error(`Diagram not found: ${id}`);
  const diagrams = await listDiagramsForProject(diagram.projectId);
  if (diagrams.length <= 1) {
    throw new Error('Cannot delete the last diagram in a project');
  }
  const project = await getProject(diagram.projectId);
  if (!project) throw new Error(`Project not found: ${diagram.projectId}`);
  const meta = await getSessionMeta();
  let nextActiveId = project.activeDiagramId;
  if (project.activeDiagramId === id || meta?.activeDiagramId === id) {
    nextActiveId = diagrams.find((d) => d.id !== id)?.id ?? null;
  }
  const nextProject = { ...project, updatedAt: nowIso(), activeDiagramId: nextActiveId };
  const nextSession = meta && meta.activeDiagramId === id && nextActiveId
    ? { activeProjectId: diagram.projectId, activeDiagramId: nextActiveId }
    : undefined;
  if (useMemoryBackend()) {
    const memory = getMemoryBackend();
    memory.diagrams.delete(id);
    memory.projects.set(nextProject.id, nextProject);
    if (nextSession) memory.session = nextSession;
  } else {
    await withStores([STORE_DIAGRAMS, STORE_PROJECTS, STORE_META], 'readwrite', (stores) => {
      stores[STORE_DIAGRAMS].delete(id);
      stores[STORE_PROJECTS].put(nextProject);
      if (nextSession) stores[STORE_META].put(nextSession, META_SESSION_KEY);
    });
  }
  await deleteRenderSnapshotsForDiagram(id);
}

export async function setActiveDiagram(projectId: string, diagramId: string): Promise<void> {
  const diagram = await getDiagram(diagramId);
  if (!diagram || diagram.projectId !== projectId) {
    throw new Error(`Diagram not found in project: ${diagramId}`);
  }
  const project = await getProject(projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);
  const nextProject = { ...project, family: diagram.family ?? readDiagramHeader(diagram.body).family, activeDiagramId: diagramId, updatedAt: nowIso() };
  const session = { activeProjectId: projectId, activeDiagramId: diagramId };
  if (useMemoryBackend()) {
    const memory = getMemoryBackend();
    memory.projects.set(nextProject.id, nextProject);
    memory.session = session;
  } else {
    await withStores([STORE_PROJECTS, STORE_META], 'readwrite', (stores) => {
      stores[STORE_PROJECTS].put(nextProject);
      stores[STORE_META].put(session, META_SESSION_KEY);
    });
  }
}

export async function loadSession(): Promise<{ project: Project; diagrams: StoredDiagram[]; activeDiagram: StoredDiagram } | null> {
  const meta = await getSessionMeta();
  const project = meta ? await getProject(meta.activeProjectId) : undefined;
  if (!meta || !project) {
    for (const candidate of await listProjects()) {
      const candidateDiagrams = await listDiagramsForProject(candidate.id);
      if (candidateDiagrams[0]) {
        const recovered = candidateDiagrams.find((d) => d.id === candidate.activeDiagramId) ?? candidateDiagrams[0];
        await putSessionMeta({ activeProjectId: candidate.id, activeDiagramId: recovered.id });
        if (candidate.activeDiagramId !== recovered.id) await putProject({ ...candidate, activeDiagramId: recovered.id });
        return { project: { ...candidate, activeDiagramId: recovered.id }, diagrams: candidateDiagrams, activeDiagram: recovered };
      }
    }
    return null;
  }
  const diagrams = await listDiagramsForProject(project.id);
  const activeDiagram = diagrams.find((d) => d.id === meta.activeDiagramId)
    ?? diagrams.find((d) => d.id === project.activeDiagramId)
    ?? diagrams[0];
  if (!activeDiagram) {
    // A torn write or manually corrupted session must not brick the app. Try any remaining
    // valid project before giving up, then leave a repaired session pointer behind.
    for (const candidate of await listProjects()) {
      const candidateDiagrams = await listDiagramsForProject(candidate.id);
      if (candidateDiagrams[0]) {
        const recovered = candidateDiagrams.find((d) => d.id === candidate.activeDiagramId) ?? candidateDiagrams[0];
        await putSessionMeta({ activeProjectId: candidate.id, activeDiagramId: recovered.id });
        if (candidate.activeDiagramId !== recovered.id) await putProject({ ...candidate, activeDiagramId: recovered.id });
        return { project: { ...candidate, activeDiagramId: recovered.id }, diagrams: candidateDiagrams, activeDiagram: recovered };
      }
    }
    return null;
  }
  if (project.activeDiagramId !== activeDiagram.id || meta.activeProjectId !== project.id || meta.activeDiagramId !== activeDiagram.id) {
    await putSessionMeta({ activeProjectId: project.id, activeDiagramId: activeDiagram.id });
  }
  return { project, diagrams, activeDiagram };
}
