<?php
/**
 * Migration v41: Event Ops Staffing & Canonical Event — Web Endpoint
 *
 * Creates the staffing workflow tables (worker profiles, beverage prefs,
 * staff requests + history, classes, travel legs, lodging) and backfills
 * event_plans.parity_event_id deterministically.
 *
 * Safe to run multiple times (CREATE TABLE IF NOT EXISTS / conditional writes).
 *
 * Web access: Requires admin/owner authentication
 * CLI access: Use scripts/migrations/run-v41-event-ops-staffing.mjs
 */

ini_set('display_errors', '1');
error_reporting(E_ALL);
header('Content-Type: text/plain; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate');
header('Pragma: no-cache');
header('Expires: 0');

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/functions.php';
require_once __DIR__ . '/migrations/v41-event-ops-staffing.php';

// Web context requires admin auth
$auth = rsa_getAuthUser();
if (!$auth || !in_array($auth['role'] ?? '', ['admin', 'owner'])) {
    http_response_code(403);
    echo "Forbidden: admin role required.\n";
    exit(1);
}

$pdo = getDB();

// Run migration (not dry-run for web endpoint)
$result = v41MigrateEventOpsStaffing($pdo, false);

foreach ($result['messages'] as $msg) {
    echo $msg . "\n";
}

if (!empty($result['unresolved_plans'])) {
    echo "\nUnresolved plans (no deterministic parity_events mapping):\n";
    foreach ($result['unresolved_plans'] as $p) {
        echo "  - plan #{$p['id']} {$p['year']} {$p['event_code']} — {$p['title']}\n";
    }
}

if (!empty($result['errors'])) {
    echo "\nERRORS:\n";
    foreach ($result['errors'] as $err) {
        echo "  ✗ " . $err . "\n";
    }
}

// Get final counts
$counts = v41GetEventOpsStaffingTableCounts($pdo);
echo "\nFinal counts:\n";
foreach ($counts as $table => $count) {
    echo "  $table: " . ($count === -1 ? 'NOT FOUND' : "$count rows") . "\n";
}

exit(empty($result['errors']) ? 0 : 1);
