# Dadix Web (`app/`)

Backend (Express :6127) + Frontend (Next.js :3000). `src/` ist außerdem die **geteilte UI** der Desktop-App.

Gesamtdoku: [../docs/README.md](../docs/README.md) · [../docs/web.md](../docs/web.md) · [../docs/shared-ui.md](../docs/shared-ui.md).  
`src/` darf `@tauri-apps/api` nicht importieren.

## Struktur

```
app/
├── server/       # Express API
├── src/          # Next.js
├── public/
├── package.json
└── ...
```

## Voraussetzungen

- Node.js 18+
- PostgreSQL (für `server/`)
- npm

## Installation

```bash
npm install
```

## Umgebungsvariablen

- **Backend:** `server/.env` (Vorlage: `server/.env.example`)
- **Frontend:** `.env.local` (Vorlage: `.env.example`), z. B. `NEXT_PUBLIC_API_URL=http://localhost:6127`

## Skripte

| Befehl | Beschreibung |
|--------|--------------|
| `npm run dev` | Server + Client parallel |
| `npm run dev:server` | Nur Backend (Port 6127) |
| `npm run dev:client` | Nur Frontend (Port 3000) |
| `npm run build` | Next.js bauen |
| `npm run start` | Next.js starten |
| `npm run start:server` | Backend starten |
| `npm run lint` | Lint |

Backend-API-Details: `server/README.md`
