CREATE TABLE module_state (
  module TEXT NOT NULL,
  state_key TEXT NOT NULL,
  value_json TEXT NOT NULL CHECK(json_valid(value_json)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(module, state_key)
);
