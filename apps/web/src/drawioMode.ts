const DRAWIO_ORIGIN = 'https://embed.diagrams.net';

export interface DrawioModeControllerOptions {
  frame: HTMLIFrameElement;
  statusEl: HTMLElement;
  errorsEl: HTMLElement;
  onChange?: (xml: string) => void;
  onExit?: () => void;
}

export interface DrawioModeController {
  start(xml: string, title?: string): void;
  stop(): void;
  getXml(): string;
  isDirty(): boolean;
  markSaved(): void;
}

interface DrawioMessage {
  event?: string;
  action?: string;
  xml?: string;
  title?: string;
  modified?: boolean | string;
}

function parseMessage(data: unknown): DrawioMessage | undefined {
  if (typeof data !== 'string') return undefined;
  try {
    const message = JSON.parse(data) as unknown;
    return typeof message === 'object' && message !== null ? message as DrawioMessage : undefined;
  } catch {
    return undefined;
  }
}

/** Small host-side wrapper around the official diagrams.net embed-mode messaging protocol. */
export function createDrawioModeController(options: DrawioModeControllerOptions): DrawioModeController {
  let xml = '';
  let dirty = false;
  let title = 'Diagram';

  const post = (message: Record<string, unknown>): void => {
    options.frame.contentWindow?.postMessage(JSON.stringify(message), DRAWIO_ORIGIN);
  };

  const renderError = (message: string): void => {
    options.errorsEl.textContent = message;
  };

  const handleMessage = (event: MessageEvent): void => {
    if (event.source !== options.frame.contentWindow || event.origin !== DRAWIO_ORIGIN) return;
    const message = parseMessage(event.data);
    if (!message) return;
    if (message.event === 'configure') {
      post({ action: 'configure', config: {} });
      return;
    }
    if (message.event === 'init') {
      post({ action: 'load', autosave: 1, saveAndExit: '1', modified: 'unsavedChanges', xml, title });
      options.statusEl.textContent = 'Draw.io editor ready. Changes are held in this session until downloaded.';
      return;
    }
    if (message.event === 'save' || message.event === 'autosave') {
      if (typeof message.xml === 'string') {
        xml = message.xml;
        dirty = true;
        options.onChange?.(xml);
        options.statusEl.textContent = 'Unsaved draw.io changes. Download the .drawio file to keep them.';
      }
      return;
    }
    if (message.event === 'exit') {
      if (typeof message.xml === 'string') {
        xml = message.xml;
        options.onChange?.(xml);
      }
      options.onExit?.();
    }
  };

  options.frame.addEventListener('error', () => renderError('Could not load the embedded draw.io editor. Check network access or use the downloaded .drawio file.'));

  return {
    start(nextXml, nextTitle = 'Diagram') {
      xml = nextXml;
      title = nextTitle;
      dirty = false;
      renderError('');
      options.statusEl.textContent = 'Loading draw.io editor…';
      window.addEventListener('message', handleMessage);
      options.frame.hidden = false;
      options.frame.src = `${DRAWIO_ORIGIN}/?proto=json&spin=1&ui=min&libraries=1`;
    },
    stop() {
      window.removeEventListener('message', handleMessage);
      options.frame.hidden = true;
      options.frame.removeAttribute('src');
    },
    getXml() {
      return xml;
    },
    isDirty() {
      return dirty;
    },
    markSaved() {
      dirty = false;
      options.statusEl.textContent = 'Draw.io XML downloaded. You can continue editing in the embedded editor.';
    },
  };
}
