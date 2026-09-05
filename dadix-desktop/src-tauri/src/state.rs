//! App state: currently open .dadix file.

use crate::db::DadixDb;
use std::path::PathBuf;
use std::sync::Mutex;

pub struct AppState {
    pub db: Mutex<Option<(DadixDb, PathBuf)>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            db: Mutex::new(None),
        }
    }
}
