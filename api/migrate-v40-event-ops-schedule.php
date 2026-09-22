<?php
/**
 * Migration v40: Event Ops Structured Schedule — Web Endpoint
 *
 * Creates event_schedule_items, event_schedule_assignments,
 * event_plan_staff_duties, and extends event_plan_staff / event_plans.
 *
 * Safe to run multiple times (CREATE TABLE IF NOT EXISTS / conditional ALTERs).
 *
 * Web access: Requires admin/owner authentication
 * CLI access: Use scripts/migrations/run-v40-event-ops-schedule.mjs
 */

ini_set('display_errors', '1');
error_reporting(E_ALL);
header('Content-Type: text/plain; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate');
header('Pragma: no-cache');
header('Expires: 0');

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/functions.php';
require_once __DIR__ . '/migrations/v40-event-ops-schedule.php';

// Web context requires admin auth
$auth = rsa_getAuthUser();
if (!$auth || !in_array($auth['role'] ?? '', ['admin', 'owner'])) {
    http_response_code(403);
    echo "Forbidden: admin role required.\n";
    exit(1);
}

$pdo = getDB();

// Run migration (not dry-run for web endpoint)
$result = v40MigrateEventOpsSchedule($pdo, false);

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
$counts = v40GetEventOpsScheduleTableCounts($pdo);
echo "\nFinal counts:\n";
foreach ($counts as $table => $count) {
    echo "  $table: " . ($count === -1 ? 'NOT FOUND' : "$count rows") . "\n";
}

exit(empty($result['errors']) ? 0 : 1);
