# Contributing

Thanks for helping improve bpm. This document covers local development and contributions to the GitHub repository.

## Prerequisites

- Node.js **20+** (LTS)
- npm (workspaces; use the lockfile at the repo root)

## Setup

```bash
npm install
npm run build
npm test
npm run test:coverage
```

## Useful commands

```bash
# CLI validate / render / export
npm run bpm -- validate examples/getting-started/hello.bpm
npm run bpm -- --help

# Web editor
cd apps/web && npm run dev
```

CLI-only checks: [`docs/CLI.md`](docs/CLI.md).

## Package map

The monorepo is `packages/*` + `apps/web`. For the current package map and product
boundaries, start with [`docs/STATUS.md`](docs/STATUS.md) and the package READMEs.

## Supported development environment

The supported v1 development contract is Node.js 20–22 with npm 10 on a Unix-like environment (Linux CI is authoritative; macOS is used for maintainer verification). Windows support is not currently promised. Use `.nvmrc` and the root `package.json` engines as the source of truth.

## Formatting and style

The repository does not currently impose an opinionated formatter. The CI style gate checks authored source/config files for carriage returns and trailing whitespace; contributors should preserve the surrounding TypeScript style and run `npm run check:style` plus `git diff --check` before opening a pull request. Formatting conventions may evolve through the public roadmap and normal issue discussion.

## Large changes

For non-trivial features, explain the design and scope in the pull request, update the
relevant stable documentation, then verify with `npm test` and the focused CLI/web checks.
Release verification is documented in [`docs/RELEASING.md`](docs/RELEASING.md).

## Pull requests

- Keep PRs focused.
- CI must pass (`build`, thresholded `test:coverage`, production `npm audit`, E2E, dependency review, and CodeQL where applicable).
- Do not claim Diagram mode ↔ text sync, Camunda runtime deployment, or full BPMN legality enforcement unless those features are actually implemented and documented in `docs/STATUS.md`.
