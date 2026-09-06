//! Shared helpers for engine live tests. Never print secrets.
#![allow(dead_code)]

use dadix_core::{
    get_os_credential, put_os_credential, DatabaseEngine, DatabaseSecret, NewDatabaseSource,
};
use std::env;
use std::net::TcpStream;
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

pub fn env_or(key: &str, default: &str) -> String {
    env::var(key).unwrap_or_else(|_| default.into())
}

pub fn env_flag(key: &str) -> bool {
    matches!(
        env::var(key).ok().as_deref(),
        Some("1") | Some("true") | Some("TRUE") | Some("yes")
    )
}

pub fn required(key: &str) -> Option<String> {
    env::var(key).ok().filter(|s| !s.is_empty())
}

/// Resolve a password from the OS store first, then from a already-exported env var.
/// Do not pass the password on the cargo command line.
pub fn load_secret(credential_id: &str, password_env: &str) -> Result<String, String> {
    if let Ok(Some(secret)) = get_os_credential(credential_id) {
        if let Some(password) = secret.password.filter(|s| !s.is_empty()) {
            eprintln!("using OS credential_id={credential_id}");
            return Ok(password);
        }
    }
    if let Some(password) = required(password_env) {
        put_os_credential(
            credential_id,
            &DatabaseSecret {
                username: None,
                password: Some(password.clone()),
            },
        )
        .map_err(|err| err.to_string())?;
        eprintln!("stored {password_env} into OS credential_id={credential_id}");
        return Ok(password);
    }
    Err(format!(
        "missing secret. Run `cargo run -p dadix-core --bin dadix-credential -- set {credential_id}` \
or `read -s {password_env}; export {password_env}` (do not put the password on the cargo command line)"
    ))
}

pub fn host_source(
    name: &str,
    engine: DatabaseEngine,
    host: &str,
    port: u16,
    database: &str,
    username: Option<String>,
    credential_id: Option<String>,
    encrypt: bool,
    trust_server_certificate: bool,
) -> NewDatabaseSource {
    NewDatabaseSource {
        name: name.into(),
        engine,
        host: Some(host.into()),
        port: Some(port),
        database: Some(database.into()),
        username,
        credential_id,
        encrypt: Some(encrypt),
        trust_server_certificate: Some(trust_server_certificate),
        ..NewDatabaseSource::default()
    }
}

pub fn host_reaches(host: &str, port: u16, timeout: Duration) -> Result<(), String> {
    match std::net::ToSocketAddrs::to_socket_addrs(&(host, port)) {
        Ok(mut addrs) => {
            let addr = addrs
                .next()
                .ok_or_else(|| format!("DNS resolved {host} but returned no addresses"))?;
            TcpStream::connect_timeout(&addr, timeout)
                .map(|_| ())
                .map_err(|err| format!("TCP {host}:{port} failed: {err}"))
        }
        Err(err) => Err(format!(
            "DNS failed for {host}: {err}. This is not a Dadix error. \
Try `nslookup {host}`, then `nc -vz {host} {port}`, or use the FQDN."
        )),
    }
}

pub struct DockerDb {
    pub id: String,
    pub host: String,
    pub port: u16,
    pub database: String,
    pub username: String,
    pub password: String,
}

impl Drop for DockerDb {
    fn drop(&mut self) {
        if self.id.starts_with("embedded-") {
            return;
        }
        let _ = Command::new("docker")
            .args(["rm", "-f", &self.id])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
}

pub fn docker_available() -> bool {
    Command::new("docker")
        .args(["info"])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

pub fn start_postgres_container() -> Result<DockerDb, String> {
    if docker_available() {
        return start_container(
            &[
                "-e",
                "POSTGRES_USER=dadix",
                "-e",
                "POSTGRES_PASSWORD=dadix",
                "-e",
                "POSTGRES_DB=dadix",
                "postgres:16-alpine",
            ],
            5432,
            "dadix",
            "dadix",
            "dadix",
        );
    }
    start_embedded_postgres()
}

fn start_embedded_postgres() -> Result<DockerDb, String> {
    let mut postgresql = postgresql_embedded::blocking::PostgreSQL::default();
    postgresql
        .setup()
        .map_err(|err| format!("embedded postgres setup: {err}"))?;
    postgresql
        .start()
        .map_err(|err| format!("embedded postgres start: {err}"))?;
    postgresql
        .create_database("dadix")
        .map_err(|err| format!("embedded postgres create db: {err}"))?;
    let settings = postgresql.settings();
    let db = DockerDb {
        id: format!("embedded-postgres-{}", settings.port),
        host: settings.host.clone(),
        port: settings.port,
        database: "dadix".into(),
        username: settings.username.clone(),
        password: settings.password.clone(),
    };
    // Keep the process alive until DockerDb is dropped by leaking the handle
    // into a process-lifetime slot. stop() would kill the server too early.
    std::mem::forget(postgresql);
    Ok(db)
}

pub fn start_mysql_container() -> Result<DockerDb, String> {
    start_container(
        &[
            "-e",
            "MYSQL_ROOT_PASSWORD=dadix",
            "-e",
            "MYSQL_DATABASE=dadix",
            "-e",
            "MYSQL_USER=dadix",
            "-e",
            "MYSQL_PASSWORD=dadix",
            "mysql:8.0",
        ],
        3306,
        "dadix",
        "dadix",
        "dadix",
    )
}

fn start_container(
    extra: &[&str],
    container_port: u16,
    database: &str,
    username: &str,
    password: &str,
) -> Result<DockerDb, String> {
    if !docker_available() {
        return Err("docker is not available".into());
    }
    let mut args = vec![
        "run".into(),
        "-d".into(),
        "--rm".into(),
        "-P".into(),
    ];
    args.extend(extra.iter().map(|s| (*s).to_string()));
    let output = Command::new("docker")
        .args(&args)
        .output()
        .map_err(|err| err.to_string())?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).into_owned());
    }
    let id = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let port = published_port(&id, container_port)?;
    let db = DockerDb {
        id,
        host: "127.0.0.1".into(),
        port,
        database: database.into(),
        username: username.into(),
        password: password.into(),
    };
    wait_for_tcp(&db.host, db.port, Duration::from_secs(60))?;
    Ok(db)
}

fn published_port(id: &str, container_port: u16) -> Result<u16, String> {
    let output = Command::new("docker")
        .args(["port", id, &format!("{container_port}/tcp")])
        .output()
        .map_err(|err| err.to_string())?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).into_owned());
    }
    let text = String::from_utf8_lossy(&output.stdout);
    let line = text.lines().next().unwrap_or("").trim();
    let port = line
        .rsplit(':')
        .next()
        .unwrap_or("")
        .trim()
        .parse::<u16>()
        .map_err(|_| format!("could not parse published port from {line}"))?;
    Ok(port)
}

fn wait_for_tcp(host: &str, port: u16, limit: Duration) -> Result<(), String> {
    let started = Instant::now();
    loop {
        if TcpStream::connect((host, port)).is_ok() {
            thread::sleep(Duration::from_millis(400));
            return Ok(());
        }
        if started.elapsed() > limit {
            return Err(format!("timed out waiting for {host}:{port}"));
        }
        thread::sleep(Duration::from_millis(250));
    }
}
