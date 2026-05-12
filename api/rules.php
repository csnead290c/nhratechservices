<?php
/**
 * Rules & Governance API — Read-Only Endpoints (Phase 3A)
 *
 * Actions:
 *   list            — list rules with optional filters
 *   get             — get single rule by id or uuid
 *   versions        — list version history for a rule
 *   categories      — list distinct categories
 *
 * All read endpoints require authenticated user with 'rules.read' capability.
 * Write endpoints (future) will require 'rules.admin'.
 */

require_once 'config.php';
require_once 'functions.php';
require_once __DIR__ . '/lib/capabilities.php';

// ─── Helpers (must be defined before use) ───────────────────────────────

/**
 * Check if a database table exists.
 */
function tableExists(PDO $pdo, string $tableName): bool {
    try {
        $stmt = $pdo->prepare("SHOW TABLES LIKE ?");
        $stmt->execute([$tableName]);
        return $stmt->rowCount() > 0;
    } catch (PDOException $e) {
        return false;
    }
}

rsa_setCorsHeaders();

$pdo = getDB();
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? 'list';

// All read actions require rules.read
if ($method === 'GET') {
    $auth = rsa_getAuthUser();
    if (!$auth) {
        http_response_code(401);
        header('Content-Type: application/json');
        echo json_encode(['error' => 'Authentication required']);
        exit;
    }
    if (!rsa_hasCapability($pdo, $auth, 'rules.read')) {
        http_response_code(403);
        header('Content-Type: application/json');
        echo json_encode(['error' => 'Missing capability: rules.read']);
        exit;
    }
}

header('Content-Type: application/json');

switch ($action) {
    case 'list':
        handleListRules($pdo);
        break;
    case 'get':
        handleGetRule($pdo);
        break;
    case 'versions':
        handleListVersions($pdo);
        break;
    case 'categories':
        handleListCategories($pdo);
        break;
    default:
        http_response_code(400);
        echo json_encode(['error' => "Unknown action: $action"]);
}

// ─── Handlers ──────────────────────────────────────────────────────────

function handleListRules(PDO $pdo): void {
    // Check if rules table exists
    if (!tableExists($pdo, 'rules')) {
        http_response_code(503);
        echo json_encode(['error' => 'Rules module not initialized. Migration required.', 'rules' => [], 'count' => 0]);
        return;
    }

    $where = ['r.deleted_at IS NULL'];
    $params = [];

    // Filters
    if (!empty($_GET['category'])) {
        $where[] = 'r.category = :category';
        $params[':category'] = $_GET['category'];
    }
    if (!empty($_GET['status'])) {
        $where[] = 'r.status = :status';
        $params[':status'] = $_GET['status'];
    }
    if (!empty($_GET['class_scope'])) {
        $where[] = '(r.class_scope IS NULL OR r.class_scope LIKE :class_scope)';
        $params[':class_scope'] = '%' . $_GET['class_scope'] . '%';
    }
    if (!empty($_GET['search'])) {
        $where[] = '(r.title LIKE :search OR r.body LIKE :search2 OR r.rule_number LIKE :search3)';
        $params[':search']  = '%' . $_GET['search'] . '%';
        $params[':search2'] = '%' . $_GET['search'] . '%';
        $params[':search3'] = '%' . $_GET['search'] . '%';
    }

    $whereClause = implode(' AND ', $where);

    $sql = "SELECT r.id, r.uuid, r.rule_number, r.category, r.class_scope,
                   r.title, r.status, r.effective_from, r.effective_to,
                   r.current_version_id, r.created_at, r.updated_at
            FROM rules r
            WHERE $whereClause
            ORDER BY r.category ASC, r.rule_number ASC";

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rules = $stmt->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode(['rules' => $rules, 'count' => count($rules)]);
}

function handleGetRule(PDO $pdo): void {
    // Check if rules table exists
    if (!tableExists($pdo, 'rules')) {
        http_response_code(503);
        echo json_encode(['error' => 'Rules module not initialized. Migration required.']);
        return;
    }

    $id = $_GET['id'] ?? null;
    if (!$id) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing id parameter']);
        return;
    }

    // Support lookup by uuid or numeric id
    if (preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-/', $id)) {
        $stmt = $pdo->prepare("SELECT * FROM rules WHERE uuid = :id AND deleted_at IS NULL");
    } else {
        $stmt = $pdo->prepare("SELECT * FROM rules WHERE id = :id AND deleted_at IS NULL");
    }
    $stmt->execute([':id' => $id]);
    $rule = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$rule) {
        http_response_code(404);
        echo json_encode(['error' => 'Rule not found']);
        return;
    }

    // Fetch current version if set
    $currentVersion = null;
    if ($rule['current_version_id']) {
        $vStmt = $pdo->prepare("SELECT * FROM rule_versions WHERE id = :id");
        $vStmt->execute([':id' => $rule['current_version_id']]);
        $currentVersion = $vStmt->fetch(PDO::FETCH_ASSOC);
    }

    $rule['current_version'] = $currentVersion;

    echo json_encode(['rule' => $rule]);
}

function handleListVersions(PDO $pdo): void {
    $ruleId = $_GET['rule_id'] ?? null;
    if (!$ruleId) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing rule_id parameter']);
        return;
    }

    $stmt = $pdo->prepare(
        "SELECT * FROM rule_versions WHERE rule_id = :rule_id ORDER BY version_number DESC"
    );
    $stmt->execute([':rule_id' => $ruleId]);
    $versions = $stmt->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode(['versions' => $versions, 'count' => count($versions)]);
}

function handleListCategories(PDO $pdo): void {
    // Check if rules table exists
    if (!tableExists($pdo, 'rules')) {
        http_response_code(503);
        echo json_encode(['error' => 'Rules module not initialized. Migration required.', 'categories' => []]);
        return;
    }

    $stmt = $pdo->query(
        "SELECT DISTINCT category FROM rules WHERE deleted_at IS NULL ORDER BY category ASC"
    );
    $categories = $stmt->fetchAll(PDO::FETCH_COLUMN);

    echo json_encode(['categories' => $categories]);
}
