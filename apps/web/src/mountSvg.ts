/**
 * Mount SVG markup into a container without assigning via innerHTML.
 * Returns false if the markup does not parse as an SVG root element.
 */
export function mountSvg(container: HTMLElement, svgMarkup: string): boolean {
  const doc = new DOMParser().parseFromString(svgMarkup, 'image/svg+xml');
  const root = doc.documentElement;
  if (
    !root
    || root.localName === 'parsererror'
    || doc.querySelector('parsererror')
    || root.localName.toLowerCase() !== 'svg'
  ) {
    return false;
  }
  container.replaceChildren(document.importNode(root, true));
  return true;
}
