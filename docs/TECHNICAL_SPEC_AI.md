# Prompt für AI-Systeme

Oben in den Kontext legen. Die Langfassung steht in diesem `docs/`-Ordner und in [`AGENTS.md`](../AGENTS.md). Diese Datei ist der kompakte Vertrag, nicht mehr die alleinige Web-Spezifikation (Stand vor Desktop-Core).

```
Du arbeitest im Dadix-Monorepo (github.com/0nhub/Dadix).

Zwei Produkte:
- Web: app/  (Next.js :3000, Express :6127, PostgreSQL)
- Desktop: dadix-desktop/ + crates/dadix-core  (Tauri 2, eine .dadix-SQLite-Datei, DuckDB :memory:)

Geteilte UI: app/src. Desktop ersetzt diese Oberfläche nicht.

Verbindlicher Desktop-Pfad:
app/src → dadix-desktop/src/bridge/callApi.ts → src/lib/dadix.ts (invoke)
→ Tauri dadix_* → dadix-core::ProjectHandle → SQLite / DuckDB.

Pflichtlektüre vor Architektur-, Grid-, Fenster- oder Persistenz-Änderungen:
docs/README.md, docs/ARCHITECTURE.md, docs/COMPATIBILITY.md, docs/conventions.md, AGENTS.md.

Zitiere konkrete Pfade, Typen, Event-Namen, ErrorCodes, Command-Namen.
Wenn etwas in der Doku fehlt: sag das und schlage nur Änderungen vor, die zum Stack passen.
Sprache der Antwort: nach Wunsch des Nutzers.
```

## Schnellinventar

### Reposchichten

| Schicht | Pfad | Darf |
| --- | --- | --- |
| Core | `crates/dadix-core` | `.dadix`, Queries, Sources, Secrets-Policy |
| Tauri | `dadix-desktop/src-tauri` | dünne Commands, Ampeln, State (ein Handle) |
| Bridge | `dadix-desktop/src/bridge` | HTTP-Form, Next-Shims, Recents |
| Invoke-TS | `dadix-desktop/src/lib/dadix.ts` | einziges `invoke` |
| UI | `app/src` | Grid, Contexts, Events, Editoren |
| Web-API | `app/server` | Express + Sequelize |

### Format und Engines

- `.dadix` = SQLite, `FORMAT_VERSION = 3`, Lock `*.dadix.lock`
- DuckDB nur RAM, lazy bind der File-Sources, kein DESCRIBE-All beim Open
- File-Formate: CSV/TSV/Parquet/JSON/NDJSON; HTTP nur JSON/NDJSON, 8s Timeout
- Connectoren: sqlite / postgresql / mysql / sqlserver, alle read-only
- Secrets: `credential_id` in der Datei, Secret im OS-Store `dev.dadix.app`

### UI-Verträge

- Events: `app/src/constants/events.ts` (`dadixEvents`)
- Typen: `app/src/types/index.ts` — Fields inkl. `FILE`, Actions `copy|edit|openUrl`
- `ViewsSwitch` ruft `useLanguage()` selbst; `localizeSystemName` für `All entries` / `New view` / `New table`
- Desktop-Hooks: `app/src/lib/desktopShell.ts` — kein `@tauri-apps/api`
- HashRouter: `#/dashboard/:projectId?tableId=`
- Aux: `#/…/edit-table`, `#/…/documents-editor`
- Header-Hide auf Desktop: Share, Webform, API, AI Keys
- Titlebar 44px; macOS CSS-Ampeln; native Buttons nur verstecken, nie den Superview

### Commands

Vollständige Liste: [bridge-and-commands.md](./bridge-and-commands.md). Prefix immer `dadix_`. `dadix_rename_table` ist **nicht** registriert.

### Produkt vs. Dev

- Produkt Desktop = gebaute `Dadix.app` (`frontendDist: ../dist`)
- `tauri dev` = Vite :1420, nicht ausliefern, nicht als fertig behaupten
- QA: `.dadix-ui-script.json` → Runner → `.dadix-ui-result.json` ([qa.md](./qa.md))

### ErrorCodes (Core)

`INVALID_PATH`, `INVALID_PROJECT`, `PROJECT_NOT_OPEN`, `PROJECT_ALREADY_EXISTS`, `IO`, `DATABASE`, `MIGRATION`, `VALIDATION`, `PATH_RESOLUTION`, `LOCK`, `SECRET_IN_PROJECT`, `UNSUPPORTED_FORMAT`, `UNSUPPORTED_NEWER_FORMAT`, `NOT_FOUND`, `PROJECT_LOCKED`, `SOURCE_NOT_FOUND`, `INCOMPLETE_SAVE`, `READ_ONLY`, `QUERY_SYNTAX_ERROR`, `QUERY_CANCELLED`, `QUERY_TIMEOUT`, `QUERY_ENGINE_ERROR`, `QUERY_RESULT_TOO_LARGE`, `CREDENTIAL_STORE`, `CONNECTOR`, `CONNECT_TIMEOUT`

## Veraltetes in älteren Texten

`app/README.md` und `app/server/README.md` beschreiben nur die Web-Linie.  
Ein früherer Stand dieser Datei tat so, als wäre `app/` das ganze Projekt. Das ist falsch. Bei Widerspruch gelten `docs/ARCHITECTURE.md`, `AGENTS.md` und der Code.
