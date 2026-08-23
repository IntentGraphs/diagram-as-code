// Real Worker entry point (what `new Worker(new URL(...))` in renderExecutors.ts targets).
//
// elkjs's bundled `elk-worker.min.js` submodule decides how to export itself with:
//   if (typeof document === 'undefined' && typeof self !== 'undefined') { <wire self.onmessage as a real worker script> }
//   else if (typeof module !== 'undefined' && module.exports) { module.exports = { Worker: FakeWorker } }
// On the main thread `document` exists, so it correctly takes the CJS-export branch that
// `elk.bundled.js` requires. Inside a *real* Web Worker there is no `document`, so it wrongly
// takes the "I am a standalone worker script" branch instead and never sets `module.exports`,
// leaving `require('./elk-worker.min.js').Worker` undefined — surfacing as
// "_Worker is not a constructor". Stubbing a truthy `document` here (before elkjs evaluates)
// keeps elkjs on its normal export path without touching elkjs or any layout/routing code.
//
// This has to happen in a separate file: ES module imports are hoisted ahead of any code in the
// importing module, so a statement placed before `import './renderWorker.js'` in the same file
// would still run after renderWorker.js's own dependency graph (including elkjs) has already
// evaluated. A dynamic import() is the only way to guarantee ordering here.
const workerGlobal = self as unknown as { window?: unknown; document?: unknown };
if (typeof workerGlobal.document === 'undefined') {
  workerGlobal.document = {};
}
if (typeof workerGlobal.window === 'undefined') {
  workerGlobal.window = self;
}

// The real handler is wired asynchronously (see above), but a message can arrive before that
// dynamic import resolves. A Worker's implicit message port does not replay messages posted
// before a listener is attached, so buffer anything that arrives first and replay it once
// renderWorker.js's own `self.onmessage` is in place.
const pending: MessageEvent[] = [];
self.onmessage = (event: MessageEvent) => pending.push(event);

import('./renderWorker.js')
  .then(() => {
    // renderWorker.js's own top-level code has already set the real `self.onmessage` by now.
    const realOnMessage = self.onmessage;
    for (const event of pending) realOnMessage?.call(self, event);
  })
  .catch((err) => console.error('[renderWorkerEntry] failed to load renderWorker.js', err));
