//! Unified error and result model for the Dadix core.

use serde::{Deserialize, Serialize};
use std::fmt;
use std::io;

pub type DadixResult<T> = Result<T, DadixError>;

/// Stable error codes returned to CLI, desktop, and (later) dadixd.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ErrorCode {
    InvalidPath,
    InvalidProject,
    ProjectNotOpen,
    ProjectAlreadyExists,
    Io,
    Database,
    Migration,
    Validation,
    PathResolution,
    Lock,
    SecretInProject,
    UnsupportedFormat,
    UnsupportedNewerFormat,
    NotFound,
    ProjectLocked,
    SourceNotFound,
    IncompleteSave,
    ReadOnly,
    QuerySyntaxError,
    QueryCancelled,
    QueryTimeout,
    QueryEngineError,
    QueryResultTooLarge,
    CredentialStore,
    Connector,
    ConnectTimeout,
}

impl ErrorCode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::InvalidPath => "INVALID_PATH",
            Self::InvalidProject => "INVALID_PROJECT",
            Self::ProjectNotOpen => "PROJECT_NOT_OPEN",
            Self::ProjectAlreadyExists => "PROJECT_ALREADY_EXISTS",
            Self::Io => "IO",
            Self::Database => "DATABASE",
            Self::Migration => "MIGRATION",
            Self::Validation => "VALIDATION",
            Self::PathResolution => "PATH_RESOLUTION",
            Self::Lock => "LOCK",
            Self::SecretInProject => "SECRET_IN_PROJECT",
            Self::UnsupportedFormat => "UNSUPPORTED_FORMAT",
            Self::UnsupportedNewerFormat => "UNSUPPORTED_NEWER_FORMAT",
            Self::NotFound => "NOT_FOUND",
            Self::ProjectLocked => "PROJECT_LOCKED",
            Self::SourceNotFound => "SOURCE_NOT_FOUND",
            Self::IncompleteSave => "INCOMPLETE_SAVE",
            Self::ReadOnly => "READ_ONLY",
            Self::QuerySyntaxError => "QUERY_SYNTAX_ERROR",
            Self::QueryCancelled => "QUERY_CANCELLED",
            Self::QueryTimeout => "QUERY_TIMEOUT",
            Self::QueryEngineError => "QUERY_ENGINE_ERROR",
            Self::QueryResultTooLarge => "QUERY_RESULT_TOO_LARGE",
            Self::CredentialStore => "CREDENTIAL_STORE",
            Self::Connector => "CONNECTOR",
            Self::ConnectTimeout => "CONNECT_TIMEOUT",
        }
    }
}

impl fmt::Display for ErrorCode {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

/// Structured error. Tauri serializes this object to the frontend.
#[derive(Debug, Clone, Serialize, Deserialize, thiserror::Error)]
#[error("{code}: {message}")]
pub struct DadixError {
    pub code: ErrorCode,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub query_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub position: Option<i64>,
}

impl DadixError {
    pub fn new(code: ErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            details: None,
            query_id: None,
            position: None,
        }
    }

    pub fn with_details(
        code: ErrorCode,
        message: impl Into<String>,
        details: impl Into<String>,
    ) -> Self {
        Self {
            code,
            message: message.into(),
            details: Some(details.into()),
            query_id: None,
            position: None,
        }
    }

    pub fn for_query(
        code: ErrorCode,
        message: impl Into<String>,
        query_id: impl Into<String>,
        position: Option<i64>,
    ) -> Self {
        Self {
            code,
            message: message.into(),
            details: None,
            query_id: Some(query_id.into()),
            position,
        }
    }

    pub fn secret(message: impl Into<String>) -> Self {
        Self::new(ErrorCode::SecretInProject, message)
    }

    pub fn lock() -> Self {
        Self::new(ErrorCode::Lock, "project session lock was poisoned")
    }
}

impl From<rusqlite::Error> for DadixError {
    fn from(value: rusqlite::Error) -> Self {
        Self::with_details(ErrorCode::Database, "sqlite error", value.to_string())
    }
}

impl From<io::Error> for DadixError {
    fn from(value: io::Error) -> Self {
        Self::with_details(ErrorCode::Io, "filesystem error", value.to_string())
    }
}
