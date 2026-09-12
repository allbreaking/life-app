# AI Agent 添加投资观察标的实施计划

日期：2026-08-30

## BUILD 顺序

1. 新增 Rust `trade_watch` 领域类型、双端业务校验、固定行情调用和 immediate transaction 追加逻辑。
2. 注册 `add_trade_watch` Tauri command，并让桌面窗口成功后收到白名单事件。
3. 新增 Unix socket agent bridge，限制路径、权限、消息大小和请求 enum。
4. 新增 `life-os-mcp` stdio binary，实现最小 MCP initialize / ping / tools/list / tools/call。
5. 新增 typed 前端 `addTradeWatch` 和事件订阅，投资表单改为复用领域命令。
6. 配置 Tauri externalBin 和 sidecar 构建脚本。
7. 更新 feature map、service contract、安全/幂等和测试文档及 `progress.md`。

## VERIFY 顺序

1. Rust 纯校验测试：代码、名称、目标价、标签、评分、未知字段。
2. Rust SQLite 测试：追加、代码冲突、request ID 幂等、result ID、并发事务边界。
3. MCP 协议测试：initialize、唯一工具 schema、成功/错误转译、超长输入、未知方法。
4. 前端 IPC schema 测试和投资组件新增回归。
5. `npm run typecheck`、`npm test`、`cargo test`。
6. `npm run build`、`npm run release:audit`，并确认 sidecar 被 `.app` 构建配置收录。

## 副作用审计

- 网络：仅新浪固定 HTTPS GET。
- 数据：单实体追加与幂等收据，一个 immediate transaction。
- 文件：应用创建/替换固定 socket 文件；构建脚本只写 `src-tauri/binaries` 的目标 sidecar 文件。
- IPC：stdio MCP、固定 Unix socket、Tauri command/event。
- 系统：不启动 shell、不自动拉起应用、不监听 TCP、不发送通知、不执行交易。
