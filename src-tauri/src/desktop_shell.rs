use serde::Serialize;
use tauri::menu::{Menu, MenuBuilder, MenuItem, SubmenuBuilder};
#[cfg(target_os = "macos")]
use tauri::tray::TrayIconBuilder;
use tauri::{Emitter, Manager};
#[cfg(desktop)]
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

const OPEN_CAPTURE_ID: &str = "open-quick-capture";
const SHOW_DASHBOARD_ID: &str = "show-dashboard";

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
enum DesktopAction {
    OpenQuickCapture,
    ShowDashboard,
}

fn action_for_menu_id(id: &str) -> Option<DesktopAction> {
    match id {
        OPEN_CAPTURE_ID => Some(DesktopAction::OpenQuickCapture),
        SHOW_DASHBOARD_ID => Some(DesktopAction::ShowDashboard),
        _ => None,
    }
}

#[cfg(desktop)]
fn capture_shortcut() -> Shortcut {
    Shortcut::new(Some(Modifiers::ALT), Code::Space)
}

#[cfg(desktop)]
fn action_for_shortcut(shortcut: &Shortcut, state: ShortcutState) -> Option<DesktopAction> {
    (shortcut == &capture_shortcut() && state == ShortcutState::Pressed)
        .then_some(DesktopAction::OpenQuickCapture)
}

/// Shows and focuses the main window, then emits one validated desktop action.
/// Side effects: may change main-window visibility/focus and emits `desktop-action`.
fn emit_action(app: &tauri::AppHandle, action: DesktopAction) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
    let _ = app.emit("desktop-action", action);
}

/// Installs the native application menu.
/// Side effects: replaces the application menu, exposes system edit actions that may mutate the
/// focused text control/system clipboard, and registers a menu-event listener that may
/// show/focus the main window and emit a validated `desktop-action` event. On macOS it also
/// creates a status item with quick-access menu entries for quick capture and the dashboard.
pub fn install(app: &mut tauri::App) -> tauri::Result<()> {
    let app_menu = SubmenuBuilder::new(app, "Life-OS")
        .text(OPEN_CAPTURE_ID, "打开快捷录入")
        .text(SHOW_DASHBOARD_ID, "回到今日总览")
        .separator()
        .quit()
        .build()?;
    let edit_menu = SubmenuBuilder::new(app, "编辑")
        .undo_with_text("撤销")
        .redo_with_text("重做")
        .separator()
        .cut_with_text("剪切")
        .copy_with_text("复制")
        .paste_with_text("粘贴")
        .select_all_with_text("全选")
        .build()?;
    let menu = MenuBuilder::new(app)
        .item(&app_menu)
        .item(&edit_menu)
        .build()?;
    app.set_menu(menu)?;
    #[cfg(target_os = "macos")]
    {
        let open_capture =
            MenuItem::with_id(app, OPEN_CAPTURE_ID, "打开快捷录入", true, None::<&str>)?;
        let show_dashboard =
            MenuItem::with_id(app, SHOW_DASHBOARD_ID, "回到今日总览", true, None::<&str>)?;
        let tray_menu = Menu::with_items(app, &[&open_capture, &show_dashboard])?;
        TrayIconBuilder::with_id("life-os")
            .title("Life-OS")
            .tooltip("Life-OS")
            .menu(&tray_menu)
            .build(app)?;
    }
    app.on_menu_event(move |app, event| {
        let Some(action) = action_for_menu_id(event.id().as_ref()) else {
            return;
        };
        emit_action(app, action);
    });
    Ok(())
}

/// Installs the process-wide Alt+Space shortcut.
/// Side effects: loads the global-shortcut plugin and attempts an OS-level registration. A
/// successful press may show/focus the main window and emit `desktop-action`. Registration
/// failure is logged and deliberately does not abort startup.
#[cfg(desktop)]
pub fn install_global_shortcut(app: &mut tauri::App) -> tauri::Result<()> {
    let shortcut = capture_shortcut();
    app.handle().plugin(
        tauri_plugin_global_shortcut::Builder::new()
            .with_handler(|app, shortcut, event| {
                if let Some(action) = action_for_shortcut(shortcut, event.state()) {
                    emit_action(app, action);
                }
            })
            .build(),
    )?;

    if let Err(error) = app.global_shortcut().register(shortcut) {
        eprintln!("global Alt+Space shortcut unavailable: {error}");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_only_whitelisted_menu_ids() {
        assert_eq!(
            action_for_menu_id(OPEN_CAPTURE_ID),
            Some(DesktopAction::OpenQuickCapture)
        );
        assert_eq!(
            action_for_menu_id(SHOW_DASHBOARD_ID),
            Some(DesktopAction::ShowDashboard)
        );
        assert_eq!(action_for_menu_id("arbitrary-user-input"), None);
    }

    #[cfg(desktop)]
    #[test]
    fn maps_only_pressed_alt_space_to_capture() {
        assert_eq!(
            action_for_shortcut(&capture_shortcut(), ShortcutState::Pressed),
            Some(DesktopAction::OpenQuickCapture)
        );
        assert_eq!(
            action_for_shortcut(&capture_shortcut(), ShortcutState::Released),
            None
        );
        let other = Shortcut::new(Some(Modifiers::ALT), Code::KeyA);
        assert_eq!(action_for_shortcut(&other, ShortcutState::Pressed), None);
    }
}
