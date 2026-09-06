# Dadix

Airtable-ähnliche Daten-App mit **zwei Produkten** in einem Repo:

| Produkt | Ordner | Persistenz |
| --- | --- | --- |
| **Web** | [`app/`](app/) | Next.js (:3000) + Express (:6127) + PostgreSQL |
| **Desktop** | [`dadix-desktop/`](dadix-desktop/) + [`crates/dadix-core`](crates/dadix-core) | lokale `.dadix`-Datei (SQLite) + DuckDB im RAM |

Die React-Oberfläche liegt einmal in [`app/src`](app/src). Desktop bindet sie über Vite-Aliases und eine Bridge — es gibt keine zweite Produkt-UI.

## Dokumentation (verbindlich)

Alles, was Struktur, Architektur, Commands, UI-Verträge, Build und QA erklärt:

**[docs/README.md](docs/README.md)**

| Für | Dokument |
| --- | --- |
| Überblick | [docs/overview.md](docs/overview.md) |
| Zielarchitektur | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| PR-Checkliste | [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md) |
| Entwickler-Regeln | [docs/conventions.md](docs/conventions.md) |
| AI / Agenten | [AGENTS.md](AGENTS.md), [docs/TECHNICAL_SPEC_AI.md](docs/TECHNICAL_SPEC_AI.md) |
| Glossar | [docs/glossary.md](docs/glossary.md) |

Aktuelle Quelle ist dieses Repo: [github.com/0nhub/Dadix](https://github.com/0nhub/Dadix). Ältere iCloud-Kopien sind Archive.

## Struktur

```
Dadix/
├── crates/dadix-core/   # Rust-Core: .dadix-Lifecycle, unabhängig von Tauri
├── app/                 # Web + geteilte React-UI
├── dadix-desktop/       # Tauri-Shell (ruft nur dadix-core)
├── docs/                # ausführliche Dokumentation
└── AGENTS.md            # Vertrag für AI-Systeme
```

Desktop-Datenpfad:

```
app/src → bridge/callApi → invoke dadix_* → dadix-core → SQLite / DuckDB
```

## Web lokal

Node.js 18+. Im Ordner `app/`:

```bash
cp .env.example .env.local
cp server/.env.example server/.env
npm install
npm run dev
```

- Frontend: http://localhost:3000
- API: Port `6127`
- Offline-Login (wenn die Datenbank nicht erreichbar ist): `test@example.com` / `Test1234!`

Ohne PostgreSQL läuft der Dev-Server weiter; Projekte und Tabellen bleiben dann lokal im Browser. Das ist kein Ersatz für `.dadix`.

Details: [docs/web.md](docs/web.md), [`app/README.md`](app/README.md).

## Desktop

Eine Datei = ein Projekt (`Controlling.dadix`). Kein Server nötig. Doppelklick auf `*.dadix` öffnet die App.

```bash
cd dadix-desktop
npm install
npm run tauri build
```

`npm run tauri dev` ist nur Hot-Reload (Vite :1420), **nicht** das Produkt. Fertig ist die gebaute `Dadix.app`.

Details: [docs/desktop.md](docs/desktop.md), [docs/build.md](docs/build.md), [`dadix-desktop/README.md`](dadix-desktop/README.md).

## Core ohne GUI

```bash
cargo test -p dadix-core
cargo bench -p dadix-core --bench duckdb_query
cargo bench -p dadix-core --bench file_sources
cargo bench -p dadix-core --bench large_file
```

`dadix-core` besitzt die SQLite-Control-Plane und die In-Memory-DuckDB-Query-Engine. Die Desktop-UI spricht nur `dadix_*`.

## Was nicht ins Repo gehört

`node_modules`, `.next`, `target`, echte `.env`, `*.dadix`, Locks, QA-Reports, gebaute `Dadix.app`. Vorlagen: `.env.example`.
