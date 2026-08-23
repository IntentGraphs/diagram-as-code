# Releasing `bpm`

`bpm` is released as one repository. The npm workspaces are internal and are
not published as separate packages.

## Before tagging

Run the release checks from a clean checkout of the exact commit that will be
released:

```bash
npm ci
npm run validate:workflows
npm run check:style
npm run build
npm run test:coverage
npm run check:third-party-notices
npm audit --omit=dev
npx playwright install chromium
npm run test:e2e -w @bpm/web
git diff --check
git status --short
```

The release commit must be clean after these checks. Update `CHANGELOG.md` and
the release line in `docs/STATUS.md` to the exact tag being created. Choose a
new semantic-version tag; never move or reuse an existing release tag.

The public launch uses a new clean repository created from the verified
snapshot, so the public product starts at `v1.0.0`. The existing private
workspace history retains its earlier internal tags and is not copied into the
public repository.
The repository name and the product name are separate: the CLI, `.bpm` file
format, and `@bpm/*` package namespace can remain `bpm` even if the public
repository uses a broader name such as `diagram-as-code`.

## History gate

Making an existing private repository public exposes its reachable Git history,
not only the files in the latest commit. Before changing visibility, review
history for credentials, personal data, proprietary examples, and generated
artifacts. The staging workspace previously tracked generated domain-specific
examples; the clean public snapshot excludes them. If existing history is not
suitable for public exposure, publish a clean squashed snapshot in a new public
repository or perform an approved history rewrite before changing visibility.

## GitHub publication sequence

1. Push the verified `main` commit and the new tag.
2. Confirm the `ci` and CodeQL workflows pass for that commit and tag.
3. Enable GitHub Pages with **GitHub Actions** as the publishing source and
   verify the playground at `https://intentgraphs.github.io/diagram-as-code/`.
4. Before announcing the repository, enable or verify Dependabot alerts and
   security updates, secret scanning and push protection, private vulnerability
   reporting, and branch protection for `main` with the required checks.
5. Create the GitHub release as a draft first, attach any release assets, then
   publish it from the exact tag. Prefer immutable releases when available.

The repository is local-first: it has no hosted backend, account system,
workflow execution service, or default telemetry. Keep the README, `SECURITY.md`,
and [`AI-DATA-HANDLING.md`](AI-DATA-HANDLING.md) aligned with that boundary.
