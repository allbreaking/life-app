use std::sync::{Arc, Mutex};

use rusqlite::Connection;

const MIGRATION_001: &str = include_str!("../migrations/001_initial.sql");
const MIGRATION_002: &str = include_str!("../migrations/002_module_state.sql");
const MIGRATION_003: &str = include_str!("../migrations/003_domain_resources.sql");
pub(crate) const LATEST_SCHEMA_VERSION: u32 = 3;
pub type SharedConnection = Arc<Mutex<Connection>>;

/// Opens the application database and applies forward-only migrations.
/// Side effects: opens/creates the SQLite file, enables foreign keys, and may mutate its schema.
pub fn open(path: &std::path::Path) -> rusqlite::Result<Connection> {
    let mut connection = Connection::open(path)?;
    connection.pragma_update(None, "foreign_keys", "ON")?;
    migrate(&mut connection)?;
    Ok(connection)
}

/// Opens the application database as the single shared connection used by desktop services.
/// Side effects: opens/creates the SQLite file, enables foreign keys, and may mutate its schema.
pub fn open_shared(path: &std::path::Path) -> rusqlite::Result<SharedConnection> {
    open(path).map(|connection| Arc::new(Mutex::new(connection)))
}

/// Applies schema migrations atomically. Side effects: writes SQLite schema and migration records.
fn migrate(connection: &mut Connection) -> rusqlite::Result<()> {
    let transaction = connection.transaction()?;
    transaction.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_migration (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);",
    )?;
    for (version, sql) in [(1, MIGRATION_001), (2, MIGRATION_002), (3, MIGRATION_003)] {
        let applied = transaction.query_row(
            "SELECT EXISTS(SELECT 1 FROM schema_migration WHERE version = ?1)",
            [version],
            |row| row.get::<_, bool>(0),
        )?;
        if !applied {
            transaction.execute_batch(sql)?;
            transaction.execute(
                "INSERT INTO schema_migration(version, applied_at) VALUES (?1, strftime('%Y-%m-%dT%H:%M:%fZ','now'))",
                [version],
            )?;
        }
    }
    transaction.commit()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migration_enables_foreign_keys_and_is_idempotent() {
        let mut connection = Connection::open_in_memory().unwrap();
        connection
            .pragma_update(None, "foreign_keys", "ON")
            .unwrap();
        migrate(&mut connection).unwrap();
        migrate(&mut connection).unwrap();
        assert_eq!(
            connection
                .pragma_query_value(None, "foreign_keys", |row| row.get::<_, i64>(0))
                .unwrap(),
            1
        );
        assert_eq!(
            connection
                .query_row("SELECT COUNT(*) FROM schema_migration", [], |row| row
                    .get::<_, i64>(0))
                .unwrap(),
            i64::from(LATEST_SCHEMA_VERSION)
        );
    }

    #[test]
    fn database_rejects_orphan_position_and_invalid_food() {
        let connection = Connection::open_in_memory().unwrap();
        connection
            .pragma_update(None, "foreign_keys", "ON")
            .unwrap();
        connection.execute_batch(MIGRATION_001).unwrap();
        assert!(connection.execute("INSERT INTO position(id, watchlist_id, quantity, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?4)", ("p1", "missing", 1, "2026-08-01T00:00:00Z")).is_err());
        assert!(connection.execute("INSERT INTO item(id, name, type, location, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?5)", ("i1", "牛奶", "food", "冰箱", "2026-08-01T00:00:00Z")).is_err());
    }
}
