//! Desktop session: the open [`dadix_core::ProjectHandle`] plus a launch-queued path.

use dadix_core::ProjectHandle;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

pub struct AppState {
    pub session: Mutex<Option<Arc<ProjectHandle>>>,
    /// Path from argv or macOS `RunEvent::Opened`, consumed via `dadix_take_pending_open_path`.
    pub pending_open: Mutex<Option<PathBuf>>,
}

impl AppState {
    pub fn new(pending_open: Option<PathBuf>) -> Self {
        Self {
            session: Mutex::new(None),
            pending_open: Mutex::new(pending_open),
        }
    }
}
