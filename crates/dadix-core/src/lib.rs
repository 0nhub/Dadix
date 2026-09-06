//! Dadix project core.
//!
//! No Tauri, React, Next.js, or Express dependencies. Desktop, CLI, and dadixd
//! should call this crate only.

mod atomic;
mod connectors;
mod credentials;
mod demo;
mod domain;
mod error;
mod file_id;
mod files;
mod formula;
mod lock;
mod migrate;
mod paths;
mod project;
mod query;
mod schema;
mod secrets;
mod store;
mod table_query;
mod validate;

pub use connectors::{
    ConnectorCapabilities, ConnectorColumn, ConnectorQueryResult, DatabaseConnector,
    DatabaseEngine, DatabaseSourceOptions, NewDatabaseSource, PaginationStyle, ParameterStyle,
    RemoteColumn, RemoteTable, SourceSession,
};
pub use demo::{
    demo_project_path, open_or_create_demo_at, open_or_create_demo_project,
    open_or_create_web_demo_at, open_or_create_web_demo_project, seed_demo, seed_web_dadix,
    web_demo_project_path,
};
pub use credentials::{
    default_credential_store, delete_os_credential, get_os_credential, new_credential_id,
    put_os_credential, CredentialStore, DatabaseSecret, MemoryCredentialStore, OsCredentialStore,
};
pub use domain::{
    AccessMode, Column, CredentialRef, GridViewColumn, Job, MissingSource, NewJob, NewSource, ViewButton,
    NewSourceTable, Project, Record, RecordPage, RecoveryArtifact, RecoveryKind, Setting, Source, SourceKind,
    SourceTable, Table, ValidationIssue, ValidationReport, View,
};
pub use error::{DadixError, DadixResult, ErrorCode};
pub use formula::eval_formula;
pub use files::{is_http_uri, scan_sql, BoundFileSource, FileFormat, FileScanOptions};
pub use migrate::{apply_migrations, migrate_v1_to_v2, migrate_v2_to_v3};
pub use paths::{
    embedded_dir, ensure_dadix_extension, is_dadix_path, normalize_relative_uri, project_dir,
    resolve_source_path, to_relative_uri, PathMode, ResolvedPath,
};
pub use project::{
    close_project, create_project, list_project_recovery, migrate_project, open_project,
    open_project_readonly, open_project_with, peek_format_version, restore_project_backup,
    save_project, validate_project, ProjectHandle,
};
pub use query::{
    classify_sql, ColumnBatch, ColumnData, DadixType, DuckDbQueryEngine, LogicalType, QueryEngine,
    QueryId, QueryParam, QueryPayload, QueryRequest, QueryResult, QuerySession, QueryStatus,
    StatementKind, TypedColumn, DEFAULT_QUERY_LIMIT, MAX_QUERY_LIMIT,
};
pub use schema::{APP_VERSION, FORMAT_VERSION, MINIMUM_READER_VERSION};

#[cfg(test)]
mod tests;
