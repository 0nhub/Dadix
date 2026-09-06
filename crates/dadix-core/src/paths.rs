//! Path resolution. Relative URIs are always stored against the `.dadix` directory.

use crate::domain::Source;
use crate::error::{DadixError, DadixResult, ErrorCode};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PathMode {
    Embedded,
    Absolute,
    Relative,
}

impl PathMode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Embedded => "embedded",
            Self::Absolute => "absolute",
            Self::Relative => "relative",
        }
    }

    pub fn parse(value: &str) -> DadixResult<Self> {
        match value {
            "embedded" => Ok(Self::Embedded),
            "absolute" => Ok(Self::Absolute),
            "relative" => Ok(Self::Relative),
            other => Err(DadixError::new(
                ErrorCode::PathResolution,
                format!("unknown path_mode '{other}'"),
            )),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResolvedPath {
    pub mode: PathMode,
    pub path: PathBuf,
}

pub fn is_dadix_path(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case("dadix"))
}

pub fn ensure_dadix_extension(path: &Path) -> DadixResult<()> {
    if is_dadix_path(path) {
        Ok(())
    } else {
        Err(DadixError::new(
            ErrorCode::InvalidPath,
            "path must end with .dadix",
        ))
    }
}

pub fn project_dir(project_path: &Path) -> DadixResult<&Path> {
    project_path.parent().ok_or_else(|| {
        DadixError::new(
            ErrorCode::InvalidPath,
            "project path has no parent directory",
        )
    })
}

/// Sidecar folder for embedded files: `analyse.dadix` → `analyse.dadix.d/`.
pub fn embedded_dir(project_path: &Path) -> DadixResult<PathBuf> {
    let parent = project_dir(project_path)?;
    let mut name = project_path
        .file_name()
        .ok_or_else(|| DadixError::new(ErrorCode::InvalidPath, "project path has no file name"))?
        .to_os_string();
    name.push(".d");
    Ok(parent.join(name))
}

/// Store relative links as `./data/umsatz.csv` (forward slashes, from the project folder).
pub fn normalize_relative_uri(uri: &str) -> DadixResult<String> {
    let trimmed = uri.trim().replace('\\', "/");
    if trimmed.is_empty() {
        return Err(DadixError::new(
            ErrorCode::PathResolution,
            "relative uri must not be empty",
        ));
    }
    if Path::new(&trimmed).is_absolute() || trimmed.starts_with('/') {
        return Err(DadixError::new(
            ErrorCode::PathResolution,
            "relative source uri must not be absolute",
        ));
    }
    let stripped = trimmed
        .strip_prefix("./")
        .unwrap_or(trimmed.as_str())
        .trim_start_matches('/');
    if stripped.is_empty() || stripped == "." {
        return Err(DadixError::new(
            ErrorCode::PathResolution,
            "relative uri must point at a file",
        ));
    }
    if stripped.split('/').any(|part| part == "..") {
        return Err(DadixError::new(
            ErrorCode::PathResolution,
            "relative uri must not contain '..'",
        ));
    }
    Ok(format!("./{stripped}"))
}

pub fn relative_uri_to_path(project_path: &Path, uri: &str) -> DadixResult<PathBuf> {
    let normalized = normalize_relative_uri(uri)?;
    let stripped = normalized.strip_prefix("./").unwrap_or(normalized.as_str());
    Ok(project_dir(project_path)?.join(stripped))
}

/// If `target` is inside the project folder, return `./…`; otherwise `None`.
pub fn to_relative_uri(project_path: &Path, target: &Path) -> Option<String> {
    let base = project_dir(project_path).ok()?;
    let base = dunce_canonicalize(base).ok()?;
    let target = dunce_canonicalize(target).ok()?;
    let rel = target.strip_prefix(&base).ok()?;
    if rel.as_os_str().is_empty() {
        return None;
    }
    let uri = rel
        .components()
        .map(|c| c.as_os_str().to_string_lossy())
        .collect::<Vec<_>>()
        .join("/");
    normalize_relative_uri(&uri).ok()
}

fn dunce_canonicalize(path: &Path) -> std::io::Result<PathBuf> {
    let canonical = path.canonicalize()?;
    #[cfg(windows)]
    {
        let text = canonical.to_string_lossy();
        if let Some(stripped) = text.strip_prefix(r"\\?\") {
            return Ok(PathBuf::from(stripped));
        }
    }
    Ok(canonical)
}

/// Resolve a source URI against the current project file location.
pub fn resolve_source_path(project_path: &Path, source: &Source) -> DadixResult<ResolvedPath> {
    let uri = source
        .uri
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| {
            DadixError::new(
                ErrorCode::PathResolution,
                format!("source '{}' has no uri", source.name),
            )
        })?;

    match source.path_mode {
        PathMode::Absolute => {
            let path = PathBuf::from(uri);
            if !path.is_absolute() {
                return Err(DadixError::new(
                    ErrorCode::PathResolution,
                    "absolute source uri must be an absolute filesystem path",
                ));
            }
            Ok(ResolvedPath {
                mode: PathMode::Absolute,
                path,
            })
        }
        PathMode::Relative => Ok(ResolvedPath {
            mode: PathMode::Relative,
            path: relative_uri_to_path(project_path, uri)?,
        }),
        PathMode::Embedded => {
            if Path::new(uri).is_absolute() {
                return Err(DadixError::new(
                    ErrorCode::PathResolution,
                    "embedded source uri must not be absolute",
                ));
            }
            let name = normalize_relative_uri(uri)?
                .strip_prefix("./")
                .unwrap_or(uri)
                .to_string();
            Ok(ResolvedPath {
                mode: PathMode::Embedded,
                path: embedded_dir(project_path)?.join(name),
            })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::{Source, SourceKind};

    fn source(mode: PathMode, uri: &str) -> Source {
        Source {
            id: 1,
            name: "Kosten".into(),
            type_name: "csv".into(),
            kind: SourceKind::LinkedFile,
            path_mode: mode,
            uri: Some(uri.into()),
            options: None,
            credential: None,
            created_at: "2026-01-01T00:00:00Z".into(),
        }
    }

    #[test]
    fn stores_relative_uris_with_dot_slash() {
        assert_eq!(
            normalize_relative_uri("data/umsatz.csv").unwrap(),
            "./data/umsatz.csv"
        );
        assert_eq!(
            normalize_relative_uri("./data/umsatz.csv").unwrap(),
            "./data/umsatz.csv"
        );
        assert_eq!(
            normalize_relative_uri(r"data\umsatz.csv").unwrap(),
            "./data/umsatz.csv"
        );
        assert!(normalize_relative_uri("../secret.csv").is_err());
    }

    #[test]
    fn relative_follows_project_directory() {
        let project = Path::new("/old/folder/analyse.dadix");
        let resolved =
            resolve_source_path(project, &source(PathMode::Relative, "./data/umsatz.csv")).unwrap();
        assert_eq!(resolved.path, PathBuf::from("/old/folder/data/umsatz.csv"));

        let moved = Path::new("/new/place/analyse.dadix");
        let resolved =
            resolve_source_path(moved, &source(PathMode::Relative, "./data/umsatz.csv")).unwrap();
        assert_eq!(resolved.path, PathBuf::from("/new/place/data/umsatz.csv"));
    }

    #[test]
    fn embedded_lives_beside_the_project_file() {
        let project = Path::new("/data/Controlling.dadix");
        let resolved =
            resolve_source_path(project, &source(PathMode::Embedded, "kosten.csv")).unwrap();
        assert_eq!(
            resolved.path,
            PathBuf::from("/data/Controlling.dadix.d/kosten.csv")
        );
    }

    #[test]
    fn absolute_keeps_the_stored_uri() {
        let project = Path::new("/data/Controlling.dadix");
        let resolved =
            resolve_source_path(project, &source(PathMode::Absolute, "/abs/Kosten.csv")).unwrap();
        assert_eq!(resolved.path, PathBuf::from("/abs/Kosten.csv"));
    }
}
