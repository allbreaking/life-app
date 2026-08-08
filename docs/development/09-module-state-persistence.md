# 模块运行态持久化规格

## 目标

将首轮 React 迁移中仅存在于组件内存的业务运行态接入 typed IPC、Rust 应用服务和 SQLite，使应用重启后可以恢复。导航、表单开关、提示文字等纯 UI 状态不持久化。

本阶段使用 `module_state` 作为从冻结原型迁移到细粒度领域命令的兼容层。既有规范化表仍是最终领域模型；后续模块服务替换某个状态键时，只迁移该键，不修改历史迁移。

> 状态：已由 `10-domain-command-migration.md` 完成 P1–P5 切换。本文件仅记录 P0 历史契约；当前版本不再暴露本节 IPC，`module_state` 只作为一次性导入来源。

## 契约

- `load_module_state(module, stateKey)`：读取单个状态值。副作用：只读 SQLite，无写入。
- `save_module_state(module, stateKey, value, requestId)`：写入单个状态值。副作用：在一个事务内 upsert `module_state`、写入 `command_receipt` 和更新时间戳。
- 相同 `requestId` 重试不重复写入；若收据属于其他命令则返回冲突。
- 模块和状态键均使用白名单；JSON 载荷上限 256 KiB；前端写入前及读取后均以 Zod schema 校验。
- 浏览器预览和组件测试没有 Tauri runtime 时使用内存初值，且不产生伪持久化写入。

## 持久化范围

| 模块 | 状态键 |
|---|---|
| compass | `principles` |
| dashboard | `completedTodoIndexes` |
| work | `tasks`, `focusIds`, `eodSubmitted` |
| schedule | `pool`, `scheduled`, `lifeSchedules` |
| finance | `budgetCents`, `spentCents`, `pending`, `lastTransaction` |
| items | `foods`, `items` |
| network | `people` |
| trade | `watchlist`, `positions`, `reviews` |
| learning | `domains` |

## 错误与恢复

- 前端校验失败：拒绝采用或写入数据，并记录可理解错误。
- Rust 参数非法：返回 `VALIDATION_ERROR`。
- SQLite 失败：返回 `STORAGE_ERROR`，前端保留当前内存状态，可继续重试。
- 读取不到记录：返回 `null`，使用规格定义的冷启动数据。

## 验收

- Rust 集成测试覆盖首次写入、覆盖写入、读取、幂等重试、非法模块和超大载荷。
- TypeScript 测试覆盖无 Tauri runtime 的安全降级和 schema 拒绝。
- 类型检查、组件测试、Rust 测试、生产构建全部通过。
