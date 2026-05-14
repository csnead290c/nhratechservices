<?php
/**
 * Event Operations API
 *
 * Endpoints for managing pre-event plans, staff, sections, sessions, tasks, and files.
 *
 * Read actions require:  eventops.read
 * Admin actions require: eventops.admin
 *
 * Usage: /api/event-ops.php?action=<action>
 */

header('Content-Type: application/json');
header('Cache-Control: no-store, no-cache, must-revalidate');

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/functions.php';
require_once __DIR__ . '/lib/capabilities.php';
require_once __DIR__ . '/event-ops-reports.php';

$pdo = getDB();
$auth = rsa_requireAuth();
$userId = rsa_resolveUserId($pdo, $auth);
$role = rsa_getUserRole($pdo, $userId);

$action = $_GET['action'] ?? $_POST['action'] ?? '';

// ── Helpers ────────────────────────────────────────────────────────────────

function eo_requireRead(PDO $pdo, int $userId, string $role): void {
    rsa_requireCapability($pdo, $userId, $role, 'eventops.read');
}

function eo_requireAdmin(PDO $pdo, int $userId, string $role): void {
    rsa_requireCapability($pdo, $userId, $role, 'eventops.admin');
}

function eo_getPlanOrFail(PDO $pdo, int $planId): array {
    $stmt = $pdo->prepare("SELECT * FROM event_plans WHERE id = ? AND deleted_at IS NULL");
    $stmt->execute([$planId]);
    $plan = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$plan) {
        http_response_code(404);
        echo json_encode(['error' => 'Event plan not found']);
        exit;
    }
    return $plan;
}

function eo_intParam(string $key, bool $required = true): ?int {
    $val = $_GET[$key] ?? $_POST[$key] ?? null;
    if ($required && ($val === null || $val === '')) {
        http_response_code(400);
        echo json_encode(['error' => "Missing required parameter: $key"]);
        exit;
    }
    return $val !== null ? (int) $val : null;
}

function eo_strParam(string $key, bool $required = true): ?string {
    $raw = $_POST[$key] ?? null;
    if ($raw === null) {
        $body = json_decode(file_get_contents('php://input'), true);
        $raw = $body[$key] ?? null;
    }
    if ($required && ($raw === null || $raw === '')) {
        http_response_code(400);
        echo json_encode(['error' => "Missing required parameter: $key"]);
        exit;
    }
    return $raw !== null ? trim((string) $raw) : null;
}

function eo_body(): array {
    static $body = null;
    if ($body === null) {
        $body = json_decode(file_get_contents('php://input'), true) ?? [];
    }
    return $body;
}

function eo_validateEnum(string $value, array $allowed, string $field): void {
    if (!in_array($value, $allowed, true)) {
        http_response_code(400);
        echo json_encode(['error' => "Invalid value for $field. Allowed: " . implode(', ', $allowed)]);
        exit;
    }
}

function eo_newUuid(): string {
    return sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
        mt_rand(0, 0xffff), mt_rand(0, 0xffff),
        mt_rand(0, 0xffff),
        mt_rand(0, 0x0fff) | 0x4000,
        mt_rand(0, 0x3fff) | 0x8000,
        mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff)
    );
}

// ── Plan actions ───────────────────────────────────────────────────────────

function eo_listPlans(PDO $pdo, int $userId, string $role): void {
    eo_requireRead($pdo, $userId, $role);
    $stmt = $pdo->query("
        SELECT id, uuid, year, event_code, track_name, title, class_scope,
               plan_type, status, summary, created_by, approved_by, approved_at,
               created_at, updated_at
        FROM event_plans
        WHERE deleted_at IS NULL
        ORDER BY year DESC, event_code ASC, created_at DESC
    ");
    rsa_jsonResponse(['plans' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
}

function eo_getPlan(PDO $pdo, int $userId, string $role): void {
    eo_requireRead($pdo, $userId, $role);
    $planId = eo_intParam('plan_id');
    rsa_jsonResponse(['plan' => eo_getPlanOrFail($pdo, $planId)]);
}

function eo_createPlan(PDO $pdo, int $userId, string $role): void {
    eo_requireAdmin($pdo, $userId, $role);
    $b = eo_body();

    $year       = (int) ($b['year'] ?? date('Y'));
    $eventCode  = trim($b['event_code'] ?? '');
    $title      = trim($b['title'] ?? '');
    $planType   = $b['plan_type'] ?? 'pre_event';
    $status     = $b['status'] ?? 'draft';

    if (!$eventCode || !$title) {
        http_response_code(400);
        echo json_encode(['error' => 'event_code and title are required']);
        exit;
    }
    eo_validateEnum($planType, ['pre_event','race_day','post_event','template'], 'plan_type');
    eo_validateEnum($status, ['draft','pending_review','approved','archived'], 'status');

    $stmt = $pdo->prepare("
        INSERT INTO event_plans
            (uuid, event_instance_id, parity_event_id, year, event_code, track_name, title,
             class_scope, plan_type, status, summary, created_by)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    ");
    $stmt->execute([
        eo_newUuid(),
        $b['event_instance_id'] ?? null,
        $b['parity_event_id'] ?? null,
        $year,
        $eventCode,
        $b['track_name'] ?? null,
        $title,
        $b['class_scope'] ?? null,
        $planType,
        $status,
        $b['summary'] ?? null,
        $userId,
    ]);
    $newId = (int) $pdo->lastInsertId();
    rsa_jsonResponse(['success' => true, 'plan_id' => $newId], 201);
}

function eo_updatePlan(PDO $pdo, int $userId, string $role): void {
    eo_requireAdmin($pdo, $userId, $role);
    $b = eo_body();
    $planId = (int) ($b['plan_id'] ?? 0);
    if (!$planId) { http_response_code(400); echo json_encode(['error' => 'plan_id required']); exit; }
    eo_getPlanOrFail($pdo, $planId);

    $fields = [];
    $params = [];
    $allowed = ['year','event_code','track_name','title','class_scope','plan_type','status','summary','approved_by','approved_at'];
    $enums = [
        'plan_type' => ['pre_event','race_day','post_event','template'],
        'status'    => ['draft','pending_review','approved','archived'],
    ];
    foreach ($allowed as $f) {
        if (array_key_exists($f, $b)) {
            if (isset($enums[$f])) eo_validateEnum($b[$f], $enums[$f], $f);
            $fields[] = "`$f` = ?";
            $params[] = $b[$f];
        }
    }
    if (!$fields) { http_response_code(400); echo json_encode(['error' => 'No fields to update']); exit; }
    $params[] = $planId;
    $pdo->prepare("UPDATE event_plans SET " . implode(', ', $fields) . " WHERE id = ?")->execute($params);
    rsa_jsonResponse(['success' => true]);
}

function eo_softDeletePlan(PDO $pdo, int $userId, string $role): void {
    eo_requireAdmin($pdo, $userId, $role);
    $b = eo_body();
    $planId = (int) ($b['plan_id'] ?? 0);
    if (!$planId) { http_response_code(400); echo json_encode(['error' => 'plan_id required']); exit; }
    eo_getPlanOrFail($pdo, $planId);
    $pdo->prepare("UPDATE event_plans SET deleted_at = NOW() WHERE id = ?")->execute([$planId]);
    rsa_jsonResponse(['success' => true]);
}

function eo_clonePlan(PDO $pdo, int $userId, string $role): void {
    eo_requireAdmin($pdo, $userId, $role);
    $b = eo_body();
    $planId = (int) ($b['plan_id'] ?? 0);
    if (!$planId) { http_response_code(400); echo json_encode(['error' => 'plan_id required']); exit; }
    $src = eo_getPlanOrFail($pdo, $planId);

    $newTitle = trim($b['title'] ?? ('Copy of ' . $src['title']));
    $newCode  = trim($b['event_code'] ?? $src['event_code']);
    $newYear  = (int) ($b['year'] ?? $src['year']);

    $stmt = $pdo->prepare("
        INSERT INTO event_plans
            (uuid, event_instance_id, parity_event_id, year, event_code, track_name,
             title, class_scope, plan_type, status, summary, created_by)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    ");
    $stmt->execute([
        eo_newUuid(),
        $b['event_instance_id'] ?? null,
        null,
        $newYear,
        $newCode,
        $src['track_name'],
        $newTitle,
        $src['class_scope'],
        $src['plan_type'],
        'draft',
        $src['summary'],
        $userId,
    ]);
    $newId = (int) $pdo->lastInsertId();

    // Clone sections
    $secs = $pdo->prepare("SELECT * FROM event_plan_sections WHERE event_plan_id = ? AND deleted_at IS NULL ORDER BY sort_order");
    $secs->execute([$planId]);
    $insS = $pdo->prepare("INSERT INTO event_plan_sections (event_plan_id,section_key,title,body,sort_order) VALUES (?,?,?,?,?)");
    foreach ($secs->fetchAll(PDO::FETCH_ASSOC) as $s) {
        $insS->execute([$newId, $s['section_key'], $s['title'], $s['body'], $s['sort_order']]);
    }

    // Clone sessions
    $sess = $pdo->prepare("SELECT * FROM event_plan_sessions WHERE event_plan_id = ? AND deleted_at IS NULL ORDER BY sort_order");
    $sess->execute([$planId]);
    $insSession = $pdo->prepare("INSERT INTO event_plan_sessions (event_plan_id,session_key,title,class_scope,notes,sort_order) VALUES (?,?,?,?,?,?)");
    foreach ($sess->fetchAll(PDO::FETCH_ASSOC) as $s) {
        $insSession->execute([$newId, $s['session_key'], $s['title'], $s['class_scope'], $s['notes'], $s['sort_order']]);
    }

    rsa_jsonResponse(['success' => true, 'plan_id' => $newId], 201);
}

function eo_generateFromTemplate(PDO $pdo, int $userId, string $role): void {
    eo_requireAdmin($pdo, $userId, $role);
    rsa_jsonResponse(['success' => false, 'message' => 'generateFromTemplate: not yet implemented. Use the Nitro template from the frontend as a draft helper.']);
}

// ── Staff actions ──────────────────────────────────────────────────────────

function eo_getPlanStaff(PDO $pdo, int $userId, string $role): void {
    eo_requireRead($pdo, $userId, $role);
    $planId = eo_intParam('plan_id');
    eo_getPlanOrFail($pdo, $planId);
    $stmt = $pdo->prepare("SELECT * FROM event_plan_staff WHERE event_plan_id = ? AND deleted_at IS NULL ORDER BY sort_order, id");
    $stmt->execute([$planId]);
    rsa_jsonResponse(['staff' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
}

function eo_addStaff(PDO $pdo, int $userId, string $role): void {
    eo_requireAdmin($pdo, $userId, $role);
    $b = eo_body();
    $planId = (int) ($b['plan_id'] ?? 0);
    if (!$planId) { http_response_code(400); echo json_encode(['error' => 'plan_id required']); exit; }
    eo_getPlanOrFail($pdo, $planId);
    $displayName = trim($b['display_name'] ?? '');
    $assignment  = trim($b['assignment'] ?? '');
    if (!$displayName || !$assignment) { http_response_code(400); echo json_encode(['error' => 'display_name and assignment required']); exit; }
    $stmt = $pdo->prepare("INSERT INTO event_plan_staff (event_plan_id,user_id,person_id,display_name,assignment,arrive_at,depart_at,notes,sort_order) VALUES (?,?,?,?,?,?,?,?,?)");
    $stmt->execute([$planId, $b['user_id']??null, $b['person_id']??null, $displayName, $assignment, $b['arrive_at']??null, $b['depart_at']??null, $b['notes']??null, (int)($b['sort_order']??0)]);
    rsa_jsonResponse(['success' => true, 'staff_id' => (int)$pdo->lastInsertId()], 201);
}

function eo_updateStaff(PDO $pdo, int $userId, string $role): void {
    eo_requireAdmin($pdo, $userId, $role);
    $b = eo_body();
    $staffId = (int) ($b['staff_id'] ?? 0);
    if (!$staffId) { http_response_code(400); echo json_encode(['error' => 'staff_id required']); exit; }
    $allowed = ['display_name','assignment','arrive_at','depart_at','notes','sort_order','user_id','person_id'];
    $fields = []; $params = [];
    foreach ($allowed as $f) {
        if (array_key_exists($f, $b)) { $fields[] = "`$f` = ?"; $params[] = $b[$f]; }
    }
    if (!$fields) { http_response_code(400); echo json_encode(['error' => 'No fields to update']); exit; }
    $params[] = $staffId;
    $pdo->prepare("UPDATE event_plan_staff SET " . implode(', ', $fields) . " WHERE id = ? AND deleted_at IS NULL")->execute($params);
    rsa_jsonResponse(['success' => true]);
}

function eo_deleteStaff(PDO $pdo, int $userId, string $role): void {
    eo_requireAdmin($pdo, $userId, $role);
    $b = eo_body();
    $staffId = (int) ($b['staff_id'] ?? 0);
    if (!$staffId) { http_response_code(400); echo json_encode(['error' => 'staff_id required']); exit; }
    $pdo->prepare("UPDATE event_plan_staff SET deleted_at = NOW() WHERE id = ?")->execute([$staffId]);
    rsa_jsonResponse(['success' => true]);
}

// ── Section actions ────────────────────────────────────────────────────────

function eo_getPlanSections(PDO $pdo, int $userId, string $role): void {
    eo_requireRead($pdo, $userId, $role);
    $planId = eo_intParam('plan_id');
    eo_getPlanOrFail($pdo, $planId);
    $stmt = $pdo->prepare("SELECT * FROM event_plan_sections WHERE event_plan_id = ? AND deleted_at IS NULL ORDER BY sort_order, id");
    $stmt->execute([$planId]);
    rsa_jsonResponse(['sections' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
}

function eo_addSection(PDO $pdo, int $userId, string $role): void {
    eo_requireAdmin($pdo, $userId, $role);
    $b = eo_body();
    $planId = (int) ($b['plan_id'] ?? 0);
    if (!$planId) { http_response_code(400); echo json_encode(['error' => 'plan_id required']); exit; }
    eo_getPlanOrFail($pdo, $planId);
    $key   = trim($b['section_key'] ?? '');
    $title = trim($b['title'] ?? '');
    if (!$key || !$title) { http_response_code(400); echo json_encode(['error' => 'section_key and title required']); exit; }
    $stmt = $pdo->prepare("INSERT INTO event_plan_sections (event_plan_id,section_key,title,body,sort_order) VALUES (?,?,?,?,?)");
    $stmt->execute([$planId, $key, $title, $b['body']??null, (int)($b['sort_order']??0)]);
    rsa_jsonResponse(['success' => true, 'section_id' => (int)$pdo->lastInsertId()], 201);
}

function eo_updateSection(PDO $pdo, int $userId, string $role): void {
    eo_requireAdmin($pdo, $userId, $role);
    $b = eo_body();
    $sectionId = (int) ($b['section_id'] ?? 0);
    if (!$sectionId) { http_response_code(400); echo json_encode(['error' => 'section_id required']); exit; }
    $allowed = ['title','body','sort_order'];
    $fields = []; $params = [];
    foreach ($allowed as $f) {
        if (array_key_exists($f, $b)) { $fields[] = "`$f` = ?"; $params[] = $b[$f]; }
    }
    if (!$fields) { http_response_code(400); echo json_encode(['error' => 'No fields to update']); exit; }
    $params[] = $sectionId;
    $pdo->prepare("UPDATE event_plan_sections SET " . implode(', ', $fields) . " WHERE id = ? AND deleted_at IS NULL")->execute($params);
    rsa_jsonResponse(['success' => true]);
}

function eo_deleteSection(PDO $pdo, int $userId, string $role): void {
    eo_requireAdmin($pdo, $userId, $role);
    $b = eo_body();
    $sectionId = (int) ($b['section_id'] ?? 0);
    if (!$sectionId) { http_response_code(400); echo json_encode(['error' => 'section_id required']); exit; }
    $pdo->prepare("UPDATE event_plan_sections SET deleted_at = NOW() WHERE id = ?")->execute([$sectionId]);
    rsa_jsonResponse(['success' => true]);
}

// ── Session actions ────────────────────────────────────────────────────────

function eo_getPlanSessions(PDO $pdo, int $userId, string $role): void {
    eo_requireRead($pdo, $userId, $role);
    $planId = eo_intParam('plan_id');
    eo_getPlanOrFail($pdo, $planId);
    $stmt = $pdo->prepare("SELECT * FROM event_plan_sessions WHERE event_plan_id = ? AND deleted_at IS NULL ORDER BY sort_order, id");
    $stmt->execute([$planId]);
    rsa_jsonResponse(['sessions' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
}

function eo_addSession(PDO $pdo, int $userId, string $role): void {
    eo_requireAdmin($pdo, $userId, $role);
    $b = eo_body();
    $planId = (int) ($b['plan_id'] ?? 0);
    if (!$planId) { http_response_code(400); echo json_encode(['error' => 'plan_id required']); exit; }
    eo_getPlanOrFail($pdo, $planId);
    $key   = trim($b['session_key'] ?? '');
    $title = trim($b['title'] ?? '');
    if (!$key || !$title) { http_response_code(400); echo json_encode(['error' => 'session_key and title required']); exit; }
    $stmt = $pdo->prepare("INSERT INTO event_plan_sessions (event_plan_id,session_key,title,class_scope,scheduled_at,notes,sort_order) VALUES (?,?,?,?,?,?,?)");
    $stmt->execute([$planId, $key, $title, $b['class_scope']??null, $b['scheduled_at']??null, $b['notes']??null, (int)($b['sort_order']??0)]);
    rsa_jsonResponse(['success' => true, 'session_id' => (int)$pdo->lastInsertId()], 201);
}

function eo_updateSession(PDO $pdo, int $userId, string $role): void {
    eo_requireAdmin($pdo, $userId, $role);
    $b = eo_body();
    $sessionId = (int) ($b['session_id'] ?? 0);
    if (!$sessionId) { http_response_code(400); echo json_encode(['error' => 'session_id required']); exit; }
    $allowed = ['title','class_scope','scheduled_at','notes','sort_order'];
    $fields = []; $params = [];
    foreach ($allowed as $f) {
        if (array_key_exists($f, $b)) { $fields[] = "`$f` = ?"; $params[] = $b[$f]; }
    }
    if (!$fields) { http_response_code(400); echo json_encode(['error' => 'No fields to update']); exit; }
    $params[] = $sessionId;
    $pdo->prepare("UPDATE event_plan_sessions SET " . implode(', ', $fields) . " WHERE id = ? AND deleted_at IS NULL")->execute($params);
    rsa_jsonResponse(['success' => true]);
}

function eo_deleteSession(PDO $pdo, int $userId, string $role): void {
    eo_requireAdmin($pdo, $userId, $role);
    $b = eo_body();
    $sessionId = (int) ($b['session_id'] ?? 0);
    if (!$sessionId) { http_response_code(400); echo json_encode(['error' => 'session_id required']); exit; }
    $pdo->prepare("UPDATE event_plan_sessions SET deleted_at = NOW() WHERE id = ?")->execute([$sessionId]);
    rsa_jsonResponse(['success' => true]);
}

// ── Task actions ───────────────────────────────────────────────────────────

function eo_getPlanTasks(PDO $pdo, int $userId, string $role): void {
    eo_requireRead($pdo, $userId, $role);
    $planId = eo_intParam('plan_id');
    eo_getPlanOrFail($pdo, $planId);
    $stmt = $pdo->prepare("SELECT * FROM event_plan_tasks WHERE event_plan_id = ? AND deleted_at IS NULL ORDER BY sort_order, id");
    $stmt->execute([$planId]);
    rsa_jsonResponse(['tasks' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
}

function eo_addTask(PDO $pdo, int $userId, string $role): void {
    eo_requireAdmin($pdo, $userId, $role);
    $b = eo_body();
    $planId = (int) ($b['plan_id'] ?? 0);
    if (!$planId) { http_response_code(400); echo json_encode(['error' => 'plan_id required']); exit; }
    eo_getPlanOrFail($pdo, $planId);
    $title = trim($b['title'] ?? '');
    if (!$title) { http_response_code(400); echo json_encode(['error' => 'title required']); exit; }
    $taskType = $b['task_type'] ?? 'other';
    $priority = $b['priority'] ?? 'normal';
    $status   = $b['status'] ?? 'open';
    eo_validateEnum($taskType, ['inspection','survey','briefing','logistics','safety','admin','other'], 'task_type');
    eo_validateEnum($priority, ['high','normal','low'], 'priority');
    eo_validateEnum($status, ['open','in_progress','completed','deferred','cancelled'], 'status');
    $stmt = $pdo->prepare("INSERT INTO event_plan_tasks (event_plan_id,session_id,title,description,task_type,priority,status,assigned_user_id,assigned_person_id,due_at,carry_forward_to_next_event,sort_order) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)");
    $stmt->execute([$planId, $b['session_id']??null, $title, $b['description']??null, $taskType, $priority, $status, $b['assigned_user_id']??null, $b['assigned_person_id']??null, $b['due_at']??null, (int)($b['carry_forward_to_next_event']??0), (int)($b['sort_order']??0)]);
    rsa_jsonResponse(['success' => true, 'task_id' => (int)$pdo->lastInsertId()], 201);
}

function eo_updateTask(PDO $pdo, int $userId, string $role): void {
    eo_requireAdmin($pdo, $userId, $role);
    $b = eo_body();
    $taskId = (int) ($b['task_id'] ?? 0);
    if (!$taskId) { http_response_code(400); echo json_encode(['error' => 'task_id required']); exit; }
    $allowed = ['title','description','task_type','priority','status','assigned_user_id','assigned_person_id','due_at','completed_at','completed_by','carry_forward_to_next_event','result_summary','sort_order'];
    $enums = [
        'task_type' => ['inspection','survey','briefing','logistics','safety','admin','other'],
        'priority'  => ['high','normal','low'],
        'status'    => ['open','in_progress','completed','deferred','cancelled'],
    ];
    $fields = []; $params = [];
    foreach ($allowed as $f) {
        if (array_key_exists($f, $b)) {
            if (isset($enums[$f])) eo_validateEnum($b[$f], $enums[$f], $f);
            $fields[] = "`$f` = ?"; $params[] = $b[$f];
        }
    }
    if (!$fields) { http_response_code(400); echo json_encode(['error' => 'No fields to update']); exit; }
    $params[] = $taskId;
    $pdo->prepare("UPDATE event_plan_tasks SET " . implode(', ', $fields) . " WHERE id = ? AND deleted_at IS NULL")->execute($params);
    rsa_jsonResponse(['success' => true]);
}

function eo_deleteTask(PDO $pdo, int $userId, string $role): void {
    eo_requireAdmin($pdo, $userId, $role);
    $b = eo_body();
    $taskId = (int) ($b['task_id'] ?? 0);
    if (!$taskId) { http_response_code(400); echo json_encode(['error' => 'task_id required']); exit; }
    $pdo->prepare("UPDATE event_plan_tasks SET deleted_at = NOW() WHERE id = ?")->execute([$taskId]);
    rsa_jsonResponse(['success' => true]);
}

function eo_addTaskTarget(PDO $pdo, int $userId, string $role): void {
    eo_requireAdmin($pdo, $userId, $role);
    $b = eo_body();
    $taskId = (int) ($b['task_id'] ?? 0);
    if (!$taskId) { http_response_code(400); echo json_encode(['error' => 'task_id required']); exit; }
    $stmt = $pdo->prepare("INSERT INTO event_plan_task_targets (task_id,event_entry_id,driver_name,class_code,vehicle_identifier,notes) VALUES (?,?,?,?,?,?)");
    $stmt->execute([$taskId, $b['event_entry_id']??null, $b['driver_name']??null, $b['class_code']??null, $b['vehicle_identifier']??null, $b['notes']??null]);
    rsa_jsonResponse(['success' => true, 'target_id' => (int)$pdo->lastInsertId()], 201);
}

function eo_deleteTaskTarget(PDO $pdo, int $userId, string $role): void {
    eo_requireAdmin($pdo, $userId, $role);
    $b = eo_body();
    $targetId = (int) ($b['target_id'] ?? 0);
    if (!$targetId) { http_response_code(400); echo json_encode(['error' => 'target_id required']); exit; }
    $pdo->prepare("UPDATE event_plan_task_targets SET deleted_at = NOW() WHERE id = ?")->execute([$targetId]);
    rsa_jsonResponse(['success' => true]);
}

// ── File actions ───────────────────────────────────────────────────────────

function eo_getPlanFiles(PDO $pdo, int $userId, string $role): void {
    eo_requireRead($pdo, $userId, $role);
    $planId = eo_intParam('plan_id');
    eo_getPlanOrFail($pdo, $planId);
    $stmt = $pdo->prepare("SELECT * FROM event_plan_files WHERE event_plan_id = ? AND deleted_at IS NULL ORDER BY file_type, id");
    $stmt->execute([$planId]);
    rsa_jsonResponse(['files' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
}

function eo_addFile(PDO $pdo, int $userId, string $role): void {
    eo_requireAdmin($pdo, $userId, $role);
    $b = eo_body();
    $planId = (int) ($b['plan_id'] ?? 0);
    if (!$planId) { http_response_code(400); echo json_encode(['error' => 'plan_id required']); exit; }
    eo_getPlanOrFail($pdo, $planId);
    $fileType = $b['file_type'] ?? 'other';
    $title    = trim($b['title'] ?? '');
    if (!$title) { http_response_code(400); echo json_encode(['error' => 'title required']); exit; }
    eo_validateEnum($fileType, ['map','schedule','entry_list','manual','report','photo','other'], 'file_type');
    $stmt = $pdo->prepare("INSERT INTO event_plan_files (event_plan_id,file_type,title,url,box_file_id,box_folder_id,notes) VALUES (?,?,?,?,?,?,?)");
    $stmt->execute([$planId, $fileType, $title, $b['url']??null, $b['box_file_id']??null, $b['box_folder_id']??null, $b['notes']??null]);
    rsa_jsonResponse(['success' => true, 'file_id' => (int)$pdo->lastInsertId()], 201);
}

function eo_updateFile(PDO $pdo, int $userId, string $role): void {
    eo_requireAdmin($pdo, $userId, $role);
    $b = eo_body();
    $fileId = (int) ($b['file_id'] ?? 0);
    if (!$fileId) { http_response_code(400); echo json_encode(['error' => 'file_id required']); exit; }
    $allowed = ['file_type','title','url','box_file_id','box_folder_id','notes'];
    $fields = []; $params = [];
    foreach ($allowed as $f) {
        if (array_key_exists($f, $b)) {
            if ($f === 'file_type') eo_validateEnum($b[$f], ['map','schedule','entry_list','manual','report','photo','other'], 'file_type');
            $fields[] = "`$f` = ?"; $params[] = $b[$f];
        }
    }
    if (!$fields) { http_response_code(400); echo json_encode(['error' => 'No fields to update']); exit; }
    $params[] = $fileId;
    $pdo->prepare("UPDATE event_plan_files SET " . implode(', ', $fields) . " WHERE id = ? AND deleted_at IS NULL")->execute($params);
    rsa_jsonResponse(['success' => true]);
}

function eo_deleteFile(PDO $pdo, int $userId, string $role): void {
    eo_requireAdmin($pdo, $userId, $role);
    $b = eo_body();
    $fileId = (int) ($b['file_id'] ?? 0);
    if (!$fileId) { http_response_code(400); echo json_encode(['error' => 'file_id required']); exit; }
    $pdo->prepare("UPDATE event_plan_files SET deleted_at = NOW() WHERE id = ?")->execute([$fileId]);
    rsa_jsonResponse(['success' => true]);
}

// ── Live Checklist helpers ──────────────────────────────────────────────────

/** Status values valid for live checklist, sessions, and task updates */
const LIVE_STATUSES = ['not_started','in_progress','complete','issue_found','skipped','blocked','not_applicable'];

/**
 * Lazily get or create the single live checklist record for a plan.
 * Returns the row (always). Creates with status=not_started if absent.
 */
function eo_getOrCreateChecklist(PDO $pdo, int $planId, int $userId): array {
    $stmt = $pdo->prepare("SELECT * FROM event_live_checklists WHERE event_plan_id = ? AND deleted_at IS NULL ORDER BY id DESC LIMIT 1");
    $stmt->execute([$planId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if ($row) return $row;

    $uuid = eo_newUuid();
    $pdo->prepare("INSERT INTO event_live_checklists (uuid, event_plan_id, status, created_by) VALUES (?, ?, 'not_started', ?)")
        ->execute([$uuid, $planId, $userId]);
    $id = $pdo->lastInsertId();
    $stmt = $pdo->prepare("SELECT * FROM event_live_checklists WHERE id = ?");
    $stmt->execute([$id]);
    return $stmt->fetch(PDO::FETCH_ASSOC);
}

/**
 * Validate that a task belongs to the given plan.
 */
function eo_validateTaskBelongsToPlan(PDO $pdo, int $taskId, int $planId): array {
    $stmt = $pdo->prepare("SELECT id, session_id FROM event_plan_tasks WHERE id = ? AND event_plan_id = ? AND deleted_at IS NULL");
    $stmt->execute([$taskId, $planId]);
    $task = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$task) {
        http_response_code(404);
        echo json_encode(['error' => 'Task not found or does not belong to this plan']);
        exit;
    }
    return $task;
}

/**
 * Validate that a session belongs to the given plan.
 */
function eo_validateSessionBelongsToPlan(PDO $pdo, int $sessionId, int $planId): void {
    $stmt = $pdo->prepare("SELECT id FROM event_plan_sessions WHERE id = ? AND event_plan_id = ? AND deleted_at IS NULL");
    $stmt->execute([$sessionId, $planId]);
    if (!$stmt->fetch()) {
        http_response_code(404);
        echo json_encode(['error' => 'Session not found or does not belong to this plan']);
        exit;
    }
}

/**
 * Get or create a task update record for a given task+plan.
 */
function eo_getOrCreateTaskUpdate(PDO $pdo, int $planId, int $taskId, ?int $sessionId, int $userId): array {
    $stmt = $pdo->prepare("SELECT * FROM event_live_task_updates WHERE task_id = ? AND event_plan_id = ? AND deleted_at IS NULL ORDER BY id DESC LIMIT 1");
    $stmt->execute([$taskId, $planId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if ($row) return $row;

    $uuid = eo_newUuid();
    $pdo->prepare("INSERT INTO event_live_task_updates (uuid, event_plan_id, task_id, session_id, status, updated_by) VALUES (?,?,?,?,'not_started',?)")
        ->execute([$uuid, $planId, $taskId, $sessionId, $userId]);
    $id = $pdo->lastInsertId();
    $stmt = $pdo->prepare("SELECT * FROM event_live_task_updates WHERE id = ?");
    $stmt->execute([$id]);
    return $stmt->fetch(PDO::FETCH_ASSOC);
}

/**
 * Get or create a session status record.
 */
function eo_getOrCreateSessionStatus(PDO $pdo, int $planId, int $sessionId, int $userId): array {
    $stmt = $pdo->prepare("SELECT * FROM event_live_session_status WHERE session_id = ? AND event_plan_id = ? AND deleted_at IS NULL ORDER BY id DESC LIMIT 1");
    $stmt->execute([$sessionId, $planId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if ($row) return $row;

    $pdo->prepare("INSERT INTO event_live_session_status (event_plan_id, session_id, status, updated_by) VALUES (?,?,'not_started',?)")
        ->execute([$planId, $sessionId, $userId]);
    $id = $pdo->lastInsertId();
    $stmt = $pdo->prepare("SELECT * FROM event_live_session_status WHERE id = ?");
    $stmt->execute([$id]);
    return $stmt->fetch(PDO::FETCH_ASSOC);
}

// ── Live Checklist read actions ─────────────────────────────────────────────

function eo_getLiveChecklist(PDO $pdo, int $userId, string $role): void {
    eo_requireRead($pdo, $userId, $role);
    $planId = eo_intParam('plan_id');
    eo_getPlanOrFail($pdo, $planId);
    $checklist = eo_getOrCreateChecklist($pdo, $planId, $userId);
    rsa_jsonResponse(['checklist' => $checklist]);
}

function eo_listLiveSessionStatus(PDO $pdo, int $userId, string $role): void {
    eo_requireRead($pdo, $userId, $role);
    $planId = eo_intParam('plan_id');
    eo_getPlanOrFail($pdo, $planId);

    $sessions = $pdo->prepare("SELECT * FROM event_plan_sessions WHERE event_plan_id = ? AND deleted_at IS NULL ORDER BY sort_order ASC");
    $sessions->execute([$planId]);
    $sessionRows = $sessions->fetchAll(PDO::FETCH_ASSOC);

    $statuses = $pdo->prepare("SELECT * FROM event_live_session_status WHERE event_plan_id = ? AND deleted_at IS NULL");
    $statuses->execute([$planId]);
    $statusMap = [];
    foreach ($statuses->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $statusMap[$row['session_id']] = $row;
    }

    foreach ($sessionRows as &$s) {
        $s['live_status'] = $statusMap[$s['id']] ?? null;
    }
    unset($s);

    rsa_jsonResponse(['sessions' => $sessionRows]);
}

function eo_listLiveTaskUpdates(PDO $pdo, int $userId, string $role): void {
    eo_requireRead($pdo, $userId, $role);
    $planId = eo_intParam('plan_id');
    eo_getPlanOrFail($pdo, $planId);

    $tasks = $pdo->prepare("SELECT * FROM event_plan_tasks WHERE event_plan_id = ? AND deleted_at IS NULL ORDER BY sort_order ASC");
    $tasks->execute([$planId]);
    $taskRows = $tasks->fetchAll(PDO::FETCH_ASSOC);

    $updates = $pdo->prepare("SELECT * FROM event_live_task_updates WHERE event_plan_id = ? AND deleted_at IS NULL");
    $updates->execute([$planId]);
    $updateMap = [];
    foreach ($updates->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $updateMap[$row['task_id']] = $row;
    }

    foreach ($taskRows as &$t) {
        $t['live_update'] = $updateMap[$t['id']] ?? null;
    }
    unset($t);

    rsa_jsonResponse(['tasks' => $taskRows]);
}

function eo_getLiveTaskSummary(PDO $pdo, int $userId, string $role): void {
    eo_requireRead($pdo, $userId, $role);
    $planId = eo_intParam('plan_id');
    eo_getPlanOrFail($pdo, $planId);

    $total = (int) $pdo->prepare("SELECT COUNT(*) FROM event_plan_tasks WHERE event_plan_id = ? AND deleted_at IS NULL")->execute([$planId]) ?: 0;
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM event_plan_tasks WHERE event_plan_id = ? AND deleted_at IS NULL");
    $stmt->execute([$planId]);
    $total = (int) $stmt->fetchColumn();

    $stmt2 = $pdo->prepare("SELECT status, COUNT(*) AS cnt FROM event_live_task_updates WHERE event_plan_id = ? AND deleted_at IS NULL GROUP BY status");
    $stmt2->execute([$planId]);
    $byStatus = [];
    foreach ($stmt2->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $byStatus[$r['status']] = (int) $r['cnt'];
    }

    $stmt3 = $pdo->prepare("SELECT SUM(followup_required) AS fu, SUM(carry_forward) AS cf, SUM(issue_found) AS iss FROM event_live_task_updates WHERE event_plan_id = ? AND deleted_at IS NULL");
    $stmt3->execute([$planId]);
    $flags = $stmt3->fetch(PDO::FETCH_ASSOC);

    rsa_jsonResponse([
        'summary' => [
            'total'              => $total,
            'by_status'          => $byStatus,
            'complete'           => $byStatus['complete'] ?? 0,
            'open'               => $byStatus['not_started'] ?? $total,
            'in_progress'        => $byStatus['in_progress'] ?? 0,
            'issue_found'        => (int) ($flags['iss'] ?? 0),
            'followup_required'  => (int) ($flags['fu'] ?? 0),
            'carry_forward'      => (int) ($flags['cf'] ?? 0),
        ],
    ]);
}

// ── Live Checklist admin actions ────────────────────────────────────────────

function eo_startLiveChecklist(PDO $pdo, int $userId, string $role): void {
    eo_requireAdmin($pdo, $userId, $role);
    $planId = eo_intParam('plan_id');
    eo_getPlanOrFail($pdo, $planId);
    $checklist = eo_getOrCreateChecklist($pdo, $planId, $userId);
    $pdo->prepare("UPDATE event_live_checklists SET status='in_progress', started_at=NOW() WHERE id=?")->execute([$checklist['id']]);
    rsa_jsonResponse(['success' => true, 'checklist_id' => $checklist['id']]);
}

function eo_updateLiveChecklistStatus(PDO $pdo, int $userId, string $role): void {
    eo_requireAdmin($pdo, $userId, $role);
    $planId = eo_intParam('plan_id');
    $status = eo_strParam('status');
    eo_validateEnum($status, LIVE_STATUSES, 'status');
    eo_getPlanOrFail($pdo, $planId);
    $checklist = eo_getOrCreateChecklist($pdo, $planId, $userId);
    $completedAt = $status === 'complete' ? date('Y-m-d H:i:s') : null;
    $pdo->prepare("UPDATE event_live_checklists SET status=?, completed_at=? WHERE id=?")->execute([$status, $completedAt, $checklist['id']]);
    rsa_jsonResponse(['success' => true]);
}

function eo_startSession(PDO $pdo, int $userId, string $role): void {
    eo_requireAdmin($pdo, $userId, $role);
    $planId    = eo_intParam('plan_id');
    $sessionId = eo_intParam('session_id');
    eo_getPlanOrFail($pdo, $planId);
    eo_validateSessionBelongsToPlan($pdo, $sessionId, $planId);
    $rec = eo_getOrCreateSessionStatus($pdo, $planId, $sessionId, $userId);
    $pdo->prepare("UPDATE event_live_session_status SET status='in_progress', started_at=NOW(), updated_by=? WHERE id=?")->execute([$userId, $rec['id']]);
    $checklist = eo_getOrCreateChecklist($pdo, $planId, $userId);
    $pdo->prepare("UPDATE event_live_checklists SET active_session_id=? WHERE id=?")->execute([$sessionId, $checklist['id']]);
    rsa_jsonResponse(['success' => true]);
}

function eo_completeSession(PDO $pdo, int $userId, string $role): void {
    eo_requireAdmin($pdo, $userId, $role);
    $planId    = eo_intParam('plan_id');
    $sessionId = eo_intParam('session_id');
    eo_getPlanOrFail($pdo, $planId);
    eo_validateSessionBelongsToPlan($pdo, $sessionId, $planId);
    $rec = eo_getOrCreateSessionStatus($pdo, $planId, $sessionId, $userId);
    $pdo->prepare("UPDATE event_live_session_status SET status='complete', completed_at=NOW(), updated_by=? WHERE id=?")->execute([$userId, $rec['id']]);
    rsa_jsonResponse(['success' => true]);
}

function eo_updateSessionStatus(PDO $pdo, int $userId, string $role): void {
    eo_requireAdmin($pdo, $userId, $role);
    $planId    = eo_intParam('plan_id');
    $sessionId = eo_intParam('session_id');
    $b         = eo_body();
    $status    = trim($b['status'] ?? '');
    $notes     = trim($b['notes'] ?? '');
    eo_validateEnum($status, LIVE_STATUSES, 'status');
    eo_getPlanOrFail($pdo, $planId);
    eo_validateSessionBelongsToPlan($pdo, $sessionId, $planId);
    $rec = eo_getOrCreateSessionStatus($pdo, $planId, $sessionId, $userId);
    $startedAt   = ($status === 'in_progress' && !$rec['started_at']) ? date('Y-m-d H:i:s') : $rec['started_at'];
    $completedAt = $status === 'complete' ? date('Y-m-d H:i:s') : $rec['completed_at'];
    $pdo->prepare("UPDATE event_live_session_status SET status=?, started_at=?, completed_at=?, notes=?, updated_by=? WHERE id=?")
        ->execute([$status, $startedAt, $completedAt, $notes ?: null, $userId, $rec['id']]);
    rsa_jsonResponse(['success' => true]);
}

function eo_updateTaskStatus(PDO $pdo, int $userId, string $role): void {
    eo_requireAdmin($pdo, $userId, $role);
    $planId = eo_intParam('plan_id');
    $taskId = eo_intParam('task_id');
    $b      = eo_body();
    $status = trim($b['status'] ?? '');
    eo_validateEnum($status, LIVE_STATUSES, 'status');
    eo_getPlanOrFail($pdo, $planId);
    $task = eo_validateTaskBelongsToPlan($pdo, $taskId, $planId);
    $rec  = eo_getOrCreateTaskUpdate($pdo, $planId, $taskId, $task['session_id'] ?? null, $userId);

    $completedAt = in_array($status, ['complete','issue_found'], true) ? date('Y-m-d H:i:s') : null;
    $issueFound  = $status === 'issue_found' ? 1 : (int) $rec['issue_found'];
    $result      = trim($b['result'] ?? $rec['result'] ?? '');
    $pdo->prepare("UPDATE event_live_task_updates SET status=?, completed_at=?, completed_by=?, issue_found=?, result=?, updated_by=? WHERE id=?")
        ->execute([$status, $completedAt, $completedAt ? $userId : null, $issueFound, $result ?: null, $userId, $rec['id']]);
    rsa_jsonResponse(['success' => true]);
}

function eo_addTaskNote(PDO $pdo, int $userId, string $role): void {
    eo_requireAdmin($pdo, $userId, $role);
    $planId = eo_intParam('plan_id');
    $taskId = eo_intParam('task_id');
    $notes  = eo_strParam('notes');
    eo_getPlanOrFail($pdo, $planId);
    $task = eo_validateTaskBelongsToPlan($pdo, $taskId, $planId);
    $rec  = eo_getOrCreateTaskUpdate($pdo, $planId, $taskId, $task['session_id'] ?? null, $userId);
    $pdo->prepare("UPDATE event_live_task_updates SET notes=?, updated_by=? WHERE id=?")->execute([$notes, $userId, $rec['id']]);
    rsa_jsonResponse(['success' => true]);
}

function eo_addTaskFileReference(PDO $pdo, int $userId, string $role): void {
    eo_requireAdmin($pdo, $userId, $role);
    $planId = eo_intParam('plan_id');
    $taskId = eo_intParam('task_id');
    $b      = eo_body();
    $title  = trim($b['title'] ?? '');
    if (!$title) { http_response_code(400); echo json_encode(['error' => 'title required']); exit; }
    eo_getPlanOrFail($pdo, $planId);
    $task = eo_validateTaskBelongsToPlan($pdo, $taskId, $planId);
    $rec  = eo_getOrCreateTaskUpdate($pdo, $planId, $taskId, $task['session_id'] ?? null, $userId);
    $fileType = trim($b['file_type'] ?? 'other');
    $url      = trim($b['url'] ?? '') ?: null;
    $notes    = trim($b['notes'] ?? '') ?: null;
    $pdo->prepare("INSERT INTO event_live_task_files (task_update_id, file_type, title, url, notes, created_by) VALUES (?,?,?,?,?,?)")
        ->execute([$rec['id'], $fileType, $title, $url, $notes, $userId]);
    rsa_jsonResponse(['success' => true, 'file_id' => (int) $pdo->lastInsertId()]);
}

function eo_markTaskFollowupRequired(PDO $pdo, int $userId, string $role): void {
    eo_requireAdmin($pdo, $userId, $role);
    $planId = eo_intParam('plan_id');
    $taskId = eo_intParam('task_id');
    eo_getPlanOrFail($pdo, $planId);
    $task = eo_validateTaskBelongsToPlan($pdo, $taskId, $planId);
    $rec  = eo_getOrCreateTaskUpdate($pdo, $planId, $taskId, $task['session_id'] ?? null, $userId);
    $pdo->prepare("UPDATE event_live_task_updates SET followup_required=1, updated_by=? WHERE id=?")->execute([$userId, $rec['id']]);
    rsa_jsonResponse(['success' => true]);
}

function eo_markTaskCarryForward(PDO $pdo, int $userId, string $role): void {
    eo_requireAdmin($pdo, $userId, $role);
    $planId = eo_intParam('plan_id');
    $taskId = eo_intParam('task_id');
    eo_getPlanOrFail($pdo, $planId);
    $task = eo_validateTaskBelongsToPlan($pdo, $taskId, $planId);
    $rec  = eo_getOrCreateTaskUpdate($pdo, $planId, $taskId, $task['session_id'] ?? null, $userId);
    $pdo->prepare("UPDATE event_live_task_updates SET carry_forward=1, updated_by=? WHERE id=?")->execute([$userId, $rec['id']]);
    rsa_jsonResponse(['success' => true]);
}

function eo_clearTaskFollowup(PDO $pdo, int $userId, string $role): void {
    eo_requireAdmin($pdo, $userId, $role);
    $planId = eo_intParam('plan_id');
    $taskId = eo_intParam('task_id');
    eo_getPlanOrFail($pdo, $planId);
    $task = eo_validateTaskBelongsToPlan($pdo, $taskId, $planId);
    $rec  = eo_getOrCreateTaskUpdate($pdo, $planId, $taskId, $task['session_id'] ?? null, $userId);
    $pdo->prepare("UPDATE event_live_task_updates SET followup_required=0, updated_by=? WHERE id=?")->execute([$userId, $rec['id']]);
    rsa_jsonResponse(['success' => true]);
}

function eo_clearTaskCarryForward(PDO $pdo, int $userId, string $role): void {
    eo_requireAdmin($pdo, $userId, $role);
    $planId = eo_intParam('plan_id');
    $taskId = eo_intParam('task_id');
    eo_getPlanOrFail($pdo, $planId);
    $task = eo_validateTaskBelongsToPlan($pdo, $taskId, $planId);
    $rec  = eo_getOrCreateTaskUpdate($pdo, $planId, $taskId, $task['session_id'] ?? null, $userId);
    $pdo->prepare("UPDATE event_live_task_updates SET carry_forward=0, updated_by=? WHERE id=?")->execute([$userId, $rec['id']]);
    rsa_jsonResponse(['success' => true]);
}

// ── Router ─────────────────────────────────────────────────────────────────

$readActions = [
    'listPlans'            => 'eo_listPlans',
    'getPlan'              => 'eo_getPlan',
    'getPlanStaff'         => 'eo_getPlanStaff',
    'getPlanSections'      => 'eo_getPlanSections',
    'getPlanSessions'      => 'eo_getPlanSessions',
    'getPlanTasks'         => 'eo_getPlanTasks',
    'getPlanFiles'         => 'eo_getPlanFiles',
    // v38 live checklist reads
    'getLiveChecklist'      => 'eo_getLiveChecklist',
    'listLiveSessionStatus' => 'eo_listLiveSessionStatus',
    'listLiveTaskUpdates'   => 'eo_listLiveTaskUpdates',
    'getLiveTaskSummary'    => 'eo_getLiveTaskSummary',
    // v39 post-event report reads
    'listPostReports'          => 'eo_listPostReports',
    'getPostReport'            => 'eo_getPostReport',
    'getPostReportSections'    => 'eo_getPostReportSections',
    'getPostReportItems'       => 'eo_getPostReportItems',
    'getPostReportFiles'       => 'eo_getPostReportFiles',
    'getPostReportIncidents'   => 'eo_getPostReportIncidents',
    'getPostReportPreview'     => 'eo_getPostReportPreview',
];

$adminActions = [
    'createPlan'           => 'eo_createPlan',
    'updatePlan'           => 'eo_updatePlan',
    'softDeletePlan'       => 'eo_softDeletePlan',
    'clonePlan'            => 'eo_clonePlan',
    'generateFromTemplate' => 'eo_generateFromTemplate',
    'addStaff'             => 'eo_addStaff',
    'updateStaff'          => 'eo_updateStaff',
    'deleteStaff'          => 'eo_deleteStaff',
    'addSection'           => 'eo_addSection',
    'updateSection'        => 'eo_updateSection',
    'deleteSection'        => 'eo_deleteSection',
    'addSession'           => 'eo_addSession',
    'updateSession'        => 'eo_updateSession',
    'deleteSession'        => 'eo_deleteSession',
    'addTask'              => 'eo_addTask',
    'updateTask'           => 'eo_updateTask',
    'deleteTask'           => 'eo_deleteTask',
    'addTaskTarget'        => 'eo_addTaskTarget',
    'deleteTaskTarget'     => 'eo_deleteTaskTarget',
    'addFile'                   => 'eo_addFile',
    'updateFile'                => 'eo_updateFile',
    'deleteFile'                => 'eo_deleteFile',
    // v38 live checklist writes
    'startLiveChecklist'            => 'eo_startLiveChecklist',
    'updateLiveChecklistStatus' => 'eo_updateLiveChecklistStatus',
    'startSession'              => 'eo_startSession',
    'completeSession'           => 'eo_completeSession',
    'updateSessionStatus'       => 'eo_updateSessionStatus',
    'updateTaskStatus'          => 'eo_updateTaskStatus',
    'addTaskNote'               => 'eo_addTaskNote',
    'addTaskFileReference'      => 'eo_addTaskFileReference',
    'markTaskFollowupRequired'  => 'eo_markTaskFollowupRequired',
    'markTaskCarryForward'      => 'eo_markTaskCarryForward',
    'clearTaskFollowup'                => 'eo_clearTaskFollowup',
    'clearTaskCarryForward'            => 'eo_clearTaskCarryForward',
    // v39 post-event report writes
    'generatePostReport'               => 'eo_generatePostReport',
    'createPostReport'                 => 'eo_createPostReport',
    'updatePostReport'                 => 'eo_updatePostReport',
    'finalizePostReport'               => 'eo_finalizePostReport',
    'reopenPostReport'                 => 'eo_reopenPostReport',
    'softDeletePostReport'             => 'eo_softDeletePostReport',
    'regeneratePostReportSummary'      => 'eo_regeneratePostReportSummary',
    'updateReportSection'              => 'eo_updateReportSection',
    'addReportItem'                    => 'eo_addReportItem',
    'updateReportItem'                 => 'eo_updateReportItem',
    'deleteReportItem'                 => 'eo_deleteReportItem',
    'addReportFile'                    => 'eo_addReportFile',
    'deleteReportFile'                 => 'eo_deleteReportFile',
    'addReportIncident'                => 'eo_addReportIncident',
    'deleteReportIncident'             => 'eo_deleteReportIncident',
];

if (isset($readActions[$action])) {
    $readActions[$action]($pdo, $userId, $role);
} elseif (isset($adminActions[$action])) {
    $adminActions[$action]($pdo, $userId, $role);
} else {
    http_response_code(400);
    echo json_encode(['error' => "Unknown action: $action"]);
}
