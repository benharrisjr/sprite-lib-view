use serde::Serialize;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;
use walkdir::{DirEntry, WalkDir};

const IMAGE_EXTS: &[&str] = &["png", "jpg", "jpeg", "gif", "webp", "bmp"];

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpriteEntry {
    path: String,
    rel_path: String,
    name: String,
    folder: String,
    ext: String,
    size: u64,
    width: Option<u32>,
    height: Option<u32>,
    modified: Option<u64>,
}

fn is_hidden(entry: &DirEntry) -> bool {
    entry.depth() > 0
        && entry
            .file_name()
            .to_str()
            .is_some_and(|s| s.starts_with('.'))
}

fn to_entry(root: &Path, entry: &DirEntry) -> Option<SpriteEntry> {
    let path = entry.path();
    let ext = path.extension()?.to_str()?.to_ascii_lowercase();
    if !IMAGE_EXTS.contains(&ext.as_str()) {
        return None;
    }
    let meta = entry.metadata().ok()?;
    let rel = path.strip_prefix(root).unwrap_or(path);
    let folder = rel
        .parent()
        .map(|p| p.to_string_lossy().replace('\\', "/"))
        .unwrap_or_default();
    let dims = imagesize::size(path).ok();
    let modified = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64);

    Some(SpriteEntry {
        path: path.to_string_lossy().into_owned(),
        rel_path: rel.to_string_lossy().replace('\\', "/"),
        name: entry.file_name().to_string_lossy().into_owned(),
        folder,
        ext,
        size: meta.len(),
        width: dims.as_ref().map(|d| d.width as u32),
        height: dims.as_ref().map(|d| d.height as u32),
        modified,
    })
}

fn scan(root: &Path) -> Vec<SpriteEntry> {
    WalkDir::new(root)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| !is_hidden(e))
        .filter_map(Result::ok)
        .filter(|e| e.file_type().is_file())
        .filter_map(|e| to_entry(root, &e))
        .collect()
}

/// Recursively finds every image file under `root`.
#[tauri::command]
pub async fn scan_folder(root: String) -> Result<Vec<SpriteEntry>, String> {
    let root = PathBuf::from(root);
    if !root.is_dir() {
        return Err(format!("Not a folder: {}", root.display()));
    }
    tauri::async_runtime::spawn_blocking(move || scan(&root))
        .await
        .map_err(|e| e.to_string())
}

/// Returns raw file bytes so the viewer can draw to an untainted canvas
/// (required for reading pixel colors).
#[tauri::command]
pub async fn read_image_bytes(path: String) -> Result<tauri::ipc::Response, String> {
    let bytes = std::fs::read(&path).map_err(|e| format!("{path}: {e}"))?;
    Ok(tauri::ipc::Response::new(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn finds_images_recursively_and_skips_hidden_and_non_images() {
        let root = std::env::temp_dir().join(format!("slv-scan-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("a/b")).unwrap();
        fs::create_dir_all(root.join(".hidden")).unwrap();
        // 1x1 PNG header is enough for imagesize.
        let png = b"\x89PNG\r\n\x1a\n\0\0\0\rIHDR\0\0\0\x02\0\0\0\x03\x08\x06\0\0\0";
        fs::write(root.join("top.png"), png).unwrap();
        fs::write(root.join("a/b/deep.PNG"), png).unwrap();
        fs::write(root.join(".hidden/secret.png"), png).unwrap();
        fs::write(root.join("a/readme.txt"), "x").unwrap();

        let mut found = scan(&root);
        found.sort_by(|a, b| a.rel_path.cmp(&b.rel_path));
        let rels: Vec<_> = found.iter().map(|e| e.rel_path.as_str()).collect();
        assert_eq!(rels, ["a/b/deep.PNG", "top.png"]);
        assert_eq!(found[0].folder, "a/b");
        assert_eq!(found[0].ext, "png");
        assert_eq!((found[1].width, found[1].height), (Some(2), Some(3)));
        fs::remove_dir_all(&root).unwrap();
    }
}
