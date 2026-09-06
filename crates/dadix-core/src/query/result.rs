//! Query request/result types. Results are columnar so Arrow can replace the payload later.

use serde::{Deserialize, Serialize};

pub const DEFAULT_QUERY_LIMIT: u32 = 1_000;
pub const MAX_QUERY_LIMIT: u32 = 10_000;

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct QueryId(pub String);

impl QueryId {
    pub fn new() -> Self {
        Self(uuid::Uuid::new_v4().to_string())
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl From<String> for QueryId {
    fn from(value: String) -> Self {
        Self(value)
    }
}

impl Default for QueryId {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum QueryStatus {
    Queued,
    Running,
    Completed,
    Cancelled,
    Failed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StatementKind {
    Select,
    Describe,
    Explain,
    Insert,
    Update,
    Delete,
    Create,
    Drop,
    Other,
}

impl StatementKind {
    pub fn is_read_only(self) -> bool {
        matches!(self, Self::Select | Self::Describe | Self::Explain)
    }

    pub fn is_result_set(self) -> bool {
        matches!(self, Self::Select | Self::Describe | Self::Explain)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "value", rename_all = "snake_case")]
pub enum QueryParam {
    Null,
    Bool(bool),
    Int(i64),
    Float(f64),
    Text(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueryRequest {
    pub query_id: Option<QueryId>,
    pub sql: String,
    #[serde(default)]
    pub offset: u64,
    pub limit: Option<u32>,
    #[serde(default)]
    pub parameters: Vec<QueryParam>,
    pub timeout_ms: Option<u64>,
}

impl QueryRequest {
    pub fn sql(sql: impl Into<String>) -> Self {
        Self {
            query_id: None,
            sql: sql.into(),
            offset: 0,
            limit: Some(DEFAULT_QUERY_LIMIT),
            parameters: Vec::new(),
            timeout_ms: None,
        }
    }

    pub fn resolved_limit(&self) -> u32 {
        self.limit.unwrap_or(DEFAULT_QUERY_LIMIT)
    }
}

/// Canonical Dadix type. Connectors map native types onto this and keep `native_type`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DadixType {
    Null,
    #[serde(alias = "bool")]
    Boolean,
    Int64,
    UInt64,
    Decimal,
    Float64,
    #[serde(alias = "utf8")]
    String,
    Binary,
    Date,
    Time,
    #[serde(alias = "timestamp")]
    DateTime,
    DateTimeTz,
    Uuid,
    Json,
}

impl std::fmt::Display for DadixType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(match self {
            Self::Null => "null",
            Self::Boolean => "boolean",
            Self::Int64 => "int64",
            Self::UInt64 => "uint64",
            Self::Decimal => "decimal",
            Self::Float64 => "float64",
            Self::String => "string",
            Self::Binary => "binary",
            Self::Date => "date",
            Self::Time => "time",
            Self::DateTime => "datetime",
            Self::DateTimeTz => "datetime_tz",
            Self::Uuid => "uuid",
            Self::Json => "json",
        })
    }
}

/// Backward-compatible alias used by the DuckDB session.
pub type LogicalType = DadixType;

/// One typed column. This is the Phase-4 stand-in for an Arrow array.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TypedColumn {
    pub name: String,
    pub data_type: DadixType,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub native_type: Option<String>,
    /// `true` means the value at that index is non-null.
    pub validity: Vec<bool>,
    pub data: ColumnData,
}

/// Columnar payload. A future `ArrowIpc` variant can be added without row JSON.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "encoding", rename_all = "snake_case")]
pub enum ColumnData {
    Bool { values: Vec<bool> },
    Int64 { values: Vec<i64> },
    UInt64 { values: Vec<u64> },
    Float64 { values: Vec<f64> },
    Decimal { values: Vec<String> },
    Utf8 { values: Vec<String> },
    Binary { values: Vec<Vec<u8>> },
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ColumnBatch {
    pub columns: Vec<TypedColumn>,
}

impl ColumnBatch {
    pub fn row_count(&self) -> usize {
        self.columns.first().map(|c| c.validity.len()).unwrap_or(0)
    }
}

/// Result body. Phase 4 ships columnar vectors; `arrow_ipc` is reserved so
/// the wire format is not locked to JSON row arrays.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "encoding", rename_all = "snake_case")]
pub enum QueryPayload {
    Columnar { columns: Vec<TypedColumn> },
    ArrowIpc { schema: String, buffers: Vec<u8> },
}

impl QueryPayload {
    pub fn columnar(columns: Vec<TypedColumn>) -> Self {
        Self::Columnar { columns }
    }

    pub fn columns(&self) -> &[TypedColumn] {
        match self {
            Self::Columnar { columns } => columns,
            Self::ArrowIpc { .. } => &[],
        }
    }

    pub fn row_count(&self) -> usize {
        self.columns()
            .first()
            .map(|c| c.validity.len())
            .unwrap_or(0)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueryResult {
    pub query_id: QueryId,
    pub status: QueryStatus,
    pub statement_kind: StatementKind,
    pub payload: QueryPayload,
    pub offset: u64,
    pub returned_rows: u64,
    pub has_more: bool,
    pub execution_time_ms: u64,
}

impl QueryResult {
    pub fn columns(&self) -> &[TypedColumn] {
        self.payload.columns()
    }
}

pub fn classify_sql(sql: &str) -> StatementKind {
    let first = first_keyword(sql);
    match first.as_str() {
        "SELECT" | "WITH" | "VALUES" | "TABLE" | "SHOW" | "FROM" => StatementKind::Select,
        "DESCRIBE" | "DESC" => StatementKind::Describe,
        "EXPLAIN" => StatementKind::Explain,
        "EXEC" | "EXECUTE" | "MERGE" | "TRUNCATE" | "GRANT" | "REVOKE" | "ALTER" => {
            StatementKind::Other
        }
        "INSERT" => StatementKind::Insert,
        "UPDATE" => StatementKind::Update,
        "DELETE" => StatementKind::Delete,
        "CREATE" => StatementKind::Create,
        "DROP" => StatementKind::Drop,
        _ => StatementKind::Other,
    }
}

fn first_keyword(sql: &str) -> String {
    let mut rest = sql.trim_start();
    loop {
        if rest.starts_with("--") {
            rest = rest.split_once('\n').map(|(_, t)| t).unwrap_or("");
            continue;
        }
        if rest.starts_with("/*") {
            rest = rest.split_once("*/").map(|(_, t)| t).unwrap_or("");
            continue;
        }
        break;
    }
    rest.split(|c: char| c.is_whitespace() || c == '(')
        .find(|p| !p.is_empty())
        .unwrap_or("")
        .trim_start_matches('(')
        .to_ascii_uppercase()
}

pub(crate) fn page_select(sql: &str, limit: u32, offset: u64) -> String {
    let trimmed = sql.trim().trim_end_matches(';').trim();
    let fetch = u64::from(limit).saturating_add(1);
    let upper = trimmed.to_ascii_uppercase();
    if !upper.contains(" LIMIT") && !upper.contains(" OFFSET") {
        format!("{trimmed} LIMIT {fetch} OFFSET {offset}")
    } else {
        format!("SELECT * FROM ({trimmed}) AS _dadix_q LIMIT {fetch} OFFSET {offset}")
    }
}
