//! Performance smoke bench for the in-memory DuckDB engine.
//!
//! Default: 1_000_000 rows. Set `DADIX_BENCH_LARGE=1` (or `DADIX_BENCH_ROWS`)
//! for 10_000_000. These are measurements, not CI pass/fail gates.

use dadix_core::{QueryRequest, QuerySession};
use std::env;
use std::time::Instant;

fn env_rows() -> u64 {
    if let Ok(raw) = env::var("DADIX_BENCH_ROWS") {
        if let Ok(n) = raw.parse() {
            return n;
        }
    }
    if env::var("DADIX_BENCH_LARGE").is_ok() {
        return 10_000_000;
    }
    1_000_000
}

fn time_ms(session: &QuerySession, sql: &str) -> u128 {
    let started = Instant::now();
    session
        .execute(QueryRequest::sql(sql))
        .unwrap_or_else(|e| panic!("{sql}: {e}"));
    started.elapsed().as_millis()
}

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
        println!("  {label:<17} {mb:>8.1} MB peak RSS");
    }
}

fn run_suite(rows: u64) {
    println!("=== DuckDB query bench ({rows} rows) ===");
    let session = QuerySession::in_memory().expect("in-memory DuckDB");
    let load = Instant::now();
    session
        .execute(QueryRequest::sql(format!(
            "CREATE TABLE bench AS
             SELECT i AS id, i % 100 AS g, i::DOUBLE AS v
             FROM range({rows}) t(i)"
        )))
        .expect("load bench table");
    println!("  load              {:>8} ms", load.elapsed().as_millis());
    print_rss("rss after load");
    println!("  COUNT             {:>8} ms", time_ms(&session, "SELECT count(*) FROM bench"));
    println!("  SUM               {:>8} ms", time_ms(&session, "SELECT sum(v) FROM bench"));
    println!(
        "  GROUP BY          {:>8} ms",
        time_ms(&session, "SELECT g, count(*) FROM bench GROUP BY g")
    );
    println!(
        "  FILTER            {:>8} ms",
        time_ms(&session, "SELECT count(*) FROM bench WHERE g = 1")
    );
    println!(
        "  JOIN              {:>8} ms",
        time_ms(
            &session,
            "SELECT count(*) FROM bench a INNER JOIN bench b ON a.id = b.id WHERE a.g = 1"
        )
    );
    print_rss("rss after JOIN");
}

fn main() {
    run_suite(env_rows());
    if env::var("DADIX_BENCH_LARGE").is_err() && env::var("DADIX_BENCH_ROWS").is_err() {
        println!("(set DADIX_BENCH_LARGE=1 to also run 10_000_000 rows)");
    }
}
