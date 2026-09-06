//! SQL helpers shared by all connectors. Read-only is enforced here.

use super::types::{ConnectorCapabilities, PaginationStyle, ParameterStyle};
use crate::error::{DadixError, DadixResult, ErrorCode};
use crate::query::{classify_sql, page_select, QueryRequest};

const WRITE_MARKERS: &[&str] = &[
    " INSERT ",
    " UPDATE ",
    " DELETE ",
    " MERGE ",
    " DROP ",
    " ALTER ",
    " CREATE ",
    " TRUNCATE ",
    " EXEC ",
    " EXECUTE ",
    " GRANT ",
    " REVOKE ",
    " INTO ",
];

pub fn require_read_only(sql: &str) -> DadixResult<()> {
    if !classify_sql(sql).is_read_only() {
        return Err(DadixError::new(
            ErrorCode::ReadOnly,
            "external database queries are read-only in this phase",
        ));
    }
    let padded = format!(" {} ", sql.to_ascii_uppercase().replace('\n', " "));
    if WRITE_MARKERS.iter().any(|marker| padded.contains(marker)) {
        return Err(DadixError::new(
            ErrorCode::ReadOnly,
            "statement is not read-only",
        ));
    }
    Ok(())
}

pub fn page_sql(caps: ConnectorCapabilities, sql: &str, request: &QueryRequest) -> String {
    match caps.pagination {
        PaginationStyle::TopFetch => mssql_page(sql, request.resolved_limit(), request.offset),
        PaginationStyle::LimitOffset => {
            page_select(sql, request.resolved_limit(), request.offset)
        }
        PaginationStyle::None => sql.trim().trim_end_matches(';').trim().to_string(),
    }
}

pub fn bind_placeholders(caps: ConnectorCapabilities, sql: &str) -> String {
    if !caps.supports_parameters || !sql.contains('?') {
        return sql.to_string();
    }
    match caps.parameter_style {
        ParameterStyle::AtPn => rewrite_question(sql, |i| format!("@P{i}")),
        ParameterStyle::Dollar => rewrite_question(sql, |i| format!("${i}")),
        ParameterStyle::QuestionMark | ParameterStyle::None => sql.to_string(),
    }
}

fn rewrite_question(sql: &str, token: impl Fn(u32) -> String) -> String {
    let mut out = String::with_capacity(sql.len() + 8);
    let mut index = 1u32;
    let mut in_string = false;
    for ch in sql.chars() {
        if ch == '\'' {
            in_string = !in_string;
            out.push(ch);
            continue;
        }
        if ch == '?' && !in_string {
            out.push_str(&token(index));
            index += 1;
        } else {
            out.push(ch);
        }
    }
    out
}

fn mssql_page(sql: &str, limit: u32, offset: u64) -> String {
    let trimmed = sql.trim().trim_end_matches(';').trim();
    let upper = trimmed.to_ascii_uppercase();
    if upper.contains(" TOP ")
        || upper.contains(" TOP(")
        || upper.contains(" OFFSET ")
        || upper.contains(" FETCH ")
    {
        return trimmed.to_string();
    }
    let fetch = u64::from(limit).saturating_add(1);
    if offset == 0 {
        return inject_top(trimmed, fetch);
    }
    format!(
        "SELECT * FROM ({trimmed}) AS _dadix_q ORDER BY (SELECT NULL) OFFSET {offset} ROWS FETCH NEXT {fetch} ROWS ONLY"
    )
}

fn inject_top(sql: &str, n: u64) -> String {
    let rest = sql.trim_start();
    let upper = rest.to_ascii_uppercase();
    if upper.starts_with("SELECT DISTINCT") {
        format!("SELECT DISTINCT TOP ({n}) {}", rest[15..].trim_start())
    } else if upper.starts_with("SELECT") {
        format!("SELECT TOP ({n}) {}", rest[6..].trim_start())
    } else {
        rest.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_insert_and_select_into() {
        require_read_only("INSERT INTO t VALUES (1)").unwrap_err();
        require_read_only("SELECT * INTO copy FROM t").unwrap_err();
        require_read_only("EXEC sp_help").unwrap_err();
        require_read_only("SELECT 1").unwrap();
    }

    #[test]
    fn pagination_follows_capabilities_not_engine_name() {
        let req = QueryRequest::sql("SELECT name FROM patienten");
        let mssql = page_sql(ConnectorCapabilities::sql_server(), &req.sql, &req);
        assert!(mssql.to_ascii_uppercase().contains("TOP ("));
        assert!(!mssql.to_ascii_uppercase().contains(" LIMIT"));

        let pg = page_sql(ConnectorCapabilities::postgres(), &req.sql, &req);
        assert!(pg.to_ascii_uppercase().contains(" LIMIT"));
        assert!(!pg.to_ascii_uppercase().contains("TOP ("));

        let mysql = page_sql(ConnectorCapabilities::mysql(), &req.sql, &req);
        assert!(mysql.to_ascii_uppercase().contains(" LIMIT"));
    }

    #[test]
    fn parameter_style_follows_capabilities() {
        let sql = "SELECT * FROM t WHERE id = ? AND name = ?";
        assert_eq!(
            bind_placeholders(ConnectorCapabilities::sql_server(), sql),
            "SELECT * FROM t WHERE id = @P1 AND name = @P2"
        );
        assert_eq!(
            bind_placeholders(ConnectorCapabilities::postgres(), sql),
            "SELECT * FROM t WHERE id = $1 AND name = $2"
        );
        assert_eq!(
            bind_placeholders(ConnectorCapabilities::mysql(), sql),
            sql
        );
    }
}
