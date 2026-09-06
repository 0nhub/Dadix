# Dadix Architecture Directive

Vollständige Repo-Doku (Struktur, UI, Commands, Build, QA, AI): [README.md](./README.md).  
PR-Checkliste: [COMPATIBILITY.md](./COMPATIBILITY.md). Konventionen: [conventions.md](./conventions.md). Agent-Vertrag: [../AGENTS.md](../AGENTS.md).

Dadix is a local-first data platform. The desktop app must run fully offline on Windows, macOS, and Linux. Network features are extensions and must never be required for local use.

This document is binding for new work. Web (`app/`) remains the browser/cloud line. Desktop (`dadix-desktop/`) is the Tauri 2 line. Do not embed Next.js or Express inside the `.exe`.

Required desktop path (do not invent a second shell):

```
app/src (shared React UI)
  → dadix-desktop/src/bridge/callApi.ts
  → dadix-desktop/src/lib/dadix.ts
  → Tauri dadix_* commands
  → crates/dadix-core
  → SQLite (.dadix) + DuckDB (:memory:)
```

## Target stack

```
React + TypeScript + Vite
        ↓
     Tauri 2
        ↓
    Rust Core
        ↓
 SQLite (.dadix) + DuckDB (:memory:)
```

Not the long-term desktop stack: Electron, Chromium bundled, Node as runtime, Express, a local HTTP server, Sequelize, or a local PostgreSQL install.

```
┌─────────────────────────────────────────┐
│                 DADIX UI                │
│         React / TypeScript / WebView    │
├─────────────────────────────────────────┤
│                 TAURI 2                 │
├─────────────────────────────────────────┤
│                RUST CORE                │
│  Projekte │ Connectoren │ Jobs │ API    │
├──────────────────┬──────────────────────┤
│     SQLite       │       DuckDB         │
│  .dadix-Datei    │  Query / Federation  │
│  Metadaten, CRUD │  CSV / Parquet / SQL │
└──────────────────┴──────────────────────┘
```

## 1. Desktop runtime

- Use **Tauri 2** (WebView2 on Windows; system WebView on macOS/Linux).
- Reuse existing React/TypeScript UI where possible. Next.js SSR and Next API routes are not part of the desktop architecture.
- Express and a locally started Node server must disappear from the desktop product over time.

## 2. Rust Core

Application logic lives outside the UI. [`crates/dadix-core`](../crates/dadix-core) owns:

- Project files, filesystem, data sources, queries
- Mutations, transforms, import/export
- Jobs, automations, API calls
- Permissions, secrets
- SQLite and DuckDB

The UI must not talk to SQLite or DuckDB directly. Project logic lives in [`crates/dadix-core`](../crates/dadix-core). Tauri commands in [`dadix-desktop/src-tauri/src/lib.rs`](../dadix-desktop/src-tauri/src/lib.rs) are thin adapters only. The core has no Tauri, React, Next.js, or Express dependencies.

Public lifecycle (CLI-ready): `create_project`, `open_project`, `close_project`, `save_project`, `migrate_project`, `validate_project`. Relink: `missing_sources`, `relink_source`. Queries: `execute_query`, `cancel_query`, `explain_query`. Errors are `DadixError` with a stable `ErrorCode`. Source paths resolve through `resolve_source_path` (`embedded` | `relative` | `absolute`).

## 3. `.dadix` project file

A project is one portable document, e.g. `Controlling.dadix`.

Technically it is a **SQLite** database with a custom extension. SQLite is the application file format: one file, no server, transactional, cross-platform.

It stores project metadata, local Dadix tables, views, jobs, settings, and **connections** to data. Large files and servers stay external (linked). `format_version` is the migration key. Current version is **3** (`project_id`, `updated_at`, `app_version`, `minimum_reader_version`). Relative source URIs are stored as `./data/umsatz.csv` against the project folder.

Saves go `file → file.tmp → validate → atomic replace`. Critical migrations write `file.bak` first. A sibling lock file prevents two writers. Newer `format_version` values return `UNSUPPORTED_NEWER_FORMAT` and are not rewritten.

Source kinds: `embedded_table` | `embedded_file` | `linked_file` | `external_database`. Missing linked files are listed and can be relinked one source at a time.

Secrets (passwords, tokens) must **not** live in the file. Store a [`CredentialRef`](../crates/dadix-core/src/domain.rs) only (`credential_id`). The OS store holds the secret: Windows Credential Manager, macOS Keychain, Linux Secret Service. `dadix-core` rejects secret keys in settings, source options, and URIs (`user:password@host`).

## 4. SQLite vs DuckDB

| Engine | Role |
| --- | --- |
| **SQLite** | `.dadix` document, metadata, local CRUD, settings, small/medium local tables |
| **DuckDB** | Analytics, large scans, aggregations, JOINs, CSV/Parquet, attached DBs, federated queries |

Both are embedded. No separate database server.

```
SQLite = Control Plane (.dadix, metadata, local CRUD)
DuckDB = Data Plane (analytics queries, in-memory session)
```

Opening a project starts a `QuerySession` on DuckDB `:memory:`. Dadix does **not** write a sibling `Projekt.duckdb`. Persistent DuckDB files can become an explicit source later. SQL runs only in `dadix-core` (`QueryEngine` / `DuckDbQueryEngine`). Results are columnar (`QueryPayload`) so Arrow IPC can replace the payload later; do not lock the architecture to `Vec<Vec<String>>` JSON rows. Default chunk size is 1_000 rows (hard max 10_000). Queries have IDs, bound parameters, cancellation, and structured `QUERY_*` errors.

## 5. Data sources

Dadix is not bound to one database. Sources are a generic abstraction (`connect`, `query`, `insert`, `capabilities`, …). File sources (CSV/TSV/Parquet/JSON/NDJSON) scan in place. External databases use a connector per source (`sqlite` / `postgresql` / `mysql` / `sqlserver`) with an optional `credential_id`. Phase 6 does **not** federate across engines; that is Phase 7.

Distinguish:

- **Local table** — data belongs to the `.dadix` file
- **External source** — Dadix works on the original file or server (no mandatory import)

Phase 5 file sources (`csv` / `tsv` / `parquet` / `json` / `ndjson`) are `linked_file` (or `embedded_file`) entries. Opening a project registers DuckDB views over the original path (`read_csv_auto` / `read_parquet` / `read_json_auto`). The file is not copied into `.dadix`. Preview and SQL go through `QueryEngine` with the usual chunk limit. Safe write-back (temp → validate → replace) is not in this phase.

Path modes: `embedded` | `absolute` | `relative`. Relative links keep a folder portable (`Controlling.dadix` + `Daten/Kosten.csv`). Relink when a file moves.

CSV is not a transactional database. Writes: read → edit → temp file → validate → atomic replace.

## 6. External databases (Phase 6)

```
Source → Connector → Connection → Query / Schema / Tables / Columns
Dadix → CredentialRef → OS credential store
```

Each source is queried separately on its own engine (no import into DuckDB). Dialects are selected via `ConnectorCapabilities` (pagination, parameter style, cancel, TLS) — not scattered engine checks. SQL Server TLS is required; `trust_server_certificate` defaults to false and is opt-in per source. Socket cancel discards the connection and reconnects. ODBC and DuckDB federation stay in Phase 7.

## 7. Federated queries (later)

DuckDB can attach PostgreSQL, MySQL, SQLite and query CSV/Parquet in place. SQL Server/Oracle via ODBC later. The UI still shows tables; the engine joins sources.

## 8. APIs as sources (later)

REST/HTTP become tables (`rebuy.products`) with URL, method, headers, auth reference, mapping, refresh. Same grid as local data.

## 9. Performance

Never push millions of rows through JSON → IPC → React → DOM.

- Filter, sort, aggregate, project, join in the core
- Paginate / chunk (hundreds to a few thousand rows)
- Virtualize the grid (visible rows only)
- Prefer binary/columnar transfers over huge JSON later

## 10. Background execution (later)

`dadix-core` is shared by Desktop, CLI, and optional `dadixd` (scheduler, sync, webhooks) without a GUI. Do not bury job logic inside React.

## 11. Offline first

Must work without network: open project, tables, edit, views, filters, local files, local DBs, transform, import/export. Only truly external features may require the network.

## 12. Migration phases

| Phase | Status | Content |
| --- | --- | --- |
| 1 | Done | Tauri 2 + Vite UI, SQLite `.dadix`, file type, schema stubs for sources/jobs |
| 2 | Done | Cargo workspace `dadix-core`; lifecycle, `DadixError`, path resolution |
| 3 | Done | Portable `.dadix` format: atomic save, sequential migrations, lock, relink |
| 4 | Done | DuckDB query engine (`:memory:` session, chunks, cancel) |
| 5 | Done | File sources: CSV/JSON/Parquet scanned in place (no import). 18.8 GB CSV: register 116 ms, first preview 90 ms, COUNT 6.3 s, peak RSS 437 MB, `.dadix` 0.07 MB |
| 6 | Implementation complete / validation pending | ✓ SQLite · ✓ PostgreSQL · □ MySQL live · □ SQL Server clinic (`mkn-mssql-exp`). No further Phase-6 feature work. Close only after both remaining live tests are green, then start Phase 7 |
| 7 | Later | Federation: push down filters/aggregations remotely; DuckDB only joins the reduced result sets |
| 8 | Later | REST/HTTP sources |
| 9 | Later | Job engine + optional `dadixd` |

## 13. Two products in this repo

- [`crates/dadix-core`](../crates/dadix-core) — Rust project core (CLI-ready; no GUI stack).
- [`app/`](../app/) — Next.js + Express for browser/cloud, and the shared React UI. Do not grow `localStorage` as real persistence. Do not import Tauri APIs here.
- [`dadix-desktop/`](../dadix-desktop/) — Tauri 2 desktop shell. Thin commands only; all project logic stays in `dadix-core`.

The product UI is `app/src` mounted from `dadix-desktop/src/App.tsx`. Desktop maps Express-shaped `callApi` to `dadix_*` invokes (`src/bridge/`). Express itself does not run inside the `.app`. The leftover tree `dadix-desktop/src/components/workspace/` is not the product path.
