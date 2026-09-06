//! Query-specific error mapping. Codes live on [`crate::error::ErrorCode`].

use crate::error::{DadixError, ErrorCode};
use crate::query::result::QueryId;

pub fn syntax(query_id: &QueryId, message: impl Into<String>, position: Option<i64>) -> DadixError {
    DadixError::for_query(
        ErrorCode::QuerySyntaxError,
        message,
        query_id.0.clone(),
        position,
    )
}

pub fn cancelled(query_id: &QueryId) -> DadixError {
    DadixError::for_query(
        ErrorCode::QueryCancelled,
        "query was cancelled",
        query_id.0.clone(),
        None,
    )
}

pub fn timeout(query_id: &QueryId) -> DadixError {
    DadixError::for_query(
        ErrorCode::QueryTimeout,
        "query exceeded its timeout",
        query_id.0.clone(),
        None,
    )
}

pub fn engine(query_id: &QueryId, message: impl Into<String>) -> DadixError {
    DadixError::for_query(
        ErrorCode::QueryEngineError,
        message,
        query_id.0.clone(),
        None,
    )
}

pub fn too_large(query_id: &QueryId, limit: u32) -> DadixError {
    DadixError::for_query(
        ErrorCode::QueryResultTooLarge,
        format!("requested limit {limit} exceeds the maximum chunk size"),
        query_id.0.clone(),
        None,
    )
}

pub fn from_duckdb(
    err: duckdb::Error,
    query_id: &QueryId,
    was_cancelled: bool,
    timed_out: bool,
) -> DadixError {
    if timed_out {
        return timeout(query_id);
    }
    if was_cancelled {
        return cancelled(query_id);
    }
    let message = err.to_string();
    let position = parse_position(&message);
    if matches!(
        err,
        duckdb::Error::InvalidQuery | duckdb::Error::MultipleStatement
    ) {
        return syntax(query_id, message, position);
    }
    let lower = message.to_ascii_lowercase();
    if lower.contains("interrupt") || lower.contains("cancelled") {
        cancelled(query_id)
    } else if lower.contains("parser error")
        || lower.contains("syntax")
        || lower.contains("invalid query")
    {
        syntax(query_id, message, position)
    } else {
        engine(query_id, message)
    }
}

fn parse_position(message: &str) -> Option<i64> {
    for marker in ["at position ", "LINE "] {
        if let Some(rest) = message.split(marker).nth(1) {
            let digits: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();
            if let Ok(pos) = digits.parse() {
                return Some(pos);
            }
        }
    }
    None
}
