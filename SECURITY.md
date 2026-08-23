# Security Policy

## Supported versions

| Version | Supported |
|---|---|
| Latest tagged release / `main` | Yes |

## Threat model

This project is a **local** TypeScript monorepo:

- Developers run the CLI (`npm run bpm -- …`) and the Vite web app on their own machines.
- Diagram source text and exported SVG/BPMN XML stay on the user’s machine unless they share those files.
- There is **no** multi-tenant server or hosted API in the current release.

The repository visibility and GitHub security settings are maintainer-controlled
operational concerns; verify them in GitHub rather than inferring them from this
file. Once the repository is public, treat all diagram text from strangers as
untrusted input.

## Maintainer-side GitHub controls

Maintainers should verify these controls on the `IntentGraphs/diagram-as-code` repository:

- Enable secret scanning and push protection under **Settings → Code security and analysis** before making the repository public. GitHub enables these controls for public repositories; if an organization policy or plan limitation prevents activation, document that as an explicit release exception.
- Enable Dependabot alerts and security updates, private vulnerability reporting, and branch protection for `main` with the required CI and CodeQL checks.
- Keep workflow permissions least-privilege. The default is `contents: read`; jobs must declare any additional permission locally and justify it in review.
- Prefer full-length commit-SHA pins for third-party actions. GitHub-maintained actions may use a major-version tag only as a maintained exception, with Dependabot and regular review keeping those tags current.

The strict production audit passes with 0 vulnerabilities after clean install. PptxGenJS remains the editable PPTX engine, while this workspace supplies the `image-size` dependency through the private, bounded `vendor/image-size-safe` compatibility package. The shim supports only the required raster-header compatibility surface, caps input at 8 MiB, rejects unsupported formats, and contains no vulnerable upstream parser implementation. The v1 exporter emits native vector shapes and does not accept user-provided raster images. If PptxGenJS changes its image-size API or the exporter begins accepting raster input, re-audit the shim before release.

**Hardening:**

- Node ids are restricted to a BPMN-safe identifier alphabet at parse time (`[A-Za-z_][A-Za-z0-9_.-]*`).
- Label and id values written into SVG / BPMN XML are XML-escaped.
- The web preview mounts SVG via `DOMParser` rather than assigning markup with `innerHTML`.
- `@bpm/validate` (and the CLI `validate` command) reject oversized inputs: max **100 000** source characters, **500** nodes, **1000** edges, and **10 000** node-edge layout-complexity units. The live runtime adapter applies the same guard before layout.

**Non-goals:** Camunda/production engine hardening, sandboxing of arbitrary third-party BPMN execution runtimes, and network exposure of the Vite dev server. Do not bind `vite`/`npm run dev` to a public interface.

## Reporting a vulnerability

Report vulnerabilities privately through [GitHub Security Advisories](https://github.com/IntentGraphs/diagram-as-code/security/advisories/new)
when the repository feature is enabled. If that route is unavailable, contact
the repository maintainers privately through GitHub; do not open a public issue
for an unfixed vulnerability.

Please include:

1. Affected version or commit SHA
2. Steps to reproduce
3. Impact (e.g. script execution in the preview, XML breakout, denial of service via layout)
