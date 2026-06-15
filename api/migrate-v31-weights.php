<?php
/**
 * Migration v31: Add weight columns for the Weight Change parity tool.
 *   - parity_engine_combos.base_weight   (per-combo base race weight, lbs)
 *   - parity_body_styles.weight_modifier (per-body-style modifier from base, lbs)
 * Both are shared globally and editable by any nhra.parity user.
 * Safe to re-run.
 */

ini_set('display_errors', 1);
error_reporting(E_ALL);
header('Content-Type: text/plain');

echo "=== Migration v31: Weight Change columns ===\n\n";

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/functions.php';

try {
    $pdo = getDB();
    echo "1. Connected to database.\n\n";
} catch (Exception $e) {
    echo "FAILED: " . $e->getMessage() . "\n";
    exit(1);
}

/** Add a column only if it does not already exist (re-run safe). */
function addColumnIfMissing(PDO $pdo, string $table, string $column, string $ddl): void {
    $stmt = $pdo->prepare("
        SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
    ");
    $stmt->execute([$table, $column]);
    if ((int)$stmt->fetchColumn() > 0) {
        echo "   $table.$column already exists\n";
        return;
    }
    $pdo->exec("ALTER TABLE `$table` ADD COLUMN $ddl");
    echo "   Added $table.$column\n";
}

echo "2. Adding parity_engine_combos.base_weight...\n";
try {
    addColumnIfMissing($pdo, 'parity_engine_combos', 'base_weight',
        "base_weight DOUBLE NULL COMMENT 'Base race weight (lbs) for Weight Change tool'");
    echo "   OK\n\n";
} catch (PDOException $e) {
    echo "   FAILED: " . $e->getMessage() . "\n\n";
}

echo "3. Adding parity_body_styles.weight_modifier...\n";
try {
    addColumnIfMissing($pdo, 'parity_body_styles', 'weight_modifier',
        "weight_modifier DOUBLE NOT NULL DEFAULT 0 COMMENT 'Weight modifier (lbs) from engine combo base weight'");
    echo "   OK\n\n";
} catch (PDOException $e) {
    echo "   FAILED: " . $e->getMessage() . "\n\n";
}

echo "=== Migration v31 complete ===\n";
