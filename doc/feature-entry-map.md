# Life-OS 功能实现入口 Map

> 文档类型：代码导航、数据链路与排障索引  
> 基线日期：2026-08-16  
> 配套需求：`doc/requirements-current.md`

## 1. 如何使用本 Map

遇到问题时按以下顺序定位：

1. 在“功能总表”找到用户看到的入口和 React 组件。
2. 检查该组件使用的资源键、纯函数和局部状态。
3. 若是重启后丢失或保存失败，沿“持久化链路”检查 typed IPC、Rust 服务和 SQLite。
4. 若是行情、通知、备份、菜单栏问题，直接查看对应“跨层链路”。
5. 用“按症状排查索引”选择测试和日志位置。

路径均相对仓库根目录；符号名比行号稳定，建议使用 `rg '<符号名>' <路径>` 定位。

## 2. 启动与总体架构

### 2.1 启动入口

```text
src/main.tsx
  └─ ReactDOM.createRoot(...).render(<App />)
      └─ src/app/App.tsx::App
          ├─ src/app/navigation.ts::modules
          ├─ src/app/useActiveModule.ts::useActiveModule
          ├─ src/features/* 业务组件
          └─ src/shared/ipc/* 前端 IPC 适配器

src-tauri/src/main.rs
  └─ life_os_lib::run()
      └─ src-tauri/src/lib.rs::run
          ├─ 打开/迁移 SQLite
          ├─ 注册 DomainResource/Notification/MarketQuote/Backup 服务
          ├─ 安装原生菜单、macOS 状态项、全局快捷键
          └─ 注册 Tauri commands
```

### 2.2 分层链路

```text
用户操作
  → React feature 组件（表单校验、局部 UI 状态、派生展示）
  → useDomainResource / 专用 shared/ipc adapter（Zod 校验）
  → Tauri invoke / event
  → Rust command（IPC 边界）
  → Rust service/adapter（白名单、事务、外部副作用）
  → SQLite / OS / hq.sinajs.cn
```

### 2.3 全局关键文件

| 责任 | 文件/符号 | 排查重点 |
|---|---|---|
| React 入口 | `src/main.tsx` | 根节点、错误边界、全局样式导入 |
| 应用壳 | `src/app/App.tsx::App` | 模块渲染、快捷键、桌面事件、共享日程状态 |
| 导航定义 | `src/app/navigation.ts::modules` | 模块 ID、标题、顺序 |
| 导航恢复 | `src/app/useActiveModule.ts::useActiveModule` | `life-os.active-module` localStorage |
| 桌面事件 | `src/app/desktopEvents.ts` | `desktop-action`、`menu-todo-complete` |
| 错误边界 | `src/app/AppErrorBoundary.tsx` | React 渲染异常兜底 |
| 设计 token | `src/shared/styles/tokens.css` | 色彩、间距、字体变量 |
| 全局样式 | `src/shared/styles/global.css` | 布局、组件、响应式、告警动画、焦点 |
| Tauri 启动 | `src-tauri/src/lib.rs::run` | 服务注入、插件、command 注册 |
| Tauri 配置 | `src-tauri/tauri.conf.json` | 窗口、CSP、bundle |
| 权限 | `src-tauri/capabilities/default.json` | 前端可用原生能力 |

## 3. 功能总表

| 功能 | 用户入口 | React 组件/函数 | 数据资源/副作用 | 算法/规则入口 | 主要测试 |
|---|---|---|---|---|---|
| 今日总览 | 左侧“今日总览” | `src/features/dashboard/Dashboard.tsx::Dashboard` | `schedule.scheduled`（由 App 注入） | `scheduleState.ts::todayScheduledTasks` | `src/app/App.test.tsx` |
| 人生原则 | 左侧“人生地图” | `src/features/compass/Compass.tsx::Compass` | `compass.principles` | 组件内长度校验 | `src/app/App.test.tsx` |
| 工作四象限 | 左侧“工作” | `src/features/work/Work.tsx::Work` | `work.tasks`、`work.focusIds` | Q1≤2，Top3 仅 Q1/Q2 | `src/app/App.test.tsx` |
| EOD | 工作页“EOD 日终总结” | `src/features/work/Work.tsx::EodForm` | `work.eodSubmitted` | HTML/组件表单校验 | `src/app/App.test.tsx`、静态规格 |
| 任务排期 | 左侧“日程” | `src/features/schedule/Schedule.tsx::Schedule`、`TaskPool`、`DayCanvas` | `schedule.pool`、`schedule.scheduled` | `snapToQuarterHour`、`minutesToTime` | `src/features/schedule/scheduleModel.test.ts`、`src/app/App.test.tsx` |
| 周/月视图 | 日程页 Tab | `WeekView`、`MonthView` | 只读 `schedule.scheduled` | 本地日期、周一为首日 | `App.test.tsx`、静态规格 |
| 生活模板 | 日程页“新增生活日程” | `LifeTemplateManager` | `schedule.lifeSchedules` | `lifeTemplateOccursOn` | `scheduleModel.test.ts` |
| 预算/记账 | 左侧“财务” | `src/features/finance/Finance.tsx::Finance` | 四个 `finance.*` 资源 | `parseMoneyToCents`、`budgetProgress` | `src/features/finance/financeModel.test.ts`、`src/app/App.test.tsx` |
| 物品/食物 | 左侧“物品” | `src/features/items/Items.tsx::Items` | `items.items`、`items.foods` | `itemModel.ts::foodExpiryStatus` | `src/features/items/itemModel.test.ts`、`src/app/App.test.tsx` |
| 人物卡 | 左侧“社交” | `src/features/network/Network.tsx::Network` | `network.people` | 组件内字符串校验 | `src/app/App.test.tsx` |
| 投资 SOP | 投资页顶部卡片 | `src/features/trade/Trade.tsx::Trade` | `trade.sop` | trim、1–500 字 | `src/app/App.test.tsx` |
| 观察列表 | 投资页“观察列表” | `Trade`、`WatchRow` | `trade.watchlist` + 新浪 HTTP | `normalizeWatch`、`isValidTargetRange`、`priceAlert` | `src/features/trade/tradeModel.test.ts`、`src/app/App.test.tsx` |
| 行情轮询 | 进入投资页后自动 | `Trade` 的行情 `useEffect` | `fetch_market_quotes` + `trade.watchlist` | `chinaMarketClock`、`isChinaMarketSession` | `src/shared/ipc/marketQuote.test.ts`、Rust tests |
| 持仓管理 | 投资页“持仓管理” | `WatchSelect`、`PositionRow`、`ClosedPositionRow` | `trade.positions` | 五个价格/盈亏纯函数 | `src/features/trade/tradeModel.test.ts`、`src/app/App.test.tsx` |
| 每日复盘 | 投资页“每日复盘” | `Trade`、`ReviewRow` | `trade.reviews` | 本地日期唯一 | `src/app/App.test.tsx` |
| 学习领域 | 左侧“学习” | `src/features/learning/Learning.tsx::Learning` | `learning.domains` | 完成数/总数派生 | `src/app/App.test.tsx` |
| 快捷录入 | `⌥ Space`/应用菜单 | `src/features/quick-capture/QuickCapture.tsx` | 仅焦点和弹层状态 | Tab focus trap | `src/app/App.test.tsx` |
| 数据保护 | 页头“数据保护” | `src/features/data-protection/DataProtection.tsx` | 备份目录、SQLite 替换 | ID/大小/schema/完整性校验 | `src/shared/ipc/backup.test.ts`、Rust tests |
| macOS 下一待办 | 系统菜单栏 | `App` + `src/shared/ipc/menuBarTodo.ts` | 原生状态项与 Tauri event | `todayScheduledTasks` + 稳定 ID | `src/app/App.test.tsx`、Rust tests |
| 系统通知 | 当前无业务 UI | `src/shared/ipc/notification.ts` | OS notification + `notification_delivery` | 类型白名单、三元组去重 | `src/shared/ipc/notification.test.ts`、Rust tests |

## 4. 领域资源 Map

所有键先由 `src/shared/ipc/domainResource.ts::domainResourceSchema` 校验，再由 `src-tauri/src/domain_resource.rs::RESOURCES` 二次白名单校验。

| 资源键 | 所属组件 | 数据形态 | 主要身份/约束 | SQLite 落点 |
|---|---|---|---|---|
| `compass.principles` | `Compass` | 对象标量 | `{being[], doing[]}` | `domain_value` |
| `dashboard.completedTodoIndexes` | 当前组件未使用 | 数组 | 旧兼容资源 | `domain_entity/value` |
| `work.tasks` | `Work` | 对象标量 | Q1–Q4 → Task[] | `domain_value` |
| `work.focusIds` | `Work` | 字符串数组 | 最多 3 | `domain_entity`（`row-n`） |
| `work.eodSubmitted` | `EodForm` | boolean | 仅提交标记 | `domain_value` |
| `schedule.pool` | `Schedule` | 实体数组 | `Task.id` | `domain_entity` |
| `schedule.scheduled` | `App` | 实体数组 | 稳定任务 ID、date/time/duration/completed | `domain_entity` |
| `schedule.lifeSchedules` | `Schedule` | 实体数组 | 模板 ID、重复规则 | `domain_entity` |
| `finance.budgetCents` | `Finance` | integer | ≥0，整数分 | `domain_value` |
| `finance.spentCents` | `Finance` | integer | ≥0，整数分 | `domain_value` |
| `finance.pending` | `Finance` | 实体数组 | 待评估项 ID、正整数分 | `domain_entity` |
| `finance.lastTransaction` | `Finance` | object/null | 有符号整数分 | `domain_value` |
| `items.foods` | `Items` | 实体数组 | ID、位置、到期日 | `domain_entity` |
| `items.items` | `Items` | 实体数组 | ID、类型、位置 | `domain_entity` |
| `network.people` | `Network` | 实体数组 | Person ID | `domain_entity` |
| `trade.watchlist` | `Trade` | 实体数组 | Watch ID、代码唯一由 UI 保证 | `domain_entity` |
| `trade.positions` | `Trade` | 实体数组 | Position ID、watchlistId 引用由 UI 保证 | `domain_entity` |
| `trade.reviews` | `Trade` | 数组 | 业务身份为 date；存储身份当前为 `row-n` | `domain_entity` |
| `trade.sop` | `Trade` | string | ≤500 | `domain_value` |
| `learning.domains` | `Learning` | 实体数组 | Domain ID，内嵌 milestones/tasks | `domain_entity` |

### 4.1 通用持久化链路

```text
feature 调用 setValue
  → React value 立即更新
  → useDomainResource 第二个 useEffect
  → replaceDomainResource(resource, value, schema, crypto.randomUUID())
  → invoke('replace_domain_resource')
  → commands/mod.rs::replace_domain_resource
  → DomainResourceService::replace
      ├─ 校验资源白名单、requestId、256 KiB 上限
      ├─ 开始 SQLite transaction
      ├─ 检查 command_receipt 幂等性
      ├─ 全量替换 domain_entity/domain_value
      ├─ 写 migration marker + command_receipt
      └─ commit
```

加载链路位于 `useDomainResource` 第一个 `useEffect`。首次读取可能触发 `module_state → domain_*` 的一次性迁移。非 Tauri 环境不会加载或保存，只保留 React 内存状态。

### 4.2 持久化排障要点

- UI 当次正确、重启丢失：看 `useDomainResource.ts` 的 `console.error`、command 是否注册、SQLite 文件权限。
- 只有开发预览丢失：这是预期；浏览器模式没有 Tauri runtime。
- 数据结构解析失败：同时检查组件内 Zod schema 和存储中的 JSON。
- 空数组重新变成 fixture：确认是否非生产模式，以及存储是否真正保存了 `[]` 到 `domain_value`。
- 同一 requestId 冲突：查 `command_receipt` 中对应 command；正常前端每次生成新 UUID。

## 5. 关键算法 Map

| 算法 | 入口 | 输入 → 输出 | 边界/注意事项 |
|---|---|---|---|
| 今日任务筛选排序 | `scheduleState.ts::todayScheduledTasks` | ScheduledTask[] → 当天按 time 排序 | 使用设备本地日期，不是北京时间 |
| 15 分钟吸附 | `scheduleModel.ts::snapToQuarterHour` | minute → `[0,1425]` 最近 15 分钟 | 非有限数返回 0 |
| 分钟转时间 | `scheduleModel.ts::minutesToTime` | minute → `HH:mm` | 内部再次吸附 |
| 重复模板投影 | `scheduleModel.ts::lifeTemplateOccursOn` | template + local Date → boolean | 双周以 anchorDate 中午差值 `%14` |
| 金额转整数分 | `financeModel.ts::parseMoneyToCents` | `+/-N(.NN)` → cents/null | 拒绝 0、指数、千分位、>2 位小数和非安全整数 |
| 预算预警 | `financeModel.ts::budgetProgress` | spent/budget/now → 百分比与 tone | budget=0 视为 100%；时间进度含当天分钟 |
| 食物到期 | `itemModel.ts::foodExpiryStatus` | `YYYY-MM-DD` + today → days/tone/label | 本地中午差；≤3 Crimson，≤7 Amber |
| 目标价兼容 | `tradeModel.ts::normalizeWatch` | 旧 Watch → 三档 Watch | 缺失乐观/悲观时使用中枢价；不改输入对象 |
| 目标区间校验 | `tradeModel.ts::isValidTargetRange` | 四价格 → boolean | 乐观≥中枢≥悲观>0；0≤安全<中枢 |
| 股价告警 | `tradeModel.ts::priceAlert` | current/target/safety → status | 先判达到目标，再判安全价 |
| 浮动/已实现盈亏 | `unrealizedProfitPercent` / `realizedProfitPercent` | cost/current(close) → percent | 非有限或非正价格返回 NaN |
| 目标/安全距离 | `targetDistancePercent` / `safetyDistancePercent` | cost + threshold → percent | 安全距离方向为 `cost/safety-1` |
| 减半仓价 | `halfPositionReductionPrice` | cost/safety → price/null | 仅 cost>safety，公式 `2C-S` |
| 北京交易时段 | `marketQuote.ts::chinaMarketClock` / `isChinaMarketSession` | Date → 时钟/session | 固定 Asia/Shanghai；边界包含 11:30、15:00 |
| 行情代码映射/解析 | `src-tauri/src/market_quote.rs` | 六位代码/GBK响应 → quote | ≤50，≤64 KiB，固定 HTTPS 主机，校验字段/价格/日期时间 |
| 通知去重 | `src-tauri/src/notification.rs::NotificationService::deliver` | entity/type/time → status | 成功三元组唯一；失败可重试 |
| 快照校验恢复 | `src-tauri/src/backup.rs::BackupService::restore` | backup ID → live DB | 拒绝穿越/符号链接；完整性/外键/schema；先建回滚点 |

## 6. 跨层功能链路

### 6.1 今日总览与 macOS 菜单栏单一数据源

```text
App 加载 schedule.scheduled
  ├─ Schedule：排期/退回/增时
  ├─ Dashboard：当天展示/切换完成
  └─ App effect：todayScheduledTasks → 第一条未完成
      → syncMenuBarTodo → Rust sync_menu_bar_todo → macOS tray

用户在 tray 点击“标记完成”
  → Rust emit('menu-todo-complete', stableTaskId)
  → desktopEvents.subscribeMenuTodoCompletion
  → App 按 ID 将 completed=true
  → 持久化 schedule.scheduled
  → effect 自动投影下一条
```

入口文件：`src/app/App.tsx`、`src/features/dashboard/Dashboard.tsx`、`src/features/schedule/scheduleState.ts`、`src/shared/ipc/menuBarTodo.ts`、`src-tauri/src/desktop_shell.rs`。

### 6.2 新浪行情

```text
新增/换股/交易时段轮询
  → fetchMarketQuotes(codes)
  → Zod：1..50 个不重复六位代码
  → invoke('fetch_market_quotes')
  → MarketQuoteService::fetch
      → 代码映射 sh/sz/bj
      → reqwest 固定 hq.sinajs.cn，只读 GET
      → 限制响应大小并解析价格/行情时间
  → 前端 Zod 再校验
  → 新增或替换 trade.watchlist
```

排查顺序：是否桌面 runtime → 是否交易时段（自动刷新）→ 代码格式 → Rust 网络/证书 → 新浪响应是否当日 → `quoteAt` Zod 格式 → watchlist 保存。

### 6.3 数据备份与恢复

```text
页头“数据保护”
  → DataProtection
  → backup.ts typed IPC
  → commands::{list,create,restore}_backup
  → BackupService
      → app_data_dir/backups
      → SQLite online backup
      → 恢复前校验 + 回滚快照
  → 成功后 window.location.reload()
```

数据库与备份目录在 Tauri `app_data_dir` 下创建，具体绝对路径不暴露给 UI。

### 6.4 系统通知

```text
（未来业务调用点）
  → deliverNotification(input)
  → notificationInputSchema
  → invoke('deliver_notification')
  → NotificationService::deliver
      → Rust 二次校验
      → notification_delivery 去重
      → SystemNotificationAdapter::show
```

当前链路从 typed IPC 开始可用，但没有 feature 调用入口。排查“没有系统通知”时先用 `rg 'deliverNotification' src/features` 确认是否已接线。

### 6.5 原生菜单与系统快捷键

```text
src-tauri/src/desktop_shell.rs::install
  → 白名单 menu ID
  → show/focus main window
  → emit('desktop-action')
  → App subscribeDesktopActions
  → 打开 QuickCapture / 切换 dashboard

install_global_shortcut
  → 注册 Alt+Space Pressed
  → 同一 emit_action 链路
```

## 7. Rust/SQLite 实现入口

| 能力 | Command | Service/实现 | 直接副作用 |
|---|---|---|---|
| 健康检查 | `health_check` | `commands/mod.rs` | 无 |
| 资源读取 | `load_domain_resource` | `domain_resource.rs::load` | 读 SQLite；可能一次性迁移 |
| 资源替换 | `replace_domain_resource` | `domain_resource.rs::replace` | 单资源事务写 SQLite |
| 系统通知 | `deliver_notification` | `notification.rs` | 读写收据，可能显示 OS 通知 |
| 创建备份 | `create_backup` | `backup.rs::create` | 写 app-managed 文件 |
| 列出备份 | `list_backups` | `backup.rs::list` | 读目录元数据 |
| 恢复备份 | `restore_backup` | `backup.rs::restore` | 替换 live SQLite，创建回滚点 |
| 行情 | `fetch_market_quotes` | `market_quote.rs::fetch` | 固定主机 HTTPS GET |
| 菜单栏同步 | `sync_menu_bar_todo` | `desktop_shell.rs` | 修改原生瞬时 UI |

数据库入口：

- `src-tauri/src/db.rs`：打开连接、启用约束、顺序执行三版迁移。
- `src-tauri/migrations/001_initial.sql`：领域表、通知收据、命令收据。
- `src-tauri/migrations/002_module_state.sql`：旧 JSON 模块状态。
- `src-tauri/migrations/003_domain_resources.sql`：当前通用实体/标量资源表和迁移标记。
- `src-tauri/src/error.rs`：稳定错误码到前端响应的映射。

## 8. 前端组件树与局部状态

```text
App
├─ Sidebar / page header
├─ Dashboard (scheduled/setScheduled props)
├─ Compass (principles + openForm local)
├─ Work (tasks/focus persisted; openForm/message local)
│  └─ EodForm (submitted persisted)
├─ Schedule (pool/life persisted; view/date/message local)
│  ├─ TaskPool
│  ├─ DayCanvas / WeekView / MonthView
│  └─ LifeTemplateManager
├─ Finance (budget/spent/pending/last persisted; necessary/message local)
├─ Items (foods/items persisted; selected type/message local)
├─ Network (people persisted; message local)
├─ Trade (watchlist/positions/reviews/sop persisted; editing/tab/quote status local)
│  ├─ WatchRow
│  ├─ WatchSelect
│  ├─ PositionRow / ClosedPositionRow
│  └─ ReviewRow
├─ Learning (domains persisted; active workspace/message local)
├─ QuickCapture (open controlled by App; focus refs local)
└─ DataProtection (open controlled by App; list/status/busy local)
```

局部状态在刷新或组件卸载时丢失是预期行为，例如编辑草稿、当前 Tab、弹层开关、消息、日程视图和选择的预览日期。

## 9. 按症状排查索引

| 症状 | 首查入口 | 接着检查 | 常见预期/原因 |
|---|---|---|---|
| 左侧模块点不开/标题不对 | `navigation.ts`、`App.tsx` | `useActiveModule.ts`、localStorage | 无 URL 路由；模块 ID 必须在白名单 |
| 保存后当前页有、重启没了 | `useDomainResource.ts` | `domainResource.ts`、Rust command、`domain_*` 表 | IPC 失败仅 console.error；浏览器预览不持久化 |
| 生产环境没有示例卡片 | 具体 feature 的 `import.meta.env.PROD` | `shared/demoData.ts` | 生产主动移除 fixture |
| 今日总览与菜单栏不一致 | `App.tsx` 的三个 schedule effects | `todayScheduledTasks`、desktop events | 菜单栏只取今日第一条未完成 |
| 菜单栏完成了错误任务 | `desktop_shell.rs::current_id` | event payload 正则、App 按 ID map | 不应使用数组索引 |
| 排期后池和日程同时有/同时无 | `Schedule::scheduleTask/unscheduleTask` | 两个资源的 IPC 保存 | 两次资源替换不是后端原子事务 |
| 生活模板某天不出现 | `lifeTemplateOccursOn` | weekday/monthDay/anchorDate、本地日期 | 双周必须有 anchorDate 且 weekday 匹配 |
| 金额被拒绝 | `parseMoneyToCents` | 输入正负号和小数位 | 零、千分位、指数和三位小数都拒绝 |
| 预算颜色异常 | `budgetProgress` | 设备年月日/时分、budget=0 | 时间进度按本地当前月实时计算 |
| 食物提前/延后一天告警 | `foodExpiryStatus` | 输入日期、设备本地时区 | 算法用本地中午，避免 UTC 漂移 |
| 股票新增按钮一直失败 | `Trade::addWatch` | `fetchMarketQuotes`、Rust adapter | 浏览器版不可用；必须先成功取价 |
| 股票不自动刷新 | `Trade` 行情 effect | `isChinaMarketSession`、quoteAt 日期 | 非交易时段不请求；三次陈旧暂停当天 |
| 换股后价格没变 | `Trade::updateWatch` | draft.code 是否真的变化、行情错误 | 代码未变沿用旧价；换股失败不保存 |
| 观察标的删不掉 | `Trade::deleteWatch` | `trade.positions` 含当前或已清仓引用 | 引用保护是预期，不级联删除 |
| 盈亏/距离/减仓价异常 | `tradeModel.ts` | 成本、现价、中枢价、安全价 | 确认公式方向；非法价格返回 NaN/null |
| 清仓记录没出现在历史 | `closePosition`、`positionSchema` | 三个 close 字段是否同时存在 | Tab 仅按 `closedAt` 派生 |
| 告警有颜色但无系统通知 | feature 是否调用 `deliverNotification` | `notification.ts` / Rust service | 当前业务尚未接线，属现状 |
| 快捷录入不能输入 | `QuickCapture.tsx` | 无 | 输入被明确 disabled，属占位 |
| 备份列表不可用 | `DataProtection.tsx` | 是否 Tauri runtime、`backup.rs` | 浏览器预览只显示安全降级提示 |
| 恢复失败 | `backup.rs::restore/validate_database` | ID、symlink、integrity、FK、schema | 失败应回滚并保留当前数据 |
| 样式/动画不对 | `global.css`、`tokens.css` | reduced-motion、alert class | reduced-motion 下动画关闭是预期 |

## 10. 测试与验证入口

| 范围 | 命令 | 入口 |
|---|---|---|
| TypeScript | `npm run typecheck` | `tsconfig*.json` |
| 前端单元/组件 | `npx vitest run` 或 `npm test` | `src/**/*.test.ts(x)` |
| 原型/静态规格 | `node tests/verify.mjs` | `tests/verify.mjs` |
| Rust/SQLite | `cargo test --manifest-path src-tauri/Cargo.toml` | `src-tauri/src/**/*.rs` 内 `#[cfg(test)]` |
| 生产构建 | `npm run build` | TypeScript + Vite |
| 发布安全/预算 | `npm run release:audit` | `tests/verify-release.mjs` |
| 全量本地门禁 | `npm run check` | typecheck + 前端 + 静态 + Rust |
| 发布门禁 | `npm run release:verify` | build + check + release audit |
| 桌面 bundle | `npm run desktop:bundle` | Tauri app + dmg |

按模块选择测试：

- 壳层/菜单/九模块交互：`src/app/App.test.tsx`
- 日程算法：`src/features/schedule/scheduleModel.test.ts`
- 财务算法：`src/features/finance/financeModel.test.ts`
- 物品算法：`src/features/items/itemModel.test.ts`
- 投资算法：`src/features/trade/tradeModel.test.ts`
- IPC schema：`src/shared/ipc/*.test.ts`
- 生产 fixture：`src/shared/demoData.test.ts`
- Rust 服务：对应 `.rs` 文件底部测试模块

## 11. 文档维护规则

后续功能变更应在同一提交中同步更新：

1. `doc/requirements-current.md` 的状态、规则、副作用与已知缺口。
2. 本文档的用户入口、组件、资源、算法和测试映射。
3. 若引入新领域资源，同时更新前端 `domainResourceSchema`、Rust `RESOURCES`、schema/测试和本文资源表。
4. 若引入外部副作用，明确 adapter、白名单、失败降级、幂等/重试和审计入口。
5. 若实现状态从演示/占位转为可用，删除旧限制描述，避免排障人员依据过期假设。
