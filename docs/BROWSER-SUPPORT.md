# Browser and viewport support

The v1 web editor is a client-side application. The release gate runs the full browser suite in Chromium and exercises a 900×800 narrow desktop viewport, including toolbar wrapping, panel controls, preview fitting, Diagram mode, Gantt, and project persistence.

## Supported release target

- Chromium-based browsers matching the current Playwright CI browser.
- Desktop and tablet-sized viewports at or above 900 CSS pixels wide.
- Narrower screens may render, but are not a v1 support contract; use a desktop-sized viewport for the full split-pane editor.

Firefox, Safari/WebKit, and mobile-specific interaction behavior are not CI release gates yet. They remain follow-up compatibility work rather than promises in the v1 public README.

The application does not send diagram text to a server by default. See [`AI-DATA-HANDLING.md`](AI-DATA-HANDLING.md) for optional provider paths and [`SECURITY.md`](../SECURITY.md) for the local-app threat model.
