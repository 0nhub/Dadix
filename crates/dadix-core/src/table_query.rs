//! Filter, sort, and page embedded table records in the core.
//! The UI only sends view JSON + search + a page window.

use crate::domain::{Column, Record, RecordPage};
use crate::error::{DadixError, DadixResult, ErrorCode};
use serde::Deserialize;

#[derive(Debug, Clone, Default)]
pub struct TableQuery {
    pub filter_json: Option<String>,
    pub sort_json: Option<String>,
    pub search: Option<String>,
    pub limit: i64,
    pub offset: i64,
}

#[derive(Debug, Deserialize)]
struct FilterSpec {
    #[serde(alias = "op")]
    operation: String,
    #[serde(rename = "fieldId")]
    field_id: i64,
    #[serde(default)]
    relation: String,
    #[serde(default)]
    value: String,
}

#[derive(Debug, Deserialize)]
struct SortSpec {
    #[serde(rename = "fieldId")]
    field_id: Option<i64>,
    direction: Option<String>,
}

pub fn query_records(
    columns: &[Column],
    records: Vec<Record>,
    query: &TableQuery,
) -> DadixResult<RecordPage> {
    let raw_filter = query.filter_json.as_deref().map(str::trim).filter(|s| !s.is_empty() && *s != "null");
    let express = raw_filter.is_some_and(|s| !s.starts_with('['));
    let filters = if express { Vec::new() } else { parse_filters(query.filter_json.as_deref())? };
    let sorts = parse_sorts(query.sort_json.as_deref())?;
    let search = query
        .search
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| s.to_lowercase());

    let mut matched: Vec<Record> = records
        .into_iter()
        .filter(|record| {
            if express {
                matches_express(record, columns, raw_filter.unwrap_or(""))
            } else {
                matches_filters(record, columns, &filters)
            }
        })
        .filter(|record| match &search {
            Some(q) => record_matches_search(record, columns, q),
            None => true,
        })
        .collect();

    if !sorts.is_empty() {
        matched.sort_by(|a, b| compare_records(a, b, columns, &sorts));
    }

    let total = matched.len() as i64;
    let offset = query.offset.max(0) as usize;
    let limit = if query.limit <= 0 {
        matched.len()
    } else {
        query.limit as usize
    };
    let records = matched.into_iter().skip(offset).take(limit).collect();
    Ok(RecordPage { records, total })
}

fn matches_express(record: &Record, columns: &[Column], expr: &str) -> bool {
    eval_express(expr.trim(), record, columns).unwrap_or(true)
}

fn eval_express(expr: &str, record: &Record, columns: &[Column]) -> Option<bool> {
    if expr.is_empty() {
        return Some(true);
    }
    let open = expr.find('(')?;
    let close = expr.rfind(')')?;
    let op = expr[..open].trim();
    let inner = expr[open + 1..close].trim();
    match op {
        "and" => Some(split_args(inner).into_iter().all(|part| eval_express(&part, record, columns).unwrap_or(true))),
        "or" => Some(split_args(inner).into_iter().any(|part| eval_express(&part, record, columns).unwrap_or(false))),
        "not" => Some(!eval_express(inner, record, columns).unwrap_or(false)),
        "isnull" => Some(named_text(record, columns, inner).is_empty()),
        "notnull" => Some(!named_text(record, columns, inner).is_empty()),
        other => {
            let args = split_args(inner);
            let field = args.first()?.trim();
            let needle = unquote(args.get(1).map(String::as_str).unwrap_or(""));
            let text = named_text(record, columns, field);
            Some(match other {
                "eq" => text.eq_ignore_ascii_case(&needle),
                "neq" => !text.eq_ignore_ascii_case(&needle),
                "like" => text.to_lowercase().contains(&needle.to_lowercase()),
                "nlike" => !text.to_lowercase().contains(&needle.to_lowercase()),
                "lte" => text <= needle,
                "gte" => text >= needle,
                "lt" => text < needle,
                "gt" => text > needle,
                "in" => needle.split(',').any(|part| text.eq_ignore_ascii_case(part.trim())),
                _ => true,
            })
        }
    }
}

fn named_text(record: &Record, columns: &[Column], name: &str) -> String {
    let name = name.trim();
    if let Some(column) = columns.iter().find(|c| c.name == name) {
        return column_text(column, cell(record, column).as_ref());
    }
    cell_text(record.data.get(name))
}

fn unquote(value: &str) -> String {
    let trimmed = value.trim().trim_matches('\'').trim_matches('"');
    trimmed.replace("\\\"", "\"")
}

fn split_args(inner: &str) -> Vec<String> {
    let mut args = Vec::new();
    let mut current = String::new();
    let mut depth = 0;
    let mut quote: Option<char> = None;
    for ch in inner.chars() {
        if let Some(q) = quote {
            current.push(ch);
            if ch == q {
                quote = None;
            }
            continue;
        }
        match ch {
            '\'' | '"' => {
                quote = Some(ch);
                current.push(ch);
            }
            '(' => {
                depth += 1;
                current.push(ch);
            }
            ')' => {
                depth -= 1;
                current.push(ch);
            }
            ',' if depth == 0 => {
                args.push(current.trim().to_string());
                current.clear();
            }
            _ => current.push(ch),
        }
    }
    if !current.trim().is_empty() {
        args.push(current.trim().to_string());
    }
    args
}

fn parse_filters(raw: Option<&str>) -> DadixResult<Vec<FilterSpec>> {
    let Some(raw) = raw.map(str::trim).filter(|s| !s.is_empty() && *s != "null") else {
        return Ok(Vec::new());
    };
    serde_json::from_str(raw).map_err(|e| {
        DadixError::new(ErrorCode::Validation, format!("invalid view filter: {e}"))
    })
}

fn parse_sorts(raw: Option<&str>) -> DadixResult<Vec<SortSpec>> {
    let Some(raw) = raw.map(str::trim).filter(|s| !s.is_empty() && *s != "null") else {
        return Ok(Vec::new());
    };
    serde_json::from_str(raw).map_err(|e| {
        DadixError::new(ErrorCode::Validation, format!("invalid view sort: {e}"))
    })
}

fn column_by_id<'a>(columns: &'a [Column], id: i64) -> Option<&'a Column> {
    columns.iter().find(|c| c.id == id)
}

fn cell(record: &Record, column: &Column) -> Option<serde_json::Value> {
    record.data.get(&column.name).cloned()
}

fn cell_text(value: Option<&serde_json::Value>) -> String {
    match value {
        None | Some(serde_json::Value::Null) => String::new(),
        Some(serde_json::Value::String(s)) => s.clone(),
        Some(serde_json::Value::Bool(b)) => {
            if *b {
                "true".into()
            } else {
                "false".into()
            }
        }
        Some(other) => other.to_string().trim_matches('"').to_string(),
    }
}

fn is_file_column(column: &Column) -> bool {
    column.type_name.eq_ignore_ascii_case("FILE")
}

fn file_field_name(value: Option<&serde_json::Value>) -> String {
    let Some(value) = value else {
        return String::new();
    };
    if let Some(name) = value.get("name").and_then(|v| v.as_str()) {
        return name.to_string();
    }
    if let Some(raw) = value.as_str() {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            return String::new();
        }
        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(trimmed) {
            if let Some(name) = parsed.get("name").and_then(|v| v.as_str()) {
                return name.to_string();
            }
        }
        if trimmed.starts_with("data:image/") {
            return "image".into();
        }
    }
    String::new()
}

fn column_text(column: &Column, value: Option<&serde_json::Value>) -> String {
    if is_file_column(column) {
        file_field_name(value)
    } else {
        cell_text(value)
    }
}

fn matches_filters(record: &Record, columns: &[Column], filters: &[FilterSpec]) -> bool {
    if filters.is_empty() {
        return true;
    }
    let mut acc = true;
    for (index, filter) in filters.iter().enumerate() {
        let hit = eval_filter(record, columns, filter);
        if index == 0 || filter.relation.eq_ignore_ascii_case("where") {
            acc = hit;
        } else if filter.relation.eq_ignore_ascii_case("or") {
            acc |= hit;
        } else {
            acc &= hit;
        }
    }
    acc
}

fn eval_filter(record: &Record, columns: &[Column], filter: &FilterSpec) -> bool {
    let Some(column) = column_by_id(columns, filter.field_id) else {
        return false;
    };
    let value = cell(record, column);
    let text = column_text(column, value.as_ref());
    let needle = filter.value.as_str();
    match filter.operation.as_str() {
        "eq" => text.eq_ignore_ascii_case(needle),
        "neq" => !text.eq_ignore_ascii_case(needle),
        "like" => text.to_lowercase().contains(&needle.to_lowercase()),
        "nlike" => !text.to_lowercase().contains(&needle.to_lowercase()),
        "isnull" => text.is_empty(),
        "notnull" => !text.is_empty(),
        "lte" => compare_typed(value.as_ref(), needle, column) != std::cmp::Ordering::Greater,
        "gte" => compare_typed(value.as_ref(), needle, column) != std::cmp::Ordering::Less,
        "in" => needle
            .split(',')
            .map(str::trim)
            .any(|part| text.eq_ignore_ascii_case(part)),
        _ => true,
    }
}

fn compare_typed(value: Option<&serde_json::Value>, needle: &str, column: &Column) -> std::cmp::Ordering {
    if column.type_name.eq_ignore_ascii_case("INTEGER") {
        let left = value
            .and_then(|v| v.as_i64().or_else(|| v.as_f64().map(|n| n as i64)))
            .or_else(|| cell_text(value).parse().ok())
            .unwrap_or(0);
        let right = needle.parse::<i64>().unwrap_or(0);
        return left.cmp(&right);
    }
    cell_text(value)
        .to_lowercase()
        .cmp(&needle.to_lowercase())
}

fn record_matches_search(record: &Record, columns: &[Column], query: &str) -> bool {
    columns.iter().any(|column| {
        column_text(column, cell(record, column).as_ref())
            .to_lowercase()
            .contains(query)
    })
}

fn compare_records(
    a: &Record,
    b: &Record,
    columns: &[Column],
    sorts: &[SortSpec],
) -> std::cmp::Ordering {
    for sort in sorts {
        let Some(field_id) = sort.field_id else {
            continue;
        };
        let Some(column) = column_by_id(columns, field_id) else {
            continue;
        };
        let ord = if column.type_name.eq_ignore_ascii_case("INTEGER") {
            let left = numeric(cell(a, column).as_ref());
            let right = numeric(cell(b, column).as_ref());
            left.cmp(&right)
        } else {
            column_text(column, cell(a, column).as_ref())
                .to_lowercase()
                .cmp(&column_text(column, cell(b, column).as_ref()).to_lowercase())
        };
        if ord != std::cmp::Ordering::Equal {
            return if sort
                .direction
                .as_deref()
                .is_some_and(|d| d.eq_ignore_ascii_case("DESC"))
            {
                ord.reverse()
            } else {
                ord
            };
        }
    }
    a.id.cmp(&b.id)
}

fn numeric(value: Option<&serde_json::Value>) -> i64 {
    value
        .and_then(|v| v.as_i64().or_else(|| v.as_f64().map(|n| n as i64)))
        .or_else(|| cell_text(value).parse().ok())
        .unwrap_or(0)
}
