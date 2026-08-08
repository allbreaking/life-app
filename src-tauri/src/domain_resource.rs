use rusqlite::{OptionalExtension, Transaction, params};
use serde_json::Value;

use crate::{db::SharedConnection, error::AppError};

const RESOURCES: &[(&str, &str, &str)] = &[
    ("compass.principles", "compass", "principles"),
    (
        "dashboard.completedTodoIndexes",
        "dashboard",
        "completedTodoIndexes",
    ),
    ("work.tasks", "work", "tasks"),
    ("work.focusIds", "work", "focusIds"),
    ("work.eodSubmitted", "work", "eodSubmitted"),
    ("schedule.pool", "schedule", "pool"),
    ("schedule.scheduled", "schedule", "scheduled"),
    ("schedule.lifeSchedules", "schedule", "lifeSchedules"),
    ("finance.budgetCents", "finance", "budgetCents"),
    ("finance.spentCents", "finance", "spentCents"),
    ("finance.pending", "finance", "pending"),
    ("finance.lastTransaction", "finance", "lastTransaction"),
    ("items.foods", "items", "foods"),
    ("items.items", "items", "items"),
    ("network.people", "network", "people"),
    ("trade.watchlist", "trade", "watchlist"),
    ("trade.positions", "trade", "positions"),
    ("trade.reviews", "trade", "reviews"),
    ("learning.domains", "learning", "domains"),
];
const MAX_VALUE_BYTES: usize = 256 * 1024;

pub struct DomainResourceService {
    connection: SharedConnection,
}

impl DomainResourceService {
    /// Creates the domain resource service. Side effects: none beyond taking ownership of the connection.
    pub fn new(connection: SharedConnection) -> Self {
        Self { connection }
    }

    /// Loads a normalized resource. Side effects: reads SQLite and may transactionally import one legacy module-state value once.
    pub fn load(&self, resource: &str) -> Result<Option<Value>, AppError> {
        let (_, module, state_key) = resource_address(resource)?;
        let mut connection = self.connection.lock().map_err(|_| AppError::Conflict)?;
        let transaction = connection.transaction()?;
        let migrated = transaction.query_row(
            "SELECT EXISTS(SELECT 1 FROM domain_resource_migration WHERE resource=?1)",
            [resource],
            |row| row.get::<_, bool>(0),
        )?;
        if !migrated {
            let legacy = transaction
                .query_row(
                    "SELECT value_json FROM module_state WHERE module=?1 AND state_key=?2",
                    params![module, state_key],
                    |row| row.get::<_, String>(0),
                )
                .optional()?;
            if let Some(raw) = legacy {
                let value: Value = serde_json::from_str(&raw).map_err(|_| AppError::Validation)?;
                write_resource(&transaction, resource, &value)?;
            }
            transaction.execute(
                "INSERT INTO domain_resource_migration(resource,migrated_at) VALUES (?1,strftime('%Y-%m-%dT%H:%M:%fZ','now'))",
                [resource],
            )?;
        }
        let value = read_resource(&transaction, resource)?;
        transaction.commit()?;
        Ok(value)
    }

    /// Replaces one normalized resource idempotently. Side effects: writes domain rows, a migration marker, timestamps, and a command receipt in one transaction.
    pub fn replace(&self, resource: &str, value: &Value, request_id: &str) -> Result<(), AppError> {
        resource_address(resource)?;
        if !valid_token(request_id, 100) {
            return Err(AppError::Validation);
        }
        let serialized = serde_json::to_string(value).map_err(|_| AppError::Validation)?;
        if serialized.len() > MAX_VALUE_BYTES {
            return Err(AppError::Validation);
        }
        let command = format!("replace_domain_resource:{resource}");
        let mut connection = self.connection.lock().map_err(|_| AppError::Conflict)?;
        let transaction = connection.transaction()?;
        let received = transaction
            .query_row(
                "SELECT command FROM command_receipt WHERE request_id=?1",
                [request_id],
                |row| row.get::<_, String>(0),
            )
            .optional()?;
        if let Some(received) = received {
            return if received == command {
                Ok(())
            } else {
                Err(AppError::Conflict)
            };
        }
        write_resource(&transaction, resource, value)?;
        transaction.execute(
            "INSERT OR IGNORE INTO domain_resource_migration(resource,migrated_at) VALUES (?1,strftime('%Y-%m-%dT%H:%M:%fZ','now'))",
            [resource],
        )?;
        transaction.execute(
            "INSERT INTO command_receipt(request_id,command,result_id,created_at) VALUES (?1,?2,NULL,strftime('%Y-%m-%dT%H:%M:%fZ','now'))",
            params![request_id, command],
        )?;
        transaction.commit()?;
        Ok(())
    }
}

fn resource_address(
    resource: &str,
) -> Result<(&'static str, &'static str, &'static str), AppError> {
    RESOURCES
        .iter()
        .copied()
        .find(|entry| entry.0 == resource)
        .ok_or(AppError::Validation)
}

fn write_resource(
    transaction: &Transaction<'_>,
    resource: &str,
    value: &Value,
) -> Result<(), AppError> {
    transaction.execute("DELETE FROM domain_entity WHERE resource=?1", [resource])?;
    transaction.execute("DELETE FROM domain_value WHERE resource=?1", [resource])?;
    if let Value::Array(values) = value {
        if values.is_empty() {
            transaction.execute(
                "INSERT INTO domain_value(resource,value_json,created_at,updated_at) VALUES (?1,'[]',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'))",
                [resource],
            )?;
            return Ok(());
        }
        for (position, item) in values.iter().enumerate() {
            let entity_id = item
                .get("id")
                .and_then(Value::as_str)
                .map(str::to_owned)
                .unwrap_or_else(|| format!("row-{position}"));
            if !valid_token(&entity_id, 100) {
                return Err(AppError::Validation);
            }
            transaction.execute(
                "INSERT INTO domain_entity(resource,entity_id,position,value_json,created_at,updated_at) VALUES (?1,?2,?3,?4,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'))",
                params![resource, entity_id, position as i64, serde_json::to_string(item).map_err(|_| AppError::Validation)?],
            )?;
        }
    } else {
        transaction.execute(
            "INSERT INTO domain_value(resource,value_json,created_at,updated_at) VALUES (?1,?2,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'))",
            params![resource, serde_json::to_string(value).map_err(|_| AppError::Validation)?],
        )?;
    }
    Ok(())
}

fn read_resource(transaction: &Transaction<'_>, resource: &str) -> Result<Option<Value>, AppError> {
    let scalar = transaction
        .query_row(
            "SELECT value_json FROM domain_value WHERE resource=?1",
            [resource],
            |row| row.get::<_, String>(0),
        )
        .optional()?;
    if let Some(raw) = scalar {
        return serde_json::from_str(&raw)
            .map(Some)
            .map_err(|_| AppError::Validation);
    }
    let mut statement = transaction
        .prepare("SELECT value_json FROM domain_entity WHERE resource=?1 ORDER BY position")?;
    let rows = statement.query_map([resource], |row| row.get::<_, String>(0))?;
    let mut values = Vec::new();
    for row in rows {
        values.push(serde_json::from_str(&row?).map_err(|_| AppError::Validation)?);
    }
    if values.is_empty() {
        return Ok(None);
    }
    Ok(Some(Value::Array(values)))
}

fn valid_token(value: &str, max: usize) -> bool {
    !value.is_empty()
        && value.len() <= max
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;
    use serde_json::json;

    fn service() -> DomainResourceService {
        DomainResourceService::new(db::open_shared(std::path::Path::new(":memory:")).unwrap())
    }

    #[test]
    fn stores_collections_scalars_and_empty_collections() {
        let service = service();
        assert_eq!(service.load("finance.budgetCents").unwrap(), None);
        service
            .replace("items.foods", &json!([{"id":"f1","name":"milk"}]), "r1")
            .unwrap();
        assert_eq!(
            service.load("items.foods").unwrap(),
            Some(json!([{"id":"f1","name":"milk"}]))
        );
        service.replace("items.foods", &json!([]), "r2").unwrap();
        assert_eq!(service.load("items.foods").unwrap(), Some(json!([])));
        service
            .replace("finance.budgetCents", &json!(300000), "r3")
            .unwrap();
        assert_eq!(
            service.load("finance.budgetCents").unwrap(),
            Some(json!(300000))
        );
    }

    #[test]
    fn imports_legacy_state_and_enforces_idempotency() {
        let service = service();
        {
            let connection = service.connection.lock().unwrap();
            connection.execute(
            "INSERT INTO module_state(module,state_key,value_json,created_at,updated_at) VALUES ('network','people','[{\"id\":\"p1\"}]','now','now')", [],
        ).unwrap();
        }
        assert_eq!(
            service.load("network.people").unwrap(),
            Some(json!([{"id":"p1"}]))
        );
        service
            .replace("network.people", &json!([]), "same")
            .unwrap();
        service
            .replace("network.people", &json!([]), "same")
            .unwrap();
        assert!(matches!(
            service.replace("items.items", &json!([]), "same"),
            Err(AppError::Conflict)
        ));
    }

    #[test]
    fn rejects_unknown_resource_and_oversized_payload() {
        let service = service();
        assert!(matches!(
            service.load("shell.anything"),
            Err(AppError::Validation)
        ));
        assert!(matches!(
            service.replace(
                "work.tasks",
                &Value::String("x".repeat(MAX_VALUE_BYTES)),
                "r1"
            ),
            Err(AppError::Validation)
        ));
    }
}
