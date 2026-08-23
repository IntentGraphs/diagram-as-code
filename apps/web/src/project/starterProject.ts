import { validateDiagramSource } from '@bpm/diagram-runtime';
import type { ProjectSeed } from './types.js';

/**
 * The first-run workspace is a compact product tour. Keeping these sources in a named module
 * makes the public onboarding surface reviewable and keeps application bootstrapping small.
 */
export const WORKSPACE_TOUR: ProjectSeed = {
  name: 'IntentGraphs Workspace Tour',
  diagrams: [
    {
      name: '01 Workspace Overview',
      body: [
        'event start none "Open" as start',
        'task "Choose diagram" as choose',
        'task "Edit text" as edit',
        'task "Render preview" as render',
        'task "Inspect result" as inspect',
        'event end none "Share" as done',
        '',
        'start -> choose',
        'choose -> edit',
        'edit -> render',
        'render -> inspect',
        'inspect -> done',
      ].join('\n'),
    },
    {
      name: '02 Text to Render',
      body: [
        'event start none "Write diagram source" as start',
        'task "Parse source" as parse',
        'task "Validate syntax" as syntax',
        'task "Layout diagram" as layout',
        'event end none "Render SVG preview" as done',
        '',
        'start -> parse',
        'parse -> syntax',
        'syntax -> layout',
        'layout -> done',
      ].join('\n'),
    },
    {
      name: '03 Validate and Repair',
      body: [
        'event start none "Create or generate source" as start',
        'task "Validate syntax" as syntax',
        'task "Validate BPMN structure" as structure',
        'task "Check geometry" as geometry',
        'gateway exclusive "Issues found?" as issues',
        'task "Repair" as repair',
        'task "Verify again" as verify',
        'event end none "Ready" as done',
        '',
        'start -> syntax',
        'syntax -> structure',
        'structure -> geometry',
        'geometry -> issues',
        'issues => repair : "yes"',
        'repair -> verify',
        'verify -> done',
        'issues => done : "no"',
      ].join('\n'),
    },
    {
      name: '04 Diagram Editor Handoff',
      body: [
        'event start none "Open BPMN Diagram Editor" as start',
        'task "Edit visually" as edit',
        'task "Export BPMN XML" as xml',
        'task "Preview Import to Text" as preview',
        'task "Confirm source update" as confirm',
        'event end none "Review text" as done',
        '',
        'start -> edit',
        'edit -> xml',
        'xml -> preview',
        'preview -> confirm',
        'confirm -> done',
      ].join('\n'),
    },
    {
      name: '05 Export Handoff',
      body: [
        'event start none "Validated source" as start',
        'gateway exclusive "Choose output" as choose',
        'task "SVG preview" as svg',
        'task "BPMN 2.0 XML" as xml',
        'task "Editable PowerPoint" as pptx',
        'task "CLI-only DOCX" as docx',
        'task "Share selected artifact" as share',
        'event end none "Done" as done',
        '',
        'start -> choose',
        'choose => svg : "SVG"',
        'choose => xml : "BPMN XML"',
        'choose => pptx : "PPTX"',
        'choose => docx : "DOCX"',
        'svg -> share',
        'xml -> share',
        'pptx -> share',
        'docx -> share',
        'share -> done',
      ].join('\n'),
    },
    {
      name: '06 AI Agent Loop',
      body: [
        'event start none "Describe diagram" as start',
        'task "Optional provider draft" as draft',
        'task "Validate" as validate',
        'gateway exclusive "Issues found?" as issues',
        'task "Repair or review" as repair',
        'task "Verify" as verify',
        'task "Insert explicitly" as insert',
        'event end none "Done" as done',
        '',
        'start -> draft',
        'draft -> validate',
        'validate -> issues',
        'issues => repair : "yes"',
        'repair -> verify',
        'issues => verify : "no"',
        'verify -> insert',
        'insert -> done',
      ].join('\n'),
    },
  ],
};

/** Run the same parse → layout → geometry validation used by the CLI and editor pipeline. */
export async function validateProjectSeed(seed: ProjectSeed): Promise<void> {
  for (const diagram of seed.diagrams) {
    const result = await validateDiagramSource(diagram.body);
    if (!result.valid) {
      const details = [...result.errors, ...result.semanticErrors].map((issue) => issue.message).join('; ');
      throw new Error(`Starter diagram "${diagram.name}" is invalid: ${details}`);
    }
  }
}
