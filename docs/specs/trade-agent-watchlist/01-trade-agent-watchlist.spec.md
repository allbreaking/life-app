# AI Agent 添加投资观察标的函数级规格

规格版本：2026-08-30

## 入口自检

- 涉及文件：预计超过 3 个。
- 涉及模块：投资领域服务、Tauri 桌面壳、MCP sidecar、React 投资界面和发布构建。
- 改动规模：跨模块新功能，执行 DESIGN → PLAN → BUILD → VERIFY。
- 用户授权：用户明确要求“先补文档，然后 build”（2026-08-30）。
- 规则说明：全局 `AGENTS.md` 所引用的 `rules/dev-flow.md`、`rules/idempotency.md`、`rules/security.md` 当前不存在；以下规格遵循仓库既有 development 文档和全局核心原则。

## 用户故事

本机 AI agent 可以调用 Life-OS 提供的 MCP 工具，把一个经过校验的 A 股标的加入投资模块观察列表。AI agent 不需要操作界面，也不能读取或替换任意领域资源、指定网络地址、直接执行 SQL 或触发交易。

## MCP 工具：`add_trade_watch`

**所在文件**：`src-tauri/src/agent_mcp.rs`

**输入**：

- `requestId`：UUID；同一业务尝试重试时必须复用。
- `code`：六位沪深北 A 股代码。
- `name`：去除首尾空白后 1–100 字符。
- `optimisticTarget`、`target`、`pessimisticTarget`：有限正数，满足乐观 ≥ 中枢 ≥ 悲观。
- `tags`：可选字符串数组，最多 10 个；每项 trim 后 1–20 字符，去重后保存。
- `businessModelRating`、`profitabilityRating`、`financialStabilityRating`、`cashFlowRating`：可选 0–5 整数。

**输出**：MCP `CallToolResult`；成功时文本说明已加入，并在 `structuredContent.watch` 返回新增观察实体。实体包括稳定 ID、输入字段、`safety: 0`、固定行情 adapter 返回的 `current` / `quoteAt` 和服务端生成的 `createdAt`。

**副作用（完整列表）**：

- sidecar 连接应用数据目录下的 Unix Domain Socket，并发送一个长度受限的 JSON 请求。
- 应用进程向固定 `https://hq.sinajs.cn` 主机发送一次只读行情请求。
- 行情成功后，应用在一个 SQLite immediate transaction 中检查幂等收据、代码唯一性，追加 `trade.watchlist` 实体，并写入 `command_receipt`。
- 写入成功后，应用向当前窗口发送 `trade-watch-added` 事件，使打开的投资界面合并该稳定 ID 实体。
- MCP server 仅向 stdout 写 MCP JSON-RPC 响应；诊断信息仅允许写 stderr。

**不应该做的事**：

- 不开放 TCP/HTTP 监听端口，不暴露 `replace_domain_resource`、SQL、shell、文件读写或通用网络工具。
- 不允许 agent 提交 `id`、`current`、`quoteAt`、`createdAt`、`safety` 或任意 URL。
- 校验失败、重复代码、应用未运行、socket 不可信、行情失败或事务失败时不得写观察列表。
- 不在 sidecar 中直接打开 SQLite；所有领域写入必须回到正在运行的应用进程。
- 不创建持仓、不执行买卖、不把观察列表内容解释为投资建议。

**异常处理**：

- MCP 协议/参数错误返回 JSON-RPC 或 tool error，server 继续处理后续 stdin 消息。
- 应用未运行或 socket 不可连接时返回明确错误，提示先启动 Life-OS。
- socket 路径若已存在且不是 Unix socket，应用拒绝启动 agent bridge，不删除该文件；若已有 bridge 可连接，后启动实例不得覆盖；只有连接失败的 stale socket 才可删除后重建。
- 单条 stdin 或 socket 消息超过 64 KiB 时拒绝。
- 相同 `requestId` + 相同命令返回第一次创建的实体，不重复请求行情、不重复写入。
- 相同 `requestId` 被其他命令使用时返回冲突。

**依赖的外部资源**：Life-OS 进程、本机 Unix Domain Socket、固定新浪行情 adapter、应用 SQLite。

**幂等性**：是；`requestId` 是幂等键，成功收据保存结果实体 ID。

## 函数：`TradeWatchService::add_watch(input)`

**所在文件**：`src-tauri/src/trade_watch.rs`

**输入**：反序列化后的 `AddTradeWatchInput`。

**输出**：完整 `TradeWatch` 实体。

**副作用（完整列表）**：校验输入；首次请求固定行情；锁定共享 SQLite 连接；在 immediate transaction 内读取幂等收据和 `trade.watchlist`、检查代码唯一性、追加实体与收据；失败回滚。

**不应该做的事**：不得接受未声明字段；不得全量覆盖其他观察实体；不得持锁执行网络请求；不得信任前端或 MCP 已完成校验。

**异常处理**：所有外部输入在网络和存储边界前再次校验；唯一性冲突返回 `CONFLICT`；行情错误返回 `EXTERNAL_SERVICE_ERROR`。

**幂等性**：是；已成功的相同请求直接读取并返回结果实体。

## 函数：`add_trade_watch` Tauri command

**所在文件**：`src-tauri/src/commands/mod.rs`

**输入/输出**：与 `TradeWatchService::add_watch` 一致。

**副作用（完整列表）**：委托领域服务；成功后 emit 一次 `trade-watch-added` 窗口事件。

**不应该做的事**：不得复制业务校验或直接访问 SQLite。

**幂等性**：继承领域服务；重复成功调用可以重复 emit 同一实体，前端必须按稳定 ID 合并。

## 验收标准

1. MCP `initialize`、`tools/list`、`tools/call` 可由标准 stdio 客户端调用，且只列出 `add_trade_watch`。
2. 合法输入成功获取行情并写入一次；应用打开时无需重启即可看到新增标的。
3. 重复 request ID 返回相同 ID，观察列表只增加一条。
4. 重复股票代码、非法目标价、非法标签/评分、未知字段均失败且不写数据库。
5. sidecar 不读取 SQLite、不监听 TCP，socket 权限为当前用户读写。
6. 前端新增表单复用同一 Rust 命令，业务规则不再只存在于 React。
7. TypeScript、前端测试、Rust 测试、MCP 协议测试、静态规格、生产构建和发布审计通过。
