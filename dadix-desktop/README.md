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
- `src-tauri/` – Rust backend: .dadix file (SQLite) open/create, schema, and Tauri commands

Data access runs in Tauri’s command thread pool, so the UI stays responsive while the database is used.

## Performance (Step 1 checklist)

- **Non-blocking UI:** All .dadix read/write is done in Tauri commands (thread pool), so the UI thread is not blocked.
- **Lazy loading:** Project meta and table list load on open; columns and views load when a table is selected; records load only for the current view.
- **Virtualized records:** The grid uses `@tanstack/react-virtual`; only visible rows (plus a small overscan) are rendered and fetched.
- **Minimal state:** No deep context chains; flat state per screen (project, tables, selected table, records slice).
- **No API layer:** In this version there is no HTTP API; the frontend calls Tauri commands that use SQLite directly.

## .dadix file format

A `.dadix` file is a SQLite database with tables: `project_meta`, `tables`, `columns`, `views`, `grid_view_columns`, `view_buttons`, and `records` (table_id, id, data JSON). Create or open a file via the app; the schema is created automatically for new files.

## Recommended IDE setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
