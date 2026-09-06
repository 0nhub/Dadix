//! Current `.dadix` SQLite schema (format_version 3).

use rusqlite::{Connection, OptionalExtension};

pub const FORMAT_VERSION: i32 = 3;
pub const APP_VERSION: &str = env!("CARGO_PKG_VERSION");
pub const MINIMUM_READER_VERSION: i32 = 3;

pub fn create_schema(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS project_meta (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            project_id TEXT NOT NULL,
            name TEXT NOT NULL DEFAULT 'Unnamed Project',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            app_version TEXT NOT NULL,
            format_version INTEGER NOT NULL,
            minimum_reader_version INTEGER NOT NULL DEFAULT 3
        );
        CREATE TABLE IF NOT EXISTS tables (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            reference_name TEXT NOT NULL UNIQUE,
            icon TEXT NOT NULL DEFAULT 'Table',
            order_index INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS columns (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            table_id INTEGER NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            type_name TEXT NOT NULL DEFAULT 'TEXT',
            options TEXT,
            order_index INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS views (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            table_id INTEGER NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            type_name TEXT NOT NULL DEFAULT 'gridView',
            filter TEXT,
            sort TEXT,
            order_index INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS grid_view_columns (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            view_id INTEGER NOT NULL REFERENCES views(id) ON DELETE CASCADE,
            column_id INTEGER NOT NULL REFERENCES columns(id) ON DELETE CASCADE,
            name TEXT,
            size INTEGER,
            order_index INTEGER NOT NULL DEFAULT 0,
            is_visible INTEGER NOT NULL DEFAULT 1,
            content_align TEXT
        );
        CREATE TABLE IF NOT EXISTS view_buttons (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            view_id INTEGER NOT NULL REFERENCES views(id) ON DELETE CASCADE,
            label TEXT NOT NULL,
            order_index INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS records (
            table_id INTEGER NOT NULL,
            id INTEGER NOT NULL,
            data TEXT NOT NULL,
            PRIMARY KEY (table_id, id)
        );
        CREATE INDEX IF NOT EXISTS idx_records_table_id ON records(table_id);
        CREATE TABLE IF NOT EXISTS sources (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            type_name TEXT NOT NULL,
            kind TEXT NOT NULL DEFAULT 'linked_file'
                CHECK (kind IN ('embedded_table', 'embedded_file', 'linked_file', 'external_database')),
            path_mode TEXT NOT NULL CHECK (path_mode IN ('embedded', 'absolute', 'relative')),
            uri TEXT,
            options TEXT,
            credential_id TEXT,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS source_tables (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
            logical_name TEXT NOT NULL,
            remote_name TEXT,
            options TEXT
        );
        CREATE TABLE IF NOT EXISTS jobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            enabled INTEGER NOT NULL DEFAULT 0,
            schedule TEXT,
            payload TEXT,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        "#,
    )?;
    Ok(())
}

/// v2 objects only — used by the v1→v2 migration, not as a jump-to-current.
pub fn create_v2_objects(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS tables (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            reference_name TEXT NOT NULL UNIQUE,
            icon TEXT NOT NULL DEFAULT 'Table',
            order_index INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS columns (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            table_id INTEGER NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            type_name TEXT NOT NULL DEFAULT 'TEXT',
            options TEXT,
            order_index INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS views (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            table_id INTEGER NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            type_name TEXT NOT NULL DEFAULT 'gridView',
            filter TEXT,
            sort TEXT,
            order_index INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS grid_view_columns (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            view_id INTEGER NOT NULL REFERENCES views(id) ON DELETE CASCADE,
            column_id INTEGER NOT NULL REFERENCES columns(id) ON DELETE CASCADE,
            name TEXT,
            size INTEGER,
            order_index INTEGER NOT NULL DEFAULT 0,
            is_visible INTEGER NOT NULL DEFAULT 1,
            content_align TEXT
        );
        CREATE TABLE IF NOT EXISTS view_buttons (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            view_id INTEGER NOT NULL REFERENCES views(id) ON DELETE CASCADE,
            label TEXT NOT NULL,
            order_index INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS records (
            table_id INTEGER NOT NULL,
            id INTEGER NOT NULL,
            data TEXT NOT NULL,
            PRIMARY KEY (table_id, id)
        );
        CREATE INDEX IF NOT EXISTS idx_records_table_id ON records(table_id);
        CREATE TABLE IF NOT EXISTS sources (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            type_name TEXT NOT NULL,
            path_mode TEXT NOT NULL CHECK (path_mode IN ('embedded', 'absolute', 'relative')),
            uri TEXT,
            options TEXT,
            credential_id TEXT,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS source_tables (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
            logical_name TEXT NOT NULL,
            remote_name TEXT,
            options TEXT
        );
        CREATE TABLE IF NOT EXISTS jobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            enabled INTEGER NOT NULL DEFAULT 0,
            schedule TEXT,
            payload TEXT,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        "#,
    )?;
    Ok(())
}

pub fn read_format_version(conn: &Connection) -> rusqlite::Result<Option<i32>> {
    conn.query_row(
        "SELECT format_version FROM project_meta WHERE id = 1",
        [],
        |r| r.get(0),
    )
    .optional()
}

pub fn read_minimum_reader_version(conn: &Connection) -> rusqlite::Result<Option<i32>> {
    if !has_column(conn, "project_meta", "minimum_reader_version")? {
        return Ok(None);
    }
    conn.query_row(
        "SELECT minimum_reader_version FROM project_meta WHERE id = 1",
        [],
        |r| r.get(0),
    )
    .optional()
}

pub fn table_exists(conn: &Connection, name: &str) -> rusqlite::Result<bool> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?",
        [name],
        |r| r.get(0),
    )?;
    Ok(count > 0)
}

pub fn has_column(conn: &Connection, table: &str, column: &str) -> rusqlite::Result<bool> {
    let mut stmt = conn.prepare(&format!("PRAGMA table_info({table})"))?;
    let rows = stmt.query_map([], |r| r.get::<_, String>(1))?;
    for row in rows {
        if row? == column {
            return Ok(true);
        }
    }
    Ok(false)
}

pub fn configure_connection(conn: &Connection) -> rusqlite::Result<()> {
    conn.pragma_update(None, "foreign_keys", "ON")?;
    let _ = conn.pragma_update(None, "journal_mode", "DELETE");
    Ok(())
}

pub fn now_utc() -> String {
    chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string()
}
