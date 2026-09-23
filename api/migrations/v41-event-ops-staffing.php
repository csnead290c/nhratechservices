<?php
/**
 * v41 Event Ops Staffing & Canonical Event Migration - Shared Core
 *
 * Extends the Event Operations module (v37/v38/v39/v40) in two ways:
 *
 * A. Canonical event identity
 *   - parity_events is the canonical event record (name, track, dates,
 *     race_lookup, season_year). parity_events.event_instance_id already
 *     bridges 1:1 to the Tech Master overlay row (event_instances).
 *   - event_plans.parity_event_id (added in v37) becomes the authoritative
 *     link; event_plans.event_instance_id is kept during transition as a
 *     derived/legacy bridge and can be deprecated after production
 *     validation.
 *   - Backfills event_plans.parity_event_id deterministically:
 *       1) via event_instance_id  -> parity_events.event_instance_id
 *       2) via exact event_code + year -> parity_events.event_code +
 *          season_year
 *     Anything unmapped is left NULL and reported in 'unresolved_plans'.
 *   - Event-local timezone resolves via
 *       parity_events.track_id -> parity_tracks.timezone_iana
 *
 * B. Staffing workflow tables
 *   - event_worker_profiles           — per-user persistent worker profile
 *                                       (contact phone, travel default,
 *                                       dietary category + SENSITIVE detail)
 *   - event_worker_beverage_prefs     — per-user default beverage rows
 *   - event_staff_requests            — worker requests anchored to
 *                                       parity_event_id (availability,
 *                                       travel/lodging intent, roommate
 *                                       REQUEST, hospitality overrides,
 *                                       status + decision fields)
 *   - event_staff_request_beverages   — per-request beverage overrides
 *                                       (empty => inherit profile defaults)
 *   - event_staff_request_events      — request status history (audit)
 *   - event_staff_classes             — class assignments per confirmed staff
 *   - event_staff_travel_legs         — ACTUAL travel legs (fly/drive)
 *   - event_staff_lodging             — ACTUAL lodging incl. actual roommate
 *
 * Design rules:
 *   - Requested roommate (on the request) and actual roommate (on lodging)
 *     are deliberately separate concepts.
 *   - Dietary detail is sensitive: stored only on profile/request rows and
 *     only exposed through eventops.admin endpoints.
 *   - Requests anchor to parity_event_id, not event_plan_id, so a request
 *     survives plan recreation and can precede plan creation.
 *
 * Safety:
 *   - CREATE TABLE IF NOT EXISTS / conditional ALTERs only
 *   - Backfill is UPDATE-only on event_plans.parity_event_id where NULL
 *   - No DROP, TRUNCATE, DELETE
 *   - No parity table modifications
 *   - Idempotent (safe to run multiple times)
 *   - No sample data seeded
 */

function v41ColumnExists(PDO $pdo, string $table, string $column): bool {
    if ($pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'sqlite') {
        $stmt = $pdo->prepare("SELECT COUNT(*) FROM pragma_table_info(?) WHERE name = ?");
        $stmt->execute([$table, $column]);
        return (int) $stmt->fetchColumn() > 0;
    }
    $stmt = $pdo->prepare("
        SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
    ");
    $stmt->execute([$table, $column]);
    return (int) $stmt->fetchColumn() > 0;
}

function v41TableExists(PDO $pdo, string $table): bool {
    if ($pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'sqlite') {
        $stmt = $pdo->prepare("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?");
        $stmt->execute([$table]);
        return (int) $stmt->fetchColumn() > 0;
    }
    $stmt = $pdo->prepare("
        SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
    ");
    $stmt->execute([$table]);
    return (int) $stmt->fetchColumn() > 0;
}

/**
 * Run the v41 migration.
 *
 * @param PDO  $pdo     Database connection
 * @param bool $dryRun  If true, check status only — no modifications
 * @return array Status report (includes 'unresolved_plans' after backfill)
 */
function v41MigrateEventOpsStaffing(PDO $pdo, bool $dryRun = false): array {
    $tables = [
        'event_worker_profiles',
        'event_worker_beverage_prefs',
        'event_staff_requests',
        'event_staff_request_beverages',
        'event_staff_request_events',
        'event_staff_classes',
        'event_staff_travel_legs',
        'event_staff_lodging',
    ];

    $result = [
        'tables_before'    => [],
        'applied'          => false,
        'errors'           => [],
        'messages'         => [],
        'unresolved_plans' => [],
        'backfilled'       => 0,
    ];

    foreach ($tables as $table) {
        try {
            $result['tables_before'][$table] = v41TableExists($pdo, $table);
        } catch (PDOException $e) {
            $result['errors'][] = "Failed to check table $table: " . $e->getMessage();
            return $result;
        }
    }

    // Base tables this migration builds on must already exist
    foreach (['event_plans', 'event_plan_staff', 'parity_events', 'parity_tracks', 'users', 'persons'] as $base) {
        if (!v41TableExists($pdo, $base)) {
            $result['errors'][] = "Required base table missing: $base";
            return $result;
        }
    }

    $result['messages'][] = "=== v41 Event Ops Staffing & Canonical Event Migration ===";
    $result['messages'][] = "Before:";
    foreach ($result['tables_before'] as $t => $exists) {
        $result['messages'][] = "  $t: " . ($exists ? 'EXISTS' : 'MISSING');
    }

    if ($dryRun) {
        $result['messages'][] = "\nDRY RUN — No changes made.";
        // Still report which plans would need backfill
        $result['messages'][] = v41BackfillPreview($pdo);
        $result['applied'] = false;
        return $result;
    }

    // ── event_worker_profiles ────────────────────────────────────────────
    if (!$result['tables_before']['event_worker_profiles']) {
        try {
            $pdo->exec("
                CREATE TABLE IF NOT EXISTS event_worker_profiles (
                    id                  INT AUTO_INCREMENT PRIMARY KEY,
                    uuid                VARCHAR(36) NOT NULL,
                    user_id             INT NOT NULL,
                    person_id           INT NULL,
                    phone               VARCHAR(50) NULL,
                    travel_default      VARCHAR(20) NULL,
                    dietary_category    VARCHAR(40) NULL,
                    dietary_detail      TEXT NULL,
                    notes               TEXT NULL,
                    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

                    UNIQUE KEY uk_ewp_user (user_id),
                    UNIQUE KEY uk_ewp_uuid (uuid),
                    INDEX idx_ewp_person (person_id),
                    CONSTRAINT fk_ewp_user   FOREIGN KEY (user_id)   REFERENCES users(id)   ON DELETE CASCADE,
                    CONSTRAINT fk_ewp_person FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE SET NULL
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            ");
            $result['messages'][] = "✓ event_worker_profiles created";
        } catch (PDOException $e) {
            $result['errors'][] = "Failed to create event_worker_profiles: " . $e->getMessage();
        }
    } else {
        $result['messages'][] = "· event_worker_profiles already exists — skipped";
    }

    // ── event_worker_beverage_prefs ───────────────────────────────────────
    if (!$result['tables_before']['event_worker_beverage_prefs']) {
        try {
            $pdo->exec("
                CREATE TABLE IF NOT EXISTS event_worker_beverage_prefs (
                    id          INT AUTO_INCREMENT PRIMARY KEY,
                    user_id     INT NOT NULL,
                    beverage    VARCHAR(60) NOT NULL,
                    note        VARCHAR(255) NULL,
                    sort_order  SMALLINT NOT NULL DEFAULT 0,
                    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                    UNIQUE KEY uk_ewbp_user_bev (user_id, beverage),
                    CONSTRAINT fk_ewbp_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            ");
            $result['messages'][] = "✓ event_worker_beverage_prefs created";
        } catch (PDOException $e) {
            $result['errors'][] = "Failed to create event_worker_beverage_prefs: " . $e->getMessage();
        }
    } else {
        $result['messages'][] = "· event_worker_beverage_prefs already exists — skipped";
    }

    // ── event_staff_requests ─────────────────────────────────────────────
    if (!$result['tables_before']['event_staff_requests']) {
        try {
            $pdo->exec("
                CREATE TABLE IF NOT EXISTS event_staff_requests (
                    id                    INT AUTO_INCREMENT PRIMARY KEY,
                    uuid                  VARCHAR(36) NOT NULL,
                    parity_event_id       INT NOT NULL,
                    user_id               INT NOT NULL,
                    person_id             INT NULL,
                    status                VARCHAR(20) NOT NULL DEFAULT 'requested',
                    availability          VARCHAR(20) NOT NULL DEFAULT 'full',
                    available_from        DATETIME NULL,
                    available_through     DATETIME NULL,
                    travel_intent         VARCHAR(20) NULL,
                    lodging_intent        VARCHAR(20) NULL,
                    roommate_pref         VARCHAR(30) NULL,
                    roommate_person_id    INT NULL,
                    roommate_name         VARCHAR(255) NULL,
                    dietary_category      VARCHAR(40) NULL,
                    dietary_detail        TEXT NULL,
                    notes                 TEXT NULL,
                    requested_at          DATETIME NOT NULL,
                    decided_at            DATETIME NULL,
                    decided_by            INT NULL,
                    decision_note         VARCHAR(500) NULL,
                    event_plan_staff_id   INT NULL,
                    created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

                    UNIQUE KEY uk_esr_uuid (uuid),
                    INDEX idx_esr_event  (parity_event_id),
                    INDEX idx_esr_user   (user_id),
                    INDEX idx_esr_status (status),
                    CONSTRAINT fk_esr_event   FOREIGN KEY (parity_event_id)     REFERENCES parity_events(id),
                    CONSTRAINT fk_esr_user    FOREIGN KEY (user_id)             REFERENCES users(id),
                    CONSTRAINT fk_esr_person  FOREIGN KEY (person_id)           REFERENCES persons(id)          ON DELETE SET NULL,
                    CONSTRAINT fk_esr_roomie  FOREIGN KEY (roommate_person_id)  REFERENCES persons(id)          ON DELETE SET NULL,
                    CONSTRAINT fk_esr_staff   FOREIGN KEY (event_plan_staff_id) REFERENCES event_plan_staff(id) ON DELETE SET NULL
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            ");
            $result['messages'][] = "✓ event_staff_requests created";
        } catch (PDOException $e) {
            $result['errors'][] = "Failed to create event_staff_requests: " . $e->getMessage();
        }
    } else {
        $result['messages'][] = "· event_staff_requests already exists — skipped";
    }

    // ── event_staff_request_beverages ────────────────────────────────────
    if (!$result['tables_before']['event_staff_request_beverages']) {
        try {
            $pdo->exec("
                CREATE TABLE IF NOT EXISTS event_staff_request_beverages (
                    id          INT AUTO_INCREMENT PRIMARY KEY,
                    request_id  INT NOT NULL,
                    beverage    VARCHAR(60) NOT NULL,
                    sort_order  SMALLINT NOT NULL DEFAULT 0,
                    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                    UNIQUE KEY uk_esrb_req_bev (request_id, beverage),
                    CONSTRAINT fk_esrb_req FOREIGN KEY (request_id) REFERENCES event_staff_requests(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            ");
            $result['messages'][] = "✓ event_staff_request_beverages created";
        } catch (PDOException $e) {
            $result['errors'][] = "Failed to create event_staff_request_beverages: " . $e->getMessage();
        }
    } else {
        $result['messages'][] = "· event_staff_request_beverages already exists — skipped";
    }

    // ── event_staff_request_events (status history) ──────────────────────
    if (!$result['tables_before']['event_staff_request_events']) {
        try {
            $pdo->exec("
                CREATE TABLE IF NOT EXISTS event_staff_request_events (
                    id          INT AUTO_INCREMENT PRIMARY KEY,
                    request_id  INT NOT NULL,
                    status      VARCHAR(20) NOT NULL,
                    note        VARCHAR(500) NULL,
                    changed_by  INT NULL,
                    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                    INDEX idx_esre_req (request_id),
                    CONSTRAINT fk_esre_req FOREIGN KEY (request_id) REFERENCES event_staff_requests(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            ");
            $result['messages'][] = "✓ event_staff_request_events created";
        } catch (PDOException $e) {
            $result['errors'][] = "Failed to create event_staff_request_events: " . $e->getMessage();
        }
    } else {
        $result['messages'][] = "· event_staff_request_events already exists — skipped";
    }

    // ── event_staff_classes ──────────────────────────────────────────────
    if (!$result['tables_before']['event_staff_classes']) {
        try {
            $pdo->exec("
                CREATE TABLE IF NOT EXISTS event_staff_classes (
                    id          INT AUTO_INCREMENT PRIMARY KEY,
                    staff_id    INT NOT NULL,
                    class_code  VARCHAR(50) NOT NULL,
                    is_primary  TINYINT(1) NOT NULL DEFAULT 0,
                    sort_order  SMALLINT NOT NULL DEFAULT 0,
                    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    deleted_at  DATETIME NULL,

                    INDEX idx_esc_staff (staff_id),
                    INDEX idx_esc_class (class_code),
                    CONSTRAINT fk_esc_staff FOREIGN KEY (staff_id) REFERENCES event_plan_staff(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            ");
            $result['messages'][] = "✓ event_staff_classes created";
        } catch (PDOException $e) {
            $result['errors'][] = "Failed to create event_staff_classes: " . $e->getMessage();
        }
    } else {
        $result['messages'][] = "· event_staff_classes already exists — skipped";
    }

    // ── event_staff_travel_legs ──────────────────────────────────────────
    if (!$result['tables_before']['event_staff_travel_legs']) {
        try {
            $pdo->exec("
                CREATE TABLE IF NOT EXISTS event_staff_travel_legs (
                    id                    INT AUTO_INCREMENT PRIMARY KEY,
                    staff_id              INT NOT NULL,
                    leg                   VARCHAR(12) NOT NULL DEFAULT 'outbound',
                    mode                  VARCHAR(20) NOT NULL,
                    airline               VARCHAR(80) NULL,
                    flight_number         VARCHAR(20) NULL,
                    origin_code           VARCHAR(10) NULL,
                    dest_code             VARCHAR(10) NULL,
                    depart_at             DATETIME NULL,
                    arrive_at             DATETIME NULL,
                    vehicle_desc          VARCHAR(255) NULL,
                    carpool_with_staff_id INT NULL,
                    confirmation          VARCHAR(100) NULL,
                    notes                 TEXT NULL,
                    created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    deleted_at            DATETIME NULL,

                    INDEX idx_estl_staff (staff_id),
                    CONSTRAINT fk_estl_staff   FOREIGN KEY (staff_id)              REFERENCES event_plan_staff(id) ON DELETE CASCADE,
                    CONSTRAINT fk_estl_carpool FOREIGN KEY (carpool_with_staff_id) REFERENCES event_plan_staff(id) ON DELETE SET NULL
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            ");
            $result['messages'][] = "✓ event_staff_travel_legs created";
        } catch (PDOException $e) {
            $result['errors'][] = "Failed to create event_staff_travel_legs: " . $e->getMessage();
        }
    } else {
        $result['messages'][] = "· event_staff_travel_legs already exists — skipped";
    }

    // ── event_staff_lodging ──────────────────────────────────────────────
    if (!$result['tables_before']['event_staff_lodging']) {
        try {
            $pdo->exec("
                CREATE TABLE IF NOT EXISTS event_staff_lodging (
                    id                 INT AUTO_INCREMENT PRIMARY KEY,
                    staff_id           INT NOT NULL,
                    type               VARCHAR(20) NOT NULL,
                    property_name      VARCHAR(255) NULL,
                    check_in           DATE NULL,
                    check_out          DATE NULL,
                    confirmation       VARCHAR(100) NULL,
                    room_number        VARCHAR(40) NULL,
                    roommate_staff_id  INT NULL,
                    roommate_name      VARCHAR(255) NULL,
                    site_notes         TEXT NULL,
                    notes              TEXT NULL,
                    created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    deleted_at         DATETIME NULL,

                    UNIQUE KEY uk_esl_staff (staff_id),
                    CONSTRAINT fk_esl_staff    FOREIGN KEY (staff_id)          REFERENCES event_plan_staff(id) ON DELETE CASCADE,
                    CONSTRAINT fk_esl_roommate FOREIGN KEY (roommate_staff_id) REFERENCES event_plan_staff(id) ON DELETE SET NULL
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            ");
            $result['messages'][] = "✓ event_staff_lodging created";
        } catch (PDOException $e) {
            $result['errors'][] = "Failed to create event_staff_lodging: " . $e->getMessage();
        }
    } else {
        $result['messages'][] = "· event_staff_lodging already exists — skipped";
    }

    // ── Backfill event_plans.parity_event_id ─────────────────────────────
    // Deterministic mappings only — never fuzzy name matching.
    // 1) via the existing 1:1 bridge parity_events.event_instance_id
    try {
        $n = $pdo->exec("
            UPDATE event_plans p
            JOIN parity_events pe ON pe.event_instance_id = p.event_instance_id
            SET p.parity_event_id = pe.id
            WHERE p.parity_event_id IS NULL
              AND p.event_instance_id IS NOT NULL
              AND p.deleted_at IS NULL
        ");
        $result['backfilled'] += (int) $n;
        $result['messages'][] = "✓ backfilled parity_event_id via event_instance_id bridge: $n plan(s)";
    } catch (PDOException $e) {
        $result['errors'][] = "Backfill via event_instance_id failed: " . $e->getMessage();
    }

    // 2) exact event_code + year -> event_code + season_year match
    try {
        $n = $pdo->exec("
            UPDATE event_plans p
            JOIN parity_events pe
              ON pe.event_code = p.event_code
             AND pe.season_year = p.year
            SET p.parity_event_id = pe.id
            WHERE p.parity_event_id IS NULL
              AND p.event_instance_id IS NULL
              AND p.deleted_at IS NULL
        ");
        $result['backfilled'] += (int) $n;
        $result['messages'][] = "✓ backfilled parity_event_id via exact event_code+year: $n plan(s)";
    } catch (PDOException $e) {
        $result['errors'][] = "Backfill via event_code failed: " . $e->getMessage();
    }

    // 3) keep event_instance_id consistent where parity link resolved it
    try {
        $n = $pdo->exec("
            UPDATE event_plans p
            JOIN parity_events pe ON pe.id = p.parity_event_id
            SET p.event_instance_id = pe.event_instance_id
            WHERE p.event_instance_id IS NULL
              AND pe.event_instance_id IS NOT NULL
              AND p.deleted_at IS NULL
        ");
        $result['messages'][] = "✓ synced event_instance_id from parity bridge: $n plan(s)";
    } catch (PDOException $e) {
        $result['errors'][] = "event_instance_id sync failed: " . $e->getMessage();
    }

    // Unresolved report — plans still without a canonical link
    try {
        $stmt = $pdo->query("
            SELECT id, event_code, year, title, event_instance_id
            FROM event_plans
            WHERE parity_event_id IS NULL AND deleted_at IS NULL
            ORDER BY year DESC, event_code
        ");
        $result['unresolved_plans'] = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $n = count($result['unresolved_plans']);
        $result['messages'][] = $n
            ? "⚠ $n plan(s) have no deterministic parity_events mapping — left unresolved (see unresolved_plans)"
            : "✓ all live plans resolved to parity_events";
    } catch (PDOException $e) {
        $result['errors'][] = "Unresolved-plan report failed: " . $e->getMessage();
    }

    $result['messages'][] = "\n=== Migration v41 complete ===";
    $result['messages'][] = "Tables: event_worker_profiles, event_worker_beverage_prefs, event_staff_requests,";
    $result['messages'][] = "        event_staff_request_beverages, event_staff_request_events, event_staff_classes,";
    $result['messages'][] = "        event_staff_travel_legs, event_staff_lodging";
    $result['messages'][] = "Backfill: event_plans.parity_event_id (deterministic only). No parity tables modified.";

    $result['applied'] = empty($result['errors']);
    return $result;
}

/**
 * Dry-run helper: how many plans would backfill via each path.
 */
function v41BackfillPreview(PDO $pdo): string {
    try {
        $viaEi = (int) $pdo->query("
            SELECT COUNT(*) FROM event_plans p
            JOIN parity_events pe ON pe.event_instance_id = p.event_instance_id
            WHERE p.parity_event_id IS NULL AND p.event_instance_id IS NOT NULL AND p.deleted_at IS NULL
        ")->fetchColumn();
        $viaCode = (int) $pdo->query("
            SELECT COUNT(*) FROM event_plans p
            JOIN parity_events pe ON pe.event_code = p.event_code AND pe.season_year = p.year
            WHERE p.parity_event_id IS NULL AND p.event_instance_id IS NULL AND p.deleted_at IS NULL
        ")->fetchColumn();
        $unresolved = (int) $pdo->query("
            SELECT COUNT(*) FROM event_plans WHERE parity_event_id IS NULL AND deleted_at IS NULL
        ")->fetchColumn();
        return "Backfill preview: $viaEi via event_instance_id, $viaCode via event_code+year, " .
               "unresolved after backfill: " . max(0, $unresolved - $viaEi - $viaCode);
    } catch (PDOException $e) {
        return "Backfill preview unavailable: " . $e->getMessage();
    }
}

/**
 * Return row counts for all v41 tables (-1 when missing).
 */
function v41GetEventOpsStaffingTableCounts(PDO $pdo): array {
    $tables = [
        'event_worker_profiles',
        'event_worker_beverage_prefs',
        'event_staff_requests',
        'event_staff_request_beverages',
        'event_staff_request_events',
        'event_staff_classes',
        'event_staff_travel_legs',
        'event_staff_lodging',
    ];
    $counts = [];
    foreach ($tables as $table) {
        try {
            if (!v41TableExists($pdo, $table)) {
                $counts[$table] = -1;
                continue;
            }
            $counts[$table] = (int) $pdo->query("SELECT COUNT(*) FROM $table")->fetchColumn();
        } catch (PDOException $e) {
            $counts[$table] = -1;
        }
    }
    return $counts;
}
