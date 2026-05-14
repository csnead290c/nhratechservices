<?php
/**
 * Migration v38: Event Ops Live Checklist — Web Endpoint
 *
 * Requires owner or admin role to execute.
 * Access: GET /api/migrate-v38-event-ops-live-checklist.php
 */

header('Content-Type: application/json');
header('Cache-Control: no-store, no-cache, must-revalidate');

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/functions.php';
require_once __DIR__ . '/lib/capabilities.php';
require_once __DIR__ . '/migrations/v38-event-ops-live-checklist.php';

$pdo  = getDB();
$auth = rsa_requireAuth();
$userId = rsa_resolveUserId($pdo, $auth);
$role   = rsa_getUserRole($pdo, $userId);

if (!in_array($role, ['owner', 'admin'], true)) {
    http_response_code(403);
    echo json_encode(['error' => 'Forbidden — owner or admin role required']);
    exit;
}

$dryRun = ($_GET['dry_run'] ?? 'false') !== 'false';
$result = v38MigrateEventOpsLiveChecklist($pdo, $dryRun);
$counts = v38GetEventOpsLiveTableCounts($pdo);

echo json_encode([
    'migration'  => 'v38-event-ops-live-checklist',
    'dry_run'    => $dryRun,
    'applied'    => $result['applied'],
    'messages'   => $result['messages'],
    'errors'     => $result['errors'],
    'row_counts' => $counts,
], JSON_PRETTY_PRINT);
