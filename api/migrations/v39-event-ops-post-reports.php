<?php
/**
 * v39 Event Ops Post-Event Reports Migration - Shared Core
 *
 * Adds post-event report tables to the Event Operations module.
 *
 * Tables:
 *   - event_post_reports            — one per report generation run
 *   - event_post_report_sections    — narrative sections within a report
 *   - event_post_report_items       — issue/followup/carry-forward/manual items
 *   - event_post_report_files       — file/Box references attached to a report
 *   - event_post_report_incidents   — incident references linked to a report
 *
 * Safety:
 *   - CREATE TABLE IF NOT EXISTS only
 *   - No DROP, TRUNCATE, DELETE, UPDATE
 *   - No parity table references
 *   - No sample data seeded
 *   - Soft delete (deleted_at) on all tables
 *   - Idempotent (safe to run multiple times)
 */

function v39MigrateEventOpsPostReports(PDO $pdo, bool $dryRun = false): array {
    $tables = [
        'event_post_reports',
        'event_post_report_sections',
        'event_post_report_items',
        'event_post_report_files',
        'event_post_report_incidents',
    ];

    $result = [
        'tables_before' => [],
        'tables_after'  => [],
        'applied'       => false,
        'errors'        => [],
        'messages'      => [],
    ];

    $result['messages'][] = '=== v39 Event Ops Post-Event Reports Migration ===';
    $result['messages'][] = 'Before:';

    foreach ($tables as $table) {
        try {
            $stmt = $pdo->query("SHOW TABLES LIKE '$table'");
            $exists = $stmt->fetchColumn() !== false;
            $result['tables_before'][$table] = $exists;
            $result['messages'][] = "  $table: " . ($exists ? 'EXISTS' : 'MISSING');
        } catch (PDOException $e) {
            $result['tables_before'][$table] = false;
            $result['messages'][] = "  $table: ERROR - " . $e->getMessage();
        }
    }

    if ($dryRun) {
        $result['messages'][] = '';
        $result['messages'][] = 'DRY RUN — No changes made.';
        return $result;
    }

    // ── event_post_reports ────────────────────────────────────────────────
    if (!$result['tables_before']['event_post_reports']) {
        try {
            $pdo->exec("
                CREATE TABLE IF NOT EXISTS event_post_reports (
                    id                       INT UNSIGNED NOT NULL AUTO_INCREMENT,
                    uuid                     CHAR(36)     NOT NULL,
                    event_plan_id            INT UNSIGNED NOT NULL,
                    title                    VARCHAR(255) NOT NULL DEFAULT '',
                    status                   ENUM('draft','generated','in_review','finalized','archived') NOT NULL DEFAULT 'draft',
                    summary                  TEXT         NULL,
                    generated_summary        TEXT         NULL,
                    completed_task_count     INT UNSIGNED NOT NULL DEFAULT 0,
                    open_task_count          INT UNSIGNED NOT NULL DEFAULT 0,
                    issue_task_count         INT UNSIGNED NOT NULL DEFAULT 0,
                    followup_task_count      INT UNSIGNED NOT NULL DEFAULT 0,
                    carry_forward_task_count INT UNSIGNED NOT NULL DEFAULT 0,
                    incident_count           INT UNSIGNED NOT NULL DEFAULT 0,
                    generated_at             DATETIME     NULL,
                    finalized_at             DATETIME     NULL,
                    finalized_by             INT UNSIGNED NULL,
                    created_by               INT UNSIGNED NOT NULL,
                    created_at               DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at               DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    deleted_at               DATETIME     NULL,
                    PRIMARY KEY (id),
                    UNIQUE KEY uq_epr_uuid (uuid),
                    KEY idx_epr_plan        (event_plan_id),
                    KEY idx_epr_status      (status),
                    KEY idx_epr_deleted     (deleted_at)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            ");
            $result['messages'][] = '✓ event_post_reports created';
        } catch (PDOException $e) {
            $result['errors'][] = 'event_post_reports: ' . $e->getMessage();
        }
    } else {
        $result['messages'][] = '– event_post_reports already exists, skipping';
    }

    // ── event_post_report_sections ────────────────────────────────────────
    if (!$result['tables_before']['event_post_report_sections']) {
        try {
            $pdo->exec("
                CREATE TABLE IF NOT EXISTS event_post_report_sections (
                    id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
                    report_id      INT UNSIGNED NOT NULL,
                    section_key    VARCHAR(100) NOT NULL,
                    title          VARCHAR(255) NOT NULL DEFAULT '',
                    body           TEXT         NULL,
                    generated_body TEXT         NULL,
                    sort_order     INT          NOT NULL DEFAULT 0,
                    created_by     INT UNSIGNED NOT NULL,
                    created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    deleted_at     DATETIME     NULL,
                    PRIMARY KEY (id),
                    KEY idx_eprs_report   (report_id),
                    KEY idx_eprs_key      (section_key),
                    KEY idx_eprs_deleted  (deleted_at)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            ");
            $result['messages'][] = '✓ event_post_report_sections created';
        } catch (PDOException $e) {
            $result['errors'][] = 'event_post_report_sections: ' . $e->getMessage();
        }
    } else {
        $result['messages'][] = '– event_post_report_sections already exists, skipping';
    }

    // ── event_post_report_items ───────────────────────────────────────────
    if (!$result['tables_before']['event_post_report_items']) {
        try {
            $pdo->exec("
                CREATE TABLE IF NOT EXISTS event_post_report_items (
                    id                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
                    report_id          INT UNSIGNED NOT NULL,
                    source_type        ENUM('plan_task','live_task_update','incident','manual','file','followup') NOT NULL DEFAULT 'manual',
                    source_id          INT UNSIGNED NULL,
                    title              VARCHAR(255) NOT NULL DEFAULT '',
                    body               TEXT         NULL,
                    status             ENUM('draft','generated','in_review','finalized','archived') NOT NULL DEFAULT 'draft',
                    priority           ENUM('high','normal','low') NOT NULL DEFAULT 'normal',
                    assigned_user_id   INT UNSIGNED NULL,
                    assigned_person_id INT UNSIGNED NULL,
                    due_at             DATETIME     NULL,
                    completed_at       DATETIME     NULL,
                    created_by         INT UNSIGNED NOT NULL,
                    created_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    deleted_at         DATETIME     NULL,
                    PRIMARY KEY (id),
                    KEY idx_epri_report      (report_id),
                    KEY idx_epri_source      (source_type, source_id),
                    KEY idx_epri_status      (status),
                    KEY idx_epri_deleted     (deleted_at)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            ");
            $result['messages'][] = '✓ event_post_report_items created';
        } catch (PDOException $e) {
            $result['errors'][] = 'event_post_report_items: ' . $e->getMessage();
        }
    } else {
        $result['messages'][] = '– event_post_report_items already exists, skipping';
    }

    // ── event_post_report_files ───────────────────────────────────────────
    if (!$result['tables_before']['event_post_report_files']) {
        try {
            $pdo->exec("
                CREATE TABLE IF NOT EXISTS event_post_report_files (
                    id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
                    report_id    INT UNSIGNED NOT NULL,
                    file_type    ENUM('map','schedule','entry_list','manual','report','photo','other') NOT NULL DEFAULT 'other',
                    title        VARCHAR(255) NOT NULL DEFAULT '',
                    url          TEXT         NULL,
                    box_file_id  VARCHAR(100) NULL,
                    box_folder_id VARCHAR(100) NULL,
                    notes        TEXT         NULL,
                    created_by   INT UNSIGNED NOT NULL,
                    created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    deleted_at   DATETIME     NULL,
                    PRIMARY KEY (id),
                    KEY idx_eprf_report  (report_id),
                    KEY idx_eprf_deleted (deleted_at)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            ");
            $result['messages'][] = '✓ event_post_report_files created';
        } catch (PDOException $e) {
            $result['errors'][] = 'event_post_report_files: ' . $e->getMessage();
        }
    } else {
        $result['messages'][] = '– event_post_report_files already exists, skipping';
    }

    // ── event_post_report_incidents ───────────────────────────────────────
    if (!$result['tables_before']['event_post_report_incidents']) {
        try {
            $pdo->exec("
                CREATE TABLE IF NOT EXISTS event_post_report_incidents (
                    id                   INT UNSIGNED NOT NULL AUTO_INCREMENT,
                    report_id            INT UNSIGNED NOT NULL,
                    incident_id          INT UNSIGNED NULL,
                    incident_analysis_id INT UNSIGNED NULL,
                    title                VARCHAR(255) NOT NULL DEFAULT '',
                    summary              TEXT         NULL,
                    status               ENUM('draft','generated','in_review','finalized','archived') NOT NULL DEFAULT 'draft',
                    followup_required    TINYINT(1)   NOT NULL DEFAULT 0,
                    created_by           INT UNSIGNED NOT NULL,
                    created_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    deleted_at           DATETIME     NULL,
                    PRIMARY KEY (id),
                    KEY idx_eprn_report    (report_id),
                    KEY idx_eprn_incident  (incident_id),
                    KEY idx_eprn_followup  (followup_required),
                    KEY idx_eprn_deleted   (deleted_at)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            ");
            $result['messages'][] = '✓ event_post_report_incidents created';
        } catch (PDOException $e) {
            $result['errors'][] = 'event_post_report_incidents: ' . $e->getMessage();
        }
    } else {
        $result['messages'][] = '– event_post_report_incidents already exists, skipping';
    }

    $result['messages'][] = '';
    $result['messages'][] = '=== Migration v39 complete ===';
    $result['messages'][] = 'Tables: event_post_reports, event_post_report_sections,';
    $result['messages'][] = '        event_post_report_items, event_post_report_files, event_post_report_incidents';
    $result['messages'][] = 'No parity tables were modified. No sample data seeded.';
    $result['applied'] = empty($result['errors']);

    return $result;
}

function v39GetEventOpsPostReportTableCounts(PDO $pdo): array {
    $tables = [
        'event_post_reports',
        'event_post_report_sections',
        'event_post_report_items',
        'event_post_report_files',
        'event_post_report_incidents',
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
