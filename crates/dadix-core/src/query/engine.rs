//! Query engine abstraction. DuckDB is the first implementation.

use crate::error::DadixResult;
use crate::query::result::{QueryId, QueryRequest, QueryResult};
use crate::query::session::QuerySession;

pub trait QueryEngine: Send {
    fn execute(&self, query: QueryRequest) -> DadixResult<QueryResult>;
    fn cancel(&self, query_id: &QueryId) -> DadixResult<()>;
}

/// Factory for in-memory DuckDB sessions (no `*.duckdb` project file).
#[derive(Debug, Default, Clone)]
pub struct DuckDbQueryEngine;

impl DuckDbQueryEngine {
    pub fn open_memory_session(&self) -> DadixResult<QuerySession> {
        QuerySession::in_memory()
    }
}

impl QueryEngine for QuerySession {
    fn execute(&self, query: QueryRequest) -> DadixResult<QueryResult> {
        QuerySession::execute(self, query)
    }

    fn cancel(&self, query_id: &QueryId) -> DadixResult<()> {
        QuerySession::cancel(self, query_id)
    }
}
