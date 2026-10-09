use tauri::menu::{Menu, MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Runtime};

const COMMANDS: &[&str] = &["new_tab", "open_folder", "close_tab"];

/// macOS menu. It replaces the default one so that Cmd+W closes a tab
/// instead of the window. Selections are forwarded to the frontend as
/// `menu` events.
pub fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let app_menu = SubmenuBuilder::new(app, "Sprite Library Viewer")
        .about(None)
        .separator()
        .services()
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .quit()
        .build()?;

    let file = SubmenuBuilder::new(app, "File")
        .item(&MenuItemBuilder::with_id("new_tab", "New Tab").accelerator("CmdOrCtrl+T").build(app)?)
        .item(
            &MenuItemBuilder::with_id("open_folder", "Open Folder…")
                .accelerator("CmdOrCtrl+O")
                .build(app)?,
        )
        .separator()
        .item(&MenuItemBuilder::with_id("close_tab", "Close Tab").accelerator("CmdOrCtrl+W").build(app)?)
        .build()?;

    let edit = SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;

    let window = SubmenuBuilder::new(app, "Window")
        .minimize()
        .maximize()
        .fullscreen()
        .build()?;

    MenuBuilder::new(app).items(&[&app_menu, &file, &edit, &window]).build()
}

pub fn handle_event<R: Runtime>(app: &AppHandle<R>, id: &str) {
    if COMMANDS.contains(&id) {
        let _ = app.emit("menu", id);
    }
}
