# Compatibility checklist

Use this on every PR that touches Dadix (web or desktop). The full rules are in [ARCHITECTURE.md](./ARCHITECTURE.md).

## Must not

- Add business logic that can only live in Next.js API routes or Express
- Grow `localStorage` / demo fallbacks as real data storage
- Store passwords, tokens, or API keys inside a `.dadix` file or project JSON
- Load a full table into React (no `SELECT *` dumped to the UI)
- Require a network connection for open / edit / views / filters / local import-export
- Start or depend on a local Express/Node server inside the desktop app
- Query SQLite or DuckDB from the frontend (only `dadix_*` Tauri commands)
- Auto-create a persistent `*.duckdb` next to a `.dadix` project
- Concatenate user values into SQL strings (use bound parameters)
- Put project logic in Tauri commands, React, Next.js, or Express — that belongs in `dadix-core`
- Add Tauri, React, Next.js, or Express dependencies to `crates/dadix-core`

## Must

- Keep filter, sort, aggregation, joins, and SQL execution on the core side (DuckDB via `QueryEngine`)
- Send only the visible page or chunk to the UI (columnar `QueryPayload`, not a full table)
- Keep DuckDB in-memory per open project unless a DuckDB file is an explicit future source
- Link large CSV/Parquet/JSON files and scan them in place; do not import them into `.dadix`
- Model external files as links (`embedded` / `absolute` / `relative`) when adding sources; import is optional
- Store `credential_id` references only; secrets go to the OS credential store (Windows Credential Manager, macOS Keychain, Linux Secret Service)
- Keep job/automation logic callable without a React tree (future `dadixd`)
- Return `DadixError` with a stable `ErrorCode` from the core (no ad-hoc error strings)
- Resolve source files in the core (`embedded` / `relative` / `absolute`); relative URIs as `./…` from the `.dadix` folder
- Migrate schema one version at a time (`v1→v2→v3`); never jump to current
- Refuse newer unknown formats with `UNSUPPORTED_NEWER_FORMAT` (no silent rewrite)
- Save `.dadix` atomically (tmp → validate → replace)

## Desktop vs web

| Change | Desktop (`dadix-desktop`) | Web (`app/`) |
| --- | --- | --- |
| New table/view feature | `dadix-core` + thin Tauri adapter | Existing API is fine; do not invent a second client-only store |
| New data source | `sources` / `source_tables` in `.dadix` | Out of scope until shared core |
| UI component | Prefer porting from `app/src/components` later | Keep working; avoid Next-only APIs if the component will be shared |

If a change fails this list, it is not compatible with the target architecture.
