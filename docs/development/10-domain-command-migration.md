# P1–P5 领域命令迁移规格

## 目标

将 P0 `module_state` 的 18 个模块状态键迁移为白名单领域资源命令。集合按实体行保存，标量按单值保存；旧表只作为一次性导入来源，成功导入后记录迁移标记，不再写入。

## 命令契约

- `load_domain_resource(resource)`：读取并重组领域资源。副作用：读取 SQLite；若仅存在旧状态，则在单事务中导入实体行并写迁移标记。
- `replace_domain_resource(resource, value, requestId)`：用校验后的资源快照替换该资源。副作用：在单事务内更新领域行、更新时间戳并写 `command_receipt`。
- 相同 `requestId` 与同一命令重试返回成功；复用于其他命令返回冲突。

## 资源与阶段

| 阶段 | 领域资源 |
|---|---|
| P1 | `schedule.pool`, `schedule.scheduled`, `schedule.lifeSchedules` |
| P2 | `work.tasks`, `work.focusIds`, `work.eodSubmitted`, `dashboard.completedTodoIndexes`, `compass.principles` |
| P3 | `finance.budgetCents`, `finance.spentCents`, `finance.pending`, `finance.lastTransaction`, `items.foods`, `items.items` |
| P4 | `network.people`, `learning.domains` |
| P5 | `trade.watchlist`, `trade.positions`, `trade.reviews` |

## 存储规则

- 顶层数组存入 `domain_entity`，每个元素一行并保留稳定顺序；元素必须为对象且具有非空 `id`，没有 `id` 的值使用内容派生的稳定标识。
- 其他合法 JSON 存入 `domain_value`。
- 资源名、请求 ID、载荷大小均双端校验；SQL 全部参数绑定；最大载荷 256 KiB。
- 浏览器测试环境保持内存状态，不模拟持久化。

## 兼容与回滚

- `module_state` 不删除，避免破坏旧数据库；领域资源不存在时最多导入一次。
- `domain_resource_migration` 是每个资源的切换点。标记存在后，即使领域资源为空也不得回读旧状态。
- 新版本不再暴露 `load_module_state` / `save_module_state` IPC。

## 验收

- 18 个资源均在白名单，非法资源、非法请求 ID、超大载荷被拒绝。
- 覆盖集合拆行/重组、空集合、标量、旧状态导入、幂等重试和请求冲突。
- 前端不再引用模块状态键 API；类型检查、组件测试、Rust 测试和生产构建通过。
