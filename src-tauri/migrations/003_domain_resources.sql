CREATE TABLE domain_entity (
  resource TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  position INTEGER NOT NULL CHECK(position >= 0),
  value_json TEXT NOT NULL CHECK(json_valid(value_json)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(resource, entity_id),
  UNIQUE(resource, position)
);
CREATE INDEX domain_entity_resource_position_idx ON domain_entity(resource, position);

CREATE TABLE domain_value (
  resource TEXT PRIMARY KEY,
  value_json TEXT NOT NULL CHECK(json_valid(value_json)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE domain_resource_migration (
  resource TEXT PRIMARY KEY,
  migrated_at TEXT NOT NULL
);
