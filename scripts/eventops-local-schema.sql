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

-- ══ v41 staffing + canonical event support (SQLite dev shape) ══

CREATE TABLE IF NOT EXISTS parity_tracks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    track_name VARCHAR(255) NOT NULL UNIQUE,
    city VARCHAR(100) NULL,
    state VARCHAR(50) NULL,
    timezone_iana VARCHAR(100) NOT NULL DEFAULT 'America/New_York',
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS parity_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_instance_id INT NULL,
    event_name VARCHAR(255) NOT NULL,
    event_code VARCHAR(20) NULL,
    season_year INT NULL,
    track_id INT NOT NULL REFERENCES parity_tracks(id),
    start_date_local TEXT NOT NULL,
    end_date_local TEXT NOT NULL,
    race_lookup VARCHAR(8) NULL UNIQUE,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS persons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid VARCHAR(36) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    normalized_name VARCHAR(255) NOT NULL,
    person_type VARCHAR(100) NOT NULL DEFAULT 'staff',
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS event_worker_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid VARCHAR(36) NOT NULL,
    user_id INT NOT NULL UNIQUE REFERENCES users(id),
    person_id INT NULL REFERENCES persons(id),
    phone VARCHAR(50) NULL,
    travel_default VARCHAR(20) NULL,
    dietary_category VARCHAR(40) NULL,
    dietary_detail TEXT NULL,
    notes TEXT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS event_worker_beverage_prefs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INT NOT NULL REFERENCES users(id),
    beverage VARCHAR(60) NOT NULL,
    note VARCHAR(255) NULL,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE (user_id, beverage)
);

CREATE TABLE IF NOT EXISTS event_staff_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid VARCHAR(36) NOT NULL,
    parity_event_id INT NOT NULL REFERENCES parity_events(id),
    user_id INT NOT NULL REFERENCES users(id),
    person_id INT NULL REFERENCES persons(id),
    status VARCHAR(20) NOT NULL DEFAULT 'requested',
    availability VARCHAR(20) NOT NULL DEFAULT 'full',
    available_from TEXT NULL,
    available_through TEXT NULL,
    travel_intent VARCHAR(20) NULL,
    lodging_intent VARCHAR(20) NULL,
    roommate_pref VARCHAR(30) NULL,
    roommate_person_id INT NULL REFERENCES persons(id),
    roommate_name VARCHAR(255) NULL,
    dietary_category VARCHAR(40) NULL,
    dietary_detail TEXT NULL,
    notes TEXT NULL,
    requested_at TEXT NOT NULL,
    decided_at TEXT NULL,
    decided_by INT NULL,
    decision_note VARCHAR(500) NULL,
    event_plan_staff_id INT NULL REFERENCES event_plan_staff(id),
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS event_staff_request_beverages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id INT NOT NULL REFERENCES event_staff_requests(id),
    beverage VARCHAR(60) NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE (request_id, beverage)
);

CREATE TABLE IF NOT EXISTS event_staff_request_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id INT NOT NULL REFERENCES event_staff_requests(id),
    status VARCHAR(20) NOT NULL,
    note VARCHAR(500) NULL,
    changed_by INT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS event_staff_classes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    staff_id INT NOT NULL REFERENCES event_plan_staff(id),
    class_code VARCHAR(50) NOT NULL,
    is_primary INT NOT NULL DEFAULT 0,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    deleted_at TEXT NULL
);

CREATE TABLE IF NOT EXISTS event_staff_travel_legs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    staff_id INT NOT NULL REFERENCES event_plan_staff(id),
    leg VARCHAR(12) NOT NULL DEFAULT 'outbound',
    mode VARCHAR(20) NOT NULL,
    airline VARCHAR(80) NULL,
    flight_number VARCHAR(20) NULL,
    origin_code VARCHAR(10) NULL,
    dest_code VARCHAR(10) NULL,
    depart_at TEXT NULL,
    arrive_at TEXT NULL,
    vehicle_desc VARCHAR(255) NULL,
    carpool_with_staff_id INT NULL REFERENCES event_plan_staff(id),
    confirmation VARCHAR(100) NULL,
    notes TEXT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    deleted_at TEXT NULL
);

CREATE TABLE IF NOT EXISTS event_staff_lodging (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    staff_id INT NOT NULL UNIQUE REFERENCES event_plan_staff(id),
    type VARCHAR(20) NOT NULL,
    property_name VARCHAR(255) NULL,
    check_in TEXT NULL,
    check_out TEXT NULL,
    confirmation VARCHAR(100) NULL,
    room_number VARCHAR(40) NULL,
    roommate_staff_id INT NULL REFERENCES event_plan_staff(id),
    roommate_name VARCHAR(255) NULL,
    site_notes TEXT NULL,
    notes TEXT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    deleted_at TEXT NULL
);

-- Canonical event + track + persons for local testing
INSERT OR IGNORE INTO parity_tracks (track_name, city, state, timezone_iana)
VALUES ('US 131 Motorsports Park', 'Martin', 'MI', 'America/Detroit');
INSERT OR IGNORE INTO parity_events (event_name, event_code, season_year, track_id, start_date_local, end_date_local, race_lookup)
VALUES ('2026 US 131 Division 3 LODRS', 'MARTIN_D3', 2026, 1, '2026-08-07', '2026-08-09', 'D3MR26');
INSERT OR IGNORE INTO persons (uuid, display_name, normalized_name, person_type) VALUES
    ('p-russ', 'Russell Hayes', 'russell hayes', 'staff'),
    ('p-joey', 'Joey Martin', 'joey martin', 'staff'),
    ('p-rick', 'Rick Delgado', 'rick delgado', 'staff'),
    ('p-jake', 'Jake Foster', 'jake foster', 'staff'),
    ('p-sam', 'Sam Whitaker', 'sam whitaker', 'staff'),
    ('p-tommy', 'Tommy Ruiz', 'tommy ruiz', 'staff');
-- Worker accounts (JWT users for request flow)
INSERT OR IGNORE INTO users (email, password_hash, name, role, plan, status) VALUES
    ('joey@rsa.local', 'unused', 'Joey Martin', 'user', 'free', 'active'),
    ('rick@rsa.local', 'unused', 'Rick Delgado', 'user', 'free', 'active'),
    ('jake@rsa.local', 'unused', 'Jake Foster', 'user', 'free', 'active');
