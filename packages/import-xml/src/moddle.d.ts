/** bpmn-moddle ships no TypeScript types; this is a minimal ambient declaration covering what this package uses. */
declare module 'bpmn-moddle' {
  export interface ModdleElement {
    $type: string;
    id?: string;
    name?: string;
    $attrs?: Record<string, string>;
    [key: string]: unknown;
  }

  export interface ModdleWarning {
    message: string;
    [key: string]: unknown;
  }

  export interface FromXmlResult {
    rootElement: ModdleElement;
    references: unknown[];
    warnings: ModdleWarning[];
    elementsById: Record<string, ModdleElement>;
  }

  export default class BpmnModdle {
    constructor(options?: Record<string, unknown>);
    fromXML(xml: string): Promise<FromXmlResult>;
  }
}
