# Produktüberblick

Dadix ist ein Airtable-/Ninox-ähnliches Datenwerkzeug: Projekte, Tabellen, Felder, Datensätze, Views, verknüpfte Dateien, optionale externe Datenbanken, Dokumentenvorlagen.

Es gibt **zwei auslieferbare Produkte** im selben Git-Repo. Sie teilen die React-UI, nicht die Persistenz.

## Die zwei Produkte

| | Web | Desktop |
| --- | --- | --- |
| Ordner | `app/` | `dadix-desktop/` + `crates/dadix-core` |
| UI | Next.js 15 App Router, Port **3000** | Dieselbe UI aus `app/src`, gebündelt in Vite, HashRouter |
| Runtime | Browser | Tauri 2 WebView (macOS/Windows/Linux) |
| Persistenz | Express 5 auf Port **6127**, PostgreSQL, Sequelize | Eine lokale `.dadix`-Datei (SQLite) + DuckDB im RAM |
| Auth | JWT / Cookies, Rollen Owner/Admin/Editor/Viewer | Lokaler Stub-User, volle Rechte |
| Netzwerk | Pflicht für echte Daten (außer Dev-Demo in localStorage) | Optional. Lokal öffnen/editieren/filtern geht offline |
| Auslieferung | `next build` + Node-Server | Native `Dadix.app` / Installer, Frontend im Binary |

Die Cloud-API-URL der Web-Linie ist `https://api.dadix.net` (`app/src/constants/index.ts`). Lokal ist die API `http://localhost:6127`.

## Was ein „Projekt“ ist

### Web

Ein Projekt ist eine Zeile in PostgreSQL plus zugehörige Tabellen, Spalten, Records, Views, Mitglieder, Invites. Die ID ist eine UUID. Zusammenarbeit, Share-Links und Webforms gehören zu dieser Linie.

### Desktop

Ein Projekt ist **eine Datei** `Name.dadix`. Technisch SQLite, inhaltlich das Dokument. Daneben kann liegen:

- `Name.dadix.lock` — Schreibsperre, nicht committen
- `Name.dadix.bak` / `Name.dadix.tmp` — Recovery nach Migration/Save
- `Name.dadix.d/` — Sidecar für eingebettete Dateien
- verknüpfte CSV/JSON/Parquet **außerhalb** der Datei

Doppelklick auf `*.dadix` soll die Desktop-App öffnen (File Association in `tauri.conf.json`).

## Der verbindliche Desktop-Datenpfad

Jeder neue Desktop-Feature-Pfad muss so aussehen:

```
app/src  (bestehende React-UI)
  → Axios-förmige Aufrufe über @/lib/api
  → dadix-desktop/src/bridge/callApi.ts
  → dadix-desktop/src/lib/dadix.ts   (nur invoke)
  → #[tauri::command] dadix_*
  → dadix_core::ProjectHandle
  → SQLite-Control-Plane und/oder DuckDB-Data-Plane
```

Nicht erlaubt als Produktpfad:

- eine neue Desktop-eigene Grid-/Workspace-UI
- Express oder ein lokaler Node-Server in der `.app`
- SQL aus React
- `window.open` für http(s)-Links (muss über `openExternalUrl` / Opener-Plugin)
- `@tauri-apps/api` aus `app/src`

## Schichtmodell

```
┌──────────────────────────────────────────────────────────┐
│  DADIX UI                                                │
│  app/src  — React, Contexts, Grid, Table-Editor, i18n    │
├────────────────────────────┬─────────────────────────────┤
│  Web-Adapter               │  Desktop-Adapter            │
│  app/src/lib/api.ts        │  bridge/callApi.ts + map.ts │
│  Next.js Routing           │  HashRouter + Next-Shims    │
├────────────────────────────┼─────────────────────────────┤
│  Express + Sequelize       │  Tauri 2 (dünn)             │
├────────────────────────────┼─────────────────────────────┤
│  PostgreSQL                │  dadix-core                 │
│                            │  SQLite .dadix │ DuckDB RAM │
└────────────────────────────┴─────────────────────────────┘
```

`dadix-core` hat **keine** Abhängigkeit zu Tauri, React, Next.js oder Express. CLI und ein späterer `dadixd` sollen denselben Core rufen.

## Was der Nutzer in der UI sieht

Nach dem Öffnen eines Projekts:

1. **Sidebar** — Tabellenliste, Gruppen, Suche (`dashboard-sidebar/`)
2. **Titlebar** — 44px, Figma-ähnlich; auf Desktop Overlay-Titlebar + CSS-Ampeln
3. **View-Tabs** — `ViewsSwitch`; implementiert ist vor allem `gridView`
4. **Grid** — virtuelle Zeilen, Spaltenbreite, Spalten-DnD, Zellmenü, Find
5. **Record-Sheet** — `table-cell-viewer.tsx` nach Klick auf eine Zeile
6. **Table-Editor / Documents** — Web: Overlay; Desktop: natives Aux-Fenster

Auf Desktop ausgeblendet (weil Cloud-Features): Share, Webform, API, AI Keys.

## Phasenstand (Core)

| Phase | Status | Inhalt |
| --- | --- | --- |
| 1–5 | Fertig | Tauri, Core-Workspace, portables `.dadix` v3, DuckDB, File-Sources |
| 6 | Implementiert, Live-Validierung offen | SQLite/Postgres/MySQL/SQL-Server-Connectoren, read-only |
| 7 | Später | Federation über Engines |
| 8 | Später | REST/HTTP als Tabellen |
| 9 | Später | Job-Engine + optional `dadixd` |

Details: [ARCHITECTURE.md](./ARCHITECTURE.md).

## Sprachen

- **Code, Typen, Event-Namen, SQL, Fehl#ifdefodes:** Englisch
- **UI-Strings:** `en` / `de` über `LanguageContext` + `app/src/lib/i18n.ts`
- **Systemnamen** wie `All entries` / `New view` / `New table` werden über `localizeSystemName` übersetzt
- **Feldtyp-Anzeigename `File`** und bewusst englische Systemlabels bleiben, wenn sie nicht in `SYSTEM_NAME_KEYS` stehen

## Was bewusst nicht im Git liegt

Echte `.env`, `*.dadix`, Locks, gebaute `Dadix.app`, `node_modules`, `target/`, QA-Report-Dateien, Webview-Debug. Siehe [repository.md](./repository.md).
