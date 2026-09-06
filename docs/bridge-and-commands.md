# Bridge und Tauri-Commands

Die UI kennt Express-Pfade. Auf Desktop werden sie zu `dadix_*` Invokes. Neue Features: zuerst Core, dann Command, dann `dadix.ts`, dann `callApi.ts`/`map.ts`. Nicht umgekehrt SQL in den Bridge schreiben.

## Kette

```
Komponente
  → table.ts / record.ts / view.ts
  → @/lib/api  (= callApi.ts auf Desktop, api.ts im Web)
  → handle(method, url, body)
  → lib/dadix.ts  invoke("dadix_…")
  → src-tauri/src/lib.rs
  → ProjectHandle
```

`networkGuard.ts` biegt fetch/XHR auf dieselbe `handle`-Funktion. Relatives `/table` und volle URLs mit leerem apiBase landen dort.

## `map.ts`

Pflicht-Übersetzer. Core `Column` hat `type_name`/`options`; Web `Field` hat `type`/`action`/`isVisible`. Ohne Mapping sieht die UI leere oder falsche Felder.

Wichtige Funktionen: `columnToField`, `tableToWeb`, `viewToWeb`, `recordToWeb`, `fieldOptionsPayload`.

## `callApi.ts` — HTTP-Form (Auszug)

| HTTP | Typische Umsetzung |
| --- | --- |
| `GET/POST /auth`, `/user` | Stub / lokal |
| `GET/POST/PATCH/DELETE /project` | Recents + `getProjectMeta` / `setProjectName` / Close |
| `GET/POST /table` | `getTables` / `createTable` / `linkFile` / `addDatabaseSource` |
| `GET/PATCH/DELETE /table/:id` | `getTable` / `updateTable` / `deleteTable` |
| `POST /column` | `createColumn` (+ Linked-File-Schema sync) |
| `GET /record` | `queryRecords` oder Source-Preview/SQL |
| `POST/PATCH/DELETE /record` | insert/update/delete oder File-Writeback |
| `GET/POST /view` | `getViews` / `createView` |
| `PATCH /view/grid/:id` | `updateGridViewColumn` |
| `POST /source/pick-file` | nativer Dialog (`plugin-dialog`) |
| Share/AI/API-Keys | no-op oder Fehler — Features sind auf Desktop ausgeblendet |

Linked-File-Tabellen: Lesen `previewSource`, Schreiben `writeFileSource`.  
External-DB-Tabellen: `executeSourceQuery`.  
Relationen: Settings-Keys `rel:{tableId}:{recordId}:{relationId}`.

Antwortform wie Axios: `{ data, status, statusText }`. Fehler: `err.response`.

## `lib/dadix.ts`

Einziger Ort in TypeScript, der `invoke` aufruft. UI und `callApi` gehen nicht an `invoke` vorbei.

## Registrierte Commands (71)

Quelle: `generate_handler!` in `dadix-desktop/src-tauri/src/lib.rs`.

### Session / Projekt

`dadix_take_pending_open_path`, `dadix_create_project`, `dadix_create_named_project`, `dadix_open_project`, `dadix_open_demo_project`, `dadix_close_project`, `dadix_save_project`, `dadix_validate_project`, `dadix_get_project_meta`, `dadix_set_project_name`, `dadix_list_recovery`, `dadix_restore_backup`

### Tabellen / Spalten / Records / Views

`dadix_get_tables`, `dadix_get_table`, `dadix_create_table`, `dadix_update_table`, `dadix_delete_table`,  
`dadix_get_columns`, `dadix_create_column`, `dadix_update_column`, `dadix_delete_column`,  
`dadix_get_records`, `dadix_get_record_count`, `dadix_query_records`, `dadix_insert_record`, `dadix_update_record`, `dadix_delete_record`,  
`dadix_get_views`, `dadix_get_view`, `dadix_create_view`, `dadix_update_view`, `dadix_delete_view`,  
`dadix_get_grid_view_columns`, `dadix_update_grid_view_column`,  
`dadix_view_buttons`, `dadix_create_view_button`, `dadix_update_view_button`, `dadix_delete_view_button`

`dadix_rename_table` existiert als Funktion, ist aber **nicht** im `generate_handler!` — nicht so tun, als wäre sie aufrufbar.

### Sources / Query

`dadix_list_sources`, `dadix_list_source_tables`, `dadix_list_jobs`,  
`dadix_link_file`, `dadix_list_bound_sources`, `dadix_preview_source`, `dadix_describe_source`, `dadix_write_file_source`,  
`dadix_resolve_source_path`, `dadix_list_missing_sources`, `dadix_relink_source`,  
`dadix_execute_query`, `dadix_cancel_query`, `dadix_explain_query`, `dadix_query_status`,  
`dadix_add_database_source`, `dadix_test_source_connection`, `dadix_execute_source_query`, `dadix_cancel_source_query`,  
`dadix_list_remote_databases`, `dadix_list_remote_schemas`, `dadix_list_remote_tables`, `dadix_list_remote_columns`

### Settings / Credentials

`dadix_list_settings`, `dadix_get_setting`, `dadix_set_setting`,  
`dadix_store_credential`, `dadix_credential_exists`, `dadix_delete_credential`

### Shell / QA

`dadix_pin_traffic_lights`, `dadix_poll_ui_script`, `dadix_write_ui_result`

## Neues Command anlegen

1. Methode an `ProjectHandle` in `dadix-core` (mit Test).
2. Dünner `#[tauri::command]` in `lib.rs` — kein SQL, kein Business-Branching.
3. In `generate_handler!` eintragen.
4. Wrapper in `lib/dadix.ts`.
5. Route in `callApi.ts` **oder** direkter Aufruf nur aus Desktop-Bridge-Dateien.
6. Web-DTO in `map.ts`, wenn die geteilte UI es sehen soll.

## Window-Globals (kein Tauri-Import in `app/src`)

| Global | Setzt | Nutzen |
| --- | --- | --- |
| `document.documentElement.dataset.dadixOs` | `App.tsx` | `isDadixDesktopShell()` |
| `window.__dadixOpenExternalUrl` | `App.tsx` | Systembrowser |
| `window.__dadixOpenAuxWindow` | `auxWindows.ts` | Table-Editor / Documents |
| `window.__dadixNotifyAuxClosed` | Aux-Pages | Main refetch |
| `window.__dadixPathname` / `__dadixAssignHref` | Navigation-Shim + Vite-Transform | Hash-Routing |

## Capabilities

`src-tauri/capabilities/default.json`: Fenster, Dialog, FS (begrenzt), Opener, Events. Neue Plugins nur hier und nur wenn die Shell sie braucht — nicht in `app/src`.
