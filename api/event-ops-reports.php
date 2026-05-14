<?php
/**
 * Event Operations — Post-Event Report API
 *
 * Read actions require:  eventops.read
 * Admin actions require: eventops.admin
 *
 * Included by api/event-ops.php; shares $pdo, $userId, $role, helpers.
 *
 * Report sections generated:
 *   event_summary, staffing_summary, planned_vs_completed,
 *   session_summary, issues_found, followups_carry_forward,
 *   files_data_collection, incident_summary, notes_recommendations
 */

// ── Report helpers ──────────────────────────────────────────────────────────

function eor_getReportOrFail(PDO $pdo, int $reportId): array {
    $stmt = $pdo->prepare("SELECT * FROM event_post_reports WHERE id = ? AND deleted_at IS NULL");
    $stmt->execute([$reportId]);
    $report = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$report) {
        http_response_code(404);
        echo json_encode(['error' => 'Report not found']);
        exit;
    }
    return $report;
}

function eor_validateReportBelongsToPlan(PDO $pdo, int $reportId, int $planId): array {
    $report = eor_getReportOrFail($pdo, $reportId);
    if ((int) $report['event_plan_id'] !== $planId) {
        http_response_code(403);
        echo json_encode(['error' => 'Report does not belong to this plan']);
        exit;
    }
    return $report;
}

function eor_generateUuid(): string {
    return sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
        mt_rand(0, 0xffff), mt_rand(0, 0xffff),
        mt_rand(0, 0xffff),
        mt_rand(0, 0x0fff) | 0x4000,
        mt_rand(0, 0x3fff) | 0x8000,
        mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff)
    );
}

// ── Report generator ─────────────────────────────────────────────────────────

/**
 * Build a live snapshot of report data from plan + live checklist records.
 * Does NOT write to DB. Returns structured preview data.
 * Safe to call at any time — no side effects on plan or live checklist tables.
 */
function eor_buildReportPreview(PDO $pdo, int $planId): array {
    // Plan
    $plan = $pdo->prepare("SELECT * FROM event_plans WHERE id = ? AND deleted_at IS NULL");
    $plan->execute([$planId]);
    $planRow = $plan->fetch(PDO::FETCH_ASSOC);
    if (!$planRow) return ['error' => 'Plan not found'];

    // Staff
    $staffStmt = $pdo->prepare("SELECT * FROM event_plan_staff WHERE event_plan_id = ? AND deleted_at IS NULL ORDER BY sort_order");
    $staffStmt->execute([$planId]);
    $staff = $staffStmt->fetchAll(PDO::FETCH_ASSOC);

    // Sessions
    $sessStmt = $pdo->prepare("SELECT * FROM event_plan_sessions WHERE event_plan_id = ? AND deleted_at IS NULL ORDER BY sort_order");
    $sessStmt->execute([$planId]);
    $sessions = $sessStmt->fetchAll(PDO::FETCH_ASSOC);
    $sessionIds = array_column($sessions, 'id');

    // Tasks
    $taskStmt = $pdo->prepare("SELECT * FROM event_plan_tasks WHERE event_plan_id = ? AND deleted_at IS NULL ORDER BY sort_order");
    $taskStmt->execute([$planId]);
    $tasks = $taskStmt->fetchAll(PDO::FETCH_ASSOC);
    $taskIds = array_column($tasks, 'id');

    // Live task updates (keyed by task_id)
    $liveUpdates = [];
    if (!empty($taskIds)) {
        $ph = implode(',', array_fill(0, count($taskIds), '?'));
        $luStmt = $pdo->prepare("SELECT * FROM event_live_task_updates WHERE task_id IN ($ph) AND deleted_at IS NULL ORDER BY updated_at DESC");
        $luStmt->execute($taskIds);
        foreach ($luStmt->fetchAll(PDO::FETCH_ASSOC) as $lu) {
            if (!isset($liveUpdates[$lu['task_id']])) {
                $liveUpdates[$lu['task_id']] = $lu;
            }
        }
    }

    // Live session status (keyed by session_id)
    $liveSessions = [];
    if (!empty($sessionIds)) {
        $ph = implode(',', array_fill(0, count($sessionIds), '?'));
        $lsStmt = $pdo->prepare("SELECT * FROM event_live_session_status WHERE session_id IN ($ph) AND deleted_at IS NULL ORDER BY updated_at DESC");
        $lsStmt->execute($sessionIds);
        foreach ($lsStmt->fetchAll(PDO::FETCH_ASSOC) as $ls) {
            if (!isset($liveSessions[$ls['session_id']])) {
                $liveSessions[$ls['session_id']] = $ls;
            }
        }
    }

    // Plan files
    $fileStmt = $pdo->prepare("SELECT * FROM event_plan_files WHERE event_plan_id = ? AND deleted_at IS NULL ORDER BY id");
    $fileStmt->execute([$planId]);
    $files = $fileStmt->fetchAll(PDO::FETCH_ASSOC);

    // ── Calculate counts ──────────────────────────────────────────────────
    $totalTasks     = count($tasks);
    $completedTasks = 0;
    $openTasks      = 0;
    $issueTasks     = 0;
    $followupTasks  = 0;
    $carryFwdTasks  = 0;
    $issueItems     = [];
    $followupItems  = [];

    foreach ($tasks as $task) {
        $lu = $liveUpdates[$task['id']] ?? null;
        $status = $lu['status'] ?? 'not_started';
        if ($status === 'complete')     $completedTasks++;
        elseif (in_array($status, ['not_started', 'in_progress', 'blocked'])) $openTasks++;
        if ($lu && $lu['issue_found'])      { $issueTasks++;   $issueItems[]   = $task + ['live_update' => $lu]; }
        if ($lu && $lu['followup_required']){ $followupTasks++; $followupItems[] = $task + ['live_update' => $lu]; }
        if ($lu && $lu['carry_forward'])    $carryFwdTasks++;
    }

    // ── Session summary ───────────────────────────────────────────────────
    $sessionSummary = [];
    foreach ($sessions as $sess) {
        $ls = $liveSessions[$sess['id']] ?? null;
        $sessTaskCount = count(array_filter($tasks, fn($t) => (int)$t['session_id'] === (int)$sess['id']));
        $sessDone = count(array_filter($tasks, fn($t) =>
            (int)$t['session_id'] === (int)$sess['id'] &&
            ($liveUpdates[$t['id']]['status'] ?? '') === 'complete'
        ));
        $sessionSummary[] = [
            'session'        => $sess,
            'live_status'    => $ls,
            'task_count'     => $sessTaskCount,
            'complete_count' => $sessDone,
        ];
    }

    // ── Generated section bodies ──────────────────────────────────────────
    $eventName = ($planRow['event_code'] ?? '') . ' ' . ($planRow['year'] ?? '');
    $trackName = $planRow['track_name'] ?? 'Unknown Track';
    $classScope = $planRow['class_scope'] ?? 'All Classes';
    $pct = $totalTasks > 0 ? round($completedTasks / $totalTasks * 100) : 0;

    $sections = [
        [
            'section_key'    => 'event_summary',
            'title'          => 'Event Summary',
            'generated_body' => "Event: $eventName\nTrack: $trackName\nClass Scope: $classScope\nPlan Status: {$planRow['status']}\nSummary: " . ($planRow['summary'] ?? 'N/A'),
        ],
        [
            'section_key'    => 'staffing_summary',
            'title'          => 'Staffing Summary',
            'generated_body' => count($staff) . " staff assigned.\n" . implode("\n", array_map(fn($s) => "- {$s['display_name']} ({$s['assignment']})", $staff)),
        ],
        [
            'section_key'    => 'planned_vs_completed',
            'title'          => 'Planned vs Completed',
            'generated_body' => "Total planned tasks: $totalTasks\nCompleted: $completedTasks ($pct%)\nOpen/Remaining: $openTasks\nIssues found: $issueTasks",
        ],
        [
            'section_key'    => 'session_summary',
            'title'          => 'Session Summary',
            'generated_body' => implode("\n", array_map(fn($s) =>
                "- {$s['session']['title']}: {$s['complete_count']}/{$s['task_count']} complete" .
                ($s['live_status'] ? " [{$s['live_status']['status']}]" : ' [not started]'),
                $sessionSummary
            )),
        ],
        [
            'section_key'    => 'issues_found',
            'title'          => 'Issues Found',
            'generated_body' => $issueTasks === 0 ? 'No issues recorded.' : implode("\n", array_map(fn($t) =>
                "- {$t['title']}: " . ($t['live_update']['notes'] ?? '(no notes)'),
                $issueItems
            )),
        ],
        [
            'section_key'    => 'followups_carry_forward',
            'title'          => 'Follow-Ups / Carry-Forward',
            'generated_body' => $followupTasks === 0 && $carryFwdTasks === 0 ? 'No follow-ups or carry-forward items.' :
                "Follow-up required: $followupTasks\nCarry-forward: $carryFwdTasks\n" . implode("\n", array_map(fn($t) =>
                    "- {$t['title']}: " . ($t['live_update']['notes'] ?? '(no notes)'),
                    $followupItems
                )),
        ],
        [
            'section_key'    => 'files_data_collection',
            'title'          => 'Files / Data Collection',
            'generated_body' => count($files) === 0 ? 'No files attached.' : implode("\n", array_map(fn($f) =>
                "- [{$f['file_type']}] {$f['title']}" . ($f['url'] ? " — {$f['url']}" : ''),
                $files
            )),
        ],
        [
            'section_key'    => 'incident_summary',
            'title'          => 'Incident Summary',
            'generated_body' => 'No incidents linked. Add incident references via admin controls.',
        ],
        [
            'section_key'    => 'notes_recommendations',
            'title'          => 'Notes / Recommendations',
            'generated_body' => 'Add narrative notes and recommendations here.',
        ],
    ];

    return [
        'plan'              => $planRow,
        'staff'             => $staff,
        'sessions'          => $sessionSummary,
        'files'             => $files,
        'counts' => [
            'total_tasks'         => $totalTasks,
            'completed_tasks'     => $completedTasks,
            'open_tasks'          => $openTasks,
            'issue_tasks'         => $issueTasks,
            'followup_tasks'      => $followupTasks,
            'carry_forward_tasks' => $carryFwdTasks,
            'file_count'          => count($files),
            'staff_count'         => count($staff),
        ],
        'issue_items'       => $issueItems,
        'followup_items'    => $followupItems,
        'sections'          => $sections,
    ];
}

/**
 * Persist a generated report snapshot to event_post_reports + sections + items.
 * Idempotent: if a non-deleted report already exists for this plan, regenerates it.
 */
function eor_persistReport(PDO $pdo, int $planId, int $userId, array $preview): int {
    $existing = $pdo->prepare("SELECT id FROM event_post_reports WHERE event_plan_id = ? AND deleted_at IS NULL ORDER BY id DESC LIMIT 1");
    $existing->execute([$planId]);
    $existingId = $existing->fetchColumn();

    $counts = $preview['counts'];
    $plan   = $preview['plan'];
    $title  = ($plan['event_code'] ?? '') . ' ' . ($plan['year'] ?? '') . ' — Post-Event Report';
    $now    = date('Y-m-d H:i:s');

    if ($existingId) {
        $upd = $pdo->prepare("
            UPDATE event_post_reports SET
                title                    = ?,
                status                   = 'generated',
                completed_task_count     = ?,
                open_task_count          = ?,
                issue_task_count         = ?,
                followup_task_count      = ?,
                carry_forward_task_count = ?,
                generated_at             = ?,
                updated_at               = ?
            WHERE id = ?
        ");
        $upd->execute([
            $title,
            $counts['completed_tasks'],
            $counts['open_tasks'],
            $counts['issue_tasks'],
            $counts['followup_tasks'],
            $counts['carry_forward_tasks'],
            $now, $now,
            $existingId,
        ]);
        $reportId = (int) $existingId;
        // Soft-delete old sections so they get regenerated
        $pdo->prepare("UPDATE event_post_report_sections SET deleted_at = ? WHERE report_id = ? AND deleted_at IS NULL")->execute([$now, $reportId]);
        // Soft-delete old items
        $pdo->prepare("UPDATE event_post_report_items SET deleted_at = ? WHERE report_id = ? AND deleted_at IS NULL")->execute([$now, $reportId]);
    } else {
        $ins = $pdo->prepare("
            INSERT INTO event_post_reports
                (uuid, event_plan_id, title, status,
                 completed_task_count, open_task_count, issue_task_count,
                 followup_task_count, carry_forward_task_count,
                 generated_at, created_by, created_at, updated_at)
            VALUES (?, ?, ?, 'generated', ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ");
        $ins->execute([
            eor_generateUuid(), $planId, $title,
            $counts['completed_tasks'], $counts['open_tasks'], $counts['issue_tasks'],
            $counts['followup_tasks'], $counts['carry_forward_tasks'],
            $now, $userId, $now, $now,
        ]);
        $reportId = (int) $pdo->lastInsertId();
    }

    // Persist sections
    foreach ($preview['sections'] as $i => $sec) {
        $pdo->prepare("
            INSERT INTO event_post_report_sections
                (report_id, section_key, title, generated_body, sort_order, created_by, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ")->execute([
            $reportId, $sec['section_key'], $sec['title'],
            $sec['generated_body'], $i, $userId, $now, $now,
        ]);
    }

    // Persist issue items
    foreach ($preview['issue_items'] as $item) {
        $lu = $item['live_update'];
        $pdo->prepare("
            INSERT INTO event_post_report_items
                (report_id, source_type, source_id, title, body, status, priority, created_by, created_at, updated_at)
            VALUES (?, 'live_task_update', ?, ?, ?, 'generated', 'high', ?, ?, ?)
        ")->execute([
            $reportId, $lu['id'] ?? null, $item['title'],
            $lu['notes'] ?? '', $userId, $now, $now,
        ]);
    }

    // Persist follow-up items
    foreach ($preview['followup_items'] as $item) {
        $lu = $item['live_update'];
        $pdo->prepare("
            INSERT INTO event_post_report_items
                (report_id, source_type, source_id, title, body, status, priority, created_by, created_at, updated_at)
            VALUES (?, 'followup', ?, ?, ?, 'generated', 'normal', ?, ?, ?)
        ")->execute([
            $reportId, $lu['id'] ?? null, $item['title'],
            $lu['notes'] ?? '', $userId, $now, $now,
        ]);
    }

    return $reportId;
}

// ── Read actions ────────────────────────────────────────────────────────────

function eo_listPostReports(PDO $pdo, int $userId, string $role): void {
    eo_requireRead($pdo, $userId, $role);
    $planId = eo_intParam('plan_id');
    eo_getPlanOrFail($pdo, $planId);
    $stmt = $pdo->prepare("SELECT * FROM event_post_reports WHERE event_plan_id = ? AND deleted_at IS NULL ORDER BY id DESC");
    $stmt->execute([$planId]);
    rsa_jsonResponse(['reports' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
}

function eo_getPostReport(PDO $pdo, int $userId, string $role): void {
    eo_requireRead($pdo, $userId, $role);
    $reportId = eo_intParam('report_id');
    $report   = eor_getReportOrFail($pdo, $reportId);
    rsa_jsonResponse(['report' => $report]);
}

function eo_getPostReportSections(PDO $pdo, int $userId, string $role): void {
    eo_requireRead($pdo, $userId, $role);
    $reportId = eo_intParam('report_id');
    eor_getReportOrFail($pdo, $reportId);
    $stmt = $pdo->prepare("SELECT * FROM event_post_report_sections WHERE report_id = ? AND deleted_at IS NULL ORDER BY sort_order");
    $stmt->execute([$reportId]);
    rsa_jsonResponse(['sections' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
}

function eo_getPostReportItems(PDO $pdo, int $userId, string $role): void {
    eo_requireRead($pdo, $userId, $role);
    $reportId = eo_intParam('report_id');
    eor_getReportOrFail($pdo, $reportId);
    $stmt = $pdo->prepare("SELECT * FROM event_post_report_items WHERE report_id = ? AND deleted_at IS NULL ORDER BY id");
    $stmt->execute([$reportId]);
    rsa_jsonResponse(['items' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
}

function eo_getPostReportFiles(PDO $pdo, int $userId, string $role): void {
    eo_requireRead($pdo, $userId, $role);
    $reportId = eo_intParam('report_id');
    eor_getReportOrFail($pdo, $reportId);
    $stmt = $pdo->prepare("SELECT * FROM event_post_report_files WHERE report_id = ? AND deleted_at IS NULL ORDER BY id");
    $stmt->execute([$reportId]);
    rsa_jsonResponse(['files' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
}

function eo_getPostReportIncidents(PDO $pdo, int $userId, string $role): void {
    eo_requireRead($pdo, $userId, $role);
    $reportId = eo_intParam('report_id');
    eor_getReportOrFail($pdo, $reportId);
    $stmt = $pdo->prepare("SELECT * FROM event_post_report_incidents WHERE report_id = ? AND deleted_at IS NULL ORDER BY id");
    $stmt->execute([$reportId]);
    rsa_jsonResponse(['incidents' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
}

function eo_getPostReportPreview(PDO $pdo, int $userId, string $role): void {
    eo_requireRead($pdo, $userId, $role);
    $planId  = eo_intParam('plan_id');
    eo_getPlanOrFail($pdo, $planId);
    $preview = eor_buildReportPreview($pdo, $planId);
    rsa_jsonResponse(['preview' => $preview]);
}

// ── Admin actions ────────────────────────────────────────────────────────────

function eo_generatePostReport(PDO $pdo, int $userId, string $role): void {
    eo_requireAdmin($pdo, $userId, $role);
    $planId  = eo_intParam('plan_id');
    eo_getPlanOrFail($pdo, $planId);
    $preview  = eor_buildReportPreview($pdo, $planId);
    $reportId = eor_persistReport($pdo, $planId, $userId, $preview);
    rsa_jsonResponse(['success' => true, 'report_id' => $reportId]);
}

function eo_createPostReport(PDO $pdo, int $userId, string $role): void {
    eo_requireAdmin($pdo, $userId, $role);
    $planId = eo_intParam('plan_id');
    eo_getPlanOrFail($pdo, $planId);
    $title  = eo_strParam('title', false) ?? '';
    $now    = date('Y-m-d H:i:s');
    $stmt   = $pdo->prepare("
        INSERT INTO event_post_reports (uuid, event_plan_id, title, status, created_by, created_at, updated_at)
        VALUES (?, ?, ?, 'draft', ?, ?, ?)
    ");
    $stmt->execute([eor_generateUuid(), $planId, $title, $userId, $now, $now]);
    rsa_jsonResponse(['success' => true, 'report_id' => (int) $pdo->lastInsertId()]);
}

function eo_updatePostReport(PDO $pdo, int $userId, string $role): void {
    eo_requireAdmin($pdo, $userId, $role);
    $reportId = eo_intParam('report_id');
    eor_getReportOrFail($pdo, $reportId);
    $allowed = ['title', 'summary', 'generated_summary'];
    $sets = []; $vals = [];
    foreach ($allowed as $f) {
        $v = $_POST[$f] ?? null;
        if ($v !== null) { $sets[] = "$f = ?"; $vals[] = $v; }
    }
    if (empty($sets)) { rsa_jsonResponse(['success' => true]); return; }
    $vals[] = date('Y-m-d H:i:s');
    $vals[] = $reportId;
    $pdo->prepare("UPDATE event_post_reports SET " . implode(', ', $sets) . ", updated_at = ? WHERE id = ?")->execute($vals);
    rsa_jsonResponse(['success' => true]);
}

function eo_finalizePostReport(PDO $pdo, int $userId, string $role): void {
    eo_requireAdmin($pdo, $userId, $role);
    $reportId = eo_intParam('report_id');
    eor_getReportOrFail($pdo, $reportId);
    $now = date('Y-m-d H:i:s');
    $pdo->prepare("UPDATE event_post_reports SET status = 'finalized', finalized_at = ?, finalized_by = ?, updated_at = ? WHERE id = ?")->execute([$now, $userId, $now, $reportId]);
    rsa_jsonResponse(['success' => true]);
}

function eo_reopenPostReport(PDO $pdo, int $userId, string $role): void {
    eo_requireAdmin($pdo, $userId, $role);
    $reportId = eo_intParam('report_id');
    eor_getReportOrFail($pdo, $reportId);
    $now = date('Y-m-d H:i:s');
    $pdo->prepare("UPDATE event_post_reports SET status = 'in_review', finalized_at = NULL, finalized_by = NULL, updated_at = ? WHERE id = ?")->execute([$now, $reportId]);
    rsa_jsonResponse(['success' => true]);
}

function eo_softDeletePostReport(PDO $pdo, int $userId, string $role): void {
    eo_requireAdmin($pdo, $userId, $role);
    $reportId = eo_intParam('report_id');
    eor_getReportOrFail($pdo, $reportId);
    $now = date('Y-m-d H:i:s');
    $pdo->prepare("UPDATE event_post_reports SET deleted_at = ?, updated_at = ? WHERE id = ?")->execute([$now, $now, $reportId]);
    rsa_jsonResponse(['success' => true]);
}

function eo_regeneratePostReportSummary(PDO $pdo, int $userId, string $role): void {
    eo_requireAdmin($pdo, $userId, $role);
    $reportId = eo_intParam('report_id');
    $report   = eor_getReportOrFail($pdo, $reportId);
    $preview  = eor_buildReportPreview($pdo, (int) $report['event_plan_id']);
    eor_persistReport($pdo, (int) $report['event_plan_id'], $userId, $preview);
    rsa_jsonResponse(['success' => true]);
}

function eo_updateReportSection(PDO $pdo, int $userId, string $role): void {
    eo_requireAdmin($pdo, $userId, $role);
    $reportId  = eo_intParam('report_id');
    $sectionId = eo_intParam('section_id');
    eor_getReportOrFail($pdo, $reportId);
    $stmt = $pdo->prepare("SELECT * FROM event_post_report_sections WHERE id = ? AND report_id = ? AND deleted_at IS NULL");
    $stmt->execute([$sectionId, $reportId]);
    if (!$stmt->fetch()) { http_response_code(404); echo json_encode(['error' => 'Section not found']); exit; }
    $body = eo_strParam('body', false);
    $title = eo_strParam('title', false);
    $sets = []; $vals = [];
    if ($body  !== null) { $sets[] = 'body = ?';  $vals[] = $body; }
    if ($title !== null) { $sets[] = 'title = ?'; $vals[] = $title; }
    if (empty($sets)) { rsa_jsonResponse(['success' => true]); return; }
    $vals[] = date('Y-m-d H:i:s'); $vals[] = $sectionId;
    $pdo->prepare("UPDATE event_post_report_sections SET " . implode(', ', $sets) . ", updated_at = ? WHERE id = ?")->execute($vals);
    rsa_jsonResponse(['success' => true]);
}

function eo_addReportItem(PDO $pdo, int $userId, string $role): void {
    eo_requireAdmin($pdo, $userId, $role);
    $reportId = eo_intParam('report_id');
    eor_getReportOrFail($pdo, $reportId);
    $title    = eo_strParam('title');
    $body     = eo_strParam('body', false) ?? '';
    $priority = eo_strParam('priority', false) ?? 'normal';
    $now      = date('Y-m-d H:i:s');
    $pdo->prepare("
        INSERT INTO event_post_report_items (report_id, source_type, title, body, status, priority, created_by, created_at, updated_at)
        VALUES (?, 'manual', ?, ?, 'draft', ?, ?, ?, ?)
    ")->execute([$reportId, $title, $body, $priority, $userId, $now, $now]);
    rsa_jsonResponse(['success' => true, 'item_id' => (int) $pdo->lastInsertId()]);
}

function eo_updateReportItem(PDO $pdo, int $userId, string $role): void {
    eo_requireAdmin($pdo, $userId, $role);
    $reportId = eo_intParam('report_id');
    $itemId   = eo_intParam('item_id');
    eor_getReportOrFail($pdo, $reportId);
    $stmt = $pdo->prepare("SELECT id FROM event_post_report_items WHERE id = ? AND report_id = ? AND deleted_at IS NULL");
    $stmt->execute([$itemId, $reportId]);
    if (!$stmt->fetchColumn()) { http_response_code(404); echo json_encode(['error' => 'Item not found']); exit; }
    $allowed = ['title', 'body', 'status', 'priority'];
    $sets = []; $vals = [];
    foreach ($allowed as $f) { $v = $_POST[$f] ?? null; if ($v !== null) { $sets[] = "$f = ?"; $vals[] = $v; } }
    if (empty($sets)) { rsa_jsonResponse(['success' => true]); return; }
    $vals[] = date('Y-m-d H:i:s'); $vals[] = $itemId;
    $pdo->prepare("UPDATE event_post_report_items SET " . implode(', ', $sets) . ", updated_at = ? WHERE id = ?")->execute($vals);
    rsa_jsonResponse(['success' => true]);
}

function eo_deleteReportItem(PDO $pdo, int $userId, string $role): void {
    eo_requireAdmin($pdo, $userId, $role);
    $reportId = eo_intParam('report_id');
    $itemId   = eo_intParam('item_id');
    eor_getReportOrFail($pdo, $reportId);
    $now = date('Y-m-d H:i:s');
    $pdo->prepare("UPDATE event_post_report_items SET deleted_at = ?, updated_at = ? WHERE id = ? AND report_id = ?")->execute([$now, $now, $itemId, $reportId]);
    rsa_jsonResponse(['success' => true]);
}

function eo_addReportFile(PDO $pdo, int $userId, string $role): void {
    eo_requireAdmin($pdo, $userId, $role);
    $reportId = eo_intParam('report_id');
    eor_getReportOrFail($pdo, $reportId);
    $title    = eo_strParam('title');
    $fileType = eo_strParam('file_type', false) ?? 'other';
    $url      = eo_strParam('url', false);
    $boxFileId  = eo_strParam('box_file_id', false);
    $boxFolderId = eo_strParam('box_folder_id', false);
    $notes    = eo_strParam('notes', false) ?? '';
    $now      = date('Y-m-d H:i:s');
    $pdo->prepare("
        INSERT INTO event_post_report_files (report_id, file_type, title, url, box_file_id, box_folder_id, notes, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ")->execute([$reportId, $fileType, $title, $url, $boxFileId, $boxFolderId, $notes, $userId, $now, $now]);
    rsa_jsonResponse(['success' => true, 'file_id' => (int) $pdo->lastInsertId()]);
}

function eo_deleteReportFile(PDO $pdo, int $userId, string $role): void {
    eo_requireAdmin($pdo, $userId, $role);
    $reportId = eo_intParam('report_id');
    $fileId   = eo_intParam('file_id');
    eor_getReportOrFail($pdo, $reportId);
    $now = date('Y-m-d H:i:s');
    $pdo->prepare("UPDATE event_post_report_files SET deleted_at = ?, updated_at = ? WHERE id = ? AND report_id = ?")->execute([$now, $now, $fileId, $reportId]);
    rsa_jsonResponse(['success' => true]);
}

function eo_addReportIncident(PDO $pdo, int $userId, string $role): void {
    eo_requireAdmin($pdo, $userId, $role);
    $reportId   = eo_intParam('report_id');
    eor_getReportOrFail($pdo, $reportId);
    $title      = eo_strParam('title');
    $summary    = eo_strParam('summary', false) ?? '';
    $incidentId = eo_intParam('incident_id', false);
    $followup   = isset($_POST['followup_required']) ? (int)(bool)$_POST['followup_required'] : 0;
    $now        = date('Y-m-d H:i:s');
    $pdo->prepare("
        INSERT INTO event_post_report_incidents (report_id, incident_id, title, summary, status, followup_required, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?)
    ")->execute([$reportId, $incidentId, $title, $summary, $followup, $userId, $now, $now]);
    rsa_jsonResponse(['success' => true, 'incident_ref_id' => (int) $pdo->lastInsertId()]);
}

function eo_deleteReportIncident(PDO $pdo, int $userId, string $role): void {
    eo_requireAdmin($pdo, $userId, $role);
    $reportId  = eo_intParam('report_id');
    $incRefId  = eo_intParam('incident_ref_id');
    eor_getReportOrFail($pdo, $reportId);
    $now = date('Y-m-d H:i:s');
    $pdo->prepare("UPDATE event_post_report_incidents SET deleted_at = ?, updated_at = ? WHERE id = ? AND report_id = ?")->execute([$now, $now, $incRefId, $reportId]);
    rsa_jsonResponse(['success' => true]);
}
