# Dadix Desktop

Local-first desktop app for Dadix. One project = one `.dadix` file (SQLite). No server required.

## Prerequisites

- [Node.js](https://nodejs.org/) (LTS)
- [Rust](https://www.rust-lang.org/tools/install)
- Platform-specific: [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)

## Development

```bash
npm install
npm run tauri dev
```

## Build

```bash
npm run tauri build
```

## Project structure

- `src/` – React UI (Vite + TypeScript)
- `src-tauri/` – Thin Tauri adapters only
- [`../crates/dadix-core`](../crates/dadix-core) – `.dadix` lifecycle and in-memory DuckDB `QueryEngine`

Data access runs in Tauri’s command thread pool, so the UI stays responsive while the database is used. The React UI must not query SQLite or DuckDB — only `dadix_*` commands via `src/lib/dadix.ts`. Those commands call `dadix-core`; they must not grow SQL or query logic. The SQL panel only sends `{ sql, limit }` and renders columnar chunks. Linked CSV/Parquet/JSON files are scanned in place by the core; the UI only calls `linkFile` / `previewSource`. External databases use `addDatabaseSource` / `executeSourceQuery`. Passwords go to the OS credential store; the `.dadix` file keeps only `credential_id`.

## Performance (Step 1 checklist)

- **Non-blocking UI:** All .dadix read/write is done in Tauri commands (thread pool), so the UI thread is not blocked.
- **Lazy loading:** Project meta and table list load on open; columns and views load when a table is selected; records load only for the current view.
- **Virtualized records:** The grid uses `@tanstack/react-virtual`; only visible rows (plus a small overscan) are rendered and fetched.
- **Minimal state:** No deep context chains; flat state per screen (project, tables, selected table, records slice).
- **No HTTP API:** The frontend calls Tauri commands; those commands call `dadix-core`.

## .dadix file format

A `.dadix` file is a SQLite document (`format_version` 3): project metadata (`project_id`, `created_at`, `updated_at`, `app_version`, `minimum_reader_version`), local tables, views, jobs, settings, and source links. Relative URIs are `./data/umsatz.csv` from the project folder. Large files stay external (`linked_file`). Saves are atomic (`.tmp` → validate → replace). A `.lock` file prevents two writers; newer formats return `UNSUPPORTED_NEWER_FORMAT`. Missing sources can be relinked in the UI.

## Recommended IDE setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
