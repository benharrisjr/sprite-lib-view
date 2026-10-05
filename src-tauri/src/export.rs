use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Serialize)]
pub struct ExportResult {
    copied: usize,
    errors: Vec<String>,
}

/// Returns `path`, or `name (1).ext`, `name (2).ext`, ... if it already exists.
fn unique_path(path: PathBuf) -> PathBuf {
    if !path.exists() {
        return path;
    }
    let stem = path.file_stem().unwrap_or_default().to_string_lossy().into_owned();
    let ext = path
        .extension()
        .map(|e| format!(".{}", e.to_string_lossy()))
        .unwrap_or_default();
    let parent = path.parent().map(Path::to_path_buf).unwrap_or_default();
    (1..)
        .map(|n| parent.join(format!("{stem} ({n}){ext}")))
        .find(|p| !p.exists())
        .expect("unbounded range always yields a free name")
}

fn export_one(src: &Path, dest: &Path, root: Option<&Path>) -> Result<(), String> {
    let target_dir = match root.and_then(|r| src.parent()?.strip_prefix(r).ok()) {
        Some(rel) => dest.join(rel),
        None => dest.to_path_buf(),
    };
    fs::create_dir_all(&target_dir).map_err(|e| e.to_string())?;
    let file_name = src.file_name().ok_or("missing file name")?;
    fs::copy(src, unique_path(target_dir.join(file_name))).map_err(|e| e.to_string())?;
    Ok(())
}

/// Copies files into `dest`. When `root` is given, the folder structure
/// relative to it is recreated inside `dest`.
#[tauri::command]
pub async fn export_files(
    paths: Vec<String>,
    dest: String,
    root: Option<String>,
) -> Result<ExportResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let dest = PathBuf::from(dest);
        let root = root.map(PathBuf::from);
        let mut result = ExportResult { copied: 0, errors: Vec::new() };
        for p in &paths {
            match export_one(Path::new(p), &dest, root.as_deref()) {
                Ok(()) => result.copied += 1,
                Err(e) => result.errors.push(format!("{p}: {e}")),
            }
        }
        result
    })
    .await
    .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exports_with_collision_suffix_and_optional_structure() {
        let base = std::env::temp_dir().join(format!("slv-export-{}", std::process::id()));
        let _ = fs::remove_dir_all(&base);
        let root = base.join("src");
        let dest = base.join("dest");
        fs::create_dir_all(root.join("sub")).unwrap();
        fs::write(root.join("sub/a.png"), "1").unwrap();

        let src = root.join("sub/a.png");
        export_one(&src, &dest, None).unwrap();
        export_one(&src, &dest, None).unwrap();
        export_one(&src, &dest, Some(&root)).unwrap();

        assert!(dest.join("a.png").exists());
        assert!(dest.join("a (1).png").exists());
        assert!(dest.join("sub/a.png").exists());
        fs::remove_dir_all(&base).unwrap();
    }
}
