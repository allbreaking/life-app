# 投资观察列表三档目标价 Architecture

## 最后更新：2026-08-09

## 数据流

```text
观察列表表单
  → 六位代码/名称/四类价格校验
  → 固定新浪行情 adapter 取最近价格
  → 构造含 optimisticTarget / target / pessimisticTarget 的 Watch
  → trade.watchlist 领域资源幂等替换
  → SQLite

旧 trade.watchlist JSON
  → Zod 基础字段校验
  → normalizeWatch 纯函数补齐缺失目标价
  → 三档目标价关系校验
  → React 运行态
```

## 数据模型

- `target`：中枢目标价。保留原字段名，确保持久化数据、预警和持仓派生逻辑向后兼容。
- `optimisticTarget`：乐观目标价。
- `pessimisticTarget`：悲观目标价。
- 运行态约束：`optimisticTarget >= target >= pessimisticTarget > 0`，且 `0 <= safety < target`。
- 旧记录缺少新增字段时，两者分别回退为 `target`；不根据行情或安全价推测用户估值。

## 组件责任

- `normalizeWatch`：纯兼容函数，只返回新对象，不写领域资源。
- `isValidTargetRange`：纯校验函数，统一供持久化 schema 与新增表单使用。
- `Trade`：调度领域资源、行情请求和表单反馈；校验失败时在网络与存储边界之前停止。
- `WatchRow`：展示三档目标价；告警仍以中枢目标价和安全价派生。
- `PositionRow`：持仓“距中枢目标价”继续使用 `target`，不持久化派生百分比。

## 副作用与幂等

- 兼容、校验、渲染和持仓指标派生无副作用。
- 合法新增会请求固定行情 adapter；成功后通过既有 `trade.watchlist` 资源替换写入 SQLite。
- 领域资源写入沿用请求收据与数据库唯一约束；重复代码在发起行情和写入前被拒绝。
- 行情轮询映射以对象展开保留三档目标价，仅替换 `current` 和 `quoteAt`。
- 无数据库迁移、无新 IPC、无新 capability、无新依赖。

## 安全边界

- 所有用户价格先验证有限性、正数和关系；名称由 React 文本节点渲染。
- 行情响应继续由 Rust 校验代码、响应大小、价格和时间。
- 不拼接 SQL 或 shell，不接受任意行情主机，不记录密钥或敏感数据。

## 验证结论

- 规格一致性：符合。实现覆盖兼容、顺序约束、三档展示和中枢价派生语义，未增加未声明业务逻辑。
- 副作用一致性：符合。新增副作用仅为合法新增后的既有行情请求与领域资源替换。
- 幂等性：符合。纯函数可重复执行；持久化沿用领域资源幂等收据和 SQLite 唯一约束。
- 安全合规：符合。外部输入在网络/存储前校验，无 SQL 拼接、命令注入、不安全反序列化或敏感信息硬编码。
- 自动校验：TypeScript 类型检查、45 项前端测试、静态规格、16 项 Rust 测试和生产构建通过。
