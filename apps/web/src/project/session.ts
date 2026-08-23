import { createDefaultProject, isStorageAvailable, loadSession, enableMemoryBackend } from './store.js';
import type { SessionState } from './types.js';

export { isStorageAvailable };

export async function initSession(starterBody: string): Promise<SessionState> {
  if (!isStorageAvailable()) {
    enableMemoryBackend();
    const existing = await loadSession();
    if (existing) return existing;
    const { project, diagram } = await createDefaultProject(starterBody);
    return { project, diagrams: [diagram], activeDiagram: diagram };
  }
  const existing = await loadSession();
  if (existing) return existing;
  const { project, diagram } = await createDefaultProject(starterBody);
  return { project, diagrams: [diagram], activeDiagram: diagram };
}
