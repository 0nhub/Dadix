# Repository-Struktur

Git-Remote: `git@github.com:0nhub/Dadix.git`  
Default-Branch: `main`

Ältere Kopien unter iCloud (`Projects/Dadix`, `iMac übertrag/Dadix`, Sicherheitskopien) sind Archive. Entwickelt wird nur dieses Repo.

## Wurzel

```
Dadix/
├── AGENTS.md                 # Pflichtlektüre für AI-Systeme
├── README.md                 # Einstieg
├── Cargo.toml                # Rust-Workspace
├── Cargo.lock
├── package.json              # nur geteilte Root-Deps (Tailwind/Radix), kein App-Start
├── package-lock.json
├── .gitignore
├── crates/dadix-core/        # Rust-Core (CLI-fähig, kein GUI-Stack)
├── app/                      # Web: Next.js + Express
├── dadix-desktop/            # Desktop: Vite + Tauri-Shell
└── docs/                     # diese Dokumentation
```

Rust-Workspace-Mitglieder (`Cargo.toml`):

- `crates/dadix-core`
- `dadix-desktop/src-tauri`

## `crates/dadix-core/`

```
crates/dadix-core/
├── Cargo.toml
├── src/
│   ├── lib.rs
│   ├── atomic.rs          # VACUUM INTO, atomarer Replace, Recovery
│   ├── credentials.rs     # OS-Keychain + Memory-Store (Tests)
│   ├── demo.rs            # Demo-Projekte seeden
│   ├── domain.rs          # serde-Typen (Table, Column, View, Source, …)
│   ├── error.rs           # DadixError, ErrorCode
│   ├── file_id.rs         # verschobene Dateien heilen
│   ├── files.rs           # File-Sources, DuckDB-Scan, HTTP-JSON
│   ├── formula.rs
│   ├── lock.rs            # *.dadix.lock
│   ├── migrate.rs         # v1→v2→v3
│   ├── paths.rs           # embedded | relative | absolute
│   ├── project.rs         # Lifecycle + Query/Source-API am Handle
│   ├── schema.rs          # DDL, FORMAT_VERSION = 3
│   ├── secrets.rs         # verbotene Keys
│   ├── store.rs           # CRUD in SQLite
│   ├── table_query.rs     # Filter/Sort für eingebettete Records
│   ├── validate.rs
│   ├── tests.rs
│   ├── bin/dadix_credential.rs
│   ├── connectors/        # sqlite, postgres, mysql, mssql
│   └── query/             # DuckDB-Engine, Session, Result
├── tests/                 # Live-Tests (opt-in, echte Hosts)
├── benches/
└── examples/seed_demo.rs
```

Ausführlich: [core.md](./core.md).

## `app/` — Web und geteilte UI

```
app/
├── package.json           # Scripts: dev, dev:client, dev:server, build
├── next.config.ts
├── .env.example
├── public/js/workers/     # filter / sort / formula (auch ins Desktop-public kopiert)
├── server/                # Express-API (nur Web)
│   ├── server.js          # listen PORT || 6127
│   ├── .env.example
│   └── src/
│       ├── config/database.js
│       ├── controllers/
│       ├── middlewares/
│       ├── models/        # Sequelize
│       ├── routes/        # /auth /user /project /table /column /tag /record /view /ai /api
│       ├── services/
│       └── utils/
└── src/                   # Next.js + DIE geteilte React-UI
    ├── app/               # App Router (Seiten + wenige Route Handler)
    ├── components/        # ~143 Dateien, Desktop importiert denselben Baum
    ├── context/
    ├── hooks/
    ├── lib/
    ├── constants/
    ├── types/
    └── schema/
```

Wichtig: `app/src` ist **kein** Desktop-only-Ordner. Jede Änderung hier betrifft Web **und** die gebaute Desktop-App.

Ausführlich: [web.md](./web.md), [shared-ui.md](./shared-ui.md).

## `dadix-desktop/` — Shell, nicht zweite App

```
dadix-desktop/
├── package.json
├── vite.config.ts         # Alias @ → ../app/src, Bridge-Overrides
├── index.html
├── public/
│   ├── dadix-icon.png
│   └── js/workers/        # Kopien der Web-Worker
├── qa/                    # run-matrix, run-grid-flow, run-ui-flows, run-remaining
├── src/
│   ├── main.tsx
│   ├── App.tsx            # HashRouter, Bootstrap, Aux-Routen, QA-Runner
│   ├── styles.css
│   ├── types.ts
│   ├── lib/dadix.ts       # einziger Invoke-Layer
│   ├── bridge/            # callApi, map, Next-Shims, Auth/Dashboard-Stubs
│   └── components/        # WindowControls = produktiv
│                          # workspace/ QueryPanel/ = NICHT der Produktpfad
└── src-tauri/
    ├── Cargo.toml         # hängt an dadix-core
    ├── tauri.conf.json
    ├── capabilities/default.json
    ├── icons/
    └── src/
        ├── main.rs
        ├── lib.rs         # Commands + macOS-Ampeln
        └── state.rs       # ein offenes ProjectHandle
```

Ausführlich: [desktop.md](./desktop.md).

## `docs/`

| Datei | Inhalt |
| --- | --- |
| [README.md](./README.md) | Index |
| [overview.md](./overview.md) | Produkte und Datenpfad |
| [repository.md](./repository.md) | dieser Baum |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Zielarchitektur |
| [COMPATIBILITY.md](./COMPATIBILITY.md) | PR-Checkliste |
| [core.md](./core.md) | Rust-Core |
| [desktop.md](./desktop.md) | Tauri-Shell |
| [web.md](./web.md) | Next + Express |
| [shared-ui.md](./shared-ui.md) | React-UI, Grid, Events |
| [data-model.md](./data-model.md) | Schema, Typen, Felder |
| [bridge-and-commands.md](./bridge-and-commands.md) | HTTP↔Tauri-Inventar |
| [build.md](./build.md) | Build, Install, Ports |
| [qa.md](./qa.md) | QA-Skripte |
| [conventions.md](./conventions.md) | Verbote und Invarianten |
| [glossary.md](./glossary.md) | Begriffe |
| [TECHNICAL_SPEC_AI.md](./TECHNICAL_SPEC_AI.md) | AI-Prompt |

## Was Git ignoriert (nicht pushen)

Aus `.gitignore` (Auszug):

| Muster | Grund |
| --- | --- |
| `node_modules/`, `.next/`, `dist/`, `target/` | Build/Deps |
| `.env`, `.env.*` außer `*.env.example` | Secrets |
| `*.dadix`, `*.dadix.lock`, `*.sqlite`, `*.db` | lokale Projekte |
| `.dadix-*-report.json`, `.dadix-webview-debug.txt` | lokale Debug-/QA-Reste |
| `.dadix-ui-script.json`, `.dadix-ui-result.json` | QA-Protokolldateien |
| `/Dadix.app` | gebündelte App im Repo-Root |
| `.large-fixtures/` | 20-GB-Klasse Stressdaten |

`Cargo.lock` **wird** versioniert (Rust-Workspace).  
`crates/dadix-core/src/credentials.rs` ist **Code** für den OS-Store, keine Secret-Datei.

## Wo AI und Menschen suchen sollen

| Aufgabe | Start-Datei |
| --- | --- |
| Projekt öffnen / speichern | `crates/dadix-core/src/project.rs` |
| SQLite-DDL | `crates/dadix-core/src/schema.rs` |
| CSV/JSON linken | `crates/dadix-core/src/files.rs` |
| DuckDB-SQL | `crates/dadix-core/src/query/` |
| Postgres/MySQL/MSSQL | `crates/dadix-core/src/connectors/` |
| Tauri-Command | `dadix-desktop/src-tauri/src/lib.rs` |
| HTTP→Core | `dadix-desktop/src/bridge/callApi.ts` |
| Core-DTO → Web-DTO | `dadix-desktop/src/bridge/map.ts` |
| Invoke-Typen | `dadix-desktop/src/lib/dadix.ts` |
| Feldtypen | `app/src/types/index.ts`, `app/src/constants/index.ts` |
| Events | `app/src/constants/events.ts` |
| Grid | `app/src/components/table-view/`, `…/grid-view/` |
| Desktop-Hooks ohne Tauri | `app/src/lib/desktopShell.ts` |
| View-Tabs / locale | `app/src/components/views-switch/ViewsSwitch.tsx` |
