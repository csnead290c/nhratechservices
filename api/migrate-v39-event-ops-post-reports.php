<?php
/**
 * v39 Event Ops Post-Event Reports Migration — Web Endpoint
 * Requires admin or owner role. Supports ?dry_run=1.
 */

header('Content-Type: application/json');

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/functions.php';
require_once __DIR__ . '/migrations/v39-event-ops-post-reports.php';

$auth = rsa_requireAuth();
$pdo  = getDB();
$role = rsa_getUserRole($pdo, rsa_resolveUserId($pdo, $auth));

if (!in_array($role, ['admin', 'owner'], true)) {
    http_response_code(403);
    echo json_encode(['error' => 'Admin or owner role required']);
    exit;
}

$dryRun = isset($_GET['dry_run']) && $_GET['dry_run'] === '1';

$result = v39MigrateEventOpsPostReports($pdo, $dryRun);
$counts = v39GetEventOpsPostReportTableCounts($pdo);

echo json_encode([
    'dry_run'  => $dryRun,
    'result'   => $result,
    'counts'   => $counts,
], JSON_PRETTY_PRINT);
