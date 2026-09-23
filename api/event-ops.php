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
require_once __DIR__ . '/event-ops-schedule.php';
require_once __DIR__ . '/event-ops-staffing.php';

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
    if ($val === null) {
        $body = eo_body();
        $val = $body[$key] ?? null;
    }
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
    // Canonical identity comes from parity_events (+ parity_tracks) when linked;
    // plan columns remain as stored fallbacks for unlinked/legacy plans.
    $stmt = $pdo->query("
        SELECT p.id, p.uuid, p.event_instance_id, p.parity_event_id, p.year, p.event_code,
               p.event_date, p.track_name, p.title, p.class_scope, p.plan_type, p.status,
               p.lifecycle_stage, p.summary, p.created_by, p.approved_by, p.approved_at,
               p.created_at, p.updated_at,
               pe.event_name AS canonical_event_name, pe.race_lookup,
               pe.start_date_local AS canonical_start, pe.end_date_local AS canonical_end,
               pt.track_name AS canonical_track, pt.timezone_iana AS event_timezone
        FROM event_plans p
        LEFT JOIN parity_events pe ON pe.id = p.parity_event_id
        LEFT JOIN parity_tracks pt ON pt.id = pe.track_id
        WHERE p.deleted_at IS NULL
        ORDER BY p.year DESC, p.event_code ASC, p.created_at DESC
    ");
    rsa_jsonResponse(['plans' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
}

function eo_getPlan(PDO $pdo, int $userId, string $role): void {
    eo_requireRead($pdo, $userId, $role);
    $planId = eo_intParam('plan_id');
    $plan = eo_getPlanOrFail($pdo, $planId);
    // Attach canonical event context when linked
    if (!empty($plan['parity_event_id'])) {
        $stmt = $pdo->prepare("
            SELECT pe.id, pe.event_name, pe.event_code, pe.season_year, pe.race_lookup,
                   pe.start_date_local, pe.end_date_local, pe.event_instance_id,
                   pt.id AS track_id, pt.track_name, pt.city, pt.state, pt.timezone_iana
            FROM parity_events pe
            JOIN parity_tracks pt ON pt.id = pe.track_id
            WHERE pe.id = ?
        ");
        $stmt->execute([(int) $plan['parity_event_id']]);
        $plan['canonical_event'] = $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
    } else {
        $plan['canonical_event'] = null;
    }
    rsa_jsonResponse(['plan' => $plan]);
}

function eo_createPlan(PDO $pdo, int $userId, string $role): void {
    eo_requireAdmin($pdo, $userId, $role);
    $b = eo_body();

    // Canonical event path: inherit identity from parity_events instead of
    // requiring the admin to re-enter name/track/dates.
    $parityEventId = isset($b['parity_event_id']) && $b['parity_event_id'] !== null && $b['parity_event_id'] !== ''
        ? (int) $b['parity_event_id'] : null;
    $pe = null;
    if ($parityEventId) {
        $stmt = $pdo->prepare("
            SELECT pe.*, pt.track_name AS track_name_canonical
            FROM parity_events pe JOIN parity_tracks pt ON pt.id = pe.track_id
            WHERE pe.id = ?
        ");
        $stmt->execute([$parityEventId]);
        $pe = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$pe) {
            http_response_code(404);
            echo json_encode(['error' => 'parity_event_id not found']);
            exit;
        }
    }

    $year       = (int) ($b['year'] ?? ($pe['season_year'] ?? date('Y')));
    $eventCode  = trim($b['event_code'] ?? '') ?: ($pe['event_code'] ?? '');
    $title      = trim($b['title'] ?? '') ?: ($pe['event_name'] ?? '');
    $planType   = $b['plan_type'] ?? 'pre_event';
    $status     = $b['status'] ?? 'draft';

    if (!$eventCode || !$title) {
        http_response_code(400);
        echo json_encode(['error' => 'event_code and title are required (or supply parity_event_id to inherit them)']);
        exit;
    }
    eo_validateEnum($planType, ['pre_event','race_day','post_event','template'], 'plan_type');
    eo_validateEnum($status, ['draft','pending_review','approved','archived'], 'status');
    $lifecycle = $b['lifecycle_stage'] ?? 'pre_event';
    eo_validateEnum($lifecycle, EO_LIFECYCLE_STAGES, 'lifecycle_stage');
    $eventDate = $b['event_date'] ?? null;
    if ($eventDate !== null && $eventDate !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $eventDate)) {
        http_response_code(400); echo json_encode(['error' => 'event_date must be YYYY-MM-DD']); exit;
    }

    // Identity fields inherited from the canonical event unless overridden
    if ($pe) {
        $eventDate = $eventDate ?: ($pe['start_date_local'] ?? null);
    }
    $eventInstanceId = $b['event_instance_id'] ?? ($pe['event_instance_id'] ?? null);
    $trackName = $b['track_name'] ?? ($pe['track_name_canonical'] ?? null);

    $stmt = $pdo->prepare("
        INSERT INTO event_plans
            (uuid, event_instance_id, parity_event_id, year, event_code, event_date, track_name, title,
             class_scope, plan_type, status, lifecycle_stage, summary, created_by)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ");
    $stmt->execute([
        eo_newUuid(),
        $eventInstanceId,
        $parityEventId,
        $year,
        $eventCode,
        $eventDate ?: null,
        $trackName,
        $title,
        $b['class_scope'] ?? null,
        $planType,
        $status,
        $lifecycle,
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

    // Canonical re-link: when parity_event_id is supplied, identity fields are
    // derived from the canonical event exactly as eo_createPlan does — the plan
    // can never link to one parity event while carrying another event's
    // code/year/date/track. Explicit body values still override (same rule as
    // createPlan), so admin correction remains possible.
    if (array_key_exists('parity_event_id', $b)) {
        $peId = ($b['parity_event_id'] !== null && $b['parity_event_id'] !== '')
            ? (int) $b['parity_event_id'] : null;
        if ($peId) {
            $stmt = $pdo->prepare("
                SELECT pe.*, pt.track_name AS track_name_canonical
                FROM parity_events pe JOIN parity_tracks pt ON pt.id = pe.track_id
                WHERE pe.id = ?
            ");
            $stmt->execute([$peId]);
            $pe = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$pe) {
                http_response_code(404);
                echo json_encode(['error' => 'parity_event_id not found']);
                exit;
            }
            if (!array_key_exists('year', $b))              $b['year'] = (int) $pe['season_year'];
            if (!array_key_exists('event_code', $b))        $b['event_code'] = $pe['event_code'];
            if (!array_key_exists('event_date', $b))        $b['event_date'] = $pe['start_date_local'];
            if (!array_key_exists('track_name', $b))        $b['track_name'] = $pe['track_name_canonical'];
            if (!array_key_exists('title', $b))             $b['title'] = $pe['event_name'];
            if (!array_key_exists('event_instance_id', $b)) $b['event_instance_id'] = $pe['event_instance_id'];
        } else {
            // Explicit detach — clear the parity bridge link too unless the
            // caller supplies a different event_instance_id in the same call.
            if (!array_key_exists('event_instance_id', $b)) $b['event_instance_id'] = null;
        }
    }

    $fields = [];
    $params = [];
    $allowed = ['year','event_code','event_date','track_name','title','class_scope','plan_type','status','lifecycle_stage','summary','approved_by','approved_at','event_instance_id','parity_event_id'];
    $enums = [
        'plan_type'       => ['pre_event','race_day','post_event','template'],
        'status'          => ['draft','pending_review','approved','archived'],
        'lifecycle_stage' => EO_LIFECYCLE_STAGES,
    ];
    foreach ($allowed as $f) {
        if (array_key_exists($f, $b)) {
            if (isset($enums[$f])) eo_validateEnum($b[$f], $enums[$f], $f);
            if ($f === 'event_date' && $b[$f] !== null && $b[$f] !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $b[$f])) {
                http_response_code(400); echo json_encode(['error' => 'event_date must be YYYY-MM-DD']); exit;
            }
            $fields[] = "`$f` = ?";
            $params[] = $b[$f] === '' ? null : $b[$f];
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
    $now = date('Y-m-d H:i:s');
    $pdo->prepare("UPDATE event_plans SET deleted_at = ? WHERE id = ?")->execute([$now, $planId]);
    // Cascade soft-delete to child records so nothing resurfaces from a deleted plan
    $childTables = [
        'event_plan_staff', 'event_plan_sections', 'event_plan_sessions',
        'event_plan_tasks', 'event_plan_files',
        'event_schedule_items', 'event_schedule_assignments', 'event_plan_staff_duties',
        'event_live_checklists', 'event_live_task_updates', 'event_live_session_status',
        'event_post_reports',
    ];
    foreach ($childTables as $t) {
        try {
            $pdo->prepare("UPDATE `$t` SET deleted_at = ? WHERE event_plan_id = ? AND deleted_at IS NULL")->execute([$now, $planId]);
        } catch (PDOException $e) { /* table may not exist yet (pre-v38/v40) */ }
    }
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
            (uuid, event_instance_id, parity_event_id, year, event_code, event_date, track_name,
             title, class_scope, plan_type, status, lifecycle_stage, summary, created_by)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ");
    $stmt->execute([
        eo_newUuid(),
        $b['event_instance_id'] ?? null,
        null,
        $newYear,
        $newCode,
        $b['event_date'] ?? $src['event_date'],
        $src['track_name'],
        $newTitle,
        $src['class_scope'],
        $src['plan_type'],
        'draft',
        $src['lifecycle_stage'] ?? 'pre_event',
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

    // Clone sessions, keeping old→new id map for tasks/schedule items
    $sess = $pdo->prepare("SELECT * FROM event_plan_sessions WHERE event_plan_id = ? AND deleted_at IS NULL ORDER BY sort_order");
    $sess->execute([$planId]);
    $insSession = $pdo->prepare("INSERT INTO event_plan_sessions (event_plan_id,session_key,title,class_scope,scheduled_at,notes,sort_order) VALUES (?,?,?,?,?,?,?)");
    $sessionMap = [];
    foreach ($sess->fetchAll(PDO::FETCH_ASSOC) as $s) {
        $insSession->execute([$newId, $s['session_key'], $s['title'], $s['class_scope'], $s['scheduled_at'], $s['notes'], $s['sort_order']]);
        $sessionMap[(int) $s['id']] = (int) $pdo->lastInsertId();
    }

    // Clone staff roster ONLY when explicitly requested (template reuse).
    // Confirmed attendance, work requests, travel legs and lodging are
    // event-specific and are NEVER cloned.
    $includeStaff = !empty($b['include_staff']);
    $staffMap = [];
    if ($includeStaff) {
        $stf = $pdo->prepare("SELECT * FROM event_plan_staff WHERE event_plan_id = ? AND deleted_at IS NULL ORDER BY sort_order, id");
        $stf->execute([$planId]);
        $insStaff = $pdo->prepare("INSERT INTO event_plan_staff (event_plan_id,user_id,person_id,display_name,assignment,radio_number,vehicle,phone,arrive_at,depart_at,notes,is_active,sort_order) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)");
        foreach ($stf->fetchAll(PDO::FETCH_ASSOC) as $s) {
            $insStaff->execute([
                $newId, $s['user_id'], $s['person_id'], $s['display_name'], $s['assignment'],
                $s['radio_number'] ?? null, $s['vehicle'] ?? null, $s['phone'] ?? null,
                $s['arrive_at'], $s['depart_at'], $s['notes'], $s['is_active'] ?? 1, $s['sort_order'],
            ]);
            $staffMap[(int) $s['id']] = (int) $pdo->lastInsertId();
        }

        // Staff duties (function assignments) follow the staff rows
        if ($staffMap) {
            $dut = $pdo->prepare("SELECT * FROM event_plan_staff_duties WHERE event_plan_id = ? AND deleted_at IS NULL ORDER BY sort_order, id");
            $dut->execute([$planId]);
            $insDuty = $pdo->prepare("INSERT INTO event_plan_staff_duties (event_plan_id,staff_id,duty,sort_order) VALUES (?,?,?,?)");
            foreach ($dut->fetchAll(PDO::FETCH_ASSOC) as $d) {
                if (isset($staffMap[(int) $d['staff_id']])) {
                    $insDuty->execute([$newId, $staffMap[(int) $d['staff_id']], $d['duty'], $d['sort_order']]);
                }
            }
            // Class assignments follow staff too (typical role is reusable)
            try {
                $cls = $pdo->prepare("SELECT * FROM event_staff_classes WHERE staff_id = ? AND deleted_at IS NULL ORDER BY sort_order, id");
                $insCls = $pdo->prepare("INSERT INTO event_staff_classes (staff_id, class_code, is_primary, sort_order) VALUES (?,?,?,?)");
                foreach ($staffMap as $oldStaff => $newStaff) {
                    $cls->execute([$oldStaff]);
                    foreach ($cls->fetchAll(PDO::FETCH_ASSOC) as $c) {
                        $insCls->execute([$newStaff, $c['class_code'], $c['is_primary'], $c['sort_order']]);
                    }
                }
            } catch (PDOException $e) { /* table may not exist pre-v41 */ }
        }
    }

    // Clone tasks (session ids remapped)
    $tks = $pdo->prepare("SELECT * FROM event_plan_tasks WHERE event_plan_id = ? AND deleted_at IS NULL ORDER BY sort_order, id");
    $tks->execute([$planId]);
    $insTask = $pdo->prepare("INSERT INTO event_plan_tasks (event_plan_id,session_id,title,description,task_type,priority,status,assigned_user_id,assigned_person_id,due_at,carry_forward_to_next_event,sort_order) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)");
    foreach ($tks->fetchAll(PDO::FETCH_ASSOC) as $t) {
        $insTask->execute([
            $newId,
            $t['session_id'] !== null ? ($sessionMap[(int) $t['session_id']] ?? null) : null,
            $t['title'], $t['description'], $t['task_type'], $t['priority'], 'open',
            $t['assigned_user_id'], $t['assigned_person_id'], $t['due_at'],
            $t['carry_forward_to_next_event'], $t['sort_order'],
        ]);
    }

    // Clone schedule items + assignments (session/staff ids remapped)
    $itm = $pdo->prepare("SELECT * FROM event_schedule_items WHERE event_plan_id = ? AND deleted_at IS NULL ORDER BY schedule_date, sort_order, id");
    $itm->execute([$planId]);
    $items = $itm->fetchAll(PDO::FETCH_ASSOC);
    $insItem = $pdo->prepare("
        INSERT INTO event_schedule_items
            (uuid, event_plan_id, session_id, schedule_date, day_label, title, sort_order,
             scheduled_time, scheduled_time_label, projected_time, projected_time_label,
             activity_type, category_code, round_label,
             expected_car_count, comments, scale_required, fuel_required, status, created_by)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ");
    $insAssign = $pdo->prepare("INSERT INTO event_schedule_assignments (event_plan_id,schedule_item_id,staff_id,assignee_name,responsibility,notes,sort_order) VALUES (?,?,?,?,?,?,?)");
    $asStmt = $pdo->prepare("SELECT * FROM event_schedule_assignments WHERE schedule_item_id = ? AND deleted_at IS NULL ORDER BY sort_order, id");
    foreach ($items as $it) {
        $insItem->execute([
            eo_newUuid(), $newId,
            $it['session_id'] !== null ? ($sessionMap[(int) $it['session_id']] ?? null) : null,
            $it['schedule_date'], $it['day_label'], $it['title'], $it['sort_order'],
            $it['scheduled_time'], $it['scheduled_time_label'],
            $it['projected_time'], $it['projected_time_label'], $it['activity_type'],
            $it['category_code'], $it['round_label'], $it['expected_car_count'],
            $it['comments'], $it['scale_required'], $it['fuel_required'], 'upcoming', $userId,
        ]);
        $newItemId = (int) $pdo->lastInsertId();
        // Schedule assignments reference staff — only clone when the roster
        // is being carried over (include_staff).
        if ($includeStaff) {
            $asStmt->execute([(int) $it['id']]);
            foreach ($asStmt->fetchAll(PDO::FETCH_ASSOC) as $a) {
                $insAssign->execute([
                    $newId, $newItemId,
                    $a['staff_id'] !== null ? ($staffMap[(int) $a['staff_id']] ?? null) : null,
                    $a['assignee_name'], $a['responsibility'], $a['notes'], $a['sort_order'],
                ]);
            }
        }
    }

    // Clone file references
    $fls = $pdo->prepare("SELECT * FROM event_plan_files WHERE event_plan_id = ? AND deleted_at IS NULL ORDER BY id");
    $fls->execute([$planId]);
    $insFile = $pdo->prepare("INSERT INTO event_plan_files (event_plan_id,file_type,title,url,box_file_id,box_folder_id,notes) VALUES (?,?,?,?,?,?,?)");
    foreach ($fls->fetchAll(PDO::FETCH_ASSOC) as $f) {
        $insFile->execute([$newId, $f['file_type'], $f['title'], $f['url'], $f['box_file_id'], $f['box_folder_id'], $f['notes']]);
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
    $staff = $stmt->fetchAll(PDO::FETCH_ASSOC);
    // Embed event-wide duties (v40) when the table exists
    try {
        $duties = function_exists('eos_fetchDuties')
            ? eos_fetchDuties($pdo, array_map('intval', array_column($staff, 'id')))
            : [];
        foreach ($staff as &$s) {
            $s['duties'] = $duties[$s['id']] ?? [];
        }
        unset($s);
    } catch (PDOException $e) {
        // event_plan_staff_duties may not exist yet (pre-v40)
        foreach ($staff as &$s) { $s['duties'] = []; }
        unset($s);
    }
    rsa_jsonResponse(['staff' => $staff]);
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
    $stmt = $pdo->prepare("INSERT INTO event_plan_staff (event_plan_id,user_id,person_id,display_name,assignment,radio_number,vehicle,phone,arrive_at,depart_at,notes,is_active,sort_order) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)");
    $stmt->execute([
        $planId, $b['user_id']??null, $b['person_id']??null, $displayName, $assignment,
        $b['radio_number']??null, $b['vehicle']??null, $b['phone']??null,
        $b['arrive_at']??null, $b['depart_at']??null, $b['notes']??null,
        isset($b['is_active']) ? (int)!empty($b['is_active']) : 1,
        (int)($b['sort_order']??0),
    ]);
    $staffId = (int)$pdo->lastInsertId();

    // Optional initial duties list
    if (!empty($b['duties']) && is_array($b['duties']) && function_exists('eos_fetchDuties')) {
        $insDuty = $pdo->prepare("INSERT INTO event_plan_staff_duties (event_plan_id,staff_id,duty,sort_order) VALUES (?,?,?,?)");
        foreach (array_values($b['duties']) as $i => $d) {
            $duty = trim((string) $d);
            if ($duty !== '') $insDuty->execute([$planId, $staffId, $duty, $i]);
        }
    }
    rsa_jsonResponse(['success' => true, 'staff_id' => $staffId], 201);
}

function eo_updateStaff(PDO $pdo, int $userId, string $role): void {
    eo_requireAdmin($pdo, $userId, $role);
    $b = eo_body();
    $staffId = (int) ($b['staff_id'] ?? 0);
    if (!$staffId) { http_response_code(400); echo json_encode(['error' => 'staff_id required']); exit; }
    $allowed = ['display_name','assignment','radio_number','vehicle','phone','arrive_at','depart_at','notes','is_active','sort_order','user_id','person_id'];
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
    // v40 structured schedule reads
    'getSchedule'          => 'eo_getSchedule',
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
    // v40 structured schedule writes
    'addScheduleItem'           => 'eo_addScheduleItem',
    'updateScheduleItem'        => 'eo_updateScheduleItem',
    'deleteScheduleItem'        => 'eo_deleteScheduleItem',
    'duplicateScheduleItem'     => 'eo_duplicateScheduleItem',
    'reorderScheduleItems'      => 'eo_reorderScheduleItems',
    'setScheduleItemStatus'     => 'eo_setScheduleItemStatus',
    'addScheduleAssignment'     => 'eo_addScheduleAssignment',
    'updateScheduleAssignment'  => 'eo_updateScheduleAssignment',
    'deleteScheduleAssignment'  => 'eo_deleteScheduleAssignment',
    'addStaffDuty'              => 'eo_addStaffDuty',
    'updateStaffDuty'           => 'eo_updateStaffDuty',
    'deleteStaffDuty'           => 'eo_deleteStaffDuty',
    // v41 staffing admin
    'listEventRequests'         => 'eow_listEventRequests',
    'getStaffRequest'           => 'eow_getStaffRequest',
    'decideWorkRequest'         => 'eow_decideWorkRequest',
    'getStaffDetail'            => 'eow_getStaffDetail',
    'addStaffClass'             => 'eow_addStaffClass',
    'deleteStaffClass'          => 'eow_deleteStaffClass',
    'addTravelLeg'              => 'eow_addTravelLeg',
    'updateTravelLeg'           => 'eow_updateTravelLeg',
    'deleteTravelLeg'           => 'eow_deleteTravelLeg',
    'upsertStaffLodging'        => 'eow_upsertStaffLodging',
    'adminLinkWorkerPerson'     => 'eow_adminLinkWorkerPerson',
    'getStaffingSummary'        => 'eow_getStaffingSummary',
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

// v41 worker self-service actions — authenticated user, self-scoped by
// user_id inside the handler. No eventops.* capability required.
$workerActions = [
    'listCanonicalEvents'    => 'eow_listCanonicalEvents',
    'getMyWorkerProfile'     => 'eow_getMyWorkerProfile',
    'updateMyWorkerProfile'  => 'eow_updateMyWorkerProfile',
    'getMyRequests'          => 'eow_getMyRequests',
    'submitWorkRequest'      => 'eow_submitWorkRequest',
    'updateWorkRequest'      => 'eow_updateWorkRequest',
    'cancelWorkRequest'      => 'eow_cancelWorkRequest',
    'searchPersons'          => 'eow_searchPersons',
];

if (isset($workerActions[$action])) {
    $workerActions[$action]($pdo, $userId);
} elseif (isset($readActions[$action])) {
    $readActions[$action]($pdo, $userId, $role);
} elseif (isset($adminActions[$action])) {
    $adminActions[$action]($pdo, $userId, $role);
} else {
    http_response_code(400);
    echo json_encode(['error' => "Unknown action: $action"]);
}
