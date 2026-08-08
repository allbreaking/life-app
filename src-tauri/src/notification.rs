use rusqlite::{OptionalExtension, params};
use serde::{Deserialize, Serialize};
use tauri_plugin_notification::NotificationExt;

use crate::{db::SharedConnection, error::AppError};

const ALERT_TYPES: &[&str] = &[
    "food-expiry",
    "budget-limit",
    "subscription-due",
    "watch-target",
    "watch-safety",
    "important-date",
    "next-event",
];

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NotificationInput {
    pub entity_id: String,
    pub alert_type: String,
    pub occurrence_at: String,
    pub title: String,
    pub body: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum DeliveryStatus {
    Delivered,
    Duplicate,
}

pub trait NotificationAdapter: Send + Sync {
    /// Displays one OS notification. Side effects: invokes the platform notification service.
    fn show(&self, title: &str, body: &str) -> Result<(), ()>;
}

pub struct SystemNotificationAdapter {
    app: tauri::AppHandle,
}

impl SystemNotificationAdapter {
    /// Creates an adapter bound to the current desktop app. Side effects: none.
    pub fn new(app: tauri::AppHandle) -> Self {
        Self { app }
    }
}

impl NotificationAdapter for SystemNotificationAdapter {
    fn show(&self, title: &str, body: &str) -> Result<(), ()> {
        self.app
            .notification()
            .builder()
            .title(title)
            .body(body)
            .show()
            .map_err(|_| ())
    }
}

pub struct NotificationService {
    connection: SharedConnection,
    adapter: Box<dyn NotificationAdapter>,
}

impl NotificationService {
    /// Creates a notification service. Side effects: none beyond taking ownership of its adapter
    /// and SQLite connection.
    pub fn new(connection: SharedConnection, adapter: impl NotificationAdapter + 'static) -> Self {
        Self {
            connection,
            adapter: Box::new(adapter),
        }
    }

    /// Delivers a validated notification at most once after a successful receipt.
    /// Side effects: reads/writes SQLite and may invoke the configured OS notification adapter.
    pub fn deliver(&self, input: &NotificationInput) -> Result<DeliveryStatus, AppError> {
        validate(input)?;
        let connection = self.connection.lock().map_err(|_| AppError::Conflict)?;
        connection.execute(
            "INSERT OR IGNORE INTO notification_delivery(id,entity_id,alert_type,occurrence_at,delivered_at) VALUES (lower(hex(randomblob(16))),?1,?2,?3,NULL)",
            params![input.entity_id, input.alert_type, input.occurrence_at],
        )?;
        let delivered_at = connection
            .query_row(
                "SELECT delivered_at FROM notification_delivery WHERE entity_id=?1 AND alert_type=?2 AND occurrence_at=?3",
                params![input.entity_id, input.alert_type, input.occurrence_at],
                |row| row.get::<_, Option<String>>(0),
            )
            .optional()?
            .flatten();
        if delivered_at.is_some() {
            return Ok(DeliveryStatus::Duplicate);
        }

        self.adapter
            .show(&input.title, &input.body)
            .map_err(|_| AppError::ExternalService)?;
        connection.execute(
            "UPDATE notification_delivery SET delivered_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE entity_id=?1 AND alert_type=?2 AND occurrence_at=?3",
            params![input.entity_id, input.alert_type, input.occurrence_at],
        )?;
        Ok(DeliveryStatus::Delivered)
    }
}

fn validate(input: &NotificationInput) -> Result<(), AppError> {
    if !valid_token(&input.entity_id, 100)
        || !ALERT_TYPES.contains(&input.alert_type.as_str())
        || !valid_utc_timestamp(&input.occurrence_at)
        || !valid_text(&input.title, 100)
        || !valid_text(&input.body, 500)
    {
        return Err(AppError::Validation);
    }
    Ok(())
}

fn valid_token(value: &str, max: usize) -> bool {
    !value.is_empty()
        && value.len() <= max
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
}

fn valid_text(value: &str, max: usize) -> bool {
    let trimmed = value.trim();
    !trimmed.is_empty()
        && trimmed.chars().count() <= max
        && !value.chars().any(|character| character.is_control())
}

fn valid_utc_timestamp(value: &str) -> bool {
    let bytes = value.as_bytes();
    if !matches!(bytes.len(), 20 | 24) || bytes.last() != Some(&b'Z') {
        return false;
    }
    let separators = [(4, b'-'), (7, b'-'), (10, b'T'), (13, b':'), (16, b':')];
    if separators
        .iter()
        .any(|(index, expected)| bytes.get(*index) != Some(expected))
    {
        return false;
    }
    if bytes.len() == 24 && bytes.get(19) != Some(&b'.') {
        return false;
    }
    bytes.iter().enumerate().all(|(index, byte)| {
        matches!(index, 4 | 7 | 10 | 13 | 16 | 19 | 23) || byte.is_ascii_digit()
    })
}

#[cfg(test)]
mod tests {
    use std::sync::{
        Arc,
        atomic::{AtomicBool, AtomicUsize, Ordering},
    };

    use super::*;
    use rusqlite::Connection;

    #[derive(Clone)]
    struct FakeAdapter {
        calls: Arc<AtomicUsize>,
        fail: Arc<AtomicBool>,
    }

    impl NotificationAdapter for FakeAdapter {
        fn show(&self, _title: &str, _body: &str) -> Result<(), ()> {
            self.calls.fetch_add(1, Ordering::SeqCst);
            if self.fail.load(Ordering::SeqCst) {
                Err(())
            } else {
                Ok(())
            }
        }
    }

    fn service(fail: bool) -> (NotificationService, Arc<AtomicUsize>, Arc<AtomicBool>) {
        let connection = Connection::open_in_memory().unwrap();
        connection.execute_batch("CREATE TABLE notification_delivery (id TEXT PRIMARY KEY, entity_id TEXT NOT NULL, alert_type TEXT NOT NULL, occurrence_at TEXT NOT NULL, delivered_at TEXT, UNIQUE(entity_id, alert_type, occurrence_at));").unwrap();
        let calls = Arc::new(AtomicUsize::new(0));
        let failure = Arc::new(AtomicBool::new(fail));
        let adapter = FakeAdapter {
            calls: calls.clone(),
            fail: failure.clone(),
        };
        (
            NotificationService::new(Arc::new(std::sync::Mutex::new(connection)), adapter),
            calls,
            failure,
        )
    }

    fn input(occurrence_at: &str) -> NotificationInput {
        NotificationInput {
            entity_id: "food-1".into(),
            alert_type: "food-expiry".into(),
            occurrence_at: occurrence_at.into(),
            title: "食物即将到期".into(),
            body: "冰箱中的牛奶将在 3 天内到期".into(),
        }
    }

    #[test]
    fn rejects_invalid_inputs_before_calling_adapter() {
        let (service, calls, _) = service(false);
        let mut invalid = input("2026-08-08T08:00:00Z");
        invalid.alert_type = "arbitrary".into();
        assert!(matches!(
            service.deliver(&invalid),
            Err(AppError::Validation)
        ));
        invalid.alert_type = "food-expiry".into();
        invalid.title = "bad\ntext".into();
        assert!(matches!(
            service.deliver(&invalid),
            Err(AppError::Validation)
        ));
        assert_eq!(calls.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn deduplicates_success_and_allows_distinct_occurrences() {
        let (service, calls, _) = service(false);
        let first = input("2026-08-08T08:00:00Z");
        assert_eq!(service.deliver(&first).unwrap(), DeliveryStatus::Delivered);
        assert_eq!(service.deliver(&first).unwrap(), DeliveryStatus::Duplicate);
        assert_eq!(
            service.deliver(&input("2026-08-09T08:00:00Z")).unwrap(),
            DeliveryStatus::Delivered
        );
        assert_eq!(calls.load(Ordering::SeqCst), 2);
    }

    #[test]
    fn retries_a_failed_delivery() {
        let (service, calls, failure) = service(true);
        let notification = input("2026-08-08T08:00:00.000Z");
        assert!(matches!(
            service.deliver(&notification),
            Err(AppError::ExternalService)
        ));
        failure.store(false, Ordering::SeqCst);
        assert_eq!(
            service.deliver(&notification).unwrap(),
            DeliveryStatus::Delivered
        );
        assert_eq!(calls.load(Ordering::SeqCst), 2);
    }
}
