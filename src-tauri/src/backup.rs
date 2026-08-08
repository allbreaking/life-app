use std::{
    fs,
    path::{Path, PathBuf},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use rusqlite::{Connection, OpenFlags, backup::Backup};
use serde::Serialize;

use crate::{
    db::{LATEST_SCHEMA_VERSION, SharedConnection},
    error::AppError,
};

const MAX_BACKUP_BYTES: u64 = 512 * 1024 * 1024;

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    pub id: String,
    pub created_at: String,
    pub size_bytes: u64,
}

pub struct BackupService {
    connection: SharedConnection,
    directory: PathBuf,
}

impl BackupService {
    /// Creates a backup service restricted to one application-owned directory. Side effects: none.
    pub fn new(connection: SharedConnection, directory: PathBuf) -> Self {
        Self {
            connection,
            directory,
        }
    }

    /// Creates a consistent application-managed SQLite snapshot.
    /// Side effects: creates the backup directory and one SQLite file; removes partial output on failure.
    pub fn create(&self) -> Result<BackupInfo, AppError> {
        fs::create_dir_all(&self.directory).map_err(|_| AppError::Backup)?;
        let millis = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|_| AppError::Backup)?
            .as_millis();
        let id = format!("life-os-{millis}.sqlite3");
        let path = self.directory.join(&id);
        let result = (|| {
            let source = self.connection.lock().map_err(|_| AppError::Conflict)?;
            backup_connection(&source, &path)?;
            validate_database(&path)?;
            backup_info(&path, id)
        })();
        if result.is_err() {
            let _ = fs::remove_file(&path);
        }
        result
    }

    /// Lists validly named application-managed snapshots. Side effects: reads directory metadata.
    pub fn list(&self) -> Result<Vec<BackupInfo>, AppError> {
        if !self.directory.exists() {
            return Ok(Vec::new());
        }
        let mut backups = fs::read_dir(&self.directory)
            .map_err(|_| AppError::Backup)?
            .filter_map(Result::ok)
            .filter_map(|entry| {
                let id = entry.file_name().into_string().ok()?;
                if !valid_backup_id(&id) || entry.file_type().ok()?.is_symlink() {
                    return None;
                }
                backup_info(&entry.path(), id).ok()
            })
            .collect::<Vec<_>>();
        backups.sort_by(|left, right| right.created_at.cmp(&left.created_at));
        Ok(backups)
    }

    /// Restores one validated snapshot and rolls the live connection back if copying or verification fails.
    /// Side effects: reads a snapshot, creates/removes a rollback file, and may replace live SQLite contents.
    pub fn restore(&self, id: &str) -> Result<(), AppError> {
        if !valid_backup_id(id) {
            return Err(AppError::Validation);
        }
        let source_path = self.directory.join(id);
        reject_symlink(&source_path)?;
        validate_database(&source_path)?;
        fs::create_dir_all(&self.directory).map_err(|_| AppError::Backup)?;
        let rollback_path = self.directory.join(".restore-rollback.sqlite3");
        let mut live = self.connection.lock().map_err(|_| AppError::Conflict)?;
        backup_connection(&live, &rollback_path)?;
        let restore_result =
            restore_connection(&source_path, &mut live).and_then(|_| validate_connection(&live));
        if restore_result.is_err() {
            let rollback_result = restore_connection(&rollback_path, &mut live)
                .and_then(|_| validate_connection(&live));
            let _ = fs::remove_file(&rollback_path);
            let _ = rollback_result;
            return Err(AppError::Backup);
        }
        let _ = fs::remove_file(&rollback_path);
        Ok(())
    }
}

fn valid_backup_id(id: &str) -> bool {
    id.strip_prefix("life-os-")
        .and_then(|value| value.strip_suffix(".sqlite3"))
        .is_some_and(|digits| {
            (10..=20).contains(&digits.len()) && digits.bytes().all(|byte| byte.is_ascii_digit())
        })
}

fn reject_symlink(path: &Path) -> Result<(), AppError> {
    let metadata = fs::symlink_metadata(path).map_err(|_| AppError::Validation)?;
    if !metadata.is_file() || metadata.file_type().is_symlink() || metadata.len() > MAX_BACKUP_BYTES
    {
        return Err(AppError::Validation);
    }
    Ok(())
}

fn backup_connection(source: &Connection, path: &Path) -> Result<(), AppError> {
    let _ = fs::remove_file(path);
    let mut destination = Connection::open(path)?;
    Backup::new(source, &mut destination)?.run_to_completion(
        128,
        Duration::from_millis(1),
        None,
    )?;
    Ok(())
}

fn restore_connection(path: &Path, destination: &mut Connection) -> Result<(), AppError> {
    let source = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    Backup::new(&source, destination)?.run_to_completion(128, Duration::from_millis(1), None)?;
    destination.pragma_update(None, "foreign_keys", "ON")?;
    Ok(())
}

fn validate_database(path: &Path) -> Result<(), AppError> {
    reject_symlink(path)?;
    let connection = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|_| AppError::Validation)?;
    validate_connection(&connection)
}

fn validate_connection(connection: &Connection) -> Result<(), AppError> {
    let integrity = connection
        .pragma_query_value(None, "integrity_check", |row| row.get::<_, String>(0))
        .map_err(|_| AppError::Validation)?;
    let foreign_key_errors = connection
        .prepare("PRAGMA foreign_key_check")
        .and_then(|mut statement| statement.exists([]))
        .map_err(|_| AppError::Validation)?;
    let version = connection
        .query_row("SELECT MAX(version) FROM schema_migration", [], |row| {
            row.get::<_, Option<u32>>(0)
        })
        .map_err(|_| AppError::Validation)?;
    if integrity != "ok" || foreign_key_errors || version != Some(LATEST_SCHEMA_VERSION) {
        return Err(AppError::Validation);
    }
    Ok(())
}

fn backup_info(path: &Path, id: String) -> Result<BackupInfo, AppError> {
    let metadata = fs::metadata(path).map_err(|_| AppError::Backup)?;
    let created_at = id
        .strip_prefix("life-os-")
        .and_then(|value| value.strip_suffix(".sqlite3"))
        .ok_or(AppError::Validation)?
        .to_owned();
    Ok(BackupInfo {
        id,
        created_at,
        size_bytes: metadata.len(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;
    use std::sync::{Arc, Mutex};

    fn service() -> (BackupService, PathBuf) {
        let root = std::env::temp_dir().join(format!(
            "life-os-backup-test-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&root).unwrap();
        let connection = db::open(&root.join("live.sqlite3")).unwrap();
        (
            BackupService::new(Arc::new(Mutex::new(connection)), root.join("backups")),
            root,
        )
    }

    #[test]
    fn creates_lists_and_restores_a_consistent_snapshot() {
        let (service, root) = service();
        service.connection.lock().unwrap().execute("INSERT INTO domain_value(resource,value_json,created_at,updated_at) VALUES ('finance.budgetCents','100','x','x')", []).unwrap();
        let snapshot = service.create().unwrap();
        service
            .connection
            .lock()
            .unwrap()
            .execute(
                "UPDATE domain_value SET value_json='200' WHERE resource='finance.budgetCents'",
                [],
            )
            .unwrap();
        assert_eq!(service.list().unwrap(), vec![snapshot.clone()]);
        service.restore(&snapshot.id).unwrap();
        let value: String = service
            .connection
            .lock()
            .unwrap()
            .query_row(
                "SELECT value_json FROM domain_value WHERE resource='finance.budgetCents'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(value, "100");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_path_traversal_and_invalid_schema_before_restore() {
        let (service, root) = service();
        assert!(matches!(
            service.restore("../live.sqlite3"),
            Err(AppError::Validation)
        ));
        fs::create_dir_all(&service.directory).unwrap();
        let invalid = service.directory.join("life-os-1234567890.sqlite3");
        Connection::open(&invalid).unwrap();
        assert!(matches!(
            service.restore("life-os-1234567890.sqlite3"),
            Err(AppError::Validation)
        ));
        fs::remove_dir_all(root).unwrap();
    }
}
