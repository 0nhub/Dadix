# dadix-core

Pfad: [`crates/dadix-core`](../crates/dadix-core)

Der Core ist die einzige Stelle für Projektlogik der Desktop-Linie. Kein Tauri, kein React, kein Next.js, kein Express.

Zwei Ebenen in einem Handle:

| Ebene | Engine | Aufgabe |
| --- | --- | --- |
| Control Plane | SQLite (`rusqlite`, bundled) | Die `.dadix`-Datei: Meta, Tabellen, Spalten, Views, JSON-Records, Sources, Settings |
| Data Plane | DuckDB (`:memory:`) | SQL über verlinkte Dateien; nicht als `Projekt.duckdb` daneben schreiben |
| Externe DBs | Connector-Sessions | Je Source eine Engine, read-only, kein Cross-Engine-Join (Phase 7) |

Versionen (`src/schema.rs`):

- `FORMAT_VERSION = 3`
- `MINIMUM_READER_VERSION = 3`
- `APP_VERSION = CARGO_PKG_VERSION`

## Öffentliche Crate-API

Re-Exports in `src/lib.rs`. Die alltägliche Anwendungs-API hängt zusätzlich an `ProjectHandle` (in `project.rs` / `store.rs` / `files.rs` / `connectors/`), auch wenn nicht jeder Store-Name oben `pub use` ist.

### Lifecycle

`create_project`, `open_project`, `open_project_readonly`, `open_project_with`, `close_project`, `save_project`, `migrate_project`, `validate_project`, `list_project_recovery`, `restore_project_backup`, `peek_format_version`

### Typen

`Project`, `Table`, `Column` (UI sagt „Field“), `View`, `GridViewColumn`, `ViewButton`, `Record`, `RecordPage`, `Source`, `SourceKind`, `SourceTable`, `Job`, `Setting`, `CredentialRef`, `MissingSource`, `AccessMode`, `ValidationReport`, `RecoveryArtifact`

### Query

`QuerySession`, `QueryEngine`, `DuckDbQueryEngine`, `QueryRequest`, `QueryResult`, `QueryPayload`, `DEFAULT_QUERY_LIMIT` (1000), `MAX_QUERY_LIMIT` (10000)

### Fehler

`DadixError`, `DadixResult<T>`, `ErrorCode` — stabile `SCREAMING_SNAKE_CASE`-Codes, keine Ad-hoc-Strings nach oben reichen.

## Projekt öffnen — was passiert, was nicht

`open_project_with` (`src/project.rs`):

1. Extension `.dadix`, Existenz, SQLite-Header
2. Neuere Formate ablehnen (`UNSUPPORTED_NEWER_FORMAT`) — Datei wird nicht umgeschrieben
3. Sibling-Lock `{pfad}.dadix.lock` (`src/lock.rs`, fs4; RW exklusiv, RO shared)
4. RW + alte Version: `.bak`, dann Migration Schritt für Schritt
5. RO + Migration nötig: Fehler `MIGRATION`
6. rusqlite-Connection
7. `QuerySession::in_memory()` — frisches DuckDB, **nicht persistiert**
8. Credential-Store (Tests: Memory, sonst OS)
9. Leere Connector-Session-Map

**Nicht** beim Open:

- alle File-Sources binden
- `DESCRIBE` auf `read_csv_auto` (hängt bei großen CSVs, blockiert den Invoke)

Bind ist **lazy**:

- `execute_query` ruft zuerst `bind_file_sources()`
- `link_file` / `add_source` synct diese eine Source
- explizit: `bind_file_sources`, `preview_source`, `describe_source`

Deshalb darf niemand „beim Open alle Dateien DESCRIBE-en“ zurückbauen. Große QA-CSVs (z. B. 100k Zeilen) haben den Start sonst eingefroren.

## Speichern und Schließen

- `save`: `updated_at` → `VACUUM INTO .tmp` → Snapshot validieren → Connection schließen → atomar ersetzen → neu öffnen
- `close`: Query-Session herunterfahren, bei RW automatisch `save`
- Lock fällt mit dem Handle

## SQLite-Schema (v3)

DDL: `src/schema.rs` → `create_schema()`.

| Tabelle | Rolle |
| --- | --- |
| `project_meta` | genau eine Zeile (`id=1`): `project_id`, Name, Zeiten, `format_version`, `minimum_reader_version` |
| `tables` | `name`, `reference_name` UNIQUE, `icon`, `order_index` |
| `columns` | Feldschema: `type_name`, `options` (JSON), `order_index` |
| `views` | `type_name`, `filter`, `sort` (JSON-Strings) |
| `grid_view_columns` | Breite, Order, Sichtbarkeit, Align |
| `view_buttons` | View-only Buttons |
| `records` | PK `(table_id, id)`, `data` TEXT JSON |
| `sources` | `kind`, `path_mode`, `uri`, `options`, `credential_id` |
| `source_tables` | `logical_name` → DuckDB-Viewname |
| `jobs` | geplant, noch nicht als Engine ausgebaut |
| `settings` | Key/Value; verbotene Secret-Keys werden abgelehnt |

`sources.kind`: `embedded_table` \| `embedded_file` \| `linked_file` \| `external_database`  
`sources.path_mode`: `embedded` \| `absolute` \| `relative`

Pragmas: `foreign_keys=ON`, `journal_mode=DELETE`.

### Migrationen

`src/migrate.rs` — immer nur eine Version weiter, nie Sprung auf Current.

| Von | Nach | Inhalt |
| --- | --- | --- |
| v1 | v2 | volle Objektsuite |
| v2 | v3 | `project_id`, `updated_at`, `app_version`, `minimum_reader_version`, `sources.kind` |

## Dateiquellen

`src/files.rs`

Formate: `Csv`, `Tsv`, `Parquet`, `Json`, `Ndjson`.

DuckDB-Scan:

- CSV/TSV → `read_csv_auto`
- Parquet → `read_parquet`
- JSON → `read_json_auto`
- NDJSON → `read_ndjson_auto`

Die Datei wird **nicht** in `.dadix` kopiert. Das Projekt speichert den Link.

### Pfade

| Mode | Bedeutung |
| --- | --- |
| `relative` | `./data/umsatz.csv` relativ zum Projektordner, bleibt beim Umzug tragbar |
| `absolute` | fester Pfad; HTTP-URLs nutzen diesen Mode |
| `embedded` | `{projekt}.dadix.d/{dateiname}` |

`normalize_relative_uri` erzwingt `./…` ohne `..`.

### HTTP

`link_http_file`: nur `http://` / `https://`, nur JSON/NDJSON, Download in Temp (`ureq`, rustls, **8s Timeout**), dann DuckDB-View. Write-back auf HTTP ist verboten. Secret-URIs (`user:password@`, `password=`, `api_key=`) → `SECRET_IN_PROJECT`.

### Bind einer Datei

`sync_file_source`: Pfad auflösen oder HTTP laden → `CREATE OR REPLACE TEMP VIEW {logical} AS {scan_sql}`. Fehlende Datei: in RW versuchen zu heilen (`file_id.rs`, device/inode). Fehler sind oft weich (`bound=false`), nicht immer `Err`.

`execute_query` re-bindet **alle** File-Sources (HTTP wird erneut geholt). Das ist Absicht, hat aber Kosten.

## Query-Engine

`src/query/`

- eine In-Memory-DuckDB-Connection pro offenem Projekt
- `classify_sql` → `StatementKind`
- Limit default 1000, hart 10000
- `has_more`, wenn eine Extra-Zeile geholt wurde
- Ergebnis **spaltenweise** (`QueryPayload::Columnar`) — Architektur nicht auf `Vec<Vec<String>>` festnageln; `ArrowIpc` ist reserviert, noch nicht produziert
- Cancel über `InterruptHandle`

Zwei SQL-Wege, nicht vermischen:

| Aufruf | Engine |
| --- | --- |
| `execute_query` | DuckDB (Dateien + Ad-hoc) |
| `execute_source_query` | Connector der einen Source |

Eingebettete Grid-Records laufen über `query_records` → `table_query.rs` (bis 1M Zeilen im Speicher filtern). Das ist **nicht** DuckDB.

## Externe Datenbanken

`src/connectors/`

| Engine | String | Default-Port | Parameter |
| --- | --- | --- | --- |
| SQLite | `sqlite` | — | `?` |
| PostgreSQL | `postgresql` | 5432 | `$` |
| MySQL | `mysql` | 3306 | `?` |
| SQL Server | `sqlserver` | 1433 | `@pN` |

Alle Connectoren sind **read-only** (`require_read_only` → `READ_ONLY` bei INSERT/UPDATE/DELETE).

SQL Server: TLS an, `trust_server_certificate` default **false**. Cancel kann die Connection ungültig machen (`cancel_invalidates_connection`).

URI der Source: `host:port/db` **ohne** Userinfo. Passwort nur im OS-Store unter `credential_id`. Service-Name: `dev.dadix.app`.

## Secrets

- Datei speichert höchstens `credential_id`
- `secrets.rs` blockt Keys wie `password`, `token`, `api_key` in Settings und Source-Options
- `reject_secret_uri` blockt Credentials in URIs
- CLI: `dadix-credential` (`src/bin/dadix_credential.rs`) `set|exists|delete`

## ErrorCode (vollständig)

`INVALID_PATH`, `INVALID_PROJECT`, `PROJECT_NOT_OPEN`, `PROJECT_ALREADY_EXISTS`, `IO`, `DATABASE`, `MIGRATION`, `VALIDATION`, `PATH_RESOLUTION`, `LOCK`, `SECRET_IN_PROJECT`, `UNSUPPORTED_FORMAT`, `UNSUPPORTED_NEWER_FORMAT`, `NOT_FOUND`, `PROJECT_LOCKED`, `SOURCE_NOT_FOUND`, `INCOMPLETE_SAVE`, `READ_ONLY`, `QUERY_SYNTAX_ERROR`, `QUERY_CANCELLED`, `QUERY_TIMEOUT`, `QUERY_ENGINE_ERROR`, `QUERY_RESULT_TOO_LARGE`, `CREDENTIAL_STORE`, `CONNECTOR`, `CONNECT_TIMEOUT`

`PROJECT_LOCKED` ist der normale Fall, wenn dieselbe `.dadix` schon offen ist (zweite Instanz oder hängengebliebenes Lock nach Kill).

## Tests und Benches

```bash
cargo test -p dadix-core
cargo bench -p dadix-core --bench duckdb_query
cargo bench -p dadix-core --bench file_sources
cargo bench -p dadix-core --bench large_file
```

Live-Tests unter `tests/*_live.rs` brauchen erreichbare Hosts und dürfen Secrets nicht loggen.

## Invarianten (nicht „verbessern“)

1. Kein persistentes Sibling-`*.duckdb` automatisch anlegen.
2. Kein `DESCRIBE`/Vollscan aller Sources beim Open.
3. Keine Secrets in die Datei schreiben.
4. Userwerte nicht in SQL-Strings konkatenieren — bound parameters.
5. Keine GUI-/Tauri-Dependency in diese Crate.
6. Neuere Formate nicht still überschreiben.
7. Speichern nur atomar (tmp → validate → replace).
