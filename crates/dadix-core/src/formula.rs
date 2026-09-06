//! Evaluate table formulas in the core. Same `#Field` substitution as the 3020 UI.

use crate::domain::{Column, Record};

pub fn eval_formula(formula: &str, record: &Record, columns: &[Column]) -> String {
    let mut expr = formula.to_string();
    let mut ordered: Vec<&Column> = columns.iter().collect();
    ordered.sort_by(|a, b| b.name.len().cmp(&a.name.len()));
    for column in ordered {
        let needle = format!("#{}", column.name);
        let value = record
            .data
            .get(&column.name)
            .map(|v| match v {
                serde_json::Value::String(s) => format!("\"{}\"", s.replace('"', "\\\"")),
                serde_json::Value::Null => "\"\"".into(),
                other => other.to_string(),
            })
            .unwrap_or_else(|| "\"\"".into());
        expr = expr.replace(&needle, &value);
    }
    eval_simple_math(&expr).unwrap_or_default()
}

fn eval_simple_math(expr: &str) -> Option<String> {
    let trimmed = expr.trim();
    if trimmed.is_empty() {
        return Some(String::new());
    }
    if (trimmed.starts_with('"') && trimmed.ends_with('"'))
        || (trimmed.starts_with('\'') && trimmed.ends_with('\''))
    {
        return Some(trimmed[1..trimmed.len() - 1].to_string());
    }
    if let Ok(n) = trimmed.parse::<f64>() {
        return Some(format_number(n));
    }
    None
}

fn format_number(n: f64) -> String {
    if n.fract() == 0.0 {
        format!("{}", n as i64)
    } else {
        n.to_string()
    }
}
