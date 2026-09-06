//! Live SQL Server test against the clinic host.
//!
//! Host resolution is separate from Dadix. First:
//! `nslookup mkn-mssql-exp` then `nc -vz mkn-mssql-exp 1433`.
//!
//! Secret handling — do not put the password on the cargo command line:
//!
//! ```bash
//! cargo run -p dadix-core --bin dadix-credential -- set test-mssql
//! # Password: ********
//!
//! export DADIX_MSSQL_HOST=mkn-mssql-exp
//! export DADIX_MSSQL_DATABASE=patm_berichte
//! export DADIX_MSSQL_USER=...
//! cargo test -p dadix-core --test mssql_live -- --nocapture --ignored
//! ```
//!
//! Or `read -s DADIX_MSSQL_PASSWORD; export DADIX_MSSQL_PASSWORD` then unset it after.
//! Internal clinic certificates: `export DADIX_MSSQL_TRUST_CERT=1` (never the default).

mod support;

use dadix_core::{
    close_project, create_project, new_credential_id, open_project, DatabaseEngine, DatabaseSecret,
    ErrorCode, OsCredentialStore, QueryId, QueryParam, QueryRequest,
};
use std::fs;
use std::sync::Arc;
use std::thread;
use std::time::Duration;
use support::{env_flag, env_or, host_reaches, host_source, load_secret, required};

const SLOW_READ: &str = "
WITH n AS (
    SELECT 0 AS i
    UNION ALL
    SELECT i + 1 FROM n WHERE i < 8000000
)
SELECT MAX(i) AS n FROM n
OPTION (MAXRECURSION 0)
";

#[test]
#[ignore]
fn sql_server_live_patm_berichte() {
    let host = env_or("DADIX_MSSQL_HOST", "mkn-mssql-exp");
    let port = env_or("DADIX_MSSQL_PORT", "1433")
        .parse::<u16>()
        .expect("DADIX_MSSQL_PORT");
    let database = env_or("DADIX_MSSQL_DATABASE", "patm_berichte");
    let user = required("DADIX_MSSQL_USER").expect("set DADIX_MSSQL_USER");
    let cred_id = env_or("DADIX_MSSQL_CREDENTIAL_ID", "test-mssql");
    let password = load_secret(&cred_id, "DADIX_MSSQL_PASSWORD").expect("SQL Server secret");
    let trust_cert = env_flag("DADIX_MSSQL_TRUST_CERT");

    if let Err(err) = host_reaches(&host, port, Duration::from_secs(4)) {
        panic!("{err}");
    }

    let dir = tempfile::tempdir().unwrap();
    let project = dir.path().join("klinik.dadix");
    let mut handle = create_project(&project).unwrap();
    handle.set_credential_store(Arc::new(OsCredentialStore::new()));

    let project_cred = new_credential_id();
    handle
        .store_named_credential(
            &project_cred,
            &DatabaseSecret {
                username: None,
                password: Some(password.clone()),
            },
        )
        .unwrap();

    let source = handle
        .add_database_source(host_source(
            "patm_berichte",
            DatabaseEngine::SqlServer,
            &host,
            port,
            &database,
            Some(user.clone()),
            Some(project_cred.clone()),
            true,
            trust_cert,
        ))
        .unwrap();

    let bytes = fs::read(&project).unwrap();
    assert!(
        !bytes
            .windows(password.as_bytes().len())
            .any(|w| w == password.as_bytes()),
        ".dadix must not contain the password"
    );
    assert!(bytes.windows(project_cred.len()).any(|w| w == project_cred.as_bytes()));
    let opts = source.options.clone().unwrap_or_default();
    assert!(opts.contains("\"trust_server_certificate\":false") || trust_cert);

    match handle.test_source_connection(source.id) {
        Ok(()) => {}
        Err(err) if !trust_cert && err.to_string().to_ascii_lowercase().contains("certificate") => {
            panic!(
                "TLS certificate validation failed. If this host uses an internal clinic CA, set \
DADIX_MSSQL_TRUST_CERT=1 explicitly for this source — it is never the default."
            );
        }
        Err(err) => panic!("connection test: {err}"),
    }

    let caps = handle.source_capabilities(source.id).unwrap();
    assert!(caps.supports_tls);
    assert!(caps.cancel_invalidates_connection);
    assert_eq!(caps.pagination, dadix_core::PaginationStyle::TopFetch);

    let databases = handle.list_remote_databases(source.id).expect("databases");
    assert!(databases
        .iter()
        .any(|name| name.eq_ignore_ascii_case(&database)));
    eprintln!("databases: {}", databases.len());

    let schemas = handle.list_remote_schemas(source.id).expect("schemas");
    assert!(!schemas.is_empty());
    let tables = handle.list_remote_tables(source.id).expect("tables");
    assert!(!tables.is_empty());
    let table = tables
        .iter()
        .find(|t| t.schema.as_deref() == Some("dbo"))
        .unwrap_or(&tables[0]);
    let schema = table.schema.as_deref().unwrap_or("dbo");
    let table_name = &table.name;
    let columns = handle
        .list_remote_columns(source.id, table_name)
        .expect("columns");
    assert!(!columns.is_empty());
    eprintln!("using {schema}.{table_name} ({} columns)", columns.len());

    let mut preview = QueryRequest::sql(format!("SELECT * FROM [{schema}].[{table_name}]"));
    preview.limit = Some(500);
    let preview = handle.execute_source_query(source.id, preview).unwrap();
    assert!(preview.returned_rows <= 500);
    eprintln!(
        "preview {} rows in {} ms has_more={}",
        preview.returned_rows, preview.execution_time_ms, preview.has_more
    );

    let filter_col = columns.iter().find(|c| {
        let native = c.native_type.to_ascii_lowercase();
        native == "int"
            || native == "bigint"
            || native.starts_with("date")
            || native.starts_with("datetime")
    });
    if let Some(col) = filter_col {
        let mut req = QueryRequest::sql(format!(
            "SELECT COUNT(*) AS n FROM [{schema}].[{table_name}] WHERE [{}] IS NOT NULL",
            col.name
        ));
        req.parameters = vec![];
        let counted = handle.execute_source_query(source.id, req).expect("pushdown count");
        assert_eq!(
            counted.returned_rows, 1,
            "COUNT must run on SQL Server and return one aggregate row, not the table"
        );
        eprintln!(
            "pushdown COUNT on {} in {} ms",
            col.name, counted.execution_time_ms
        );
    }

    if let Some(col) = columns.iter().find(|c| {
        matches!(
            c.native_type.to_ascii_lowercase().as_str(),
            "int" | "bigint" | "smallint" | "tinyint"
        )
    }) {
        let mut req = QueryRequest::sql(format!(
            "SELECT COUNT(*) AS n FROM [{schema}].[{table_name}] WHERE [{}] = ?",
            col.name
        ));
        req.parameters = vec![QueryParam::Int(1)];
        let counted = handle.execute_source_query(source.id, req).expect("param where");
        assert_eq!(counted.returned_rows, 1);
        eprintln!("parameterized WHERE in {} ms", counted.execution_time_ms);
    }

    let grouped = handle
        .execute_source_query(
            source.id,
            QueryRequest::sql(format!(
                "SELECT TOP (20) [{}] AS g, COUNT(*) AS n FROM [{schema}].[{table_name}] GROUP BY [{}]",
                columns[0].name, columns[0].name
            )),
        )
        .expect("group by");
    eprintln!("group by {} rows", grouped.returned_rows);

    if tables.len() >= 2 {
        let left_schema = tables[0].schema.as_deref().unwrap_or("dbo");
        let right_schema = tables[1].schema.as_deref().unwrap_or("dbo");
        let join = handle.execute_source_query(
            source.id,
            QueryRequest::sql(format!(
                "SELECT TOP (20) a.* FROM [{left_schema}].[{}] a INNER JOIN [{right_schema}].[{}] b ON 1 = 1",
                tables[0].name, tables[1].name
            )),
        );
        match join {
            Ok(result) => eprintln!("join {} rows in {} ms", result.returned_rows, result.execution_time_ms),
            Err(err) => eprintln!("join skipped: {}", err.message),
        }
    }

    let types = handle
        .execute_source_query(
            source.id,
            QueryRequest::sql(
                "SELECT CAST(NULL AS int) AS n, CAST(GETDATE() AS datetime2) AS d, \
                 CAST(1.25 AS decimal(18,4)) AS dec, N'äöü' AS u, NEWID() AS g",
            ),
        )
        .unwrap();
    assert_eq!(types.returned_rows, 1);

    assert_eq!(
        handle
            .execute_source_query(
                source.id,
                QueryRequest::sql(format!("INSERT INTO [{schema}].[{table_name}] DEFAULT VALUES")),
            )
            .unwrap_err()
            .code,
        ErrorCode::ReadOnly
    );

    let before = handle.source_connection_generation(source.id).unwrap();
    let query_id = QueryId::new();
    let handle = Arc::new(handle);
    let worker = {
        let handle = Arc::clone(&handle);
        let query_id = query_id.clone();
        thread::spawn(move || {
            let mut req = QueryRequest::sql(SLOW_READ);
            req.query_id = Some(query_id);
            handle.execute_source_query(source.id, req)
        })
    };
    thread::sleep(Duration::from_millis(250));
    handle.cancel_source_query(source.id, &query_id).unwrap();
    match worker.join().unwrap() {
        Err(err) => eprintln!("cancel: {}", err.code),
        Ok(_) => eprintln!("cancel: query finished before interrupt"),
    }
    let after_cancel = handle
        .execute_source_query(source.id, QueryRequest::sql("SELECT 1 AS n"))
        .expect("reconnect after cancel");
    assert_eq!(after_cancel.returned_rows, 1);
    let after = handle.source_connection_generation(source.id).unwrap();
    assert!(
        after > before,
        "socket cancel must discard the connection and reconnect (before={before} after={after})"
    );
    eprintln!("reconnect after cancel: generation {before} -> {after}");

    let mut timeout_req = QueryRequest::sql(SLOW_READ);
    timeout_req.timeout_ms = Some(400);
    match handle.execute_source_query(source.id, timeout_req) {
        Err(err) => eprintln!("timeout: {}", err.code),
        Ok(_) => eprintln!("timeout: server returned before limit"),
    }

    let path = handle.path().to_path_buf();
    let source_id = source.id;
    match Arc::try_unwrap(handle) {
        Ok(h) => close_project(h).unwrap(),
        Err(h) => drop(h),
    }

    let mut handle = open_project(&path).expect("reopen");
    handle.set_credential_store(Arc::new(OsCredentialStore::new()));
    handle
        .test_source_connection(source_id)
        .expect("reopen uses OS credential store");
    handle.delete_stored_credential(&project_cred).unwrap();
    handle.drop_database_session(source_id).unwrap();
    let missing = handle.test_source_connection(source_id).unwrap_err();
    assert_eq!(missing.code, ErrorCode::CredentialStore);
    close_project(handle).unwrap();
}
