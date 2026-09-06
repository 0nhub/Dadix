use super::sql::{page_sql, require_read_only};
use super::types::{
    connector_result, text_columns, ConnectorCapabilities, ConnectorQueryResult,
};
use super::{DatabaseConnector, RemoteColumn, RemoteTable};
use crate::error::{DadixError, DadixResult, ErrorCode};
use crate::paths::resolve_source_path;
use crate::query::{DadixType, QueryId, QueryRequest};
use rusqlite::{types::ValueRef, Connection};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Instant;

pub struct SqliteSession {
    conn: Mutex<Connection>,
}

impl SqliteSession {
    pub fn connect(project: &Path, uri: &str) -> DadixResult<Self> {
        let path = resolve_sqlite_path(project, uri)?;
        if !path.exists() {
            return Err(DadixError::new(
                ErrorCode::SourceNotFound,
                format!("sqlite file does not exist: {}", path.display()),
            ));
        }
        let conn = Connection::open(&path)?;
        conn.pragma_update(None, "query_only", "ON")?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }
}

impl DatabaseConnector for SqliteSession {
    fn capabilities(&self) -> ConnectorCapabilities {
        ConnectorCapabilities::sqlite()
    }

    fn test_connection(&self) -> DadixResult<()> {
        let conn = self.conn.lock().map_err(|_| DadixError::lock())?;
        conn.query_row("SELECT 1", [], |_| Ok(()))?;
        Ok(())
    }

    fn schemas(&self) -> DadixResult<Vec<String>> {
        Ok(vec!["main".into()])
    }

    fn tables(&self, _schema: Option<&str>) -> DadixResult<Vec<RemoteTable>> {
        let conn = self.conn.lock().map_err(|_| DadixError::lock())?;
        let mut stmt = conn.prepare(
            "SELECT name FROM sqlite_master
             WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%'
             ORDER BY name",
        )?;
        let rows = stmt.query_map([], |r| r.get::<_, String>(0))?;
        let mut tables = Vec::new();
        for name in rows {
            tables.push(RemoteTable {
                schema: Some("main".into()),
                name: name?,
            });
        }
        Ok(tables)
    }

    fn columns(&self, table: &str) -> DadixResult<Vec<RemoteColumn>> {
        crate::query::validate_ident(table)?;
        let conn = self.conn.lock().map_err(|_| DadixError::lock())?;
        let mut stmt = conn.prepare(&format!("PRAGMA table_info({table})"))?;
        let rows = stmt.query_map([], |r| {
            let native: String = r.get(2)?;
            Ok(RemoteColumn {
                name: r.get(1)?,
                dadix_type: sqlite_type(&native),
                native_type: native,
                nullable: r.get::<_, i64>(3)? == 0,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    fn execute_query(&self, request: QueryRequest) -> DadixResult<ConnectorQueryResult> {
        require_read_only(&request.sql)?;
        let started = Instant::now();
        let sql = page_sql(self.capabilities(), &request.sql, &request);
        let conn = self.conn.lock().map_err(|_| DadixError::lock())?;
        let mut stmt = conn.prepare(&sql)?;
        let names: Vec<String> = stmt.column_names().into_iter().map(|s| s.to_string()).collect();
        let natives = vec!["text".into(); names.len()];
        let mut rows = Vec::new();
        let mut has_more = false;
        let take = request.resolved_limit() as usize + 1;
        let mut query = stmt.query([])?;
        while let Some(row) = query.next()? {
            if rows.len() >= take {
                has_more = true;
                break;
            }
            let width = row.as_ref().column_count();
            let mut record = Vec::with_capacity(width);
            for i in 0..width {
                record.push(match row.get_ref(i)? {
                    ValueRef::Null => None,
                    other => Some(value_to_text(other)),
                });
            }
            rows.push(record);
        }
        if rows.len() > request.resolved_limit() as usize {
            has_more = true;
            rows.truncate(request.resolved_limit() as usize);
        }
        let (meta, typed) = text_columns(names, &natives, &rows);
        Ok(connector_result(&request, meta, typed, has_more, started))
    }

    fn cancel(&self, _query_id: &QueryId) -> DadixResult<()> {
        Ok(())
    }
}

fn sqlite_type(native: &str) -> DadixType {
    match native.to_ascii_uppercase().as_str() {
        "INT" | "INTEGER" | "BIGINT" => DadixType::Int64,
        "REAL" | "FLOAT" | "DOUBLE" => DadixType::Float64,
        "BLOB" => DadixType::Binary,
        _ => DadixType::String,
    }
}

fn resolve_sqlite_path(project: &Path, uri: &str) -> DadixResult<PathBuf> {
    if uri.starts_with("./") || uri.starts_with("../") {
        let dummy = crate::domain::Source {
            id: 0,
            name: String::new(),
            type_name: "sqlite".into(),
            kind: crate::domain::SourceKind::ExternalDatabase,
            path_mode: crate::paths::PathMode::Relative,
            uri: Some(uri.into()),
            options: None,
            credential: None,
            created_at: String::new(),
        };
        return Ok(resolve_source_path(project, &dummy)?.path);
    }
    Ok(PathBuf::from(uri))
}

fn value_to_text(value: ValueRef<'_>) -> String {
    match value {
        ValueRef::Null => String::new(),
        ValueRef::Integer(v) => v.to_string(),
        ValueRef::Real(v) => v.to_string(),
        ValueRef::Text(bytes) => String::from_utf8_lossy(bytes).into_owned(),
        ValueRef::Blob(bytes) => String::from_utf8_lossy(bytes).into_owned(),
    }
}
