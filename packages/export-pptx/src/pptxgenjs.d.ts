declare module 'pptxgenjs' {
  namespace pptxgen {
    enum ShapeType { rect = 'rect', roundRect = 'roundRect', ellipse = 'ellipse', diamond = 'diamond', hexagon = 'hexagon', line = 'line' }
  }
  interface Slide { background: Record<string, unknown>; addShape(shape: unknown, options: Record<string, unknown>): void; addText(text: string, options: Record<string, unknown>): void; }
  class PptxGenJS { layout: string; author: string; subject: string; title: string; company: string; lang: string; addSlide(): Slide; write(options: Record<string, unknown>): Promise<Uint8Array>; }
  const PptxGenJS: typeof PptxGenJS;
  export = PptxGenJS;
}
