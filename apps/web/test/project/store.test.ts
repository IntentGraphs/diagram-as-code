import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDefaultProject,
  createDiagram,
  deleteDiagram,
  importProjectBundle,
  loadSession,
  renameDiagram,
  renameProject,
  resetStoreForTests,
  setActiveDiagram,
  updateDiagramBody,
  updateDiagramXml,
} from '../../src/project/store.js';
import { PROJECT_BUNDLE_FORMAT, PROJECT_BUNDLE_VERSION } from '../../src/project/types.js';
import { initSession } from '../../src/project/session.js';
import { WORKSPACE_TOUR } from '../../src/project/starterProject.js';

const STARTER = 'task "Hello" as n1';

describe('project store', () => {
  beforeEach(async () => {
    await resetStoreForTests();
  });

  it('createDefaultProject creates one project with a main diagram', async () => {
    const { project, diagram } = await createDefaultProject(STARTER);
    expect(project.name).toBe('Untitled project');
    expect(diagram.name).toBe('main');
    expect(diagram.body).toBe(STARTER);
    expect(diagram.kind).toBe('text');
  });

  it('updateDiagramBody round-trips body text', async () => {
    const { diagram } = await createDefaultProject(STARTER);
    await updateDiagramBody(diagram.id, 'task "Updated" as n2');
    const session = await loadSession();
    expect(session?.activeDiagram.body).toBe('task "Updated" as n2');
  });

  it('persists a BPMN XML snapshot separately from the text source', async () => {
    const { diagram } = await createDefaultProject(STARTER);
    await updateDiagramXml(diagram.id, '<definitions id="live-editor"/>');
    const session = await loadSession();
    expect(session?.activeDiagram.body).toBe(STARTER);
    expect(session?.activeDiagram.diagramXml).toContain('live-editor');
  });

  it('rolls back related project and diagram writes when one transaction operation fails', async () => {
    const { diagram } = await createDefaultProject(STARTER);
    const originalPut = IDBObjectStore.prototype.put;
    let puts = 0;
    const putSpy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (...args) {
      puts += 1;
      if (puts === 2) throw new DOMException('Injected persistence failure', 'QuotaExceededError');
      return originalPut.apply(this, args);
    });

    await expect(updateDiagramBody(diagram.id, 'task "Should rollback" as n2'))
      .rejects.toThrow(/Injected persistence failure|transaction/i);
    putSpy.mockRestore();

    const session = await loadSession();
    expect(session?.activeDiagram.body).toBe(STARTER);
    expect(session?.project.updatedAt).toBe(session?.activeDiagram.updatedAt);
  });

  it('keeps saved content and tracks the active project family after a valid family change', async () => {
    const { diagram } = await createDefaultProject(STARTER);
    await updateDiagramBody(diagram.id, 'diagram: mindmap\nmindmap "Roadmap" as root');
    const session = await loadSession();
    expect(session?.activeDiagram.body).toContain('diagram: mindmap');
    expect(session?.activeDiagram.family).toBe('mindmap');
    expect(session?.project.family).toBe('mindmap');
  });

  it('renameDiagram updates the display name', async () => {
    const { diagram } = await createDefaultProject(STARTER);
    await renameDiagram(diagram.id, 'primary');
    const session = await loadSession();
    expect(session?.diagrams[0].name).toBe('primary');
  });

  it('renameProject updates the project name', async () => {
    const { project } = await createDefaultProject(STARTER);
    await renameProject(project.id, 'Operations');
    const session = await loadSession();
    expect(session?.project.name).toBe('Operations');
  });

  it('imports a project bundle as a new project and restores its replay source', async () => {
    const initial = await createDefaultProject(STARTER);
    const bundle = {
      format: PROJECT_BUNDLE_FORMAT,
      version: PROJECT_BUNDLE_VERSION,
      exportedAt: new Date().toISOString(),
      activeDiagramId: initial.diagram.id,
      project: initial.project,
      diagrams: [{
        id: initial.diagram.id,
        name: initial.diagram.name,
        kind: 'text' as const,
        source: STARTER,
        replaySource: 'positioning: manual\n\ntask "Frozen" as frozen at (40, 40)',
        diagramXml: '<definitions id="saved-visual-state"/>',
        diagramXmlOrigin: 'diagram-editor' as const,
        createdAt: initial.diagram.createdAt,
        updatedAt: initial.diagram.updatedAt,
      }],
    };

    const restored = await importProjectBundle(bundle);
    expect(restored.project.name).toBe('Untitled project');
    expect(restored.project.id).not.toBe(initial.project.id);
    expect(restored.activeDiagram.body).toContain('positioning: manual');
    expect(restored.activeDiagram.body).toContain('Frozen');
    expect(restored.activeDiagram.diagramXml).toContain('saved-visual-state');
    expect((await loadSession())?.activeDiagram.id).toBe(restored.activeDiagram.id);
  });

  it('deleteDiagram removes a diagram but not the last one', async () => {
    const { project, diagram } = await createDefaultProject(STARTER);
    await expect(deleteDiagram(diagram.id)).rejects.toThrow(/last diagram/);
    const second = await createDiagram(project.id, 'alt', 'task "Alt" as n3');
    await deleteDiagram(diagram.id);
    const session = await loadSession();
    expect(session?.diagrams).toHaveLength(1);
    expect(session?.activeDiagram.id).toBe(second.id);
  });

  it('initSession bootstraps once then reloads stored session', async () => {
    const first = await initSession(STARTER);
    await updateDiagramBody(first.activeDiagram.id, 'task "Persisted" as n9');
    const second = await initSession('ignored on reload');
    expect(second.activeDiagram.body).toBe('task "Persisted" as n9');
  });

  it('creates the Workspace Tour only for a fresh session', async () => {
    const first = await initSession(WORKSPACE_TOUR);
    expect(first.project.name).toBe('IntentGraphs Workspace Tour');
    expect(first.diagrams.map((diagram) => diagram.name)).toEqual(WORKSPACE_TOUR.diagrams.map((diagram) => diagram.name));
    expect(first.activeDiagram.id).toBe(first.diagrams[0].id);

    await updateDiagramBody(first.activeDiagram.id, 'task "Existing project" as existing');
    const second = await initSession(WORKSPACE_TOUR);
    expect(second.project.name).toBe('IntentGraphs Workspace Tour');
    expect(second.diagrams).toHaveLength(WORKSPACE_TOUR.diagrams.length);
    expect(second.activeDiagram.body).toContain('Existing project');
  });

  it('tracks the selected diagram family without making Diagram mode available to non-BPMN text', async () => {
    const { project, diagram } = await createDefaultProject(STARTER);
    const mindmap = await createDiagram(project.id, 'mindmap', 'diagram: mindmap\nmindmap "Root" as root');
    await setActiveDiagram(project.id, mindmap.id);
    const session = await loadSession();
    expect(session?.activeDiagram.id).toBe(mindmap.id);
    expect(session?.activeDiagram.family).toBe('mindmap');
    expect(session?.project.family).toBe('mindmap');

    await setActiveDiagram(project.id, diagram.id);
    expect((await loadSession())?.project.family).toBe('bpmn');
  });

  it('recovers when persisted session metadata points at a missing diagram', async () => {
    const { project, diagram } = await createDefaultProject(STARTER);
    const request = indexedDB.open('bpm-projects');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('meta', 'readwrite');
      tx.objectStore('meta').put({ activeProjectId: project.id, activeDiagramId: 'missing' }, 'session');
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    });

    const session = await loadSession();
    expect(session?.activeDiagram.id).toBe(diagram.id);
    expect(session?.project.activeDiagramId).toBe(diagram.id);
  });

  it('ignores a malformed persisted diagram instead of returning unsafe content', async () => {
    const { project, diagram } = await createDefaultProject(STARTER);
    const request = indexedDB.open('bpm-projects');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('diagrams', 'readwrite');
      tx.objectStore('diagrams').put({ ...diagram, body: { unexpected: true } });
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    });

    const session = await loadSession();
    expect(session).toBeNull();
  });
});
