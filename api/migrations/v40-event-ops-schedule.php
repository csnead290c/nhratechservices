<?php
/**
 * v40 Event Ops Structured Schedule Migration - Shared Core
 *
 * Extends the Event Operations module (v37/v38/v39) so an event plan can
 * fully represent the printed NHRA Tech event schedule as structured data:
 *
 * New tables:
 *   - event_schedule_items        — one row per scheduled activity per day
 *   - event_schedule_assignments  — per-item staff responsibilities
 *   - event_plan_staff_duties     — event-wide duties per staff row
 *
 * Column additions (idempotent ALTERs):
 *   - event_plan_staff: radio_number, vehicle, phone, is_active
 *   - event_plans:      event_date, lifecycle_stage
 *
 * Notes:
 *   - schedule_item.status and activity_type are VARCHAR (not ENUM) so future
 *     statuses/types do not require schema changes. Application layer validates.
 *   - Times are split pairs: scheduled_time TIME NULL + scheduled_time_label
 *     VARCHAR(60) NULL (same for projected_*). Real clock times stay
 *     machine-readable (sortable, diff-able for delay math, NOW/NEXT);
 *     sequence/unknown values ("Following TF", "TBD") live in the label.
 *   - Existing freeform event_plan_sections (e.g. event_schedule markdown)
 *     are untouched — they remain as legacy fallback content.
 *
 * Safety:
 *   - CREATE TABLE IF NOT EXISTS / ALTER ADD COLUMN IF-missing only
 *   - No DROP, TRUNCATE, DELETE, UPDATE of data rows
 *   - No parity table modifications
 *   - Idempotent (safe to run multiple times)
 *   - No sample data seeded
 */

/**
 * Check whether a column exists on a table (MySQL INFORMATION_SCHEMA).
 */
function v40ColumnExists(PDO $pdo, string $table, string $column): bool {
    $stmt = $pdo->prepare("
        SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
    ");
    $stmt->execute([$table, $column]);
    return (int) $stmt->fetchColumn() > 0;
}

/**
 * Add a column to a table if it does not already exist.
 */
function v40AddColumnIfMissing(PDO $pdo, string $table, string $column, string $definition, array &$messages): void {
    if (v40ColumnExists($pdo, $table, $column)) {
        $messages[] = "  · $table.$column already exists — skipped";
        return;
    }
    $pdo->exec("ALTER TABLE `$table` ADD COLUMN `$column` $definition");
    $messages[] = "  ✓ $table.$column added";
}

/**
 * Run the v40 migration.
 *
 * @param PDO  $pdo     Database connection
 * @param bool $dryRun  If true, check status only — no modifications
 * @return array Status report
 */
function v40MigrateEventOpsSchedule(PDO $pdo, bool $dryRun = false): array {
    $tables = [
        'event_schedule_items',
        'event_schedule_assignments',
        'event_plan_staff_duties',
    ];

    $result = [
        'tables_before' => [],
        'applied'       => false,
        'errors'        => [],
        'messages'      => [],
    ];

    foreach ($tables as $table) {
        try {
            $stmt = $pdo->query("SHOW TABLES LIKE '$table'");
            $result['tables_before'][$table] = $stmt->fetchColumn() !== false;
        } catch (PDOException $e) {
            $result['errors'][] = "Failed to check table $table: " . $e->getMessage();
            return $result;
        }
    }

    // Base tables this migration extends must already exist
    foreach (['event_plans', 'event_plan_staff', 'event_plan_sessions'] as $base) {
        try {
            $stmt = $pdo->query("SHOW TABLES LIKE '$base'");
            if ($stmt->fetchColumn() === false) {
                $result['errors'][] = "Required base table missing: $base — run v37 first.";
                return $result;
            }
        } catch (PDOException $e) {
            $result['errors'][] = "Failed to check base table $base: " . $e->getMessage();
            return $result;
        }
    }

    $result['messages'][] = "=== v40 Event Ops Structured Schedule Migration ===";
    $result['messages'][] = "Before:";
    foreach ($result['tables_before'] as $t => $exists) {
        $result['messages'][] = "  $t: " . ($exists ? 'EXISTS' : 'MISSING');
    }

    if ($dryRun) {
        $result['messages'][] = "\nDRY RUN — No changes made.";
        $result['applied'] = false;
        return $result;
    }

    // ── event_schedule_items ─────────────────────────────────────────────
    if (!$result['tables_before']['event_schedule_items']) {
        try {
            $pdo->exec("
                CREATE TABLE IF NOT EXISTS event_schedule_items (
                    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                    uuid                VARCHAR(36) NOT NULL DEFAULT '',
                    event_plan_id       INT UNSIGNED NOT NULL,
                    session_id          INT UNSIGNED NULL,
                    schedule_date       DATE NULL,
                    day_label           VARCHAR(50) NULL,
                    title               VARCHAR(255) NOT NULL DEFAULT '',
                    sort_order          INT NOT NULL DEFAULT 0,
                    scheduled_time      TIME NULL,
                    scheduled_time_label VARCHAR(60) NULL,
                    projected_time      TIME NULL,
                    projected_time_label VARCHAR(60) NULL,
                    activity_type       VARCHAR(32) NOT NULL DEFAULT 'other',
                    category_code       VARCHAR(50) NULL,
                    round_label         VARCHAR(50) NULL,
                    expected_car_count  INT UNSIGNED NULL,
                    comments            TEXT NULL,
                    scale_required      TINYINT(1) NOT NULL DEFAULT 0,
                    fuel_required       TINYINT(1) NOT NULL DEFAULT 0,
                    status              VARCHAR(32) NOT NULL DEFAULT 'upcoming',
                    actual_start_at     DATETIME NULL,
                    actual_end_at       DATETIME NULL,
                    created_by          INT UNSIGNED NULL,
                    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    deleted_at          DATETIME NULL,
                    INDEX idx_esi_plan     (event_plan_id),
                    INDEX idx_esi_date     (schedule_date),
                    INDEX idx_esi_status   (status),
                    INDEX idx_esi_session  (session_id),
                    INDEX idx_esi_deleted  (deleted_at)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            ");
            $result['messages'][] = "✓ event_schedule_items created";
        } catch (PDOException $e) {
            $result['errors'][] = "Failed to create event_schedule_items: " . $e->getMessage();
        }
    } else {
        $result['messages'][] = "· event_schedule_items already exists — skipped";
    }

    // ── event_schedule_assignments ────────────────────────────────────────
    if (!$result['tables_before']['event_schedule_assignments']) {
        try {
            $pdo->exec("
                CREATE TABLE IF NOT EXISTS event_schedule_assignments (
                    id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                    event_plan_id     INT UNSIGNED NOT NULL,
                    schedule_item_id  INT UNSIGNED NOT NULL,
                    staff_id          INT UNSIGNED NULL,
                    assignee_name     VARCHAR(255) NULL,
                    responsibility    VARCHAR(255) NOT NULL,
                    notes             TEXT NULL,
                    sort_order        INT NOT NULL DEFAULT 0,
                    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    deleted_at        DATETIME NULL,
                    INDEX idx_esa_plan   (event_plan_id),
                    INDEX idx_esa_item   (schedule_item_id),
                    INDEX idx_esa_staff  (staff_id),
                    INDEX idx_esa_deleted (deleted_at)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            ");
            $result['messages'][] = "✓ event_schedule_assignments created";
        } catch (PDOException $e) {
            $result['errors'][] = "Failed to create event_schedule_assignments: " . $e->getMessage();
        }
    } else {
        $result['messages'][] = "· event_schedule_assignments already exists — skipped";
    }

    // ── event_plan_staff_duties ───────────────────────────────────────────
    if (!$result['tables_before']['event_plan_staff_duties']) {
        try {
            $pdo->exec("
                CREATE TABLE IF NOT EXISTS event_plan_staff_duties (
                    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                    event_plan_id   INT UNSIGNED NOT NULL,
                    staff_id        INT UNSIGNED NOT NULL,
                    duty            VARCHAR(255) NOT NULL,
                    sort_order      INT NOT NULL DEFAULT 0,
                    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    deleted_at      DATETIME NULL,
                    INDEX idx_epsd_plan    (event_plan_id),
                    INDEX idx_epsd_staff   (staff_id),
                    INDEX idx_epsd_deleted (deleted_at)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            ");
            $result['messages'][] = "✓ event_plan_staff_duties created";
        } catch (PDOException $e) {
            $result['errors'][] = "Failed to create event_plan_staff_duties: " . $e->getMessage();
        }
    } else {
        $result['messages'][] = "· event_plan_staff_duties already exists — skipped";
    }

    // ── event_plan_staff column additions ─────────────────────────────────
    $staffCols = [
        'radio_number' => 'VARCHAR(50) NULL',
        'vehicle'      => 'VARCHAR(100) NULL',
        'phone'        => 'VARCHAR(50) NULL',
        'is_active'    => 'TINYINT(1) NOT NULL DEFAULT 1',
    ];
    foreach ($staffCols as $col => $def) {
        try {
            v40AddColumnIfMissing($pdo, 'event_plan_staff', $col, $def, $result['messages']);
        } catch (PDOException $e) {
            $result['errors'][] = "Failed to add event_plan_staff.$col: " . $e->getMessage();
        }
    }

    // ── event_plans column additions ──────────────────────────────────────
    $planCols = [
        'event_date'      => 'DATE NULL',
        'lifecycle_stage' => "VARCHAR(32) NOT NULL DEFAULT 'pre_event'",
    ];
    foreach ($planCols as $col => $def) {
        try {
            v40AddColumnIfMissing($pdo, 'event_plans', $col, $def, $result['messages']);
        } catch (PDOException $e) {
            $result['errors'][] = "Failed to add event_plans.$col: " . $e->getMessage();
        }
    }

    $result['messages'][] = "\n=== Migration v40 complete ===";
    $result['messages'][] = "Tables: event_schedule_items, event_schedule_assignments, event_plan_staff_duties";
    $result['messages'][] = "Columns: event_plan_staff(+radio_number,+vehicle,+phone,+is_active),";
    $result['messages'][] = "         event_plans(+event_date,+lifecycle_stage)";
    $result['messages'][] = "No parity tables were modified. No data rows mutated. No sample data seeded.";
    $result['applied'] = empty($result['errors']);

    return $result;
}

/**
 * Return row counts for all v40 tables.
 * Returns -1 for any table that does not exist.
 */
function v40GetEventOpsScheduleTableCounts(PDO $pdo): array {
    $tables = [
        'event_schedule_items',
        'event_schedule_assignments',
        'event_plan_staff_duties',
    ];
    $counts = [];
    foreach ($tables as $table) {
        try {
            $stmt = $pdo->query("SHOW TABLES LIKE '$table'");
            if ($stmt->fetchColumn() === false) {
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
