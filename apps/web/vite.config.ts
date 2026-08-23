import { defineConfig } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));

// GitHub Pages serves the org repo at https://<org>.github.io/<repo>/, so
// asset URLs need that repo-name prefix. Everywhere else (dev server, other
// deploy targets) the app is served from the domain root.
const base = process.env.GITHUB_PAGES === 'true' ? '/diagram-as-code/' : '/';

// Workspace packages normally resolve through their published `dist` entrypoint. During local
// development that makes a root build rewrite many files inside Vite's module graph, which looks
// like a stream of application changes and causes full reloads. Resolve every browser-facing local
// package to source instead, so generated build output is never part of the dev graph.
const workspaceSourceAliases = Object.fromEntries([
  'ast',
  'diagram-architecture',
  'diagram-core',
  'diagram-flowchart',
  'diagram-gantt',
  'diagram-mindmap',
  'export-drawio',
  'export-pptx',
  'export-xml',
  'import-xml',
  'layout',
  'layout-core',
  'layout-elk-base',
  'layout-engine-flat',
  'layout-engine-manual',
  'layout-engine-swimlane',
  'parser',
  'print-dsl',
  'render',
  'render-core',
  'validate',
  'diagram-runtime',
].map((name) => [`@bpm/${name}`, path.resolve(root, `../../packages/${name}/src/index.ts`)]));

export default defineConfig({
  base,
  resolve: {
    alias: {
      ...workspaceSourceAliases,
    },
  },
  server: {
    // Builds and tests still emit package dist files. They are artifacts, not browser source, and
    // must not trigger HMR/full-page reloads while `npm run dev` is running.
    watch: { ignored: ['**/dist/**'] },
  },
  optimizeDeps: {
    include: ['elkjs/lib/elk.bundled.js'],
  },
  build: {
    chunkSizeWarningLimit: 2400,
  },
});
