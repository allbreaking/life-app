use serde::Serialize;
use serde_json::Value;
use tauri::State;

use crate::{
    backup::{BackupInfo, BackupService},
    domain_resource::DomainResourceService,
    error::ErrorResponse,
    market_quote::{MarketQuote, MarketQuoteService},
    notification::{DeliveryStatus, NotificationInput, NotificationService},
};

/// Fetches validated A-share snapshots from the fixed Sina Finance adapter. Side effects: sends
/// one read-only HTTPS request to hq.sinajs.cn; does not write SQLite or expose generic networking.
#[tauri::command]
pub async fn fetch_market_quotes(
    codes: Vec<String>,
    service: State<'_, MarketQuoteService>,
) -> Result<Vec<MarketQuote>, ErrorResponse> {
    service.fetch(&codes).await.map_err(Into::into)
}

/// Creates one application-managed SQLite snapshot. Side effects: writes one file in app data.
#[tauri::command]
pub fn create_backup(service: State<'_, BackupService>) -> Result<BackupInfo, ErrorResponse> {
    service.create().map_err(Into::into)
}

/// Lists application-managed SQLite snapshots. Side effects: reads backup directory metadata.
#[tauri::command]
pub fn list_backups(service: State<'_, BackupService>) -> Result<Vec<BackupInfo>, ErrorResponse> {
    service.list().map_err(Into::into)
}

/// Restores one validated application-managed SQLite snapshot. Side effects: replaces live SQLite
/// contents after creating a rollback snapshot and rolls back on failure.
#[tauri::command]
pub fn restore_backup(id: String, service: State<'_, BackupService>) -> Result<(), ErrorResponse> {
    service.restore(&id).map_err(Into::into)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthStatus {
    status: &'static str,
    schema_version: u32,
}

/// Returns process health. Side effects: none.
#[tauri::command]
pub fn health_check() -> HealthStatus {
    HealthStatus {
        status: "ok",
        schema_version: crate::db::LATEST_SCHEMA_VERSION,
    }
}

/// Loads a validated module state value. Side effects: reads SQLite.
#[tauri::command]
pub fn load_domain_resource(
    resource: String,
    service: State<'_, DomainResourceService>,
) -> Result<Option<Value>, ErrorResponse> {
    service.load(&resource).map_err(Into::into)
}

/// Saves a validated module state value. Side effects: writes SQLite state and an idempotency receipt transactionally.
#[tauri::command]
pub fn replace_domain_resource(
    resource: String,
    value: Value,
    request_id: String,
    service: State<'_, DomainResourceService>,
) -> Result<(), ErrorResponse> {
    service
        .replace(&resource, &value, &request_id)
        .map_err(Into::into)
}

/// Delivers one validated, deduplicated system notification. Side effects: reads/writes the
/// SQLite delivery receipt and may display one OS notification through the configured adapter.
#[tauri::command]
pub fn deliver_notification(
    input: NotificationInput,
    service: State<'_, NotificationService>,
) -> Result<DeliveryStatus, ErrorResponse> {
    service.deliver(&input).map_err(Into::into)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn health_reports_current_schema() {
        let status = health_check();
        assert_eq!(status.status, "ok");
        assert_eq!(status.schema_version, crate::db::LATEST_SCHEMA_VERSION);
    }
}
