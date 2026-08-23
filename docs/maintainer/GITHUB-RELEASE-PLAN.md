# GitHub Release Plan

This workspace is prepared for a first public release in the IntentGraphs organization. The public repository will be created from a clean snapshot so the earlier private workspace history is not exposed.

## Target

- Organization: [IntentGraphs repositories](https://github.com/orgs/IntentGraphs/repositories)
- Repository: `IntentGraphs/diagram-as-code`
- Initial visibility: **public**
- Default branch: `main`
- Source of truth: this monorepo and its root `package-lock.json`; packages remain unpublished internal workspace packages.

## Current organization state

- Repository: [IntentGraphs/diagram-as-code](https://github.com/IntentGraphs/diagram-as-code), to be created from the clean public snapshot, with `main` as the default branch.
- Release: `v1.0.0` is the first public tag in the clean repository. The earlier private workspace tags are not copied into the public history.
- Repository metadata: the description is set and topics are `bpmn`, `diagram-as-code`, `diagramming`, `gantt`, `powerpoint`, `svg`, and `typescript`.
- Enabled: Issues, issue templates, pull-request template, Dependabot alerts/updates, and the repository CodeQL workflow.
- GitHub-side settings are not verified from this workspace. After the public repository is created, configure branch protection, secret scanning/push protection, private vulnerability reporting, and GitHub Pages according to the organization plan.

## Version 1 starting policy

The public repository starts on the **major-version-1 release line** with
`v1.0.0`. The existing private workspace retains its earlier internal tags;
they are not copied into the public repository.

## Mandatory public-v1 scope before the first push

The first public release is now blocked on five supported diagram families and one cross-cutting export capability:

- BPMN, mind maps, flowcharts, C4-style architecture, and bounded Gantt/project timelines.
- Editable PPTX export for all five families: native shapes/bars/milestones, editable text, and connectors where supported. PPTX is a visual presentation projection; BPMN XML remains the canonical semantic/round-trip export.
- Gantt v1 is text-first and deterministic: strict ISO date-only values, task groups, milestones, finish-to-start dependencies, cycle detection, a fixed weekday scheduling calendar, page-aware start/end distribution, presentation-only daily/weekly/fortnightly/monthly/quarterly/halfyear/auto timescales, SVG/PNG, JSON/CSV, and editable PPTX. Resource leveling, critical-path guarantees, baselines, holidays, timezones, drag scheduling, and Microsoft Project/Primavera interoperability are explicitly out of scope.

Required implementation dependencies are deliberately narrow: a new family-owned `packages/diagram-gantt` package with internal date-only arithmetic, a maintained PPTX writer, and the bounded CLI-only DOCX package now present in the integration snapshot. `date-fns`, Temporal polyfills, full Gantt renderers, Office APIs, native Word-shape authoring, and project-file parsers are not v1 dependencies. The recommended PPTX writer candidate is [`pptxgenjs`](https://github.com/gitbrent/PptxGenJS), subject to exact-version and license/notice review before installation. DOCX remains vector-backed SVG per page, not native Word shapes.

## Completion priority order

1. Freeze Gantt grammar/calendar semantics, editable-PPTX definition, source/round-trip boundaries, and deferred-family list.
2. Implement and register `@bpm/diagram-gantt`: parser, limits, date semantics, cycle validation, dedicated temporal layout, SVG/PNG/JSON/CSV, fixtures.
3. Implement `@bpm/export-pptx`: shared committed-snapshot exporter, family mappings, native editable objects, bounded pagination/scaling, and OOXML structural validation.
4. Integrate CLI/web capability metadata, downloads, project persistence, revision-safe exports, unsupported-action messaging, and bundle/performance controls.
5. Run cross-family acceptance for all five families, including invalid/oversized/long-label inputs, accessibility, export-failure dirty-state, and PPTX compatibility checks.
6. Close roadmap items 18g–18j and remaining public-source blockers: notices, resource budgets, persistence recovery, accessibility, workflow/runtime reproducibility, templates/security contact, and clean release-scope curation.
7. Run the final clean-install/build/coverage/audit/unit/E2E/OOXML/compatibility/CodeQL/dependency-review checks against one exact release commit, then refresh `CHANGELOG.md` and `docs/maintainer/HANDOFF.md`.
8. Create public `IntentGraphs/diagram-as-code` from the clean verified snapshot, configure repository controls, and tag the exact final green commit as `v1.0.0`.

## Deployment checklist

1. Create `IntentGraphs/diagram-as-code` as a public repository from the clean snapshot; do not initialize it with a second README, license, or `.gitignore`.
2. Verify the local tree is clean except for the intended release commit, then add the organization remote and push `main`.
3. Create the chosen v1 release tag from that exact commit and publish the matching GitHub release notes from `CHANGELOG.md`.
4. Configure protected `main`, required CI and CodeQL checks, Dependabot alerts/updates, private vulnerability reporting, and the organization’s issue/discussion policy.
5. In the repository’s **Settings → Code security and analysis**, enable secret scanning and push protection when the organization’s GitHub plan supports those controls for private repositories. These are maintainer-only settings; record any plan limitation as a release exception rather than implying the control is active.
6. Preserve least-privilege workflow permissions: workflows default to `contents: read`, and jobs request only the additional permission they need (CodeQL analysis uses `security-events: write`). Review new workflows for permission escalation before merging.
7. Use immutable full-length commit-SHA pins for third-party actions where practical. GitHub-maintained official actions may temporarily use a major-version tag (currently `@v3`/`@v4`) when Dependabot is enabled; maintainers must review action updates and replace stale or compromised versions promptly.
8. Confirm the third-party notices, bpmn.io watermark, AI data-handling disclosure, security policy, and release/support version are visible in the repository.
9. Set the repository description to `Text-first BPMN and multi-family diagramming with deterministic validation, Gantt timelines, and editable PowerPoint export` and add the topics `bpmn`, `diagram-as-code`, `diagramming`, `gantt`, `powerpoint`, `svg`, and `typescript`.
10. Enable GitHub Pages from Actions, verify the deployed playground, and confirm the README link resolves before changing visibility.
11. Verify the public repository, Pages site, security settings, and release tag before announcing the launch.

## Fresh-assessment pre-push gate

Before repository creation or the first push, the local release snapshot must pass the Gantt/PPTX/DOCX acceptance gates above and roadmap items 17e and 18g–18k: regenerate notices from the final clean install, validate generated PPTX as structured OOXML and generated DOCX as a valid ZIP/XML package with compatibility checks where available, verify workflow permissions/semantics, confirm the clean strict production audit, record that domain-specific staging examples are excluded from v1, confirm the README promise/limitations/quick-start content, refresh the handoff commit metadata, and record successful clean-install/build/coverage/audit/E2E checks against the same commit that receives the release tag. The screenshot and Pages verification are the remaining launch-surface gates.

## Current blocker

The current candidate still requires exact-snapshot local gates, CI, the local `v1.0.0` release tag, and owner-controlled GitHub settings. The clean snapshot is ready for repository creation; public visibility, push, and release publication remain explicit owner-controlled actions.
