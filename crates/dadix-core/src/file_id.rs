//! Durable identity for linked files so a rename or move can be healed.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

const MAX_WALK_DEPTH: usize = 6;
const MAX_WALK_FILES: usize = 4_000;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FileIdentity {
    pub file_name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub device: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub inode: Option<u64>,
}

impl FileIdentity {
    pub fn capture(path: &Path) -> Self {
        let file_name = path
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_default();
        let (device, inode) = file_ids(path);
        Self {
            file_name,
            device,
            inode,
        }
    }

    pub fn from_options(raw: Option<&str>) -> Option<Self> {
        let value = serde_json::from_str::<serde_json::Value>(raw?).ok()?;
        let obj = value.as_object()?;
        let file_name = obj
            .get("file_name")
            .and_then(|v| v.as_str())
            .map(str::to_string)
            .filter(|s| !s.is_empty())?;
        Some(Self {
            file_name,
            device: obj.get("device").and_then(|v| v.as_u64()),
            inode: obj.get("inode").and_then(|v| v.as_u64()),
        })
    }

    pub fn from_expected_path(path: &Path) -> Self {
        Self {
            file_name: path
                .file_name()
                .map(|name| name.to_string_lossy().into_owned())
                .unwrap_or_default(),
            device: None,
            inode: None,
        }
    }

    pub fn merge_into_options(&self, raw: Option<&str>) -> String {
        let mut value = raw
            .and_then(|s| serde_json::from_str::<serde_json::Value>(s).ok())
            .unwrap_or_else(|| serde_json::json!({}));
        if let Some(obj) = value.as_object_mut() {
            obj.insert("file_name".into(), self.file_name.clone().into());
            match self.device {
                Some(device) => {
                    obj.insert("device".into(), device.into());
                }
                None => {
                    obj.remove("device");
                }
            }
            match self.inode {
                Some(inode) => {
                    obj.insert("inode".into(), inode.into());
                }
                None => {
                    obj.remove("inode");
                }
            }
        }
        serde_json::to_string(&value).unwrap_or_else(|_| "{}".into())
    }
}

pub fn find_moved_file(expected: &Path, identity: &FileIdentity, extra_roots: &[PathBuf]) -> Option<PathBuf> {
    if expected.is_file() {
        return Some(expected.to_path_buf());
    }
    if let Some(found) = resolve_by_volume_id(identity) {
        return Some(found);
    }

    let mut roots = Vec::new();
    if let Some(parent) = expected.parent() {
        if parent.exists() {
            roots.push(parent.to_path_buf());
        }
        if let Some(grand) = parent.parent() {
            if grand.exists() {
                roots.push(grand.to_path_buf());
            }
        }
    }
    for root in extra_roots {
        if root.exists() {
            roots.push(root.clone());
        }
    }

    let mut inode_hits = Vec::new();
    let mut name_hits = Vec::new();
    for root in roots {
        walk_limited(&root, 0, &mut 0, &mut |path| {
            if !path.is_file() {
                return;
            }
            if let (Some(device), Some(inode)) = (identity.device, identity.inode) {
                if file_ids(path) == (Some(device), Some(inode)) {
                    inode_hits.push(path.to_path_buf());
                    return;
                }
            }
            if path
                .file_name()
                .is_some_and(|name| name == identity.file_name.as_str())
            {
                name_hits.push(path.to_path_buf());
            }
        });
        if inode_hits.len() == 1 {
            return inode_hits.pop();
        }
    }

    inode_hits.dedup();
    if inode_hits.len() == 1 {
        return inode_hits.pop();
    }
    name_hits.dedup();
    if name_hits.len() == 1 {
        return name_hits.pop();
    }
    None
}

fn file_ids(path: &Path) -> (Option<u64>, Option<u64>) {
    let meta = match std::fs::metadata(path) {
        Ok(meta) => meta,
        Err(_) => return (None, None),
    };
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        return (Some(meta.dev()), Some(meta.ino()));
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        return (meta.volume_serial_number().map(u64::from), meta.file_index());
    }
    #[cfg(not(any(unix, windows)))]
    {
        let _ = meta;
        (None, None)
    }
}

#[cfg(target_os = "macos")]
fn resolve_by_volume_id(identity: &FileIdentity) -> Option<PathBuf> {
    let device = identity.device?;
    let inode = identity.inode?;
    let vol = PathBuf::from(format!("/.vol/{device}/{inode}"));
    std::fs::canonicalize(vol).ok().filter(|path| path.is_file())
}

#[cfg(not(target_os = "macos"))]
fn resolve_by_volume_id(_identity: &FileIdentity) -> Option<PathBuf> {
    None
}

fn walk_limited(root: &Path, depth: usize, visited: &mut usize, on_file: &mut impl FnMut(&Path)) {
    if depth > MAX_WALK_DEPTH || *visited >= MAX_WALK_FILES {
        return;
    }
    let entries = match std::fs::read_dir(root) {
        Ok(entries) => entries,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        if *visited >= MAX_WALK_FILES {
            return;
        }
        *visited += 1;
        let path = entry.path();
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if name.starts_with('.') {
            continue;
        }
        let ft = entry.file_type().ok();
        if ft.as_ref().is_some_and(|kind| kind.is_dir()) {
            walk_limited(&path, depth + 1, visited, on_file);
        } else if ft.as_ref().is_some_and(|kind| kind.is_file()) {
            on_file(&path);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn finds_renamed_file_by_inode() {
        let dir = tempfile::tempdir().unwrap();
        let original = dir.path().join("kunden.csv");
        fs::write(&original, "name\nAda\n").unwrap();
        let identity = FileIdentity::capture(&original);
        let renamed = dir.path().join("kunden-neu.csv");
        fs::rename(&original, &renamed).unwrap();
        let found = find_moved_file(&original, &identity, &[]).unwrap();
        assert_eq!(found.canonicalize().unwrap(), renamed.canonicalize().unwrap());
    }

    #[test]
    fn finds_unique_filename_after_folder_rename() {
        let dir = tempfile::tempdir().unwrap();
        let old = dir.path().join("alt");
        fs::create_dir_all(&old).unwrap();
        fs::write(old.join("umsatz.csv"), "n\n1\n").unwrap();
        let expected = old.join("umsatz.csv");
        let identity = FileIdentity::from_expected_path(&expected);
        fs::rename(&old, dir.path().join("neu")).unwrap();
        let found = find_moved_file(&expected, &identity, &[]).unwrap();
        assert_eq!(found.file_name().unwrap(), "umsatz.csv");
        assert!(found.starts_with(dir.path().join("neu")));
    }
}
