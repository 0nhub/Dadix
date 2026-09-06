//! Secrets must never be persisted inside a `.dadix` file.

use crate::error::{DadixError, DadixResult};

const FORBIDDEN_KEYS: &[&str] = &[
    "password",
    "passwd",
    "secret",
    "token",
    "api_key",
    "apikey",
    "access_token",
    "refresh_token",
    "private_key",
    "client_secret",
    "auth_token",
];

pub fn normalize_key(key: &str) -> String {
    key.trim().to_ascii_lowercase().replace('-', "_")
}

pub fn is_forbidden_secret_key(key: &str) -> bool {
    let normalized = normalize_key(key);
    FORBIDDEN_KEYS
        .iter()
        .any(|forbidden| normalized == *forbidden || normalized.ends_with(&format!("_{forbidden}")))
}

pub fn reject_secret_key(key: &str) -> DadixResult<()> {
    if is_forbidden_secret_key(key) {
        Err(DadixError::secret(format!(
            "refusing to store '{key}' in the project file; use a credential_id / OS keychain"
        )))
    } else {
        Ok(())
    }
}

pub fn reject_secret_options(options: Option<&str>) -> DadixResult<()> {
    let Some(raw) = options.map(str::trim).filter(|s| !s.is_empty()) else {
        return Ok(());
    };
    let value: serde_json::Value = match serde_json::from_str(raw) {
        Ok(v) => v,
        Err(_) => return Ok(()),
    };
    if let Some(obj) = value.as_object() {
        for key in obj.keys() {
            reject_secret_key(key)?;
        }
    }
    Ok(())
}
