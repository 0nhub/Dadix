# Dadix

Airtable-ähnliche App: Web (Next.js + Express) und local-first Desktop (Tauri 2).

Zielarchitektur (verbindlich): [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).  
PR-Checkliste: [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md).

Aktuelle Quelle liegt in diesem Repo. Ältere Kopien unter iCloud (`Projects/Dadix`, `iMac übertrag/Dadix`, Sicherheitskopie) sind Archive — nicht mehr zum Entwickeln nutzen.

## Struktur

```
Dadix/
├── crates/dadix-core/   # Rust-Core: .dadix-Lifecycle, unabhängig von Tauri
├── app/                 # Web: Next.js Frontend + Express API
├── dadix-desktop/       # Desktop: Tauri-Shell (ruft nur dadix-core)
└── docs/
```

Rust-Workspace (Core-Tests ohne GUI):

```bash
cargo test -p dadix-core
cargo bench -p dadix-core --bench duckdb_query
cargo bench -p dadix-core --bench file_sources
cargo bench -p dadix-core --bench large_file
```

`dadix-core` owns both the `.dadix` SQLite control plane and the in-memory DuckDB query engine. The desktop UI only calls `dadix_*` commands.

## Web lokal starten

Node.js 18+. Im Ordner `app/`:

```bash
cp .env.example .env.local
cp server/.env.example server/.env
npm install
npm run dev
```

- Frontend: [http://localhost:3000](http://localhost:3000)
- API: Port `6127`
- Offline-Login (wenn die Datenbank nicht erreichbar ist): `test@example.com` / `Test1234!`

Ohne PostgreSQL läuft der Dev-Server weiter; Projekte und Tabellen bleiben dann lokal im Browser.

## Desktop

Siehe [`dadix-desktop/README.md`](dadix-desktop/README.md). Ein Projekt ist eine lokale `.dadix`-Datei (SQLite), kein Server nötig. Doppelklick auf `*.dadix` soll die Desktop-App öffnen.

## Was nicht ins Repo gehört

`node_modules`, `.next`, echte `.env` / `.env.local`. Vorlagen liegen als `.env.example`.
