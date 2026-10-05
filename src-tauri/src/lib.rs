mod clipboard;
mod export;
mod scan;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(clipboard::ClipboardWorker::spawn())
        .invoke_handler(tauri::generate_handler![
            scan::scan_folder,
            scan::read_image_bytes,
            clipboard::copy_image,
            clipboard::copy_files,
            clipboard::copy_text,
            export::export_files,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
