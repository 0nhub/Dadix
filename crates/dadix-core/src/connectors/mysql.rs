use super::sql::{bind_placeholders, page_sql, require_read_only};
use super::types::{
    connector_result, text_columns, ConnectorCapabilities, ConnectorQueryResult, DatabaseEndpoint,
};
use super::{DatabaseConnector, RemoteColumn, RemoteTable};
use crate::credentials::DatabaseSecret;
use crate::error::{DadixError, DadixResult, ErrorCode};
use crate::query::{DadixType, QueryId, QueryParam, QueryRequest};
use mysql::prelude::*;
use mysql::{OptsBuilder, Pool, Row, Value};
use std::sync::Mutex;
use std::time::Instant;

pub struct MysqlSession {
    pool: Mutex<Pool>,
}

impl MysqlSession {
    pub fn connect(endpoint: &DatabaseEndpoint, secret: Option<&DatabaseSecret>) -> DadixResult<Self> {
        let mut opts = OptsBuilder::new()
            .ip_or_hostname(Some(endpoint.host.clone()))
            .tcp_port(endpoint.port)
            .db_name(Some(endpoint.database.clone()));
        let user = endpoint
            .username
            .clone()
            .or_else(|| secret.and_then(|s| s.username.clone()));
        if let Some(user) = user {
            opts = opts.user(Some(user));
        }
        if let Some(password) = secret.and_then(|s| s.password.clone()) {
            opts = opts.pass(Some(password));
        }
        let pool = Pool::new(opts).map_err(map_mysql)?;
        Ok(Self {
            pool: Mutex::new(pool),
        })
    }
}

impl DatabaseConnector for MysqlSession {
    fn capabilities(&self) -> ConnectorCapabilities {
        ConnectorCapabilities::mysql()
    }

    fn test_connection(&self) -> DadixResult<()> {
        let pool = self.pool.lock().map_err(|_| DadixError::lock())?;
        let mut conn = pool.get_conn().map_err(map_mysql)?;
        let _: Option<i64> = conn.query_first("SELECT 1").map_err(map_mysql)?;
        Ok(())
    }

    fn schemas(&self) -> DadixResult<Vec<String>> {
        let pool = self.pool.lock().map_err(|_| DadixError::lock())?;
        let mut conn = pool.get_conn().map_err(map_mysql)?;
        let rows: Vec<String> = conn
            .query("SELECT schema_name FROM information_schema.schemata ORDER BY schema_name")
            .map_err(map_mysql)?;
        Ok(rows)
    }

    fn tables(&self, _schema: Option<&str>) -> DadixResult<Vec<RemoteTable>> {
        let pool = self.pool.lock().map_err(|_| DadixError::lock())?;
        let mut conn = pool.get_conn().map_err(map_mysql)?;
        let rows: Vec<(String, String)> = conn
            .query(
                "SELECT table_schema, table_name
                 FROM information_schema.tables
                 WHERE table_schema = DATABASE()
                 ORDER BY table_name",
            )
            .map_err(map_mysql)?;
        Ok(rows
            .into_iter()
            .map(|(schema, name)| RemoteTable {
                schema: Some(schema),
                name,
            })
            .collect())
    }

    fn columns(&self, table: &str) -> DadixResult<Vec<RemoteColumn>> {
        crate::query::validate_ident(table)?;
        let pool = self.pool.lock().map_err(|_| DadixError::lock())?;
        let mut conn = pool.get_conn().map_err(map_mysql)?;
        let rows: Vec<(String, String, String)> = conn
            .exec(
                "SELECT column_name, data_type, is_nullable
                 FROM information_schema.columns
                 WHERE table_schema = DATABASE() AND table_name = ?
                 ORDER BY ordinal_position",
                (table,),
            )
            .map_err(map_mysql)?;
        Ok(rows
            .into_iter()
            .map(|(name, native, nullable)| RemoteColumn {
                name,
                dadix_type: mysql_type(&native),
                native_type: native,
                nullable: nullable.eq_ignore_ascii_case("YES"),
            })
            .collect())
    }

    fn execute_query(&self, request: QueryRequest) -> DadixResult<ConnectorQueryResult> {
        require_read_only(&request.sql)?;
        let started = Instant::now();
        let sql = bind_placeholders(
            self.capabilities(),
            &page_sql(self.capabilities(), &request.sql, &request),
        );
        let pool = self.pool.lock().map_err(|_| DadixError::lock())?;
        let mut conn = pool.get_conn().map_err(map_mysql)?;
        let result = conn
            .exec_iter(sql, mysql_params(&request.parameters))
            .map_err(map_mysql)?;
        let names = result
            .columns()
            .as_ref()
            .iter()
            .map(|c| c.name_str().into_owned())
            .collect::<Vec<_>>();
        let natives = vec!["text".into(); names.len()];
        let take = request.resolved_limit() as usize;
        let mut rows = Vec::new();
        let mut has_more = false;
        for item in result {
            let row: Row = item.map_err(map_mysql)?;
            if rows.len() >= take {
                has_more = true;
                break;
            }
            let width = row.len();
            let mut record = Vec::with_capacity(width);
            for i in 0..width {
                record.push(mysql_value(row.get(i)));
            }
            rows.push(record);
        }
        let (meta, typed) = text_columns(names, &natives, &rows);
        Ok(connector_result(&request, meta, typed, has_more, started))
    }

    fn cancel(&self, _query_id: &QueryId) -> DadixResult<()> {
        Ok(())
    }
}

fn mysql_params(params: &[QueryParam]) -> Vec<Value> {
    params
        .iter()
        .map(|param| match param {
            QueryParam::Null => Value::NULL,
            QueryParam::Bool(v) => Value::Int(i64::from(*v)),
            QueryParam::Int(v) => Value::Int(*v),
            QueryParam::Float(v) => Value::Double(*v),
            QueryParam::Text(v) => Value::Bytes(v.as_bytes().to_vec()),
        })
        .collect()
}

fn mysql_type(native: &str) -> DadixType {
    match native.to_ascii_lowercase().as_str() {
        "tinyint" | "smallint" | "int" | "integer" | "bigint" => DadixType::Int64,
        "float" | "double" => DadixType::Float64,
        "decimal" | "numeric" => DadixType::Decimal,
        "date" => DadixType::Date,
        "time" => DadixType::Time,
        "datetime" | "timestamp" => DadixType::DateTime,
        "json" => DadixType::Json,
        "blob" | "binary" | "varbinary" => DadixType::Binary,
        _ => DadixType::String,
    }
}

fn mysql_value(value: Option<Value>) -> Option<String> {
    match value? {
        Value::NULL => None,
        Value::Bytes(bytes) => Some(String::from_utf8_lossy(&bytes).into_owned()),
        Value::Int(v) => Some(v.to_string()),
        Value::UInt(v) => Some(v.to_string()),
        Value::Float(v) => Some(v.to_string()),
        Value::Double(v) => Some(v.to_string()),
        other => Some(other.as_sql(true)),
    }
}

fn map_mysql(err: mysql::Error) -> DadixError {
    DadixError::with_details(ErrorCode::Connector, "mysql error", err.to_string())
}
