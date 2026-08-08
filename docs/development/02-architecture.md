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

## 副作用边界

- React 渲染函数：无副作用。
- 前端 application service：调用 IPC、刷新查询缓存、展示反馈。
- Tauri command：校验输入、开启事务、调用领域服务。
- repository：只负责 SQL，不包含业务判断。
- notification/market/backup adapter：显式外部副作用，可替换、可测试。

## 错误模型

统一返回 `VALIDATION_ERROR`、`CONFLICT`、`NOT_FOUND`、`STORAGE_ERROR`、`EXTERNAL_SERVICE_ERROR`。错误包含稳定 code 和可展示 message，不向界面暴露 SQL 或文件路径。
