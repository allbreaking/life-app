use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("输入无效")]
    Validation,
    #[error("数据发生冲突")]
    Conflict,
    #[error("本地存储暂时不可用")]
    Storage(#[from] rusqlite::Error),
    #[error("系统通知暂时不可用")]
    ExternalService,
    #[error("备份或恢复操作失败")]
    Backup,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ErrorResponse {
    pub code: &'static str,
    pub message: String,
}

impl From<AppError> for ErrorResponse {
    fn from(value: AppError) -> Self {
        let code = match value {
            AppError::Validation => "VALIDATION_ERROR",
            AppError::Conflict => "CONFLICT",
            AppError::Storage(_) => "STORAGE_ERROR",
            AppError::ExternalService => "EXTERNAL_SERVICE_ERROR",
            AppError::Backup => "BACKUP_ERROR",
        };
        Self {
            code,
            message: value.to_string(),
        }
    }
}

impl From<rusqlite::Error> for ErrorResponse {
    fn from(value: rusqlite::Error) -> Self {
        AppError::Storage(value).into()
    }
}
