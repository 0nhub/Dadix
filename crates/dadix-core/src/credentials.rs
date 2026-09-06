//! OS credential store. The `.dadix` file holds only a `credential_id`.

use crate::error::{DadixError, DadixResult, ErrorCode};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fmt;
use std::sync::{Arc, Mutex};

pub const CREDENTIAL_SERVICE: &str = "dev.dadix.app";

pub trait CredentialStore: Send + Sync {
    fn put(&self, id: &str, secret: &str) -> DadixResult<()>;
    fn get(&self, id: &str) -> DadixResult<Option<String>>;
    fn exists(&self, id: &str) -> DadixResult<bool>;
    fn delete(&self, id: &str) -> DadixResult<()>;
}

#[derive(Clone, Default)]
pub struct MemoryCredentialStore {
    secrets: Arc<Mutex<HashMap<String, String>>>,
}

impl MemoryCredentialStore {
    pub fn new() -> Self {
        Self::default()
    }
}

impl CredentialStore for MemoryCredentialStore {
    fn put(&self, id: &str, secret: &str) -> DadixResult<()> {
        validate_credential_id(id)?;
        self.secrets
            .lock()
            .map_err(|_| DadixError::lock())?
            .insert(id.to_string(), secret.to_string());
        Ok(())
    }

    fn get(&self, id: &str) -> DadixResult<Option<String>> {
        validate_credential_id(id)?;
        Ok(self
            .secrets
            .lock()
            .map_err(|_| DadixError::lock())?
            .get(id)
            .cloned())
    }

    fn exists(&self, id: &str) -> DadixResult<bool> {
        Ok(self.get(id)?.is_some())
    }

    fn delete(&self, id: &str) -> DadixResult<()> {
        validate_credential_id(id)?;
        self.secrets
            .lock()
            .map_err(|_| DadixError::lock())?
            .remove(id);
        Ok(())
    }
}

/// Windows Credential Manager, macOS Keychain, or Linux Secret Service.
pub struct OsCredentialStore {
    service: String,
}

impl OsCredentialStore {
    pub fn new() -> Self {
        Self {
            service: CREDENTIAL_SERVICE.into(),
        }
    }

    fn entry(&self, id: &str) -> DadixResult<keyring::Entry> {
        validate_credential_id(id)?;
        keyring::Entry::new(&self.service, id).map_err(map_keyring)
    }
}

impl Default for OsCredentialStore {
    fn default() -> Self {
        Self::new()
    }
}

impl CredentialStore for OsCredentialStore {
    fn put(&self, id: &str, secret: &str) -> DadixResult<()> {
        self.entry(id)?.set_password(secret).map_err(map_keyring)
    }

    fn get(&self, id: &str) -> DadixResult<Option<String>> {
        match self.entry(id)?.get_password() {
            Ok(secret) => Ok(Some(secret)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(err) => Err(map_keyring(err)),
        }
    }

    fn exists(&self, id: &str) -> DadixResult<bool> {
        Ok(self.get(id)?.is_some())
    }

    fn delete(&self, id: &str) -> DadixResult<()> {
        match self.entry(id)?.delete_credential() {
            Ok(()) => Ok(()),
            Err(keyring::Error::NoEntry) => Ok(()),
            Err(err) => Err(map_keyring(err)),
        }
    }
}

pub fn default_credential_store() -> Arc<dyn CredentialStore> {
    if cfg!(test) {
        Arc::new(MemoryCredentialStore::new())
    } else {
        Arc::new(OsCredentialStore::new())
    }
}

/// Store a named secret in the OS keychain. Used by `dadix-credential` and live tests.
pub fn put_os_credential(id: &str, secret: &DatabaseSecret) -> DadixResult<()> {
    OsCredentialStore::new().put(id, &secret.to_json()?)
}

pub fn get_os_credential(id: &str) -> DadixResult<Option<DatabaseSecret>> {
    match OsCredentialStore::new().get(id)? {
        Some(raw) => Ok(Some(DatabaseSecret::from_json(&raw)?)),
        None => Ok(None),
    }
}

pub fn delete_os_credential(id: &str) -> DadixResult<()> {
    OsCredentialStore::new().delete(id)
}

pub fn new_credential_id() -> String {
    format!("dadix-{}", uuid::Uuid::new_v4())
}

pub fn validate_credential_id(id: &str) -> DadixResult<()> {
    let id = id.trim();
    if id.is_empty() || id.len() > 200 {
        return Err(DadixError::new(
            ErrorCode::Validation,
            "credential_id must be a non-empty id",
        ));
    }
    if !id
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err(DadixError::new(
            ErrorCode::Validation,
            "credential_id contains invalid characters",
        ));
    }
    Ok(())
}

/// Secret payload kept only in the OS store. Never write this into `.dadix`.
#[derive(Clone, Serialize, Deserialize)]
pub struct DatabaseSecret {
    pub username: Option<String>,
    pub password: Option<String>,
}

impl fmt::Debug for DatabaseSecret {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("DatabaseSecret")
            .field("username", &self.username)
            .field("password", &self.password.as_ref().map(|_| "[redacted]"))
            .finish()
    }
}

impl DatabaseSecret {
    pub fn from_json(raw: &str) -> DadixResult<Self> {
        serde_json::from_str(raw).map_err(|err| {
            DadixError::with_details(
                ErrorCode::CredentialStore,
                "credential payload is not valid JSON",
                err.to_string(),
            )
        })
    }

    pub fn to_json(&self) -> DadixResult<String> {
        serde_json::to_string(self).map_err(|err| {
            DadixError::with_details(
                ErrorCode::CredentialStore,
                "could not encode credential payload",
                err.to_string(),
            )
        })
    }
}

pub fn uri_contains_secret(uri: &str) -> bool {
    let lower = uri.to_ascii_lowercase();
    if lower.contains("password=")
        || lower.contains("pwd=")
        || lower.contains("passwd=")
        || lower.contains("api_key=")
        || lower.contains("access_token=")
    {
        return true;
    }
    let Some(rest) = uri.split("://").nth(1) else {
        return false;
    };
    let authority = rest.split('/').next().unwrap_or("");
    match authority.rfind('@') {
        Some(at) => authority[..at].contains(':'),
        None => false,
    }
}

pub fn reject_secret_uri(uri: &str) -> DadixResult<()> {
    if uri_contains_secret(uri) {
        Err(DadixError::secret(
            "refusing to store credentials in the source URI; use credential_id",
        ))
    } else {
        Ok(())
    }
}

fn map_keyring(err: keyring::Error) -> DadixError {
    DadixError::with_details(
        ErrorCode::CredentialStore,
        "operating system credential store error",
        err.to_string(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn memory_store_roundtrip_and_delete() {
        let store = MemoryCredentialStore::new();
        store.put("dadix-a", r#"{"username":"sa","password":"secret"}"#).unwrap();
        assert!(store.exists("dadix-a").unwrap());
        assert!(store.get("dadix-a").unwrap().unwrap().contains("secret"));
        store.delete("dadix-a").unwrap();
        assert!(!store.exists("dadix-a").unwrap());
    }

    #[test]
    fn uri_with_password_is_rejected() {
        assert!(uri_contains_secret("postgresql://user:secret@localhost/db"));
        assert!(uri_contains_secret("mysql://localhost/db?password=x"));
        assert!(!uri_contains_secret("postgresql://localhost:5432/db"));
        assert!(!uri_contains_secret("/tmp/app.sqlite"));
        reject_secret_uri("sqlserver://sa:pw@host/db").unwrap_err();
    }

    #[test]
    fn database_secret_debug_redacts_password() {
        let secret = DatabaseSecret {
            username: Some("sa".into()),
            password: Some("hunter2".into()),
        };
        let debug = format!("{secret:?}");
        assert!(debug.contains("sa"));
        assert!(debug.contains("[redacted]"));
        assert!(!debug.contains("hunter2"));
    }

    #[test]
    fn os_store_rejects_empty_id() {
        let store = OsCredentialStore::new();
        assert!(store.put("", "x").is_err());
        assert!(store.get("bad id").is_err());
    }
}
