import { createDefaultProject, isStorageAvailable, loadSession, enableMemoryBackend } from './store.js';
import { validateProjectSeed } from './starterProject.js';
import type { ProjectSeed, SessionState } from './types.js';

export { isStorageAvailable };

export async function initSession(starter: string | ProjectSeed): Promise<SessionState> {
  if (!isStorageAvailable()) {
    enableMemoryBackend();
    const existing = await loadSession();
    if (existing) return existing;
    if (typeof starter !== 'string') await validateProjectSeed(starter);
    const { project, diagrams, activeDiagram } = await createDefaultProject(starter);
    return { project, diagrams, activeDiagram };
  }
  const existing = await loadSession();
  if (existing) return existing;
  if (typeof starter !== 'string') await validateProjectSeed(starter);
  const { project, diagrams, activeDiagram } = await createDefaultProject(starter);
  return { project, diagrams, activeDiagram };
}
