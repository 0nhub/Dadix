//! Exclusive/shared lock on a sibling `*.dadix.lock` file.

use crate::domain::AccessMode;
use crate::error::{DadixError, DadixResult, ErrorCode};
use fs4::fs_std::FileExt;
use std::fs::{File, OpenOptions};
use std::path::{Path, PathBuf};

pub fn lock_path(project_path: &Path) -> PathBuf {
    let mut path = project_path.as_os_str().to_os_string();
    path.push(".lock");
    PathBuf::from(path)
}

pub struct ProjectLock {
    file: File,
    #[allow(dead_code)]
    pub access: AccessMode,
}

impl ProjectLock {
    pub fn acquire(project_path: &Path, access: AccessMode) -> DadixResult<Self> {
        let path = lock_path(project_path);
        let file = OpenOptions::new()
            .create(true)
            .read(true)
            .write(true)
            .open(&path)?;
        let acquired = match access {
            AccessMode::ReadWrite => FileExt::try_lock_exclusive(&file),
            AccessMode::ReadOnly => FileExt::try_lock_shared(&file),
        };
        match acquired {
            Ok(true) => Ok(Self { file, access }),
            Ok(false) => Err(locked(project_path)),
            Err(err) if err.kind() == std::io::ErrorKind::WouldBlock => Err(locked(project_path)),
            Err(err) => Err(err.into()),
        }
    }
}

fn locked(project_path: &Path) -> DadixError {
    DadixError::new(
        ErrorCode::ProjectLocked,
        format!("project is already open: {}", project_path.display()),
    )
}

impl Drop for ProjectLock {
    fn drop(&mut self) {
        let _ = FileExt::unlock(&self.file);
    }
}
