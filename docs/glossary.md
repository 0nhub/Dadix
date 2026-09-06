# Glossar

| Begriff | Bedeutung |
| --- | --- |
| **`.dadix`** | Eine SQLite-Projektdatei, Control Plane, `format_version` 3 |
| **`.dadix.lock`** | Sibling-Lock; nicht Teil des Dokuments; `PROJECT_LOCKED` wenn belegt |
| **`.dadix.d/`** | Sidecar-Ordner für `embedded_file` |
| **Aux-Fenster** | Zweites Tauri-Webview für Table-Editor oder Documents |
| **Bridge** | `dadix-desktop/src/bridge/*` — HTTP-Form → Invoke, Next-Shims |
| **callApi** | Axios-förmiger Client; Web echt, Desktop gemappt |
| **Column** | Core-Name für ein UI-„Field“ |
| **Control Plane** | SQLite in der `.dadix`-Datei |
| **Data Plane** | DuckDB `:memory:` plus optionale Connector-Sessions |
| **dadix-core** | Rust-Crate ohne GUI-Stack |
| **Dadix.app** | Gebaute native App — das Desktop-Produkt |
| **dadixEvents** | CustomEvent-Namen in `app/src/constants/events.ts` |
| **dataset.dadixOs** | DOM-Flag, das die geteilte UI als Desktop erkennt |
| **DESCRIBE** | DuckDB-Schema-Peek; nicht beim Open aller File-Sources |
| **DuckDB** | Analytics-/Scan-Engine, nicht persistiert neben dem Projekt |
| **embedded_table** | Daten in `records` |
| **ErrorCode** | Stabiler Maschinencode in `DadixError` |
| **Federation** | Phase 7 — Joins über Engines; noch nicht da |
| **Field action** | `copy` / `edit` / `openUrl` |
| **format_version** | Migrationsschlüssel, aktuell 3 |
| **frontendDist** | Vite-`dist/`, muss im Tauri-Build gesetzt bleiben |
| **GridView** | Einzige voll implementierte View |
| **HashRouter** | Desktop-Routing `#/dashboard/…` |
| **Heal** | Verschobene Datei über `FileIdentity` wiederfinden |
| **invoke** | Tauri IPC; nur in `lib/dadix.ts` und wenigen Shell-Dateien |
| **lazy bind** | File-Views erst bei Query/Preview, nicht beim Open |
| **linked_file** | Originaldatei bleibt außen, DuckDB scannt sie |
| **logical_name** | DuckDB-Temp-Viewname einer Source |
| **Overlay titlebar** | macOS-Chrome unsichtbar, CSS-Titlebar 44px |
| **PathMode** | `embedded` \| `relative` \| `absolute` |
| **ProjectHandle** | Offenes Projekt im Core |
| **QA-Runner** | Pollt `.dadix-ui-script.json` in der laufenden App |
| **QueryPayload** | Columnar Result; nicht Zeilen-JSON als Architektur |
| **Recents** | localStorage-Liste zuletzt geöffneter Dateien |
| **Relink** | Neue URI für eine fehlende Source |
| **Share / Webform / API / AI Keys** | Cloud-Features, auf Desktop ausgeblendet |
| **SourceKind** | `embedded_table` \| `embedded_file` \| `linked_file` \| `external_database` |
| **tauri dev** | Dev-Server 1420 — nicht das Produkt |
| **traffic lights** | macOS-Fensterknöpfe; nativ versteckt, CSS gezeichnet |
| **VIEW_BUTTON** | Button auf der View, keine Tabellenspalte |
| **ViewsSwitch** | View-Tabs; muss `useLanguage()` selbst rufen |
| **workspace/** | Legacy-UI unter `dadix-desktop/src/components/workspace/` — nicht Produkt |
