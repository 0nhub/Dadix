use super::sql::{bind_placeholders, page_sql, require_read_only};
use super::types::{
    connector_result, text_columns, ConnectorCapabilities, ConnectorQueryResult, DatabaseEndpoint,
};
use super::{DatabaseConnector, RemoteColumn, RemoteTable};
use crate::credentials::DatabaseSecret;
use crate::error::{DadixError, DadixResult, ErrorCode};
use crate::query::{DadixType, QueryId, QueryParam, QueryRequest};
use postgres::{CancelToken, Client, NoTls};
use std::sync::Mutex;
use std::time::{Duration, Instant};

pub struct PostgresSession {
    client: Mutex<Client>,
    cancel_token: Mutex<Option<CancelToken>>,
    running: Mutex<Option<QueryId>>,
}

impl PostgresSession {
    pub fn connect(endpoint: &DatabaseEndpoint, secret: Option<&DatabaseSecret>) -> DadixResult<Self> {
        let mut config = postgres::Config::new();
        config.host(&endpoint.host);
        config.port(endpoint.port);
        config.dbname(&endpoint.database);
        config.connect_timeout(Duration::from_millis(endpoint.connect_timeout_ms));
        let user = endpoint
            .username
            .as_deref()
            .or_else(|| secret.and_then(|s| s.username.as_deref()));
        if let Some(user) = user {
            config.user(user);
        }
        if let Some(password) = secret.and_then(|s| s.password.as_deref()) {
            config.password(password);
        }
        let client = config.connect(NoTls).map_err(map_pg)?;
        Ok(Self {
            client: Mutex::new(client),
            cancel_token: Mutex::new(None),
            running: Mutex::new(None),
        })
    }
}

impl DatabaseConnector for PostgresSession {
    fn capabilities(&self) -> ConnectorCapabilities {
        ConnectorCapabilities::postgres()
    }

    fn test_connection(&self) -> DadixResult<()> {
        let mut client = self.client.lock().map_err(|_| DadixError::lock())?;
        client.simple_query("SELECT 1").map_err(map_pg)?;
        Ok(())
    }

    fn schemas(&self) -> DadixResult<Vec<String>> {
        let mut client = self.client.lock().map_err(|_| DadixError::lock())?;
        let rows = client
            .query(
                "SELECT schema_name FROM information_schema.schemata
                 WHERE schema_name NOT IN ('pg_catalog', 'information_schema')
                 ORDER BY schema_name",
                &[],
            )
            .map_err(map_pg)?;
        Ok(rows.iter().map(|row| row.get(0)).collect())
    }

    fn tables(&self, _schema: Option<&str>) -> DadixResult<Vec<RemoteTable>> {
        let mut client = self.client.lock().map_err(|_| DadixError::lock())?;
        let rows = client
            .query(
                "SELECT table_schema, table_name
                 FROM information_schema.tables
                 WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
                 ORDER BY table_schema, table_name",
                &[],
            )
            .map_err(map_pg)?;
        Ok(rows
            .iter()
            .map(|row| RemoteTable {
                schema: Some(row.get(0)),
                name: row.get(1),
            })
            .collect())
    }

    fn columns(&self, table: &str) -> DadixResult<Vec<RemoteColumn>> {
        crate::query::validate_ident(table)?;
        let mut client = self.client.lock().map_err(|_| DadixError::lock())?;
        let rows = client
            .query(
                "SELECT column_name, data_type, is_nullable
                 FROM information_schema.columns
                 WHERE table_name = $1
                 ORDER BY ordinal_position",
                &[&table],
            )
            .map_err(map_pg)?;
        Ok(rows
            .iter()
            .map(|row| {
                let native: String = row.get(1);
                let nullable: String = row.get(2);
                RemoteColumn {
                    name: row.get(0),
                    dadix_type: pg_type(&native),
                    native_type: native,
                    nullable: nullable.eq_ignore_ascii_case("YES"),
                }
            })
            .collect())
    }

    fn execute_query(&self, request: QueryRequest) -> DadixResult<ConnectorQueryResult> {
        require_read_only(&request.sql)?;
        let started = Instant::now();
        let query_id = request.query_id.clone().unwrap_or_default();
        let sql = bind_placeholders(self.capabilities(), &page_sql(self.capabilities(), &request.sql, &request));
        let mut client = self.client.lock().map_err(|_| DadixError::lock())?;
        if let Ok(mut token) = self.cancel_token.lock() {
            *token = Some(client.cancel_token());
        }
        if let Ok(mut running) = self.running.lock() {
            *running = Some(query_id);
        }
        let outcome = query_rows(&mut client, &sql, &request.parameters, request.timeout_ms);
        if let Ok(mut running) = self.running.lock() {
            *running = None;
        }
        if let Ok(mut token) = self.cancel_token.lock() {
            *token = None;
        }
        let rows = outcome?;
        let names = rows
            .first()
            .map(|row| {
                row.columns()
                    .iter()
                    .map(|c| c.name().to_string())
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        let natives = vec!["text".into(); names.len()];
        let take = request.resolved_limit() as usize;
        let has_more = rows.len() > take;
        let data = rows
            .iter()
            .take(take)
            .map(|row| (0..row.len()).map(|i| row_value(row, i)).collect())
            .collect::<Vec<_>>();
        let (meta, typed) = text_columns(names, &natives, &data);
        Ok(connector_result(&request, meta, typed, has_more, started))
    }

    fn cancel(&self, query_id: &QueryId) -> DadixResult<()> {
        let running = self
            .running
            .lock()
            .ok()
            .and_then(|g| g.clone())
            .is_some_and(|id| id == *query_id);
        if !running {
            return Ok(());
        }
        if let Ok(guard) = self.cancel_token.lock() {
            if let Some(token) = guard.as_ref() {
                let _ = token.cancel_query(NoTls);
            }
        }
        Ok(())
    }
}

fn query_rows(
    client: &mut Client,
    sql: &str,
    params: &[QueryParam],
    timeout_ms: Option<u64>,
) -> DadixResult<Vec<postgres::Row>> {
    let done = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
    let timed_out = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
    if let Some(ms) = timeout_ms.filter(|ms| *ms > 0) {
        let token = client.cancel_token();
        let done = std::sync::Arc::clone(&done);
        let timed_out = std::sync::Arc::clone(&timed_out);
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(ms));
            if !done.load(std::sync::atomic::Ordering::SeqCst) {
                timed_out.store(true, std::sync::atomic::Ordering::SeqCst);
                let _ = token.cancel_query(NoTls);
            }
        });
    }
    let result = query_rows_inner(client, sql, params);
    done.store(true, std::sync::atomic::Ordering::SeqCst);
    match result {
        Err(err)
            if err.code == ErrorCode::QueryCancelled
                && timed_out.load(std::sync::atomic::Ordering::SeqCst) =>
        {
            Err(DadixError::new(
                ErrorCode::QueryTimeout,
                "PostgreSQL query timed out",
            ))
        }
        other => other,
    }
}

fn query_rows_inner(
    client: &mut Client,
    sql: &str,
    params: &[QueryParam],
) -> DadixResult<Vec<postgres::Row>> {
    match params {
        [] => client.query(sql, &[]).map_err(map_pg),
        [QueryParam::Int(a)] => match i32::try_from(*a) {
            Ok(value) => client.query(sql, &[&value]).map_err(map_pg),
            Err(_) => client.query(sql, &[a]).map_err(map_pg),
        },
        [QueryParam::Text(a)] => client.query(sql, &[a]).map_err(map_pg),
        [QueryParam::Bool(a)] => client.query(sql, &[a]).map_err(map_pg),
        [QueryParam::Float(a)] => client.query(sql, &[a]).map_err(map_pg),
        [QueryParam::Int(a), QueryParam::Int(b)] => client.query(sql, &[a, b]).map_err(map_pg),
        [QueryParam::Text(a), QueryParam::Text(b)] => client.query(sql, &[a, b]).map_err(map_pg),
        [QueryParam::Int(a), QueryParam::Text(b)] => client.query(sql, &[a, b]).map_err(map_pg),
        [QueryParam::Text(a), QueryParam::Int(b)] => client.query(sql, &[a, b]).map_err(map_pg),
        _ => Err(DadixError::new(
            ErrorCode::Validation,
            "unsupported PostgreSQL parameter combination",
        )),
    }
}

fn pg_type(native: &str) -> DadixType {
    match native {
        "boolean" => DadixType::Boolean,
        "smallint" | "integer" | "bigint" => DadixType::Int64,
        "real" | "double precision" => DadixType::Float64,
        "numeric" | "decimal" => DadixType::Decimal,
        "date" => DadixType::Date,
        "time" | "time without time zone" => DadixType::Time,
        "timestamp" | "timestamp without time zone" => DadixType::DateTime,
        "timestamp with time zone" => DadixType::DateTimeTz,
        "uuid" => DadixType::Uuid,
        "json" | "jsonb" => DadixType::Json,
        "bytea" => DadixType::Binary,
        _ => DadixType::String,
    }
}

fn row_value(row: &postgres::Row, i: usize) -> Option<String> {
    if let Ok(v) = row.try_get::<_, Option<String>>(i) {
        return v;
    }
    if let Ok(v) = row.try_get::<_, Option<i64>>(i) {
        return v.map(|n| n.to_string());
    }
    if let Ok(v) = row.try_get::<_, Option<i32>>(i) {
        return v.map(|n| n.to_string());
    }
    if let Ok(v) = row.try_get::<_, Option<f64>>(i) {
        return v.map(|n| n.to_string());
    }
    if let Ok(v) = row.try_get::<_, Option<bool>>(i) {
        return v.map(|n| n.to_string());
    }
    None
}

fn map_pg(err: postgres::Error) -> DadixError {
    let message = err.to_string();
    let lower = message.to_ascii_lowercase();
    if lower.contains("cancel") {
        DadixError::with_details(ErrorCode::QueryCancelled, "PostgreSQL query cancelled", message)
    } else {
        DadixError::with_details(ErrorCode::Connector, "postgresql error", message)
    }
}
