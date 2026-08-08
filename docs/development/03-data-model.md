# SQLite 数据模型

## 通用约定

- ID 使用应用生成的 UUID 文本。
- 时间存 ISO-8601；本地展示使用系统时区。
- 业务表包含 `created_at`、`updated_at`，可恢复删除使用 `deleted_at`。
- 外键始终开启；迁移在事务中执行。

## 核心表

### task

`id`, `source_module`, `source_entity_id`, `title`, `status`, `quadrant`, `priority`, `scheduled_start`, `scheduled_end`, `completed_at`, `north_star_id`, timestamps。

约束：工作任务 `quadrant IN ('Q1','Q2','Q3','Q4')`；未排期时开始/结束同时为空；已排期时结束晚于开始。

### life_schedule_template

`id`, `title`, `frequency`, `weekday`, `month_day`, `start_time`, `anchor_date`, timestamps。

约束：frequency 为 daily/weekly/biweekly/monthly；周频必须有 weekday；月频必须有 1–31 的 month_day。日历中的生活日程是查询投影，不创建 task 副本。

### work_eod

`id`, `review_date UNIQUE`, `overtime_minutes`, `done_text`, `tomorrow_plan`, `gain_text`, timestamps。

### monthly_budget / transaction / subscription

- `monthly_budget(month UNIQUE, budget_limit)`
- `transaction(id, occurred_at, amount, note, is_necessary, settlement_status, category)`
- `subscription(id, name, amount, next_charge_at, cycle)`

### item

`id`, `name`, `type`, `location`, `detail`, `opened_at`, `shelf_life_days`, `expiry_date`, `logged_at`, `occurred_at`, timestamps。

约束：type=food 时 `expiry_date NOT NULL`；所有 active item 的 location 非空。

### person / important_date / interaction

人物核心表与日期、互动子表分离；重要日期以 person 外键级联管理。

### watchlist / position / trade / daily_review

- `position.watchlist_id NOT NULL REFERENCES watchlist(id)`。
- 未清仓 position 不含 `closePrice`、`profitPercent`、`closedAt`；已清仓 position 必须同时包含三者，其中价格为有限正数、日期为 `YYYY-MM-DD`。
- `daily_review.review_date UNIQUE`。
- 交易明细引用 position，不允许孤立持仓。

### learning_domain / learning_milestone / learning_task

- 里程碑和任务必须引用 domain。
- 领域进度查询为已完成里程碑数/总里程碑数。
- learning_task 同时映射统一 task 排期字段，不维护日程副本。

## 索引

- task(status, scheduled_start)
- task(source_module, source_entity_id)
- item(type, expiry_date)
- important_date(date)
- transaction(occurred_at, settlement_status)
- watchlist(code UNIQUE)
- learning_task(domain_id, status)

## 迁移

迁移只前进不回写历史文件。破坏性结构变化采用“新表 → 校验复制 → 切换 → 删除旧表”，并在迁移测试中使用真实旧版本 fixture。

### P1–P5 领域资源迁移

- `domain_entity(resource, entity_id, position, value_json, timestamps)`：原型领域集合的按实体过渡存储；`(resource, entity_id)` 唯一，顺序在同一资源内唯一。
- `domain_value(resource, value_json, timestamps)`：标量、对象及显式空集合的单值存储。
- `domain_resource_migration(resource, migrated_at)`：记录旧 `module_state` 键已完成一次性导入，防止回读陈旧数据。
- `module_state` 自 schema v3 起只读兼容，不再接受写入；各资源可继续逐项投影到上文核心业务表而无需修改历史迁移。
