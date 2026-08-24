import BpmnModeler from 'bpmn-js/lib/Modeler.js';
import BpmnViewer from 'bpmn-js/lib/Viewer.js';
import 'bpmn-js/dist/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-js.css';
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn.css';

let modeler: BpmnModeler | null = null;
let dirty = false;
let onZoomChange: ((zoom: number) => void) | undefined;
let onDirtyChange: ((dirty: boolean) => void) | undefined;

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 12;

type CanvasApi = {
  zoom: (newScale?: number | 'fit-viewport', center?: { x: number; y: number }) => number;
};

function setDirty(nextDirty: boolean): void {
  if (dirty === nextDirty) return;
  dirty = nextDirty;
  onDirtyChange?.(dirty);
}

function notifyZoomChange(): void {
  if (modeler) onZoomChange?.(requireModeler().get<CanvasApi>('canvas').zoom());
}

/**
 * DI-related namespace prefixes. A diagram legitimately omits a prefix's declaration when nothing
 * in it uses that prefix (e.g. a single node with no edges never emits `di:waypoint`, so omitting
 * `xmlns:di` is valid, not corruption) — the actual "namespace loss" failure mode from
 * Earlier Diagram-mode XML corruption reports involved content using a prefix whose
 * declaration went missing.
 */
const DI_NAMESPACE_PREFIXES = ['dc', 'di', 'bpmndi'];

export interface XmlIntegrityResult {
  ok: boolean;
  issues: string[];
}

interface RegistryElement {
  id: string;
  type?: string;
  label?: unknown;
}

/**
 * Corruption safety net for a historical Diagram-mode XML issue: bpmn-js's DI overlay is a documented
 * corruption vector (namespace loss on re-export, waypoint/DI corruption causing edges to vanish
 * on re-import). This combines a cheap namespace check with a real round-trip: re-import the
 * exported XML into a scratch, detached viewer and diff its elements against the live model's.
 * Anything present live but missing after round-tripping through its own export is caught before it
 * reaches a downstream consumer such as the DSL importer.
 */
/** Pure, DOM-free check — the cheap first half of the safety net. Exported for direct unit testing. */
export function checkRequiredNamespaces(xml: string): string[] {
  const issues: string[] = [];
  for (const prefix of DI_NAMESPACE_PREFIXES) {
    const usesPrefix = new RegExp(`[<\\s]${prefix}:`).test(xml);
    const declaresPrefix = xml.includes(`xmlns:${prefix}=`);
    if (usesPrefix && !declaresPrefix) {
      issues.push(`XML uses the "${prefix}:" prefix but never declares "xmlns:${prefix}" — a namespace-loss corruption signature`);
    }
  }
  return issues;
}

export async function verifyExportedXml(xml: string): Promise<XmlIntegrityResult> {
  const issues: string[] = [...checkRequiredNamespaces(xml)];

  const scratchContainer = document.createElement('div');
  const scratch = new BpmnViewer({ container: scratchContainer });
  try {
    const { warnings } = await scratch.importXML(xml);
    for (const w of warnings) issues.push(`re-import warning: ${w}`);

    if (modeler) {
      const liveElements = requireModeler().get<{ getAll: () => RegistryElement[] }>('elementRegistry').getAll();
      const scratchIds = new Set(
        scratch.get<{ getAll: () => RegistryElement[] }>('elementRegistry').getAll().map((el) => el.id),
      );
      for (const el of liveElements) {
        if (el.label || el.type === 'label') continue; // label shapes don't round-trip 1:1 and carry no independent semantics
        if (!scratchIds.has(el.id)) {
          issues.push(`element "${el.id}" is present in the live diagram but missing after round-trip re-import`);
        }
      }
    }
  } catch (err) {
    issues.push(`re-import failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    scratch.destroy();
  }

  return { ok: issues.length === 0, issues };
}

export function createModeler(
  container: HTMLElement,
  zoomListener?: (zoom: number) => void,
  dirtyListener?: (dirty: boolean) => void,
): void {
  onZoomChange = zoomListener;
  onDirtyChange = dirtyListener;
  setDirty(false);
  modeler = new BpmnModeler({ container });
  modeler.on('commandStack.changed', () => {
    setDirty(true);
  });
  modeler.on('canvas.viewbox.changed', notifyZoomChange);
  notifyZoomChange();
}

export function destroyModeler(): void {
  modeler?.destroy();
  modeler = null;
  onZoomChange = undefined;
  onDirtyChange = undefined;
  dirty = false;
}

/** Returns the live BPMN.js modeler for web-editor-only integrations such as the diagram agent. */
export function getModeler(): BpmnModeler {
  return requireModeler();
}

export function hasUnsavedChanges(): boolean {
  return dirty;
}

/** Mark the current model as persisted only after the caller has completed its save path. */
export function markDiagramSaved(): void {
  setDirty(false);
  // A successful save is a meaningful status event even when the model was
  // already clean (for example, a freshly created diagram).
  onDirtyChange?.(false);
}

function requireModeler(): BpmnModeler {
  if (!modeler) throw new Error('Diagram mode is not active');
  return modeler;
}

function fitViewport(): void {
  requireModeler().get<CanvasApi>('canvas').zoom('fit-viewport');
  notifyZoomChange();
}

export function zoomIn(): void {
  const canvas = requireModeler().get<CanvasApi>('canvas');
  canvas.zoom(Math.min(MAX_ZOOM, canvas.zoom() * 1.2));
  notifyZoomChange();
}

export function zoomOut(): void {
  const canvas = requireModeler().get<CanvasApi>('canvas');
  canvas.zoom(Math.max(MIN_ZOOM, canvas.zoom() / 1.2));
  notifyZoomChange();
}

export function fitDiagram(): void {
  fitViewport();
}

export async function newDiagram(): Promise<void> {
  await requireModeler().createDiagram();
  setDirty(false);
  fitViewport();
}

export async function importXml(xml: string): Promise<string[]> {
  const { warnings } = await requireModeler().importXML(xml);
  setDirty(false);
  fitViewport();
  return warnings;
}

export async function exportXml(): Promise<string> {
  const { xml } = await requireModeler().saveXML({ format: true });
  return xml!;
}

export async function exportSvg(): Promise<string> {
  const { svg } = await requireModeler().saveSVG();
  return svg;
}
