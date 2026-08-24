export interface ExportMenuItem {
  id: string;
  label: string;
  onClick: () => void;
}

export interface ExportMenuHandle {
  container: HTMLDivElement;
  button: HTMLButtonElement;
  setItems: (items: ExportMenuItem[]) => void;
  setDisabled: (disabled: boolean) => void;
}

export function createExportMenu(idPrefix: string, buttonLabel = 'Export'): ExportMenuHandle {
  const container = document.createElement('div');
  container.className = 'export-menu';

  const button = document.createElement('button');
  button.type = 'button';
  button.id = `${idPrefix}-btn`;
  button.className = 'toolbar-btn export-menu-btn icon-button';
  button.setAttribute('aria-label', buttonLabel);
  button.title = buttonLabel;
  button.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M8 2v8M5 7l3 3 3-3M3 12v2h10v-2" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="square" stroke-linejoin="round"/><path d="M11 2h2v2" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>';
  button.setAttribute('aria-haspopup', 'true');
  button.setAttribute('aria-expanded', 'false');
  button.disabled = true;

  const list = document.createElement('div');
  list.id = `${idPrefix}-list`;
  list.className = 'export-menu-list';
  list.hidden = true;

  let forceDisabled = false;
  let itemCount = 0;

  function closeMenu(): void {
    list.hidden = true;
    button.setAttribute('aria-expanded', 'false');
  }

  function openMenu(): void {
    if (button.disabled) return;
    list.hidden = false;
    button.setAttribute('aria-expanded', 'true');
  }

  button.addEventListener('click', () => {
    if (list.hidden) openMenu();
    else closeMenu();
  });

  document.addEventListener('click', (event) => {
    if (!container.contains(event.target as Node)) closeMenu();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeMenu();
  });

  container.append(button, list);

  function refreshDisabled(): void {
    button.disabled = forceDisabled || itemCount === 0;
  }

  function setItems(items: ExportMenuItem[]): void {
    list.replaceChildren();
    for (const item of items) {
      const itemBtn = document.createElement('button');
      itemBtn.type = 'button';
      itemBtn.id = item.id;
      itemBtn.className = 'export-menu-item';
      itemBtn.textContent = item.label;
      itemBtn.addEventListener('click', () => {
        closeMenu();
        item.onClick();
      });
      list.appendChild(itemBtn);
    }
    itemCount = items.length;
    refreshDisabled();
  }

  function setDisabled(disabled: boolean): void {
    forceDisabled = disabled;
    refreshDisabled();
    if (disabled) closeMenu();
  }

  return { container, button, setItems, setDisabled };
}
