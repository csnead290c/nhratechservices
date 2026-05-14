<?php
/**
 * v38 Event Ops Live Checklist Migration - Shared Core
 *
 * Adds live execution tables to the Event Operations module.
 *
 * Tables:
 *   - event_live_checklists       — one per event plan run
 *   - event_live_task_updates     — per-task status/result records
 *   - event_live_task_files       — files attached to a task update
 *   - event_live_session_status   — per-session status tracking
 *
 * Safety:
 *   - CREATE TABLE IF NOT EXISTS only
 *   - No DROP, TRUNCATE, DELETE, UPDATE
 *   - No parity table references
 *   - No sample data seeded
 *   - Soft delete (deleted_at) on all tables
 *   - Idempotent (safe to run multiple times)
 */

/**
 * Run the v38 migration
 *
 * @param PDO  $pdo     Database connection
 * @param bool $dryRun  If true, check status only — no modifications
 * @return array Status report
 */
function v38MigrateEventOpsLiveChecklist(PDO $pdo, bool $dryRun = false): array {
    $tables = [
        'event_live_checklists',
        'event_live_task_updates',
        'event_live_task_files',
        'event_live_session_status',
    ];

    $result = [
        'tables_before' => [],
        'tables_after'  => [],
        'applied'       => false,
        'errors'        => [],
        'messages'      => [],
    ];

    // ── Check current status ──────────────────────────────────────────────
    foreach ($tables as $table) {
        try {
            $stmt = $pdo->query("SHOW TABLES LIKE '$table'");
            $result['tables_before'][$table] = $stmt->fetchColumn() !== false;
        } catch (PDOException $e) {
            $result['errors'][] = "Failed to check table $table: " . $e->getMessage();
            return $result;
        }
    }

    $result['messages'][] = "=== v38 Event Ops Live Checklist Migration ===";
    $result['messages'][] = "Before:";
    foreach ($result['tables_before'] as $t => $exists) {
        $result['messages'][] = "  $t: " . ($exists ? 'EXISTS' : 'MISSING');
    }

    if ($dryRun) {
        $result['messages'][] = "\nDRY RUN — No changes made.";
        $result['applied'] = false;
        return $result;
    }

    $allExist = !in_array(false, $result['tables_before'], true);
    if ($allExist) {
        $result['messages'][] = "\nAll v38 tables already exist. Migration already applied. Skipping.";
        $result['applied'] = false;
        return $result;
    }

    // ── Create tables ─────────────────────────────────────────────────────

    // event_live_checklists
    if (!$result['tables_before']['event_live_checklists']) {
        try {
            $pdo->exec("
                CREATE TABLE IF NOT EXISTS event_live_checklists (
                    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                    uuid                VARCHAR(36) NOT NULL DEFAULT '',
                    event_plan_id       INT UNSIGNED NOT NULL,
                    status              VARCHAR(32) NOT NULL DEFAULT 'not_started',
                    active_session_id   INT UNSIGNED NULL,
                    started_at          DATETIME NULL,
                    completed_at        DATETIME NULL,
                    created_by          INT UNSIGNED NOT NULL DEFAULT 0,
                    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    deleted_at          DATETIME NULL,
                    INDEX idx_elc_plan   (event_plan_id),
                    INDEX idx_elc_status (status),
                    INDEX idx_elc_deleted (deleted_at)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            ");
            $result['messages'][] = "✓ event_live_checklists created";
        } catch (PDOException $e) {
            $result['errors'][] = "Failed to create event_live_checklists: " . $e->getMessage();
        }
    } else {
        $result['messages'][] = "· event_live_checklists already exists — skipped";
    }

    // event_live_task_updates
    if (!$result['tables_before']['event_live_task_updates']) {
        try {
            $pdo->exec("
                CREATE TABLE IF NOT EXISTS event_live_task_updates (
                    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                    uuid                VARCHAR(36) NOT NULL DEFAULT '',
                    event_plan_id       INT UNSIGNED NOT NULL,
                    task_id             INT UNSIGNED NOT NULL,
                    session_id          INT UNSIGNED NULL,
                    status              VARCHAR(32) NOT NULL DEFAULT 'not_started',
                    result              TEXT NULL,
                    notes               TEXT NULL,
                    issue_found         TINYINT(1) NOT NULL DEFAULT 0,
                    followup_required   TINYINT(1) NOT NULL DEFAULT 0,
                    carry_forward       TINYINT(1) NOT NULL DEFAULT 0,
                    completed_by        INT UNSIGNED NULL,
                    completed_at        DATETIME NULL,
                    updated_by          INT UNSIGNED NULL,
                    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    deleted_at          DATETIME NULL,
                    INDEX idx_eltu_plan        (event_plan_id),
                    INDEX idx_eltu_task        (task_id),
                    INDEX idx_eltu_session     (session_id),
                    INDEX idx_eltu_status      (status),
                    INDEX idx_eltu_followup    (followup_required),
                    INDEX idx_eltu_carry       (carry_forward),
                    INDEX idx_eltu_issue       (issue_found),
                    INDEX idx_eltu_deleted     (deleted_at)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            ");
            $result['messages'][] = "✓ event_live_task_updates created";
        } catch (PDOException $e) {
            $result['errors'][] = "Failed to create event_live_task_updates: " . $e->getMessage();
        }
    } else {
        $result['messages'][] = "· event_live_task_updates already exists — skipped";
    }

    // event_live_task_files
    if (!$result['tables_before']['event_live_task_files']) {
        try {
            $pdo->exec("
                CREATE TABLE IF NOT EXISTS event_live_task_files (
                    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                    task_update_id      INT UNSIGNED NOT NULL,
                    file_type           VARCHAR(32) NOT NULL DEFAULT 'other',
                    title               VARCHAR(255) NOT NULL DEFAULT '',
                    url                 TEXT NULL,
                    box_file_id         VARCHAR(128) NULL,
                    box_folder_id       VARCHAR(128) NULL,
                    notes               TEXT NULL,
                    created_by          INT UNSIGNED NOT NULL DEFAULT 0,
                    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    deleted_at          DATETIME NULL,
                    INDEX idx_eltf_update  (task_update_id),
                    INDEX idx_eltf_deleted (deleted_at)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            ");
            $result['messages'][] = "✓ event_live_task_files created";
        } catch (PDOException $e) {
            $result['errors'][] = "Failed to create event_live_task_files: " . $e->getMessage();
        }
    } else {
        $result['messages'][] = "· event_live_task_files already exists — skipped";
    }

    // event_live_session_status
    if (!$result['tables_before']['event_live_session_status']) {
        try {
            $pdo->exec("
                CREATE TABLE IF NOT EXISTS event_live_session_status (
                    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                    event_plan_id       INT UNSIGNED NOT NULL,
                    session_id          INT UNSIGNED NOT NULL,
                    status              VARCHAR(32) NOT NULL DEFAULT 'not_started',
                    started_at          DATETIME NULL,
                    completed_at        DATETIME NULL,
                    notes               TEXT NULL,
                    updated_by          INT UNSIGNED NULL,
                    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    deleted_at          DATETIME NULL,
                    INDEX idx_elss_plan    (event_plan_id),
                    INDEX idx_elss_session (session_id),
                    INDEX idx_elss_status  (status),
                    INDEX idx_elss_deleted (deleted_at)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            ");
            $result['messages'][] = "✓ event_live_session_status created";
        } catch (PDOException $e) {
            $result['errors'][] = "Failed to create event_live_session_status: " . $e->getMessage();
        }
    } else {
        $result['messages'][] = "· event_live_session_status already exists — skipped";
    }

    // ── Post-apply status ─────────────────────────────────────────────────
    if (empty($result['errors'])) {
        $result['messages'][] = "\n=== Migration v38 complete ===";
        $result['messages'][] = "Tables: event_live_checklists, event_live_task_updates,";
        $result['messages'][] = "        event_live_task_files, event_live_session_status";
        $result['messages'][] = "No parity tables were modified. No sample data seeded.";
        $result['applied'] = true;
    }

    return $result;
}

/**
 * Return row counts for all v38 tables.
 * Returns -1 for any table that does not exist.
 */
function v38GetEventOpsLiveTableCounts(PDO $pdo): array {
    $tables = [
        'event_live_checklists',
        'event_live_task_updates',
        'event_live_task_files',
        'event_live_session_status',
    ];
    $counts = [];
    foreach ($tables as $table) {
        try {
            $stmt = $pdo->query("SELECT COUNT(*) FROM $table");
            $counts[$table] = (int) $stmt->fetchColumn();
        } catch (PDOException $e) {
            $counts[$table] = -1;
        }
    }
    return $counts;
}
