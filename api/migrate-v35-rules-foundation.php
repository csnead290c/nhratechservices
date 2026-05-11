<?php
/**
 * Migration v35: Rules & Governance Foundation — Web Endpoint
 *
 * Phase 3A read-only foundation. Creates the tables needed for the
 * Rules & Governance module without touching parity tables.
 *
 * Safe to run multiple times (CREATE TABLE IF NOT EXISTS).
 * Depends on: users table (for created_by FK)
 *
 * Web access: Requires admin/owner authentication
 * CLI access: Use scripts/migrations/run-v35-rules-foundation.mjs
 */

ini_set('display_errors', '1');
error_reporting(E_ALL);
header('Content-Type: text/plain; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate');
header('Pragma: no-cache');
header('Expires: ');

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/functions.php';
require_once __DIR__ . '/migrations/v35-rules-foundation.php';

// Web context requires admin auth
$auth = rsa_getAuthUser();
if (!$auth || !in_array($auth['role'] ?? '', ['admin', 'owner'])) {
    http_response_code(403);
    echo "Forbidden: admin role required.\n";
    exit(1);
}

$pdo = getDB();

// Run migration (not dry-run for web endpoint)
$result = v35MigrateRulesFoundation($pdo, false);

// Output results
foreach ($result['messages'] as $msg) {
    echo $msg . "\n";
}

if (!empty($result['errors'])) {
    echo "\nERRORS:\n";
    foreach ($result['errors'] as $err) {
        echo "  ✗ " . $err . "\n";
    }
}

// Get final counts
$counts = v35GetRulesTableCounts($pdo);
echo "\nFinal counts:\n";
echo "  rules:         " . $counts['rules'] . " rows\n";
echo "  rule_versions: " . $counts['rule_versions'] . " rows\n";

// Exit with error code if there were errors
exit(empty($result['errors']) ? 0 : 1);
