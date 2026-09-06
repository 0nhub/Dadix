//! External file sources. DuckDB scans the original file; nothing is imported.

use crate::atomic::{atomic_replace, tmp_path};
use crate::credentials::reject_secret_uri;
use crate::file_id::{find_moved_file, FileIdentity};
use crate::domain::{AccessMode, NewSource, NewSourceTable, Source, SourceKind};
use crate::error::{DadixError, DadixResult, ErrorCode};
use crate::paths::{resolve_source_path, to_relative_uri, PathMode};
use crate::project::ProjectHandle;
use crate::query::validate_ident;
use crate::query::{QueryRequest, QueryResult};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::io::Write;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FileFormat {
    Csv,
    Tsv,
    Parquet,
    Json,
    Ndjson,
}

impl FileFormat {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Csv => "csv",
            Self::Tsv => "tsv",
            Self::Parquet => "parquet",
            Self::Json => "json",
            Self::Ndjson => "ndjson",
        }
    }

    pub fn from_type_name(value: &str) -> Option<Self> {
        match value.trim().to_ascii_lowercase().as_str() {
            "csv" | "text/csv" => Some(Self::Csv),
            "tsv" | "tab" | "text/tab-separated-values" => Some(Self::Tsv),
            "parquet" | "pq" => Some(Self::Parquet),
            "json" => Some(Self::Json),
            "ndjson" | "jsonl" => Some(Self::Ndjson),
            _ => None,
        }
    }

    pub fn from_path(path: &Path) -> Option<Self> {
        let ext = path
            .extension()
            .and_then(|s| s.to_str())?
            .to_ascii_lowercase();
        match ext.as_str() {
            "csv" => Some(Self::Csv),
            "tsv" | "tab" => Some(Self::Tsv),
            "parquet" | "pq" => Some(Self::Parquet),
            "json" => Some(Self::Json),
            "ndjson" | "jsonl" => Some(Self::Ndjson),
            _ => None,
        }
    }

    pub fn detect(type_name: &str, path: Option<&Path>) -> Option<Self> {
        Self::from_type_name(type_name).or_else(|| path.and_then(Self::from_path))
    }

    pub fn from_uri(uri: &str) -> Option<Self> {
        let path_part = uri.split(['?', '#']).next().unwrap_or(uri);
        let name = path_part.rsplit('/').next().unwrap_or(path_part);
        Self::from_path(Path::new(name))
    }
}

pub fn is_http_uri(value: &str) -> bool {
    let trimmed = value.trim();
    let lower = trimmed.to_ascii_lowercase();
    lower.starts_with("https://") || lower.starts_with("http://")
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct FileScanOptions {
    pub header: Option<bool>,
    pub delim: Option<String>,
    pub quote: Option<String>,
}

impl FileScanOptions {
    pub fn from_json(raw: Option<&str>) -> Self {
        raw.and_then(|s| serde_json::from_str(s).ok())
            .unwrap_or_default()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BoundFileSource {
    pub source_id: i64,
    pub name: String,
    pub logical_name: String,
    pub format: Option<FileFormat>,
    pub path: String,
    pub bound: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scan_hint: Option<String>,
}

pub fn sql_string(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}

pub fn path_for_duckdb(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

pub fn scan_sql(path: &Path, format: FileFormat, options: &FileScanOptions) -> String {
    scan_location(&path_for_duckdb(path), format, options)
}

pub fn scan_location(location: &str, format: FileFormat, options: &FileScanOptions) -> String {
    let file = sql_string(location);
    let header = if options.header.unwrap_or(true) {
        "true"
    } else {
        "false"
    };
    match format {
        FileFormat::Csv => {
            let delim = options.delim.as_deref().unwrap_or(",");
            format!(
                "SELECT * FROM read_csv_auto({file}, header={header}, delim={})",
                sql_string(delim)
            )
        }
        FileFormat::Tsv => format!(
            "SELECT * FROM read_csv_auto({file}, header={header}, delim={})",
            sql_string(options.delim.as_deref().unwrap_or("\t"))
        ),
        FileFormat::Parquet => format!("SELECT * FROM read_parquet({file})"),
        FileFormat::Json => format!("SELECT * FROM read_json_auto({file})"),
        FileFormat::Ndjson => format!("SELECT * FROM read_ndjson_auto({file})"),
    }
}

pub fn sanitize_ident(raw: &str) -> String {
    let mut out = String::new();
    for c in raw.chars() {
        if c.is_ascii_alphanumeric() || c == '_' {
            out.push(c);
        } else if !out.is_empty() && !out.ends_with('_') {
            out.push('_');
        }
    }
    let out = out.trim_matches('_').to_string();
    if out.is_empty() {
        return "file".into();
    }
    if out.chars().next().is_some_and(|c| c.is_ascii_digit()) {
        format!("_{out}")
    } else {
        out
    }
}

fn download_http_file(uri: &str, format: FileFormat) -> DadixResult<PathBuf> {
    let ext = match format {
        FileFormat::Ndjson => "ndjson",
        FileFormat::Json => "json",
        FileFormat::Csv => "csv",
        FileFormat::Tsv => "tsv",
        FileFormat::Parquet => "parquet",
    };
    let dest = std::env::temp_dir().join(format!(
        "dadix-remote-{}-{}.{}",
        std::process::id(),
        name_from_uri(uri),
        ext
    ));
    let agent: ureq::Agent = ureq::Agent::config_builder()
        .timeout_global(Some(std::time::Duration::from_secs(8)))
        .build()
        .into();
    let response = agent.get(uri).call().map_err(|err| {
        DadixError::new(
            ErrorCode::SourceNotFound,
            format!("JSON URL konnte nicht geladen werden: {err}"),
        )
    })?;
    if !response.status().is_success() {
        return Err(DadixError::new(
            ErrorCode::SourceNotFound,
            format!("JSON URL returned HTTP {}", response.status()),
        ));
    }
    let mut reader = response.into_body().into_reader();
    let mut file = std::fs::File::create(&dest)?;
    std::io::copy(&mut reader, &mut file)?;
    file.flush()?;
    Ok(dest)
}

fn name_from_uri(uri: &str) -> String {
    let without_query = uri.split(['?', '#']).next().unwrap_or(uri);
    let last = without_query
        .trim_end_matches('/')
        .rsplit('/')
        .next()
        .unwrap_or("json");
    let stem = last.rsplit_once('.').map(|(s, _)| s).unwrap_or(last);
    let name = sanitize_ident(stem);
    if name == "file" {
        "json".into()
    } else {
        name
    }
}

impl ProjectHandle {
    /// Link an external file. The bytes stay in the original file.
    pub fn link_file(&self, path: impl AsRef<Path>, prefer_relative: bool) -> DadixResult<Source> {
        self.link_file_with_format(path, prefer_relative, None)
    }

    pub fn link_file_with_format(
        &self,
        path: impl AsRef<Path>,
        prefer_relative: bool,
        format_hint: Option<FileFormat>,
    ) -> DadixResult<Source> {
        self.ensure_writable()?;
        let path = path.as_ref();
        let raw = path.to_string_lossy();
        if is_http_uri(&raw) {
            return self.link_http_file(raw.as_ref(), format_hint);
        }
        if !path.exists() {
            return Err(DadixError::new(
                ErrorCode::SourceNotFound,
                format!("file does not exist: {}", path.display()),
            ));
        }
        let format = FileFormat::from_path(path).or(format_hint).ok_or_else(|| {
            DadixError::new(
                ErrorCode::UnsupportedFormat,
                format!("unsupported file type: {}", path.display()),
            )
        })?;
        let name = path
            .file_stem()
            .and_then(|s| s.to_str())
            .filter(|s| !s.is_empty())
            .unwrap_or(format.as_str())
            .to_string();
        let (path_mode, uri) = if prefer_relative {
            if let Some(rel) = to_relative_uri(self.path(), path) {
                (PathMode::Relative, rel)
            } else {
                (PathMode::Absolute, path.to_string_lossy().into_owned())
            }
        } else {
            let abs = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
            (PathMode::Absolute, abs.to_string_lossy().into_owned())
        };
        let identity = FileIdentity::capture(path);
        let source = self.add_source(NewSource {
            name,
            type_name: format.as_str().into(),
            kind: SourceKind::LinkedFile,
            path_mode,
            uri: Some(uri),
            options: Some(identity.merge_into_options(None)),
            credential: None,
        })?;
        self.logical_name_for(&source, true)?;
        self.sync_file_source(source.id)?;
        self.list_sources()?
            .into_iter()
            .find(|s| s.id == source.id)
            .ok_or_else(|| DadixError::new(ErrorCode::NotFound, "source not found after link"))
    }

    pub fn link_http_file(
        &self,
        uri: &str,
        format_hint: Option<FileFormat>,
    ) -> DadixResult<Source> {
        self.ensure_writable()?;
        let uri = uri.trim();
        if !is_http_uri(uri) {
            return Err(DadixError::new(
                ErrorCode::InvalidPath,
                "remote file URI must start with http:// or https://",
            ));
        }
        reject_secret_uri(uri)?;
        let format = format_hint
            .or_else(|| FileFormat::from_uri(uri))
            .unwrap_or(FileFormat::Json);
        if !matches!(format, FileFormat::Json | FileFormat::Ndjson) {
            return Err(DadixError::new(
                ErrorCode::UnsupportedFormat,
                "remote HTTP sources currently support JSON and NDJSON",
            ));
        }
        let source = self.add_source(NewSource {
            name: name_from_uri(uri),
            type_name: format.as_str().into(),
            kind: SourceKind::LinkedFile,
            path_mode: PathMode::Absolute,
            uri: Some(uri.to_string()),
            options: None,
            credential: None,
        })?;
        self.logical_name_for(&source, true)?;
        if let Some(bound) = self.sync_file_source(source.id)? {
            if !bound.bound {
                return Err(DadixError::new(
                    ErrorCode::SourceNotFound,
                    bound
                        .error
                        .unwrap_or_else(|| "JSON URL could not be read".into()),
                ));
            }
        }
        self.list_sources()?
            .into_iter()
            .find(|s| s.id == source.id)
            .ok_or_else(|| DadixError::new(ErrorCode::NotFound, "source not found after link"))
    }

    pub fn bind_file_sources(&self) -> DadixResult<Vec<BoundFileSource>> {
        let mut bound = Vec::new();
        for source in self.list_sources()? {
            if let Some(item) = self.sync_file_source(source.id)? {
                bound.push(item);
            }
        }
        Ok(bound)
    }

    pub fn list_bound_sources(&self) -> DadixResult<Vec<BoundFileSource>> {
        self.bind_file_sources()
    }

    pub fn preview_source(
        &self,
        source_id: i64,
        offset: u64,
        limit: Option<u32>,
    ) -> DadixResult<QueryResult> {
        let bound = self.require_bound(source_id)?;
        let mut request = QueryRequest::sql(format!("SELECT * FROM {}", bound.logical_name));
        request.offset = offset;
        request.limit = limit;
        self.execute_query(request)
    }

    pub fn describe_source(&self, source_id: i64) -> DadixResult<QueryResult> {
        let bound = self.require_bound(source_id)?;
        self.execute_query(QueryRequest::sql(format!(
            "DESCRIBE {}",
            bound.logical_name
        )))
    }

    /// Replace the linked file with `columns` + `rows`. HTTP sources stay read-only.
    pub fn write_file_source(
        &self,
        source_id: i64,
        columns: &[String],
        rows: &[serde_json::Map<String, serde_json::Value>],
    ) -> DadixResult<()> {
        self.ensure_writable()?;
        if columns.is_empty() {
            return Err(DadixError::new(
                ErrorCode::Validation,
                "cannot write a file source without columns",
            ));
        }
        let source = self
            .list_sources()?
            .into_iter()
            .find(|s| s.id == source_id)
            .ok_or_else(|| DadixError::new(ErrorCode::NotFound, "source not found"))?;
        if source.uri.as_deref().is_some_and(is_http_uri) {
            return Err(DadixError::new(
                ErrorCode::ReadOnly,
                "remote HTTP file sources cannot be written",
            ));
        }
        let dest = self
            .resolved_file_path(&source)?
            .ok_or_else(|| {
                DadixError::new(
                    ErrorCode::SourceNotFound,
                    format!("file does not exist for source {}", source.name),
                )
            })?;
        let format = FileFormat::detect(&source.type_name, Some(&dest)).ok_or_else(|| {
            DadixError::new(
                ErrorCode::UnsupportedFormat,
                format!("unsupported file type: {}", dest.display()),
            )
        })?;
        let options = FileScanOptions::from_json(source.options.as_deref());
        match format {
            FileFormat::Csv | FileFormat::Tsv => {
                write_delimited_file(&dest, format, &options, columns, rows)?;
            }
            FileFormat::Json => write_json_file(&dest, columns, rows)?,
            FileFormat::Ndjson => write_ndjson_file(&dest, columns, rows)?,
            FileFormat::Parquet => self.write_parquet_file(&dest, columns, rows)?,
        }
        self.sync_file_source(source_id)?;
        Ok(())
    }

    fn write_parquet_file(
        &self,
        dest: &Path,
        columns: &[String],
        rows: &[serde_json::Map<String, serde_json::Value>],
    ) -> DadixResult<()> {
        let csv_tmp = dest.with_extension("dadix-write.csv.tmp");
        let parquet_tmp = tmp_path(dest);
        write_delimited_to_path(&csv_tmp, ',', true, columns, rows)?;
        let copied = self.with_query(|session| {
            session.execute(QueryRequest::sql(format!(
                "COPY (SELECT * FROM read_csv_auto({}, header=true, delim=',')) TO {} (FORMAT PARQUET)",
                sql_string(&path_for_duckdb(&csv_tmp)),
                sql_string(&path_for_duckdb(&parquet_tmp)),
            )))?;
            Ok(())
        });
        let _ = std::fs::remove_file(&csv_tmp);
        copied?;
        atomic_replace(&parquet_tmp, dest)?;
        Ok(())
    }

    pub fn sync_file_source(&self, source_id: i64) -> DadixResult<Option<BoundFileSource>> {
        let source = self
            .list_sources()?
            .into_iter()
            .find(|s| s.id == source_id)
            .ok_or_else(|| DadixError::new(ErrorCode::NotFound, "source not found"))?;
        if !source.kind.needs_local_file() {
            return Ok(None);
        }
        if let Some(uri) = source.uri.as_deref() {
            if is_http_uri(uri) {
                return Ok(Some(self.sync_http_file_source(&source, uri)));
            }
        }
        let resolved = match resolve_source_path(self.path(), &source) {
            Ok(resolved) => resolved,
            Err(err) => {
                return Ok(Some(unbound(&source, String::new(), None, err.message)));
            }
        };
        let format = FileFormat::detect(&source.type_name, Some(&resolved.path));
        let Some(format) = format else {
            return Ok(None);
        };
        let logical = self.logical_name_for(&source, false)?;
        let path = if resolved.path.exists() {
            let _ = self.remember_file_identity(&source, &resolved.path);
            resolved.path
        } else if let Some(healed) = self.heal_missing_file(&source, &resolved.path)? {
            healed
        } else {
            return Ok(Some(unbound(
                &source,
                logical,
                Some(format),
                format!("file not found: {}", resolved.path.display()),
            )));
        };
        let options = FileScanOptions::from_json(source.options.as_deref());
        let scan = scan_sql(&path, format, &options);
        match self.with_query(|session| {
            session.register_temp_view(&logical, &scan)?;
            Ok(())
        }) {
            Ok(()) => Ok(Some(BoundFileSource {
                source_id: source.id,
                name: source.name,
                logical_name: logical,
                format: Some(format),
                path: path.to_string_lossy().into_owned(),
                bound: true,
                error: None,
                scan_hint: scan_hint(format),
            })),
            Err(err) => Ok(Some(unbound(&source, logical, Some(format), err.message))),
        }
    }

    fn heal_search_roots(&self) -> Vec<PathBuf> {
        self.path()
            .parent()
            .map(|dir| vec![dir.to_path_buf()])
            .unwrap_or_default()
    }

    fn heal_missing_file(&self, source: &Source, expected: &Path) -> DadixResult<Option<PathBuf>> {
        if self.access() != AccessMode::ReadWrite {
            return Ok(None);
        }
        let identity = FileIdentity::from_options(source.options.as_deref())
            .unwrap_or_else(|| FileIdentity::from_expected_path(expected));
        let extra = self.heal_search_roots();
        let Some(found) = find_moved_file(expected, &identity, &extra) else {
            return Ok(None);
        };
        if found == expected {
            return Ok(Some(found));
        }
        let (path_mode, uri, kind) = self.link_location_for(source, &found, true)?;
        let options = FileIdentity::capture(&found).merge_into_options(source.options.as_deref());
        self.update_source_link(source.id, path_mode, &uri, kind, Some(&options))?;
        Ok(Some(found))
    }

    fn remember_file_identity(&self, source: &Source, path: &Path) -> DadixResult<()> {
        if self.access() != AccessMode::ReadWrite {
            return Ok(());
        }
        let captured = FileIdentity::capture(path);
        if FileIdentity::from_options(source.options.as_deref()).as_ref() == Some(&captured) {
            return Ok(());
        }
        let options = captured.merge_into_options(source.options.as_deref());
        self.update_source_link(
            source.id,
            source.path_mode,
            source.uri.as_deref().unwrap_or(""),
            source.kind,
            Some(&options),
        )
    }

    fn resolved_file_path(&self, source: &Source) -> DadixResult<Option<PathBuf>> {
        let resolved = resolve_source_path(self.path(), source)?;
        if resolved.path.exists() {
            let _ = self.remember_file_identity(source, &resolved.path);
            return Ok(Some(resolved.path));
        }
        self.heal_missing_file(source, &resolved.path)
    }

    fn sync_http_file_source(&self, source: &Source, uri: &str) -> BoundFileSource {
        let format = FileFormat::detect(&source.type_name, None)
            .or_else(|| FileFormat::from_uri(uri))
            .unwrap_or(FileFormat::Json);
        let logical = match self.logical_name_for(source, false) {
            Ok(name) => name,
            Err(err) => return unbound(source, "json".into(), Some(format), err.message),
        };
        let options = FileScanOptions::from_json(source.options.as_deref());
        let cached = match download_http_file(uri, format) {
            Ok(path) => path,
            Err(err) => return unbound(source, logical, Some(format), err.message),
        };
        let scan = scan_sql(&cached, format, &options);
        match self.with_query(|session| {
            session.register_temp_view(&logical, &scan)?;
            Ok(())
        }) {
            Ok(()) => BoundFileSource {
                source_id: source.id,
                name: source.name.clone(),
                logical_name: logical,
                format: Some(format),
                path: uri.to_string(),
                bound: true,
                error: None,
                scan_hint: None,
            },
            Err(err) => unbound(source, logical, Some(format), err.message),
        }
    }

    fn require_bound(&self, source_id: i64) -> DadixResult<BoundFileSource> {
        let bound = self.sync_file_source(source_id)?.ok_or_else(|| {
            DadixError::new(
                ErrorCode::UnsupportedFormat,
                "source is not a file that DuckDB can scan",
            )
        })?;
        if !bound.bound {
            return Err(DadixError::new(
                ErrorCode::SourceNotFound,
                bound
                    .error
                    .unwrap_or_else(|| "file source is not available".into()),
            ));
        }
        Ok(bound)
    }

    fn logical_name_for(&self, source: &Source, persist: bool) -> DadixResult<String> {
        if let Some(existing) = self.list_source_tables(source.id)?.into_iter().next() {
            validate_ident(&existing.logical_name)?;
            return Ok(existing.logical_name);
        }
        let stem = source
            .uri
            .as_deref()
            .and_then(|uri| Path::new(uri).file_stem())
            .and_then(|s| s.to_str())
            .unwrap_or(&source.name);
        let mut candidate = sanitize_ident(stem);
        validate_ident(&candidate)?;
        let taken = self.taken_logical_names()?;
        if taken.contains(&candidate) {
            candidate = format!("{}_{}", candidate, source.id);
        }
        validate_ident(&candidate)?;
        if persist && self.access() == AccessMode::ReadWrite {
            self.add_source_table(NewSourceTable {
                source_id: source.id,
                logical_name: candidate.clone(),
                remote_name: None,
                options: None,
            })?;
        }
        Ok(candidate)
    }

    fn taken_logical_names(&self) -> DadixResult<HashSet<String>> {
        let mut names = HashSet::new();
        for source in self.list_sources()? {
            for table in self.list_source_tables(source.id)? {
                names.insert(table.logical_name);
            }
        }
        Ok(names)
    }
}

fn json_cell_text(value: &serde_json::Value) -> String {
    match value {
        serde_json::Value::Null => String::new(),
        serde_json::Value::String(s) => s.clone(),
        serde_json::Value::Bool(b) => {
            if *b {
                "true".into()
            } else {
                "false".into()
            }
        }
        serde_json::Value::Number(n) => n.to_string(),
        other => other.to_string(),
    }
}

fn csv_escape(value: &str, delim: char) -> String {
    let needs_quotes = value.contains(delim)
        || value.contains('"')
        || value.contains('\n')
        || value.contains('\r');
    if needs_quotes {
        format!("\"{}\"", value.replace('"', "\"\""))
    } else {
        value.to_string()
    }
}

fn write_delimited_to_path(
    path: &Path,
    delim: char,
    header: bool,
    columns: &[String],
    rows: &[serde_json::Map<String, serde_json::Value>],
) -> DadixResult<()> {
    let mut file = std::fs::File::create(path)?;
    let sep = delim.to_string();
    if header {
        let line = columns
            .iter()
            .map(|column| csv_escape(column, delim))
            .collect::<Vec<_>>()
            .join(&sep);
        writeln!(file, "{line}")?;
    }
    for row in rows {
        let line = columns
            .iter()
            .map(|column| {
                csv_escape(
                    &json_cell_text(row.get(column).unwrap_or(&serde_json::Value::Null)),
                    delim,
                )
            })
            .collect::<Vec<_>>()
            .join(&sep);
        writeln!(file, "{line}")?;
    }
    file.flush()?;
    Ok(())
}

fn write_delimited_file(
    dest: &Path,
    format: FileFormat,
    options: &FileScanOptions,
    columns: &[String],
    rows: &[serde_json::Map<String, serde_json::Value>],
) -> DadixResult<()> {
    let fallback = if format == FileFormat::Tsv { '\t' } else { ',' };
    let delim = options
        .delim
        .as_deref()
        .and_then(|value| value.chars().next())
        .unwrap_or(fallback);
    let tmp = tmp_path(dest);
    write_delimited_to_path(&tmp, delim, options.header.unwrap_or(true), columns, rows)?;
    atomic_replace(&tmp, dest)?;
    Ok(())
}

fn row_object(
    columns: &[String],
    row: &serde_json::Map<String, serde_json::Value>,
) -> serde_json::Value {
    let mut obj = serde_json::Map::new();
    for column in columns {
        obj.insert(
            column.clone(),
            row.get(column).cloned().unwrap_or(serde_json::Value::Null),
        );
    }
    serde_json::Value::Object(obj)
}

fn write_json_file(
    dest: &Path,
    columns: &[String],
    rows: &[serde_json::Map<String, serde_json::Value>],
) -> DadixResult<()> {
    let tmp = tmp_path(dest);
    let arr: Vec<serde_json::Value> = rows.iter().map(|row| row_object(columns, row)).collect();
    let bytes = serde_json::to_vec_pretty(&arr)
        .map_err(|err| DadixError::new(ErrorCode::Validation, err.to_string()))?;
    std::fs::write(&tmp, bytes)?;
    atomic_replace(&tmp, dest)?;
    Ok(())
}

fn write_ndjson_file(
    dest: &Path,
    columns: &[String],
    rows: &[serde_json::Map<String, serde_json::Value>],
) -> DadixResult<()> {
    let tmp = tmp_path(dest);
    let mut file = std::fs::File::create(&tmp)?;
    for row in rows {
        let encoded = serde_json::to_string(&row_object(columns, row))
            .map_err(|err| DadixError::new(ErrorCode::Validation, err.to_string()))?;
        writeln!(file, "{encoded}")?;
    }
    file.flush()?;
    atomic_replace(&tmp, dest)?;
    Ok(())
}

fn unbound(
    source: &Source,
    logical_name: String,
    format: Option<FileFormat>,
    error: String,
) -> BoundFileSource {
    BoundFileSource {
        source_id: source.id,
        name: source.name.clone(),
        logical_name,
        format,
        path: source.uri.clone().unwrap_or_default(),
        bound: false,
        error: Some(error),
        scan_hint: format.and_then(scan_hint),
    }
}

fn scan_hint(format: FileFormat) -> Option<String> {
    match format {
        FileFormat::Csv | FileFormat::Tsv => Some(
            "For repeated large analyses, Parquet is more efficient than CSV. Dadix will not convert automatically."
                .into(),
        ),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::paths::PathMode;
    use crate::project::{close_project, create_project, open_project};
    use crate::query::QueryRequest;
    use rusqlite::Connection;
    use std::fs;

    fn write_csv(path: &Path, rows: i64) {
        let mut out = String::from("id,g,v\n");
        for i in 0..rows {
            out.push_str(&format!("{i},{},{}.5\n", i % 10, i));
        }
        fs::write(path, out).unwrap();
    }

    #[test]
    fn csv_is_queried_in_place_not_imported() {
        let dir = tempfile::tempdir().unwrap();
        let csv = dir.path().join("umsatz.csv");
        write_csv(&csv, 2500);

        let project = dir.path().join("analyse.dadix");
        let handle = create_project(&project).unwrap();
        let source = handle.link_file(&csv, true).unwrap();
        assert_eq!(source.kind, SourceKind::LinkedFile);
        assert_eq!(source.uri.as_deref(), Some("./umsatz.csv"));

        let preview = handle.preview_source(source.id, 0, Some(1000)).unwrap();
        assert_eq!(preview.returned_rows, 1000);
        assert!(preview.has_more);
        assert_eq!(preview.columns()[0].name, "id");

        let count = handle
            .execute_query(QueryRequest::sql("SELECT count(*) AS n FROM umsatz"))
            .unwrap();
        match &count.columns()[0].data {
            crate::query::ColumnData::Int64 { values } => assert_eq!(values[0], 2500),
            other => panic!("{other:?}"),
        }

        let grouped = handle
            .execute_query(QueryRequest::sql(
                "SELECT g, count(*) AS n FROM umsatz GROUP BY g ORDER BY g",
            ))
            .unwrap();
        assert_eq!(grouped.returned_rows, 10);

        let filtered = handle
            .execute_query(QueryRequest::sql(
                "SELECT count(*) AS n FROM umsatz WHERE g = 1",
            ))
            .unwrap();
        match &filtered.columns()[0].data {
            crate::query::ColumnData::Int64 { values } => assert_eq!(values[0], 250),
            other => panic!("{other:?}"),
        }

        close_project(handle).unwrap();
        let dadix_bytes = fs::read(&project).unwrap();
        assert!(
            !dadix_bytes
                .windows(b"2499,9,2499.5".len())
                .any(|w| w == b"2499,9,2499.5"),
            "csv payload must not be copied into .dadix"
        );
        let conn = Connection::open(&project).unwrap();
        let tables: Vec<String> = conn
            .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
            .unwrap()
            .query_map([], |r| r.get(0))
            .unwrap()
            .map(|r| r.unwrap())
            .collect();
        assert!(!tables.iter().any(|n| n == "umsatz"));
    }

    #[test]
    fn http_uri_detection_defaults_to_json() {
        assert!(is_http_uri("https://example.com/data.json"));
        assert!(is_http_uri("http://localhost:8080/rows.jsonl"));
        assert!(!is_http_uri("/tmp/data.json"));
        assert_eq!(
            FileFormat::from_uri("https://example.com/a.jsonl?x=1"),
            Some(FileFormat::Ndjson)
        );
        assert_eq!(FileFormat::from_uri("https://example.com/api/items"), None);
        assert_eq!(name_from_uri("https://example.com/v1/customers.json"), "customers");
    }

    #[test]
    fn parquet_and_json_bind_without_copying() {
        let dir = tempfile::tempdir().unwrap();
        let parquet = dir.path().join("sales.parquet");
        let json = dir.path().join("sales.json");
        let session = crate::QuerySession::in_memory().unwrap();
        session
            .execute(QueryRequest::sql(format!(
                "COPY (SELECT i AS n FROM range(20) t(i)) TO {} (FORMAT PARQUET)",
                sql_string(&path_for_duckdb(&parquet))
            )))
            .unwrap();
        fs::write(&json, "[{\"n\":1},{\"n\":2},{\"n\":3}]").unwrap();

        let project = dir.path().join("files.dadix");
        let handle = create_project(&project).unwrap();
        let pq = handle.link_file(&parquet, true).unwrap();
        let js = handle.link_file(&json, true).unwrap();
        let pq_count = handle
            .execute_query(QueryRequest::sql("SELECT count(*) AS n FROM sales"))
            .unwrap();
        match &pq_count.columns()[0].data {
            crate::query::ColumnData::Int64 { values } => assert_eq!(values[0], 20),
            other => panic!("{other:?}"),
        }
        let js_count = handle
            .execute_query(QueryRequest::sql("SELECT count(*) AS n FROM sales_2"))
            .unwrap();
        match &js_count.columns()[0].data {
            crate::query::ColumnData::Int64 { values } => assert_eq!(values[0], 3),
            other => panic!("{other:?}"),
        }
        let _ = (pq, js);
        close_project(handle).unwrap();
    }

    #[test]
    fn two_csv_files_can_be_joined() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("orders.csv"), "id,customer\n1,a\n2,b\n").unwrap();
        fs::write(dir.path().join("customers.csv"), "id,name\na,Ada\nb,Bob\n").unwrap();
        let project = dir.path().join("join.dadix");
        let handle = create_project(&project).unwrap();
        handle
            .link_file(dir.path().join("orders.csv"), true)
            .unwrap();
        handle
            .link_file(dir.path().join("customers.csv"), true)
            .unwrap();
        let result = handle
            .execute_query(QueryRequest::sql(
                "SELECT c.name AS name FROM orders o JOIN customers c ON o.customer = c.id ORDER BY c.name",
            ))
            .unwrap();
        match &result.columns()[0].data {
            crate::query::ColumnData::Utf8 { values } => {
                assert_eq!(values, &["Ada".to_string(), "Bob".to_string()]);
            }
            other => panic!("{other:?}"),
        }
        close_project(handle).unwrap();
    }

    #[test]
    fn missing_file_is_unbound_until_relink() {
        let dir = tempfile::tempdir().unwrap();
        let project = dir.path().join("missing.dadix");
        let handle = create_project(&project).unwrap();
        let source = handle
            .add_source(NewSource {
                name: "Kosten".into(),
                type_name: "csv".into(),
                kind: SourceKind::LinkedFile,
                path_mode: PathMode::Relative,
                uri: Some("./data/kosten.csv".into()),
                options: None,
                credential: None,
            })
            .unwrap();
        let bound = handle.sync_file_source(source.id).unwrap().unwrap();
        assert!(!bound.bound);
        fs::create_dir_all(dir.path().join("data")).unwrap();
        fs::write(dir.path().join("data/kosten.csv"), "n\n1\n2\n").unwrap();
        handle
            .relink_source(source.id, dir.path().join("data/kosten.csv"), true)
            .unwrap();
        let preview = handle.preview_source(source.id, 0, Some(10)).unwrap();
        assert_eq!(preview.returned_rows, 2);
        close_project(handle).unwrap();
    }

    #[test]
    fn reopen_rebinds_file_views() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("t.csv"), "n\n9\n").unwrap();
        let project = dir.path().join("rebind.dadix");
        let handle = create_project(&project).unwrap();
        handle.link_file(dir.path().join("t.csv"), true).unwrap();
        close_project(handle).unwrap();

        let handle = open_project(&project).unwrap();
        let count = handle
            .execute_query(QueryRequest::sql("SELECT n FROM t"))
            .unwrap();
        match &count.columns()[0].data {
            crate::query::ColumnData::Int64 { values } => assert_eq!(values[0], 9),
            other => panic!("{other:?}"),
        }
        close_project(handle).unwrap();
    }

    #[test]
    fn cancel_works_while_project_query_is_running() {
        use crate::error::ErrorCode;
        use crate::query::QueryId;
        use std::sync::Arc;
        use std::thread;
        use std::time::Duration;

        let dir = tempfile::tempdir().unwrap();
        let handle = Arc::new(create_project(dir.path().join("cancel.dadix")).unwrap());
        let query_id = QueryId::new();
        let worker = {
            let handle = Arc::clone(&handle);
            let query_id = query_id.clone();
            thread::spawn(move || {
                let mut req = QueryRequest::sql("SELECT sum(i) AS s FROM range(2000000000) t(i)");
                req.query_id = Some(query_id);
                handle.execute_query(req)
            })
        };
        thread::sleep(Duration::from_millis(80));
        handle.cancel_query(&query_id).unwrap();
        let err = worker.join().unwrap().unwrap_err();
        assert_eq!(err.code, ErrorCode::QueryCancelled);
        let handle = Arc::try_unwrap(handle).unwrap_or_else(|shared| {
            shared.shutdown_query();
            panic!("project handle still shared after cancel test");
        });
        close_project(handle).unwrap();
    }

    #[test]
    fn describe_source_returns_columns() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("t.csv"), "n,label\n1,a\n").unwrap();
        let handle = create_project(dir.path().join("d.dadix")).unwrap();
        let source = handle.link_file(dir.path().join("t.csv"), true).unwrap();
        let described = handle.describe_source(source.id).unwrap();
        assert!(described
            .columns()
            .iter()
            .any(|c| c.name.eq_ignore_ascii_case("column_name")
                || c.name.eq_ignore_ascii_case("name")));
        close_project(handle).unwrap();
    }

    #[test]
    fn csv_edits_are_written_back_to_the_file() {
        let dir = tempfile::tempdir().unwrap();
        let csv = dir.path().join("kunden.csv");
        fs::write(&csv, "name,stadt\nAda,Berlin\nBob,Hamburg\n").unwrap();
        let handle = create_project(dir.path().join("p.dadix")).unwrap();
        let source = handle.link_file(&csv, true).unwrap();

        let mut ada = serde_json::Map::new();
        ada.insert("name".into(), serde_json::json!("Ada"));
        ada.insert("stadt".into(), serde_json::json!("München"));
        let mut bob = serde_json::Map::new();
        bob.insert("name".into(), serde_json::json!("Bob"));
        bob.insert("stadt".into(), serde_json::json!("Hamburg"));
        let mut cara = serde_json::Map::new();
        cara.insert("name".into(), serde_json::json!("Cara"));
        cara.insert("stadt".into(), serde_json::json!("Köln"));

        handle
            .write_file_source(
                source.id,
                &["name".into(), "stadt".into()],
                &[ada, bob, cara],
            )
            .unwrap();

        let text = fs::read_to_string(&csv).unwrap();
        assert!(text.contains("München"), "{text}");
        assert!(text.contains("Cara"), "{text}");
        assert!(!text.contains("Berlin"), "{text}");

        let preview = handle.preview_source(source.id, 0, Some(10)).unwrap();
        assert_eq!(preview.returned_rows, 3);
        close_project(handle).unwrap();
    }

    #[test]
    fn renamed_linked_csv_is_healed() {
        let dir = tempfile::tempdir().unwrap();
        let csv = dir.path().join("kunden.csv");
        fs::write(&csv, "name\nAda\n").unwrap();
        let handle = create_project(dir.path().join("p.dadix")).unwrap();
        let source = handle.link_file(&csv, true).unwrap();
        fs::rename(&csv, dir.path().join("kunden-archiv.csv")).unwrap();
        let preview = handle.preview_source(source.id, 0, Some(10)).unwrap();
        assert_eq!(preview.returned_rows, 1);
        let updated = handle
            .list_sources()
            .unwrap()
            .into_iter()
            .find(|item| item.id == source.id)
            .unwrap();
        assert!(
            updated
                .uri
                .as_deref()
                .is_some_and(|uri| uri.contains("kunden-archiv.csv")),
            "{updated:?}"
        );
        close_project(handle).unwrap();
    }

    #[test]
    fn moved_linked_csv_under_project_is_healed() {
        let dir = tempfile::tempdir().unwrap();
        let csv = dir.path().join("umsatz.csv");
        fs::write(&csv, "n\n1\n").unwrap();
        let handle = create_project(dir.path().join("p.dadix")).unwrap();
        let source = handle.link_file(&csv, true).unwrap();
        fs::create_dir_all(dir.path().join("archiv")).unwrap();
        fs::rename(&csv, dir.path().join("archiv/umsatz.csv")).unwrap();
        let preview = handle.preview_source(source.id, 0, Some(10)).unwrap();
        assert_eq!(preview.returned_rows, 1);
        close_project(handle).unwrap();
    }

    #[test]
    fn quoted_csv_values_survive_roundtrip() {
        let dir = tempfile::tempdir().unwrap();
        let csv = dir.path().join("notes.csv");
        fs::write(&csv, "title,note\nold,plain\n").unwrap();
        let handle = create_project(dir.path().join("q.dadix")).unwrap();
        let source = handle.link_file(&csv, true).unwrap();
        let mut row = serde_json::Map::new();
        row.insert("title".into(), serde_json::json!("a,b"));
        row.insert("note".into(), serde_json::json!("says \"hi\""));
        handle
            .write_file_source(source.id, &["title".into(), "note".into()], &[row])
            .unwrap();
        let text = fs::read_to_string(&csv).unwrap();
        assert!(text.contains("\"a,b\""), "{text}");
        assert!(text.contains("\"says \"\"hi\"\"\""), "{text}");
        let preview = handle.preview_source(source.id, 0, Some(5)).unwrap();
        assert_eq!(preview.returned_rows, 1);
        close_project(handle).unwrap();
    }

    #[test]
    fn http_json_rejects_secrets_and_non_http() {
        let dir = tempfile::tempdir().unwrap();
        let handle = create_project(dir.path().join("http.dadix")).unwrap();
        assert!(handle
            .link_http_file("ftp://example.com/a.json", Some(FileFormat::Json))
            .is_err());
        assert!(handle
            .link_http_file(
                "https://user:secret@example.com/a.json",
                Some(FileFormat::Json)
            )
            .is_err());
        close_project(handle).unwrap();
    }
}
