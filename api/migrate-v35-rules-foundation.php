<?php
/**
 * Migration v35: Rules & Governance Foundation — rules + rule_versions
 *
 * Phase 3A read-only foundation. Creates the tables needed for the
 * Rules & Governance module without touching parity tables.
 *
 * Safe to run multiple times (CREATE TABLE IF NOT EXISTS).
 * Depends on: users table (for created_by FK)
 */

ini_set('display_errors', '1');
error_reporting(E_ALL);
header('Content-Type: text/plain; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate');
header('Pragma: no-cache');
header('Expires: 0');

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/functions.php';

$auth = rsa_getAuthUser();
if (!$auth || !in_array($auth['role'] ?? '', ['admin', 'owner'])) {
    http_response_code(403);
    echo "Forbidden: admin role required.\n";
    exit(1);
}

$pdo = getDB();

echo "=== Migration v35: Rules & Governance Foundation ===\n\n";

// ── rules ──────────────────────────────────────────────────────────────

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
echo "✓ rules table created/verified\n";

// ── rule_versions ──────────────────────────────────────────────────────

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
echo "✓ rule_versions table created/verified\n";

// Add FK from rules.current_version_id → rule_versions.id (if not exists)
try {
    $pdo->exec("ALTER TABLE rules ADD CONSTRAINT fk_rules_current_version
        FOREIGN KEY (current_version_id) REFERENCES rule_versions(id)
        ON DELETE SET NULL");
    echo "✓ FK rules.current_version_id → rule_versions.id added\n";
} catch (PDOException $e) {
    if (str_contains($e->getMessage(), 'Duplicate')) {
        echo "• FK rules.current_version_id already exists (skipped)\n";
    } else {
        echo "⚠ FK rules.current_version_id: " . $e->getMessage() . "\n";
    }
}

// Add FK from rule_versions.rule_id → rules.id (if not exists)
try {
    $pdo->exec("ALTER TABLE rule_versions ADD CONSTRAINT fk_rv_rule
        FOREIGN KEY (rule_id) REFERENCES rules(id)
        ON DELETE CASCADE");
    echo "✓ FK rule_versions.rule_id → rules.id added\n";
} catch (PDOException $e) {
    if (str_contains($e->getMessage(), 'Duplicate')) {
        echo "• FK rule_versions.rule_id already exists (skipped)\n";
    } else {
        echo "⚠ FK rule_versions.rule_id: " . $e->getMessage() . "\n";
    }
}

echo "\n=== Migration v35 complete ===\n";
echo "Tables: rules, rule_versions\n";
echo "No parity tables were modified.\n";
