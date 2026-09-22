-- Local SQLite schema for Event Ops acceptance testing (v37 + v40 tables).
-- Translated from api/migrations MySQL DDL. Dev/test only — not applied to prod.

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT,
    role TEXT DEFAULT 'user',
    plan TEXT DEFAULT 'free',
    assigned_plan TEXT,
    assigned_plan_expires_at TEXT,
    capability_version INTEGER DEFAULT 1,
    products TEXT DEFAULT '[]',
    status TEXT DEFAULT 'active',
    clerk_user_id TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS event_plans (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid                VARCHAR(36) UNIQUE NOT NULL,
    event_instance_id   INT NULL,
    parity_event_id     INT NULL,
    year                SMALLINT NOT NULL,
    event_code          VARCHAR(50) NOT NULL,
    event_date          DATE NULL,
    track_name          VARCHAR(255) NULL,
    title               VARCHAR(255) NOT NULL,
    class_scope         VARCHAR(255) NULL,
    plan_type           VARCHAR(32) NOT NULL DEFAULT 'pre_event',
    status              VARCHAR(32) NOT NULL DEFAULT 'draft',
    lifecycle_stage     VARCHAR(32) NOT NULL DEFAULT 'pre_event',
    summary             TEXT NULL,
    created_by          INT NOT NULL,
    approved_by         INT NULL,
    approved_at         TEXT NULL,
    created_at          TEXT DEFAULT (datetime('now')),
    updated_at          TEXT DEFAULT (datetime('now')),
    deleted_at          TEXT NULL
);

CREATE TABLE IF NOT EXISTS event_plan_staff (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    event_plan_id   INT NOT NULL,
    user_id         INT NULL,
    person_id       INT NULL,
    display_name    VARCHAR(255) NOT NULL,
    assignment      VARCHAR(255) NOT NULL,
    radio_number    VARCHAR(50) NULL,
    vehicle         VARCHAR(100) NULL,
    phone           VARCHAR(50) NULL,
    is_active       TINYINT NOT NULL DEFAULT 1,
    arrive_at       TEXT NULL,
    depart_at       TEXT NULL,
    notes           TEXT NULL,
    sort_order      SMALLINT NOT NULL DEFAULT 0,
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now')),
    deleted_at      TEXT NULL
);

CREATE TABLE IF NOT EXISTS event_plan_sections (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    event_plan_id   INT NOT NULL,
    section_key     VARCHAR(100) NOT NULL,
    title           VARCHAR(255) NOT NULL,
    body            TEXT NULL,
    sort_order      SMALLINT NOT NULL DEFAULT 0,
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now')),
    deleted_at      TEXT NULL,
    UNIQUE (event_plan_id, section_key)
);

CREATE TABLE IF NOT EXISTS event_plan_sessions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    event_plan_id   INT NOT NULL,
    session_key     VARCHAR(100) NOT NULL,
    title           VARCHAR(255) NOT NULL,
    class_scope     VARCHAR(255) NULL,
    scheduled_at    TEXT NULL,
    notes           TEXT NULL,
    sort_order      SMALLINT NOT NULL DEFAULT 0,
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now')),
    deleted_at      TEXT NULL
);

CREATE TABLE IF NOT EXISTS event_plan_tasks (
    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    event_plan_id               INT NOT NULL,
    session_id                  INT NULL,
    title                       VARCHAR(255) NOT NULL,
    description                 TEXT NULL,
    task_type                   VARCHAR(32) NOT NULL DEFAULT 'other',
    priority                    VARCHAR(16) NOT NULL DEFAULT 'normal',
    status                      VARCHAR(32) NOT NULL DEFAULT 'open',
    assigned_user_id            INT NULL,
    assigned_person_id          INT NULL,
    due_at                      TEXT NULL,
    completed_at                TEXT NULL,
    completed_by                INT NULL,
    carry_forward_to_next_event TINYINT NOT NULL DEFAULT 0,
    result_summary              TEXT NULL,
    sort_order                  SMALLINT NOT NULL DEFAULT 0,
    created_at                  TEXT DEFAULT (datetime('now')),
    updated_at                  TEXT DEFAULT (datetime('now')),
    deleted_at                  TEXT NULL
);

CREATE TABLE IF NOT EXISTS event_plan_task_targets (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id             INT NOT NULL,
    event_entry_id      INT NULL,
    driver_name         VARCHAR(255) NULL,
    class_code          VARCHAR(50) NULL,
    vehicle_identifier  VARCHAR(255) NULL,
    notes               TEXT NULL,
    created_at          TEXT DEFAULT (datetime('now')),
    updated_at          TEXT DEFAULT (datetime('now')),
    deleted_at          TEXT NULL
);

CREATE TABLE IF NOT EXISTS event_plan_files (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    event_plan_id   INT NOT NULL,
    file_type       VARCHAR(32) NOT NULL DEFAULT 'other',
    title           VARCHAR(255) NOT NULL,
    url             TEXT NULL,
    box_file_id     VARCHAR(255) NULL,
    box_folder_id   VARCHAR(255) NULL,
    notes           TEXT NULL,
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now')),
    deleted_at      TEXT NULL
);

-- ── v40 ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS event_schedule_items (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid                VARCHAR(36) NOT NULL DEFAULT '',
    event_plan_id       INT NOT NULL,
    session_id          INT NULL,
    schedule_date       TEXT NULL,
    day_label           VARCHAR(50) NULL,
    title               VARCHAR(255) NOT NULL DEFAULT '',
    sort_order          INT NOT NULL DEFAULT 0,
    scheduled_time      TEXT NULL,
    scheduled_time_label VARCHAR(60) NULL,
    projected_time      TEXT NULL,
    projected_time_label VARCHAR(60) NULL,
    activity_type       VARCHAR(32) NOT NULL DEFAULT 'other',
    category_code       VARCHAR(50) NULL,
    round_label         VARCHAR(50) NULL,
    expected_car_count  INT NULL,
    comments            TEXT NULL,
    scale_required      TINYINT NOT NULL DEFAULT 0,
    fuel_required       TINYINT NOT NULL DEFAULT 0,
    status              VARCHAR(32) NOT NULL DEFAULT 'upcoming',
    actual_start_at     TEXT NULL,
    actual_end_at       TEXT NULL,
    created_by          INT NULL,
    created_at          TEXT DEFAULT (datetime('now')),
    updated_at          TEXT DEFAULT (datetime('now')),
    deleted_at          TEXT NULL
);

CREATE TABLE IF NOT EXISTS event_schedule_assignments (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    event_plan_id     INT NOT NULL,
    schedule_item_id  INT NOT NULL,
    staff_id          INT NULL,
    assignee_name     VARCHAR(255) NULL,
    responsibility    VARCHAR(255) NOT NULL,
    notes             TEXT NULL,
    sort_order        INT NOT NULL DEFAULT 0,
    created_at        TEXT DEFAULT (datetime('now')),
    updated_at        TEXT DEFAULT (datetime('now')),
    deleted_at        TEXT NULL
);

CREATE TABLE IF NOT EXISTS event_plan_staff_duties (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    event_plan_id   INT NOT NULL,
    staff_id        INT NOT NULL,
    duty            VARCHAR(255) NOT NULL,
    sort_order      INT NOT NULL DEFAULT 0,
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now')),
    deleted_at      TEXT NULL
);

-- Test admin user (JWT user_id=1). Password hash unused — token minted directly.
INSERT INTO users (email, password_hash, name, role, plan, status)
VALUES ('admin@rsa.local', 'unused', 'Local Admin', 'admin', 'nhra', 'active');
