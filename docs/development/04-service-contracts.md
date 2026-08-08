# 领域服务契约

所有命令参数先通过 TypeScript schema 校验，再在 Tauri 侧重复校验。命令成功后返回完整更新实体或稳定 ID，不返回裸 SQL 行。

## DomainResourceService（P1–P5 迁移边界）

- `loadDomainResource(resource)`：读取白名单资源并重组 DTO；首次访问可从 P0 状态表事务导入。副作用：读 SQLite；首次访问可能写实体行和迁移标记。
- `replaceDomainResource(resource, value, requestId)`：按实体替换集合或写入领域单值。副作用：事务写领域行、审计时间戳与幂等收据。
- 此服务是冻结原型到下列细粒度业务服务的迁移边界，不接受任意表名、状态键或 SQL。

## TaskService

- `createTask(input, requestId)`：创建来源任务。副作用：写 task。
- `scheduleTask(taskId, start, end, requestId)`：排期。副作用：更新 task；检测时间合法性。
- `unscheduleTask(taskId, requestId)`：清除排期。副作用：更新 task。
- `completeTask(taskId, completed, requestId)`：双向同步完成状态。副作用：更新 task。

## WorkService

- `createWorkTask`：校验 quadrant；Q1 活跃数量达到 2 时返回 CONFLICT。
- `saveEod(input, requestId)`：同日 upsert EOD，并原子创建明日任务和知识待筛选条目。
- `selectTodayFocus(taskIds)`：只接受 1–3 个 Q1/Q2 活跃任务。

## ScheduleService

- `queryDay/queryWeek/queryMonth(range)`：返回普通任务与生活模板投影的统一只读 DTO。
- `saveLifeTemplate`：新增或修改重复模板。
- `deleteLifeTemplate`：软删除模板。
- 生活模板投影 DTO 标记 `editable=false`，排期命令收到该 ID 时必须拒绝。
- `syncMenuBarTodo(todo|null)`：仅接收校验后的稳定任务 ID、`HH:mm` 时间和最长 200 字标题，在 macOS 更新菜单栏短标题、完整菜单文本与当前完成目标；`null` 显示“今日完成”。副作用仅限系统菜单栏瞬时 UI，不写数据库、不发网络请求。
- 菜单栏“标记完成”发送当前稳定任务 ID；React 按 ID 更新 `schedule.scheduled.completed`，既有领域资源命令负责事务持久化。

## FinanceService

- `recordTransaction`：必要支出即时入账；非必要支出状态为 pending。
- `settleMonth(month, requestId)`：在单事务中判断结余并更新待评估项。
- `updateBudget`：更新后返回预算比例、时间比例和预警级别。

## ItemService

- `createItem/updateItem`：所有类型校验 location；food 校验 expiryDate。
- `queryFoodInventory`：返回全部 active food，不分页截断。
- `queryItemAlerts(now)`：派生食物、使用时期和维护预警。

## TradeService

- `createPosition`：watchlistId 必填，数据库外键再次保证。
- `updateWatchPrice`：更新现价并返回逐股预警。
- `fetchMarketQuotes(codes)`：仅接受最多 50 个不重复的沪深北 A 股六位代码，映射为新浪固定行情标识并批量查询；返回代码、现价、行情日期和时间。副作用：只读访问 `https://hq.sinajs.cn`，不写数据库；网络/HTTP/解析失败返回 `EXTERNAL_SERVICE_ERROR`，非法输入返回 `VALIDATION_ERROR`。
- `saveDailyReview(date, content, requestId)`：按日期 upsert。

## LearningService

- `createDomain/updateDomain/archiveDomain`：外层领域管理。
- `addMilestone/toggleMilestone`：更新后返回派生进度。
- `addLearningTask/toggleLearningTask`：任务必须属于领域，并创建统一 task 引用。

## NotificationService

- `deliverNotification(input)`：双端校验通知白名单与文本边界，按 `(entityId, alertType, occurrenceAt)` 创建或复用投递收据，经系统通知 adapter 投递；成功返回 `delivered`，已成功过返回 `duplicate`，平台或权限失败返回 `EXTERNAL_SERVICE_ERROR` 并允许重试。
- 副作用：读取/写入 `notification_delivery`，成功路径调用一次系统通知 adapter；不修改领域实体，不发网络请求。

## 查询副作用

所有 `query*` 无写副作用。所有 `create/update/save/toggle/settle/delete` 明确写数据库并产生审计时间戳。外部通知和行情请求只能经 adapter 调用。
