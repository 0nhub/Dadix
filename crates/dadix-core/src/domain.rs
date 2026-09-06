//! Domain types shared by Desktop, CLI, and (later) dadixd.

use crate::paths::PathMode;
use serde::{Deserialize, Serialize};

/// How a source holds data. Independent of [`PathMode`].
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SourceKind {
    /// Rows live inside the `.dadix` file (`records`).
    EmbeddedTable,
    /// Bytes live in the sidecar folder (`*.dadix.d/`).
    EmbeddedFile,
    /// External file next to or outside the project (CSV, Parquet, …).
    LinkedFile,
    /// Server or API; no local file path required.
    ExternalDatabase,
}

impl SourceKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::EmbeddedTable => "embedded_table",
            Self::EmbeddedFile => "embedded_file",
            Self::LinkedFile => "linked_file",
            Self::ExternalDatabase => "external_database",
        }
    }

    pub fn parse(value: &str) -> Result<Self, String> {
        match value {
            "embedded_table" => Ok(Self::EmbeddedTable),
            "embedded_file" => Ok(Self::EmbeddedFile),
            "linked_file" => Ok(Self::LinkedFile),
            "external_database" => Ok(Self::ExternalDatabase),
            other => Err(other.to_string()),
        }
    }

    pub fn needs_local_file(self) -> bool {
        matches!(self, Self::LinkedFile | Self::EmbeddedFile)
    }
}

/// Open project snapshot.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Project {
    pub id: i64,
    pub project_id: String,
    pub path: String,
    pub name: String,
    pub created_at: String,
    pub updated_at: String,
    pub app_version: String,
    pub format_version: i32,
    pub minimum_reader_version: i32,
}

/// Reference to a secret stored outside the `.dadix` file (OS keychain later).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CredentialRef {
    pub id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Source {
    pub id: i64,
    pub name: String,
    pub type_name: String,
    pub kind: SourceKind,
    pub path_mode: PathMode,
    pub uri: Option<String>,
    pub options: Option<String>,
    pub credential: Option<CredentialRef>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SourceTable {
    pub id: i64,
    pub source_id: i64,
    pub logical_name: String,
    pub remote_name: Option<String>,
    pub options: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Job {
    pub id: i64,
    pub name: String,
    pub enabled: bool,
    pub schedule: Option<String>,
    pub payload: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Setting {
    pub key: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewSource {
    pub name: String,
    pub type_name: String,
    pub kind: SourceKind,
    pub path_mode: PathMode,
    pub uri: Option<String>,
    pub options: Option<String>,
    pub credential: Option<CredentialRef>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewSourceTable {
    pub source_id: i64,
    pub logical_name: String,
    pub remote_name: Option<String>,
    pub options: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewJob {
    pub name: String,
    pub enabled: bool,
    pub schedule: Option<String>,
    pub payload: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Table {
    pub id: i64,
    pub name: String,
    pub reference_name: String,
    pub icon: String,
    pub order: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Column {
    pub id: i64,
    pub table_id: i64,
    pub name: String,
    pub type_name: String,
    pub options: Option<String>,
    pub order: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct View {
    pub id: i64,
    pub table_id: i64,
    pub name: String,
    pub type_name: String,
    pub filter: Option<String>,
    pub sort: Option<String>,
    pub order: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ViewButton {
    pub id: i64,
    pub view_id: i64,
    pub label: String,
    pub order: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct GridViewColumn {
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
pub struct Record {
    pub id: i64,
    #[serde(flatten)]
    pub data: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecordPage {
    pub records: Vec<Record>,
    pub total: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct MissingSource {
    pub source_id: i64,
    pub name: String,
    pub kind: SourceKind,
    pub path_mode: PathMode,
    pub stored_uri: Option<String>,
    pub expected_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RecoveryArtifact {
    pub kind: RecoveryKind,
    pub path: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RecoveryKind {
    Tmp,
    Bak,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AccessMode {
    ReadWrite,
    ReadOnly,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ValidationIssue {
    pub code: crate::error::ErrorCode,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ValidationReport {
    pub ok: bool,
    pub format_version: Option<i32>,
    pub issues: Vec<ValidationIssue>,
}

impl ValidationReport {
    pub fn ok(format_version: i32) -> Self {
        Self {
            ok: true,
            format_version: Some(format_version),
            issues: Vec::new(),
        }
    }

    pub fn failed(format_version: Option<i32>, issues: Vec<ValidationIssue>) -> Self {
        Self {
            ok: false,
            format_version,
            issues,
        }
    }
}
