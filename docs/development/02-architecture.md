# 目标架构

## 技术形态

- 桌面壳：Tauri。
- 前端：React + TypeScript，按模块拆分 feature。
- 状态：查询状态来自 SQLite；瞬时 UI 状态留在前端。
- 数据库：SQLite，迁移文件纳入版本控制。
- 测试：TypeScript 单元/组件测试、Rust/数据库集成测试、桌面端关键路径 E2E。

依赖版本在脚手架阶段锁定，不在规格文档写死浮动版本。

## 分层

```text
React Views
  ↓ commands / queries
Frontend application services
  ↓ typed IPC
Tauri commands
  ↓ domain services + transactions
SQLite repositories
```

## 前端目录建议

```text
src/
  app/            路由、布局、错误边界
  features/       compass/work/schedule/finance/items/network/trade/learning
  entities/       task/person/item/watchlist 等共享类型
  shared/         UI、日期、校验、设计 token
src-tauri/
  src/commands/   IPC 边界
  src/domain/     领域规则
  src/repos/      SQLite 访问
  migrations/     数据库迁移
```

## 模块边界

- 日程只更新任务的排期字段，不复制来源任务。
- `schedule.scheduled` 是已排期任务及其完成状态的唯一数据源；今日总览和 macOS 菜单栏只派生当天任务，不保存文本副本或数组索引映射。
- 应用壳层持有已排期任务资源，使日程、总览和桌面菜单事件共享同一状态；任一入口完成任务均按稳定任务 ID 更新该资源。
- 总览只读聚合查询；完成任务仍调用来源任务命令。
- EOD 联动、月末结算、持仓创建必须在单个数据库事务中完成。
- 预警是派生结果，除通知投递记录外不重复存储。
- `trade.watchlist.target` 保留为中枢目标价以兼容既有 JSON 资源；`optimisticTarget` 和 `pessimisticTarget` 分别保存乐观与悲观目标价。读取旧记录时由前端纯函数以 `target` 补齐缺失的新字段，不单独触发迁移写入。
- 观察标的编辑草稿位于对应 `WatchRow`，父组件按稳定 ID 保存；代码变化时在替换资源前重新读取固定新浪行情。删除前检查 `trade.positions` 的全部当前/已清仓引用，不执行级联删除，避免持仓历史失联。
- 持仓的浮动盈亏、中枢目标/安全价差与减仓价由前端纯函数使用 `trade.positions` 的建仓价和 `trade.watchlist` 的现价/中枢目标价/安全价派生，不持久化；旧 `stop` 字段只保留解析兼容。
- `trade.sop` 是投资 SOP 的单值持久化资源；查看态与编辑态共用同一卡片，草稿仅保留在组件内，确认保存后才替换持久化值。
- 持仓建仓价编辑草稿仅保留在对应行组件内；确认保存后，父组件按稳定持仓 ID 替换 `trade.positions` 中的建仓价。
- 清仓不在两个资源间搬运数据；而是在原 `trade.positions` 实体上同时写入 `closePrice`、`profitPercent` 和 `closedAt`。两个 Tab 依据 `closedAt` 派生过滤，确保清仓状态一次替换即原子生效。
- 当前持仓删除与清仓是两个独立命令：删除直接按 ID 过滤 `trade.positions`，清仓则保留并封存原实体。
- 每日复盘以 `date` 作为稳定身份；行内编辑草稿仅存于对应条目组件，保存或删除后由父组件一次替换 `trade.reviews` 集合。
- `MarketQuoteService` 位于 Rust 侧，通过固定新浪财经 adapter 批量查询 A 股快照；命令只接收数量受限的六位代码数组。React 仅负责按北京时间交易窗口调度，Rust 再次校验代码、响应大小、字段数量、有限正价格与行情时间。

## 副作用边界

- React 渲染函数：无副作用。
- 前端 application service：调用 IPC、刷新查询缓存、展示反馈。
- Tauri command：校验输入、开启事务、调用领域服务。
- repository：只负责 SQL，不包含业务判断。
- notification/market/backup adapter：显式外部副作用，可替换、可测试。
- 演示 fixture 使用 `import.meta.env.PROD` 编译期分支；生产分支只提供符合 schema 的空集合/零值，构建器删除开发 fixture。`useDomainResource` 仅在存储无值时使用运行时初值，不覆盖已有 SQLite 数据。

## 错误模型

统一返回 `VALIDATION_ERROR`、`CONFLICT`、`NOT_FOUND`、`STORAGE_ERROR`、`EXTERNAL_SERVICE_ERROR`。错误包含稳定 code 和可展示 message，不向界面暴露 SQL 或文件路径。
