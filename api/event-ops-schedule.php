<?php
/**
 * Event Operations — Structured Schedule & Staffing API
 *
 * Endpoints for event_schedule_items, event_schedule_assignments, and
 * event_plan_staff_duties (migration v40).
 *
 * Read actions require:  eventops.read
 * Admin actions require: eventops.admin
 *
 * Included by api/event-ops.php; shares $pdo, $userId, $role, helpers.
 */

// ── Value lists (VARCHAR columns — extend freely, no schema change needed) ──

const EO_SCHEDULE_STATUSES = ['upcoming', 'called', 'running', 'complete', 'delayed', 'cancelled'];
const EO_ACTIVITY_TYPES    = ['racing', 'meeting', 'inspection', 'contingency', 'parade', 'teardown', 'secure', 'break', 'other'];
const EO_LIFECYCLE_STAGES  = ['draft', 'pre_event', 'live', 'complete', 'reviewed'];

// ── Helpers ─────────────────────────────────────────────────────────────────

function eos_getScheduleItemOrFail(PDO $pdo, int $itemId): array {
    $stmt = $pdo->prepare("SELECT * FROM event_schedule_items WHERE id = ? AND deleted_at IS NULL");
    $stmt->execute([$itemId]);
    $item = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$item) {
        http_response_code(404);
        echo json_encode(['error' => 'Schedule item not found']);
        exit;
    }
    return $item;
}

function eos_validateItemBelongsToPlan(PDO $pdo, int $itemId, int $planId): array {
    $item = eos_getScheduleItemOrFail($pdo, $itemId);
    if ((int) $item['event_plan_id'] !== $planId) {
        http_response_code(403);
        echo json_encode(['error' => 'Schedule item does not belong to this plan']);
        exit;
    }
    return $item;
}

function eos_validateStaffBelongsToPlan(PDO $pdo, int $staffId, int $planId): array {
    $stmt = $pdo->prepare("SELECT * FROM event_plan_staff WHERE id = ? AND event_plan_id = ? AND deleted_at IS NULL");
    $stmt->execute([$staffId, $planId]);
    $staff = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$staff) {
        http_response_code(404);
        echo json_encode(['error' => 'Staff member not found or does not belong to this plan']);
        exit;
    }
    return $staff;
}

function eos_validateSessionBelongsToPlan(PDO $pdo, ?int $sessionId, int $planId): void {
    if (!$sessionId) return;
    $stmt = $pdo->prepare("SELECT id FROM event_plan_sessions WHERE id = ? AND event_plan_id = ? AND deleted_at IS NULL");
    $stmt->execute([$sessionId, $planId]);
    if (!$stmt->fetch()) {
        http_response_code(404);
        echo json_encode(['error' => 'Session not found or does not belong to this plan']);
        exit;
    }
}

/**
 * Normalize a raw schedule time input into a (time, label) pair.
 *
 * Real clock times → 'HH:MM:SS' in the TIME column, label NULL.
 * Anything else ("TBD", "Following TF", "after Q2") → label, time NULL.
 * This keeps clock times machine-readable for sorting, delay math, and
 * NOW/NEXT computation while still allowing printed-schedule phrasing.
 *
 * @return array{time: ?string, label: ?string}
 */
function eos_normalizeTime($raw): array {
    if ($raw === null) return ['time' => null, 'label' => null];
    $v = trim((string) $raw);
    if ($v === '') return ['time' => null, 'label' => null];

    // "HH:MM[:SS]" optionally with am/pm suffix: 13:30, 8:00, 1:30 PM, 8:00a
    if (preg_match('/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([aApP][mM]?)?$/', $v, $m)) {
        $h = (int) $m[1];
        $min = (int) $m[2];
        $sec = isset($m[3]) && $m[3] !== '' ? (int) $m[3] : 0;
        $ampm = strtolower($m[4] ?? '');
        if ($ampm !== '') {
            $pm = str_starts_with($ampm, 'p');
            if ($h === 12) $h = $pm ? 12 : 0;
            elseif ($pm) $h += 12;
        }
        if ($h <= 23 && $min <= 59 && $sec <= 59) {
            return ['time' => sprintf('%02d:%02d:%02d', $h, $min, $sec), 'label' => null];
        }
    }
    // Hour-only with am/pm: "8a", "5 PM"
    if (preg_match('/^(\d{1,2})\s*([aApP][mM]?)$/', $v, $m)) {
        $h = (int) $m[1];
        $pm = str_starts_with(strtolower($m[2]), 'p');
        if ($h >= 1 && $h <= 12) {
            if ($h === 12) $h = $pm ? 12 : 0;
            elseif ($pm) $h += 12;
            return ['time' => sprintf('%02d:00:00', $h), 'label' => null];
        }
    }
    return ['time' => null, 'label' => $v];
}

/**
 * Resolve the scheduled_/projected_ time pair for a write.
 * Explicit *_label wins; otherwise the raw value is normalized.
 *
 * @return array{0: ?string, 1: ?string} [time, label]
 */
function eos_timePair(array $b, string $base): array {
    $labelKey = $base . '_label';
    if (isset($b[$labelKey]) && trim((string) $b[$labelKey]) !== '') {
        return [null, trim((string) $b[$labelKey])];
    }
    $r = eos_normalizeTime($b[$base] ?? null);
    return [$r['time'], $r['label']];
}

/**
 * Renumber sort_order for all schedule items on a given plan+date,
 * ordering by the provided id sequence (ids not in the list keep their
 * relative order appended at the end).
 */
/** Empty/whitespace-only strings become NULL (keeps nullable columns clean). */
function eos_strOrNull($v): ?string {
    if ($v === null) return null;
    $v = trim((string) $v);
    return $v === '' ? null : $v;
}

function eos_renumberDay(PDO $pdo, int $planId, ?string $date, array $orderedIds): void {
    if ($date === null) {
        $stmt = $pdo->prepare("SELECT id FROM event_schedule_items WHERE event_plan_id = ? AND schedule_date IS NULL AND deleted_at IS NULL ORDER BY sort_order, id");
        $stmt->execute([$planId]);
    } else {
        $stmt = $pdo->prepare("SELECT id FROM event_schedule_items WHERE event_plan_id = ? AND schedule_date = ? AND deleted_at IS NULL ORDER BY sort_order, id");
        $stmt->execute([$planId, $date]);
    }
    $existing = array_map('intval', array_column($stmt->fetchAll(PDO::FETCH_ASSOC), 'id'));
    $orderedIds = array_values(array_filter(array_map('intval', $orderedIds), fn($id) => in_array($id, $existing, true)));
    $final = array_merge($orderedIds, array_values(array_diff($existing, $orderedIds)));
    $upd = $pdo->prepare("UPDATE event_schedule_items SET sort_order = ? WHERE id = ?");
    foreach ($final as $i => $id) {
        $upd->execute([$i, $id]);
    }
}

/**
 * Fetch all assignments for a set of schedule items, grouped by item id.
 */
function eos_fetchAssignments(PDO $pdo, array $itemIds): array {
    if (empty($itemIds)) return [];
    $ph = implode(',', array_fill(0, count($itemIds), '?'));
    $stmt = $pdo->prepare("
        SELECT a.*, s.display_name AS staff_display_name
        FROM event_schedule_assignments a
        LEFT JOIN event_plan_staff s ON s.id = a.staff_id AND s.deleted_at IS NULL
        WHERE a.schedule_item_id IN ($ph) AND a.deleted_at IS NULL
        ORDER BY a.sort_order, a.id
    ");
    $stmt->execute($itemIds);
    $byItem = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $byItem[$row['schedule_item_id']][] = $row;
    }
    return $byItem;
}

/**
 * Fetch all duties for a set of staff ids, grouped by staff id.
 */
function eos_fetchDuties(PDO $pdo, array $staffIds): array {
    if (empty($staffIds)) return [];
    $ph = implode(',', array_fill(0, count($staffIds), '?'));
    $stmt = $pdo->prepare("
        SELECT * FROM event_plan_staff_duties
        WHERE staff_id IN ($ph) AND deleted_at IS NULL
        ORDER BY sort_order, id
    ");
    $stmt->execute($staffIds);
    $byStaff = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $byStaff[$row['staff_id']][] = $row;
    }
    return $byStaff;
}

// ── Schedule read actions ────────────────────────────────────────────────────

/**
 * getSchedule — full structured schedule for a plan.
 * Optional &date=YYYY-MM-DD filters to a single day.
 * Returns items with embedded assignments + distinct day list.
 */
function eo_getSchedule(PDO $pdo, int $userId, string $role): void {
    eo_requireRead($pdo, $userId, $role);
    $planId = eo_intParam('plan_id');
    eo_getPlanOrFail($pdo, $planId);
    $date = eo_strParam('date', false);

    if ($date) {
        $stmt = $pdo->prepare("
            SELECT * FROM event_schedule_items
            WHERE event_plan_id = ? AND schedule_date = ? AND deleted_at IS NULL
            ORDER BY sort_order, id
        ");
        $stmt->execute([$planId, $date]);
    } else {
        $stmt = $pdo->prepare("
            SELECT * FROM event_schedule_items
            WHERE event_plan_id = ? AND deleted_at IS NULL
            ORDER BY schedule_date IS NULL, schedule_date, sort_order, id
        ");
        $stmt->execute([$planId]);
    }
    $items = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $assignments = eos_fetchAssignments($pdo, array_map('intval', array_column($items, 'id')));
    foreach ($items as &$item) {
        $item['assignments'] = $assignments[$item['id']] ?? [];
    }
    unset($item);

    $dayStmt = $pdo->prepare("
        SELECT DISTINCT schedule_date FROM event_schedule_items
        WHERE event_plan_id = ? AND deleted_at IS NULL AND schedule_date IS NOT NULL
        ORDER BY schedule_date
    ");
    $dayStmt->execute([$planId]);
    $days = $dayStmt->fetchAll(PDO::FETCH_COLUMN);

    rsa_jsonResponse(['items' => $items, 'days' => $days]);
}

// ── Schedule item admin actions ─────────────────────────────────────────────

function eo_addScheduleItem(PDO $pdo, int $userId, string $role): void {
    eo_requireAdmin($pdo, $userId, $role);
    $b = eo_body();
    $planId = (int) ($b['plan_id'] ?? 0);
    if (!$planId) { http_response_code(400); echo json_encode(['error' => 'plan_id required']); exit; }
    eo_getPlanOrFail($pdo, $planId);

    $title = trim($b['title'] ?? '');
    if (!$title) { http_response_code(400); echo json_encode(['error' => 'title required']); exit; }

    $activityType = $b['activity_type'] ?? 'other';
    $status       = $b['status'] ?? 'upcoming';
    eo_validateEnum($activityType, EO_ACTIVITY_TYPES, 'activity_type');
    eo_validateEnum($status, EO_SCHEDULE_STATUSES, 'status');
    eos_validateSessionBelongsToPlan($pdo, isset($b['session_id']) ? (int) $b['session_id'] : null, $planId);

    $date = $b['schedule_date'] ?? null;
    if ($date !== null && $date !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
        http_response_code(400); echo json_encode(['error' => 'schedule_date must be YYYY-MM-DD']); exit;
    }

    // Default sort_order: append to end of that day
    if (isset($b['sort_order'])) {
        $sortOrder = (int) $b['sort_order'];
    } else {
        if ($date) {
            $s = $pdo->prepare("SELECT COALESCE(MAX(sort_order), -1) + 1 FROM event_schedule_items WHERE event_plan_id = ? AND schedule_date = ? AND deleted_at IS NULL");
            $s->execute([$planId, $date]);
        } else {
            $s = $pdo->prepare("SELECT COALESCE(MAX(sort_order), -1) + 1 FROM event_schedule_items WHERE event_plan_id = ? AND schedule_date IS NULL AND deleted_at IS NULL");
            $s->execute([$planId]);
        }
        $sortOrder = (int) $s->fetchColumn();
    }

    [$schedTime, $schedLabel] = eos_timePair($b, 'scheduled_time');
    [$projTime, $projLabel]   = eos_timePair($b, 'projected_time');


    $stmt = $pdo->prepare("
        INSERT INTO event_schedule_items
            (uuid, event_plan_id, session_id, schedule_date, day_label, title, sort_order,
             scheduled_time, scheduled_time_label, projected_time, projected_time_label,
             activity_type, category_code, round_label,
             expected_car_count, comments, scale_required, fuel_required, status,
             actual_start_at, actual_end_at, created_by)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ");
    $stmt->execute([
        eo_newUuid(), $planId,
        isset($b['session_id']) ? (int) $b['session_id'] : null,
        $date ?: null,
        eos_strOrNull($b['day_label'] ?? null),
        $title,
        $sortOrder,
        $schedTime, $schedLabel,
        $projTime, $projLabel,
        $activityType,
        eos_strOrNull($b['category_code'] ?? null),
        eos_strOrNull($b['round_label'] ?? null),
        isset($b['expected_car_count']) && $b['expected_car_count'] !== '' ? (int) $b['expected_car_count'] : null,
        eos_strOrNull($b['comments'] ?? null),
        !empty($b['scale_required']) ? 1 : 0,
        !empty($b['fuel_required']) ? 1 : 0,
        $status,
        $b['actual_start_at'] ?? null,
        $b['actual_end_at'] ?? null,
        $userId,
    ]);
    rsa_jsonResponse(['success' => true, 'item_id' => (int) $pdo->lastInsertId()], 201);
}

function eo_updateScheduleItem(PDO $pdo, int $userId, string $role): void {
    eo_requireAdmin($pdo, $userId, $role);
    $b = eo_body();
    $itemId = (int) ($b['item_id'] ?? 0);
    if (!$itemId) { http_response_code(400); echo json_encode(['error' => 'item_id required']); exit; }
    $item = eos_getScheduleItemOrFail($pdo, $itemId);

    $allowed = ['session_id','schedule_date','day_label','sort_order',
                'activity_type','category_code','round_label','expected_car_count','comments',
                'scale_required','fuel_required','status','actual_start_at','actual_end_at','title'];
    $enums = [
        'activity_type' => EO_ACTIVITY_TYPES,
        'status'        => EO_SCHEDULE_STATUSES,
    ];
    $fields = []; $params = [];
    foreach ($allowed as $f) {
        if (array_key_exists($f, $b)) {
            if (isset($enums[$f])) eo_validateEnum($b[$f], $enums[$f], $f);
            if ($f === 'session_id') {
                eos_validateSessionBelongsToPlan($pdo, $b[$f] !== null ? (int) $b[$f] : null, (int) $item['event_plan_id']);
            }
            if ($f === 'schedule_date' && $b[$f] !== null && $b[$f] !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $b[$f])) {
                http_response_code(400); echo json_encode(['error' => 'schedule_date must be YYYY-MM-DD']); exit;
            }
            $fields[] = "`$f` = ?";
            $params[] = $b[$f] === '' ? null : $b[$f];
        }
    }

    // Time pairs: writing either leg recomputes both columns atomically.
    // 'scheduled_time' = null clears the pair entirely.
    foreach (['scheduled_time', 'projected_time'] as $base) {
        if (array_key_exists($base, $b) || array_key_exists($base . '_label', $b)) {
            [$t, $l] = eos_timePair($b, $base);
            $fields[] = "`$base` = ?";          $params[] = $t;
            $fields[] = "`{$base}_label` = ?";  $params[] = $l;
        }
    }

    if (!$fields) { http_response_code(400); echo json_encode(['error' => 'No fields to update']); exit; }
    $params[] = $itemId;
    $pdo->prepare("UPDATE event_schedule_items SET " . implode(', ', $fields) . " WHERE id = ? AND deleted_at IS NULL")->execute($params);
    rsa_jsonResponse(['success' => true]);
}

function eo_deleteScheduleItem(PDO $pdo, int $userId, string $role): void {
    eo_requireAdmin($pdo, $userId, $role);
    $b = eo_body();
    $itemId = (int) ($b['item_id'] ?? 0);
    if (!$itemId) { http_response_code(400); echo json_encode(['error' => 'item_id required']); exit; }
    eos_getScheduleItemOrFail($pdo, $itemId);
    $now = date('Y-m-d H:i:s');
    $pdo->prepare("UPDATE event_schedule_items SET deleted_at = ? WHERE id = ?")->execute([$now, $itemId]);
    // Soft-delete the item's assignments too
    $pdo->prepare("UPDATE event_schedule_assignments SET deleted_at = ? WHERE schedule_item_id = ? AND deleted_at IS NULL")->execute([$now, $itemId]);
    rsa_jsonResponse(['success' => true]);
}

function eo_duplicateScheduleItem(PDO $pdo, int $userId, string $role): void {
    eo_requireAdmin($pdo, $userId, $role);
    $b = eo_body();
    $itemId = (int) ($b['item_id'] ?? 0);
    if (!$itemId) { http_response_code(400); echo json_encode(['error' => 'item_id required']); exit; }
    $src = eos_getScheduleItemOrFail($pdo, $itemId);
    $planId = (int) $src['event_plan_id'];

    $stmt = $pdo->prepare("
        INSERT INTO event_schedule_items
            (uuid, event_plan_id, session_id, schedule_date, day_label, title, sort_order,
             scheduled_time, scheduled_time_label, projected_time, projected_time_label,
             activity_type, category_code, round_label,
             expected_car_count, comments, scale_required, fuel_required, status,
             created_by)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ");
    $stmt->execute([
        eo_newUuid(), $planId, $src['session_id'], $src['schedule_date'], $src['day_label'],
        $src['title'],
        (int) $src['sort_order'] + 1,
        $src['scheduled_time'], $src['scheduled_time_label'],
        $src['projected_time'], $src['projected_time_label'],
        $src['activity_type'],
        $src['category_code'], $src['round_label'], $src['expected_car_count'],
        $src['comments'], $src['scale_required'], $src['fuel_required'], 'upcoming',
        $userId,
    ]);
    $newId = (int) $pdo->lastInsertId();

    // Duplicate assignments, remapped to the new item
    $aStmt = $pdo->prepare("SELECT * FROM event_schedule_assignments WHERE schedule_item_id = ? AND deleted_at IS NULL ORDER BY sort_order, id");
    $aStmt->execute([$itemId]);
    $ins = $pdo->prepare("INSERT INTO event_schedule_assignments (event_plan_id, schedule_item_id, staff_id, assignee_name, responsibility, notes, sort_order) VALUES (?,?,?,?,?,?,?)");
    foreach ($aStmt->fetchAll(PDO::FETCH_ASSOC) as $a) {
        $ins->execute([$planId, $newId, $a['staff_id'], $a['assignee_name'], $a['responsibility'], $a['notes'], $a['sort_order']]);
    }

    // Renumber the day so the duplicate sits right after the source
    if ($src['schedule_date'] === null) {
        $dayStmt = $pdo->prepare("SELECT id FROM event_schedule_items WHERE event_plan_id = ? AND schedule_date IS NULL AND deleted_at IS NULL ORDER BY sort_order, id");
        $dayStmt->execute([$planId]);
    } else {
        $dayStmt = $pdo->prepare("SELECT id FROM event_schedule_items WHERE event_plan_id = ? AND schedule_date = ? AND deleted_at IS NULL ORDER BY sort_order, id");
        $dayStmt->execute([$planId, $src['schedule_date']]);
    }
    $ids = array_map('intval', array_column($dayStmt->fetchAll(PDO::FETCH_ASSOC), 'id'));
    $ids = array_values(array_filter($ids, fn($i) => $i !== $newId));
    $pos = array_search($itemId, $ids, true);
    if ($pos !== false) {
        array_splice($ids, $pos + 1, 0, $newId);
        $upd = $pdo->prepare("UPDATE event_schedule_items SET sort_order = ? WHERE id = ?");
        foreach ($ids as $i => $id) { $upd->execute([$i, $id]); }
    }

    rsa_jsonResponse(['success' => true, 'item_id' => $newId], 201);
}

/**
 * reorderScheduleItems — body: { plan_id, item_ids: [..] , schedule_date? }
 * Sets sort_order following the given id order for that day.
 */
function eo_reorderScheduleItems(PDO $pdo, int $userId, string $role): void {
    eo_requireAdmin($pdo, $userId, $role);
    $b = eo_body();
    $planId = (int) ($b['plan_id'] ?? 0);
    if (!$planId) { http_response_code(400); echo json_encode(['error' => 'plan_id required']); exit; }
    eo_getPlanOrFail($pdo, $planId);
    $ids = $b['item_ids'] ?? [];
    if (!is_array($ids) || empty($ids)) { http_response_code(400); echo json_encode(['error' => 'item_ids array required']); exit; }

    // Verify every id belongs to this plan (cross-plan leakage protection)
    $ph = implode(',', array_fill(0, count($ids), '?'));
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM event_schedule_items WHERE id IN ($ph) AND event_plan_id = ? AND deleted_at IS NULL");
    $stmt->execute(array_merge(array_map('intval', $ids), [$planId]));
    if ((int) $stmt->fetchColumn() !== count($ids)) {
        http_response_code(403);
        echo json_encode(['error' => 'One or more items do not belong to this plan']);
        exit;
    }

    $upd = $pdo->prepare("UPDATE event_schedule_items SET sort_order = ? WHERE id = ?");
    foreach ($ids as $i => $id) {
        $upd->execute([(int) $i, (int) $id]);
    }
    rsa_jsonResponse(['success' => true]);
}

function eo_setScheduleItemStatus(PDO $pdo, int $userId, string $role): void {
    eo_requireAdmin($pdo, $userId, $role);
    $b = eo_body();
    $itemId = (int) ($b['item_id'] ?? 0);
    $status = trim($b['status'] ?? '');
    if (!$itemId) { http_response_code(400); echo json_encode(['error' => 'item_id required']); exit; }
    eo_validateEnum($status, EO_SCHEDULE_STATUSES, 'status');
    eos_getScheduleItemOrFail($pdo, $itemId);

    $now = date('Y-m-d H:i:s');
    $start   = $status === 'running'  ? $now : null;
    $end     = $status === 'complete' ? $now : null;
    $pdo->prepare("
        UPDATE event_schedule_items SET
            status = ?,
            actual_start_at = COALESCE(?, actual_start_at),
            actual_end_at   = COALESCE(?, actual_end_at)
        WHERE id = ? AND deleted_at IS NULL
    ")->execute([$status, $start, $end, $itemId]);
    rsa_jsonResponse(['success' => true]);
}

// ── Schedule assignment admin actions ────────────────────────────────────────

function eo_addScheduleAssignment(PDO $pdo, int $userId, string $role): void {
    eo_requireAdmin($pdo, $userId, $role);
    $b = eo_body();
    $itemId = (int) ($b['schedule_item_id'] ?? $b['item_id'] ?? 0);
    if (!$itemId) { http_response_code(400); echo json_encode(['error' => 'schedule_item_id required']); exit; }
    $item = eos_getScheduleItemOrFail($pdo, $itemId);
    $planId = (int) $item['event_plan_id'];

    $staffId = isset($b['staff_id']) && $b['staff_id'] !== null && $b['staff_id'] !== '' ? (int) $b['staff_id'] : null;
    if ($staffId !== null) eos_validateStaffBelongsToPlan($pdo, $staffId, $planId);

    $responsibility = trim($b['responsibility'] ?? '');
    $assigneeName   = trim($b['assignee_name'] ?? '');
    if (!$responsibility) { http_response_code(400); echo json_encode(['error' => 'responsibility required']); exit; }
    if ($staffId === null && !$assigneeName) { http_response_code(400); echo json_encode(['error' => 'staff_id or assignee_name required']); exit; }

    $stmt = $pdo->prepare("
        INSERT INTO event_schedule_assignments (event_plan_id, schedule_item_id, staff_id, assignee_name, responsibility, notes, sort_order)
        VALUES (?,?,?,?,?,?,?)
    ");
    $stmt->execute([$planId, $itemId, $staffId, $assigneeName ?: null, $responsibility, $b['notes'] ?? null, (int) ($b['sort_order'] ?? 0)]);
    rsa_jsonResponse(['success' => true, 'assignment_id' => (int) $pdo->lastInsertId()], 201);
}

function eo_updateScheduleAssignment(PDO $pdo, int $userId, string $role): void {
    eo_requireAdmin($pdo, $userId, $role);
    $b = eo_body();
    $assignmentId = (int) ($b['assignment_id'] ?? 0);
    if (!$assignmentId) { http_response_code(400); echo json_encode(['error' => 'assignment_id required']); exit; }
    $stmt = $pdo->prepare("SELECT * FROM event_schedule_assignments WHERE id = ? AND deleted_at IS NULL");
    $stmt->execute([$assignmentId]);
    if (!$stmt->fetch()) { http_response_code(404); echo json_encode(['error' => 'Assignment not found']); exit; }

    if (isset($b['staff_id']) && $b['staff_id'] !== null && $b['staff_id'] !== '') {
        $cur = $pdo->prepare("SELECT event_plan_id FROM event_schedule_assignments WHERE id = ?");
        $cur->execute([$assignmentId]);
        eos_validateStaffBelongsToPlan($pdo, (int) $b['staff_id'], (int) $cur->fetchColumn());
    }

    $allowed = ['staff_id', 'assignee_name', 'responsibility', 'notes', 'sort_order'];
    $fields = []; $params = [];
    foreach ($allowed as $f) {
        if (array_key_exists($f, $b)) { $fields[] = "`$f` = ?"; $params[] = $b[$f] === '' ? null : $b[$f]; }
    }
    if (!$fields) { http_response_code(400); echo json_encode(['error' => 'No fields to update']); exit; }
    $params[] = $assignmentId;
    $pdo->prepare("UPDATE event_schedule_assignments SET " . implode(', ', $fields) . " WHERE id = ? AND deleted_at IS NULL")->execute($params);
    rsa_jsonResponse(['success' => true]);
}

function eo_deleteScheduleAssignment(PDO $pdo, int $userId, string $role): void {
    eo_requireAdmin($pdo, $userId, $role);
    $b = eo_body();
    $assignmentId = (int) ($b['assignment_id'] ?? 0);
    if (!$assignmentId) { http_response_code(400); echo json_encode(['error' => 'assignment_id required']); exit; }
    $pdo->prepare("UPDATE event_schedule_assignments SET deleted_at = ? WHERE id = ?")->execute([date('Y-m-d H:i:s'), $assignmentId]);
    rsa_jsonResponse(['success' => true]);
}

// ── Staff duty admin actions ─────────────────────────────────────────────────

function eo_addStaffDuty(PDO $pdo, int $userId, string $role): void {
    eo_requireAdmin($pdo, $userId, $role);
    $b = eo_body();
    $staffId = (int) ($b['staff_id'] ?? 0);
    if (!$staffId) { http_response_code(400); echo json_encode(['error' => 'staff_id required']); exit; }
    $stStmt = $pdo->prepare("SELECT * FROM event_plan_staff WHERE id = ? AND deleted_at IS NULL");
    $stStmt->execute([$staffId]);
    $staff = $stStmt->fetch(PDO::FETCH_ASSOC);
    if (!$staff) { http_response_code(404); echo json_encode(['error' => 'Staff member not found']); exit; }
    if (isset($b['plan_id']) && (int) $b['plan_id'] !== (int) $staff['event_plan_id']) {
        http_response_code(403); echo json_encode(['error' => 'Staff member does not belong to this plan']); exit;
    }
    $duty = trim($b['duty'] ?? '');
    if (!$duty) { http_response_code(400); echo json_encode(['error' => 'duty required']); exit; }
    $stmt = $pdo->prepare("INSERT INTO event_plan_staff_duties (event_plan_id, staff_id, duty, sort_order) VALUES (?,?,?,?)");
    $stmt->execute([(int) $staff['event_plan_id'], $staffId, $duty, (int) ($b['sort_order'] ?? 0)]);
    rsa_jsonResponse(['success' => true, 'duty_id' => (int) $pdo->lastInsertId()], 201);
}

function eo_updateStaffDuty(PDO $pdo, int $userId, string $role): void {
    eo_requireAdmin($pdo, $userId, $role);
    $b = eo_body();
    $dutyId = (int) ($b['duty_id'] ?? 0);
    if (!$dutyId) { http_response_code(400); echo json_encode(['error' => 'duty_id required']); exit; }
    $allowed = ['duty', 'sort_order'];
    $fields = []; $params = [];
    foreach ($allowed as $f) {
        if (array_key_exists($f, $b)) { $fields[] = "`$f` = ?"; $params[] = $b[$f]; }
    }
    if (!$fields) { http_response_code(400); echo json_encode(['error' => 'No fields to update']); exit; }
    $params[] = $dutyId;
    $pdo->prepare("UPDATE event_plan_staff_duties SET " . implode(', ', $fields) . " WHERE id = ? AND deleted_at IS NULL")->execute($params);
    rsa_jsonResponse(['success' => true]);
}

function eo_deleteStaffDuty(PDO $pdo, int $userId, string $role): void {
    eo_requireAdmin($pdo, $userId, $role);
    $b = eo_body();
    $dutyId = (int) ($b['duty_id'] ?? 0);
    if (!$dutyId) { http_response_code(400); echo json_encode(['error' => 'duty_id required']); exit; }
    $pdo->prepare("UPDATE event_plan_staff_duties SET deleted_at = ? WHERE id = ?")->execute([date('Y-m-d H:i:s'), $dutyId]);
    rsa_jsonResponse(['success' => true]);
}
