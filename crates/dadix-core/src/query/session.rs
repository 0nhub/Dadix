//! Project-scoped in-memory DuckDB session.

use crate::error::{DadixError, DadixResult, ErrorCode};
use crate::query::error as qerr;
use crate::query::result::{
    classify_sql, page_select, ColumnData, LogicalType, QueryId, QueryParam, QueryPayload,
    QueryRequest, QueryResult, QueryStatus, StatementKind, TypedColumn, MAX_QUERY_LIMIT,
};
use duckdb::types::{TimeUnit, Type, Value, ValueRef};
use duckdb::{params_from_iter, Connection, InterruptHandle};
use std::collections::{HashMap, HashSet};
use std::fmt;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

const STATUS_CAP: usize = 128;

struct Tracker {
    statuses: HashMap<String, QueryStatus>,
    order: Vec<String>,
    cancelled: HashSet<String>,
    running: Option<String>,
}

impl Tracker {
    fn new() -> Self {
        Self {
            statuses: HashMap::new(),
            order: Vec::new(),
            cancelled: HashSet::new(),
            running: None,
        }
    }

    fn set(&mut self, id: &QueryId, status: QueryStatus) {
        if !self.statuses.contains_key(id.as_str()) {
            self.order.push(id.0.clone());
            if self.order.len() > STATUS_CAP {
                let old = self.order.remove(0);
                self.statuses.remove(&old);
                self.cancelled.remove(&old);
            }
        }
        self.statuses.insert(id.0.clone(), status);
        match status {
            QueryStatus::Running => self.running = Some(id.0.clone()),
            _ if self.running.as_deref() == Some(id.as_str()) => self.running = None,
            _ => {}
        }
    }
}

/// One DuckDB connection plus cancellation/status state.
///
/// Default is `:memory:`. Nothing is written next to the `.dadix` file.
pub struct QuerySession {
    conn: Mutex<Option<Connection>>,
    interrupt: Arc<InterruptHandle>,
    tracker: Mutex<Tracker>,
    registrations: Mutex<HashSet<String>>,
    closed: AtomicBool,
    generation: Arc<AtomicU64>,
}

impl QuerySession {
    pub fn in_memory() -> DadixResult<Self> {
        let conn = Connection::open_in_memory().map_err(|e| {
            DadixError::new(
                ErrorCode::QueryEngineError,
                format!("failed to start in-memory DuckDB: {e}"),
            )
        })?;
        let interrupt = conn.interrupt_handle();
        Ok(Self {
            conn: Mutex::new(Some(conn)),
            interrupt,
            tracker: Mutex::new(Tracker::new()),
            registrations: Mutex::new(HashSet::new()),
            closed: AtomicBool::new(false),
            generation: Arc::new(AtomicU64::new(0)),
        })
    }

    pub fn is_open(&self) -> bool {
        !self.closed.load(Ordering::SeqCst)
    }

    pub fn shutdown(&self) {
        self.closed.store(true, Ordering::SeqCst);
        self.interrupt.interrupt();
        if let Ok(mut guard) = self.conn.lock() {
            *guard = None;
        }
    }

    pub fn query_status(&self, query_id: &QueryId) -> Option<QueryStatus> {
        self.tracker
            .lock()
            .ok()
            .and_then(|t| t.statuses.get(query_id.as_str()).copied())
    }

    pub fn registered_sources(&self) -> Vec<String> {
        self.registrations
            .lock()
            .map(|s| {
                let mut names: Vec<String> = s.iter().cloned().collect();
                names.sort();
                names
            })
            .unwrap_or_default()
    }

    pub fn register_temp_view(&self, name: &str, select_sql: &str) -> DadixResult<()> {
        self.ensure_open()?;
        validate_ident(name)?;
        let sql = format!("CREATE OR REPLACE TEMP VIEW {name} AS {select_sql}");
        self.execute(QueryRequest::sql(sql))?;
        if let Ok(mut set) = self.registrations.lock() {
            set.insert(name.to_string());
        }
        Ok(())
    }

    pub fn register_temp_table(&self, name: &str, select_sql: &str) -> DadixResult<()> {
        self.ensure_open()?;
        validate_ident(name)?;
        let sql = format!("CREATE TEMP TABLE {name} AS {select_sql}");
        self.execute(QueryRequest::sql(sql))?;
        if let Ok(mut set) = self.registrations.lock() {
            set.insert(name.to_string());
        }
        Ok(())
    }

    pub fn explain_query(
        &self,
        sql: &str,
        parameters: Vec<QueryParam>,
    ) -> DadixResult<QueryResult> {
        let kind = classify_sql(sql);
        let explain_sql = if kind == StatementKind::Explain {
            sql.to_string()
        } else {
            format!("EXPLAIN {sql}")
        };
        self.execute(QueryRequest {
            query_id: None,
            sql: explain_sql,
            offset: 0,
            limit: Some(MAX_QUERY_LIMIT),
            parameters,
            timeout_ms: None,
        })
    }

    pub fn execute(&self, request: QueryRequest) -> DadixResult<QueryResult> {
        self.ensure_open()?;
        let query_id = request.query_id.clone().unwrap_or_default();
        let started = Instant::now();
        let kind = classify_sql(&request.sql);
        let limit = request.resolved_limit();

        if request.sql.trim().is_empty() {
            self.fail(&query_id);
            return Err(qerr::syntax(&query_id, "SQL is empty", Some(0)));
        }
        if limit > MAX_QUERY_LIMIT {
            self.fail(&query_id);
            return Err(qerr::too_large(&query_id, limit));
        }

        self.set_status(&query_id, QueryStatus::Queued);
        if self.is_cancelled(&query_id) {
            self.set_status(&query_id, QueryStatus::Cancelled);
            return Err(qerr::cancelled(&query_id));
        }
        self.set_status(&query_id, QueryStatus::Running);

        let generation = self.generation.fetch_add(1, Ordering::SeqCst) + 1;
        let timed_out = Arc::new(AtomicBool::new(false));
        let _timeout = TimeoutWatch::spawn(
            request.timeout_ms,
            generation,
            Arc::clone(&self.generation),
            Arc::clone(&self.interrupt),
            Arc::clone(&timed_out),
        );

        let outcome = {
            let mut guard = match self.conn.lock() {
                Ok(g) => g,
                Err(_) => {
                    self.fail(&query_id);
                    return Err(DadixError::lock());
                }
            };
            let Some(conn) = guard.as_mut() else {
                self.fail(&query_id);
                return Err(qerr::engine(&query_id, "query session is closed"));
            };
            if self.is_cancelled(&query_id) {
                Err(duckdb::Error::InvalidParameterName(
                    "query was cancelled".into(),
                ))
            } else {
                self.run_sql(conn, &request, kind, limit)
            }
        };

        let elapsed = started.elapsed().as_millis() as u64;
        self.generation.fetch_add(1, Ordering::SeqCst);
        match outcome {
            Ok((payload, has_more, returned_rows)) => {
                if timed_out.load(Ordering::SeqCst) {
                    self.set_status(&query_id, QueryStatus::Failed);
                    return Err(qerr::timeout(&query_id));
                }
                if self.is_cancelled(&query_id) {
                    self.set_status(&query_id, QueryStatus::Cancelled);
                    return Err(qerr::cancelled(&query_id));
                }
                self.set_status(&query_id, QueryStatus::Completed);
                Ok(QueryResult {
                    query_id,
                    status: QueryStatus::Completed,
                    statement_kind: kind,
                    payload,
                    offset: request.offset,
                    returned_rows,
                    has_more,
                    execution_time_ms: elapsed,
                })
            }
            Err(err) => {
                let cancelled = self.is_cancelled(&query_id);
                let timed = timed_out.load(Ordering::SeqCst);
                self.set_status(
                    &query_id,
                    if cancelled || timed {
                        QueryStatus::Cancelled
                    } else {
                        QueryStatus::Failed
                    },
                );
                Err(qerr::from_duckdb(err, &query_id, cancelled, timed))
            }
        }
    }

    pub fn cancel(&self, query_id: &QueryId) -> DadixResult<()> {
        self.ensure_open()?;
        let should_interrupt = {
            let mut tracker = self.tracker.lock().map_err(|_| DadixError::lock())?;
            tracker.cancelled.insert(query_id.0.clone());
            tracker.set(query_id, QueryStatus::Cancelled);
            tracker.running.as_deref() == Some(query_id.as_str())
        };
        if should_interrupt {
            self.interrupt.interrupt();
            let interrupt = Arc::clone(&self.interrupt);
            thread::spawn(move || {
                for _ in 0..80 {
                    interrupt.interrupt();
                    thread::sleep(Duration::from_millis(25));
                }
            });
        }
        Ok(())
    }

    fn run_sql(
        &self,
        conn: &Connection,
        request: &QueryRequest,
        kind: StatementKind,
        limit: u32,
    ) -> Result<(QueryPayload, bool, u64), duckdb::Error> {
        let params: Vec<Value> = request.parameters.iter().map(param_to_value).collect();

        if kind.is_result_set() {
            let (batch, has_more) =
                collect_rows(conn, &request.sql, kind, &params, request.offset, limit)?;
            let returned = batch.row_count() as u64;
            return Ok((QueryPayload::columnar(batch.columns), has_more, returned));
        }

        match execute_mutating(conn, &request.sql, &params) {
            Ok(affected) => Ok((QueryPayload::columnar(Vec::new()), false, affected)),
            Err(err) => {
                if looks_like_result_set(&err) {
                    let (batch, has_more) = collect_rows(
                        conn,
                        &request.sql,
                        StatementKind::Select,
                        &params,
                        request.offset,
                        limit,
                    )?;
                    let returned = batch.row_count() as u64;
                    Ok((QueryPayload::columnar(batch.columns), has_more, returned))
                } else {
                    Err(err)
                }
            }
        }
    }

    fn ensure_open(&self) -> DadixResult<()> {
        if self.closed.load(Ordering::SeqCst) {
            Err(DadixError::new(
                ErrorCode::QueryEngineError,
                "query session is closed",
            ))
        } else {
            Ok(())
        }
    }

    fn set_status(&self, id: &QueryId, status: QueryStatus) {
        if let Ok(mut tracker) = self.tracker.lock() {
            tracker.set(id, status);
        }
    }

    fn fail(&self, id: &QueryId) {
        self.set_status(id, QueryStatus::Failed);
    }

    fn is_cancelled(&self, id: &QueryId) -> bool {
        self.tracker
            .lock()
            .map(|t| t.cancelled.contains(id.as_str()))
            .unwrap_or(false)
    }
}

impl Drop for QuerySession {
    fn drop(&mut self) {
        self.shutdown();
    }
}

impl fmt::Debug for QuerySession {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("QuerySession")
            .field("open", &self.is_open())
            .field("registrations", &self.registered_sources())
            .finish()
    }
}

struct TimeoutWatch {
    done: Arc<AtomicBool>,
}

impl TimeoutWatch {
    fn spawn(
        timeout_ms: Option<u64>,
        generation: u64,
        live_generation: Arc<AtomicU64>,
        interrupt: Arc<InterruptHandle>,
        timed_out: Arc<AtomicBool>,
    ) -> Self {
        let done = Arc::new(AtomicBool::new(false));
        if let Some(ms) = timeout_ms.filter(|ms| *ms > 0) {
            let finished = Arc::clone(&done);
            thread::spawn(move || {
                thread::sleep(Duration::from_millis(ms));
                if finished.load(Ordering::SeqCst) {
                    return;
                }
                if live_generation.load(Ordering::SeqCst) != generation {
                    return;
                }
                timed_out.store(true, Ordering::SeqCst);
                // A single interrupt can land before DuckDB starts the scan.
                for _ in 0..50 {
                    if finished.load(Ordering::SeqCst) {
                        return;
                    }
                    if live_generation.load(Ordering::SeqCst) != generation {
                        return;
                    }
                    interrupt.interrupt();
                    thread::sleep(Duration::from_millis(20));
                }
            });
        }
        Self { done }
    }
}

impl Drop for TimeoutWatch {
    fn drop(&mut self) {
        self.done.store(true, Ordering::SeqCst);
    }
}

fn execute_mutating(conn: &Connection, sql: &str, params: &[Value]) -> Result<u64, duckdb::Error> {
    let mut stmt = conn.prepare(sql)?;
    let n = stmt.execute(params_from_iter(params.iter()))?;
    Ok(n as u64)
}

fn collect_rows(
    conn: &Connection,
    sql: &str,
    kind: StatementKind,
    params: &[Value],
    offset: u64,
    limit: u32,
) -> Result<(crate::query::result::ColumnBatch, bool), duckdb::Error> {
    if kind == StatementKind::Select {
        let paged = page_select(sql, limit, offset);
        if let Ok(result) = fetch_limited(conn, &paged, params, limit) {
            return Ok(result);
        }
    }
    fetch_and_slice(conn, sql, params, offset, limit)
}

fn fetch_limited(
    conn: &Connection,
    sql: &str,
    params: &[Value],
    limit: u32,
) -> Result<(crate::query::result::ColumnBatch, bool), duckdb::Error> {
    let (batch, fetched) = fetch_all(conn, sql, params, limit as usize + 1)?;
    let has_more = fetched > limit as usize;
    Ok((truncate(batch, limit as usize), has_more))
}

fn fetch_and_slice(
    conn: &Connection,
    sql: &str,
    params: &[Value],
    offset: u64,
    limit: u32,
) -> Result<(crate::query::result::ColumnBatch, bool), duckdb::Error> {
    materialize(conn, sql, params, offset, limit as usize)
}

fn fetch_all(
    conn: &Connection,
    sql: &str,
    params: &[Value],
    cap: usize,
) -> Result<(crate::query::result::ColumnBatch, usize), duckdb::Error> {
    let (batch, _) = materialize(conn, sql, params, 0, cap)?;
    let fetched = batch.row_count();
    Ok((batch, fetched))
}

fn materialize(
    conn: &Connection,
    sql: &str,
    params: &[Value],
    skip: u64,
    take: usize,
) -> Result<(crate::query::result::ColumnBatch, bool), duckdb::Error> {
    let mut stmt = conn.prepare(sql)?;
    let mut collected: Vec<Vec<Value>> = Vec::new();
    let mut skipped = 0u64;
    let mut has_more = false;
    {
        let mut rows = stmt.query(params_from_iter(params.iter()))?;
        while let Some(row) = rows.next()? {
            if skipped < skip {
                skipped += 1;
                continue;
            }
            if collected.len() >= take {
                has_more = true;
                break;
            }
            let width = row.as_ref().column_count();
            let mut record = Vec::with_capacity(width);
            for i in 0..width {
                record.push(row.get_ref(i)?.to_owned());
            }
            collected.push(record);
        }
    }
    let names = stmt.column_names();
    let types: Vec<LogicalType> = (0..stmt.column_count())
        .map(|i| logical_from_duckdb(Type::from(&stmt.column_type(i))))
        .collect();
    Ok((build_batch(names, types, collected), has_more))
}

fn build_batch(
    names: Vec<String>,
    types: Vec<LogicalType>,
    rows: Vec<Vec<Value>>,
) -> crate::query::result::ColumnBatch {
    let mut builders: Vec<ColBuild> = names
        .into_iter()
        .zip(types)
        .map(|(name, ty)| ColBuild::new(name, ty))
        .collect();
    for record in rows {
        for (i, builder) in builders.iter_mut().enumerate() {
            if let Some(value) = record.get(i) {
                builder.push(ValueRef::from(value));
            }
        }
    }
    crate::query::result::ColumnBatch {
        columns: builders.into_iter().map(ColBuild::finish).collect(),
    }
}

fn truncate(
    mut batch: crate::query::result::ColumnBatch,
    limit: usize,
) -> crate::query::result::ColumnBatch {
    for column in &mut batch.columns {
        if column.validity.len() > limit {
            column.validity.truncate(limit);
            match &mut column.data {
                ColumnData::Bool { values } => values.truncate(limit),
                ColumnData::Int64 { values } => values.truncate(limit),
                ColumnData::UInt64 { values } => values.truncate(limit),
                ColumnData::Float64 { values } => values.truncate(limit),
                ColumnData::Decimal { values } => values.truncate(limit),
                ColumnData::Utf8 { values } => values.truncate(limit),
                ColumnData::Binary { values } => values.truncate(limit),
            }
        }
    }
    batch
}

fn looks_like_result_set(err: &duckdb::Error) -> bool {
    matches!(err, duckdb::Error::ExecuteReturnedResults) || {
        let message = err.to_string().to_ascii_lowercase();
        message.contains("returned results") || message.contains("use query")
    }
}

fn param_to_value(param: &QueryParam) -> Value {
    match param {
        QueryParam::Null => Value::Null,
        QueryParam::Bool(v) => Value::Boolean(*v),
        QueryParam::Int(v) => Value::BigInt(*v),
        QueryParam::Float(v) => Value::Double(*v),
        QueryParam::Text(v) => Value::Text(v.clone()),
    }
}

fn logical_from_duckdb(ty: Type) -> LogicalType {
    match ty {
        Type::Null => LogicalType::Null,
        Type::Boolean => LogicalType::Boolean,
        Type::TinyInt
        | Type::SmallInt
        | Type::Int
        | Type::BigInt
        | Type::UTinyInt
        | Type::USmallInt
        | Type::UInt
        | Type::UBigInt
        | Type::HugeInt => LogicalType::Int64,
        Type::Float | Type::Double | Type::Decimal => LogicalType::Float64,
        Type::Blob => LogicalType::Binary,
        Type::Timestamp | Type::Date32 | Type::Time64 => LogicalType::DateTime,
        _ => LogicalType::String,
    }
}

pub(crate) fn validate_ident(name: &str) -> DadixResult<()> {
    let valid = !name.is_empty()
        && name
            .chars()
            .enumerate()
            .all(|(i, c)| c.is_ascii_alphanumeric() || c == '_' && (i > 0 || c != '0'));
    let starts_ok = name
        .chars()
        .next()
        .is_some_and(|c| c.is_ascii_alphabetic() || c == '_');
    if valid && starts_ok {
        Ok(())
    } else {
        Err(DadixError::new(
            ErrorCode::QuerySyntaxError,
            format!("invalid identifier: {name}"),
        ))
    }
}

struct ColBuild {
    name: String,
    data_type: LogicalType,
    validity: Vec<bool>,
    bools: Vec<bool>,
    ints: Vec<i64>,
    floats: Vec<f64>,
    texts: Vec<String>,
    bins: Vec<Vec<u8>>,
}

impl ColBuild {
    fn new(name: String, data_type: LogicalType) -> Self {
        Self {
            name,
            data_type,
            validity: Vec::new(),
            bools: Vec::new(),
            ints: Vec::new(),
            floats: Vec::new(),
            texts: Vec::new(),
            bins: Vec::new(),
        }
    }

    fn push(&mut self, value: ValueRef<'_>) {
        if matches!(value, ValueRef::Null) {
            self.validity.push(false);
            self.push_default();
            return;
        }
        self.validity.push(true);
        match self.data_type {
            LogicalType::Boolean => self.bools.push(value_as_bool(value)),
            LogicalType::Int64 => self.ints.push(value_as_i64(value)),
            LogicalType::Float64 => self.floats.push(value_as_f64(value)),
            LogicalType::Binary => self.bins.push(value_as_bytes(value)),
            LogicalType::DateTime | LogicalType::DateTimeTz => {
                self.ints.push(value_as_timestamp_micros(value))
            }
            _ => self.texts.push(value_as_text(value)),
        }
    }

    fn push_default(&mut self) {
        match self.data_type {
            LogicalType::Boolean => self.bools.push(false),
            LogicalType::Int64 | LogicalType::DateTime | LogicalType::DateTimeTz => {
                self.ints.push(0)
            }
            LogicalType::Float64 => self.floats.push(0.0),
            LogicalType::Binary => self.bins.push(Vec::new()),
            _ => self.texts.push(String::new()),
        }
    }

    fn finish(self) -> TypedColumn {
        let data = match self.data_type {
            LogicalType::Boolean => ColumnData::Bool { values: self.bools },
            LogicalType::Int64 | LogicalType::DateTime | LogicalType::DateTimeTz => {
                ColumnData::Int64 { values: self.ints }
            }
            LogicalType::Float64 => ColumnData::Float64 {
                values: self.floats,
            },
            LogicalType::Binary => ColumnData::Binary { values: self.bins },
            _ => ColumnData::Utf8 { values: self.texts },
        };
        TypedColumn {
            name: self.name,
            data_type: self.data_type,
            native_type: Some("duckdb".into()),
            validity: self.validity,
            data,
        }
    }
}

fn value_as_bool(value: ValueRef<'_>) -> bool {
    match value {
        ValueRef::Boolean(v) => v,
        ValueRef::TinyInt(v) => v != 0,
        ValueRef::SmallInt(v) => v != 0,
        ValueRef::Int(v) => v != 0,
        ValueRef::BigInt(v) => v != 0,
        _ => value_as_text(value) == "true",
    }
}

fn value_as_i64(value: ValueRef<'_>) -> i64 {
    match value {
        ValueRef::TinyInt(v) => i64::from(v),
        ValueRef::SmallInt(v) => i64::from(v),
        ValueRef::Int(v) => i64::from(v),
        ValueRef::BigInt(v) => v,
        ValueRef::UTinyInt(v) => i64::from(v),
        ValueRef::USmallInt(v) => i64::from(v),
        ValueRef::UInt(v) => i64::from(v),
        ValueRef::UBigInt(v) => i64::try_from(v).unwrap_or(i64::MAX),
        ValueRef::HugeInt(v) => i64::try_from(v).unwrap_or(i64::MAX),
        ValueRef::Float(v) => v as i64,
        ValueRef::Double(v) => v as i64,
        ValueRef::Boolean(v) => i64::from(v),
        _ => value_as_text(value).parse().unwrap_or(0),
    }
}

fn value_as_f64(value: ValueRef<'_>) -> f64 {
    match value {
        ValueRef::Float(v) => f64::from(v),
        ValueRef::Double(v) => v,
        ValueRef::TinyInt(v) => f64::from(v),
        ValueRef::SmallInt(v) => f64::from(v),
        ValueRef::Int(v) => f64::from(v),
        ValueRef::BigInt(v) => v as f64,
        ValueRef::UTinyInt(v) => f64::from(v),
        ValueRef::USmallInt(v) => f64::from(v),
        ValueRef::UInt(v) => f64::from(v),
        ValueRef::UBigInt(v) => v as f64,
        ValueRef::HugeInt(v) => v as f64,
        ValueRef::Decimal(d) => d.to_string().parse().unwrap_or(0.0),
        _ => value_as_text(value).parse().unwrap_or(0.0),
    }
}

fn value_as_bytes(value: ValueRef<'_>) -> Vec<u8> {
    match value {
        ValueRef::Blob(bytes) | ValueRef::Text(bytes) => bytes.to_vec(),
        _ => value_as_text(value).into_bytes(),
    }
}

fn value_as_timestamp_micros(value: ValueRef<'_>) -> i64 {
    match value {
        ValueRef::Timestamp(unit, ticks) => scale_ticks(unit, ticks),
        ValueRef::Time64(unit, ticks) => scale_ticks(unit, ticks),
        ValueRef::Date32(days) => i64::from(days) * 86_400_000_000,
        _ => value_as_i64(value),
    }
}

fn scale_ticks(unit: TimeUnit, ticks: i64) -> i64 {
    match unit {
        TimeUnit::Second => ticks.saturating_mul(1_000_000),
        TimeUnit::Millisecond => ticks.saturating_mul(1_000),
        TimeUnit::Microsecond => ticks,
        TimeUnit::Nanosecond => ticks / 1_000,
    }
}

fn value_as_text(value: ValueRef<'_>) -> String {
    match value {
        ValueRef::Text(bytes) => String::from_utf8_lossy(bytes).into_owned(),
        ValueRef::Boolean(v) => v.to_string(),
        ValueRef::TinyInt(v) => v.to_string(),
        ValueRef::SmallInt(v) => v.to_string(),
        ValueRef::Int(v) => v.to_string(),
        ValueRef::BigInt(v) => v.to_string(),
        ValueRef::HugeInt(v) => v.to_string(),
        ValueRef::UTinyInt(v) => v.to_string(),
        ValueRef::USmallInt(v) => v.to_string(),
        ValueRef::UInt(v) => v.to_string(),
        ValueRef::UBigInt(v) => v.to_string(),
        ValueRef::Float(v) => v.to_string(),
        ValueRef::Double(v) => v.to_string(),
        ValueRef::Decimal(d) => d.to_string(),
        ValueRef::Blob(bytes) => String::from_utf8_lossy(bytes).into_owned(),
        ValueRef::Timestamp(unit, ticks) => format!("ts:{unit:?}:{ticks}"),
        ValueRef::Date32(days) => format!("date32:{days}"),
        ValueRef::Time64(unit, ticks) => format!("time:{unit:?}:{ticks}"),
        ValueRef::Null => String::new(),
        other => format!("{other:?}"),
    }
}
