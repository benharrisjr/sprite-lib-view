mod clipboard;
mod export;
#[cfg(target_os = "macos")]
mod menu;
mod scan;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();

    #[cfg(target_os = "macos")]
    let builder = builder
        .menu(menu::build)
        .on_menu_event(|app, event| menu::handle_event(app, event.id().as_ref()));

    builder
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
