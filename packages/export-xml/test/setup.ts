/**
 * jsdom does not implement CSS.escape, which bpmn-js/diagram-js uses when building the palette.
 */
if (typeof globalThis.CSS === 'undefined') {
  (globalThis as typeof globalThis & { CSS: { escape: (value: string) => string } }).CSS = {
    escape(value: string) {
      return String(value).replace(/[^\w-]/g, (char) => `\\${char}`);
    },
  };
}

/**
 * jsdom lacks SVGMatrix; tiny-svg references it when applying DI shape transforms.
 */
if (typeof globalThis.SVGMatrix === 'undefined') {
  (globalThis as typeof globalThis & { SVGMatrix: typeof SVGMatrix }).SVGMatrix = class SVGMatrix {
    a = 1;
    b = 0;
    c = 0;
    d = 1;
    e = 0;
    f = 0;
  } as typeof SVGMatrix;
}
