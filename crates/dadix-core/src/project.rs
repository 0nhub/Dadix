//! `.dadix` project lifecycle. No UI or Tauri types.

use crate::atomic::{
    atomic_replace, backup_project, list_recovery_artifacts, tmp_path, vacuum_into,
    validate_snapshot,
};
use crate::domain::{
    AccessMode, MissingSource, Project, RecoveryArtifact, Source, SourceKind, ValidationReport,
};
use crate::error::{DadixError, DadixResult, ErrorCode};
use crate::lock::ProjectLock;
use crate::migrate::apply_migrations;
use crate::paths::{
    ensure_dadix_extension, normalize_relative_uri, resolve_source_path, to_relative_uri, PathMode,
};
use crate::connectors::DatabaseConnector;
use crate::credentials::{default_credential_store, CredentialStore};
use crate::query::{QueryId, QueryParam, QueryRequest, QueryResult, QuerySession, QueryStatus};
use crate::schema::{
    configure_connection, create_schema, now_utc, read_format_version, read_minimum_reader_version,
    APP_VERSION, FORMAT_VERSION, MINIMUM_READER_VERSION,
};
use crate::validate::{inspect_path, is_sqlite_file, validate_connection};
use rusqlite::{Connection, OpenFlags};
use std::collections::HashMap;
use std::fmt;
use std::ops::Deref;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, MutexGuard};

pub struct ConnGuard<'a>(MutexGuard<'a, Option<Connection>>);

impl Deref for ConnGuard<'_> {
    type Target = Connection;

    fn deref(&self) -> &Connection {
        self.0.as_ref().expect("connection must be open")
    }
}

/// Open project handle. Drop or [`close_project`] to release the file lock.
pub struct ProjectHandle {
    path: PathBuf,
    conn: Mutex<Option<Connection>>,
    query: Mutex<Option<Arc<QuerySession>>>,
    credentials: Arc<dyn CredentialStore>,
    sessions: Mutex<HashMap<i64, Arc<dyn DatabaseConnector>>>,
    access: AccessMode,
    _lock: ProjectLock,
}

impl fmt::Debug for ProjectHandle {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("ProjectHandle")
            .field("path", &self.path)
            .field("access", &self.access)
            .field("query_open", &self.has_query_session())
            .finish()
    }
}

impl ProjectHandle {
    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn access(&self) -> AccessMode {
        self.access
    }

    pub fn credential_store(&self) -> Arc<dyn CredentialStore> {
        Arc::clone(&self.credentials)
    }

    pub fn set_credential_store(&mut self, store: Arc<dyn CredentialStore>) {
        self.credentials = store;
    }

    pub(crate) fn database_session(
        &self,
        source_id: i64,
        session: Arc<dyn DatabaseConnector>,
    ) -> DadixResult<Arc<dyn DatabaseConnector>> {
        let mut guard = self.sessions.lock().map_err(|_| DadixError::lock())?;
        Ok(guard.entry(source_id).or_insert(session).clone())
    }

    pub(crate) fn cached_database_session(
        &self,
        source_id: i64,
    ) -> DadixResult<Option<Arc<dyn DatabaseConnector>>> {
        let guard = self.sessions.lock().map_err(|_| DadixError::lock())?;
        Ok(guard.get(&source_id).cloned())
    }

    pub fn drop_database_session(&self, source_id: i64) -> DadixResult<()> {
        let mut guard = self.sessions.lock().map_err(|_| DadixError::lock())?;
        guard.remove(&source_id);
        Ok(())
    }

    pub(crate) fn ensure_writable(&self) -> DadixResult<()> {
        if self.access == AccessMode::ReadOnly {
            Err(DadixError::new(
                ErrorCode::ReadOnly,
                "project is open read-only",
            ))
        } else {
            Ok(())
        }
    }

    pub(crate) fn lock_conn(&self) -> DadixResult<ConnGuard<'_>> {
        let guard = self.conn.lock().map_err(|_| DadixError::lock())?;
        if guard.is_none() {
            return Err(DadixError::new(
                ErrorCode::ProjectNotOpen,
                "project connection is closed",
            ));
        }
        Ok(ConnGuard(guard))
    }

    pub(crate) fn touch_updated(&self) -> DadixResult<()> {
        self.ensure_writable()?;
        let conn = self.lock_conn()?;
        conn.execute(
            "UPDATE project_meta SET updated_at = ?, app_version = ? WHERE id = 1",
            rusqlite::params![now_utc(), APP_VERSION],
        )?;
        Ok(())
    }

    pub fn meta(&self) -> DadixResult<Project> {
        let conn = self.lock_conn()?;
        let mut stmt = conn.prepare(
            "SELECT id, project_id, name, created_at, updated_at, app_version, format_version, minimum_reader_version
             FROM project_meta WHERE id = 1",
        )?;
        stmt.query_row([], |r| {
            Ok(Project {
                id: r.get(0)?,
                project_id: r.get(1)?,
                path: self.path.to_string_lossy().into_owned(),
                name: r.get(2)?,
                created_at: r.get(3)?,
                updated_at: r.get(4)?,
                app_version: r.get(5)?,
                format_version: r.get(6)?,
                minimum_reader_version: r.get(7)?,
            })
        })
        .map_err(Into::into)
    }

    pub fn save(&self) -> DadixResult<()> {
        self.ensure_writable()?;
        self.touch_updated()?;
        let tmp = tmp_path(&self.path);
        {
            let conn = self.lock_conn()?;
            vacuum_into(&conn, &tmp)?;
        }
        if let Err(err) = validate_snapshot(&tmp) {
            let _ = std::fs::remove_file(&tmp);
            return Err(err);
        }
        {
            let mut guard = self.conn.lock().map_err(|_| DadixError::lock())?;
            *guard = None;
        }
        atomic_replace(&tmp, &self.path)?;
        let conn = Connection::open(&self.path)?;
        configure_connection(&conn)?;
        let mut guard = self.conn.lock().map_err(|_| DadixError::lock())?;
        *guard = Some(conn);
        Ok(())
    }

    pub fn migrate(&self) -> DadixResult<i32> {
        self.ensure_writable()?;
        let conn = self.lock_conn()?;
        apply_migrations(&conn)
    }

    pub fn validate(&self) -> DadixResult<ValidationReport> {
        let conn = self.lock_conn()?;
        let version = read_format_version(&conn)?.unwrap_or(FORMAT_VERSION);
        validate_connection(&conn, &self.path, version)
    }

    pub fn missing_sources(&self) -> DadixResult<Vec<MissingSource>> {
        let mut missing = Vec::new();
        for source in self.list_sources()? {
            if !source.kind.needs_local_file() {
                continue;
            }
            match resolve_source_path(&self.path, &source) {
                Ok(resolved) if !resolved.path.exists() => {
                    missing.push(MissingSource {
                        source_id: source.id,
                        name: source.name,
                        kind: source.kind,
                        path_mode: source.path_mode,
                        stored_uri: source.uri,
                        expected_path: resolved.path.to_string_lossy().into_owned(),
                    });
                }
                Err(_) => {
                    missing.push(MissingSource {
                        source_id: source.id,
                        name: source.name.clone(),
                        kind: source.kind,
                        path_mode: source.path_mode,
                        stored_uri: source.uri.clone(),
                        expected_path: source.uri.unwrap_or_default(),
                    });
                }
                Ok(_) => {}
            }
        }
        Ok(missing)
    }

    /// Update one source path. When `prefer_relative` is true and the file sits
    /// under the project folder, store `./…` and `path_mode = relative`.
    pub fn relink_source(
        &self,
        source_id: i64,
        new_path: impl AsRef<Path>,
        prefer_relative: bool,
    ) -> DadixResult<Source> {
        self.ensure_writable()?;
        let new_path = new_path.as_ref();
        if !new_path.exists() {
            return Err(DadixError::new(
                ErrorCode::SourceNotFound,
                format!("relink target does not exist: {}", new_path.display()),
            ));
        }
        let sources = self.list_sources()?;
        let source = sources
            .into_iter()
            .find(|s| s.id == source_id)
            .ok_or_else(|| DadixError::new(ErrorCode::NotFound, "source not found"))?;
        if source.kind == SourceKind::ExternalDatabase {
            return Err(DadixError::new(
                ErrorCode::Validation,
                "external_database sources are not file links",
            ));
        }

        let (path_mode, uri, kind) = self.link_location_for(&source, new_path, prefer_relative)?;
        let identity = crate::file_id::FileIdentity::capture(new_path);
        let options = identity.merge_into_options(source.options.as_deref());
        self.update_source_link(source_id, path_mode, &uri, kind, Some(&options))?;
        let _ = self.sync_file_source(source_id);
        self.list_sources()?
            .into_iter()
            .find(|s| s.id == source_id)
            .ok_or_else(|| DadixError::new(ErrorCode::NotFound, "source not found after relink"))
    }

    pub(crate) fn link_location_for(
        &self,
        source: &Source,
        new_path: &Path,
        prefer_relative: bool,
    ) -> DadixResult<(PathMode, String, SourceKind)> {
        if source.kind == SourceKind::EmbeddedFile || source.path_mode == PathMode::Embedded {
            let name = new_path
                .file_name()
                .and_then(|s| s.to_str())
                .ok_or_else(|| {
                    DadixError::new(ErrorCode::InvalidPath, "embedded file has no name")
                })?;
            return Ok((
                PathMode::Embedded,
                name.to_string(),
                SourceKind::EmbeddedFile,
            ));
        }
        if prefer_relative {
            if let Some(rel) = to_relative_uri(&self.path, new_path) {
                return Ok((PathMode::Relative, rel, SourceKind::LinkedFile));
            }
        }
        Ok((
            PathMode::Absolute,
            new_path.to_string_lossy().into_owned(),
            SourceKind::LinkedFile,
        ))
    }

    pub fn close(self) -> DadixResult<()> {
        self.shutdown_query();
        if self.access == AccessMode::ReadWrite {
            let _ = self.save();
        }
        Ok(())
    }

    pub fn shutdown_query(&self) {
        if let Ok(mut guard) = self.query.lock() {
            if let Some(session) = guard.take() {
                drop(guard);
                session.shutdown();
            }
        }
    }

    pub fn has_query_session(&self) -> bool {
        self.query
            .lock()
            .map(|g| g.as_ref().is_some_and(|s| s.is_open()))
            .unwrap_or(false)
    }

    fn snapshot_query(&self) -> DadixResult<Arc<QuerySession>> {
        let guard = self.query.lock().map_err(|_| DadixError::lock())?;
        guard.as_ref().cloned().ok_or_else(|| {
            DadixError::new(ErrorCode::ProjectNotOpen, "query session is closed")
        })
    }

    pub fn execute_query(&self, request: QueryRequest) -> DadixResult<QueryResult> {
        let _ = self.bind_file_sources();
        self.with_query(|session| session.execute(request))
    }

    pub fn cancel_query(&self, query_id: &QueryId) -> DadixResult<()> {
        self.with_query(|session| session.cancel(query_id))
    }

    pub fn explain_query(
        &self,
        sql: &str,
        parameters: Vec<QueryParam>,
    ) -> DadixResult<QueryResult> {
        self.with_query(|session| session.explain_query(sql, parameters))
    }

    pub fn query_status(&self, query_id: &QueryId) -> DadixResult<Option<QueryStatus>> {
        self.with_query(|session| Ok(session.query_status(query_id)))
    }

    pub(crate) fn with_query<T>(
        &self,
        f: impl FnOnce(&QuerySession) -> DadixResult<T>,
    ) -> DadixResult<T> {
        let session = self.snapshot_query()?;
        f(&session)
    }
}

pub fn create_project(path: impl AsRef<Path>) -> DadixResult<ProjectHandle> {
    let path = path.as_ref();
    ensure_dadix_extension(path)?;
    if path.exists() {
        let meta = std::fs::metadata(path)?;
        if meta.len() > 0 {
            return Err(DadixError::new(
                ErrorCode::ProjectAlreadyExists,
                format!("file already exists: {}", path.display()),
            ));
        }
    }
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent)?;
        }
    }

    let conn = Connection::open(path)?;
    configure_connection(&conn)?;
    create_schema(&conn)?;
    let now = now_utc();
    let name = path
        .file_stem()
        .and_then(|s| s.to_str())
        .filter(|s| !s.is_empty())
        .unwrap_or("Unnamed Project");
    let project_id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT OR REPLACE INTO project_meta
            (id, project_id, name, created_at, updated_at, app_version, format_version, minimum_reader_version)
         VALUES (1, ?, ?, ?, ?, ?, ?, ?)",
        rusqlite::params![
            project_id,
            name,
            now,
            now,
            APP_VERSION,
            FORMAT_VERSION,
            MINIMUM_READER_VERSION
        ],
    )?;
    drop(conn);

    open_project_with(path, AccessMode::ReadWrite)
}

pub fn open_project(path: impl AsRef<Path>) -> DadixResult<ProjectHandle> {
    open_project_with(path, AccessMode::ReadWrite)
}

pub fn open_project_readonly(path: impl AsRef<Path>) -> DadixResult<ProjectHandle> {
    open_project_with(path, AccessMode::ReadOnly)
}

pub fn open_project_with(path: impl AsRef<Path>, access: AccessMode) -> DadixResult<ProjectHandle> {
    let path = path.as_ref();
    ensure_dadix_extension(path)?;
    if !path.exists() {
        return Err(DadixError::new(
            ErrorCode::InvalidPath,
            format!("file does not exist: {}", path.display()),
        ));
    }
    if !is_sqlite_file(path)? {
        return Err(DadixError::new(
            ErrorCode::InvalidProject,
            "file is not a valid Dadix SQLite document",
        ));
    }

    reject_newer_format(path)?;

    let lock = ProjectLock::acquire(path, access)?;

    if access == AccessMode::ReadWrite {
        let current = peek_format_version(path)?.unwrap_or(0);
        if current < FORMAT_VERSION {
            backup_project(path)?;
            let conn = Connection::open(path)?;
            configure_connection(&conn)?;
            apply_migrations(&conn)?;
            drop(conn);
        }
    } else if peek_format_version(path)?.unwrap_or(0) < FORMAT_VERSION {
        return Err(DadixError::new(
            ErrorCode::Migration,
            "project must be opened read-write to apply pending migrations",
        ));
    }

    let flags = match access {
        AccessMode::ReadWrite => OpenFlags::default(),
        AccessMode::ReadOnly => OpenFlags::SQLITE_OPEN_READ_ONLY,
    };
    let conn = Connection::open_with_flags(path, flags)?;
    configure_connection(&conn)?;
    let query = QuerySession::in_memory()?;

    let handle = ProjectHandle {
        path: path.to_path_buf(),
        conn: Mutex::new(Some(conn)),
        query: Mutex::new(Some(Arc::new(query))),
        credentials: default_credential_store(),
        sessions: Mutex::new(HashMap::new()),
        access,
        _lock: lock,
    };
    Ok(handle)
}

pub fn close_project(handle: ProjectHandle) -> DadixResult<()> {
    handle.close()
}

pub fn save_project(handle: &ProjectHandle) -> DadixResult<()> {
    handle.save()
}

pub fn migrate_project(path: impl AsRef<Path>) -> DadixResult<Project> {
    let handle = open_project(path)?;
    let project = handle.meta()?;
    close_project(handle)?;
    Ok(project)
}

pub fn validate_project(path: impl AsRef<Path>) -> DadixResult<ValidationReport> {
    Ok(inspect_path(path.as_ref()))
}

pub fn list_project_recovery(path: impl AsRef<Path>) -> Vec<RecoveryArtifact> {
    list_recovery_artifacts(path.as_ref())
}

pub fn restore_project_backup(path: impl AsRef<Path>) -> DadixResult<()> {
    let path = path.as_ref();
    ensure_dadix_extension(path)?;
    let _lock = ProjectLock::acquire(path, AccessMode::ReadWrite)?;
    crate::atomic::restore_backup(path)
}

pub fn peek_format_version(path: &Path) -> DadixResult<Option<i32>> {
    let conn = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    read_format_version(&conn).map_err(Into::into)
}

fn reject_newer_format(path: &Path) -> DadixResult<()> {
    let conn = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    let version = read_format_version(&conn)?;
    if let Some(v) = version {
        if v > FORMAT_VERSION {
            return Err(DadixError::new(
                ErrorCode::UnsupportedNewerFormat,
                format!("file format {v} is newer than this core ({FORMAT_VERSION})"),
            ));
        }
    }
    if let Some(min_reader) = read_minimum_reader_version(&conn)? {
        if min_reader > FORMAT_VERSION {
            return Err(DadixError::new(
                ErrorCode::UnsupportedNewerFormat,
                format!("file requires reader version {min_reader}; this core supports {FORMAT_VERSION}"),
            ));
        }
    }
    Ok(())
}

/// Normalize a URI for insert according to path mode.
pub(crate) fn prepare_source_uri(
    path_mode: PathMode,
    uri: Option<String>,
) -> DadixResult<Option<String>> {
    let Some(raw) = uri.map(|s| s.trim().to_string()).filter(|s| !s.is_empty()) else {
        return Ok(None);
    };
    match path_mode {
        PathMode::Relative | PathMode::Embedded => Ok(Some(normalize_relative_uri(&raw)?)),
        PathMode::Absolute => {
            if raw.contains("://") && !raw.to_ascii_lowercase().starts_with("file:") {
                return Ok(Some(raw));
            }
            let path = PathBuf::from(&raw);
            if !path.is_absolute() {
                return Err(DadixError::new(
                    ErrorCode::PathResolution,
                    "absolute source uri must be an absolute filesystem path",
                ));
            }
            Ok(Some(raw))
        }
    }
}
