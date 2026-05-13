<?php
/**
 * v37 Event Ops Plans Migration - Shared Core
 *
 * Creates the foundation for Event Operations pre-event plans.
 *
 * Tables:
 *   - event_plans
 *   - event_plan_staff
 *   - event_plan_sections
 *   - event_plan_sessions
 *   - event_plan_tasks
 *   - event_plan_task_targets
 *   - event_plan_files
 *
 * Usage:
 *   - Web: api/migrate-v37-event-ops-plans.php (requires admin auth)
 *   - CLI: Called from scripts/migrations/run-v37-event-ops-plans.mjs
 *
 * Safety:
 *   - CREATE TABLE IF NOT EXISTS only
 *   - No DROP, TRUNCATE, DELETE, UPDATE
 *   - No parity table modifications
 *   - Idempotent (safe to run multiple times)
 *   - No sample data seeded
 */

/**
 * Run the v37 migration
 *
 * @param PDO $pdo Database connection
 * @param bool $dryRun If true, only check status without modifying
 * @return array Status report
 */
function v37MigrateEventOpsPlans(PDO $pdo, bool $dryRun = false): array {
    $tables = [
        'event_plans',
        'event_plan_staff',
        'event_plan_sections',
        'event_plan_sessions',
        'event_plan_tasks',
        'event_plan_task_targets',
        'event_plan_files',
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

    $result['messages'][] = "=== v37 Event Ops Plans Migration ===";
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
        $result['messages'][] = "\nAll v37 tables already exist. Migration already applied. Skipping.";
        $result['applied'] = false;
        return $result;
    }

    // ── event_plans ───────────────────────────────────────────────────────
    if (!$result['tables_before']['event_plans']) {
        try {
            $pdo->exec("CREATE TABLE IF NOT EXISTS event_plans (
                id                  INT AUTO_INCREMENT PRIMARY KEY,
                uuid                VARCHAR(36) UNIQUE NOT NULL,
                event_instance_id   INT NULL,
                parity_event_id     INT NULL,
                year                SMALLINT NOT NULL,
                event_code          VARCHAR(50) NOT NULL,
                track_name          VARCHAR(255) NULL,
                title               VARCHAR(255) NOT NULL,
                class_scope         VARCHAR(255) NULL,
                plan_type           ENUM('pre_event','race_day','post_event','template') NOT NULL DEFAULT 'pre_event',
                status              ENUM('draft','pending_review','approved','archived') NOT NULL DEFAULT 'draft',
                summary             TEXT NULL,
                created_by          INT NOT NULL,
                approved_by         INT NULL,
                approved_at         TIMESTAMP NULL,
                created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                deleted_at          TIMESTAMP NULL,
                INDEX idx_ep_event_instance (event_instance_id),
                INDEX idx_ep_parity_event  (parity_event_id),
                INDEX idx_ep_class_scope   (class_scope(100)),
                INDEX idx_ep_status        (status),
                INDEX idx_ep_year_code     (year, event_code)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
            $result['messages'][] = "✓ event_plans created";
        } catch (PDOException $e) {
            $result['errors'][] = "Failed to create event_plans: " . $e->getMessage();
            return $result;
        }
    } else {
        $result['messages'][] = "• event_plans already exists (skipped)";
    }

    // ── event_plan_staff ──────────────────────────────────────────────────
    if (!$result['tables_before']['event_plan_staff']) {
        try {
            $pdo->exec("CREATE TABLE IF NOT EXISTS event_plan_staff (
                id              INT AUTO_INCREMENT PRIMARY KEY,
                event_plan_id   INT NOT NULL,
                user_id         INT NULL,
                person_id       INT NULL,
                display_name    VARCHAR(255) NOT NULL,
                assignment      VARCHAR(255) NOT NULL,
                arrive_at       TIMESTAMP NULL,
                depart_at       TIMESTAMP NULL,
                notes           TEXT NULL,
                sort_order      SMALLINT NOT NULL DEFAULT 0,
                created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                deleted_at      TIMESTAMP NULL,
                INDEX idx_eps_plan   (event_plan_id),
                INDEX idx_eps_user   (user_id),
                INDEX idx_eps_person (person_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
            $result['messages'][] = "✓ event_plan_staff created";
        } catch (PDOException $e) {
            $result['errors'][] = "Failed to create event_plan_staff: " . $e->getMessage();
            return $result;
        }
    } else {
        $result['messages'][] = "• event_plan_staff already exists (skipped)";
    }

    // ── event_plan_sections ───────────────────────────────────────────────
    if (!$result['tables_before']['event_plan_sections']) {
        try {
            $pdo->exec("CREATE TABLE IF NOT EXISTS event_plan_sections (
                id              INT AUTO_INCREMENT PRIMARY KEY,
                event_plan_id   INT NOT NULL,
                section_key     VARCHAR(100) NOT NULL,
                title           VARCHAR(255) NOT NULL,
                body            LONGTEXT NULL,
                sort_order      SMALLINT NOT NULL DEFAULT 0,
                created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                deleted_at      TIMESTAMP NULL,
                INDEX idx_epsec_plan (event_plan_id),
                UNIQUE KEY uk_epsec_plan_key (event_plan_id, section_key)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
            $result['messages'][] = "✓ event_plan_sections created";
        } catch (PDOException $e) {
            $result['errors'][] = "Failed to create event_plan_sections: " . $e->getMessage();
            return $result;
        }
    } else {
        $result['messages'][] = "• event_plan_sections already exists (skipped)";
    }

    // ── event_plan_sessions ───────────────────────────────────────────────
    if (!$result['tables_before']['event_plan_sessions']) {
        try {
            $pdo->exec("CREATE TABLE IF NOT EXISTS event_plan_sessions (
                id              INT AUTO_INCREMENT PRIMARY KEY,
                event_plan_id   INT NOT NULL,
                session_key     VARCHAR(100) NOT NULL,
                title           VARCHAR(255) NOT NULL,
                class_scope     VARCHAR(255) NULL,
                scheduled_at    TIMESTAMP NULL,
                notes           TEXT NULL,
                sort_order      SMALLINT NOT NULL DEFAULT 0,
                created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                deleted_at      TIMESTAMP NULL,
                INDEX idx_epss_plan  (event_plan_id),
                INDEX idx_epss_class (class_scope(100))
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
            $result['messages'][] = "✓ event_plan_sessions created";
        } catch (PDOException $e) {
            $result['errors'][] = "Failed to create event_plan_sessions: " . $e->getMessage();
            return $result;
        }
    } else {
        $result['messages'][] = "• event_plan_sessions already exists (skipped)";
    }

    // ── event_plan_tasks ──────────────────────────────────────────────────
    if (!$result['tables_before']['event_plan_tasks']) {
        try {
            $pdo->exec("CREATE TABLE IF NOT EXISTS event_plan_tasks (
                id                          INT AUTO_INCREMENT PRIMARY KEY,
                event_plan_id               INT NOT NULL,
                session_id                  INT NULL,
                title                       VARCHAR(255) NOT NULL,
                description                 TEXT NULL,
                task_type                   ENUM('inspection','survey','briefing','logistics','safety','admin','other') NOT NULL DEFAULT 'other',
                priority                    ENUM('high','normal','low') NOT NULL DEFAULT 'normal',
                status                      ENUM('open','in_progress','completed','deferred','cancelled') NOT NULL DEFAULT 'open',
                assigned_user_id            INT NULL,
                assigned_person_id          INT NULL,
                due_at                      TIMESTAMP NULL,
                completed_at                TIMESTAMP NULL,
                completed_by                INT NULL,
                carry_forward_to_next_event TINYINT(1) NOT NULL DEFAULT 0,
                result_summary              TEXT NULL,
                sort_order                  SMALLINT NOT NULL DEFAULT 0,
                created_at                  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at                  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                deleted_at                  TIMESTAMP NULL,
                INDEX idx_ept_plan    (event_plan_id),
                INDEX idx_ept_session (session_id),
                INDEX idx_ept_status  (status),
                INDEX idx_ept_type    (task_type)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
            $result['messages'][] = "✓ event_plan_tasks created";
        } catch (PDOException $e) {
            $result['errors'][] = "Failed to create event_plan_tasks: " . $e->getMessage();
            return $result;
        }
    } else {
        $result['messages'][] = "• event_plan_tasks already exists (skipped)";
    }

    // ── event_plan_task_targets ───────────────────────────────────────────
    if (!$result['tables_before']['event_plan_task_targets']) {
        try {
            $pdo->exec("CREATE TABLE IF NOT EXISTS event_plan_task_targets (
                id                  INT AUTO_INCREMENT PRIMARY KEY,
                task_id             INT NOT NULL,
                event_entry_id      INT NULL,
                driver_name         VARCHAR(255) NULL,
                class_code          VARCHAR(50) NULL,
                vehicle_identifier  VARCHAR(255) NULL,
                notes               TEXT NULL,
                created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                deleted_at          TIMESTAMP NULL,
                INDEX idx_eptt_task  (task_id),
                INDEX idx_eptt_entry (event_entry_id),
                INDEX idx_eptt_class (class_code)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
            $result['messages'][] = "✓ event_plan_task_targets created";
        } catch (PDOException $e) {
            $result['errors'][] = "Failed to create event_plan_task_targets: " . $e->getMessage();
            return $result;
        }
    } else {
        $result['messages'][] = "• event_plan_task_targets already exists (skipped)";
    }

    // ── event_plan_files ──────────────────────────────────────────────────
    if (!$result['tables_before']['event_plan_files']) {
        try {
            $pdo->exec("CREATE TABLE IF NOT EXISTS event_plan_files (
                id              INT AUTO_INCREMENT PRIMARY KEY,
                event_plan_id   INT NOT NULL,
                file_type       ENUM('map','schedule','entry_list','manual','report','photo','other') NOT NULL DEFAULT 'other',
                title           VARCHAR(255) NOT NULL,
                url             TEXT NULL,
                box_file_id     VARCHAR(255) NULL,
                box_folder_id   VARCHAR(255) NULL,
                notes           TEXT NULL,
                created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                deleted_at      TIMESTAMP NULL,
                INDEX idx_epf_plan (event_plan_id),
                INDEX idx_epf_type (file_type)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
            $result['messages'][] = "✓ event_plan_files created";
        } catch (PDOException $e) {
            $result['errors'][] = "Failed to create event_plan_files: " . $e->getMessage();
            return $result;
        }
    } else {
        $result['messages'][] = "• event_plan_files already exists (skipped)";
    }

    $result['messages'][] = "\n=== Migration v37 complete ===";
    $result['messages'][] = "Tables: event_plans, event_plan_staff, event_plan_sections,";
    $result['messages'][] = "        event_plan_sessions, event_plan_tasks, event_plan_task_targets, event_plan_files";
    $result['messages'][] = "No parity tables were modified. No sample data seeded.";
    $result['applied'] = true;

    return $result;
}

/**
 * Get row counts for all v37 tables
 *
 * @param PDO $pdo
 * @return array table => count
 */
function v37GetEventOpsTableCounts(PDO $pdo): array {
    $tables = [
        'event_plans',
        'event_plan_staff',
        'event_plan_sections',
        'event_plan_sessions',
        'event_plan_tasks',
        'event_plan_task_targets',
        'event_plan_files',
    ];

    $counts = [];
    foreach ($tables as $table) {
        try {
            $stmt = $pdo->query("SELECT COUNT(*) FROM `$table`");
            $counts[$table] = (int) $stmt->fetchColumn();
        } catch (PDOException $e) {
            $counts[$table] = -1;
        }
    }
    return $counts;
}
