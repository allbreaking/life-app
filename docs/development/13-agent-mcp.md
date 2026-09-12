# AI Agent MCP 接入

## 能力

Life-OS macOS 应用随包提供 `life-os-mcp` stdio server。当前只暴露 `add_trade_watch`，用于向投资观察列表添加沪深北 A 股标的；它不会创建持仓或执行交易。

## 前置条件

1. 启动 Life-OS；应用会在自身数据目录创建权限为 `0600` 的 `agent-v1.sock`。
2. MCP 客户端以 stdio 方式启动 sidecar：

```text
/Applications/Life-OS.app/Contents/MacOS/life-os-mcp
```

仓库构建产物路径为：

```text
src-tauri/target/release/bundle/macos/Life-OS.app/Contents/MacOS/life-os-mcp
```

若应用未运行，工具调用返回明确错误；sidecar 不会自动启动应用。

## 工具参数

```json
{
  "requestId": "018fb47d-4dc7-7e9a-8a6f-5df4f34c6910",
  "code": "600519",
  "name": "贵州茅台",
  "optimisticTarget": 1800,
  "target": 1680,
  "pessimisticTarget": 1550,
  "tags": ["消费", "核心资产"],
  "businessModelRating": 5,
  "profitabilityRating": 5,
  "financialStabilityRating": 5,
  "cashFlowRating": 5
}
```

- `requestId` 必须为 UUID；同一次业务重试必须复用，成功后会返回同一个观察标的。
- 三档目标价必须满足乐观 ≥ 中枢 ≥ 悲观 > 0。
- 标签最多 10 个，每项 1–20 字符；四项评分可省略或为 0–5 整数。
- 现价、行情时间、稳定 ID、加入时间和 `safety: 0` 由 Life-OS 生成，agent 不能指定。

## 构建

- `npm run agent:sidecar`：按本机 Rust host triple 生成 Tauri external binary。
- `npm exec tauri build -- --bundles app`：构建包含 GUI 主程序和 MCP sidecar 的 `.app`。
- `npm run release:verify`：执行前端、Rust、静态规格和发布审计。

## 安全边界

MCP 不监听 TCP、不直接访问 SQLite、不接受 URL/SQL/shell/文件路径，也不暴露通用领域资源替换。应用进程在固定行情请求成功后，用 immediate SQLite transaction 原子执行幂等检查、股票代码判重、单实体追加和收据写入。
