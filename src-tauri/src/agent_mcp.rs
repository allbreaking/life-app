use std::{
    io::{self, BufRead, Read, Write},
    path::PathBuf,
};

use serde_json::{Value, json};

use crate::{
    agent_bridge::{AgentBridgeResponse, MAX_AGENT_MESSAGE_BYTES, SOCKET_NAME},
    trade_watch::{AddTradeWatchInput, TradeWatch},
};

const TOOL_NAME: &str = "add_trade_watch";

/// Runs the MCP stdio adapter. Side effects: reads bounded JSON-RPC messages from stdin, writes
/// protocol responses to stdout, and connects only to Life-OS's fixed Unix socket path.
pub fn run() -> Result<(), String> {
    let stdin = io::stdin();
    let mut reader = stdin.lock();
    let stdout = io::stdout();
    let mut writer = stdout.lock();
    loop {
        let line = match read_bounded_line(&mut reader) {
            Ok(Some(line)) => line,
            Ok(None) => break,
            Err(error) if error.kind() == io::ErrorKind::InvalidData => {
                writeln!(
                    writer,
                    "{}",
                    rpc_error(Value::Null, -32600, "MCP message exceeds 64 KiB")
                )
                .map_err(|error| error.to_string())?;
                writer.flush().map_err(|error| error.to_string())?;
                continue;
            }
            Err(error) => return Err(error.to_string()),
        };
        if line.is_empty() {
            continue;
        }
        let request: Value = match serde_json::from_slice(&line) {
            Ok(request) => request,
            Err(_) => {
                writeln!(writer, "{}", rpc_error(Value::Null, -32700, "Parse error"))
                    .map_err(|error| error.to_string())?;
                writer.flush().map_err(|error| error.to_string())?;
                continue;
            }
        };
        if let Some(response) = handle_rpc(request, &connect_and_add) {
            writeln!(writer, "{response}").map_err(|error| error.to_string())?;
            writer.flush().map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

fn handle_rpc(
    request: Value,
    add: &dyn Fn(AddTradeWatchInput) -> Result<TradeWatch, String>,
) -> Option<Value> {
    let object = match request.as_object() {
        Some(object) => object,
        None => return Some(rpc_error(Value::Null, -32600, "Invalid Request")),
    };
    let id = object.get("id").cloned();
    let method = object.get("method").and_then(Value::as_str);
    if object.get("jsonrpc").and_then(Value::as_str) != Some("2.0") || method.is_none() {
        return Some(rpc_error(
            id.unwrap_or(Value::Null),
            -32600,
            "Invalid Request",
        ));
    }
    if id.is_none() {
        return None;
    }
    let id = id.unwrap_or(Value::Null);
    let response = match method.unwrap_or_default() {
        "initialize" => {
            let protocol_version = object
                .get("params")
                .and_then(|params| params.get("protocolVersion"))
                .and_then(Value::as_str)
                .unwrap_or("2025-06-18");
            rpc_result(
                id,
                json!({
                    "protocolVersion": protocol_version,
                    "capabilities": { "tools": { "listChanged": false } },
                    "serverInfo": { "name": "life-os", "version": env!("CARGO_PKG_VERSION") }
                }),
            )
        }
        "ping" => rpc_result(id, json!({})),
        "tools/list" => rpc_result(id, json!({ "tools": [tool_definition()] })),
        "tools/call" => {
            let params = object.get("params").and_then(Value::as_object);
            if params
                .and_then(|params| params.get("name"))
                .and_then(Value::as_str)
                != Some(TOOL_NAME)
            {
                rpc_error(id, -32602, "Unknown tool")
            } else {
                let arguments = params
                    .and_then(|params| params.get("arguments"))
                    .cloned()
                    .unwrap_or_else(|| json!({}));
                match serde_json::from_value::<AddTradeWatchInput>(arguments) {
                    Ok(input) => match add(input) {
                        Ok(watch) => rpc_result(
                            id,
                            json!({
                                "content": [{ "type": "text", "text": format!("已将 {} {} 加入 Life-OS 观察列表", watch.code, watch.name) }],
                                "structuredContent": { "watch": watch },
                                "isError": false
                            }),
                        ),
                        Err(message) => rpc_result(
                            id,
                            json!({
                                "content": [{ "type": "text", "text": message }],
                                "isError": true
                            }),
                        ),
                    },
                    Err(_) => rpc_error(id, -32602, "Invalid add_trade_watch arguments"),
                }
            }
        }
        _ => rpc_error(id, -32601, "Method not found"),
    };
    Some(response)
}

fn tool_definition() -> Value {
    json!({
        "name": TOOL_NAME,
        "title": "添加投资观察标的",
        "description": "将一个经过校验的沪深北 A 股或港股标的加入正在运行的 Life-OS 投资观察列表；只观察，不创建持仓或交易。",
        "inputSchema": {
            "type": "object",
            "additionalProperties": false,
            "required": ["requestId", "code", "name", "optimisticTarget", "target", "pessimisticTarget"],
            "properties": {
                "requestId": { "type": "string", "format": "uuid", "description": "重试时复用的幂等 UUID" },
                "code": { "type": "string", "pattern": "^[0-9]{5,6}$" },
                "name": { "type": "string", "minLength": 1, "maxLength": 100 },
                "optimisticTarget": { "type": "number", "exclusiveMinimum": 0 },
                "target": { "type": "number", "exclusiveMinimum": 0 },
                "pessimisticTarget": { "type": "number", "exclusiveMinimum": 0 },
                "tags": { "type": "array", "maxItems": 10, "items": { "type": "string", "minLength": 1, "maxLength": 20 } },
                "businessModelRating": { "type": "integer", "minimum": 0, "maximum": 5 },
                "profitabilityRating": { "type": "integer", "minimum": 0, "maximum": 5 },
                "financialStabilityRating": { "type": "integer", "minimum": 0, "maximum": 5 },
                "cashFlowRating": { "type": "integer", "minimum": 0, "maximum": 5 }
            }
        }
    })
}

#[cfg(unix)]
fn connect_and_add(input: AddTradeWatchInput) -> Result<TradeWatch, String> {
    use std::{net::Shutdown, os::unix::net::UnixStream};

    let path = default_socket_path()?;
    let mut stream = UnixStream::connect(&path).map_err(|error| {
        format!(
            "无法连接 Life-OS socket {}：{error}；请先启动桌面应用",
            path.display()
        )
    })?;
    let request =
        serde_json::to_vec(&json!({ "version": 1, "action": "addTradeWatch", "input": input }))
            .map_err(|_| "无法编码 agent 请求".to_string())?;
    if request.len() > MAX_AGENT_MESSAGE_BYTES {
        return Err("agent 请求超过 64 KiB".into());
    }
    stream
        .write_all(&request)
        .map_err(|_| "无法发送 Life-OS 请求".to_string())?;
    stream
        .shutdown(Shutdown::Write)
        .map_err(|_| "无法完成 Life-OS 请求".to_string())?;
    let mut response = Vec::new();
    stream
        .take((MAX_AGENT_MESSAGE_BYTES + 1) as u64)
        .read_to_end(&mut response)
        .map_err(|_| "无法读取 Life-OS 响应".to_string())?;
    if response.len() > MAX_AGENT_MESSAGE_BYTES {
        return Err("Life-OS 响应超过 64 KiB".into());
    }
    let response: AgentBridgeResponse =
        serde_json::from_slice(&response).map_err(|_| "Life-OS 响应格式无效".to_string())?;
    match (response.watch, response.error) {
        (Some(watch), None) => Ok(watch),
        (None, Some(error)) => Err(error.message),
        _ => Err("Life-OS 响应不完整".into()),
    }
}

#[cfg(not(unix))]
fn connect_and_add(_input: AddTradeWatchInput) -> Result<TradeWatch, String> {
    Err("Life-OS agent 接口当前只支持 macOS/Unix".into())
}

fn default_socket_path() -> Result<PathBuf, String> {
    dirs::data_dir()
        .map(|path| path.join("app.life-os.desktop").join(SOCKET_NAME))
        .ok_or_else(|| "无法定位 Life-OS 应用数据目录".into())
}

fn read_bounded_line(reader: &mut impl BufRead) -> io::Result<Option<Vec<u8>>> {
    let mut output = Vec::new();
    loop {
        let buffer = reader.fill_buf()?;
        if buffer.is_empty() {
            return Ok((!output.is_empty()).then_some(output));
        }
        let newline = buffer.iter().position(|byte| *byte == b'\n');
        let take = newline.map_or(buffer.len(), |index| index + 1);
        if output.len() + take > MAX_AGENT_MESSAGE_BYTES {
            reader.consume(take);
            while newline.is_none() {
                let buffer = reader.fill_buf()?;
                if buffer.is_empty() {
                    break;
                }
                let next_newline = buffer.iter().position(|byte| *byte == b'\n');
                let drain = next_newline.map_or(buffer.len(), |index| index + 1);
                reader.consume(drain);
                if next_newline.is_some() {
                    break;
                }
            }
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "MCP message exceeds 64 KiB",
            ));
        }
        output.extend_from_slice(&buffer[..take]);
        reader.consume(take);
        if newline.is_some() {
            if output.last() == Some(&b'\n') {
                output.pop();
            }
            if output.last() == Some(&b'\r') {
                output.pop();
            }
            return Ok(Some(output));
        }
    }
}

fn rpc_result(id: Value, result: Value) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "result": result })
}
fn rpc_error(id: Value, code: i64, message: &str) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "error": { "code": code, "message": message } })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn advertises_only_the_narrow_trade_tool() {
        let response = handle_rpc(
            json!({ "jsonrpc": "2.0", "id": 1, "method": "tools/list" }),
            &|_| unreachable!(),
        )
        .unwrap();
        let tools = response["result"]["tools"].as_array().unwrap();
        assert_eq!(tools.len(), 1);
        assert_eq!(tools[0]["name"], TOOL_NAME);
        assert_eq!(tools[0]["inputSchema"]["additionalProperties"], false);
    }

    #[test]
    fn initializes_and_ignores_notifications() {
        let response = handle_rpc(json!({ "jsonrpc": "2.0", "id": "a", "method": "initialize", "params": { "protocolVersion": "2025-06-18" } }), &|_| unreachable!()).unwrap();
        assert_eq!(response["result"]["protocolVersion"], "2025-06-18");
        assert!(
            handle_rpc(
                json!({ "jsonrpc": "2.0", "method": "notifications/initialized" }),
                &|_| unreachable!()
            )
            .is_none()
        );
    }

    #[test]
    fn translates_a_successful_tool_call() {
        let response = handle_rpc(json!({
            "jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": { "name": TOOL_NAME, "arguments": {
                "requestId": "018fb47d-4dc7-7e9a-8a6f-5df4f34c6910", "code": "600519", "name": "贵州茅台",
                "optimisticTarget": 1800, "target": 1680, "pessimisticTarget": 1550
            }}
        }), &|input| Ok(TradeWatch {
            id: "w1".into(), code: input.code, name: input.name, optimistic_target: input.optimistic_target,
            target: input.target, pessimistic_target: input.pessimistic_target, safety: 0.0, current: 1309.22,
            tags: vec![], business_model_rating: None, profitability_rating: None, financial_stability_rating: None,
            cash_flow_rating: None, quote_at: "2026-08-30T15:00:00".into(), created_at: "2026-08-30T15:01:00.000Z".into()
        })).unwrap();
        assert_eq!(response["result"]["structuredContent"]["watch"]["id"], "w1");
        assert_eq!(response["result"]["isError"], false);
    }

    #[test]
    fn rejects_unknown_tool_fields_before_calling_the_bridge() {
        let response = handle_rpc(json!({
            "jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": { "name": TOOL_NAME, "arguments": {
                "requestId": "018fb47d-4dc7-7e9a-8a6f-5df4f34c6910", "code": "600519", "name": "贵州茅台",
                "optimisticTarget": 1800, "target": 1680, "pessimisticTarget": 1550, "url": "https://example.com"
            }}
        }), &|_| panic!("bridge must not be called")).unwrap();
        assert_eq!(response["error"]["code"], -32602);
    }
}
