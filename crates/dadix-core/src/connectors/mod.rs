//! External database connectors. One source, one engine — no federation.

mod mssql;
mod mysql;
mod postgres;
mod sql;
mod sqlite;
mod types;

use crate::credentials::{
    new_credential_id, reject_secret_uri, validate_credential_id, DatabaseSecret,
};
use crate::domain::{NewSource, Source, SourceKind};
use crate::error::{DadixError, DadixResult, ErrorCode};
use crate::paths::{to_relative_uri, PathMode};
use crate::project::ProjectHandle;
use crate::query::{QueryId, QueryRequest, QueryResult};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::Arc;

pub use mssql::SqlServerSession;
pub use mysql::MysqlSession;
pub use postgres::PostgresSession;
pub use sqlite::SqliteSession;
pub use types::{
    ConnectorCapabilities, ConnectorColumn, ConnectorQueryResult, DatabaseEndpoint,
    DatabaseSourceOptions, PaginationStyle, ParameterStyle, DEFAULT_CONNECT_TIMEOUT_MS,
    DEFAULT_IDLE_TIMEOUT_MS,
};

use types::DatabaseSourceOptions as SourceOpts;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DatabaseEngine {
    Sqlite,
    Postgres,
    Mysql,
    SqlServer,
}

impl DatabaseEngine {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Sqlite => "sqlite",
            Self::Postgres => "postgresql",
            Self::Mysql => "mysql",
            Self::SqlServer => "sqlserver",
        }
    }

    pub fn parse(value: &str) -> DadixResult<Self> {
        match value.trim().to_ascii_lowercase().as_str() {
            "sqlite" | "sqlite3" => Ok(Self::Sqlite),
            "postgres" | "postgresql" => Ok(Self::Postgres),
            "mysql" | "mariadb" => Ok(Self::Mysql),
            "sqlserver" | "mssql" | "sql_server" => Ok(Self::SqlServer),
            other => Err(DadixError::new(
                ErrorCode::UnsupportedFormat,
                format!("unsupported database engine: {other}"),
            )),
        }
    }

    pub fn default_port(self) -> u16 {
        match self {
            Self::Sqlite => 0,
            Self::Postgres => 5432,
            Self::Mysql => 3306,
            Self::SqlServer => 1433,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewDatabaseSource {
    pub name: String,
    pub engine: DatabaseEngine,
    #[serde(default)]
    pub uri: String,
    #[serde(default)]
    pub host: Option<String>,
    #[serde(default)]
    pub port: Option<u16>,
    #[serde(default)]
    pub database: Option<String>,
    #[serde(default)]
    pub username: Option<String>,
    pub credential_id: Option<String>,
    #[serde(default)]
    pub prefer_relative: bool,
    #[serde(default)]
    pub encrypt: Option<bool>,
    #[serde(default)]
    pub trust_server_certificate: Option<bool>,
    #[serde(default)]
    pub connect_timeout_ms: Option<u64>,
}

impl Default for NewDatabaseSource {
    fn default() -> Self {
        Self {
            name: String::new(),
            engine: DatabaseEngine::Sqlite,
            uri: String::new(),
            host: None,
            port: None,
            database: None,
            username: None,
            credential_id: None,
            prefer_relative: false,
            encrypt: None,
            trust_server_certificate: None,
            connect_timeout_ms: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RemoteTable {
    pub schema: Option<String>,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RemoteColumn {
    pub name: String,
    pub dadix_type: crate::query::DadixType,
    pub native_type: String,
    pub nullable: bool,
}

pub trait DatabaseConnector: Send + Sync {
    fn capabilities(&self) -> ConnectorCapabilities;
    fn test_connection(&self) -> DadixResult<()>;
    fn databases(&self) -> DadixResult<Vec<String>> {
        Ok(Vec::new())
    }
    fn schemas(&self) -> DadixResult<Vec<String>>;
    fn tables(&self, schema: Option<&str>) -> DadixResult<Vec<RemoteTable>>;
    fn columns(&self, table: &str) -> DadixResult<Vec<RemoteColumn>>;
    fn execute_query(&self, request: QueryRequest) -> DadixResult<ConnectorQueryResult>;
    fn cancel(&self, query_id: &QueryId) -> DadixResult<()>;
    fn connection_generation(&self) -> u64 {
        0
    }
}

/// Older name used by the first Phase-6 draft.
pub trait SourceSession: DatabaseConnector {}
impl<T: DatabaseConnector> SourceSession for T {}

#[derive(Debug, Clone)]
pub struct HostTarget {
    pub host: String,
    pub port: u16,
    pub database: String,
}

pub fn parse_host_uri(uri: &str, default_port: u16) -> DadixResult<HostTarget> {
    reject_secret_uri(uri)?;
    let rest = uri
        .split("://")
        .nth(1)
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or(uri.trim());
    if rest.is_empty() || rest.contains('@') {
        return Err(DadixError::new(
            ErrorCode::Validation,
            "database URI must be host[:port]/database without credentials",
        ));
    }
    let (authority, database) = match rest.split_once('/') {
        Some((host, db)) => (host, db.split('?').next().unwrap_or(db)),
        None => {
            return Err(DadixError::new(
                ErrorCode::Validation,
                "database URI must include a database name",
            ))
        }
    };
    if database.trim().is_empty() {
        return Err(DadixError::new(
            ErrorCode::Validation,
            "database URI must include a database name",
        ));
    }
    let (host, port) = if let Some((h, p)) = authority.rsplit_once(':') {
        let port = p.parse::<u16>().map_err(|_| {
            DadixError::new(ErrorCode::Validation, format!("invalid port: {p}"))
        })?;
        (h.to_string(), port)
    } else {
        (authority.to_string(), default_port)
    };
    if host.is_empty() {
        return Err(DadixError::new(
            ErrorCode::Validation,
            "database URI must include a host",
        ));
    }
    Ok(HostTarget {
        host,
        port,
        database: database.trim().to_string(),
    })
}

fn endpoint_from_source(
    engine: DatabaseEngine,
    uri: &str,
    options: &SourceOpts,
) -> DadixResult<DatabaseEndpoint> {
    let parsed = if uri.trim().is_empty() {
        None
    } else {
        Some(parse_host_uri(uri, engine.default_port())?)
    };
    let host = options
        .host
        .clone()
        .or_else(|| parsed.as_ref().map(|p| p.host.clone()))
        .ok_or_else(|| DadixError::new(ErrorCode::Validation, "database host is required"))?;
    let port = options
        .port
        .or_else(|| parsed.as_ref().map(|p| p.port))
        .unwrap_or_else(|| engine.default_port());
    let database = options
        .database
        .clone()
        .or_else(|| parsed.as_ref().map(|p| p.database.clone()))
        .ok_or_else(|| DadixError::new(ErrorCode::Validation, "database name is required"))?;
    Ok(DatabaseEndpoint {
        host,
        port,
        database,
        username: options.username.clone(),
        encrypt: options.encrypt.unwrap_or(true),
        trust_server_certificate: options.trust_server_certificate.unwrap_or(false),
        connect_timeout_ms: options
            .connect_timeout_ms
            .unwrap_or(DEFAULT_CONNECT_TIMEOUT_MS),
        idle_timeout_ms: options.idle_timeout_ms.unwrap_or(DEFAULT_IDLE_TIMEOUT_MS),
    })
}

impl ProjectHandle {
    pub fn store_credential(&self, secret: &DatabaseSecret) -> DadixResult<String> {
        let id = new_credential_id();
        self.store_named_credential(&id, secret)?;
        Ok(id)
    }

    pub fn store_named_credential(&self, id: &str, secret: &DatabaseSecret) -> DadixResult<()> {
        validate_credential_id(id)?;
        self.credential_store().put(id, &secret.to_json()?)
    }

    pub fn credential_exists(&self, id: &str) -> DadixResult<bool> {
        self.credential_store().exists(id)
    }

    pub fn delete_stored_credential(&self, id: &str) -> DadixResult<()> {
        self.credential_store().delete(id)
    }

    pub fn add_database_source(&self, spec: NewDatabaseSource) -> DadixResult<Source> {
        self.ensure_writable()?;
        if !spec.uri.is_empty() {
            reject_secret_uri(&spec.uri)?;
        }
        if let Some(ref id) = spec.credential_id {
            validate_credential_id(id)?;
        }
        let (path_mode, uri, options) = match spec.engine {
            DatabaseEngine::Sqlite => {
                let (mode, uri) = sqlite_uri(self.path(), &spec.uri, spec.prefer_relative)?;
                (mode, uri, None)
            }
            engine => {
                let mut opts = SourceOpts {
                    host: spec.host.clone(),
                    port: spec.port,
                    database: spec.database.clone(),
                    username: spec.username.clone(),
                    encrypt: spec.encrypt.or(Some(true)),
                    trust_server_certificate: Some(
                        spec.trust_server_certificate.unwrap_or(false),
                    ),
                    connect_timeout_ms: spec
                        .connect_timeout_ms
                        .or(Some(DEFAULT_CONNECT_TIMEOUT_MS)),
                    idle_timeout_ms: Some(DEFAULT_IDLE_TIMEOUT_MS),
                };
                let uri = if spec.uri.trim().is_empty() {
                    let host = opts.host.clone().ok_or_else(|| {
                        DadixError::new(ErrorCode::Validation, "host is required")
                    })?;
                    let port = opts.port.unwrap_or_else(|| engine.default_port());
                    let database = opts.database.clone().ok_or_else(|| {
                        DadixError::new(ErrorCode::Validation, "database is required")
                    })?;
                    format!("{}://{host}:{port}/{database}", engine.as_str())
                } else {
                    spec.uri.trim().to_string()
                };
                let parsed = parse_host_uri(&uri, engine.default_port())?;
                if opts.host.is_none() {
                    opts.host = Some(parsed.host);
                }
                if opts.port.is_none() {
                    opts.port = Some(parsed.port);
                }
                if opts.database.is_none() {
                    opts.database = Some(parsed.database);
                }
                (PathMode::Absolute, uri, Some(opts.to_json()?))
            }
        };
        self.add_source(NewSource {
            name: spec.name,
            type_name: spec.engine.as_str().into(),
            kind: SourceKind::ExternalDatabase,
            path_mode,
            uri: Some(uri),
            options,
            credential: spec
                .credential_id
                .map(|id| crate::domain::CredentialRef { id }),
        })
    }

    pub fn test_source_connection(&self, source_id: i64) -> DadixResult<()> {
        self.source_session(source_id)?.test_connection()
    }

    pub fn source_capabilities(&self, source_id: i64) -> DadixResult<ConnectorCapabilities> {
        Ok(self.source_session(source_id)?.capabilities())
    }

    pub fn source_connection_generation(&self, source_id: i64) -> DadixResult<u64> {
        Ok(self.source_session(source_id)?.connection_generation())
    }

    pub fn execute_source_query(
        &self,
        source_id: i64,
        request: QueryRequest,
    ) -> DadixResult<QueryResult> {
        self.source_session(source_id)?
            .execute_query(request)
            .map(Into::into)
    }

    pub fn cancel_source_query(&self, source_id: i64, query_id: &QueryId) -> DadixResult<()> {
        self.source_session(source_id)?.cancel(query_id)
    }

    pub fn list_remote_databases(&self, source_id: i64) -> DadixResult<Vec<String>> {
        self.source_session(source_id)?.databases()
    }

    pub fn list_remote_schemas(&self, source_id: i64) -> DadixResult<Vec<String>> {
        self.source_session(source_id)?.schemas()
    }

    pub fn list_remote_tables(&self, source_id: i64) -> DadixResult<Vec<RemoteTable>> {
        self.source_session(source_id)?.tables(None)
    }

    pub fn list_remote_columns(
        &self,
        source_id: i64,
        table: &str,
    ) -> DadixResult<Vec<RemoteColumn>> {
        self.source_session(source_id)?.columns(table)
    }

    fn source_session(&self, source_id: i64) -> DadixResult<Arc<dyn DatabaseConnector>> {
        if let Some(existing) = self.cached_database_session(source_id)? {
            return Ok(existing);
        }
        let source = self
            .list_sources()?
            .into_iter()
            .find(|s| s.id == source_id)
            .ok_or_else(|| DadixError::new(ErrorCode::NotFound, "source not found"))?;
        if source.kind != SourceKind::ExternalDatabase {
            return Err(DadixError::new(
                ErrorCode::UnsupportedFormat,
                "source is not an external database",
            ));
        }
        let engine = DatabaseEngine::parse(&source.type_name)?;
        let uri = source.uri.clone().unwrap_or_default();
        let options = SourceOpts::from_json(source.options.as_deref());
        let secret = match &source.credential {
            Some(cred) => match self.credential_store().get(&cred.id)? {
                Some(raw) => Some(DatabaseSecret::from_json(&raw)?),
                None => {
                    return Err(DadixError::new(
                        ErrorCode::CredentialStore,
                        "credential_id is not present in the OS credential store",
                    ))
                }
            },
            None => None,
        };
        let session = open_session(engine, self.path(), &uri, &options, secret.as_ref())?;
        self.database_session(source_id, session)
    }
}

fn open_session(
    engine: DatabaseEngine,
    project: &Path,
    uri: &str,
    options: &SourceOpts,
    secret: Option<&DatabaseSecret>,
) -> DadixResult<Arc<dyn DatabaseConnector>> {
    match engine {
        DatabaseEngine::Sqlite => Ok(Arc::new(SqliteSession::connect(project, uri)?)),
        DatabaseEngine::Postgres => {
            let endpoint = endpoint_from_source(engine, uri, options)?;
            Ok(Arc::new(PostgresSession::connect(&endpoint, secret)?))
        }
        DatabaseEngine::Mysql => {
            let endpoint = endpoint_from_source(engine, uri, options)?;
            Ok(Arc::new(MysqlSession::connect(&endpoint, secret)?))
        }
        DatabaseEngine::SqlServer => {
            let mut endpoint = endpoint_from_source(engine, uri, options)?;
            if endpoint.username.is_none() {
                endpoint.username = secret.and_then(|s| s.username.clone());
            }
            Ok(Arc::new(SqlServerSession::connect(endpoint, secret)?))
        }
    }
}

fn sqlite_uri(
    project: &Path,
    uri: &str,
    prefer_relative: bool,
) -> DadixResult<(PathMode, String)> {
    reject_secret_uri(uri)?;
    let path = Path::new(uri);
    if prefer_relative {
        if let Some(rel) = to_relative_uri(project, path) {
            return Ok((PathMode::Relative, rel));
        }
    }
    let abs = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
    Ok((PathMode::Absolute, abs.to_string_lossy().into_owned()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::credentials::MemoryCredentialStore;
    use crate::project::{close_project, create_project};
    use crate::error::ErrorCode;
    use crate::query::{ColumnData, QueryRequest};
    use rusqlite::Connection;
    use std::fs;
    use std::sync::Arc;

    fn write_sqlite(path: &Path) {
        let conn = Connection::open(path).unwrap();
        conn.execute_batch(
            "CREATE TABLE items (id INTEGER, name TEXT);
             INSERT INTO items VALUES (1, 'alpha'), (2, 'beta'), (3, 'gamma');",
        )
        .unwrap();
    }

    fn sqlite_spec(uri: String) -> NewDatabaseSource {
        NewDatabaseSource {
            name: "App".into(),
            engine: DatabaseEngine::Sqlite,
            uri,
            prefer_relative: true,
            ..NewDatabaseSource::default()
        }
    }

    #[test]
    fn sqlite_source_queries_without_import() {
        let dir = tempfile::tempdir().unwrap();
        let db = dir.path().join("app.sqlite");
        write_sqlite(&db);
        let project = dir.path().join("ext.dadix");
        let handle = create_project(&project).unwrap();
        let source = handle
            .add_database_source(sqlite_spec(db.to_string_lossy().into_owned()))
            .unwrap();
        assert_eq!(source.kind, SourceKind::ExternalDatabase);
        assert_eq!(source.uri.as_deref(), Some("./app.sqlite"));

        let tables = handle.list_remote_tables(source.id).unwrap();
        assert!(tables.iter().any(|t| t.name == "items"));
        let columns = handle.list_remote_columns(source.id, "items").unwrap();
        assert!(columns.iter().any(|c| c.name == "name"));

        let preview = handle
            .execute_source_query(
                source.id,
                QueryRequest::sql("SELECT name FROM items ORDER BY id"),
            )
            .unwrap();
        assert_eq!(preview.returned_rows, 3);
        match &preview.columns()[0].data {
            ColumnData::Utf8 { values } => {
                assert_eq!(values, &["alpha".to_string(), "beta".into(), "gamma".into()])
            }
            other => panic!("{other:?}"),
        }

        close_project(handle).unwrap();
        let bytes = fs::read(&project).unwrap();
        assert!(!bytes.windows(b"alpha".len()).any(|w| w == b"alpha"));
    }

    #[test]
    fn credential_stays_out_of_dadix() {
        let dir = tempfile::tempdir().unwrap();
        let db = dir.path().join("app.sqlite");
        write_sqlite(&db);
        let mut handle = create_project(dir.path().join("cred.dadix")).unwrap();
        let store = Arc::new(MemoryCredentialStore::new());
        handle.set_credential_store(store);
        let id = handle
            .store_credential(&DatabaseSecret {
                username: None,
                password: Some("super-secret-password".into()),
            })
            .unwrap();
        let mut spec = sqlite_spec(db.to_string_lossy().into_owned());
        spec.credential_id = Some(id.clone());
        let source = handle.add_database_source(spec).unwrap();
        assert_eq!(
            source.credential.as_ref().map(|c| c.id.as_str()),
            Some(id.as_str())
        );
        let path = handle.path().to_path_buf();
        close_project(handle).unwrap();
        let bytes = fs::read(&path).unwrap();
        assert!(bytes.windows(id.len()).any(|w| w == id.as_bytes()));
        assert!(!bytes
            .windows(b"super-secret-password".len())
            .any(|w| w == b"super-secret-password"));
    }

    #[test]
    fn host_uri_parses_without_userinfo() {
        let target = parse_host_uri("postgresql://db.internal:5433/sales", 5432).unwrap();
        assert_eq!(target.host, "db.internal");
        assert_eq!(target.port, 5433);
        assert_eq!(target.database, "sales");
    }

    #[test]
    fn password_in_uri_is_rejected() {
        let dir = tempfile::tempdir().unwrap();
        let handle = create_project(dir.path().join("bad.dadix")).unwrap();
        let err = handle
            .add_database_source(NewDatabaseSource {
                name: "Pg".into(),
                engine: DatabaseEngine::Postgres,
                uri: "postgresql://user:hidden@localhost:5432/db".into(),
                ..NewDatabaseSource::default()
            })
            .unwrap_err();
        assert_eq!(err.code, ErrorCode::SecretInProject);
        close_project(handle).unwrap();
    }

    #[test]
    fn sql_server_connect_timeout_is_structured() {
        let dir = tempfile::tempdir().unwrap();
        let mut handle = create_project(dir.path().join("timeout.dadix")).unwrap();
        let store = Arc::new(MemoryCredentialStore::new());
        handle.set_credential_store(store);
        let id = handle
            .store_credential(&DatabaseSecret {
                username: None,
                password: Some("not-used-against-test-net".into()),
            })
            .unwrap();
        let source = handle
            .add_database_source(NewDatabaseSource {
                name: "unreachable".into(),
                engine: DatabaseEngine::SqlServer,
                host: Some("192.0.2.1".into()),
                port: Some(1433),
                database: Some("patm_berichte".into()),
                username: Some("dadix_ro".into()),
                credential_id: Some(id),
                encrypt: Some(true),
                connect_timeout_ms: Some(400),
                ..NewDatabaseSource::default()
            })
            .unwrap();
        let bytes = std::fs::read(handle.path()).unwrap();
        assert!(!bytes.windows(b"not-used-against-test-net".len()).any(|w| w == b"not-used-against-test-net"));
        let err = handle.test_source_connection(source.id).unwrap_err();
        assert!(
            matches!(err.code, ErrorCode::ConnectTimeout | ErrorCode::Connector | ErrorCode::Io),
            "expected structured connect failure, got {}",
            err.code
        );
        close_project(handle).unwrap();
    }

    #[test]
    fn mutating_sql_is_rejected() {
        let dir = tempfile::tempdir().unwrap();
        let db = dir.path().join("app.sqlite");
        write_sqlite(&db);
        let handle = create_project(dir.path().join("ro.dadix")).unwrap();
        let source = handle
            .add_database_source(sqlite_spec(db.to_string_lossy().into_owned()))
            .unwrap();
        let err = handle
            .execute_source_query(source.id, QueryRequest::sql("DELETE FROM items"))
            .unwrap_err();
        assert_eq!(err.code, ErrorCode::ReadOnly);
        close_project(handle).unwrap();
    }

    #[test]
    fn trust_server_certificate_defaults_to_false() {
        let dir = tempfile::tempdir().unwrap();
        let handle = create_project(dir.path().join("tls.dadix")).unwrap();
        let source = handle
            .add_database_source(NewDatabaseSource {
                name: "Klinik".into(),
                engine: DatabaseEngine::SqlServer,
                host: Some("mkn-mssql-exp".into()),
                port: Some(1433),
                database: Some("patm_berichte".into()),
                username: Some("dadix_ro".into()),
                encrypt: Some(true),
                ..NewDatabaseSource::default()
            })
            .unwrap();
        let opts = SourceOpts::from_json(source.options.as_deref());
        assert_eq!(opts.encrypt, Some(true));
        assert_eq!(opts.trust_server_certificate, Some(false));
        close_project(handle).unwrap();
    }

    #[test]
    fn capabilities_are_engine_specific() {
        assert_eq!(
            ConnectorCapabilities::sql_server().pagination,
            crate::connectors::PaginationStyle::TopFetch
        );
        assert_eq!(
            ConnectorCapabilities::postgres().parameter_style,
            crate::connectors::ParameterStyle::Dollar
        );
        assert!(ConnectorCapabilities::sql_server().cancel_invalidates_connection);
        assert!(!ConnectorCapabilities::postgres().cancel_invalidates_connection);
    }
}
