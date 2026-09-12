use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::Arc,
};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

use crate::{
    error::ErrorResponse,
    trade_watch::{AddTradeWatchInput, TradeWatch, TradeWatchService},
};

pub const MAX_AGENT_MESSAGE_BYTES: usize = 64 * 1024;
pub const SOCKET_NAME: &str = "agent-v1.sock";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct AgentBridgeRequest {
    version: u8,
    action: String,
    input: AddTradeWatchInput,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AgentBridgeResponse {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub watch: Option<TradeWatch>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<AgentBridgeError>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AgentBridgeError {
    pub code: String,
    pub message: String,
}

impl AgentBridgeResponse {
    fn success(watch: TradeWatch) -> Self {
        Self {
            watch: Some(watch),
            error: None,
        }
    }

    fn error(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            watch: None,
            error: Some(AgentBridgeError {
                code: code.into(),
                message: message.into(),
            }),
        }
    }
}

pub fn socket_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join(SOCKET_NAME)
}

/// Starts the same-user Unix socket bridge. Side effects: validates/removes only a stale socket,
/// binds one fixed filesystem socket with mode 0600, starts a listener thread, invokes the trade
/// service for valid requests, and emits successful entities to the Tauri window.
#[cfg(unix)]
pub fn start(
    app_data_dir: &Path,
    service: Arc<TradeWatchService>,
    app_handle: AppHandle,
) -> std::io::Result<()> {
    use std::os::unix::{fs::PermissionsExt, net::UnixListener};

    let path = socket_path(app_data_dir);
    prepare_socket_path(&path)?;
    let listener = UnixListener::bind(&path)?;
    fs::set_permissions(&path, fs::Permissions::from_mode(0o600))?;
    std::thread::Builder::new()
        .name("life-os-agent-bridge".into())
        .spawn(move || {
            for connection in listener.incoming() {
                let Ok(mut stream) = connection else { continue };
                let mut bytes = Vec::new();
                let response = match std::io::Read::by_ref(&mut stream)
                    .take((MAX_AGENT_MESSAGE_BYTES + 1) as u64)
                    .read_to_end(&mut bytes)
                {
                    Ok(_) if bytes.len() <= MAX_AGENT_MESSAGE_BYTES => {
                        handle(&bytes, &service, &app_handle)
                    }
                    Ok(_) => {
                        AgentBridgeResponse::error("MESSAGE_TOO_LARGE", "agent 请求超过 64 KiB")
                    }
                    Err(_) => AgentBridgeResponse::error("IO_ERROR", "读取 agent 请求失败"),
                };
                if let Ok(payload) = serde_json::to_vec(&response) {
                    let _ = stream.write_all(&payload);
                }
            }
        })?;
    Ok(())
}

#[cfg(unix)]
fn prepare_socket_path(path: &Path) -> std::io::Result<()> {
    use std::os::unix::{fs::FileTypeExt, net::UnixStream};

    if let Ok(metadata) = fs::symlink_metadata(path) {
        if !metadata.file_type().is_socket() {
            return Err(std::io::Error::new(
                std::io::ErrorKind::AlreadyExists,
                "agent socket path exists and is not a socket",
            ));
        }
        if UnixStream::connect(path).is_ok() {
            return Err(std::io::Error::new(
                std::io::ErrorKind::AddrInUse,
                "another Life-OS agent bridge is already active",
            ));
        }
        fs::remove_file(path)?;
    }
    Ok(())
}

#[cfg(unix)]
fn handle(
    bytes: &[u8],
    service: &TradeWatchService,
    app_handle: &AppHandle,
) -> AgentBridgeResponse {
    let request: AgentBridgeRequest = match serde_json::from_slice(bytes) {
        Ok(request) => request,
        Err(_) => return AgentBridgeResponse::error("VALIDATION_ERROR", "agent 请求格式无效"),
    };
    if request.version != 1 || request.action != "addTradeWatch" {
        return AgentBridgeResponse::error("VALIDATION_ERROR", "不支持的 agent action 或版本");
    }
    match tauri::async_runtime::block_on(service.add_watch(request.input)) {
        Ok(watch) => {
            let _ = app_handle.emit("trade-watch-added", &watch);
            AgentBridgeResponse::success(watch)
        }
        Err(error) => {
            let error: ErrorResponse = error.into();
            AgentBridgeResponse::error(error.code, error.message)
        }
    }
}

#[cfg(not(unix))]
pub fn start(
    _app_data_dir: &Path,
    _service: Arc<TradeWatchService>,
    _app_handle: AppHandle,
) -> std::io::Result<()> {
    Err(std::io::Error::new(
        std::io::ErrorKind::Unsupported,
        "agent bridge requires Unix",
    ))
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::os::unix::net::UnixListener;

    #[test]
    fn preserves_active_and_non_socket_paths_but_clears_stale_sockets() {
        let directory = PathBuf::from("/tmp").join(format!(
            "lq-agent-{}",
            &uuid::Uuid::new_v4().to_string()[..8]
        ));
        fs::create_dir(&directory).unwrap();
        let path = directory.join(SOCKET_NAME);
        let listener = match UnixListener::bind(&path) {
            Ok(listener) => listener,
            Err(error) if error.kind() == std::io::ErrorKind::PermissionDenied => {
                fs::remove_dir(directory).unwrap();
                return;
            }
            Err(error) => panic!("failed to bind test socket: {error}"),
        };
        assert_eq!(
            prepare_socket_path(&path).unwrap_err().kind(),
            std::io::ErrorKind::AddrInUse
        );
        drop(listener);
        prepare_socket_path(&path).unwrap();
        assert!(!path.exists());
        fs::write(&path, b"do not delete").unwrap();
        assert_eq!(
            prepare_socket_path(&path).unwrap_err().kind(),
            std::io::ErrorKind::AlreadyExists
        );
        assert_eq!(fs::read(&path).unwrap(), b"do not delete");
        fs::remove_file(path).unwrap();
        fs::remove_dir(directory).unwrap();
    }
}
