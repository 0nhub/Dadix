//! Shared connector types. Every engine returns the same result shape.

use crate::error::{DadixError, DadixResult, ErrorCode};
use crate::query::{
    classify_sql, ColumnData, DadixType, QueryId, QueryPayload, QueryRequest, QueryResult,
    QueryStatus, StatementKind, TypedColumn,
};
use serde::{Deserialize, Serialize};
use std::time::Instant;

pub const DEFAULT_CONNECT_TIMEOUT_MS: u64 = 8_000;
pub const DEFAULT_IDLE_TIMEOUT_MS: u64 = 45_000;
/// Desktop cap. SQL Server currently opens one lazy connection and closes it when idle.
#[allow(dead_code)]
pub const DEFAULT_POOL_MAX: usize = 4;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PaginationStyle {
    None,
    LimitOffset,
    TopFetch,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ParameterStyle {
    None,
    QuestionMark,
    Dollar,
    AtPn,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct ConnectorCapabilities {
    pub supports_parameters: bool,
    pub parameter_style: ParameterStyle,
    pub supports_transactions: bool,
    pub supports_cancel: bool,
    pub cancel_invalidates_connection: bool,
    pub supports_schema: bool,
    pub pagination: PaginationStyle,
    pub supports_cte: bool,
    pub supports_tls: bool,
    pub read_only: bool,
}

impl ConnectorCapabilities {
    pub fn sqlite() -> Self {
        Self {
            supports_parameters: true,
            parameter_style: ParameterStyle::QuestionMark,
            supports_transactions: true,
            supports_cancel: false,
            cancel_invalidates_connection: false,
            supports_schema: false,
            pagination: PaginationStyle::LimitOffset,
            supports_cte: true,
            supports_tls: false,
            read_only: true,
        }
    }

    pub fn sql_server() -> Self {
        Self {
            supports_parameters: true,
            parameter_style: ParameterStyle::AtPn,
            supports_transactions: true,
            supports_cancel: true,
            cancel_invalidates_connection: true,
            supports_schema: true,
            pagination: PaginationStyle::TopFetch,
            supports_cte: true,
            supports_tls: true,
            read_only: true,
        }
    }

    pub fn postgres() -> Self {
        Self {
            supports_parameters: true,
            parameter_style: ParameterStyle::Dollar,
            supports_transactions: true,
            supports_cancel: true,
            cancel_invalidates_connection: false,
            supports_schema: true,
            pagination: PaginationStyle::LimitOffset,
            supports_cte: true,
            supports_tls: true,
            read_only: true,
        }
    }

    pub fn mysql() -> Self {
        Self {
            supports_parameters: true,
            parameter_style: ParameterStyle::QuestionMark,
            supports_transactions: true,
            supports_cancel: false,
            cancel_invalidates_connection: false,
            supports_schema: true,
            pagination: PaginationStyle::LimitOffset,
            supports_cte: true,
            supports_tls: true,
            read_only: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ConnectorColumn {
    pub name: String,
    pub dadix_type: DadixType,
    pub native_type: String,
    pub nullable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectorQueryResult {
    pub query_id: QueryId,
    pub status: QueryStatus,
    pub statement_kind: StatementKind,
    pub columns: Vec<ConnectorColumn>,
    pub payload: QueryPayload,
    pub affected_rows: u64,
    pub offset: u64,
    pub returned_rows: u64,
    pub has_more: bool,
    pub execution_time_ms: u64,
}

impl From<ConnectorQueryResult> for QueryResult {
    fn from(value: ConnectorQueryResult) -> Self {
        QueryResult {
            query_id: value.query_id,
            status: value.status,
            statement_kind: value.statement_kind,
            payload: value.payload,
            offset: value.offset,
            returned_rows: value.returned_rows,
            has_more: value.has_more,
            execution_time_ms: value.execution_time_ms,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DatabaseSourceOptions {
    pub host: Option<String>,
    pub port: Option<u16>,
    pub database: Option<String>,
    pub username: Option<String>,
    pub encrypt: Option<bool>,
    pub trust_server_certificate: Option<bool>,
    pub connect_timeout_ms: Option<u64>,
    pub idle_timeout_ms: Option<u64>,
}

impl DatabaseSourceOptions {
    pub fn from_json(raw: Option<&str>) -> Self {
        raw.and_then(|s| serde_json::from_str(s).ok())
            .unwrap_or_default()
    }

    pub fn to_json(&self) -> DadixResult<String> {
        serde_json::to_string(self).map_err(|err| {
            DadixError::with_details(ErrorCode::Validation, "invalid source options", err.to_string())
        })
    }
}

#[derive(Debug, Clone)]
pub struct DatabaseEndpoint {
    pub host: String,
    pub port: u16,
    pub database: String,
    pub username: Option<String>,
    pub encrypt: bool,
    pub trust_server_certificate: bool,
    pub connect_timeout_ms: u64,
    pub idle_timeout_ms: u64,
}

pub fn connector_result(
    request: &QueryRequest,
    columns: Vec<ConnectorColumn>,
    typed: Vec<TypedColumn>,
    has_more: bool,
    started: Instant,
) -> ConnectorQueryResult {
    let returned_rows = typed.first().map(|c| c.validity.len() as u64).unwrap_or(0);
    ConnectorQueryResult {
        query_id: request.query_id.clone().unwrap_or_default(),
        status: QueryStatus::Completed,
        statement_kind: classify_sql(&request.sql),
        columns,
        payload: QueryPayload::columnar(typed),
        affected_rows: 0,
        offset: request.offset,
        returned_rows,
        has_more,
        execution_time_ms: started.elapsed().as_millis() as u64,
    }
}

pub fn text_columns(
    names: Vec<String>,
    native: &[String],
    rows: &[Vec<Option<String>>],
) -> (Vec<ConnectorColumn>, Vec<TypedColumn>) {
    let meta = names
        .iter()
        .enumerate()
        .map(|(i, name)| ConnectorColumn {
            name: name.clone(),
            dadix_type: DadixType::String,
            native_type: native.get(i).cloned().unwrap_or_else(|| "text".into()),
            nullable: true,
        })
        .collect::<Vec<_>>();
    let typed = names
        .into_iter()
        .enumerate()
        .map(|(i, name)| {
            let mut validity = Vec::with_capacity(rows.len());
            let mut values = Vec::with_capacity(rows.len());
            for row in rows {
                match row.get(i).and_then(|v| v.as_ref()) {
                    Some(value) => {
                        validity.push(true);
                        values.push(value.clone());
                    }
                    None => {
                        validity.push(false);
                        values.push(String::new());
                    }
                }
            }
            TypedColumn {
                name: name.clone(),
                data_type: DadixType::String,
                native_type: native.get(i).cloned(),
                validity,
                data: ColumnData::Utf8 { values },
            }
        })
        .collect();
    (meta, typed)
}
