import { createRequire } from 'node:module';
import BpmnModeler from 'bpmn-js/lib/Modeler.js';

const require = createRequire(import.meta.url);
const camundaModdle = require('camunda-bpmn-moddle/resources/camunda.json');

/**
 * Imports the given XML through bpmn-js's real importer. Resolves silently if the XML is
 * valid enough for a real BPMN 2.0 tool to open; rejects otherwise. Requires a DOM
 * (see vitest.config.ts's jsdom environment) since bpmn-js builds an SVG canvas to import into.
 */
export async function importWithBpmnJs(xml: string): Promise<void> {
  await runImport(xml);
}

/**
 * Import through bpmn-js with the Camunda 7 moddle, then save XML back out so vendor
 * attributes can be asserted intact (not merely "schema-valid enough to open").
 */
export async function roundTripCamundaXml(xml: string): Promise<string> {
  return runImport(xml, { camunda: camundaModdle });
}

async function runImport(
  xml: string,
  moddleExtensions?: Record<string, unknown>,
): Promise<string> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const modeler = new BpmnModeler({
    container,
    ...(moddleExtensions ? { moddleExtensions } : {}),
  });
  try {
    const { warnings } = await modeler.importXML(xml);
    if (warnings.length > 0) {
      throw new Error(`bpmn-js reported warnings importing XML:\n${warnings.join('\n')}`);
    }
    const { xml: saved } = await modeler.saveXML({ format: false });
    return saved ?? '';
  } finally {
    modeler.destroy();
    container.remove();
  }
}
