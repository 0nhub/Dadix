//! Embedded query engine. DuckDB is the data plane; SQLite stays the control plane.

mod engine;
mod error;
mod result;
mod session;

pub use engine::{DuckDbQueryEngine, QueryEngine};
pub use result::{
    classify_sql, ColumnBatch, ColumnData, DadixType, LogicalType, QueryId, QueryParam,
    QueryPayload, QueryRequest, QueryResult, QueryStatus, StatementKind, TypedColumn,
    DEFAULT_QUERY_LIMIT, MAX_QUERY_LIMIT,
};
pub(crate) use result::page_select;
pub(crate) use session::validate_ident;
pub use session::QuerySession;

#[cfg(test)]
mod tests;
