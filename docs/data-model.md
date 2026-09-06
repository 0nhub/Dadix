# Datenmodell

Zwei Welten, ein UI-Vokabular. Die Web-Typen leben in `app/src/types/index.ts`. Die Desktop-Wahrheit lebt in `crates/dadix-core/src/domain.rs` plus SQLite. Der Desktop-Bridge (`map.ts`) übersetzt zwischen beiden.

## Begriffe

| UI / Web | Core | Hinweis |
| --- | --- | --- |
| Field | `Column` | Niemals `Field` im Rust-Core |
| Table | `Table` | `reference_name` ist der stabile Slug |
| View | `View` | `filter` / `sort` als JSON-Strings |
| Record | `Record` | SQLite: JSON in `records.data`; serde flacht Keys auf Top-Level |
| Project | `Project` | Web: UUID in Postgres; Desktop: Datei + `project_id` in `project_meta` |
| Source | `Source` | nur Desktop-Core (Web importiert eher in Postgres) |

## Feldtypen (UI)

`DadixFieldDataTypes` in `app/src/types/index.ts` und Registry in `app/src/constants/index.ts`:

| `value` | Anzeigename | Bemerkung |
| --- | --- | --- |
| `TEXT` | Text | Inline-Edit, Action `openUrl` erlaubt |
| `INTEGER` | Number | |
| `CHOICE` | Choice | Optionen/Tags, Farben |
| `BOOLEAN` | Switch | |
| `DATE` | Date | |
| `FORMULA` | JavaScript | Client-Worker + Core `eval_formula` (`#Feldname`) |
| `CODE` | Code | Action `openUrl` erlaubt |
| `RELATION` | Connect | Desktop: Relationen in Settings `rel:{tableId}:{recordId}:{relationId}` |
| `AI` | AI | vor allem Web (`POST /ai/complete`); auf Desktop im Header ausgeblendet |
| `FILE` | File | Bild, max 8 MB, JSON `{ name, mime, size, dataUrl }` — `app/src/lib/fileField.ts` |
| `UUID` / `SERIAL` | (Legacy/Web) | in Typ-Union, nicht in der sichtbaren Palette |
| `VIEW_BUTTON` | Button | **keine** Tabellenspalte, nur View |

`FieldActions`: `null | 'copy' | 'edit' | 'openUrl'`.

- `openUrl` nur sinnvoll bei `TEXT` / `FORMULA` / `CODE`
- Grid: `data-field-action`, `data-cell-value` auf der Zelle
- Desktop: `openExternalUrl` → `window.__dadixOpenExternalUrl` → `@tauri-apps/plugin-opener`
- Bloßes `window.open` öffnet in Tauri **nicht** den Systembrowser

## View-Typen

`IDadixViewTypes`: `gridView`, `formView`, `kanbanView`, `chartView`, `calendarView`, `timelineView`, `mapView`, `pivotTableView`, `dashboardView`.

**Implementiert in der UI:** `gridView`. Andere Typen dürfen in der API existieren, haben aber keine volle Oberfläche.

Grid-Spalte (`IDadixGridView` / `grid_view_columns`): `size`, `order`, `isVisible`, `contentAlign`, optional frozen.

Sort persistiert über `patchView` + `parseViewSort` (`app/src/lib/view.ts` / Grid-Context).

## Rollen (nur Web)

`MemberRole`: `Owner` | `Admin` | `Editor` | `Viewer`.

Desktop: `useRequireRole` im Bridge gibt immer volle Edit-Rechte. Nicht so tun, als gäbe es dort Mitgliederverwaltung.

## `.dadix` Control Plane

Siehe Tabellenliste in [core.md](./core.md). Wichtige Semantik:

### Source-Arten

| `SourceKind` | Daten liegen … | Datei nötig? |
| --- | --- | --- |
| `EmbeddedTable` | in `records` | nein |
| `EmbeddedFile` | in `{projekt}.dadix.d/` | ja |
| `LinkedFile` | am Originalpfad / HTTP | ja |
| `ExternalDatabase` | auf dem Server | nein |

### Neue Tabelle in der UI (Desktop)

`create-table-dialog.tsx` Source-Radios:

1. **Lokal** — `create_table` + Records in SQLite
2. **Verknüpfte Datei** — `linkFile` (`csv`/`tsv`/`parquet`/`json`/`jsonl`/`ndjson`)
3. **Externe Quelle** — Engine-Radios: PostgreSQL, MySQL, SQL Server, SQLite, **JSON-Datei**, **NDJSON/JSONL**

JSON-Engine in der UI wird als `sourceKind: 'linked_file'` + `filePath` + `fileFormat` angelegt, nicht als `external_database`.

HTTP(S) JSON/NDJSON: URL-Feld → `link_http_file` im Core.

## Records

### Web

`app/src/lib/record.ts` → `GET/POST/PATCH/DELETE /record`. Filter-Syntax `eq(name,"John")` usw. (siehe `app/server/README.md`).

### Desktop / Core

- Eingebettet: `insert_record` / `update_record` / `query_records`
- Linked File: Bridge liest `previewSource`, schreibt `writeFileSource` (atomar, wo implementiert)
- External DB: `execute_source_query` (nur Lesen)

Record-JSON: Spaltenkeys auf Top-Level. Feld-Umbenennen muss Keys mitziehen (`fieldNames.ts`: echte Namen nicht durch generisches „Field“/„Feld“ überschreiben).

## Settings-Keys (Desktop, Auszug)

Freie Key/Value-Tabelle, aber:

- Secret-ähnliche Keys werden vom Core abgelehnt
- Relationen der Bridge: `rel:{tableId}:{recordId}:{relationId}`

Nicht als zweite Datenbank für Tabelleninhalte missbrauchen.

## Dateiformat-Vertrag

Ein neuer Reader **muss** `format_version` und `minimum_reader_version` ehren.

- kleiner als 3 → Migration nacheinander
- größer als bekannt → `UNSUPPORTED_NEWER_FORMAT`, Datei unangetastet
- Speichern nur tmp → validate → replace
- Lock-Datei ist kein Teil des Dokuments und gehört nicht ins Git
