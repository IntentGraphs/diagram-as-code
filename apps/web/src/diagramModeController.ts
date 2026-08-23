import { createModeler, exportSvg, exportXml, fitDiagram, getModeler, importXml, markDiagramSaved, newDiagram, verifyExportedXml, zoomIn, zoomOut } from './diagramMode.js';
import { downloadFile } from './downloads.js';
import { createBpmnJsAdapter } from './agent/bpmnJsAdapter.js';
import type { DiagramAgentAdapter } from './agent/diagramAgent.js';

export interface DiagramModeControllerOptions {
  canvas: HTMLDivElement;
  errorsEl: HTMLDivElement;
  setButtonsEnabled: (enabled: boolean) => void;
  onZoomChange?: (zoom: number) => void;
  onDirtyChange?: (dirty: boolean) => void;
}

export interface DiagramModeController {
  createModeler(): void;
  setButtonsEnabled(enabled: boolean): void;
  newDiagram(): Promise<void>;
  loadXml(xml: string): Promise<void>;
  getXml(): Promise<string>;
  exportXmlFile(): Promise<void>;
  exportSvgFile(): Promise<void>;
  zoomIn(): void;
  zoomOut(): void;
  fitDiagram(): void;
  renderErrors(messages: string[]): void;
  getAgentAdapter(): DiagramAgentAdapter;
}

export function createDiagramModeController(options: DiagramModeControllerOptions): DiagramModeController {
  function renderErrors(messages: string[]): void {
    options.errorsEl.replaceChildren();
    for (const message of messages) {
      const item = document.createElement('div');
      item.className = 'error-item';
      item.textContent = message;
      options.errorsEl.append(item);
    }
  }

  async function loadXml(xml: string): Promise<void> {
    try {
      const warnings = await importXml(xml);
      renderErrors(warnings);
      options.setButtonsEnabled(true);
    } catch (error) {
      renderErrors([error instanceof Error ? error.message : String(error)]);
      options.setButtonsEnabled(false);
      throw error;
    }
  }

  async function exportXmlFile(): Promise<void> {
    try {
      const xml = await exportXml();
      const integrity = await verifyExportedXml(xml);
      if (!integrity.ok) {
        renderErrors(['Export blocked — the exported XML failed an integrity check:', ...integrity.issues]);
        return;
      }
      downloadFile('diagram.bpmn', xml, 'application/xml');
      markDiagramSaved();
    } catch (error) {
      renderErrors([error instanceof Error ? error.message : String(error)]);
      throw error;
    }
  }

  async function exportSvgFile(): Promise<void> {
    try {
      const svg = await exportSvg();
      downloadFile('diagram.svg', svg, 'image/svg+xml');
    } catch (error) {
      renderErrors([error instanceof Error ? error.message : String(error)]);
      throw error;
    }
  }

  return {
    createModeler() {
      createModeler(options.canvas, options.onZoomChange, options.onDirtyChange);
    },
    setButtonsEnabled: options.setButtonsEnabled,
    async newDiagram() {
      try {
        await newDiagram();
        renderErrors([]);
        options.setButtonsEnabled(true);
      } catch (error) {
        renderErrors([error instanceof Error ? error.message : String(error)]);
      }
    },
    loadXml,
    getXml: exportXml,
    exportXmlFile,
    exportSvgFile,
    zoomIn,
    zoomOut,
    fitDiagram,
    renderErrors,
    getAgentAdapter() {
      return createBpmnJsAdapter(getModeler());
    },
  };
}
