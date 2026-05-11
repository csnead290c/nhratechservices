<?php
/**
 * v36 Rules Committees Migration - Shared Core
 *
 * Creates the foundation for rules committees and memberships.
 *
 * Tables:
 *   - rules_committees: Committee metadata
 *   - committee_memberships: User assignments to committees
 *
 * Usage:
 *   - Web: api/migrate-v36-rules-committees.php (requires admin auth)
 *   - CLI: Called from scripts/migrations/run-v36-rules-committees.mjs
 *
 * Safety:
 *   - CREATE TABLE IF NOT EXISTS only
 *   - No DROP, TRUNCATE, DELETE, UPDATE
 *   - No parity table modifications
 *   - Idempotent (safe to run multiple times)
 */

/**
 * Run the v36 migration
 *
 * @param PDO $pdo Database connection
 * @param bool $dryRun If true, only check status without modifying
 * @return array Status report
 */
function v36MigrateRulesCommittees(PDO $pdo, bool $dryRun = false): array {
    $result = [
        'committees_exists' => false,
        'memberships_exists' => false,
        'applied' => false,
        'errors' => [],
        'messages' => [],
    ];

    // Check current status
    try {
        $stmt = $pdo->query("SHOW TABLES LIKE 'rules_committees'");
        $result['committees_exists'] = $stmt->fetchColumn() !== false;

        $stmt = $pdo->query("SHOW TABLES LIKE 'committee_memberships'");
        $result['memberships_exists'] = $stmt->fetchColumn() !== false;
    } catch (PDOException $e) {
        $result['errors'][] = "Failed to check table status: " . $e->getMessage();
        return $result;
    }

    $result['messages'][] = "=== v36 Rules Committees Migration ===";
    $result['messages'][] = "Before: rules_committees=" . ($result['committees_exists'] ? 'EXISTS' : 'MISSING') .
                          ", committee_memberships=" . ($result['memberships_exists'] ? 'EXISTS' : 'MISSING');

    if ($dryRun) {
        $result['messages'][] = "\nDRY RUN - No changes made.";
        $result['applied'] = false;
        return $result;
    }

    // Skip if already applied
    if ($result['committees_exists'] && $result['memberships_exists']) {
        $result['messages'][] = "\nMigration already applied. Skipping.";
        $result['applied'] = false;
        return $result;
    }

    // ── Create rules_committees table ────────────────────────────────────
    if (!$result['committees_exists']) {
        try {
            $sql = "CREATE TABLE IF NOT EXISTS rules_committees (
                id              INT AUTO_INCREMENT PRIMARY KEY,
                uuid            VARCHAR(36) UNIQUE NOT NULL,
                name            VARCHAR(255) NOT NULL,
                slug            VARCHAR(100) UNIQUE NULL,
                description     TEXT NULL,
                category        VARCHAR(100) NULL,
                class_scope     VARCHAR(255) NULL,
                status          ENUM('active','inactive','dissolved') DEFAULT 'active',
                created_by      INT NULL,
                created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                deleted_at      TIMESTAMP NULL,
                INDEX idx_committees_status (status),
                INDEX idx_committees_category (category),
                INDEX idx_committees_class_scope (class_scope)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";

            $pdo->exec($sql);
            $result['messages'][] = "✓ rules_committees table created";
            $result['committees_exists'] = true;
        } catch (PDOException $e) {
            $result['errors'][] = "Failed to create rules_committees table: " . $e->getMessage();
            return $result;
        }
    } else {
        $result['messages'][] = "• rules_committees table already exists (skipped)";
    }

    // ── Create committee_memberships table ────────────────────────────────
    if (!$result['memberships_exists']) {
        try {
            $sql = "CREATE TABLE IF NOT EXISTS committee_memberships (
                id              INT AUTO_INCREMENT PRIMARY KEY,
                committee_id    INT NOT NULL,
                user_id         INT NULL,
                person_id       INT NULL,
                role            ENUM('chairman','co_chairman','member','advisor','secretary','liaison','guest','observer') NOT NULL,
                title           VARCHAR(100) NULL,
                voting_member   TINYINT(1) DEFAULT 1,
                start_date      DATE NOT NULL,
                end_date        DATE NULL,
                created_by      INT NULL,
                created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                deleted_at      TIMESTAMP NULL,
                INDEX idx_cm_committee (committee_id),
                INDEX idx_cm_user (user_id),
                INDEX idx_cm_person (person_id),
                INDEX idx_cm_role (role),
                INDEX idx_cm_dates (start_date, end_date),
                UNIQUE KEY uk_cm_active_membership (committee_id, user_id, role),
                CONSTRAINT fk_cm_committee FOREIGN KEY (committee_id) REFERENCES rules_committees(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";

            $pdo->exec($sql);
            $result['messages'][] = "✓ committee_memberships table created";
            $result['memberships_exists'] = true;
        } catch (PDOException $e) {
            $result['errors'][] = "Failed to create committee_memberships table: " . $e->getMessage();
            return $result;
        }
    } else {
        $result['messages'][] = "• committee_memberships table already exists (skipped)";
    }

    $result['messages'][] = "\n=== Migration v36 complete ===";
    $result['messages'][] = "Tables: rules_committees, committee_memberships";
    $result['messages'][] = "No parity tables were modified.";
    $result['applied'] = true;

    return $result;
}

/**
 * Get row counts for committee tables
 *
 * @param PDO $pdo Database connection
 * @return array ['rules_committees' => int, 'committee_memberships' => int]
 */
function v36GetCommitteeTableCounts(PDO $pdo): array {
    $counts = ['rules_committees' => 0, 'committee_memberships' => 0];

    try {
        $stmt = $pdo->query("SELECT COUNT(*) FROM rules_committees");
        $counts['rules_committees'] = (int) $stmt->fetchColumn();
    } catch (PDOException $e) {
        // Table may not exist
    }

    try {
        $stmt = $pdo->query("SELECT COUNT(*) FROM committee_memberships");
        $counts['committee_memberships'] = (int) $stmt->fetchColumn();
    } catch (PDOException $e) {
        // Table may not exist
    }

    return $counts;
}
