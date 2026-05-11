<?php
/**
 * Migration v36: Rules Committees — Web Endpoint
 *
 * Creates the foundation for rules committees and memberships.
 *
 * Safe to run multiple times (CREATE TABLE IF NOT EXISTS).
 *
 * Web access: Requires admin/owner authentication
 * CLI access: Use scripts/migrations/run-v36-rules-committees.mjs
 */

ini_set('display_errors', '1');
error_reporting(E_ALL);
header('Content-Type: text/plain; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate');
header('Pragma: no-cache');
header('Expires: ');

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/functions.php';
require_once __DIR__ . '/migrations/v36-rules-committees.php';

// Web context requires admin auth
$auth = rsa_getAuthUser();
if (!$auth || !in_array($auth['role'] ?? '', ['admin', 'owner'])) {
    http_response_code(403);
    echo "Forbidden: admin role required.\n";
    exit(1);
}

$pdo = getDB();

// Run migration (not dry-run for web endpoint)
$result = v36MigrateRulesCommittees($pdo, false);

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
$counts = v36GetCommitteeTableCounts($pdo);
echo "\nFinal counts:\n";
echo "  rules_committees:      " . $counts['rules_committees'] . " rows\n";
echo "  committee_memberships: " . $counts['committee_memberships'] . " rows\n";

// Exit with error code if there were errors
exit(empty($result['errors']) ? 0 : 1);
