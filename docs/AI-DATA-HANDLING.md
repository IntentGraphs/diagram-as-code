# AI and Data Handling

This document describes the data paths in the browser editor and the optional AI providers. The application has no backend account system and no default telemetry or analytics collection.

## Provider choices

- **Offline providers:** The default Review and Generate modes are local, deterministic/offline helpers. They do not send diagram data over the network.
- **Ollama:** The Ollama provider defaults to `http://localhost:11434`. Requests go to the Ollama base URL configured by the user. This is local when Ollama is running on the same machine, but changing the base URL can send data to another host.
- **OpenAI-compatible:** The OpenAI / compatible provider defaults to `https://api.openai.com/v1` and can be pointed at another compatible endpoint. The endpoint receives the source text for review, generation/repair prompts, and the rendered diagram image for visual review. The endpoint, model, retention, and use of submitted data are governed by the provider selected by the user; this project does not make a blanket privacy promise for third-party endpoints.

Visual review rasterizes the current SVG in the browser and sends the resulting PNG as base64 image content. Text-only generation and repair send source text and structured diagnostics, but not the rendered image.

## Credentials and browser storage

The browser UI stores the OpenAI-compatible API key in `sessionStorage` by default (`bpm.review.apiKey`), so it is scoped to the current browser tab/session. Settings includes an explicit **Remember API key on this device** opt-in; only when enabled is the key stored in `localStorage` (`bpm.ai.apiKey`) and reused after refresh. Older keys written by earlier builds are migrated back to session-only storage when Settings first reads them. The configured base URL, model, provider choice, and editor preferences use browser `localStorage`; users should treat a custom endpoint URL as browser-persisted configuration.

Text-mode projects, diagrams, and successful render snapshots are persisted client-side in IndexedDB database `bpm-projects` (stores: `meta`, `projects`, `diagrams`, and `renders`). Render cache entries are keyed by project, diagram, source fingerprint, engine override, and renderer version; they are local performance data and are not uploaded by default. The application does not upload that project store by default. A user can nevertheless submit the current source or rendered image when explicitly invoking an AI provider.

## User responsibilities

Do not place confidential, personal, regulated, or third-party information in a prompt unless the selected provider and its terms permit that disclosure. Leave API-key persistence disabled on shared devices, clear the API-key field and browser storage when finished, and review the configured base URL before sending a request.

This is an implementation disclosure, not legal advice. Provider terms and privacy practices can change independently of this repository.
