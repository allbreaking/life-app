# AI Agent 投资观察列表接口 Architecture

最后更新：2026-08-30

## 选择

采用“打包 MCP stdio sidecar + 应用内 Unix Domain Socket bridge + 共享 Rust TradeWatchService”。不采用 loopback HTTP，避免端口发现、鉴权和跨站请求面；不让 sidecar 直接写 SQLite，避免绕过正在运行的 UI 状态和应用业务边界。

```text
AI Agent / MCP Client
  → Life-OS.app/Contents/MacOS/life-os-mcp (stdio JSON-RPC)
  → app_data_dir/agent-v1.sock (Unix socket, 0600, ≤64 KiB)
  → AgentBridgeRequest::AddTradeWatch
  → TradeWatchService::add_watch
      ├─ Rust 完整输入校验
      ├─ 固定新浪 adapter 只读取价（事务外）
      └─ SQLite BEGIN IMMEDIATE
          ├─ command_receipt 幂等检查
          ├─ trade.watchlist 代码唯一检查
          ├─ 追加单个 domain_entity
          └─ 写 result_id 收据并 commit
  → app.emit("trade-watch-added", entity)
  → Trade 页面按稳定 ID 合并
```

## 进程与信任边界

- MCP sidecar 是协议适配器，只接受 stdin、写 stdout/stderr、连接固定派生的 socket 路径。
- socket 使用应用数据目录，不接受 CLI 提供的任意 socket 路径；目录和 socket 依赖 macOS 当前用户文件权限，socket 显式设为 `0600`。
- 多开时先探测既有 socket：活跃 bridge 保持不变，后启动实例不抢占；仅清理已无法连接的 stale socket，且绝不删除同路径普通文件或符号链接目标。
- bridge 只解析带版本的白名单 enum；未知 action 和未知字段拒绝。
- 应用进程是唯一领域写入者，复用与桌面表单相同的 `TradeWatchService`。
- Tauri capability 保持 `core:default`；sidecar 不是 WebView capability，也不新增 shell、文件系统或通用 HTTP 权限。

## 并发与幂等

- 网络取价在事务外完成，避免长时间持有 SQLite 锁。
- 最终写入使用 `TransactionBehavior::Immediate`，把“检查收据 → 检查代码 → 追加 → 写收据”串成一个跨连接原子区间。
- `command_receipt.command = add_trade_watch`，`result_id` 保存稳定观察 ID；重复请求不再次取价。
- 稳定观察 ID 由服务端 UUID 生成，agent 不可指定。
- MCP 工具要求调用方提供 UUID `requestId`；调用方负责业务重试时复用。

## UI 一致性

- 桌面表单调用 Tauri `add_trade_watch`，不再先在 React 拼完整实体后调用通用资源替换。
- MCP 和桌面命令成功后都 emit `trade-watch-added`。
- Trade 页面按 `id` upsert，重复事件不产生重复项。
- 既有 `useDomainResource` 会把合并后的列表持久化一次；该写入内容与服务端结果相同。后续可把编辑/删除也下沉为细粒度命令，但不属于本次范围。

## 打包

- Cargo 新增 `life-os-mcp` bin target。
- `scripts/prepare-agent-sidecar.mjs` 使用 Rust host triple 构建 release binary，并复制为 Tauri `externalBin` 所需的目标后缀文件。
- Tauri `bundle.externalBin` 把 sidecar 放进 `.app`；开发和生产构建前均准备对应 binary。

## 降级

- Life-OS 未运行：MCP 工具返回“请先启动 Life-OS”，不自行打开应用。
- 非 Unix 平台：sidecar 返回平台不支持；桌面 Tauri command 仍可工作。本功能当前产品目标是 macOS。
- bridge 启动失败：主应用继续运行，但记录明确错误；界面手工新增仍通过 Tauri command 可用。
