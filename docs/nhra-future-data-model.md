# NHRA Tech Services — Future Data Model
_Last updated: 2026-05-07 | Planning document — no migrations should be run from this doc without explicit approval_

---

## Design Principles

1. **Additive only** — new tables never alter existing parity tables
2. **Nullable FKs** — new FK references to existing tables are always nullable to avoid breaking current inserts
3. **Soft deletes** — use `deleted_at TIMESTAMP NULL` rather than hard deletes on anything that might be audited
4. **Audit trail** — anything changed by a user gets an `updated_at` + optional history table
5. **Generic linking** — an `entity_links` table allows cross-module relationships without coupling schemas
6. **Effective dates** — rules, memberships, and assignments use `effective_from`/`effective_to` (already proven in parity combo system)
7. **Status history** — for anything with a lifecycle (cases, change requests, action items), maintain a separate `*_status_history` table

---

## Existing Core Tables (Do Not Modify)

Already live and deployed. Listed here for reference when designing FKs.

```
users                   id, uuid, email, role_id, plan, ...
parity_runs             id, uuid, race_lookup, driver_name, class_index, ...
parity_engine_combos    id, name, category, class_index, ...
parity_driver_combos    id, driver_name, class_index, engine_combo_id, effective_from_utc, ...
parity_events           id, name, track_id, start_date, end_date, ...
parity_tracks           id, name, timezone, lat, lng, ...
persons                 id, uuid, normalized_name, status, ...
organizations           id, uuid, name, type, status, ...
vehicle_assets          id, uuid, make, model, year, status, ...
event_instances         id, name, season_id, event_type_id, ...
event_entries           id, event_instance_id, person_id, org_id, vehicle_id, ...
tech_cases              id, uuid, event_entry_id, status, ...
tech_findings           id, tech_case_id, type, severity, ...
```

---

## Phase 1: Entity Links (Foundation for Cross-Module Relationships)

### `entity_links`
Polymorphic linking table. Allows any entity to reference any other without schema coupling.

```sql
CREATE TABLE IF NOT EXISTS entity_links (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    from_type       VARCHAR(100) NOT NULL,  -- e.g. 'rule', 'case', 'part', 'meeting_decision'
    from_id         INT NOT NULL,
    to_type         VARCHAR(100) NOT NULL,  -- e.g. 'parity_run', 'person', 'event_instance'
    to_id           INT NOT NULL,
    link_type       VARCHAR(100) NOT NULL,  -- e.g. 'cited_in', 'applies_to', 'related_to'
    notes           TEXT NULL,
    created_by      INT NULL REFERENCES users(id),
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_el_from (from_type, from_id),
    INDEX idx_el_to   (to_type, to_id)
);
```

---

## Phase 2: Rules & Governance

### `rules`
The current rulebook, one row per rule.

```sql
CREATE TABLE IF NOT EXISTS rules (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    uuid            VARCHAR(36) UNIQUE NOT NULL,
    rule_number     VARCHAR(50) NOT NULL,       -- e.g. '6.1.2', 'A-001'
    category        VARCHAR(100) NOT NULL,      -- e.g. 'Technical', 'Safety', 'Eligibility'
    class_scope     VARCHAR(255) NULL,          -- NULL = all classes; comma-sep or JSON array
    title           VARCHAR(500) NOT NULL,
    body            TEXT NOT NULL,              -- full rule text (Markdown ok)
    status          ENUM('active','superseded','proposed','deleted') DEFAULT 'active',
    effective_from  DATE NOT NULL,
    effective_to    DATE NULL,
    current_version_id INT NULL,               -- FK to rule_versions.id (set after first version)
    created_by      INT NULL REFERENCES users(id),
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at      TIMESTAMP NULL,
    INDEX idx_rules_status (status),
    INDEX idx_rules_category (category)
);
```

### `rule_versions`
Full version history for every rule.

```sql
CREATE TABLE IF NOT EXISTS rule_versions (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    rule_id         INT NOT NULL REFERENCES rules(id),
    version_number  INT NOT NULL,
    rule_number     VARCHAR(50) NOT NULL,
    title           VARCHAR(500) NOT NULL,
    body            TEXT NOT NULL,
    change_summary  TEXT NULL,
    effective_from  DATE NOT NULL,
    effective_to    DATE NULL,
    created_by      INT NULL REFERENCES users(id),
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_rv_rule_version (rule_id, version_number)
);
```

### `rule_change_requests`
Proposed changes to existing or new rules.

```sql
CREATE TABLE IF NOT EXISTS rule_change_requests (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    uuid            VARCHAR(36) UNIQUE NOT NULL,
    rule_id         INT NULL REFERENCES rules(id),  -- NULL = new rule request
    title           VARCHAR(500) NOT NULL,
    proposed_text   TEXT NOT NULL,
    rationale       TEXT NULL,
    status          ENUM('draft','submitted','under_review','approved','rejected','withdrawn') DEFAULT 'draft',
    submitted_by    INT NULL REFERENCES users(id),
    submitted_at    TIMESTAMP NULL,
    reviewed_by     INT NULL REFERENCES users(id),
    reviewed_at     TIMESTAMP NULL,
    effective_from  DATE NULL,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at      TIMESTAMP NULL,
    INDEX idx_rcr_status (status),
    INDEX idx_rcr_rule (rule_id)
);
```

### `rule_change_request_comments`
Discussion thread per change request.

```sql
CREATE TABLE IF NOT EXISTS rule_change_request_comments (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    request_id      INT NOT NULL REFERENCES rule_change_requests(id),
    author_id       INT NULL REFERENCES users(id),
    body            TEXT NOT NULL,
    is_internal     TINYINT(1) DEFAULT 0,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at      TIMESTAMP NULL,
    INDEX idx_rcrc_request (request_id)
);
```

### `rule_change_request_status_history`

```sql
CREATE TABLE IF NOT EXISTS rule_change_request_status_history (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    request_id      INT NOT NULL REFERENCES rule_change_requests(id),
    from_status     VARCHAR(50) NULL,
    to_status       VARCHAR(50) NOT NULL,
    changed_by      INT NULL REFERENCES users(id),
    notes           TEXT NULL,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_rcrsh_request (request_id)
);
```

---

## Phase 3: Rules Committees

### `rules_committees`

```sql
CREATE TABLE IF NOT EXISTS rules_committees (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    uuid            VARCHAR(36) UNIQUE NOT NULL,
    name            VARCHAR(255) NOT NULL,
    short_name      VARCHAR(100) NULL,
    category        VARCHAR(100) NULL,
    description     TEXT NULL,
    status          ENUM('active','inactive','dissolved') DEFAULT 'active',
    formed_date     DATE NULL,
    dissolved_date  DATE NULL,
    created_by      INT NULL REFERENCES users(id),
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at      TIMESTAMP NULL
);
```

### `committee_memberships`
Tracks who holds what role on which committee, with effective dates.

```sql
CREATE TABLE IF NOT EXISTS committee_memberships (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    committee_id    INT NOT NULL REFERENCES rules_committees(id),
    person_id       INT NOT NULL REFERENCES persons(id),
    role            ENUM('chairman','co_chairman','member','secretary','liaison','guest','observer') NOT NULL,
    effective_from  DATE NOT NULL,
    effective_to    DATE NULL,
    appointed_by    INT NULL REFERENCES users(id),
    notes           TEXT NULL,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_cm_committee (committee_id),
    INDEX idx_cm_person (person_id)
);
```

---

## Phase 4: Committee Meetings

### `committee_meetings`

```sql
CREATE TABLE IF NOT EXISTS committee_meetings (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    uuid            VARCHAR(36) UNIQUE NOT NULL,
    committee_id    INT NOT NULL REFERENCES rules_committees(id),
    title           VARCHAR(500) NULL,
    meeting_date    DATETIME NOT NULL,
    location        VARCHAR(500) NULL,          -- physical location or "Virtual"
    meeting_type    ENUM('regular','special','emergency','working_group') DEFAULT 'regular',
    status          ENUM('scheduled','in_progress','completed','cancelled') DEFAULT 'scheduled',
    agenda          TEXT NULL,                  -- Markdown
    minutes         TEXT NULL,                  -- Markdown
    minutes_approved_at TIMESTAMP NULL,
    minutes_approved_by INT NULL REFERENCES users(id),
    created_by      INT NULL REFERENCES users(id),
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_cmt_committee (committee_id),
    INDEX idx_cmt_date (meeting_date)
);
```

### `committee_meeting_attendees`

```sql
CREATE TABLE IF NOT EXISTS committee_meeting_attendees (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    meeting_id      INT NOT NULL REFERENCES committee_meetings(id),
    person_id       INT NULL REFERENCES persons(id),
    name_override   VARCHAR(255) NULL,          -- for guests without a person record
    role            VARCHAR(100) NULL,          -- their role at this meeting (may differ from membership)
    attendance_type ENUM('in_person','virtual','proxy') DEFAULT 'in_person',
    present         TINYINT(1) DEFAULT 1,
    notes           TEXT NULL,
    INDEX idx_cma_meeting (meeting_id),
    INDEX idx_cma_person (person_id)
);
```

### `committee_decisions`

```sql
CREATE TABLE IF NOT EXISTS committee_decisions (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    uuid            VARCHAR(36) UNIQUE NOT NULL,
    meeting_id      INT NOT NULL REFERENCES committee_meetings(id),
    committee_id    INT NOT NULL REFERENCES rules_committees(id),
    title           VARCHAR(500) NOT NULL,
    body            TEXT NOT NULL,
    decision_type   ENUM('motion','resolution','directive','recommendation','tabled') DEFAULT 'motion',
    vote_for        INT NULL,
    vote_against    INT NULL,
    vote_abstain    INT NULL,
    outcome         ENUM('passed','failed','tabled','withdrawn') NULL,
    effective_date  DATE NULL,
    created_by      INT NULL REFERENCES users(id),
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_cd_meeting (meeting_id),
    INDEX idx_cd_committee (committee_id)
);
```

### `committee_action_items`

```sql
CREATE TABLE IF NOT EXISTS committee_action_items (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    uuid            VARCHAR(36) UNIQUE NOT NULL,
    meeting_id      INT NULL REFERENCES committee_meetings(id),
    committee_id    INT NOT NULL REFERENCES rules_committees(id),
    title           VARCHAR(500) NOT NULL,
    description     TEXT NULL,
    assigned_to_person_id INT NULL REFERENCES persons(id),
    assigned_to_user_id   INT NULL REFERENCES users(id),
    due_date        DATE NULL,
    priority        ENUM('high','medium','low') DEFAULT 'medium',
    status          ENUM('open','in_progress','completed','cancelled') DEFAULT 'open',
    completed_at    TIMESTAMP NULL,
    created_by      INT NULL REFERENCES users(id),
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_cai_committee (committee_id),
    INDEX idx_cai_meeting (meeting_id),
    INDEX idx_cai_status (status)
);
```

---

## Phase 5: Publications & Bulletins

### `publications`
Technical bulletins, competition bulletins, memos, interpretations.

```sql
CREATE TABLE IF NOT EXISTS publications (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    uuid            VARCHAR(36) UNIQUE NOT NULL,
    pub_type        ENUM('technical_bulletin','competition_bulletin','memo','interpretation','directive','notice') NOT NULL,
    pub_number      VARCHAR(100) NULL,          -- e.g. 'TB-2026-001'
    title           VARCHAR(500) NOT NULL,
    body            TEXT NULL,                  -- Markdown body text
    is_internal     TINYINT(1) DEFAULT 0,       -- 0 = public, 1 = internal only
    issued_by       VARCHAR(255) NULL,          -- name of issuing authority
    issued_date     DATE NULL,
    effective_date  DATE NULL,
    expiry_date     DATE NULL,
    status          ENUM('draft','published','superseded','archived') DEFAULT 'draft',
    superseded_by   INT NULL REFERENCES publications(id),
    created_by      INT NULL REFERENCES users(id),
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at      TIMESTAMP NULL,
    INDEX idx_pub_type (pub_type),
    INDEX idx_pub_status (status),
    INDEX idx_pub_effective (effective_date)
);
```

### `publication_items`
Individual line items / sections within a publication.

```sql
CREATE TABLE IF NOT EXISTS publication_items (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    publication_id  INT NOT NULL REFERENCES publications(id),
    item_number     VARCHAR(50) NULL,
    title           VARCHAR(500) NULL,
    body            TEXT NOT NULL,
    sort_order      INT DEFAULT 0,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_pi_pub (publication_id)
);
```

---

## Phase 6: Cases & Violations

_Note: `tech_cases` and `tech_findings` already exist for Tech Master inspection cases.  
The tables below are for SOAAPs, DQs, formal violations, and appeals — a separate track._

### `cases`
Formal cases: DQs, violations, investigations, appeals.

```sql
CREATE TABLE IF NOT EXISTS cases (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    uuid            VARCHAR(36) UNIQUE NOT NULL,
    case_number     VARCHAR(100) NULL,          -- e.g. 'VIO-2026-001'
    case_type       ENUM('dq','violation','sooap','appeal','investigation','warning') NOT NULL,
    title           VARCHAR(500) NOT NULL,
    description     TEXT NULL,
    status          ENUM('open','under_review','resolved','closed','appealed') DEFAULT 'open',
    severity        ENUM('info','warning','minor','major','critical') NULL,
    person_id       INT NULL REFERENCES persons(id),
    org_id          INT NULL REFERENCES organizations(id),
    event_instance_id INT NULL REFERENCES event_instances(id),
    event_entry_id  INT NULL REFERENCES event_entries(id),
    parity_run_id   INT NULL,                   -- loose FK to parity_runs (no hard constraint)
    assigned_to     INT NULL REFERENCES users(id),
    resolved_at     TIMESTAMP NULL,
    created_by      INT NULL REFERENCES users(id),
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at      TIMESTAMP NULL,
    INDEX idx_cases_type (case_type),
    INDEX idx_cases_status (status),
    INDEX idx_cases_person (person_id)
);
```

### `case_events`
Timeline of events within a case.

```sql
CREATE TABLE IF NOT EXISTS case_events (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    case_id         INT NOT NULL REFERENCES cases(id),
    event_type      VARCHAR(100) NOT NULL,      -- e.g. 'status_change', 'note', 'decision', 'document_added'
    body            TEXT NULL,
    created_by      INT NULL REFERENCES users(id),
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_ce_case (case_id)
);
```

### `case_status_history`

```sql
CREATE TABLE IF NOT EXISTS case_status_history (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    case_id         INT NOT NULL REFERENCES cases(id),
    from_status     VARCHAR(50) NULL,
    to_status       VARCHAR(50) NOT NULL,
    changed_by      INT NULL REFERENCES users(id),
    notes           TEXT NULL,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_csh_case (case_id)
);
```

---

## Phase 7: Parts & Approvals

### `parts`

```sql
CREATE TABLE IF NOT EXISTS parts (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    uuid            VARCHAR(36) UNIQUE NOT NULL,
    part_number     VARCHAR(255) NULL,
    name            VARCHAR(500) NOT NULL,
    category        VARCHAR(255) NULL,          -- e.g. 'engine', 'chassis', 'tire'
    manufacturer    VARCHAR(255) NULL,
    description     TEXT NULL,
    status          ENUM('pending','approved','conditionally_approved','rejected','superseded') DEFAULT 'pending',
    class_scope     VARCHAR(255) NULL,
    effective_from  DATE NULL,
    effective_to    DATE NULL,
    created_by      INT NULL REFERENCES users(id),
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at      TIMESTAMP NULL,
    INDEX idx_parts_status (status),
    INDEX idx_parts_category (category)
);
```

### `part_approvals`
Approval decisions per part.

```sql
CREATE TABLE IF NOT EXISTS part_approvals (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    part_id         INT NOT NULL REFERENCES parts(id),
    decision        ENUM('approved','conditionally_approved','rejected') NOT NULL,
    conditions      TEXT NULL,
    decided_by      INT NULL REFERENCES users(id),
    decided_at      TIMESTAMP NOT NULL,
    notes           TEXT NULL,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_pa_part (part_id)
);
```

---

## Phase 8: Files

### `files`
Centralized file registry. Actual files may live on Box, S3, or a CDN.

```sql
CREATE TABLE IF NOT EXISTS files (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    uuid            VARCHAR(36) UNIQUE NOT NULL,
    display_name    VARCHAR(500) NOT NULL,
    file_type       VARCHAR(100) NULL,          -- e.g. 'pdf', 'step', 'stl', 'image', 'spreadsheet'
    mime_type       VARCHAR(255) NULL,
    storage_provider ENUM('box','s3','local','url') NOT NULL DEFAULT 'url',
    storage_ref     VARCHAR(1000) NOT NULL,     -- Box file ID, S3 key, or URL
    file_size_bytes BIGINT NULL,
    checksum_sha256 VARCHAR(64) NULL,
    description     TEXT NULL,
    is_public       TINYINT(1) DEFAULT 0,
    uploaded_by     INT NULL REFERENCES users(id),
    uploaded_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at      TIMESTAMP NULL,
    INDEX idx_files_type (file_type),
    INDEX idx_files_provider (storage_provider)
);
```

### `file_links`
Associates a file with any other entity (polymorphic).

```sql
CREATE TABLE IF NOT EXISTS file_links (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    file_id         INT NOT NULL REFERENCES files(id),
    linked_type     VARCHAR(100) NOT NULL,      -- e.g. 'part', 'rule', 'case', 'tech_case'
    linked_id       INT NOT NULL,
    link_context    VARCHAR(255) NULL,          -- e.g. 'box_scan', '3d_model', 'supporting_doc'
    created_by      INT NULL REFERENCES users(id),
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_fl_file (file_id),
    INDEX idx_fl_linked (linked_type, linked_id)
);
```

---

## Phase 9: Audit Log (Extension)

`audit_log` already exists. For new modules, extend the same table or add module-specific fields:

```sql
-- If extending audit_log, add:
ALTER TABLE audit_log
    ADD COLUMN entity_type VARCHAR(100) NULL AFTER action,
    ADD COLUMN entity_id   INT NULL AFTER entity_type,
    ADD INDEX idx_al_entity (entity_type, entity_id);
```

---

## Recommended Migration Sequence

| Phase | Tables | Dependencies |
|---|---|---|
| Foundation | `entity_links`, `file_links`, `files` | None — add first |
| Rules | `rules`, `rule_versions`, `rule_change_requests`, `*_comments`, `*_status_history` | None |
| Committees | `rules_committees`, `committee_memberships` | `persons` (exists) |
| Meetings | `committee_meetings`, `*_attendees`, `*_decisions`, `*_action_items` | `rules_committees` |
| Publications | `publications`, `publication_items` | None |
| Cases | `cases`, `case_events`, `case_status_history` | `persons`, `event_instances`, `event_entries` (all exist) |
| Parts | `parts`, `part_approvals` | None |

**Each phase is independent and additive.** They can be sequenced or parallelized based on product priority.

---

## Shared Core Entities — Long-Term Strategy

| Entity | Current Home | Future Plan |
|---|---|---|
| Users | `users` table (auth) | Stays in auth; `persons` links to `users.id` via `user_id` FK |
| Persons | `persons` (Tech Master) | Expand with `user_id` FK for NHRA-credentialed people |
| Organizations | `organizations` (Tech Master) | Add `org_type` for teams, sanctioning bodies, committees |
| Vehicles | `vehicle_assets` (Tech Master) | Stays; add `class_scope` and `homologation_date` |
| Events | `event_instances` (Tech Master) + `parity_events` (Parity) | Bridge already exists via nullable FK on `parity_events.event_instance_id` |
| Classes | `parity_class_aliases` + `parity_class_defaults` | Add a proper `classes` table for canonical class definitions |
| Rules | _(new)_ | `rules` + `rule_versions` (Phase 2 above) |
| Files | _(new)_ | `files` + `file_links` (Phase 8 above) |
| Cases | `tech_cases` (Tech Master inspection) + _(new)_ `cases` (formal violations) | Keep separate — different workflows |
| Incidents | `run_incidents` + `incident_analysis_sessions` | Stays; add `entity_links` to connect to `cases` |
