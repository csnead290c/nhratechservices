<?php
/**
 * Rules Committees API
 *
 * Manages rules committees and their memberships.
 *
 * Read endpoints (require 'committees.read'):
 *   list          — List committees with optional filters
 *   get           — Get committee by id or slug with full membership
 *   members       — List members for a specific committee
 *   categories    — List distinct committee categories
 *
 * Admin endpoints (require 'committees.admin'):
 *   create        — POST — Create new committee
 *   update        — PUT — Update committee metadata
 *   delete        — DELETE — Soft delete committee
 *   addMember     — POST — Add member to committee
 *   updateMember  — PUT — Update membership
 *   removeMember  — DELETE — Soft delete membership
 *   eligibleUsers — GET — List users who can be added
 */

require_once 'config.php';
require_once 'functions.php';
require_once __DIR__ . '/lib/capabilities.php';

// ─── Helpers (must be defined before use) ───────────────────────────────

/**
 * Check if a database table exists.
 */
function tableExists(PDO $pdo, string $table): bool {
    $stmt = $pdo->query("SHOW TABLES LIKE '$table'");
    return $stmt->fetchColumn() !== false;
}

/**
 * Get all members for a committee.
 */
function getCommitteeMembers(PDO $pdo, int $committeeId): array {
    $stmt = $pdo->prepare("SELECT cm.*, u.name as user_name, u.email as user_email
        FROM committee_memberships cm
        LEFT JOIN users u ON cm.user_id = u.id
        WHERE cm.committee_id = ? AND cm.deleted_at IS NULL
        ORDER BY FIELD(cm.role, 'chairman', 'co_chairman', 'secretary', 'member', 'advisor', 'liaison', 'guest', 'observer'), u.name");
    $stmt->execute([$committeeId]);
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

/**
 * Get member count for a committee.
 */
function getCommitteeMemberCount(PDO $pdo, int $committeeId): int {
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM committee_memberships WHERE committee_id = ? AND deleted_at IS NULL");
    $stmt->execute([$committeeId]);
    return (int) $stmt->fetchColumn();
}

/**
 * Generate a UUID v4.
 */
function generate_uuid(): string {
    return sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
        mt_rand(0, 0xffff), mt_rand(0, 0xffff),
        mt_rand(0, 0xffff),
        mt_rand(0, 0x0fff) | 0x4000,
        mt_rand(0, 0x3fff) | 0x8000,
        mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff)
    );
}

rsa_setCorsHeaders();

$pdo = getDB();
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? 'list';

// ── Auth + capability gate ──────────────────────────────────────────────
$auth = rsa_getAuthUser();
if (!$auth) {
    http_response_code(401);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Authentication required']);
    exit;
}

// Determine required capability based on action and method
$adminActions = ['create', 'update', 'delete', 'addMember', 'updateMember', 'removeMember', 'eligibleUsers'];
$requireAdmin = in_array($action, $adminActions) || $method !== 'GET';

$requiredCap = $requireAdmin ? 'committees.admin' : 'committees.read';

if (!rsa_hasCapability($pdo, $auth, $requiredCap)) {
    http_response_code(403);
    header('Content-Type: application/json');
    echo json_encode(['error' => "Missing capability: $requiredCap"]);
    exit;
}

header('Content-Type: application/json');

// ── Routing ────────────────────────────────────────────────────────────
try {
    switch ($action) {
        case 'list':
            if ($method !== 'GET') {
                http_response_code(405);
                echo json_encode(['error' => 'Method not allowed']);
                exit;
            }
            handleListCommittees($pdo);
            break;

        case 'get':
            if ($method !== 'GET') {
                http_response_code(405);
                echo json_encode(['error' => 'Method not allowed']);
                exit;
            }
            handleGetCommittee($pdo);
            break;

        case 'members':
            if ($method !== 'GET') {
                http_response_code(405);
                echo json_encode(['error' => 'Method not allowed']);
                exit;
            }
            handleListMembers($pdo);
            break;

        case 'categories':
            if ($method !== 'GET') {
                http_response_code(405);
                echo json_encode(['error' => 'Method not allowed']);
                exit;
            }
            handleListCategories($pdo);
            break;

        case 'create':
            if ($method !== 'POST') {
                http_response_code(405);
                echo json_encode(['error' => 'Method not allowed']);
                exit;
            }
            handleCreateCommittee($pdo, $auth);
            break;

        case 'update':
            if ($method !== 'PUT') {
                http_response_code(405);
                echo json_encode(['error' => 'Method not allowed']);
                exit;
            }
            handleUpdateCommittee($pdo, $auth);
            break;

        case 'delete':
            if ($method !== 'DELETE') {
                http_response_code(405);
                echo json_encode(['error' => 'Method not allowed']);
                exit;
            }
            handleDeleteCommittee($pdo, $auth);
            break;

        case 'addMember':
            if ($method !== 'POST') {
                http_response_code(405);
                echo json_encode(['error' => 'Method not allowed']);
                exit;
            }
            handleAddMember($pdo, $auth);
            break;

        case 'updateMember':
            if ($method !== 'PUT') {
                http_response_code(405);
                echo json_encode(['error' => 'Method not allowed']);
                exit;
            }
            handleUpdateMember($pdo, $auth);
            break;

        case 'removeMember':
            if ($method !== 'DELETE') {
                http_response_code(405);
                echo json_encode(['error' => 'Method not allowed']);
                exit;
            }
            handleRemoveMember($pdo, $auth);
            break;

        case 'eligibleUsers':
            if ($method !== 'GET') {
                http_response_code(405);
                echo json_encode(['error' => 'Method not allowed']);
                exit;
            }
            handleEligibleUsers($pdo);
            break;

        default:
            http_response_code(400);
            echo json_encode(['error' => "Unknown action: $action"]);
    }
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Database error: ' . $e->getMessage()]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Server error: ' . $e->getMessage()]);
}

// ─── Handlers ──────────────────────────────────────────────────────────

function handleListCommittees(PDO $pdo): void {
    // Check if table exists
    if (!tableExists($pdo, 'rules_committees')) {
        echo json_encode(['committees' => [], 'count' => 0]);
        return;
    }

    $where = ['deleted_at IS NULL'];
    $params = [];

    // Filters
    if (!empty($_GET['status'])) {
        $where[] = 'status = :status';
        $params[':status'] = $_GET['status'];
    }
    if (!empty($_GET['category'])) {
        $where[] = 'category = :category';
        $params[':category'] = $_GET['category'];
    }

    $sql = "SELECT id, uuid, name, slug, description, category, class_scope, status,
            created_at, updated_at
            FROM rules_committees
            WHERE " . implode(' AND ', $where) . "
            ORDER BY name ASC";

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $committees = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Get member counts
    foreach ($committees as &$committee) {
        $committee['member_count'] = getCommitteeMemberCount($pdo, $committee['id']);
    }

    echo json_encode(['committees' => $committees, 'count' => count($committees)]);
}

function handleGetCommittee(PDO $pdo): void {
    if (!tableExists($pdo, 'rules_committees')) {
        http_response_code(503);
        echo json_encode(['error' => 'Committees module not initialized']);
        return;
    }

    $idOrSlug = $_GET['id'] ?? null;
    if (!$idOrSlug) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing id parameter']);
        return;
    }

    // Try to fetch by ID first, then by slug
    if (is_numeric($idOrSlug)) {
        $stmt = $pdo->prepare("SELECT * FROM rules_committees WHERE id = ? AND deleted_at IS NULL");
        $stmt->execute([$idOrSlug]);
    } else {
        $stmt = $pdo->prepare("SELECT * FROM rules_committees WHERE slug = ? AND deleted_at IS NULL");
        $stmt->execute([$idOrSlug]);
    }

    $committee = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$committee) {
        http_response_code(404);
        echo json_encode(['error' => 'Committee not found']);
        return;
    }

    // Get members
    $members = getCommitteeMembers($pdo, $committee['id']);

    echo json_encode([
        'committee' => $committee,
        'members' => $members,
        'chair' => array_values(array_filter($members, fn($m) => $m['role'] === 'chairman'))[0] ?? null,
        'co_chair' => array_values(array_filter($members, fn($m) => $m['role'] === 'co_chairman'))[0] ?? null,
    ]);
}

function handleListMembers(PDO $pdo): void {
    $committeeId = $_GET['committee_id'] ?? null;
    if (!$committeeId || !is_numeric($committeeId)) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing or invalid committee_id']);
        return;
    }

    if (!tableExists($pdo, 'committee_memberships')) {
        echo json_encode(['members' => [], 'count' => 0]);
        return;
    }

    $members = getCommitteeMembers($pdo, (int)$committeeId);

    echo json_encode([
        'members' => $members,
        'count' => count($members),
        'chair' => array_values(array_filter($members, fn($m) => $m['role'] === 'chairman'))[0] ?? null,
        'co_chair' => array_values(array_filter($members, fn($m) => $m['role'] === 'co_chairman'))[0] ?? null,
    ]);
}

function handleListCategories(PDO $pdo): void {
    if (!tableExists($pdo, 'rules_committees')) {
        echo json_encode(['categories' => []]);
        return;
    }

    $stmt = $pdo->query("SELECT DISTINCT category FROM rules_committees WHERE deleted_at IS NULL AND category IS NOT NULL ORDER BY category");
    $categories = $stmt->fetchAll(PDO::FETCH_COLUMN);

    echo json_encode(['categories' => $categories]);
}

function handleCreateCommittee(PDO $pdo, array $auth): void {
    $data = json_decode(file_get_contents('php://input'), true);
    if (!$data) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid JSON body']);
        return;
    }

    // Validate required fields
    if (empty($data['name'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing required field: name']);
        return;
    }

    // Generate slug if not provided
    $slug = $data['slug'] ?? null;
    if (!$slug) {
        $slug = preg_replace('/[^a-z0-9]+/', '-', strtolower($data['name']));
        $slug = trim($slug, '-');
    }

    // Check for duplicate slug
    $check = $pdo->prepare("SELECT id FROM rules_committees WHERE slug = ? AND deleted_at IS NULL");
    $check->execute([$slug]);
    if ($check->fetch()) {
        http_response_code(409);
        echo json_encode(['error' => 'Committee with this slug already exists']);
        return;
    }

    $uuid = generate_uuid();
    $userId = rsa_resolveUserId($pdo, $auth);

    $stmt = $pdo->prepare("INSERT INTO rules_committees
        (uuid, name, slug, description, category, class_scope, status, created_by, created_at, updated_at)
        VALUES (:uuid, :name, :slug, :description, :category, :class_scope, :status, :created_by, NOW(), NOW())");

    $stmt->execute([
        ':uuid' => $uuid,
        ':name' => $data['name'],
        ':slug' => $slug,
        ':description' => $data['description'] ?? null,
        ':category' => $data['category'] ?? null,
        ':class_scope' => $data['class_scope'] ?? null,
        ':status' => $data['status'] ?? 'active',
        ':created_by' => $userId,
    ]);

    $id = $pdo->lastInsertId();

    echo json_encode(['success' => true, 'id' => $id, 'uuid' => $uuid]);
}

function handleUpdateCommittee(PDO $pdo, array $auth): void {
    $id = $_GET['id'] ?? null;
    if (!$id || !is_numeric($id)) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing or invalid id']);
        return;
    }

    $data = json_decode(file_get_contents('php://input'), true);
    if (!$data) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid JSON body']);
        return;
    }

    // Check if committee exists
    $check = $pdo->prepare("SELECT id FROM rules_committees WHERE id = ? AND deleted_at IS NULL");
    $check->execute([$id]);
    if (!$check->fetch()) {
        http_response_code(404);
        echo json_encode(['error' => 'Committee not found']);
        return;
    }

    // Build update SQL
    $fields = [];
    $params = [':id' => $id];

    if (isset($data['name'])) {
        $fields[] = 'name = :name';
        $params[':name'] = $data['name'];
    }
    if (isset($data['slug'])) {
        $fields[] = 'slug = :slug';
        $params[':slug'] = $data['slug'];
    }
    if (isset($data['description'])) {
        $fields[] = 'description = :description';
        $params[':description'] = $data['description'];
    }
    if (isset($data['category'])) {
        $fields[] = 'category = :category';
        $params[':category'] = $data['category'];
    }
    if (isset($data['class_scope'])) {
        $fields[] = 'class_scope = :class_scope';
        $params[':class_scope'] = $data['class_scope'];
    }
    if (isset($data['status'])) {
        $fields[] = 'status = :status';
        $params[':status'] = $data['status'];
    }

    if (empty($fields)) {
        http_response_code(400);
        echo json_encode(['error' => 'No fields to update']);
        return;
    }

    $sql = "UPDATE rules_committees SET " . implode(', ', $fields) . ", updated_at = NOW() WHERE id = :id";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    echo json_encode(['success' => true]);
}

function handleDeleteCommittee(PDO $pdo, array $auth): void {
    $id = $_GET['id'] ?? null;
    if (!$id || !is_numeric($id)) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing or invalid id']);
        return;
    }

    // Soft delete
    $stmt = $pdo->prepare("UPDATE rules_committees SET deleted_at = NOW(), status = 'dissolved', updated_at = NOW() WHERE id = ? AND deleted_at IS NULL");
    $stmt->execute([$id]);

    if ($stmt->rowCount() === 0) {
        http_response_code(404);
        echo json_encode(['error' => 'Committee not found']);
        return;
    }

    echo json_encode(['success' => true]);
}

function handleAddMember(PDO $pdo, array $auth): void {
    $data = json_decode(file_get_contents('php://input'), true);
    if (!$data) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid JSON body']);
        return;
    }

    // Validate required fields
    if (empty($data['committee_id']) || !is_numeric($data['committee_id'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing or invalid committee_id']);
        return;
    }
    if (empty($data['role'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing required field: role']);
        return;
    }

    // Validate role
    $validRoles = ['chairman', 'co_chairman', 'member', 'advisor', 'secretary', 'liaison', 'guest', 'observer'];
    if (!in_array($data['role'], $validRoles)) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid role. Must be one of: ' . implode(', ', $validRoles)]);
        return;
    }

    // At least one of user_id or person_id must be provided
    if (empty($data['user_id']) && empty($data['person_id'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Either user_id or person_id must be provided']);
        return;
    }

    $userId = rsa_resolveUserId($pdo, $auth);

    $stmt = $pdo->prepare("INSERT INTO committee_memberships
        (committee_id, user_id, person_id, role, title, voting_member, start_date, end_date, created_by, created_at, updated_at)
        VALUES (:committee_id, :user_id, :person_id, :role, :title, :voting_member, :start_date, :end_date, :created_by, NOW(), NOW())");

    try {
        $stmt->execute([
            ':committee_id' => $data['committee_id'],
            ':user_id' => $data['user_id'] ?? null,
            ':person_id' => $data['person_id'] ?? null,
            ':role' => $data['role'],
            ':title' => $data['title'] ?? null,
            ':voting_member' => isset($data['voting_member']) ? (int)$data['voting_member'] : 1,
            ':start_date' => $data['start_date'] ?? date('Y-m-d'),
            ':end_date' => $data['end_date'] ?? null,
            ':created_by' => $userId,
        ]);

        $id = $pdo->lastInsertId();
        echo json_encode(['success' => true, 'id' => $id]);
    } catch (PDOException $e) {
        if (str_contains($e->getMessage(), 'Duplicate')) {
            http_response_code(409);
            echo json_encode(['error' => 'Duplicate membership: this user already has this role on this committee']);
        } else {
            throw $e;
        }
    }
}

function handleUpdateMember(PDO $pdo, array $auth): void {
    $id = $_GET['id'] ?? null;
    if (!$id || !is_numeric($id)) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing or invalid member id']);
        return;
    }

    $data = json_decode(file_get_contents('php://input'), true);
    if (!$data) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid JSON body']);
        return;
    }

    // Check if membership exists
    $check = $pdo->prepare("SELECT id FROM committee_memberships WHERE id = ? AND deleted_at IS NULL");
    $check->execute([$id]);
    if (!$check->fetch()) {
        http_response_code(404);
        echo json_encode(['error' => 'Membership not found']);
        return;
    }

    // Build update SQL
    $fields = [];
    $params = [':id' => $id];

    if (isset($data['role'])) {
        $validRoles = ['chairman', 'co_chairman', 'member', 'advisor', 'secretary', 'liaison', 'guest', 'observer'];
        if (!in_array($data['role'], $validRoles)) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid role']);
            return;
        }
        $fields[] = 'role = :role';
        $params[':role'] = $data['role'];
    }
    if (isset($data['title'])) {
        $fields[] = 'title = :title';
        $params[':title'] = $data['title'];
    }
    if (isset($data['voting_member'])) {
        $fields[] = 'voting_member = :voting_member';
        $params[':voting_member'] = (int)$data['voting_member'];
    }
    if (isset($data['start_date'])) {
        $fields[] = 'start_date = :start_date';
        $params[':start_date'] = $data['start_date'];
    }
    if (isset($data['end_date'])) {
        $fields[] = 'end_date = :end_date';
        $params[':end_date'] = $data['end_date'];
    }

    if (empty($fields)) {
        http_response_code(400);
        echo json_encode(['error' => 'No fields to update']);
        return;
    }

    $sql = "UPDATE committee_memberships SET " . implode(', ', $fields) . ", updated_at = NOW() WHERE id = :id";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    echo json_encode(['success' => true]);
}

function handleRemoveMember(PDO $pdo, array $auth): void {
    $id = $_GET['id'] ?? null;
    if (!$id || !is_numeric($id)) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing or invalid member id']);
        return;
    }

    // Soft delete
    $stmt = $pdo->prepare("UPDATE committee_memberships SET deleted_at = NOW(), end_date = COALESCE(end_date, CURDATE()), updated_at = NOW() WHERE id = ? AND deleted_at IS NULL");
    $stmt->execute([$id]);

    if ($stmt->rowCount() === 0) {
        http_response_code(404);
        echo json_encode(['error' => 'Membership not found']);
        return;
    }

    echo json_encode(['success' => true]);
}

function handleEligibleUsers(PDO $pdo): void {
    // Get users who are not already members of this committee with overlapping dates
    $committeeId = $_GET['committee_id'] ?? null;

    // Return all active users (simplified - can be enhanced with exclusions)
    $stmt = $pdo->query("SELECT id, name, email FROM users WHERE deleted_at IS NULL OR deleted_at = '0000-00-00 00:00:00' ORDER BY name");
    $users = $stmt->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode(['users' => $users, 'count' => count($users)]);
}
