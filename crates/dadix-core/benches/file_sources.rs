//! File-source bench: scan CSV/Parquet in place (no import).

use dadix_core::{scan_sql, FileFormat, FileScanOptions, QueryRequest, QuerySession};
use std::env;
use std::fs;
use std::io::Write;
use std::time::Instant;

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

fn time_ms(session: &QuerySession, sql: &str) -> u128 {
    let started = Instant::now();
    session
        .execute(QueryRequest::sql(sql))
        .unwrap_or_else(|e| panic!("{sql}: {e}"));
    started.elapsed().as_millis()
}

fn write_csv(path: &std::path::Path, rows: u64) {
    let mut file = fs::File::create(path).unwrap();
    writeln!(file, "id,g,v").unwrap();
    for i in 0..rows {
        writeln!(file, "{i},{},{}", i % 100, i).unwrap();
    }
}

fn main() {
    let rows: u64 = env::var("DADIX_BENCH_ROWS")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(1_000_000);
    let dir = tempfile::tempdir().unwrap();
    let csv = dir.path().join("bench.csv");
    let parquet = dir.path().join("bench.parquet");

    println!("=== File source bench ({rows} rows) ===");
    let write = Instant::now();
    write_csv(&csv, rows);
    println!(
        "  write CSV         {:>8} ms  ({:.1} MB)",
        write.elapsed().as_millis(),
        fs::metadata(&csv).unwrap().len() as f64 / 1_048_576.0
    );

    let session = QuerySession::in_memory().unwrap();
    let scan = scan_sql(&csv, FileFormat::Csv, &FileScanOptions::default());
    session.register_temp_view("bench", &scan).unwrap();

    println!("  COUNT CSV         {:>8} ms", time_ms(&session, "SELECT count(*) FROM bench"));
    println!(
        "  FILTER CSV        {:>8} ms",
        time_ms(&session, "SELECT count(*) FROM bench WHERE g = 1")
    );
    println!(
        "  GROUP BY CSV      {:>8} ms",
        time_ms(&session, "SELECT g, count(*) FROM bench GROUP BY g")
    );
    println!(
        "  JOIN CSV          {:>8} ms",
        time_ms(
            &session,
            "SELECT count(*) FROM bench a INNER JOIN bench b ON a.id = b.id WHERE a.g = 1"
        )
    );

    let copy = Instant::now();
    session
        .execute(QueryRequest::sql(format!(
            "COPY bench TO '{}' (FORMAT PARQUET)",
            parquet.to_string_lossy().replace('\\', "/")
        )))
        .unwrap();
    println!("  write Parquet     {:>8} ms", copy.elapsed().as_millis());
    let pq = scan_sql(&parquet, FileFormat::Parquet, &FileScanOptions::default());
    session.register_temp_view("pq", &pq).unwrap();
    println!("  COUNT Parquet     {:>8} ms", time_ms(&session, "SELECT count(*) FROM pq"));
    println!(
        "  FILTER Parquet    {:>8} ms",
        time_ms(&session, "SELECT count(*) FROM pq WHERE g = 1")
    );
    if let Some(mb) = peak_rss_mb() {
        println!("  peak RSS          {mb:>8.1} MB");
    }
}