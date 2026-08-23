import { getFamily, listFamilies } from '@bpm/diagram-runtime';
import type { DiagramFamilyId } from '@bpm/diagram-runtime';

export const CLI_COMMANDS = [
  'validate', 'render', 'export', 'review', 'fix', 'generate', 'import-diagram', 'freeze', 'capabilities',
] as const;

export type CliCommand = typeof CLI_COMMANDS[number];

export const CLI_COMMAND_ALIASES: Readonly<Record<string, CliCommand>> = {
  validate: 'validate',
  check: 'validate',
  render: 'render',
  export: 'export',
  review: 'review',
  fix: 'fix',
  generate: 'generate',
  'import-diagram': 'import-diagram',
  import: 'import-diagram',
  freeze: 'freeze',
  capabilities: 'capabilities',
};

export type CliOptionKind = 'boolean' | 'string' | 'positive-integer' | 'enum';

export interface CliOptionMetadata {
  readonly id: string;
  readonly flags: readonly string[];
  readonly kind: CliOptionKind;
  readonly commands: readonly CliCommand[];
  readonly description: string;
  readonly choices?: readonly string[] | (() => readonly string[]);
}

export interface CliCommandMetadata {
  readonly command: CliCommand;
  readonly aliases: readonly string[];
  readonly summary: string;
  readonly positional: 'file' | 'description' | 'none';
  readonly options: readonly string[];
}

const diagramCommands: readonly CliCommand[] = ['validate', 'render', 'export', 'review', 'fix', 'generate', 'freeze'];
const artifactCommands: readonly CliCommand[] = ['render', 'export', 'generate', 'import-diagram', 'freeze', 'fix'];

export const CLI_OPTIONS: readonly CliOptionMetadata[] = [
  { id: 'json', flags: ['--json'], kind: 'boolean', commands: CLI_COMMANDS, description: 'emit the stable machine-readable result on stdout' },
  { id: 'output', flags: ['-o', '--out', '--output'], kind: 'string', commands: artifactCommands, description: 'write the artifact atomically to this path' },
  { id: 'layout', flags: ['--engine', '--layout'], kind: 'string', commands: diagramCommands, description: 'override the layout engine when supported' },
  { id: 'target', flags: ['--target'], kind: 'string', commands: ['export'], description: 'select a structured export target' },
  { id: 'format', flags: ['--format'], kind: 'enum', commands: ['validate', 'render', 'export'], description: 'select output format', choices: ['text', 'json', 'sarif', 'svg', 'png'] },
  { id: 'provider', flags: ['--provider'], kind: 'string', commands: ['review', 'fix', 'generate'], description: 'select the AI provider' },
  { id: 'family', flags: ['--family'], kind: 'enum', commands: ['validate', 'generate'], description: 'select the diagram family (generation selector; source directives remain authoritative for validation)', choices: () => listFamilies() },
  { id: 'positioning', flags: ['--positioning'], kind: 'enum', commands: ['generate'], description: 'choose auto or manual generated positioning', choices: ['auto', 'manual'] },
  { id: 'manual', flags: ['--manual'], kind: 'boolean', commands: ['generate'], description: 'shortcut for --positioning manual' },
  { id: 'visual-review', flags: ['--visual-review'], kind: 'boolean', commands: ['generate'], description: 'run the bounded visual review loop after generation' },
  { id: 'max-visual-attempts', flags: ['--max-visual-attempts'], kind: 'positive-integer', commands: ['generate'], description: 'limit visual review passes' },
  { id: 'image-out', flags: ['--image-out'], kind: 'string', commands: ['review'], description: 'write the reviewed PNG' },
  { id: 'max-attempts', flags: ['--max-attempts'], kind: 'positive-integer', commands: ['review', 'fix', 'generate'], description: 'limit text repair passes' },
  { id: 'fix', flags: ['--fix'], kind: 'boolean', commands: ['review'], description: 'use the explicit write-oriented fix workflow' },
  { id: 'changed', flags: ['--changed'], kind: 'boolean', commands: ['validate'], description: 'check changed .bpm files from git' },
  { id: 'base', flags: ['--base'], kind: 'string', commands: ['validate'], description: 'git base/ref for --changed (default: HEAD)' },
];

const commandMetadataEntries: readonly CliCommandMetadata[] = [
  { command: 'validate', aliases: ['check'], summary: 'validate one diagram or changed .bpm files', positional: 'file', options: ['json', 'layout', 'format', 'family', 'changed', 'base'] },
  { command: 'render', aliases: [], summary: 'render SVG or PNG', positional: 'file', options: ['json', 'output', 'layout', 'format'] },
  { command: 'export', aliases: [], summary: 'export a structured artifact', positional: 'file', options: ['json', 'output', 'layout', 'target', 'format'] },
  { command: 'review', aliases: [], summary: 'read-only validation and visual review', positional: 'file', options: ['json', 'layout', 'provider', 'image-out', 'max-attempts', 'fix'] },
  { command: 'fix', aliases: [], summary: 'write an explicit repaired copy', positional: 'file', options: ['json', 'output', 'layout', 'provider', 'max-attempts'] },
  { command: 'generate', aliases: [], summary: 'generate a diagram from a description', positional: 'description', options: ['json', 'output', 'layout', 'provider', 'family', 'positioning', 'manual', 'visual-review', 'max-visual-attempts', 'max-attempts'] },
  { command: 'import-diagram', aliases: ['import'], summary: 'convert BPMN XML to .bpm text', positional: 'file', options: ['json', 'output'] },
  { command: 'freeze', aliases: [], summary: 'serialize resolved BPMN geometry as manual DSL', positional: 'file', options: ['json', 'output', 'layout'] },
  { command: 'capabilities', aliases: [], summary: 'show runtime family and export capabilities', positional: 'none', options: ['json'] },
];

export function canonicalCommand(value: string | undefined): CliCommand | undefined {
  return value ? CLI_COMMAND_ALIASES[value] : undefined;
}

export function commandMetadata(command: CliCommand): CliCommandMetadata {
  return commandMetadataList().find((entry) => entry.command === command) as CliCommandMetadata;
}

function commandMetadataList(): readonly CliCommandMetadata[] {
  return commandMetadataEntries;
}

export function optionMetadata(flag: string): CliOptionMetadata | undefined {
  return CLI_OPTIONS.find((option) => option.flags.includes(flag));
}

export interface CliFamilyCapability {
  id: DiagramFamilyId;
  svg: boolean;
  png: boolean;
  pptx: boolean;
  editorMode: string;
  engineOverride: boolean;
  ai: Record<string, boolean>;
  structuredExports: Array<Record<string, unknown>>;
}

export interface CliCapabilityRegistry {
  families: CliFamilyCapability[];
  exportFormats: string[];
}

export function runtimeCapabilities(): CliCapabilityRegistry {
  const families = listFamilies().map((id) => {
    const adapter = getFamily(id);
    return {
      id,
      svg: adapter.capabilities.svg,
      png: adapter.capabilities.png,
      pptx: adapter.capabilities.pptx === true,
      editorMode: adapter.capabilities.editorMode,
      engineOverride: adapter.capabilities.engineOverride,
      ai: { generation: false, repair: false, visualReview: false, geometryInspection: false, semanticValidation: false, ...(adapter.aiCapabilities ?? {}) },
      structuredExports: (adapter.capabilities.structuredExports ?? adapter.capabilities.structuredExport.map((format) => ({ format }))).map((entry) => ({ ...entry })),
    } satisfies CliFamilyCapability;
  });
  return {
    families,
    exportFormats: [...new Set(families.flatMap((family) => family.structuredExports.map((entry) => String(entry.format))))].sort(),
  };
}

export function optionChoices(option: CliOptionMetadata): readonly string[] {
  return typeof option.choices === 'function' ? option.choices() : option.choices ?? [];
}

export function renderCliHelp(command?: CliCommand): string {
  if (command) {
    const metadata = commandMetadata(command);
    const positional = metadata.positional === 'none' ? '' : metadata.positional === 'description' ? ' <description words...>' : ' <file|->';
    const optionUsage = (id: string): string => {
      const option = CLI_OPTIONS.find((entry) => entry.id === id);
      if (!option) return id;
      if (option.kind === 'boolean') return option.flags[0];
      const value = id === 'output' ? 'path'
        : id === 'layout' ? 'engine'
        : id === 'target' ? 'format'
        : id === 'provider' ? 'id'
        : id === 'family' ? 'family'
        : id === 'base' ? 'ref'
        : id === 'max-attempts' || id === 'max-visual-attempts' ? 'n'
        : id === 'image-out' ? 'path'
        : id === 'positioning' ? 'auto|manual'
        : id === 'format' ? command === 'render' ? 'svg|png' : command === 'validate' ? 'text|json|sarif' : 'format'
        : 'value';
      return `${option.flags[0]} <${value}>`;
    };
    const options = metadata.options.map(optionUsage).map((usage) => `[${usage}]`).join(' ');
    const aliases = metadata.aliases.length ? `\n       aliases: ${metadata.aliases.join(', ')}` : '';
    const choices = metadata.options.flatMap((id) => {
      const option = CLI_OPTIONS.find((entry) => entry.id === id);
      const values = id === 'format' && command === 'export' ? runtimeCapabilities().exportFormats
        : id === 'format' && command === 'render' ? ['svg', 'png']
        : id === 'format' && command === 'validate' ? ['text', 'json', 'sarif']
        : option ? optionChoices(option) : [];
      return values.length ? [`\n       ${option!.flags[0]} choices: ${values.join(', ')}`] : [];
    }).join('');
    return `usage: bpm ${command}${positional}${options ? ` ${options}` : ''}\n${metadata.summary}.${aliases}${choices}\n`;
  }
  const capabilities = runtimeCapabilities();
  const commands = commandMetadataList().map((entry) => `  ${entry.command.padEnd(16)}${entry.summary}`).join('\n');
  return `usage: bpm <command> <file|description> [options]\n\nCommands:\n${commands}\n\nAliases:\n  check          validate\n  import         import-diagram\n\nRuntime families: ${capabilities.families.map((family) => family.id).join(', ')}\nExport formats: ${capabilities.exportFormats.join(', ')}\n\nCommon options:\n  --json         emit machine-readable JSON on stdout\n  -o, --output   write an artifact atomically\n  --help, -h     show help\n  --version, -v  print the CLI version\n`;
}
