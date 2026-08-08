mod backup;
mod commands;
mod db;
mod desktop_shell;
mod domain_resource;
mod error;
mod market_quote;
mod notification;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
/// Builds and runs the desktop shell. Side effects: creates windows and registers IPC handlers.
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            use tauri::Manager;
            let data_dir = app
                .path()
                .app_data_dir()
                .expect("application data directory is unavailable");
            std::fs::create_dir_all(&data_dir)
                .expect("failed to create application data directory");
            let database_path = data_dir.join("life-os.sqlite3");
            let connection =
                db::open_shared(&database_path).expect("failed to open Life-OS database");
            app.manage(domain_resource::DomainResourceService::new(
                connection.clone(),
            ));
            app.manage(notification::NotificationService::new(
                connection.clone(),
                notification::SystemNotificationAdapter::new(app.handle().clone()),
            ));
            app.manage(market_quote::MarketQuoteService::new()?);
            app.manage(backup::BackupService::new(
                connection,
                data_dir.join("backups"),
            ));
            desktop_shell::install(app)?;
            #[cfg(desktop)]
            desktop_shell::install_global_shortcut(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::health_check,
            commands::load_domain_resource,
            commands::replace_domain_resource,
            commands::deliver_notification,
            commands::create_backup,
            commands::list_backups,
            commands::restore_backup,
            commands::fetch_market_quotes,
            desktop_shell::sync_menu_bar_todo
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Life-OS");
}
