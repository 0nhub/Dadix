//! Atomic replace, temporary files, and `.bak` recovery.

use crate::domain::{RecoveryArtifact, RecoveryKind};
use crate::error::{DadixError, DadixResult, ErrorCode};
use crate::schema::{configure_connection, read_format_version};
use rusqlite::{Connection, OpenFlags};
use std::fs;
use std::path::{Path, PathBuf};

pub fn tmp_path(project_path: &Path) -> PathBuf {
    let mut path = project_path.as_os_str().to_os_string();
    path.push(".tmp");
    PathBuf::from(path)
}

pub fn bak_path(project_path: &Path) -> PathBuf {
    let mut path = project_path.as_os_str().to_os_string();
    path.push(".bak");
    PathBuf::from(path)
}

pub fn list_recovery_artifacts(project_path: &Path) -> Vec<RecoveryArtifact> {
    let mut out = Vec::new();
    let tmp = tmp_path(project_path);
    if tmp.exists() {
        out.push(RecoveryArtifact {
            kind: RecoveryKind::Tmp,
            path: tmp.to_string_lossy().into_owned(),
        });
    }
    let bak = bak_path(project_path);
    if bak.exists() {
        out.push(RecoveryArtifact {
            kind: RecoveryKind::Bak,
            path: bak.to_string_lossy().into_owned(),
        });
    }
    out
}

pub fn backup_project(project_path: &Path) -> DadixResult<PathBuf> {
    let bak = bak_path(project_path);
    fs::copy(project_path, &bak)?;
    Ok(bak)
}

/// Replace `dest` with `tmp` atomically on the same volume, then remove `tmp` if it remains.
pub fn atomic_replace(tmp: &Path, dest: &Path) -> DadixResult<()> {
    if !tmp.exists() {
        return Err(DadixError::new(
            ErrorCode::IncompleteSave,
            "temporary save file is missing",
        ));
    }
    match fs::rename(tmp, dest) {
        Ok(()) => Ok(()),
        Err(_) => {
            #[cfg(windows)]
            {
                let _ = fs::remove_file(dest);
                fs::rename(tmp, dest)?;
                return Ok(());
            }
            #[cfg(not(windows))]
            {
                fs::copy(tmp, dest)?;
                let _ = fs::remove_file(tmp);
                Ok(())
            }
        }
    }
}

pub fn vacuum_into(conn: &Connection, tmp: &Path) -> DadixResult<()> {
    if tmp.exists() {
        fs::remove_file(tmp)?;
    }
    let tmp_str = tmp.to_str().ok_or_else(|| {
        DadixError::new(ErrorCode::InvalidPath, "temporary path is not valid UTF-8")
    })?;
    conn.execute("VACUUM INTO ?1", [tmp_str])?;
    Ok(())
}

/// Confirm a snapshot is a readable Dadix SQLite document (no writes).
pub fn validate_snapshot(path: &Path) -> DadixResult<()> {
    let conn = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    configure_connection(&conn)?;
    let version = read_format_version(&conn)?.ok_or_else(|| {
        DadixError::new(ErrorCode::InvalidProject, "snapshot has no project_meta")
    })?;
    if version < 1 {
        return Err(DadixError::new(
            ErrorCode::InvalidProject,
            "snapshot format_version is invalid",
        ));
    }
    Ok(())
}

pub fn restore_backup(project_path: &Path) -> DadixResult<()> {
    let bak = bak_path(project_path);
    if !bak.exists() {
        return Err(DadixError::new(
            ErrorCode::NotFound,
            format!("no backup file at {}", bak.display()),
        ));
    }
    validate_snapshot(&bak)?;
    let tmp = tmp_path(project_path);
    fs::copy(&bak, &tmp)?;
    atomic_replace(&tmp, project_path)?;
    Ok(())
}
