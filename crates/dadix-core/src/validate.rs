//! Project validation: schema, versions, secrets, sources, referential integrity.

use crate::atomic::list_recovery_artifacts;
use crate::domain::{RecoveryKind, SourceKind, ValidationIssue, ValidationReport};
use crate::error::{DadixError, ErrorCode};
use crate::paths::{is_dadix_path, resolve_source_path, PathMode};
use crate::schema::{
    has_column, read_format_version, read_minimum_reader_version, table_exists, FORMAT_VERSION,
};
use crate::secrets::{is_forbidden_secret_key, reject_secret_options};
use rusqlite::Connection;
use std::path::Path;

pub fn is_sqlite_file(path: &Path) -> crate::error::DadixResult<bool> {
    let mut file = std::fs::File::open(path)?;
    let mut buf = [0u8; 16];
    match std::io::Read::read_exact(&mut file, &mut buf) {
        Ok(()) => Ok(buf.starts_with(b"SQLite format 3")),
        Err(err) if err.kind() == std::io::ErrorKind::UnexpectedEof => Ok(false),
        Err(err) => Err(err.into()),
    }
}

pub fn inspect_path(path: &Path) -> ValidationReport {
    if !is_dadix_path(path) {
        return ValidationReport::failed(
            None,
            vec![issue(ErrorCode::InvalidPath, "path must end with .dadix")],
        );
    }
    if !path.exists() {
        return ValidationReport::failed(
            None,
            vec![issue(
                ErrorCode::InvalidPath,
                format!("file does not exist: {}", path.display()),
            )],
        );
    }
    match is_sqlite_file(path) {
        Ok(true) => {}
        Ok(false) => {
            return ValidationReport::failed(
                None,
                vec![issue(
                    ErrorCode::InvalidProject,
                    "file is not a valid Dadix SQLite document",
                )],
            );
        }
        Err(err) => {
            return ValidationReport::failed(None, vec![issue(err.code, err.message)]);
        }
    }

    let conn = match Connection::open_with_flags(path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY) {
        Ok(c) => c,
        Err(err) => {
            return ValidationReport::failed(
                None,
                vec![issue(ErrorCode::InvalidProject, err.to_string())],
            );
        }
    };

    let version = match read_format_version(&conn) {
        Ok(Some(v)) => v,
        Ok(None) => {
            return ValidationReport::failed(
                None,
                vec![issue(
                    ErrorCode::InvalidProject,
                    "file is SQLite but has no Dadix project_meta",
                )],
            );
        }
        Err(err) => {
            return ValidationReport::failed(
                None,
                vec![issue(ErrorCode::InvalidProject, err.to_string())],
            );
        }
    };

    if version > FORMAT_VERSION {
        return ValidationReport::failed(
            Some(version),
            vec![issue(
                ErrorCode::UnsupportedNewerFormat,
                format!("file format {version} is newer than this core ({FORMAT_VERSION})"),
            )],
        );
    }

    if let Ok(Some(min_reader)) = read_minimum_reader_version(&conn) {
        if min_reader > FORMAT_VERSION {
            return ValidationReport::failed(
                Some(version),
                vec![issue(
                    ErrorCode::UnsupportedNewerFormat,
                    format!("file requires reader version {min_reader}"),
                )],
            );
        }
    }

    match validate_connection(&conn, path, version) {
        Ok(mut report) => {
            for artifact in list_recovery_artifacts(path) {
                let code = match artifact.kind {
                    RecoveryKind::Tmp => ErrorCode::IncompleteSave,
                    RecoveryKind::Bak => ErrorCode::Validation,
                };
                let message = match artifact.kind {
                    RecoveryKind::Tmp => format!("incomplete save detected: {}", artifact.path),
                    RecoveryKind::Bak => format!("backup file present: {}", artifact.path),
                };
                if code == ErrorCode::IncompleteSave {
                    report.ok = false;
                }
                report.issues.push(issue(code, message));
            }
            report
        }
        Err(err) => ValidationReport::failed(Some(version), vec![issue(err.code, err.message)]),
    }
}

pub fn validate_connection(
    conn: &Connection,
    project_path: &Path,
    version: i32,
) -> Result<ValidationReport, DadixError> {
    let mut issues = Vec::new();

    if version < 1 {
        issues.push(issue(
            ErrorCode::InvalidProject,
            format!("unknown format_version {version}"),
        ));
    }

    for required in ["project_meta"] {
        if !table_exists(conn, required)? {
            issues.push(issue(
                ErrorCode::InvalidProject,
                format!("missing table '{required}'"),
            ));
        }
    }

    if version >= 2 {
        for required in [
            "tables",
            "columns",
            "views",
            "records",
            "sources",
            "source_tables",
            "jobs",
            "settings",
        ] {
            if !table_exists(conn, required)? {
                issues.push(issue(
                    ErrorCode::InvalidProject,
                    format!("missing table '{required}'"),
                ));
            }
        }
        check_unique(conn, "tables", "reference_name", &mut issues)?;
        check_orphans(
            conn,
            "columns",
            "table_id",
            "tables",
            "id",
            "column references missing table",
            &mut issues,
        )?;
        check_orphans(
            conn,
            "views",
            "table_id",
            "tables",
            "id",
            "view references missing table",
            &mut issues,
        )?;
        check_orphans(
            conn,
            "grid_view_columns",
            "view_id",
            "views",
            "id",
            "grid column references missing view",
            &mut issues,
        )?;
        check_orphans(
            conn,
            "grid_view_columns",
            "column_id",
            "columns",
            "id",
            "grid column references missing column",
            &mut issues,
        )?;
        check_orphans(
            conn,
            "source_tables",
            "source_id",
            "sources",
            "id",
            "source table references missing source",
            &mut issues,
        )?;
        check_orphans(
            conn,
            "records",
            "table_id",
            "tables",
            "id",
            "record references missing table",
            &mut issues,
        )?;
        check_secrets_and_sources(conn, project_path, version, &mut issues)?;
    }

    if version >= 3 {
        if !has_column(conn, "project_meta", "project_id")? {
            issues.push(issue(
                ErrorCode::InvalidProject,
                "project_meta.project_id is missing",
            ));
        } else {
            let project_id: Option<String> = conn
                .query_row(
                    "SELECT project_id FROM project_meta WHERE id = 1",
                    [],
                    |r| r.get(0),
                )
                .ok();
            if project_id.as_deref().unwrap_or("").is_empty() {
                issues.push(issue(
                    ErrorCode::InvalidProject,
                    "project_id must not be empty",
                ));
            }
        }
    }

    Ok(if issues.is_empty() {
        ValidationReport::ok(version)
    } else {
        ValidationReport::failed(Some(version), issues)
    })
}

fn check_secrets_and_sources(
    conn: &Connection,
    project_path: &Path,
    version: i32,
    issues: &mut Vec<ValidationIssue>,
) -> Result<(), DadixError> {
    if table_exists(conn, "settings")? {
        let mut stmt = conn.prepare("SELECT key FROM settings")?;
        let keys = stmt.query_map([], |r| r.get::<_, String>(0))?;
        for key in keys {
            let key = key?;
            if is_forbidden_secret_key(&key) {
                issues.push(issue(
                    ErrorCode::SecretInProject,
                    format!("setting '{key}' must not store a secret"),
                ));
            }
        }
    }

    if !table_exists(conn, "sources")? {
        return Ok(());
    }

    let sql = if version >= 3 && has_column(conn, "sources", "kind")? {
        "SELECT id, name, type_name, kind, path_mode, uri, options FROM sources ORDER BY id"
    } else {
        "SELECT id, name, type_name, NULL, path_mode, uri, options FROM sources ORDER BY id"
    };
    let mut stmt = conn.prepare(sql)?;
    let rows = stmt.query_map([], |r| {
        Ok((
            r.get::<_, i64>(0)?,
            r.get::<_, String>(1)?,
            r.get::<_, String>(2)?,
            r.get::<_, Option<String>>(3)?,
            r.get::<_, String>(4)?,
            r.get::<_, Option<String>>(5)?,
            r.get::<_, Option<String>>(6)?,
        ))
    })?;

    for row in rows {
        let (_id, name, _type_name, kind_raw, path_mode_raw, uri, options) = row?;
        if let Err(err) = reject_secret_options(options.as_deref()) {
            issues.push(issue(err.code, err.message));
        }
        if PathMode::parse(&path_mode_raw).is_err() {
            issues.push(issue(
                ErrorCode::Validation,
                format!("source '{name}' has invalid path_mode '{path_mode_raw}'"),
            ));
            continue;
        }
        let kind = match kind_raw.as_deref() {
            None | Some("") => SourceKind::LinkedFile,
            Some(raw) => match SourceKind::parse(raw) {
                Ok(k) => k,
                Err(other) => {
                    issues.push(issue(
                        ErrorCode::Validation,
                        format!("source '{name}' has invalid kind '{other}'"),
                    ));
                    continue;
                }
            },
        };
        if !kind.needs_local_file() {
            continue;
        }
        let source = crate::domain::Source {
            id: 0,
            name: name.clone(),
            type_name: String::new(),
            kind,
            path_mode: PathMode::parse(&path_mode_raw)?,
            uri,
            options: None,
            credential: None,
            created_at: String::new(),
        };
        match resolve_source_path(project_path, &source) {
            Ok(resolved) if !resolved.path.exists() => {
                issues.push(issue(
                    ErrorCode::SourceNotFound,
                    format!("source not found\n{}", resolved.path.display()),
                ));
            }
            Err(err) => issues.push(issue(err.code, err.message)),
            Ok(_) => {}
        }
    }
    Ok(())
}

fn check_unique(
    conn: &Connection,
    table: &str,
    column: &str,
    issues: &mut Vec<ValidationIssue>,
) -> Result<(), DadixError> {
    if !table_exists(conn, table)? {
        return Ok(());
    }
    let sql =
        format!("SELECT {column}, COUNT(*) FROM {table} GROUP BY {column} HAVING COUNT(*) > 1");
    let mut stmt = conn.prepare(&sql)?;
    let mut rows = stmt.query([])?;
    while let Some(row) = rows.next()? {
        let value: String = row.get(0)?;
        issues.push(issue(
            ErrorCode::Validation,
            format!("duplicate {table}.{column} '{value}'"),
        ));
    }
    Ok(())
}

fn check_orphans(
    conn: &Connection,
    child: &str,
    child_fk: &str,
    parent: &str,
    parent_pk: &str,
    message: &str,
    issues: &mut Vec<ValidationIssue>,
) -> Result<(), DadixError> {
    if !table_exists(conn, child)? || !table_exists(conn, parent)? {
        return Ok(());
    }
    let sql = format!(
        "SELECT COUNT(*) FROM {child} WHERE {child_fk} NOT IN (SELECT {parent_pk} FROM {parent})"
    );
    let count: i64 = conn.query_row(&sql, [], |r| r.get(0))?;
    if count > 0 {
        issues.push(issue(ErrorCode::Validation, format!("{message} ({count})")));
    }
    Ok(())
}

fn issue(code: ErrorCode, message: impl Into<String>) -> ValidationIssue {
    ValidationIssue {
        code,
        message: message.into(),
    }
}
