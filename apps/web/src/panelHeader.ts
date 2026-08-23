export interface PanelHeaderHandle {
  el: HTMLDivElement;
  setTitle: (title: string) => void;
}

export function createPanelHeader(initialTitle: string, onClose: () => void): PanelHeaderHandle {
  const el = document.createElement('div');
  el.className = 'panel-header';

  const titleEl = document.createElement('span');
  titleEl.className = 'review-header panel-header-title';
  titleEl.textContent = initialTitle;

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'panel-close-btn';
  closeBtn.setAttribute('aria-label', 'Close panel');
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', () => onClose());

  el.append(titleEl, closeBtn);

  return {
    el,
    setTitle: (title: string) => {
      titleEl.textContent = title;
    },
  };
}
