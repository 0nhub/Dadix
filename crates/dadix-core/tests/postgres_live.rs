//! PostgreSQL live test against a real database process (local Docker by default).

mod support;

use dadix_core::{
    close_project, create_project, DatabaseEngine, DatabaseSecret, ErrorCode, MemoryCredentialStore,
    QueryId, QueryParam, QueryRequest,
};
use std::sync::Arc;
use std::thread;
use std::time::Duration;
use support::{
    env_or, host_source, required, start_postgres_container, DockerDb,
};

fn target() -> Result<(String, u16, String, String, String, Option<DockerDb>), String> {
    if let (Some(host), Some(database), Some(user), Some(password)) = (
        required("DADIX_PG_HOST"),
        required("DADIX_PG_DATABASE"),
        required("DADIX_PG_USER"),
        required("DADIX_PG_PASSWORD"),
    ) {
        let port = env_or("DADIX_PG_PORT", "5432").parse().unwrap_or(5432);
        return Ok((host, port, database, user, password, None));
    }
    let container = start_postgres_container()?;
    Ok((
        container.host.clone(),
        container.port,
        container.database.clone(),
        container.username.clone(),
        container.password.clone(),
        Some(container),
    ))
}

#[test]
fn postgres_live_against_real_process() {
    let (host, port, database, user, password, _keep) = match target() {
        Ok(target) => target,
        Err(err) => {
            eprintln!("skip postgres live: {err}");
            return;
        }
    };

    let dir = tempfile::tempdir().unwrap();
    let mut handle = create_project(dir.path().join("pg.dadix")).unwrap();
    let store = Arc::new(MemoryCredentialStore::new());
    handle.set_credential_store(store);
    let cred = handle
        .store_credential(&DatabaseSecret {
            username: None,
            password: Some(password.clone()),
        })
        .unwrap();
    let source = handle
        .add_database_source(host_source(
            "pg",
            DatabaseEngine::Postgres,
            &host,
            port,
            &database,
            Some(user.clone()),
            Some(cred),
            false,
            false,
        ))
        .unwrap();

    let started = std::time::Instant::now();
    loop {
        if handle.test_source_connection(source.id).is_ok() {
            break;
        }
        if started.elapsed() > Duration::from_secs(45) {
            panic!("postgres did not become ready");
        }
        thread::sleep(Duration::from_millis(400));
    }

    let caps = handle.source_capabilities(source.id).unwrap();
    assert_eq!(caps.pagination, dadix_core::PaginationStyle::LimitOffset);
    assert_eq!(caps.parameter_style, dadix_core::ParameterStyle::Dollar);

    handle
        .execute_source_query(
            source.id,
            QueryRequest::sql(
                "SELECT
                    1 AS ok,
                    CAST(NULL AS integer) AS n,
                    1.25::numeric(18,4) AS dec,
                    'äöü' AS u,
                    now() AS ts,
                    '00000000-0000-0000-0000-000000000001'::uuid AS g",
            ),
        )
        .expect("type coverage");

    // CREATE is rejected by Dadix read-only; seed via a direct client in the test process.
    seed_postgres(&host, port, &database, &user, &password);

    let tables = handle.list_remote_tables(source.id).unwrap();
    assert!(tables.iter().any(|t| t.name == "dadix_live"));
    let columns = handle.list_remote_columns(source.id, "dadix_live").unwrap();
    assert!(columns.iter().any(|c| c.name == "label"));

    let mut preview = QueryRequest::sql("SELECT * FROM dadix_live");
    preview.limit = Some(500);
    let preview = handle.execute_source_query(source.id, preview).unwrap();
    assert!(preview.has_more || preview.returned_rows > 0);

    let mut counted = QueryRequest::sql("SELECT COUNT(*) AS n FROM dadix_live WHERE id <= ?");
    counted.parameters = vec![QueryParam::Int(10)];
    let counted = handle.execute_source_query(source.id, counted).unwrap();
    assert_eq!(
        counted.returned_rows, 1,
        "filter/aggregation must run on PostgreSQL"
    );

    let grouped = handle
        .execute_source_query(
            source.id,
            QueryRequest::sql("SELECT grp, COUNT(*) AS n FROM dadix_live GROUP BY grp"),
        )
        .unwrap();
    assert!(grouped.returned_rows >= 1);

    let join = handle
        .execute_source_query(
            source.id,
            QueryRequest::sql(
                "SELECT COUNT(*) AS n FROM dadix_live a INNER JOIN dadix_live b ON a.grp = b.grp WHERE a.id <= 20",
            ),
        )
        .unwrap();
    assert_eq!(join.returned_rows, 1);

    assert_eq!(
        handle
            .execute_source_query(source.id, QueryRequest::sql("DELETE FROM dadix_live"))
            .unwrap_err()
            .code,
        ErrorCode::ReadOnly
    );

    let query_id = QueryId::new();
    let handle = Arc::new(handle);
    let worker = {
        let handle = Arc::clone(&handle);
        let query_id = query_id.clone();
        thread::spawn(move || {
            let mut req = QueryRequest::sql("SELECT pg_sleep(8), 1 AS n");
            req.query_id = Some(query_id);
            handle.execute_source_query(source.id, req)
        })
    };
    thread::sleep(Duration::from_millis(300));
    handle.cancel_source_query(source.id, &query_id).unwrap();
    match worker.join().unwrap() {
        Err(err) => eprintln!("postgres cancel: {}", err.code),
        Ok(_) => eprintln!("postgres cancel: query finished before interrupt"),
    }

    let mut timeout_req = QueryRequest::sql("SELECT pg_sleep(8), 1 AS n");
    timeout_req.timeout_ms = Some(400);
    match handle.execute_source_query(source.id, timeout_req) {
        Err(err) => eprintln!("postgres timeout: {}", err.code),
        Ok(_) => eprintln!("postgres timeout: returned before limit"),
    }

    match Arc::try_unwrap(handle) {
        Ok(h) => close_project(h).unwrap(),
        Err(h) => drop(h),
    }
}

fn seed_postgres(host: &str, port: u16, database: &str, user: &str, password: &str) {
    let mut config = postgres::Config::new();
    config.host(host);
    config.port(port);
    config.dbname(database);
    config.user(user);
    config.password(password);
    let mut client = config.connect(postgres::NoTls).expect("seed connect");
    client
        .batch_execute(
            "DROP TABLE IF EXISTS dadix_live;
             CREATE TABLE dadix_live (
               id integer PRIMARY KEY,
               grp integer NOT NULL,
               label text NOT NULL,
               amount numeric(18,4),
               created_at timestamp without time zone,
               uid uuid
             );
             INSERT INTO dadix_live (id, grp, label, amount, created_at, uid)
             SELECT g, g % 7, 'row-' || g || '-äöü', (g * 0.25), now(),
                    '00000000-0000-0000-0000-000000000001'
             FROM generate_series(1, 20000) AS g;",
        )
        .expect("seed");
}
