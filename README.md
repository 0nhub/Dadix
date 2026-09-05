# Dadix

Airtable-ähnliche App: Web (Next.js + Express) und optionale Desktop-App (Tauri).

Aktuelle Quelle liegt in diesem Repo. Ältere Kopien unter iCloud (`Projects/Dadix`, `iMac übertrag/Dadix`, Sicherheitskopie) sind Archive — nicht mehr zum Entwickeln nutzen.

## Struktur

```
Dadix/
├── app/              # Web: Next.js Frontend + Express API
├── dadix-desktop/    # Desktop: Tauri + lokales .dadix (SQLite)
└── docs/
```

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

Siehe `dadix-desktop/README.md`. Ein Projekt ist eine lokale `.dadix`-Datei (SQLite), kein Server nötig.

## Was nicht ins Repo gehört

`node_modules`, `.next`, echte `.env` / `.env.local`. Vorlagen liegen als `.env.example`.
