//! Sequential schema migrations: v1 → v2 → v3. Each step is independently testable.

use crate::error::{DadixError, DadixResult, ErrorCode};
use crate::schema::{
    create_v2_objects, has_column, now_utc, read_format_version, read_minimum_reader_version,
    table_exists, APP_VERSION, FORMAT_VERSION, MINIMUM_READER_VERSION,
};
use rusqlite::Connection;

pub fn apply_migrations(conn: &Connection) -> DadixResult<i32> {
    let mut version = read_format_version(conn)?.ok_or_else(|| {
        DadixError::new(
            ErrorCode::InvalidProject,
            "file is SQLite but has no Dadix project_meta",
        )
    })?;

    if let Some(min_reader) = read_minimum_reader_version(conn)? {
        if min_reader > FORMAT_VERSION {
            return Err(DadixError::new(
                ErrorCode::UnsupportedNewerFormat,
                format!(
                    "file requires reader version {min_reader}; this core supports {FORMAT_VERSION}"
                ),
            ));
        }
    }

    if version > FORMAT_VERSION {
        return Err(DadixError::new(
            ErrorCode::UnsupportedNewerFormat,
            format!("file format {version} is newer than this core ({FORMAT_VERSION})"),
        ));
    }

    if version < 1 {
        return Err(DadixError::new(
            ErrorCode::InvalidProject,
            format!("unsupported format_version {version}"),
        ));
    }

    while version < FORMAT_VERSION {
        match version {
            1 => migrate_v1_to_v2(conn)?,
            2 => migrate_v2_to_v3(conn)?,
            other => {
                return Err(DadixError::new(
                    ErrorCode::Migration,
                    format!("no migration path from format_version {other}"),
                ));
            }
        }
        version += 1;
        conn.execute(
            "UPDATE project_meta SET format_version = ? WHERE id = 1",
            [version],
        )?;
    }

    Ok(version)
}

/// Add sources/jobs/settings and the v2 table suite. Does not add v3 metadata.
pub fn migrate_v1_to_v2(conn: &Connection) -> DadixResult<()> {
    create_v2_objects(conn)?;
    if !table_exists(conn, "sources")? {
        return Err(DadixError::new(
            ErrorCode::Migration,
            "v1→v2 failed to create sources",
        ));
    }
    Ok(())
}

/// Project identity metadata, source kinds, updated_at.
pub fn migrate_v2_to_v3(conn: &Connection) -> DadixResult<()> {
    add_column(conn, "project_meta", "project_id", "TEXT")?;
    add_column(conn, "project_meta", "updated_at", "TEXT")?;
    add_column(conn, "project_meta", "app_version", "TEXT")?;
    add_column(conn, "project_meta", "minimum_reader_version", "INTEGER")?;
    add_column(conn, "sources", "kind", "TEXT")?;

    let now = now_utc();
    let project_id = uuid::Uuid::new_v4().to_string();
    let created: String = conn
        .query_row(
            "SELECT created_at FROM project_meta WHERE id = 1",
            [],
            |r| r.get(0),
        )
        .unwrap_or_else(|_| now.clone());

    conn.execute(
        "UPDATE project_meta SET
            project_id = CASE WHEN project_id IS NULL OR project_id = '' THEN ?1 ELSE project_id END,
            updated_at = CASE WHEN updated_at IS NULL OR updated_at = '' THEN ?2 ELSE updated_at END,
            app_version = CASE WHEN app_version IS NULL OR app_version = '' THEN ?3 ELSE app_version END,
            minimum_reader_version = COALESCE(minimum_reader_version, ?4)
         WHERE id = 1",
        rusqlite::params![project_id, created, APP_VERSION, MINIMUM_READER_VERSION],
    )?;

    if table_exists(conn, "sources")? {
        conn.execute(
            "UPDATE sources SET kind = CASE
                WHEN kind IS NOT NULL AND kind != '' THEN kind
                WHEN path_mode = 'embedded' AND (uri IS NULL OR uri = '') THEN 'embedded_table'
                WHEN path_mode = 'embedded' THEN 'embedded_file'
                ELSE 'linked_file'
             END",
            [],
        )?;
    }

    Ok(())
}

fn add_column(conn: &Connection, table: &str, column: &str, decl: &str) -> DadixResult<()> {
    if has_column(conn, table, column)? {
        return Ok(());
    }
    conn.execute(
        &format!("ALTER TABLE {table} ADD COLUMN {column} {decl}"),
        [],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::schema::{has_column, table_exists};

    fn v1_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            r#"
            CREATE TABLE project_meta (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                name TEXT NOT NULL,
                created_at TEXT NOT NULL,
                format_version INTEGER NOT NULL
            );
            INSERT INTO project_meta (id, name, created_at, format_version)
            VALUES (1, 'Legacy', '2026-01-01T00:00:00Z', 1);
            "#,
        )
        .unwrap();
        conn
    }

    #[test]
    fn v1_to_v2_adds_sources_not_project_id() {
        let conn = v1_conn();
        migrate_v1_to_v2(&conn).unwrap();
        conn.execute(
            "UPDATE project_meta SET format_version = 2 WHERE id = 1",
            [],
        )
        .unwrap();
        assert!(table_exists(&conn, "sources").unwrap());
        assert!(table_exists(&conn, "jobs").unwrap());
        assert!(!has_column(&conn, "project_meta", "project_id").unwrap());
        assert_eq!(read_format_version(&conn).unwrap(), Some(2));
    }

    #[test]
    fn v2_to_v3_adds_identity_and_kind() {
        let conn = v1_conn();
        migrate_v1_to_v2(&conn).unwrap();
        conn.execute(
            "UPDATE project_meta SET format_version = 2 WHERE id = 1",
            [],
        )
        .unwrap();
        migrate_v2_to_v3(&conn).unwrap();
        conn.execute(
            "UPDATE project_meta SET format_version = 3 WHERE id = 1",
            [],
        )
        .unwrap();
        assert!(has_column(&conn, "project_meta", "project_id").unwrap());
        assert!(has_column(&conn, "project_meta", "updated_at").unwrap());
        assert!(has_column(&conn, "sources", "kind").unwrap());
        let id: String = conn
            .query_row(
                "SELECT project_id FROM project_meta WHERE id = 1",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert!(!id.is_empty());
    }

    #[test]
    fn apply_migrations_runs_steps_in_order() {
        let conn = v1_conn();
        let version = apply_migrations(&conn).unwrap();
        assert_eq!(version, FORMAT_VERSION);
        assert_eq!(read_format_version(&conn).unwrap(), Some(FORMAT_VERSION));
    }

    #[test]
    fn newer_format_is_rejected_without_write() {
        let conn = v1_conn();
        apply_migrations(&conn).unwrap();
        conn.execute(
            "UPDATE project_meta SET format_version = 99 WHERE id = 1",
            [],
        )
        .unwrap();
        let err = apply_migrations(&conn).unwrap_err();
        assert_eq!(err.code, ErrorCode::UnsupportedNewerFormat);
        assert_eq!(read_format_version(&conn).unwrap(), Some(99));
    }
}
