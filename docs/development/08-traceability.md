# 需求追踪矩阵

| ID | 需求 | 领域/表 | 关键测试 | 优先级 |
|---|---|---|---|---|
| G-01 | 模块内新增与快捷录入并存 | application services | 同一输入产生同一命令 | P0 |
| W-01 | Q1 最多 2 个活跃任务 | task/work | 第 3 个返回 CONFLICT | P0 |
| W-02 | EOD 联动任务与知识 | work_eod/task/read_inbox | 事务回滚测试 | P0 |
| S-01 | 日程不复制来源任务 | task | 排期前后 ID 不变 | P0 |
| S-02 | 生活模板只读投影 | life_schedule_template | 拖动模板被拒绝 | P0 |
| S-03 | 15 分钟吸附、任意分钟输入 | schedule UI | 换算边界测试 | P1 |
| F-01 | 非必要支出延迟结算 | transaction | 结余充分/不足分支 | P0 |
| F-02 | 消费领先时间进度预警 | monthly_budget | 月初/月末阈值 | P1 |
| I-01 | 所有物品有位置 | item | 空位置被拒绝 | P0 |
| I-02 | 食物完整展示及到期预警 | item | -1/0/3/7/8 天边界 | P0 |
| N-01 | 不做关系评分 | person | schema 无评分字段 | P1 |
| T-01 | 只能从观察列表建仓 | position/watchlist | 外键失败测试 | P0 |
| T-02 | 每日复盘按日唯一 | daily_review | 同日 upsert | P1 |
| L-01 | 外层只管理领域 | learning_domain | 列表无任务编辑入口 | P0 |
| L-02 | 领域工作区管理里程碑和任务 | milestone/task | 进度联动 E2E | P0 |
| A-01 | 键盘跳转、可见焦点与模态焦点约束/恢复 | application UI | App 组件键盘测试 | P0 |
| D-01 | 原生菜单打开快捷录入并返回总览 | desktop shell/application UI | Rust 菜单映射测试、App 桌面事件组件测试 | P1 |
| D-02 | 系统级 `Alt+Space` 打开快捷录入且注册失败可降级 | desktop shell | Rust 快捷键动作映射测试、完整构建 | P1 |
| D-03 | 系统通知按实体、类型、发生时间去重且失败可重试 | notification service/delivery | Rust 输入校验、adapter 去重与失败重试测试 | P1 |
| D-04 | SQLite 应用内一致性快照、校验后恢复与失败回滚 | backup service/application UI | Rust 快照/校验/回滚测试、typed IPC 与确认交互测试 | P1 |
| D-05 | 性能预算、最小桌面权限与可重复发布审计 | build/release configuration | 产物预算、版本/CSP/capability/icon 审计与桌面 bundle 构建 | P1 |

开发 PR 必须引用至少一个需求 ID，并标明新增或更新的自动化测试。

## P0 工程骨架追踪

| 骨架能力 | 实现位置 | 校验 |
|---|---|---|
| 九模块壳与可恢复导航 | `src/app/` | `src/app/App.test.tsx` |
| 全局快捷录入入口 | `src/features/quick-capture/` | Option+Space 组件测试 |
| 设计 token、错误边界 | `src/shared/styles/`、`AppErrorBoundary.tsx` | TypeScript 构建 |
| typed IPC 最小入口 | `src-tauri/src/commands/` | Rust 单元测试 |
| 模块运行态正式持久化桥 | `src/shared/ipc/`、`src-tauri/src/module_state.rs`、`module_state` | Zod 契约测试、Rust repository/service 集成测试 |
| SQLite、迁移与约束 | `src-tauri/migrations/001_initial.sql`、`src-tauri/src/db.rs` | SQLite/Rust 集成测试 |
| 最小桌面权限 | `src-tauri/capabilities/default.json` | Tauri 配置构建 |
| 冻结视觉基线与总览 | `src/shared/styles/`、`src/features/dashboard/` | 总览结构组件测试、生产构建 |
| 人生地图冻结结构 | `src/features/compass/` | 原则新增输入与结构组件测试 |
| W-01 Q1 最多两项 | `src/features/work/` | 第三个 Q1 任务显示冲突测试；运行态已持久化，规范化命令待 P1 接入 |
| 工作 Top 3 与 EOD 结构 | `src/features/work/` | 组件交互测试；事务服务待接入 |
| S-01 日程不复制来源任务 | `src/features/schedule/` | 排期后 ID 不变且可退回；运行态已持久化，规范化命令待 P1 接入 |
| S-02 生活模板只读投影 | `src/features/schedule/scheduleModel.ts` | 重复规则单元测试、只读投影组件测试 |
| S-03 15 分钟吸附与时长调整 | `src/features/schedule/` | 分钟边界单元测试、15 分钟时长调整组件测试 |
| F-01 非必要支出延迟结算 | `src/features/finance/` | 记账分流与运行态持久化；规范化结算事务待 P3 接入 |
| F-02 消费领先时间进度预警 | `src/features/finance/financeModel.ts` | Amber/Crimson 阈值单元测试 |
| I-01 所有物品有位置 | `src/features/items/` | 空位置被拒绝组件测试；数据库约束测试 |
| I-02 食物清单与到期预警 | `src/features/items/itemModel.ts` | -1/3/4/7/8 天边界单元测试、到期日必填组件测试 |
| N-01 不做关系评分 | `src/features/network/` | 界面无评分和断联倒计时组件测试 |
| T-01 只能从观察列表建仓 | `src/features/trade/` | 持仓下拉仅含观察列表组件测试、数据库外键测试 |
| T-02 每日复盘按日唯一 | `src/features/trade/` | 前端按日期 upsert；数据库服务测试待接入 |
| L-01 外层只管理领域 | `src/features/learning/` | 列表页不出现任务编辑入口组件测试 |
| L-02 领域工作区 | `src/features/learning/` | 进入/退出、里程碑派生进度组件测试；统一 task 映射待接入 |
| A-01 键盘与模态焦点 | `src/app/`、`src/features/quick-capture/`、`src/shared/styles/` | 跳转入口、Tab 约束与关闭后焦点恢复组件测试 |
| D-01 原生菜单动作 | `src-tauri/src/desktop_shell.rs`、`src/app/desktopEvents.ts` | 菜单 ID 白名单映射、桌面事件打开快捷录入/返回总览组件测试 |
| D-02 系统级快捷键 | `src-tauri/src/desktop_shell.rs`、`src-tauri/src/lib.rs` | 仅 Pressed 触发的 Rust 映射测试、注册失败不终止启动 |
| D-03 系统通知去重 | `src-tauri/src/notification.rs`、`notification_delivery` | 白名单校验、成功去重、失败重试与不同 occurrence 测试 |
| D-04 SQLite 备份恢复 | `src-tauri/src/backup.rs`、`src/shared/ipc/backup.ts`、`src/features/data-protection/` | 一致性快照、输入/完整性/schema 校验、恢复/回滚与确认测试 |
| D-05 发布门禁 | `tests/verify-release.mjs`、`package.json`、`src-tauri/tauri.conf.json` | 生产预算、版本一致性、CSP、最小 capability、图标与本机 bundle 构建 |

P0 骨架不开放业务写入；快捷录入在 P1 领域命令就绪前保持禁用，因此不会产生未声明的临时持久化副作用。
