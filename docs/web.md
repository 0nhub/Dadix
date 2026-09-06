# Web (Next.js + Express)

Pfad: [`app`](../app)

Die Browser-/Cloud-Linie. Sie bleibt eigenständig. Desktop **portiert** die UI, **ersetzt** sie nicht.

## Ports und Scripts

| Was | Port / Befehl |
| --- | --- |
| Next.js UI | **3000** — `npm run dev:client` (`next dev --hostname localhost --turbopack`) |
| Express API | **6127** — `npm run dev:server` |
| beides | `npm run dev` (concurrently) |
| Production-API | `https://api.dadix.net` |

Es gibt **keinen** Port 3020 im Repo. Wenn lokal ein anderer Port auftaucht, ist das eine persönliche `next`-Abweichung, nicht die Spezifikation.

Vorlagen:

```bash
cd app
cp .env.example .env.local          # NEXT_PUBLIC_API_URL=http://localhost:6127
cp server/.env.example server/.env
npm install
npm run dev
```

Ohne PostgreSQL bleibt der Dev-Server oft am Leben; dann greifen Demo-/localStorage-Fallbacks. Offline-Login laut Root-README: `test@example.com` / `Test1234!` (nur wenn so geseedet).

## App Router

Root-Layout: `AuthContextProvider`, `LanguageContextProvider`.

| Route | Datei | Zweck |
| --- | --- | --- |
| `/` | `(dashboard)/page.tsx` | Startziel aus `UserLocalStorage` |
| `/login`, `/signup` | `(auth)/` | Auth |
| `/dashboard` | `dashboard/page.tsx` | Projektliste |
| `/dashboard/edit-projects` | `edit-projects/page.tsx` | Projekte verwalten |
| `/dashboard/[projectId]` | `[projectId]/page.tsx` | Grid-Workspace `?tableId=&viewId=` |
| `/dashboard/[projectId]/edit-table` | `edit-table/page.tsx` | Table-Editor als Seite |
| `/dashboard/[projectId]/documents` | `documents/page.tsx` | Document-Editor anstoßen |
| `/import-table` | `(pages)/import-table/page.tsx` | CSV-Import |
| `/share/[shareId]`, `/share/webform` | `share/` | öffentliche Views / Formulare |
| `/invite/[token]` | `invite/` | Invite |

Next-Route-Handler (nicht Express): `src/app/api/share/*`.

`documents-editor` ist **keine** Next-Route. Das ist der Desktop-Aux-Hash.

## Express

Einstieg: `app/server/server.js` → `src/index.js`, `PORT || 6127`.

Mounts (`server/src/routes/`): `/auth`, `/user`, `/project`, `/table`, `/column`, `/tag`, `/record`, `/view`, `/ai`, `/api`.

Datenbank: PostgreSQL + Sequelize (`server/src/config/database.js`). In Nicht-Production kein hartes Exit bei DB-Fehler.

Auth: JWT in HTTP-only Cookies `accessToken` / `refreshToken`. `/api/v1/*` zusätzlich Bearer-API-Key.

Die HTTP-Verträge stehen weiterhin in [`app/server/README.md`](../app/server/README.md) (Auth, Filter-Syntax, Rollenmatrix). Bei Abweichung gilt der **Code** in `routes/` / `controllers/`.

## Frontend-HTTP

`app/src/lib/api.ts` — Axios, `baseURL` aus `NEXT_PUBLIC_API_URL` bzw. localhost:6127 / `api.dadix.net`.

Fach-Clients:

- `lib/table.ts` — Tabellen und Felder
- `lib/record.ts` — Records
- `lib/view.ts` — Views
- `lib/views/gridView.ts` — Grid-Spalten persistieren
- `lib/aiComplete.ts` — AI-Felder
- `lib/project.ts` — Projekte

## localStorage — kein echter Store

Erlaubt für UI-Präferenzen, nicht als Ersatz für Server oder `.dadix`:

| Modul | Inhalt |
| --- | --- |
| `userLocalStorage.ts` | letztes Projekt/Tabelle/View, Theme, Datumsformat, Startziel |
| `sidebarState.ts` | Gruppen, Links, Order |
| `documentTemplates.ts` | TipTap-Vorlagen (Web) |
| `aiApiKeys.ts` | Client-Keys (Web) |
| `dev-demo-data.ts` | Dev-only Mock, wenn kein Backend |
| Grid | `dadix-view-record-order-{tableId}-{viewId}` |

`COMPATIBILITY.md`: localStorage nicht zur echten Persistenz ausbauen.

## Was Web hat und Desktop nicht (oder ausblendet)

- Mitglieder, Invites, Share-Links, Webforms
- Projekt-API-Keys, Webhooks
- AI-Complete über Server
- PostgreSQL-Rollenmodell

`isDadixDesktopShell()` blendet Share / Webform / API / AI Keys im Header und Teile des Tabellen-Kontextmenüs aus.

## Was Web nicht tun darf

- `@tauri-apps/api` importieren
- Desktop-only-Logik außer über `desktopShell.ts` (DOM-Flag + `window.__dadix*`)
- Next-only-APIs in Komponenten, die Desktop bundelt (`next/headers`, Server Actions, …)

Komponenten, die Desktop mitbenutzt, müssen mit HashRouter und leerem `apiBase` überleben.
