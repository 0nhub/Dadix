use super::sql::{bind_placeholders, page_sql, require_read_only};
use super::types::{
    connector_result, ConnectorCapabilities, ConnectorColumn, ConnectorQueryResult, DatabaseEndpoint,
};
use super::{DatabaseConnector, RemoteColumn, RemoteTable};
use crate::credentials::DatabaseSecret;
use crate::error::{DadixError, DadixResult, ErrorCode};
use crate::query::{
    ColumnData, DadixType, QueryId, QueryParam, QueryRequest, TypedColumn,
};
use chrono::{NaiveDate, NaiveDateTime, NaiveTime};
use futures_util::TryStreamExt;
use rust_decimal::Decimal;
use std::net::Shutdown;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tiberius::{AuthMethod, Client, Column, ColumnType, Config, EncryptionLevel, Query, QueryItem};
use tokio::net::TcpStream;
use tokio::runtime::Runtime;
use tokio::time::timeout;
use tokio_util::compat::{Compat, TokioAsyncWriteCompatExt};

type SqlClient = Client<Compat<TcpStream>>;

pub struct SqlServerSession {
    endpoint: DatabaseEndpoint,
    password: Option<String>,
    runtime: Runtime,
    inner: Mutex<Option<SqlClient>>,
    shutdown: Mutex<Option<std::net::TcpStream>>,
    last_used: Mutex<Instant>,
    cancel: AtomicBool,
    running: Mutex<Option<QueryId>>,
    connects: AtomicU64,
}

impl SqlServerSession {
    pub fn connect(endpoint: DatabaseEndpoint, secret: Option<&DatabaseSecret>) -> DadixResult<Self> {
        if endpoint.username.is_none() && secret.and_then(|s| s.username.as_ref()).is_none() {
            return Err(DadixError::new(
                ErrorCode::CredentialStore,
                "SQL Server requires a username on the source and a password credential_id",
            ));
        }
        let password = secret.and_then(|s| s.password.clone());
        if password.as_deref().unwrap_or("").is_empty() {
            return Err(DadixError::new(
                ErrorCode::CredentialStore,
                "SQL Server password is missing from the OS credential store",
            ));
        }
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_io()
            .enable_time()
            .build()
            .map_err(|err| {
                DadixError::with_details(ErrorCode::Connector, "tokio runtime", err.to_string())
            })?;
        Ok(Self {
            endpoint,
            password,
            runtime,
            inner: Mutex::new(None),
            shutdown: Mutex::new(None),
            last_used: Mutex::new(Instant::now()),
            cancel: AtomicBool::new(false),
            running: Mutex::new(None),
            connects: AtomicU64::new(0),
        })
    }

    fn config(&self) -> DadixResult<Config> {
        let mut config = Config::new();
        config.host(&self.endpoint.host);
        config.port(self.endpoint.port);
        config.database(&self.endpoint.database);
        config.application_name("Dadix");
        if self.endpoint.encrypt {
            config.encryption(EncryptionLevel::Required);
        }
        if self.endpoint.trust_server_certificate {
            config.trust_cert();
        }
        let user = self
            .endpoint
            .username
            .clone()
            .ok_or_else(|| {
                DadixError::new(ErrorCode::CredentialStore, "SQL Server username is missing")
            })?;
        let password = self.password.clone().unwrap_or_default();
        config.authentication(AuthMethod::sql_server(user, password));
        Ok(config)
    }

    fn connect_now(&self) -> DadixResult<SqlClient> {
        let config = self.config()?;
        let timeout_ms = self.endpoint.connect_timeout_ms;
        let host = self.endpoint.host.clone();
        let port = self.endpoint.port;
        self.connects.fetch_add(1, Ordering::SeqCst);
        self.runtime
            .block_on(async {
                timeout(Duration::from_millis(timeout_ms), async {
                    let mut addrs = tokio::net::lookup_host((host.as_str(), port))
                        .await
                        .map_err(map_mssql)?;
                    let addr = addrs.next().ok_or_else(|| {
                        DadixError::new(
                            ErrorCode::Connector,
                            format!("SQL Server host did not resolve: {host}"),
                        )
                    })?;
                    let tcp = TcpStream::connect(addr).await?;
                    tcp.set_nodelay(true)?;
                    let std_tcp = tcp.into_std()?;
                    let killer = std_tcp.try_clone()?;
                    if let Ok(mut slot) = self.shutdown.lock() {
                        *slot = Some(killer);
                    }
                    std_tcp.set_nonblocking(true)?;
                    let tcp = TcpStream::from_std(std_tcp)?;
                    Client::connect(config, tcp.compat_write())
                        .await
                        .map_err(map_mssql)
                })
                .await
            })
            .map_err(|_| {
                DadixError::new(
                    ErrorCode::ConnectTimeout,
                    format!("SQL Server connect timed out after {timeout_ms} ms"),
                )
            })?
    }

    fn take_client(&self) -> DadixResult<SqlClient> {
        let idle = Duration::from_millis(self.endpoint.idle_timeout_ms);
        let stale = self
            .last_used
            .lock()
            .map(|t| t.elapsed() > idle)
            .unwrap_or(true);
        let cached = {
            let mut guard = self.inner.lock().map_err(|_| DadixError::lock())?;
            if stale {
                *guard = None;
            }
            guard.take()
        };
        if let Some(client) = cached {
            return Ok(client);
        }
        self.connect_now()
    }

    fn put_client(&self, client: SqlClient) {
        if let Ok(mut guard) = self.inner.lock() {
            *guard = Some(client);
        }
        if let Ok(mut used) = self.last_used.lock() {
            *used = Instant::now();
        }
    }

    fn drop_client(&self) {
        if let Ok(mut guard) = self.inner.lock() {
            *guard = None;
        }
        self.interrupt_socket();
    }

    fn interrupt_socket(&self) {
        if let Ok(mut slot) = self.shutdown.lock() {
            if let Some(stream) = slot.take() {
                let _ = stream.shutdown(Shutdown::Both);
            }
        }
    }

    fn run_sql(
        &self,
        sql: &str,
        params: &[QueryParam],
        take: usize,
        timeout_ms: Option<u64>,
    ) -> DadixResult<(Vec<ConnectorColumn>, Vec<TypedColumn>, bool)> {
        self.cancel.store(false, Ordering::SeqCst);
        let sql = bind_placeholders(self.capabilities(), sql);
        let mut client = self.take_client()?;
        let outcome = self.runtime.block_on(async {
            let work = collect_rows(&mut client, &sql, params, take);
            if let Some(ms) = timeout_ms.filter(|ms| *ms > 0) {
                timeout(Duration::from_millis(ms), work)
                    .await
                    .map_err(|_| timed_out())?
            } else {
                work.await
            }
        });
        if self.cancel.load(Ordering::SeqCst) {
            drop(client);
            self.drop_client();
            return Err(DadixError::new(
                ErrorCode::QueryCancelled,
                "query was cancelled",
            ));
        }
        match outcome {
            Ok(rows) => {
                self.put_client(client);
                Ok(rows)
            }
            Err(err) => {
                drop(client);
                self.drop_client();
                Err(err)
            }
        }
    }
}

impl DatabaseConnector for SqlServerSession {
    fn capabilities(&self) -> ConnectorCapabilities {
        ConnectorCapabilities::sql_server()
    }

    fn test_connection(&self) -> DadixResult<()> {
        let (cols, _, _) = self.run_sql("SELECT 1 AS n", &[], 1, Some(self.endpoint.connect_timeout_ms))?;
        if cols.is_empty() {
            return Err(DadixError::new(
                ErrorCode::Connector,
                "SQL Server connection test returned no columns",
            ));
        }
        Ok(())
    }

    fn databases(&self) -> DadixResult<Vec<String>> {
        let (_, typed, _) = self.run_sql(
            "SELECT name FROM sys.databases WHERE state_desc = N'ONLINE' ORDER BY name",
            &[],
            10_000,
            None,
        )?;
        Ok(string_column(&typed, 0))
    }

    fn schemas(&self) -> DadixResult<Vec<String>> {
        let (_, typed, _) = self.run_sql(
            "SELECT name FROM sys.schemas ORDER BY name",
            &[],
            10_000,
            None,
        )?;
        Ok(string_column(&typed, 0))
    }

    fn tables(&self, schema: Option<&str>) -> DadixResult<Vec<RemoteTable>> {
        let sql = if let Some(schema) = schema {
            crate::query::validate_ident(schema)?;
            format!(
                "SELECT TABLE_SCHEMA, TABLE_NAME
                 FROM INFORMATION_SCHEMA.TABLES
                 WHERE TABLE_TYPE IN ('BASE TABLE', 'VIEW') AND TABLE_SCHEMA = @P1
                 ORDER BY TABLE_SCHEMA, TABLE_NAME"
            )
        } else {
            "SELECT TABLE_SCHEMA, TABLE_NAME
             FROM INFORMATION_SCHEMA.TABLES
             WHERE TABLE_TYPE IN ('BASE TABLE', 'VIEW')
             ORDER BY TABLE_SCHEMA, TABLE_NAME"
                .into()
        };
        let params = schema
            .map(|s| vec![QueryParam::Text(s.into())])
            .unwrap_or_default();
        let (_, typed, _) = self.run_sql(&sql, &params, 10_000, None)?;
        let schemas = string_column(&typed, 0);
        let names = string_column(&typed, 1);
        Ok(schemas
            .into_iter()
            .zip(names)
            .map(|(schema, name)| RemoteTable {
                schema: Some(schema),
                name,
            })
            .collect())
    }

    fn columns(&self, table: &str) -> DadixResult<Vec<RemoteColumn>> {
        crate::query::validate_ident(table)?;
        let (_, typed, _) = self.run_sql(
            "SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, CHARACTER_MAXIMUM_LENGTH, NUMERIC_PRECISION, NUMERIC_SCALE
             FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_NAME = @P1
             ORDER BY ORDINAL_POSITION",
            &[QueryParam::Text(table.into())],
            10_000,
            None,
        )?;
        let names = string_column(&typed, 0);
        let types = string_column(&typed, 1);
        let nulls = string_column(&typed, 2);
        let lengths = string_column(&typed, 3);
        let precisions = string_column(&typed, 4);
        let scales = string_column(&typed, 5);
        Ok(names
            .into_iter()
            .enumerate()
            .map(|(i, name)| {
                let base = types.get(i).cloned().unwrap_or_else(|| "unknown".into());
                let native = format_native(
                    &base,
                    lengths.get(i).and_then(|s| s.parse().ok()),
                    precisions.get(i).and_then(|s| s.parse().ok()),
                    scales.get(i).and_then(|s| s.parse().ok()),
                );
                RemoteColumn {
                    name,
                    dadix_type: dadix_from_native(&base),
                    native_type: native,
                    nullable: nulls
                        .get(i)
                        .is_some_and(|v| v.eq_ignore_ascii_case("YES")),
                }
            })
            .collect())
    }

    fn execute_query(&self, request: QueryRequest) -> DadixResult<ConnectorQueryResult> {
        require_read_only(&request.sql)?;
        let started = Instant::now();
        let query_id = request.query_id.clone().unwrap_or_default();
        if let Ok(mut running) = self.running.lock() {
            *running = Some(query_id.clone());
        }
        let sql = page_sql(self.capabilities(), &request.sql, &request);
        let take = request.resolved_limit() as usize;
        let result = self.run_sql(&sql, &request.parameters, take + 1, request.timeout_ms);
        if let Ok(mut running) = self.running.lock() {
            *running = None;
        }
        let (meta, mut typed, mut has_more) = result?;
        if typed.first().is_some_and(|c| c.validity.len() > take) {
            has_more = true;
            for column in &mut typed {
                column.validity.truncate(take);
                truncate_data(&mut column.data, take);
            }
        }
        Ok(connector_result(&request, meta, typed, has_more, started))
    }

    fn cancel(&self, query_id: &QueryId) -> DadixResult<()> {
        let running = self
            .running
            .lock()
            .ok()
            .and_then(|g| g.clone())
            .is_some_and(|id| id == *query_id);
        if running {
            self.cancel.store(true, Ordering::SeqCst);
            self.interrupt_socket();
            if let Ok(mut guard) = self.inner.lock() {
                *guard = None;
            }
        }
        Ok(())
    }

    fn connection_generation(&self) -> u64 {
        self.connects.load(Ordering::SeqCst)
    }
}

async fn collect_rows(
    client: &mut SqlClient,
    sql: &str,
    params: &[QueryParam],
    take: usize,
) -> DadixResult<(Vec<ConnectorColumn>, Vec<TypedColumn>, bool)> {
    let mut query = Query::new(sql);
    for param in params {
        bind_param(&mut query, param);
    }
    let mut stream = query.query(client).await.map_err(map_mssql)?;
    let mut columns: Vec<Column> = Vec::new();
    let mut rows: Vec<tiberius::Row> = Vec::new();
    let mut has_more = false;
    while let Some(item) = stream.try_next().await.map_err(map_mssql)? {
        match item {
            QueryItem::Metadata(meta) => {
                columns = meta.columns().to_vec();
            }
            QueryItem::Row(row) => {
                if rows.len() >= take {
                    has_more = true;
                    break;
                }
                rows.push(row);
            }
        }
    }
    Ok(materialize(columns, rows, has_more))
}

fn materialize(
    columns: Vec<Column>,
    rows: Vec<tiberius::Row>,
    has_more: bool,
) -> (Vec<ConnectorColumn>, Vec<TypedColumn>, bool) {
    let meta: Vec<ConnectorColumn> = columns
        .iter()
        .map(|col| {
            let (dadix_type, native) = map_column_type(col.column_type());
            ConnectorColumn {
                name: col.name().to_string(),
                dadix_type,
                native_type: native.into(),
                nullable: true,
            }
        })
        .collect();
    let typed = meta
        .iter()
        .enumerate()
        .map(|(i, col)| {
            let mut validity = Vec::with_capacity(rows.len());
            let mut builder = ValueBuild::new(col.dadix_type);
            for row in &rows {
                match extract_cell(row, i, col.dadix_type) {
                    Some(value) => {
                        validity.push(true);
                        builder.push(value);
                    }
                    None => {
                        validity.push(false);
                        builder.push_null();
                    }
                }
            }
            TypedColumn {
                name: col.name.clone(),
                data_type: col.dadix_type,
                native_type: Some(col.native_type.clone()),
                validity,
                data: builder.finish(),
            }
        })
        .collect();
    (meta, typed, has_more)
}

enum Cell {
    Bool(bool),
    Int(i64),
    #[allow(dead_code)]
    Uint(u64),
    Float(f64),
    Text(String),
    Bytes(Vec<u8>),
}

struct ValueBuild {
    ty: DadixType,
    bools: Vec<bool>,
    ints: Vec<i64>,
    uints: Vec<u64>,
    floats: Vec<f64>,
    texts: Vec<String>,
    bins: Vec<Vec<u8>>,
}

impl ValueBuild {
    fn new(ty: DadixType) -> Self {
        Self {
            ty,
            bools: Vec::new(),
            ints: Vec::new(),
            uints: Vec::new(),
            floats: Vec::new(),
            texts: Vec::new(),
            bins: Vec::new(),
        }
    }

    fn push(&mut self, cell: Cell) {
        match (&self.ty, cell) {
            (DadixType::Boolean, Cell::Bool(v)) => self.bools.push(v),
            (DadixType::Int64, Cell::Int(v)) => self.ints.push(v),
            (DadixType::UInt64, Cell::Uint(v)) => self.uints.push(v),
            (DadixType::Float64, Cell::Float(v)) => self.floats.push(v),
            (DadixType::Binary, Cell::Bytes(v)) => self.bins.push(v),
            (_, Cell::Text(v)) => self.texts.push(v),
            (_, Cell::Int(v)) => self.texts.push(v.to_string()),
            (_, Cell::Uint(v)) => self.texts.push(v.to_string()),
            (_, Cell::Float(v)) => self.texts.push(v.to_string()),
            (_, Cell::Bool(v)) => self.texts.push(v.to_string()),
            (_, Cell::Bytes(v)) => self.texts.push(String::from_utf8_lossy(&v).into_owned()),
        }
    }

    fn push_null(&mut self) {
        match self.ty {
            DadixType::Boolean => self.bools.push(false),
            DadixType::Int64 => self.ints.push(0),
            DadixType::UInt64 => self.uints.push(0),
            DadixType::Float64 => self.floats.push(0.0),
            DadixType::Binary => self.bins.push(Vec::new()),
            _ => self.texts.push(String::new()),
        }
    }

    fn finish(self) -> ColumnData {
        match self.ty {
            DadixType::Boolean => ColumnData::Bool { values: self.bools },
            DadixType::Int64 => ColumnData::Int64 { values: self.ints },
            DadixType::UInt64 => ColumnData::UInt64 { values: self.uints },
            DadixType::Float64 => ColumnData::Float64 {
                values: self.floats,
            },
            DadixType::Decimal => ColumnData::Decimal { values: self.texts },
            DadixType::Binary => ColumnData::Binary { values: self.bins },
            _ => ColumnData::Utf8 { values: self.texts },
        }
    }
}

fn extract_cell(row: &tiberius::Row, i: usize, ty: DadixType) -> Option<Cell> {
    if let Ok(v) = row.try_get::<bool, _>(i) {
        return v.map(Cell::Bool);
    }
    if let Ok(v) = row.try_get::<i64, _>(i) {
        return v.map(Cell::Int);
    }
    if let Ok(v) = row.try_get::<i32, _>(i) {
        return v.map(|n| Cell::Int(i64::from(n)));
    }
    if let Ok(v) = row.try_get::<i16, _>(i) {
        return v.map(|n| Cell::Int(i64::from(n)));
    }
    if let Ok(v) = row.try_get::<u8, _>(i) {
        return v.map(|n| Cell::Int(i64::from(n)));
    }
    if let Ok(v) = row.try_get::<f64, _>(i) {
        return v.map(Cell::Float);
    }
    if let Ok(v) = row.try_get::<f32, _>(i) {
        return v.map(|n| Cell::Float(f64::from(n)));
    }
    if let Ok(v) = row.try_get::<Decimal, _>(i) {
        return v.map(|n| Cell::Text(n.to_string()));
    }
    if let Ok(v) = row.try_get::<NaiveDateTime, _>(i) {
        return v.map(|n| Cell::Text(n.format("%Y-%m-%dT%H:%M:%S%.f").to_string()));
    }
    if let Ok(v) = row.try_get::<NaiveDate, _>(i) {
        return v.map(|n| Cell::Text(n.to_string()));
    }
    if let Ok(v) = row.try_get::<NaiveTime, _>(i) {
        return v.map(|n| Cell::Text(n.to_string()));
    }
    if let Ok(v) = row.try_get::<uuid::Uuid, _>(i) {
        return v.map(|n| Cell::Text(n.to_string()));
    }
    if let Ok(v) = row.try_get::<&str, _>(i) {
        return v.map(|s| Cell::Text(s.to_string()));
    }
    if let Ok(v) = row.try_get::<&[u8], _>(i) {
        return v.map(|b| {
            if ty == DadixType::Binary {
                Cell::Bytes(b.to_vec())
            } else {
                Cell::Text(String::from_utf8_lossy(b).into_owned())
            }
        });
    }
    None
}

fn map_column_type(ty: ColumnType) -> (DadixType, &'static str) {
    match ty {
        ColumnType::Bit | ColumnType::Bitn => (DadixType::Boolean, "bit"),
        ColumnType::Int1 => (DadixType::Int64, "tinyint"),
        ColumnType::Int2 => (DadixType::Int64, "smallint"),
        ColumnType::Int4 => (DadixType::Int64, "int"),
        ColumnType::Int8 => (DadixType::Int64, "bigint"),
        ColumnType::Intn => (DadixType::Int64, "int"),
        ColumnType::Float4 => (DadixType::Float64, "real"),
        ColumnType::Float8 => (DadixType::Float64, "float"),
        ColumnType::Floatn => (DadixType::Float64, "float"),
        ColumnType::Decimaln | ColumnType::Numericn => (DadixType::Decimal, "numeric"),
        ColumnType::Money | ColumnType::Money4 => (DadixType::Decimal, "money"),
        ColumnType::Daten => (DadixType::Date, "date"),
        ColumnType::Timen => (DadixType::Time, "time"),
        ColumnType::Datetime | ColumnType::Datetime2 | ColumnType::Datetime4 => {
            (DadixType::DateTime, "datetime2")
        }
        ColumnType::DatetimeOffsetn => (DadixType::DateTimeTz, "datetimeoffset"),
        ColumnType::Guid => (DadixType::Uuid, "uniqueidentifier"),
        ColumnType::BigVarBin | ColumnType::BigBinary | ColumnType::Image => {
            (DadixType::Binary, "varbinary")
        }
        ColumnType::Xml => (DadixType::String, "xml"),
        _ => (DadixType::String, "nvarchar"),
    }
}

fn dadix_from_native(native: &str) -> DadixType {
    match native.to_ascii_lowercase().as_str() {
        "bit" => DadixType::Boolean,
        "tinyint" | "smallint" | "int" | "bigint" => DadixType::Int64,
        "real" | "float" => DadixType::Float64,
        "decimal" | "numeric" | "money" | "smallmoney" => DadixType::Decimal,
        "date" => DadixType::Date,
        "time" => DadixType::Time,
        "datetime" | "datetime2" | "smalldatetime" => DadixType::DateTime,
        "datetimeoffset" => DadixType::DateTimeTz,
        "uniqueidentifier" => DadixType::Uuid,
        "varbinary" | "binary" | "image" => DadixType::Binary,
        _ => DadixType::String,
    }
}

fn bind_param<'a>(query: &mut Query<'a>, param: &'a QueryParam) {
    match param {
        QueryParam::Null => query.bind(None::<&str>),
        QueryParam::Bool(v) => query.bind(*v),
        QueryParam::Int(v) => query.bind(*v),
        QueryParam::Float(v) => query.bind(*v),
        QueryParam::Text(v) => query.bind(v.as_str()),
    }
}

fn format_native(
    base: &str,
    char_len: Option<i64>,
    precision: Option<i64>,
    scale: Option<i64>,
) -> String {
    let ty = base.to_ascii_lowercase();
    match ty.as_str() {
        "nvarchar" | "varchar" | "nchar" | "char" | "varbinary" | "binary" => match char_len {
            Some(-1) => format!("{ty}(max)"),
            Some(n) => format!("{ty}({n})"),
            None => ty,
        },
        "decimal" | "numeric" => match (precision, scale) {
            (Some(p), Some(s)) => format!("{ty}({p},{s})"),
            _ => ty,
        },
        "datetime2" | "time" | "datetimeoffset" => match scale {
            Some(s) => format!("{ty}({s})"),
            None => ty,
        },
        _ => ty,
    }
}

fn string_column(columns: &[TypedColumn], index: usize) -> Vec<String> {
    let Some(column) = columns.get(index) else {
        return Vec::new();
    };
    match &column.data {
        ColumnData::Utf8 { values } | ColumnData::Decimal { values } => values
            .iter()
            .enumerate()
            .map(|(i, value)| {
                if column.validity.get(i).copied().unwrap_or(false) {
                    value.clone()
                } else {
                    String::new()
                }
            })
            .collect(),
        ColumnData::Int64 { values } => values
            .iter()
            .enumerate()
            .map(|(i, value)| {
                if column.validity.get(i).copied().unwrap_or(false) {
                    value.to_string()
                } else {
                    String::new()
                }
            })
            .collect(),
        ColumnData::UInt64 { values } => values.iter().map(|v| v.to_string()).collect(),
        _ => Vec::new(),
    }
}

fn truncate_data(data: &mut ColumnData, limit: usize) {
    match data {
        ColumnData::Bool { values } => values.truncate(limit),
        ColumnData::Int64 { values } => values.truncate(limit),
        ColumnData::UInt64 { values } => values.truncate(limit),
        ColumnData::Float64 { values } => values.truncate(limit),
        ColumnData::Decimal { values } => values.truncate(limit),
        ColumnData::Utf8 { values } => values.truncate(limit),
        ColumnData::Binary { values } => values.truncate(limit),
    }
}

fn timed_out() -> DadixError {
    DadixError::new(ErrorCode::QueryTimeout, "SQL Server query timed out")
}

fn map_mssql<E: std::fmt::Display>(err: E) -> DadixError {
    let message = err.to_string();
    let lower = message.to_ascii_lowercase();
    if lower.contains("login") || lower.contains("password") || lower.contains("authentication") {
        DadixError::with_details(ErrorCode::CredentialStore, "SQL Server authentication failed", message)
    } else if lower.contains("timeout") {
        DadixError::with_details(ErrorCode::ConnectTimeout, "SQL Server timed out", message)
    } else {
        DadixError::with_details(ErrorCode::Connector, "SQL Server error", message)
    }
}
