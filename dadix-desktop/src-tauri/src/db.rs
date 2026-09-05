//! .dadix file = SQLite database. Schema and read/write layer.

use rusqlite::{Connection, params, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::Mutex;

const FORMAT_VERSION: i32 = 1;

pub struct DadixDb {
    conn: Mutex<Connection>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectMeta {
    pub id: i64,
    pub name: String,
    pub created_at: String,
    pub format_version: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TableRow {
    pub id: i64,
    pub name: String,
    pub reference_name: String,
    pub icon: String,
    pub order: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ColumnRow {
    pub id: i64,
    pub table_id: i64,
    pub name: String,
    pub type_name: String,
    pub options: Option<String>,
    pub order: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ViewRow {
    pub id: i64,
    pub table_id: i64,
    pub name: String,
    pub type_name: String,
    pub filter: Option<String>,
    pub sort: Option<String>,
    pub order: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GridViewColumnRow {
    pub id: i64,
    pub view_id: i64,
    pub column_id: i64,
    pub name: Option<String>,
    pub size: Option<i32>,
    pub order: i32,
    pub is_visible: bool,
    pub content_align: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ViewButtonRow {
    pub id: i64,
    pub view_id: i64,
    pub label: String,
    pub order: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecordRow {
    pub id: i64,
    #[serde(flatten)]
    pub data: serde_json::Value,
}

fn create_schema(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS project_meta (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            name TEXT NOT NULL DEFAULT 'Unnamed Project',
            created_at TEXT NOT NULL,
            format_version INTEGER NOT NULL
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
        "#,
    )?;
    Ok(())
}

impl DadixDb {
    /// Create a new .dadix file at the given path with default schema.
    pub fn create(path: &Path) -> rusqlite::Result<Self> {
        let conn = Connection::open(path)?;
        create_schema(&conn)?;
        let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();
        conn.execute(
            "INSERT OR REPLACE INTO project_meta (id, name, created_at, format_version) VALUES (1, ?, ?, ?)",
            params!["Unnamed Project", now, FORMAT_VERSION],
        )?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    /// Open an existing .dadix file.
    pub fn open(path: &Path) -> rusqlite::Result<Self> {
        let conn = Connection::open(path)?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    pub fn get_project_meta(&self) -> rusqlite::Result<ProjectMeta> {
        let conn = self.conn.lock().map_err(|_| rusqlite::Error::InvalidQuery)?;
        let mut stmt = conn.prepare(
            "SELECT id, name, created_at, format_version FROM project_meta WHERE id = 1",
        )?;
        let row = stmt.query_row([], |r| {
            Ok(ProjectMeta {
                id: r.get(0)?,
                name: r.get(1)?,
                created_at: r.get(2)?,
                format_version: r.get(3)?,
            })
        })?;
        Ok(row)
    }

    pub fn get_tables(&self) -> rusqlite::Result<Vec<TableRow>> {
        let conn = self.conn.lock().map_err(|_| rusqlite::Error::InvalidQuery)?;
        let mut stmt = conn.prepare(
            "SELECT id, name, reference_name, icon, order_index FROM tables ORDER BY order_index, id",
        )?;
        let rows = stmt.query_map([], |r| {
            Ok(TableRow {
                id: r.get(0)?,
                name: r.get(1)?,
                reference_name: r.get(2)?,
                icon: r.get(3)?,
                order: r.get(4)?,
            })
        })?;
        rows.collect()
    }

    pub fn get_table(&self, id: i64) -> rusqlite::Result<Option<TableRow>> {
        let conn = self.conn.lock().map_err(|_| rusqlite::Error::InvalidQuery)?;
        let mut stmt = conn.prepare(
            "SELECT id, name, reference_name, icon, order_index FROM tables WHERE id = ?",
        )?;
        stmt.query_row([id], |r| {
            Ok(TableRow {
                id: r.get(0)?,
                name: r.get(1)?,
                reference_name: r.get(2)?,
                icon: r.get(3)?,
                order: r.get(4)?,
            })
        })
        .optional()
    }

    pub fn get_columns(&self, table_id: i64) -> rusqlite::Result<Vec<ColumnRow>> {
        let conn = self.conn.lock().map_err(|_| rusqlite::Error::InvalidQuery)?;
        let mut stmt = conn.prepare(
            "SELECT id, table_id, name, type_name, options, order_index FROM columns WHERE table_id = ? ORDER BY order_index, id",
        )?;
        let rows = stmt.query_map([table_id], |r| {
            Ok(ColumnRow {
                id: r.get(0)?,
                table_id: r.get(1)?,
                name: r.get(2)?,
                type_name: r.get(3)?,
                options: r.get(4)?,
                order: r.get(5)?,
            })
        })?;
        rows.collect()
    }

    pub fn get_views(&self, table_id: i64) -> rusqlite::Result<Vec<ViewRow>> {
        let conn = self.conn.lock().map_err(|_| rusqlite::Error::InvalidQuery)?;
        let mut stmt = conn.prepare(
            "SELECT id, table_id, name, type_name, filter, sort, order_index FROM views WHERE table_id = ? ORDER BY order_index, id",
        )?;
        let rows = stmt.query_map([table_id], |r| {
            Ok(ViewRow {
                id: r.get(0)?,
                table_id: r.get(1)?,
                name: r.get(2)?,
                type_name: r.get(3)?,
                filter: r.get(4)?,
                sort: r.get(5)?,
                order: r.get(6)?,
            })
        })?;
        rows.collect()
    }

    pub fn get_view(&self, view_id: i64) -> rusqlite::Result<Option<ViewRow>> {
        let conn = self.conn.lock().map_err(|_| rusqlite::Error::InvalidQuery)?;
        let mut stmt = conn.prepare(
            "SELECT id, table_id, name, type_name, filter, sort, order_index FROM views WHERE id = ?",
        )?;
        stmt.query_row([view_id], |r| {
            Ok(ViewRow {
                id: r.get(0)?,
                table_id: r.get(1)?,
                name: r.get(2)?,
                type_name: r.get(3)?,
                filter: r.get(4)?,
                sort: r.get(5)?,
                order: r.get(6)?,
            })
        })
        .optional()
    }

    pub fn get_grid_view_columns(&self, view_id: i64) -> rusqlite::Result<Vec<GridViewColumnRow>> {
        let conn = self.conn.lock().map_err(|_| rusqlite::Error::InvalidQuery)?;
        let mut stmt = conn.prepare(
            "SELECT id, view_id, column_id, name, size, order_index, is_visible, content_align FROM grid_view_columns WHERE view_id = ? ORDER BY order_index, id",
        )?;
        let rows = stmt.query_map([view_id], |r| {
            Ok(GridViewColumnRow {
                id: r.get(0)?,
                view_id: r.get(1)?,
                column_id: r.get(2)?,
                name: r.get(3)?,
                size: r.get(4)?,
                order: r.get(5)?,
                is_visible: r.get::<_, i32>(6)? != 0,
                content_align: r.get(7)?,
            })
        })?;
        rows.collect()
    }

    /// Get records for a table with optional limit and offset (for virtualization).
    pub fn get_records(
        &self,
        table_id: i64,
        limit: i64,
        offset: i64,
    ) -> rusqlite::Result<Vec<RecordRow>> {
        let conn = self.conn.lock().map_err(|_| rusqlite::Error::InvalidQuery)?;
        let mut stmt = conn.prepare(
            "SELECT id, data FROM records WHERE table_id = ? ORDER BY id LIMIT ? OFFSET ?",
        )?;
        let rows = stmt.query_map(params![table_id, limit, offset], |r| {
            let id: i64 = r.get(0)?;
            let data_str: String = r.get(1)?;
            let data: serde_json::Value = serde_json::from_str(&data_str).unwrap_or(serde_json::json!({}));
            Ok(RecordRow { id, data })
        })?;
        rows.collect()
    }

    pub fn get_record_count(&self, table_id: i64) -> rusqlite::Result<i64> {
        let conn = self.conn.lock().map_err(|_| rusqlite::Error::InvalidQuery)?;
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM records WHERE table_id = ?",
            [table_id],
            |r| r.get(0),
        )?;
        Ok(count)
    }

    /// Create a new table and a default grid view.
    pub fn create_table(&self, name: &str) -> rusqlite::Result<TableRow> {
        let conn = self.conn.lock().map_err(|_| rusqlite::Error::InvalidQuery)?;
        let order: i32 = conn.query_row("SELECT COALESCE(MAX(order_index), -1) + 1 FROM tables", [], |r| r.get(0))?;
        let ref_name = format!("t_{}", uuid::Uuid::new_v4().to_string().replace('-', ""));
        conn.execute(
            "INSERT INTO tables (name, reference_name, icon, order_index) VALUES (?, ?, 'Table', ?)",
            params![name, ref_name, order],
        )?;
        let id = conn.last_insert_rowid();
        conn.execute(
            "INSERT INTO views (table_id, name, type_name, order_index) VALUES (?, 'Alle Einträge', 'gridView', 0)",
            [id],
        )?;
        Ok(TableRow {
            id,
            name: name.to_string(),
            reference_name: ref_name,
            icon: "Table".to_string(),
            order,
        })
    }

    /// Add a column to a table.
    pub fn create_column(&self, table_id: i64, name: &str, type_name: &str) -> rusqlite::Result<ColumnRow> {
        let conn = self.conn.lock().map_err(|_| rusqlite::Error::InvalidQuery)?;
        let order: i32 = conn.query_row(
            "SELECT COALESCE(MAX(order_index), -1) + 1 FROM columns WHERE table_id = ?",
            [table_id],
            |r| r.get(0),
        )?;
        conn.execute(
            "INSERT INTO columns (table_id, name, type_name, order_index) VALUES (?, ?, ?, ?)",
            params![table_id, name, type_name, order],
        )?;
        let id = conn.last_insert_rowid();
        Ok(ColumnRow {
            id,
            table_id,
            name: name.to_string(),
            type_name: type_name.to_string(),
            options: None,
            order,
        })
    }
}
