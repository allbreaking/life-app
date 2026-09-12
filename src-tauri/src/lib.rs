mod agent_bridge;
mod agent_mcp;
mod backup;
mod commands;
mod db;
mod desktop_shell;
mod domain_resource;
mod error;
mod market_quote;
mod notification;
mod trade_watch;

/// Runs the bundled MCP stdio adapter. Side effects: reads/writes stdio and connects to the fixed
/// Life-OS Unix socket; it does not open the application database or a TCP listener.
pub fn run_agent_mcp() -> Result<(), String> {
    agent_mcp::run()
}

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
            let market_quotes = market_quote::MarketQuoteService::new()?;
            let trade_watch = std::sync::Arc::new(trade_watch::TradeWatchService::new(
                connection.clone(),
                market_quotes.clone(),
            ));
            app.manage(market_quotes);
            app.manage(trade_watch.clone());
            app.manage(backup::BackupService::new(
                connection,
                data_dir.join("backups"),
            ));
            desktop_shell::install(app)?;
            #[cfg(desktop)]
            desktop_shell::install_global_shortcut(app)?;
            if let Err(error) = agent_bridge::start(&data_dir, trade_watch, app.handle().clone()) {
                eprintln!("Life-OS agent bridge unavailable: {error}");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::health_check,
            commands::load_domain_resource,
            commands::replace_domain_resource,
            commands::add_trade_watch,
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
