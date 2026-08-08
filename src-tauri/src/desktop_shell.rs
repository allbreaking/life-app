use serde::{Deserialize, Serialize};
use tauri::menu::{Menu, MenuBuilder, MenuItem, SubmenuBuilder};
use tauri::{Emitter, Manager, State};
#[cfg(target_os = "macos")]
use tauri::tray::TrayIconBuilder;
use std::sync::Mutex;
#[cfg(desktop)]
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

const OPEN_CAPTURE_ID: &str = "open-quick-capture";
const SHOW_DASHBOARD_ID: &str = "show-dashboard";
const COMPLETE_NEXT_TODO_ID: &str = "complete-next-todo";
const ALL_DONE_SHORT_TITLE: &str = "✓ 今日完成";

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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MenuBarTodoInput { id: String, time: String, title: String }

pub struct MenuBarTodoState {
    current_id: Mutex<Option<String>>,
    #[cfg(target_os = "macos")]
    tray: tauri::tray::TrayIcon,
    #[cfg(target_os = "macos")]
    detail_item: MenuItem<tauri::Wry>,
    #[cfg(target_os = "macos")]
    complete_item: MenuItem<tauri::Wry>,
}

fn validate_menu_todo(todo: &MenuBarTodoInput) -> bool {
    let time = todo.time.as_bytes();
    !todo.id.is_empty() && todo.id.len() <= 100
        && todo.id.chars().all(|c| c.is_ascii_alphanumeric() || ".:_-".contains(c))
        && time.len() == 5 && time[0].is_ascii_digit() && time[1].is_ascii_digit()
        && time[2] == b':' && time[3].is_ascii_digit() && time[4].is_ascii_digit()
        && (time[0] - b'0') * 10 + time[1] - b'0' < 24
        && (time[3] - b'0') * 10 + time[4] - b'0' < 60
        && !todo.title.trim().is_empty() && todo.title.chars().count() <= 200
        && !todo.title.chars().any(char::is_control)
}

/** Updates the transient macOS menu-bar projection. Side effects: changes native menu UI only. */
#[tauri::command]
pub fn sync_menu_bar_todo(todo: Option<MenuBarTodoInput>, state: State<'_, MenuBarTodoState>) -> Result<(), String> {
    if todo.as_ref().is_some_and(|value| !validate_menu_todo(value)) { return Err("invalid menu bar todo".into()); }
    *state.current_id.lock().map_err(|_| "menu bar state unavailable")? = todo.as_ref().map(|value| value.id.clone());
    #[cfg(target_os = "macos")]
    if let Some(todo) = todo {
        let short_title: String = todo.title.chars().take(6).collect();
        state.tray.set_title(Some(format!("□ {} {}", todo.time, short_title))).map_err(|e| e.to_string())?;
        state.detail_item.set_text(format!("{} {}", todo.time, todo.title)).map_err(|e| e.to_string())?;
        state.complete_item.set_text("标记完成").map_err(|e| e.to_string())?;
        state.complete_item.set_enabled(true).map_err(|e| e.to_string())?;
    } else {
        #[cfg(target_os = "macos")]
        {
            state.tray.set_title(Some(ALL_DONE_SHORT_TITLE)).map_err(|e| e.to_string())?;
            state.detail_item.set_text("今日待办已完成").map_err(|e| e.to_string())?;
            state.complete_item.set_text("已完成").map_err(|e| e.to_string())?;
            state.complete_item.set_enabled(false).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
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
/// creates a short-title status item whose menu exposes the full todo and a completion action.
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
    let (tray, detail_item, complete_item) = {
        let detail_item = MenuItem::with_id(app, "next-todo-detail", "正在加载今日日程…", false, None::<&str>)?;
        let complete_item = MenuItem::with_id(app, COMPLETE_NEXT_TODO_ID, "标记完成", false, None::<&str>)?;
        let tray_menu = Menu::with_items(app, &[&detail_item, &complete_item])?;
        let tray = TrayIconBuilder::with_id("next-todo")
        .title("Life-OS")
        .tooltip("Life-OS 下一待办")
        .menu(&tray_menu)
        .build(app)?;
        (tray, detail_item, complete_item)
    };
    #[cfg(target_os = "macos")]
    app.manage(MenuBarTodoState { current_id: Mutex::new(None), tray, detail_item, complete_item });
    #[cfg(not(target_os = "macos"))]
    app.manage(MenuBarTodoState { current_id: Mutex::new(None) });
    app.on_menu_event(move |app, event| {
        if event.id().as_ref() == COMPLETE_NEXT_TODO_ID {
            let state = app.state::<MenuBarTodoState>();
            let task_id = state.current_id.lock().ok().and_then(|value| value.clone());
            if let Some(task_id) = task_id {
                if let Some(window) = app.get_webview_window("main") { let _ = window.show(); let _ = window.set_focus(); }
                let _ = app.emit("menu-todo-complete", task_id);
            }
            return;
        }
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
        assert_eq!(action_for_menu_id(COMPLETE_NEXT_TODO_ID), None);
        assert_eq!(action_for_menu_id("arbitrary-user-input"), None);
    }

    #[test]
    fn exposes_the_next_todo_as_the_menu_bar_title() {
        assert_eq!(ALL_DONE_SHORT_TITLE, "✓ 今日完成");
        assert!(validate_menu_todo(&MenuBarTodoInput { id: "task-1".into(), time: "14:00".into(), title: "项目周例会".into() }));
        assert!(!validate_menu_todo(&MenuBarTodoInput { id: "../bad".into(), time: "29:00".into(), title: "".into() }));
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
