//! MySQL live test against a real database process (local Docker by default).

mod support;

use dadix_core::{
    close_project, create_project, DatabaseEngine, DatabaseSecret, ErrorCode, MemoryCredentialStore,
    QueryParam, QueryRequest,
};
use std::sync::Arc;
use std::thread;
use std::time::Duration;
use support::{env_or, host_source, required, start_mysql_container, DockerDb};

fn target() -> Result<(String, u16, String, String, String, Option<DockerDb>), String> {
    if let (Some(host), Some(database), Some(user), Some(password)) = (
        required("DADIX_MYSQL_HOST"),
        required("DADIX_MYSQL_DATABASE"),
        required("DADIX_MYSQL_USER"),
        required("DADIX_MYSQL_PASSWORD"),
    ) {
        let port = env_or("DADIX_MYSQL_PORT", "3306").parse().unwrap_or(3306);
        return Ok((host, port, database, user, password, None));
    }
    let container = start_mysql_container()?;
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
fn mysql_live_against_real_process() {
    let (host, port, database, user, password, _keep) = match target() {
        Ok(target) => target,
        Err(err) => {
            eprintln!("skip mysql live: {err}");
            return;
        }
    };

    let dir = tempfile::tempdir().unwrap();
    let mut handle = create_project(dir.path().join("my.dadix")).unwrap();
    handle.set_credential_store(Arc::new(MemoryCredentialStore::new()));
    let cred = handle
        .store_credential(&DatabaseSecret {
            username: None,
            password: Some(password.clone()),
        })
        .unwrap();
    let source = handle
        .add_database_source(host_source(
            "mysql",
            DatabaseEngine::Mysql,
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
        if started.elapsed() > Duration::from_secs(90) {
            panic!("mysql did not become ready");
        }
        thread::sleep(Duration::from_millis(500));
    }

    let caps = handle.source_capabilities(source.id).unwrap();
    assert_eq!(caps.pagination, dadix_core::PaginationStyle::LimitOffset);
    assert_eq!(caps.parameter_style, dadix_core::ParameterStyle::QuestionMark);

    seed_mysql(&host, port, &database, &user, &password);

    let tables = handle.list_remote_tables(source.id).unwrap();
    assert!(tables.iter().any(|t| t.name == "dadix_live"));

    let mut preview = QueryRequest::sql("SELECT * FROM dadix_live");
    preview.limit = Some(500);
    let preview = handle.execute_source_query(source.id, preview).unwrap();
    assert!(preview.returned_rows > 0);

    let types = handle
        .execute_source_query(
            source.id,
            QueryRequest::sql(
                "SELECT CAST(NULL AS SIGNED) AS n, CAST(1.25 AS DECIMAL(18,4)) AS dec, \
                 CONVERT('äöü' USING utf8mb4) AS u, NOW() AS ts",
            ),
        )
        .unwrap();
    assert_eq!(types.returned_rows, 1);

    let mut counted = QueryRequest::sql("SELECT COUNT(*) AS n FROM dadix_live WHERE id <= ?");
    counted.parameters = vec![QueryParam::Int(10)];
    let counted = handle.execute_source_query(source.id, counted).unwrap();
    assert_eq!(counted.returned_rows, 1, "filter must run on MySQL");

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

    close_project(handle).unwrap();
}

fn seed_mysql(host: &str, port: u16, database: &str, user: &str, password: &str) {
    let opts = mysql::OptsBuilder::new()
        .ip_or_hostname(Some(host.to_string()))
        .tcp_port(port)
        .db_name(Some(database.to_string()))
        .user(Some(user.to_string()))
        .pass(Some(password.to_string()));
    let mut conn = mysql::Conn::new(opts).expect("seed connect");
    mysql::prelude::Queryable::query_drop(
        &mut conn,
        "CREATE TABLE IF NOT EXISTS dadix_live (
            id INT PRIMARY KEY,
            grp INT NOT NULL,
            label VARCHAR(64) NOT NULL,
            amount DECIMAL(18,4) NULL,
            created_at DATETIME NULL
        )",
    )
    .unwrap();
    mysql::prelude::Queryable::query_drop(&mut conn, "DELETE FROM dadix_live").unwrap();
    mysql::prelude::Queryable::query_drop(
        &mut conn,
        "INSERT INTO dadix_live (id, grp, label, amount, created_at)
         SELECT seq, seq % 7, CONCAT('row-', seq, '-äöü'), seq * 0.25, NOW()
         FROM (
           SELECT @row := @row + 1 AS seq
           FROM information_schema.columns a, information_schema.columns b, (SELECT @row := 0) r
           LIMIT 8000
         ) t",
    )
    .unwrap();
}
