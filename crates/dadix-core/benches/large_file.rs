//! Real-world ~20 GB file stress test. Not a CI gate.
//!
//! ```bash
//! cargo bench -p dadix-core --bench large_file
//! ```
//!
//! Generates `.large-fixtures/stress_20gb.csv` on demand; the fixture is not
//! kept in the tree. Override with `DADIX_STRESS_FILE` or `DADIX_STRESS_GB`
//! (default 20).

use dadix_core::{
    close_project, create_project, open_project, QueryId, QueryRequest, QuerySession,
};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};

fn peak_rss_mb() -> Option<f64> {
    #[cfg(unix)]
    {
        let mut usage = unsafe { std::mem::zeroed::<libc::rusage>() };
        if unsafe { libc::getrusage(libc::RUSAGE_SELF, &mut usage) } != 0 {
            return None;
        }
        let raw = usage.ru_maxrss as f64;
        #[cfg(target_os = "macos")]
        {
            Some(raw / 1_048_576.0)
        }
        #[cfg(all(unix, not(target_os = "macos")))]
        {
            Some(raw / 1024.0)
        }
    }
    #[cfg(not(unix))]
    {
        None
    }
}

fn print_rss(label: &str) {
    if let Some(mb) = peak_rss_mb() {
        eprintln!("  {label:<28} {mb:>8.1} MB peak RSS");
    }
}

fn target_bytes() -> u64 {
    let gb: u64 = env::var("DADIX_STRESS_GB")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(20);
    gb.saturating_mul(1024 * 1024 * 1024)
}

fn fixture_csv() -> PathBuf {
    if let Ok(path) = env::var("DADIX_STRESS_FILE") {
        return PathBuf::from(path);
    }
    PathBuf::from("/Users/gabriel/Dadix/.large-fixtures/stress_20gb.csv")
}

fn generate_large_csv(path: &Path, min_bytes: u64) {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).unwrap();
    }
    let rows: u64 = env::var("DADIX_STRESS_ROWS")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(320_000_000);
    eprintln!(
        "  generating ~{:.0} GB CSV ({rows} rows) via DuckDB COPY…",
        min_bytes as f64 / 1_073_741_824.0
    );
    let started = Instant::now();
    let session = QuerySession::in_memory().expect("duckdb");
    let out = path.to_string_lossy().replace('\\', "/");
    session
        .execute(QueryRequest::sql(format!(
            "COPY (
                SELECT
                    i AS id,
                    i % 1000 AS g,
                    i % 10000 AS bucket,
                    i::DOUBLE AS v,
                    'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' AS pad
                FROM range({rows}) t(i)
            ) TO '{out}' (HEADER, DELIMITER ',')"
        )))
        .unwrap_or_else(|e| panic!("COPY large CSV failed: {e}"));
    let len = fs::metadata(path).unwrap().len();
    eprintln!(
        "  generate CSV              {:>8} ms  ({:.2} GB)",
        started.elapsed().as_millis(),
        len as f64 / 1_073_741_824.0
    );
    if len < min_bytes {
        eprintln!(
            "warning: fixture is {:.2} GB, target was {:.2} GB (set DADIX_STRESS_ROWS higher)",
            len as f64 / 1_073_741_824.0,
            min_bytes as f64 / 1_073_741_824.0
        );
    }
}

fn ensure_large_csv(path: &Path, min_bytes: u64) {
    if path.exists() {
        let len = fs::metadata(path).map(|m| m.len()).unwrap_or(0);
        if len >= min_bytes {
            eprintln!(
                "  reuse fixture           {:>8.2} GB  {}",
                len as f64 / 1_073_741_824.0,
                path.display()
            );
            return;
        }
    }
    if env::var("DADIX_STRESS_CHILD_GENERATE").ok().as_deref() == Some("1") {
        generate_large_csv(path, min_bytes);
        return;
    }
    eprintln!("  spawn generator child (keeps parent RSS clean)");
    let exe = env::current_exe().expect("current exe");
    let status = Command::new(exe)
        .env("DADIX_STRESS_CHILD_GENERATE", "1")
        .env("DADIX_STRESS_FILE", path)
        .env(
            "DADIX_STRESS_GB",
            env::var("DADIX_STRESS_GB").unwrap_or_else(|_| "20".into()),
        )
        .env(
            "DADIX_STRESS_ROWS",
            env::var("DADIX_STRESS_ROWS").unwrap_or_else(|_| "320000000".into()),
        )
        .status()
        .expect("spawn generator");
    assert!(status.success(), "generator child failed: {status}");
    let len = fs::metadata(path).map(|m| m.len()).unwrap_or(0);
    eprintln!(
        "  fixture ready             {:>8.2} GB",
        len as f64 / 1_073_741_824.0
    );
}

fn write_keys(path: &Path) {
    let mut csv = String::from("g,name\n");
    for g in 0..1000 {
        csv.push_str(&format!("{g},group-{g}\n"));
    }
    fs::write(path, csv).unwrap();
}

fn main() {
    let min_bytes = target_bytes();
    let csv = fixture_csv();
    if env::var("DADIX_STRESS_CHILD_GENERATE").ok().as_deref() == Some("1") {
        generate_large_csv(&csv, min_bytes);
        return;
    }
    let keys = csv.with_file_name("stress_keys.csv");
    let project = csv.with_file_name("stress_20gb.dadix");
    eprintln!("=== Dadix 20 GB file stress ===");
    eprintln!("  file {}", csv.display());
    ensure_large_csv(&csv, min_bytes);
    write_keys(&keys);
    let file_gb = fs::metadata(&csv).unwrap().len() as f64 / 1_073_741_824.0;
    print_rss("rss after generate");

    if project.exists() {
        let _ = fs::remove_file(&project);
        let _ = fs::remove_file(format!("{}.lock", project.display()));
    }

    let handle = create_project(&project).expect("create project");
    let register = Instant::now();
    let source = handle.link_file(&csv, true).expect("link 20GB csv");
    let register_ms = register.elapsed().as_millis();
    eprintln!("  register source           {register_ms:>8} ms");

    let keys_source = handle.link_file(&keys, true).expect("link keys");
    eprintln!("  keys view                 {:>8}", keys_source.name);

    let preview1 = Instant::now();
    let first = handle
        .preview_source(source.id, 0, Some(500))
        .expect("first preview");
    let preview_ms = preview1.elapsed().as_millis();
    eprintln!(
        "  time to first preview     {preview_ms:>8} ms  ({} rows, has_more={})",
        first.returned_rows, first.has_more
    );
    assert!(first.returned_rows > 0, "preview must return rows");
    assert!(first.has_more, "20GB preview must be chunked");
    print_rss("rss after first preview");

    let more = Instant::now();
    let second = handle
        .preview_source(source.id, 500, Some(500))
        .expect("load more");
    eprintln!(
        "  load more                 {:>8} ms  (offset {}, {} rows)",
        more.elapsed().as_millis(),
        second.offset,
        second.returned_rows
    );

    let count = Instant::now();
    let counted = handle
        .execute_query(QueryRequest::sql(format!(
            "SELECT count(*) AS n FROM {}",
            first_view(&handle, source.id)
        )))
        .expect("count");
    eprintln!(
        "  COUNT                     {:>8} ms  (n={})",
        count.elapsed().as_millis(),
        scalar_i64(&counted)
    );
    print_rss("rss after COUNT");

    let filter = Instant::now();
    let filtered = handle
        .execute_query(QueryRequest::sql(format!(
            "SELECT count(*) AS n FROM {} WHERE g = 1",
            first_view(&handle, source.id)
        )))
        .expect("filter");
    eprintln!(
        "  FILTER                    {:>8} ms  (n={})",
        filter.elapsed().as_millis(),
        scalar_i64(&filtered)
    );

    let group = Instant::now();
    let grouped = handle
        .execute_query(QueryRequest::sql(format!(
            "SELECT g, count(*) AS n FROM {} GROUP BY g ORDER BY g LIMIT 20",
            first_view(&handle, source.id)
        )))
        .expect("group by");
    eprintln!(
        "  GROUP BY                  {:>8} ms  ({} groups shown)",
        group.elapsed().as_millis(),
        grouped.returned_rows
    );

    let join = Instant::now();
    let joined = handle
        .execute_query(QueryRequest::sql(format!(
            "SELECT count(*) AS n FROM {} b INNER JOIN stress_keys k ON b.g = k.g WHERE b.g = 1",
            first_view(&handle, source.id)
        )))
        .expect("join");
    eprintln!(
        "  JOIN                      {:>8} ms  (n={})",
        join.elapsed().as_millis(),
        scalar_i64(&joined)
    );
    print_rss("rss after JOIN");

    let cancel_id = QueryId::new();
    let view = first_view(&handle, source.id);
    let handle = Arc::new(handle);
    let started_cancel = Instant::now();
    let exec = {
        let handle = Arc::clone(&handle);
        let query_id = cancel_id.clone();
        thread::spawn(move || {
            let mut req = QueryRequest::sql(format!(
                "SELECT count(*) AS n FROM {view} WHERE g >= 0"
            ));
            req.query_id = Some(query_id);
            handle.execute_query(req)
        })
    };
    thread::sleep(Duration::from_millis(250));
    handle.cancel_query(&cancel_id).expect("cancel");
    let cancel_result = exec.join().unwrap();
    eprintln!(
        "  cancel                    {:>8} ms  ({})",
        started_cancel.elapsed().as_millis(),
        match &cancel_result {
            Err(e) => format!("{}", e.code),
            Ok(_) => "completed-before-cancel".into(),
        }
    );

    let dadix_len = fs::metadata(&project).unwrap().len();
    let csv_len = fs::metadata(&csv).unwrap().len();
    eprintln!(
        "  .dadix size               {:>8.2} MB   (csv {:.2} GB)",
        dadix_len as f64 / 1_048_576.0,
        csv_len as f64 / 1_073_741_824.0
    );
    assert!(
        dadix_len < csv_len / 100,
        ".dadix must not contain the 20GB payload"
    );
    if let Some(mb) = peak_rss_mb() {
        assert!(
            mb < (file_gb * 1024.0 * 0.5),
            "peak RSS {mb:.1} MB looks like a full import of {file_gb:.1} GB"
        );
        eprintln!("  peak RSS                  {mb:>8.1} MB   (file {file_gb:.2} GB)");
    }

    let path = handle.path().to_path_buf();
    match Arc::try_unwrap(handle) {
        Ok(h) => close_project(h).unwrap(),
        Err(h) => {
            h.shutdown_query();
            drop(h);
        }
    }

    let reopen = Instant::now();
    let handle = open_project(&path).expect("reopen");
    let again = handle
        .preview_source(source.id, 0, Some(50))
        .expect("preview after reopen");
    eprintln!(
        "  reopen + preview          {:>8} ms  ({} rows, no import)",
        reopen.elapsed().as_millis(),
        again.returned_rows
    );
    close_project(handle).unwrap();

    eprintln!("=== stress complete ===");
}

fn first_view(
    handle: &dadix_core::ProjectHandle,
    source_id: i64,
) -> String {
    handle
        .list_bound_sources()
        .unwrap()
        .into_iter()
        .find(|s| s.source_id == source_id)
        .map(|s| s.logical_name)
        .unwrap_or_else(|| "stress_20gb".into())
}

fn scalar_i64(result: &dadix_core::QueryResult) -> i64 {
    match &result.columns()[0].data {
        dadix_core::ColumnData::Int64 { values } => values.first().copied().unwrap_or(0),
        _ => 0,
    }
}
