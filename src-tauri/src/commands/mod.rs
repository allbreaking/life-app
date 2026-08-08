use serde::Serialize;
use serde_json::Value;
use tauri::State;

use crate::{
    backup::{BackupInfo, BackupService},
    domain_resource::DomainResourceService,
    error::ErrorResponse,
    notification::{DeliveryStatus, NotificationInput, NotificationService},
};

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
