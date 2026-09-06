# AGENTS.md — Dadix

You are working in the Dadix monorepo (`https://github.com/0nhub/Dadix`).  
Read `docs/README.md` before changing architecture, persistence, window chrome, or the grid.

Human-facing docs are German; code identifiers are English. Prefer the docs over chat memory.

## Two products

| Product | Path | Persistence |
| --- | --- | --- |
| Web | `app/` Next.js :3000 + Express :6127 | PostgreSQL |
| Desktop | `dadix-desktop/` Tauri 2 | `crates/dadix-core` → SQLite `.dadix` + DuckDB RAM |

They share `app/src`. Desktop does **not** replace the web UI with a new shell.

## Required desktop path

```
app/src  →  bridge/callApi.ts  →  lib/dadix.ts invoke  →  dadix_*  →  dadix-core  →  SQLite / DuckDB
```

Do not invent a second grid (`dadix-desktop/src/components/workspace/` is legacy, unused by `App.tsx`).  
Do not present `tauri dev` as the product. The product is the built `Dadix.app`.  
Do not import `@tauri-apps/api` (or plugins) from `app/src`. Use `app/src/lib/desktopShell.ts` and `window.__dadix*`.

## Where to put work

- Project / query / source / save / lock / secrets → `crates/dadix-core`
- Thin IPC only → `dadix-desktop/src-tauri/src/lib.rs` + `src/lib/dadix.ts`
- HTTP-shaped mapping → `dadix-desktop/src/bridge/callApi.ts` + `map.ts`
- Visible UI → `app/src/components`, `app/src/lib`, `app/src/context`
- Web-only API → `app/server`

## Hard invariants (do not “fix”)

1. No Tauri/React/Next/Express deps in `dadix-core`.
2. No secrets in `.dadix` — only `credential_id`; OS keychain holds the secret.
3. No auto sibling `*.duckdb`. DuckDB is `:memory:` per open project.
4. Do not bind all file sources + `DESCRIBE` inside `open_project` (large CSV hang).
5. Saves: tmp → validate → replace. Unknown newer `format_version` → `UNSUPPORTED_NEWER_FORMAT`.
6. macOS traffic lights: hide **only** the three system buttons; never hide the superview; never `trafficLightPosition`; never `setFrame` the native titlebar to 44px. CSS bar is 44px with `padding-left: 92px`.
7. `ViewsSwitch` must call `useLanguage()` itself. Missing `locale` whitescreens WebKit.
8. Open URL: `openExternalUrl` / plugin-opener, not `window.open`. `data-field-action="openUrl"` must not open the record sheet.
9. Persist column width on `pointerup` only. Destructive menu items stay gray until hover.
10. `--config` for `tauri build` must keep `"frontendDist":"../dist"`.

## Doc map

| Topic | File |
| --- | --- |
| Index | `docs/README.md` |
| Architecture (binding) | `docs/ARCHITECTURE.md` |
| PR checklist | `docs/COMPATIBILITY.md` |
| Core | `docs/core.md` |
| Desktop shell | `docs/desktop.md` |
| Web | `docs/web.md` |
| Grid / events / locale | `docs/shared-ui.md` |
| Schema / fields | `docs/data-model.md` |
| Commands | `docs/bridge-and-commands.md` |
| Build | `docs/build.md` |
| QA protocol | `docs/qa.md` |
| Conventions | `docs/conventions.md` |
| Glossary | `docs/glossary.md` |
| Compact AI prompt | `docs/TECHNICAL_SPEC_AI.md` |

If a fact is not in those files, say so and only propose changes that fit this stack.
