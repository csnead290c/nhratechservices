<?php
/**
 * v35 Rules Foundation Migration - Shared Core
 * 
 * This file contains the safe, idempotent migration logic for creating
 * the rules and rule_versions tables.
 * 
 * Usage:
 *   - Web: api/migrate-v35-rules-foundation.php (requires admin auth)
 *   - CLI: Called from scripts/migrations/run-v35-rules-foundation.mjs
 * 
 * Safety:
 *   - CREATE TABLE IF NOT EXISTS only
 *   - No DROP, TRUNCATE, DELETE, UPDATE
 *   - No parity table modifications
 *   - Idempotent (safe to run multiple times)
 */

/**
 * Run the v35 migration
 * 
 * @param PDO $pdo Database connection
 * @param bool $dryRun If true, only check status without modifying
 * @return array Status report: ['rules_exists' => bool, 'rule_versions_exists' => bool, 'applied' => bool, 'errors' => array]
 */
function v35MigrateRulesFoundation(PDO $pdo, bool $dryRun = false): array {
    $result = [
        'rules_exists' => false,
        'rule_versions_exists' => false,
        'applied' => false,
        'errors' => [],
        'messages' => [],
    ];

    // Check current status
    try {
        $stmt = $pdo->query("SHOW TABLES LIKE 'rules'");
        $result['rules_exists'] = $stmt->fetchColumn() !== false;
        
        $stmt = $pdo->query("SHOW TABLES LIKE 'rule_versions'");
        $result['rule_versions_exists'] = $stmt->fetchColumn() !== false;
    } catch (PDOException $e) {
        $result['errors'][] = "Failed to check table status: " . $e->getMessage();
        return $result;
    }

    $result['messages'][] = "=== v35 Rules Foundation Migration ===";
    $result['messages'][] = "Before: rules=" . ($result['rules_exists'] ? 'EXISTS' : 'MISSING') . 
                          ", rule_versions=" . ($result['rule_versions_exists'] ? 'EXISTS' : 'MISSING');

    if ($dryRun) {
        $result['messages'][] = "\nDRY RUN - No changes made.";
        $result['applied'] = false;
        return $result;
    }

    // Skip if already applied
    if ($result['rules_exists'] && $result['rule_versions_exists']) {
        $result['messages'][] = "\nMigration already applied. Skipping.";
        $result['applied'] = false;
        return $result;
    }

    // ── Create rules table ───────────────────────────────────────────────
    if (!$result['rules_exists']) {
        try {
            $sql = "CREATE TABLE IF NOT EXISTS rules (
                id                  INT AUTO_INCREMENT PRIMARY KEY,
                uuid                VARCHAR(36) UNIQUE NOT NULL,
                rule_number         VARCHAR(50) NOT NULL,
                category            VARCHAR(100) NOT NULL,
                class_scope         VARCHAR(255) NULL,
                title               VARCHAR(500) NOT NULL,
                body                TEXT NOT NULL,
                status              ENUM('active','superseded','proposed','deleted') DEFAULT 'active',
                effective_from      DATE NOT NULL,
                effective_to        DATE NULL,
                current_version_id  INT NULL,
                created_by          INT NULL,
                created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                deleted_at          TIMESTAMP NULL,
                INDEX idx_rules_status (status),
                INDEX idx_rules_category (category),
                INDEX idx_rules_effective (effective_from, effective_to),
                INDEX idx_rules_class_scope (class_scope)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";
            
            $pdo->exec($sql);
            $result['messages'][] = "✓ rules table created";
            $result['rules_exists'] = true;
        } catch (PDOException $e) {
            $result['errors'][] = "Failed to create rules table: " . $e->getMessage();
            return $result;
        }
    } else {
        $result['messages'][] = "• rules table already exists (skipped)";
    }

    // ── Create rule_versions table ─────────────────────────────────────
    if (!$result['rule_versions_exists']) {
        try {
            $sql = "CREATE TABLE IF NOT EXISTS rule_versions (
                id                  INT AUTO_INCREMENT PRIMARY KEY,
                rule_id             INT NOT NULL,
                version_number      INT NOT NULL,
                rule_number         VARCHAR(50) NOT NULL,
                title               VARCHAR(500) NOT NULL,
                body                TEXT NOT NULL,
                change_summary      TEXT NULL,
                effective_from      DATE NOT NULL,
                effective_to        DATE NULL,
                created_by          INT NULL,
                created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uk_rv_rule_version (rule_id, version_number),
                INDEX idx_rv_rule (rule_id),
                INDEX idx_rv_effective (effective_from, effective_to)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";
            
            $pdo->exec($sql);
            $result['messages'][] = "✓ rule_versions table created";
            $result['rule_versions_exists'] = true;
        } catch (PDOException $e) {
            $result['errors'][] = "Failed to create rule_versions table: " . $e->getMessage();
            return $result;
        }
    } else {
        $result['messages'][] = "• rule_versions table already exists (skipped)";
    }

    // ── Add Foreign Keys (idempotent via try/catch) ───────────────────────
    
    // FK: rules.current_version_id → rule_versions.id
    try {
        $pdo->exec("ALTER TABLE rules ADD CONSTRAINT fk_rules_current_version
            FOREIGN KEY (current_version_id) REFERENCES rule_versions(id)
            ON DELETE SET NULL");
        $result['messages'][] = "✓ FK rules.current_version_id → rule_versions.id added";
    } catch (PDOException $e) {
        if (str_contains($e->getMessage(), 'Duplicate') || str_contains($e->getMessage(), 'already exists')) {
            $result['messages'][] = "• FK rules.current_version_id already exists (skipped)";
        } else {
            $result['errors'][] = "FK rules.current_version_id: " . $e->getMessage();
        }
    }

    // FK: rule_versions.rule_id → rules.id
    try {
        $pdo->exec("ALTER TABLE rule_versions ADD CONSTRAINT fk_rv_rule
            FOREIGN KEY (rule_id) REFERENCES rules(id)
            ON DELETE CASCADE");
        $result['messages'][] = "✓ FK rule_versions.rule_id → rules.id added";
    } catch (PDOException $e) {
        if (str_contains($e->getMessage(), 'Duplicate') || str_contains($e->getMessage(), 'already exists')) {
            $result['messages'][] = "• FK rule_versions.rule_id already exists (skipped)";
        } else {
            $result['errors'][] = "FK rule_versions.rule_id: " . $e->getMessage();
        }
    }

    $result['messages'][] = "\n=== Migration v35 complete ===";
    $result['messages'][] = "Tables: rules, rule_versions";
    $result['messages'][] = "No parity tables were modified.";
    $result['applied'] = true;

    return $result;
}

/**
 * Get row counts for rules tables
 * 
 * @param PDO $pdo Database connection
 * @return array ['rules' => int, 'rule_versions' => int]
 */
function v35GetRulesTableCounts(PDO $pdo): array {
    $counts = ['rules' => 0, 'rule_versions' => 0];
    
    try {
        $stmt = $pdo->query("SELECT COUNT(*) FROM rules");
        $counts['rules'] = (int) $stmt->fetchColumn();
    } catch (PDOException $e) {
        // Table may not exist
    }
    
    try {
        $stmt = $pdo->query("SELECT COUNT(*) FROM rule_versions");
        $counts['rule_versions'] = (int) $stmt->fetchColumn();
    } catch (PDOException $e) {
        // Table may not exist
    }
    
    return $counts;
}
