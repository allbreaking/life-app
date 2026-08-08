CREATE TABLE command_receipt (
  request_id TEXT PRIMARY KEY, command TEXT NOT NULL, result_id TEXT, created_at TEXT NOT NULL
);
CREATE TABLE task (
  id TEXT PRIMARY KEY, source_module TEXT NOT NULL, source_entity_id TEXT, title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 200),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','completed','archived')), quadrant TEXT CHECK(quadrant IN ('Q1','Q2','Q3','Q4')),
  priority INTEGER, scheduled_start TEXT, scheduled_end TEXT, completed_at TEXT, north_star_id TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT,
  CHECK((scheduled_start IS NULL AND scheduled_end IS NULL) OR (scheduled_start IS NOT NULL AND scheduled_end > scheduled_start)),
  CHECK(source_module <> 'work' OR quadrant IS NOT NULL)
);
CREATE INDEX task_status_schedule_idx ON task(status, scheduled_start);
CREATE INDEX task_source_idx ON task(source_module, source_entity_id);
CREATE TABLE life_schedule_template (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, frequency TEXT NOT NULL CHECK(frequency IN ('daily','weekly','biweekly','monthly')),
  weekday INTEGER, month_day INTEGER, start_time TEXT NOT NULL, anchor_date TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT,
  CHECK(frequency NOT IN ('weekly','biweekly') OR weekday BETWEEN 0 AND 6), CHECK(frequency <> 'monthly' OR month_day BETWEEN 1 AND 31)
);
CREATE TABLE work_eod (id TEXT PRIMARY KEY, review_date TEXT NOT NULL UNIQUE, overtime_minutes INTEGER NOT NULL DEFAULT 0 CHECK(overtime_minutes >= 0), done_text TEXT, tomorrow_plan TEXT, gain_text TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE monthly_budget (id TEXT PRIMARY KEY, month TEXT NOT NULL UNIQUE, budget_limit INTEGER NOT NULL CHECK(budget_limit >= 0), created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE finance_transaction (id TEXT PRIMARY KEY, occurred_at TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount >= 0), note TEXT, is_necessary INTEGER NOT NULL CHECK(is_necessary IN (0,1)), settlement_status TEXT NOT NULL CHECK(settlement_status IN ('settled','pending','rejected')), category TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT);
CREATE INDEX transaction_date_status_idx ON finance_transaction(occurred_at, settlement_status);
CREATE TABLE subscription (id TEXT PRIMARY KEY, name TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount >= 0), next_charge_at TEXT NOT NULL, cycle TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT);
CREATE TABLE item (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, location TEXT NOT NULL CHECK(length(trim(location)) > 0), detail TEXT, opened_at TEXT,
  shelf_life_days INTEGER CHECK(shelf_life_days > 0), expiry_date TEXT, logged_at TEXT, occurred_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT,
  CHECK(type <> 'food' OR expiry_date IS NOT NULL)
);
CREATE INDEX item_type_expiry_idx ON item(type, expiry_date);
CREATE TABLE person (id TEXT PRIMARY KEY, name TEXT NOT NULL, relationship TEXT, preferences TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT);
CREATE TABLE important_date (id TEXT PRIMARY KEY, person_id TEXT NOT NULL REFERENCES person(id) ON DELETE CASCADE, date TEXT NOT NULL, title TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE INDEX important_date_date_idx ON important_date(date);
CREATE TABLE interaction (id TEXT PRIMARY KEY, person_id TEXT NOT NULL REFERENCES person(id) ON DELETE CASCADE, occurred_at TEXT NOT NULL, note TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE watchlist (id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, current_price INTEGER, target_price INTEGER, safety_price INTEGER, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT);
CREATE TABLE position (id TEXT PRIMARY KEY, watchlist_id TEXT NOT NULL REFERENCES watchlist(id), quantity INTEGER NOT NULL CHECK(quantity > 0), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT);
CREATE TABLE trade (id TEXT PRIMARY KEY, position_id TEXT NOT NULL REFERENCES position(id), side TEXT NOT NULL CHECK(side IN ('buy','sell')), quantity INTEGER NOT NULL CHECK(quantity > 0), price INTEGER NOT NULL CHECK(price >= 0), occurred_at TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE daily_review (id TEXT PRIMARY KEY, review_date TEXT NOT NULL UNIQUE, content TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE learning_domain (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT);
CREATE TABLE learning_milestone (id TEXT PRIMARY KEY, domain_id TEXT NOT NULL REFERENCES learning_domain(id), title TEXT NOT NULL, completed_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE learning_task (id TEXT PRIMARY KEY, domain_id TEXT NOT NULL REFERENCES learning_domain(id), task_id TEXT NOT NULL UNIQUE REFERENCES task(id), status TEXT NOT NULL CHECK(status IN ('active','completed')), created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE INDEX learning_task_domain_status_idx ON learning_task(domain_id, status);
CREATE TABLE notification_delivery (id TEXT PRIMARY KEY, entity_id TEXT NOT NULL, alert_type TEXT NOT NULL, occurrence_at TEXT NOT NULL, delivered_at TEXT, UNIQUE(entity_id, alert_type, occurrence_at));
