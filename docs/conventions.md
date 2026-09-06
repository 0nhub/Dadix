# Konventionen und Verbote

Kurzform der PR-Checkliste: [COMPATIBILITY.md](./COMPATIBILITY.md).  
Zielarchitektur: [ARCHITECTURE.md](./ARCHITECTURE.md).

Dieses Dokument ist die operative Liste. Ein PR, der sie bricht, ist unabhängig von der Feature-Idee falsch.

## Muss

- Filter, Sort, Aggregation, Joins, SQL im Core (`QueryEngine` / Connector), nicht in React
- Nur die sichtbare Seite/Chunk in die UI (`QueryPayload` columnar, Limits 1000/10000)
- DuckDB nur `:memory:` pro offenem Projekt, außer eine DuckDB-Datei wird später bewusst als Source angelegt
- Große CSV/Parquet/JSON verlinken und in-place scannen
- Secrets nur OS-Store; in der Datei höchstens `credential_id`
- `DadixError` + stabiler `ErrorCode`
- Quellen im Core auflösen (`embedded` / `relative` / `absolute`)
- Migration Version für Version
- Speichern atomar: tmp → validate → replace
- Geteilte UI in `app/src` weiterbenutzen
- `ViewsSwitch` holt `locale` über `useLanguage()` selbst
- Open URL über `openExternalUrl` / Opener-Plugin
- Gebaute `Dadix.app` ist der Desktop-Produktbeweis

## Darf nicht

- Geschäftslogik nur in Next-API-Routes oder Express, wenn Desktop sie braucht
- `localStorage` / Demo-Fallbacks zur echten Datenhaltung ausbauen
- Passwörter, Tokens, API-Keys in `.dadix` oder Projekt-JSON
- Ganze Tabelle nach React laden (`SELECT *` dump)
- Netzwerk für Open / Edit / Views / Filter / lokalen Import-Export verlangen
- Express/Node-Server in der Desktop-App starten
- SQLite/DuckDB aus dem Frontend queryen
- Automatisch `*.duckdb` neben `.dadix` anlegen
- Userwerte in SQL-Strings konkatenieren
- Projektlogik in Tauri-Commands, React, Next oder Express wachsen lassen — gehört nach `dadix-core`
- Tauri/React/Next/Express-Dependencies in `crates/dadix-core`
- `@tauri-apps/api` oder Tauri-Plugins aus `app/src` importieren
- Eine zweite Desktop-Workspace-UI als Produktpfad bauen (`src/components/workspace/` nicht wiederbeleben)
- `tauri dev` als „fertig“ oder als ausgeliefertes Produkt darstellen
- Beim `open_project` alle File-Sources binden plus `DESCRIBE` auf großen CSVs
- `trafficLightPosition` in Tauri-Config oder Aux-Fenstern
- Native Titlebar per `setFrame` auf 44px zwingen
- Superview der macOS-Ampeln verstecken (nur die drei Buttons)
- `locale` in View-Tabs ohne Hook verwenden
- Destructive-Icons dauerhaft rot (grau bis Hover)
- Spaltenbreite bei jedem `pointermove` persistieren
- Feldnamen durch generisches „Field“/„Feld“ überschreiben
- System-View-Namen erfinden, die `localizeSystemName` umgehen, ohne `SYSTEM_NAME_KEYS` zu pflegen

## Wo welche Änderung hingehört

| Änderung | Desktop | Web |
| --- | --- | --- |
| Neue Tabellen-/View-Logik | `dadix-core` + dünner Command + `callApi`/`map` | bestehende Express-Route |
| Neue Datenquelle | `sources` / File- oder Connector-API im Core | außerhalb, bis ein Shared Core existiert |
| UI-Komponente | `app/src/components` (geteilt) | dieselbe Datei; keine Next-only-APIs |
| Nativer Dialog, Fenster, Opener | nur `dadix-desktop/src/**` | — |
| CSS-Titlebar / Grid | `app/src` + `dadix-desktop/src/styles.css` | `globals.css` |

## Benennung

- Rust: `Column`, nicht `Field`
- Error-Codes: `SCREAMING_SNAKE_CASE`
- Events: `dadix-…` wie in `events.ts`
- Tauri: Prefix `dadix_`
- Hash-Routen spiegeln Next-Pfade (`/dashboard/:projectId?tableId=`)

## Kommentare und Scope

Keine großen Refactors „nebenbei“. Keine neuen Markdown-Dateien außerhalb von `docs/` ohne Grund. Keine Secrets committen. Keine lokalen `.dadix` ins Git.

## Review-Fragen

1. Läuft der Pfad UI → Bridge → Command → Core?
2. Bleibt Web mit demselben `app/src` heil?
3. Sind Secrets draußen?
4. Ist das Ergebnis seitenweise, nicht die ganze Tabelle?
5. Wurde die gebaute App gebraucht, und wurde sie gebaut?
6. Sind Ampeln, locale, Open-URL, Lazy-Bind unangetastet?
