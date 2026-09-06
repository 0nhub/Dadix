use super::*;
use crate::error::ErrorCode;
use crate::project::{close_project, create_project};
use rusqlite::Connection;
use std::sync::Arc;
use std::thread;
use std::time::Duration;

fn int_values(result: &QueryResult, name: &str) -> Vec<Option<i64>> {
    let col = result
        .columns()
        .iter()
        .find(|c| c.name == name)
        .unwrap_or_else(|| panic!("missing column {name}"));
    match &col.data {
        ColumnData::Int64 { values } => col
            .validity
            .iter()
            .zip(values)
            .map(|(ok, v)| ok.then_some(*v))
            .collect(),
        other => panic!("column {name} was {other:?}"),
    }
}

fn text_values(result: &QueryResult, name: &str) -> Vec<Option<String>> {
    let col = result
        .columns()
        .iter()
        .find(|c| c.name == name)
        .unwrap_or_else(|| panic!("missing column {name}"));
    match &col.data {
        ColumnData::Utf8 { values } => col
            .validity
            .iter()
            .zip(values)
            .map(|(ok, v)| ok.then_some(v.clone()))
            .collect(),
        other => panic!("column {name} was {other:?}"),
    }
}

fn bool_values(result: &QueryResult, name: &str) -> Vec<Option<bool>> {
    let col = result
        .columns()
        .iter()
        .find(|c| c.name == name)
        .unwrap_or_else(|| panic!("missing column {name}"));
    match &col.data {
        ColumnData::Bool { values } => col
            .validity
            .iter()
            .zip(values)
            .map(|(ok, v)| ok.then_some(*v))
            .collect(),
        other => panic!("column {name} was {other:?}"),
    }
}

#[test]
fn engine_starts_without_a_server() {
    let engine = DuckDbQueryEngine;
    let session = engine.open_memory_session().unwrap();
    assert!(session.is_open());
    let result = session.execute(QueryRequest::sql("SELECT 1 AS n")).unwrap();
    assert_eq!(result.status, QueryStatus::Completed);
    assert_eq!(int_values(&result, "n"), vec![Some(1)]);
}

#[test]
fn memory_session_select_and_types() {
    let session = QuerySession::in_memory().unwrap();
    let result = session
        .execute(QueryRequest::sql(
            "SELECT true AS flag, 42::BIGINT AS n, 1.5::DOUBLE AS f, 'hi' AS t, NULL AS z",
        ))
        .unwrap();
    assert_eq!(result.statement_kind, StatementKind::Select);
    assert!(result.statement_kind.is_read_only());
    assert_eq!(bool_values(&result, "flag"), vec![Some(true)]);
    assert_eq!(int_values(&result, "n"), vec![Some(42)]);
    let f = result.columns().iter().find(|c| c.name == "f").unwrap();
    assert_eq!(f.data_type, LogicalType::Float64);
    assert_eq!(text_values(&result, "t"), vec![Some("hi".into())]);
    let z = result.columns().iter().find(|c| c.name == "z").unwrap();
    assert!(!z.validity[0]);
}

#[test]
fn parameter_binding_does_not_concatenate_sql() {
    let session = QuerySession::in_memory().unwrap();
    session
        .execute(QueryRequest::sql(
            "CREATE TABLE people (name VARCHAR, n INTEGER)",
        ))
        .unwrap();
    let mut insert = QueryRequest::sql("INSERT INTO people VALUES (?, ?)");
    insert.parameters = vec![QueryParam::Text("Ada".into()), QueryParam::Int(7)];
    session.execute(insert).unwrap();

    let mut select = QueryRequest::sql("SELECT n FROM people WHERE name = ?");
    select.parameters = vec![QueryParam::Text("Ada".into())];
    let result = session.execute(select).unwrap();
    assert_eq!(int_values(&result, "n"), vec![Some(7)]);
}

#[test]
fn large_result_is_chunked_with_limit_offset() {
    let session = QuerySession::in_memory().unwrap();
    session
        .execute(QueryRequest::sql(
            "CREATE TABLE nums AS SELECT i AS n FROM range(2500) t(i)",
        ))
        .unwrap();

    let mut first = QueryRequest::sql("SELECT n FROM nums ORDER BY n");
    first.limit = Some(1000);
    first.offset = 0;
    let a = session.execute(first).unwrap();
    assert_eq!(a.returned_rows, 1000);
    assert!(a.has_more);
    assert_eq!(int_values(&a, "n")[0], Some(0));
    assert_eq!(int_values(&a, "n")[999], Some(999));

    let mut second = QueryRequest::sql("SELECT n FROM nums ORDER BY n");
    second.limit = Some(1000);
    second.offset = 1000;
    let b = session.execute(second).unwrap();
    assert_eq!(b.returned_rows, 1000);
    assert!(b.has_more);
    assert_eq!(int_values(&b, "n")[0], Some(1000));

    let mut third = QueryRequest::sql("SELECT n FROM nums ORDER BY n");
    third.limit = Some(1000);
    third.offset = 2000;
    let c = session.execute(third).unwrap();
    assert_eq!(c.returned_rows, 500);
    assert!(!c.has_more);
    assert_eq!(int_values(&c, "n")[0], Some(2000));
    assert_eq!(int_values(&c, "n")[499], Some(2499));
}

#[test]
fn requested_limit_too_large_is_structured() {
    let session = QuerySession::in_memory().unwrap();
    let mut req = QueryRequest::sql("SELECT 1");
    req.limit = Some(MAX_QUERY_LIMIT + 1);
    let err = session.execute(req).unwrap_err();
    assert_eq!(err.code, ErrorCode::QueryResultTooLarge);
    assert!(err.query_id.is_some());
}

#[test]
fn syntax_error_is_structured() {
    let session = QuerySession::in_memory().unwrap();
    let err = session
        .execute(QueryRequest::sql("SELECT FROM"))
        .unwrap_err();
    assert_eq!(err.code, ErrorCode::QuerySyntaxError);
    assert!(err.query_id.is_some());
}

#[test]
fn missing_relation_is_engine_error() {
    let session = QuerySession::in_memory().unwrap();
    let err = session
        .execute(QueryRequest::sql("SELECT * FROM definitely_missing"))
        .unwrap_err();
    assert_eq!(err.code, ErrorCode::QueryEngineError);
}

#[test]
fn sequential_queries_keep_temp_objects() {
    let session = QuerySession::in_memory().unwrap();
    session
        .register_temp_table("scratch", "SELECT 1 AS n")
        .unwrap();
    session
        .execute(QueryRequest::sql("INSERT INTO scratch VALUES (2)"))
        .unwrap();
    let result = session
        .execute(QueryRequest::sql("SELECT n FROM scratch ORDER BY n"))
        .unwrap();
    assert_eq!(int_values(&result, "n"), vec![Some(1), Some(2)]);
    assert_eq!(session.registered_sources(), vec!["scratch".to_string()]);
}

#[test]
fn concurrent_sessions_are_isolated() {
    let a = Arc::new(QuerySession::in_memory().unwrap());
    let b = Arc::new(QuerySession::in_memory().unwrap());
    a.execute(QueryRequest::sql("CREATE TABLE t AS SELECT 1 AS n"))
        .unwrap();
    b.execute(QueryRequest::sql("CREATE TABLE t AS SELECT 9 AS n"))
        .unwrap();

    let a2 = Arc::clone(&a);
    let b2 = Arc::clone(&b);
    let ha = thread::spawn(move || a2.execute(QueryRequest::sql("SELECT n FROM t")).unwrap());
    let hb = thread::spawn(move || b2.execute(QueryRequest::sql("SELECT n FROM t")).unwrap());
    let ra = ha.join().unwrap();
    let rb = hb.join().unwrap();
    assert_eq!(int_values(&ra, "n"), vec![Some(1)]);
    assert_eq!(int_values(&rb, "n"), vec![Some(9)]);
}

#[test]
fn cancel_stops_a_long_query() {
    let session = Arc::new(QuerySession::in_memory().unwrap());
    let query_id = QueryId::new();
    let worker = {
        let session = Arc::clone(&session);
        let query_id = query_id.clone();
        thread::spawn(move || {
            let mut req = QueryRequest::sql("SELECT sum(i) AS s FROM range(2000000000) t(i)");
            req.query_id = Some(query_id);
            session.execute(req)
        })
    };
    thread::sleep(Duration::from_millis(80));
    session.cancel(&query_id).unwrap();
    let err = worker.join().unwrap().unwrap_err();
    assert_eq!(err.code, ErrorCode::QueryCancelled);
    assert_eq!(err.query_id.as_deref(), Some(query_id.as_str()));
    assert_eq!(
        session.query_status(&query_id),
        Some(QueryStatus::Cancelled)
    );

    let next = session.execute(QueryRequest::sql("SELECT 3 AS n")).unwrap();
    assert_eq!(int_values(&next, "n"), vec![Some(3)]);
}

#[test]
fn timeout_is_structured() {
    let session = QuerySession::in_memory().unwrap();
    let mut req = QueryRequest::sql("SELECT sum(i) AS s FROM range(2000000000) t(i)");
    req.timeout_ms = Some(50);
    let err = session.execute(req).unwrap_err();
    assert_eq!(err.code, ErrorCode::QueryTimeout);
}

#[test]
fn explain_query_returns_a_plan() {
    let session = QuerySession::in_memory().unwrap();
    let result = session.explain_query("SELECT 1 AS n", Vec::new()).unwrap();
    assert_eq!(result.statement_kind, StatementKind::Explain);
    assert!(!result.columns().is_empty());
}

#[test]
fn classify_distinguishes_read_and_write() {
    assert!(classify_sql("SELECT 1").is_read_only());
    assert!(classify_sql("-- note\nDESCRIBE t").is_read_only());
    assert!(classify_sql("EXPLAIN SELECT 1").is_read_only());
    assert!(!classify_sql("INSERT INTO t VALUES (1)").is_read_only());
    assert!(!classify_sql("UPDATE t SET a = 1").is_read_only());
    assert!(!classify_sql("DELETE FROM t").is_read_only());
    assert!(!classify_sql("CREATE TABLE t (a INT)").is_read_only());
    assert!(!classify_sql("DROP TABLE t").is_read_only());
}

#[test]
fn closing_a_session_rejects_further_queries() {
    let session = QuerySession::in_memory().unwrap();
    session.shutdown();
    let err = session.execute(QueryRequest::sql("SELECT 1")).unwrap_err();
    assert_eq!(err.code, ErrorCode::QueryEngineError);
}

#[test]
fn project_close_ends_session_and_keeps_duckdb_out_of_dadix() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("query.dadix");
    let handle = create_project(&path).unwrap();
    assert!(handle.has_query_session());
    handle
        .execute_query(QueryRequest::sql(
            "CREATE TABLE analytics AS SELECT 42 AS n",
        ))
        .unwrap();
    let live = handle
        .execute_query(QueryRequest::sql("SELECT n FROM analytics"))
        .unwrap();
    assert_eq!(int_values(&live, "n"), vec![Some(42)]);
    close_project(handle).unwrap();

    let duckdb_files: Vec<_> = std::fs::read_dir(dir.path())
        .unwrap()
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.path()
                .extension()
                .and_then(|s| s.to_str())
                .is_some_and(|ext| ext.eq_ignore_ascii_case("duckdb"))
        })
        .collect();
    assert!(duckdb_files.is_empty(), "unexpected {:?}", duckdb_files);

    let conn = Connection::open(&path).unwrap();
    let names: Vec<String> = conn
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .unwrap()
        .query_map([], |r| r.get(0))
        .unwrap()
        .map(|r| r.unwrap())
        .collect();
    assert!(!names.iter().any(|n| n == "analytics"));

    let handle = crate::project::open_project(&path).unwrap();
    let err = handle
        .execute_query(QueryRequest::sql("SELECT n FROM analytics"))
        .unwrap_err();
    assert_eq!(err.code, ErrorCode::QueryEngineError);
    close_project(handle).unwrap();
}

#[test]
fn payload_is_columnar_not_row_json() {
    let session = QuerySession::in_memory().unwrap();
    let result = session.execute(QueryRequest::sql("SELECT 1 AS n")).unwrap();
    match result.payload {
        QueryPayload::Columnar { columns } => assert_eq!(columns.len(), 1),
        QueryPayload::ArrowIpc { .. } => panic!("phase 4 must not emit arrow ipc yet"),
    }
}
