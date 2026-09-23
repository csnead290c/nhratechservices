<?php
/**
 * Event Ops Staffing API (v41) — included by event-ops.php
 *
 * Three authorization tiers:
 *   - worker actions:  authenticated user, self-scoped (own requests/profile)
 *   - read actions:    eventops.read
 *   - admin actions:   eventops.admin
 *
 * Canonical event identity is parity_events. Work requests anchor to
 * parity_event_id so they can precede (and survive) plan recreation.
 * Confirmed staff remain event_plan_staff rows; a request links to the
 * staff row created on confirmation via event_plan_staff_id.
 *
 * Privacy: dietary detail is returned ONLY to eventops.admin (and to the
 * owning worker on their own request/profile). List endpoints expose a
 * dietary_on_file boolean, never the detail text.
 */

const EOW_REQUEST_STATUSES   = ['requested', 'confirmed', 'waitlisted', 'declined', 'cancelled'];
const EOW_AVAILABILITY       = ['full', 'partial'];
const EOW_TRAVEL_INTENT      = ['drive', 'fly', 'local', 'other'];
const EOW_LODGING_INTENT     = ['hotel', 'motorhome', 'none', 'other'];
const EOW_ROOMMATE_PREF      = ['specific_person', 'no_preference', 'private_room', 'not_applicable'];
const EOW_DIETARY_CATEGORIES = ['none', 'vegetarian', 'vegan', 'gluten_free', 'dairy_free', 'allergy', 'other'];
const EOW_TRAVEL_MODES       = ['fly', 'drive', 'local', 'other'];
const EOW_LODGING_TYPES      = ['hotel', 'motorhome', 'none', 'other'];
const EOW_TRAVEL_LEGS        = ['outbound', 'return', 'other'];

// ── Small helpers ──────────────────────────────────────────────────────────

function eow_fail(string $msg, int $code = 400): void {
    http_response_code($code);
    echo json_encode(['error' => $msg]);
    exit;
}

function eow_dtOrNull($v): ?string {
    // Accept 'YYYY-MM-DD HH:MM[:SS]' or ISO-ish 'YYYY-MM-DDTHH:MM'
    if ($v === null || trim((string) $v) === '') return null;
    $v = str_replace('T', ' ', trim((string) $v));
    if (!preg_match('/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}(:\d{2})?)?$/', $v)) {
        eow_fail('datetime must be YYYY-MM-DD HH:MM');
    }
    return strlen($v) === 10 ? $v . ' 00:00:00' : $v;
}

function eow_dateOrNull($v): ?string {
    if ($v === null || trim((string) $v) === '') return null;
    $v = trim((string) $v);
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $v)) eow_fail('date must be YYYY-MM-DD');
    return $v;
}

function eow_getRequestOrFail(PDO $pdo, int $id): array {
    $stmt = $pdo->prepare("SELECT * FROM event_staff_requests WHERE id = ?");
    $stmt->execute([$id]);
    $r = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$r) eow_fail('Staff request not found', 404);
    return $r;
}

function eow_getStaffOrFail(PDO $pdo, int $id): array {
    $stmt = $pdo->prepare("SELECT * FROM event_plan_staff WHERE id = ? AND deleted_at IS NULL");
    $stmt->execute([$id]);
    $s = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$s) eow_fail('Staff row not found', 404);
    return $s;
}

/** Plan that owns a canonical event (latest non-deleted plan for the parity event). */
function eow_planForParityEvent(PDO $pdo, int $parityEventId): ?array {
    $stmt = $pdo->prepare("
        SELECT * FROM event_plans
        WHERE parity_event_id = ? AND deleted_at IS NULL
        ORDER BY id DESC LIMIT 1
    ");
    $stmt->execute([$parityEventId]);
    $p = $stmt->fetch(PDO::FETCH_ASSOC);
    return $p ?: null;
}

function eow_requestBeverages(PDO $pdo, int $requestId): array {
    $stmt = $pdo->prepare("SELECT beverage FROM event_staff_request_beverages WHERE request_id = ? ORDER BY sort_order, id");
    $stmt->execute([$requestId]);
    return $stmt->fetchAll(PDO::FETCH_COLUMN);
}

function eow_profile(PDO $pdo, int $userId): ?array {
    $stmt = $pdo->prepare("SELECT * FROM event_worker_profiles WHERE user_id = ?");
    $stmt->execute([$userId]);
    $p = $stmt->fetch(PDO::FETCH_ASSOC);
    return $p ?: null;
}

function eow_profileBeverages(PDO $pdo, int $userId): array {
    $stmt = $pdo->prepare("SELECT beverage FROM event_worker_beverage_prefs WHERE user_id = ? ORDER BY sort_order, id");
    $stmt->execute([$userId]);
    return $stmt->fetchAll(PDO::FETCH_COLUMN);
}

function eow_recordRequestEvent(PDO $pdo, int $requestId, string $status, ?int $by, ?string $note): void {
    $pdo->prepare("INSERT INTO event_staff_request_events (request_id, status, note, changed_by) VALUES (?,?,?,?)")
        ->execute([$requestId, $status, $note, $by]);
}

/** Shape a request row for output. $withDetail=true includes sensitive fields (admin or owner only). */
function eow_shapeRequest(array $r, bool $withDetail): array {
    $out = $r;
    if (!$withDetail) {
        $out['dietary_on_file'] = ($r['dietary_category'] ?? null) !== null && $r['dietary_category'] !== 'none';
        unset($out['dietary_detail'], $out['dietary_category']);
    } else {
        $out['dietary_on_file'] = ($r['dietary_category'] ?? null) !== null && $r['dietary_category'] !== 'none';
    }
    return $out;
}

// ── Worker-facing actions (authenticated; self-scoped) ─────────────────────

/** List canonical (parity) events — used by the request picker and plan creation. */
function eow_listCanonicalEvents(PDO $pdo, int $userId): void {
    $upcoming = isset($_GET['upcoming']) ? (int) $_GET['upcoming'] : 0;
    $seasonYear = isset($_GET['season_year']) ? (int) $_GET['season_year'] : 0;
    $where = [];
    $params = [];
    if ($seasonYear) { $where[] = 'pe.season_year = ?'; $params[] = $seasonYear; }
    if ($upcoming)   { $where[] = 'pe.end_date_local >= CURDATE()'; }
    // SQLite dev DB has no CURDATE()
    if ($upcoming && $pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'sqlite') {
        $where[count($where) - 1] = "pe.end_date_local >= date('now')";
    }
    $sql = "
        SELECT pe.id, pe.event_name, pe.event_code, pe.season_year,
               pe.start_date_local, pe.end_date_local, pe.race_lookup,
               pe.event_instance_id,
               pt.track_name, pt.city, pt.state, pt.timezone_iana
        FROM parity_events pe
        JOIN parity_tracks pt ON pt.id = pe.track_id
        " . ($where ? 'WHERE ' . implode(' AND ', $where) : '') . "
        ORDER BY pe.start_date_local DESC
        LIMIT 300
    ";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    rsa_jsonResponse(['events' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
}

/** My worker profile (defaults) — self only. */
function eow_getMyWorkerProfile(PDO $pdo, int $userId): void {
    $profile = eow_profile($pdo, $userId);
    rsa_jsonResponse([
        'profile'   => $profile,
        'beverages' => eow_profileBeverages($pdo, $userId),
    ]);
}

/** Create or update my worker profile defaults. */
function eow_updateMyWorkerProfile(PDO $pdo, int $userId): void {
    $b = eo_body();
    $existing = eow_profile($pdo, $userId);

    $travelDefault = $b['travel_default'] ?? ($existing['travel_default'] ?? null);
    if ($travelDefault !== null && $travelDefault !== '') eo_validateEnum($travelDefault, EOW_TRAVEL_INTENT, 'travel_default');
    $dietaryCat = array_key_exists('dietary_category', $b) ? $b['dietary_category'] : ($existing['dietary_category'] ?? null);
    if ($dietaryCat !== null && $dietaryCat !== '') eo_validateEnum($dietaryCat, EOW_DIETARY_CATEGORIES, 'dietary_category');

    $fields = [
        'phone'           => array_key_exists('phone', $b) ? trim((string) $b['phone']) : ($existing['phone'] ?? null),
        'travel_default'  => $travelDefault ?: null,
        'dietary_category'=> $dietaryCat ?: null,
        'dietary_detail'  => array_key_exists('dietary_detail', $b) ? $b['dietary_detail'] : ($existing['dietary_detail'] ?? null),
        'notes'           => array_key_exists('notes', $b) ? $b['notes'] : ($existing['notes'] ?? null),
    ];

    if ($existing) {
        $pdo->prepare("
            UPDATE event_worker_profiles
            SET phone=?, travel_default=?, dietary_category=?, dietary_detail=?, notes=?
            WHERE user_id=?
        ")->execute([$fields['phone'], $fields['travel_default'], $fields['dietary_category'],
                     $fields['dietary_detail'], $fields['notes'], $userId]);
        $profileId = (int) $existing['id'];
    } else {
        $pdo->prepare("
            INSERT INTO event_worker_profiles (uuid, user_id, person_id, phone, travel_default, dietary_category, dietary_detail, notes)
            VALUES (?,?,?,?,?,?,?,?)
        ")->execute([eo_newUuid(), $userId, $b['person_id'] ?? null, $fields['phone'], $fields['travel_default'],
                     $fields['dietary_category'], $fields['dietary_detail'], $fields['notes']]);
        $profileId = (int) $pdo->lastInsertId();
    }

    // Replace beverage defaults when provided
    if (array_key_exists('beverages', $b)) {
        $pdo->prepare("DELETE FROM event_worker_beverage_prefs WHERE user_id = ?")->execute([$userId]);
        $ins = $pdo->prepare("INSERT INTO event_worker_beverage_prefs (user_id, beverage, sort_order) VALUES (?,?,?)");
        foreach ((array) $b['beverages'] as $i => $bev) {
            $bev = trim((string) $bev);
            if ($bev !== '') $ins->execute([$userId, $bev, $i]);
        }
    }

    rsa_jsonResponse(['success' => true, 'profile_id' => $profileId]);
}

/** My work requests across events. */
function eow_getMyRequests(PDO $pdo, int $userId): void {
    $stmt = $pdo->prepare("
        SELECT r.*, pe.event_name, pe.event_code, pe.season_year,
               pe.start_date_local, pe.end_date_local, pt.track_name
        FROM event_staff_requests r
        JOIN parity_events pe ON pe.id = r.parity_event_id
        JOIN parity_tracks pt ON pt.id = pe.track_id
        WHERE r.user_id = ?
        ORDER BY pe.start_date_local DESC, r.id DESC
    ");
    $stmt->execute([$userId]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    foreach ($rows as &$r) {
        $r['beverages'] = eow_requestBeverages($pdo, (int) $r['id']);
        $r = eow_shapeRequest($r, true); // owner sees own detail
    }
    rsa_jsonResponse(['requests' => $rows]);
}

/** Submit a work request for a canonical event. One open request per user+event. */
function eow_submitWorkRequest(PDO $pdo, int $userId): void {
    $b = eo_body();
    $eventId = (int) ($b['parity_event_id'] ?? 0);
    if (!$eventId) eow_fail('parity_event_id required');

    $stmt = $pdo->prepare("SELECT id FROM parity_events WHERE id = ?");
    $stmt->execute([$eventId]);
    if (!$stmt->fetchColumn()) eow_fail('Event not found', 404);

    // One live request per user per event
    $stmt = $pdo->prepare("
        SELECT id, status FROM event_staff_requests
        WHERE parity_event_id = ? AND user_id = ? AND status IN ('requested','confirmed','waitlisted')
        LIMIT 1
    ");
    $stmt->execute([$eventId, $userId]);
    if ($dup = $stmt->fetch(PDO::FETCH_ASSOC)) {
        eow_fail("An active request already exists for this event (request #{$dup['id']}, status {$dup['status']})", 409);
    }

    $availability = $b['availability'] ?? 'full';
    eo_validateEnum($availability, EOW_AVAILABILITY, 'availability');
    $availFrom = eow_dtOrNull($b['available_from'] ?? null);
    $availThru = eow_dtOrNull($b['available_through'] ?? null);
    if ($availability === 'partial' && (!$availFrom || !$availThru)) {
        eow_fail('partial availability requires available_from and available_through');
    }

    $travel  = $b['travel_intent'] ?? null;
    if ($travel) eo_validateEnum($travel, EOW_TRAVEL_INTENT, 'travel_intent');
    $lodging = $b['lodging_intent'] ?? null;
    if ($lodging) eo_validateEnum($lodging, EOW_LODGING_INTENT, 'lodging_intent');

    $roommatePref = $b['roommate_pref'] ?? null;
    if ($roommatePref) eo_validateEnum($roommatePref, EOW_ROOMMATE_PREF, 'roommate_pref');
    $roommatePersonId = null;
    $roommateName = null;
    if ($roommatePref === 'specific_person') {
        if (!empty($b['roommate_person_id'])) {
            $roommatePersonId = (int) $b['roommate_person_id'];
            $chk = $pdo->prepare("SELECT id FROM persons WHERE id = ?");
            $chk->execute([$roommatePersonId]);
            if (!$chk->fetchColumn()) eow_fail('roommate_person_id not found');
        } else {
            $roommateName = trim((string) ($b['roommate_name'] ?? '')) ?: null;
            if (!$roommateName) eow_fail('specific_person roommate requires roommate_person_id or roommate_name');
        }
    }

    $dietCat = $b['dietary_category'] ?? null;
    if ($dietCat) eo_validateEnum($dietCat, EOW_DIETARY_CATEGORIES, 'dietary_category');

    $now = date('Y-m-d H:i:s');
    $pdo->prepare("
        INSERT INTO event_staff_requests
            (uuid, parity_event_id, user_id, person_id, status, availability,
             available_from, available_through, travel_intent, lodging_intent,
             roommate_pref, roommate_person_id, roommate_name,
             dietary_category, dietary_detail, notes, requested_at)
        VALUES (?,?,?,?, 'requested', ?,?,?,?,?,?,?,?,?,?,?,?)
    ")->execute([
        eo_newUuid(), $eventId, $userId, $b['person_id'] ?? null,
        $availability, $availFrom, $availThru, $travel, $lodging,
        $roommatePref, $roommatePersonId, $roommateName,
        $dietCat, $b['dietary_detail'] ?? null, $b['notes'] ?? null, $now,
    ]);
    $requestId = (int) $pdo->lastInsertId();

    // Per-request beverage override rows (empty => inherit profile defaults)
    if (array_key_exists('beverages', $b) && is_array($b['beverages'])) {
        $ins = $pdo->prepare("INSERT INTO event_staff_request_beverages (request_id, beverage, sort_order) VALUES (?,?,?)");
        foreach ($b['beverages'] as $i => $bev) {
            $bev = trim((string) $bev);
            if ($bev !== '') $ins->execute([$requestId, $bev, $i]);
        }
    }

    eow_recordRequestEvent($pdo, $requestId, 'requested', $userId, null);
    rsa_jsonResponse(['success' => true, 'request_id' => $requestId], 201);
}

/** Edit my request — only while still 'requested'. */
function eow_updateWorkRequest(PDO $pdo, int $userId): void {
    $b = eo_body();
    $id = (int) ($b['request_id'] ?? 0);
    $r = eow_getRequestOrFail($pdo, $id);
    if ((int) $r['user_id'] !== $userId) eow_fail('Forbidden', 403);
    if ($r['status'] !== 'requested') eow_fail('Only pending requests can be edited', 409);

    $fields = [];
    $params = [];
    foreach (['availability','travel_intent','lodging_intent','roommate_pref','dietary_category'] as $f) {
        if (array_key_exists($f, $b)) {
            $map = ['availability' => EOW_AVAILABILITY, 'travel_intent' => EOW_TRAVEL_INTENT,
                    'lodging_intent' => EOW_LODGING_INTENT, 'roommate_pref' => EOW_ROOMMATE_PREF,
                    'dietary_category' => EOW_DIETARY_CATEGORIES];
            if ($b[$f] !== null) eo_validateEnum($b[$f], $map[$f], $f);
            $fields[] = "`$f` = ?"; $params[] = $b[$f];
        }
    }
    foreach (['roommate_name','dietary_detail','notes'] as $f) {
        if (array_key_exists($f, $b)) { $fields[] = "`$f` = ?"; $params[] = $b[$f]; }
    }
    foreach (['available_from','available_through'] as $f) {
        if (array_key_exists($f, $b)) { $fields[] = "`$f` = ?"; $params[] = eow_dtOrNull($b[$f]); }
    }
    if (array_key_exists('roommate_person_id', $b)) {
        $fields[] = 'roommate_person_id = ?';
        $params[] = $b['roommate_person_id'] !== null ? (int) $b['roommate_person_id'] : null;
    }
    if ($fields) {
        $params[] = $id;
        $pdo->prepare("UPDATE event_staff_requests SET " . implode(', ', $fields) . " WHERE id = ?")->execute($params);
    }
    if (array_key_exists('beverages', $b) && is_array($b['beverages'])) {
        $pdo->prepare("DELETE FROM event_staff_request_beverages WHERE request_id = ?")->execute([$id]);
        $ins = $pdo->prepare("INSERT INTO event_staff_request_beverages (request_id, beverage, sort_order) VALUES (?,?,?)");
        foreach ($b['beverages'] as $i => $bev) {
            $bev = trim((string) $bev);
            if ($bev !== '') $ins->execute([$id, $bev, $i]);
        }
    }
    rsa_jsonResponse(['success' => true]);
}

/** Cancel my request (any status). History is preserved. */
function eow_cancelWorkRequest(PDO $pdo, int $userId): void {
    $b = eo_body();
    $id = (int) ($b['request_id'] ?? 0);
    $r = eow_getRequestOrFail($pdo, $id);
    if ((int) $r['user_id'] !== $userId) eow_fail('Forbidden', 403);
    if (in_array($r['status'], ['cancelled'], true)) eow_fail('Request already cancelled', 409);
    $pdo->prepare("UPDATE event_staff_requests SET status='cancelled', decided_at=? WHERE id=?")
        ->execute([date('Y-m-d H:i:s'), $id]);
    eow_recordRequestEvent($pdo, $id, 'cancelled', $userId, 'Cancelled by worker');
    rsa_jsonResponse(['success' => true]);
}

/** Minimal person search for roommate pickers — id + name only. */
function eow_searchPersons(PDO $pdo, int $userId): void {
    $q = trim((string) ($_GET['q'] ?? ''));
    if (strlen($q) < 2) rsa_jsonResponse(['persons' => []]);
    $stmt = $pdo->prepare("
        SELECT id, display_name, person_type FROM persons
        WHERE status = 'active' AND display_name LIKE ?
        ORDER BY display_name LIMIT 20
    ");
    $stmt->execute(['%' . $q . '%']);
    rsa_jsonResponse(['persons' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
}

// ── Admin actions (eventops.admin) ─────────────────────────────────────────

/** Requests for the canonical event a plan belongs to. Detail fields stripped — use getStaffRequest. */
function eow_listEventRequests(PDO $pdo, int $userId, string $role): void {
    eo_requireAdmin($pdo, $userId, $role);
    $planId = eo_intParam('plan_id');
    $plan = eo_getPlanOrFail($pdo, $planId);
    if (!$plan['parity_event_id']) {
        rsa_jsonResponse(['requests' => [], 'note' => 'Plan is not linked to a canonical event']);
    }
    $stmt = $pdo->prepare("
        SELECT r.*, u.name AS user_name, u.email AS user_email,
               rp.display_name AS roommate_person_name
        FROM event_staff_requests r
        JOIN users u ON u.id = r.user_id
        LEFT JOIN persons rp ON rp.id = r.roommate_person_id
        WHERE r.parity_event_id = ?
        ORDER BY r.requested_at ASC
    ");
    $stmt->execute([(int) $plan['parity_event_id']]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    foreach ($rows as &$r) {
        $r['beverages'] = eow_requestBeverages($pdo, (int) $r['id']);
        $r = eow_shapeRequest($r, false); // flags only, no dietary detail in list
    }
    rsa_jsonResponse(['requests' => $rows]);
}

/** Full request detail — admin only (includes dietary detail). */
function eow_getStaffRequest(PDO $pdo, int $userId, string $role): void {
    eo_requireAdmin($pdo, $userId, $role);
    $id = eo_intParam('request_id');
    $r = eow_getRequestOrFail($pdo, $id);
    $u = $pdo->prepare("SELECT name, email FROM users WHERE id = ?");
    $u->execute([(int) $r['user_id']]);
    $user = $u->fetch(PDO::FETCH_ASSOC) ?: [];
    $r['user_name'] = $user['name'] ?? null;
    $r['user_email'] = $user['email'] ?? null;
    if ($r['roommate_person_id']) {
        $p = $pdo->prepare("SELECT display_name FROM persons WHERE id = ?");
        $p->execute([(int) $r['roommate_person_id']]);
        $r['roommate_person_name'] = $p->fetchColumn() ?: null;
    }
    $r['beverages'] = eow_requestBeverages($pdo, $id);
    // Profile defaults for context
    $r['profile_beverages'] = eow_profileBeverages($pdo, (int) $r['user_id']);
    $prof = eow_profile($pdo, (int) $r['user_id']);
    $r['profile_dietary_category'] = $prof['dietary_category'] ?? null;
    $r['profile_dietary_detail'] = $prof['dietary_detail'] ?? null;
    // status history
    $h = $pdo->prepare("SELECT status, note, changed_by, created_at FROM event_staff_request_events WHERE request_id = ? ORDER BY id");
    $h->execute([$id]);
    $r['history'] = $h->fetchAll(PDO::FETCH_ASSOC);
    rsa_jsonResponse(['request' => eow_shapeRequest($r, true)]);
}

/** Confirm / waitlist / decline (or reopen) a request. Confirm creates the staff row. */
function eow_decideWorkRequest(PDO $pdo, int $userId, string $role): void {
    eo_requireAdmin($pdo, $userId, $role);
    $b = eo_body();
    $id = (int) ($b['request_id'] ?? 0);
    $decision = $b['decision'] ?? '';
    eo_validateEnum($decision, EOW_REQUEST_STATUSES, 'decision');
    $note = isset($b['note']) ? trim((string) $b['note']) : null;

    $r = eow_getRequestOrFail($pdo, $id);
    $now = date('Y-m-d H:i:s');
    $staffId = $r['event_plan_staff_id'] ? (int) $r['event_plan_staff_id'] : null;

    if ($decision === 'confirmed' && !$staffId) {
        $plan = eow_planForParityEvent($pdo, (int) $r['parity_event_id']);
        if (!$plan) eow_fail('No event plan is linked to this parity event — create the plan first.', 409);
        // Reuse an existing staff row for this user on the plan if present
        $chk = $pdo->prepare("SELECT id FROM event_plan_staff WHERE event_plan_id = ? AND user_id = ? AND deleted_at IS NULL");
        $chk->execute([(int) $plan['id'], (int) $r['user_id']]);
        $staffId = (int) ($chk->fetchColumn() ?: 0);
        if (!$staffId) {
            $u = $pdo->prepare("SELECT name FROM users WHERE id = ?");
            $u->execute([(int) $r['user_id']]);
            $name = $u->fetchColumn() ?: ('User #' . $r['user_id']);
            $pdo->prepare("
                INSERT INTO event_plan_staff (event_plan_id, user_id, person_id, display_name, assignment, notes, is_active)
                VALUES (?,?,?,?, 'Staff', ?, 1)
            ")->execute([(int) $plan['id'], (int) $r['user_id'], $r['person_id'], $name, 'Confirmed from work request #' . $id]);
            $staffId = (int) $pdo->lastInsertId();
        }
    }

    $pdo->prepare("UPDATE event_staff_requests SET status=?, decided_at=?, decided_by=?, decision_note=?, event_plan_staff_id=? WHERE id=?")
        ->execute([$decision, $now, $userId, $note, $staffId, $id]);
    eow_recordRequestEvent($pdo, $id, $decision, $userId, $note);

    rsa_jsonResponse(['success' => true, 'staff_id' => $staffId]);
}

/** Staff detail: row + classes + duties + travel + lodging + originating request. Admin only. */
function eow_getStaffDetail(PDO $pdo, int $userId, string $role): void {
    eo_requireAdmin($pdo, $userId, $role);
    $staffId = eo_intParam('staff_id');
    $s = eow_getStaffOrFail($pdo, $staffId);

    $classes = $pdo->prepare("SELECT * FROM event_staff_classes WHERE staff_id = ? AND deleted_at IS NULL ORDER BY is_primary DESC, sort_order, id");
    $classes->execute([$staffId]);
    $duties = $pdo->prepare("SELECT * FROM event_plan_staff_duties WHERE staff_id = ? AND deleted_at IS NULL ORDER BY sort_order, id");
    $duties->execute([$staffId]);
    $legs = $pdo->prepare("
        SELECT t.*, c.display_name AS carpool_with_name
        FROM event_staff_travel_legs t
        LEFT JOIN event_plan_staff c ON c.id = t.carpool_with_staff_id
        WHERE t.staff_id = ? AND t.deleted_at IS NULL ORDER BY t.leg, t.depart_at, t.id
    ");
    $legs->execute([$staffId]);
    $lodging = $pdo->prepare("
        SELECT l.*, rm.display_name AS roommate_staff_name
        FROM event_staff_lodging l
        LEFT JOIN event_plan_staff rm ON rm.id = l.roommate_staff_id
        WHERE l.staff_id = ? AND l.deleted_at IS NULL LIMIT 1
    ");
    $lodging->execute([$staffId]);
    $req = $pdo->prepare("SELECT * FROM event_staff_requests WHERE event_plan_staff_id = ? ORDER BY id DESC LIMIT 1");
    $req->execute([$staffId]);
    $request = $req->fetch(PDO::FETCH_ASSOC) ?: null;
    if ($request) {
        $request = eow_shapeRequest($request, true); // admin detail view
        $request['beverages'] = eow_requestBeverages($pdo, (int) $request['id']);
        if (!empty($request['roommate_person_id'])) {
            $p = $pdo->prepare("SELECT display_name FROM persons WHERE id = ?");
            $p->execute([(int) $request['roommate_person_id']]);
            $request['roommate_person_name'] = $p->fetchColumn() ?: null;
        }
    }

    rsa_jsonResponse([
        'staff'    => $s,
        'classes'  => $classes->fetchAll(PDO::FETCH_ASSOC),
        'duties'   => $duties->fetchAll(PDO::FETCH_ASSOC),
        'travel'   => $legs->fetchAll(PDO::FETCH_ASSOC),
        'lodging'  => $lodging->fetch(PDO::FETCH_ASSOC) ?: null,
        'request'  => $request,
    ]);
}

/** Add a class assignment to a confirmed staff row. */
function eow_addStaffClass(PDO $pdo, int $userId, string $role): void {
    eo_requireAdmin($pdo, $userId, $role);
    $b = eo_body();
    $staffId = (int) ($b['staff_id'] ?? 0);
    $s = eow_getStaffOrFail($pdo, $staffId);
    $code = trim((string) ($b['class_code'] ?? ''));
    if ($code === '') eow_fail('class_code required');
    $isPrimary = !empty($b['is_primary']) ? 1 : 0;
    if ($isPrimary) {
        $pdo->prepare("UPDATE event_staff_classes SET is_primary=0 WHERE staff_id=? AND deleted_at IS NULL")->execute([$staffId]);
    }
    $pdo->prepare("INSERT INTO event_staff_classes (staff_id, class_code, is_primary, sort_order) VALUES (?,?,?,?)")
        ->execute([$staffId, $code, $isPrimary, (int) ($b['sort_order'] ?? 0)]);
    rsa_jsonResponse(['success' => true, 'class_id' => (int) $pdo->lastInsertId()], 201);
}

function eow_deleteStaffClass(PDO $pdo, int $userId, string $role): void {
    eo_requireAdmin($pdo, $userId, $role);
    $id = (int) (eo_body()['class_id'] ?? 0);
    if (!$id) eow_fail('class_id required');
    $pdo->prepare("UPDATE event_staff_classes SET deleted_at = ? WHERE id = ?")->execute([date('Y-m-d H:i:s'), $id]);
    rsa_jsonResponse(['success' => true]);
}

/** Add a travel leg (flight segment or drive leg) for a confirmed staff row. */
function eow_addTravelLeg(PDO $pdo, int $userId, string $role): void {
    eo_requireAdmin($pdo, $userId, $role);
    $b = eo_body();
    $staffId = (int) ($b['staff_id'] ?? 0);
    $s = eow_getStaffOrFail($pdo, $staffId);
    $leg  = $b['leg'] ?? 'outbound';
    eo_validateEnum($leg, EOW_TRAVEL_LEGS, 'leg');
    $mode = $b['mode'] ?? '';
    eo_validateEnum($mode, EOW_TRAVEL_MODES, 'mode');
    $carpool = !empty($b['carpool_with_staff_id']) ? (int) $b['carpool_with_staff_id'] : null;
    if ($carpool) {
        $c = eow_getStaffOrFail($pdo, $carpool);
        if ((int) $c['event_plan_id'] !== (int) $s['event_plan_id']) eow_fail('carpool driver must be staff on the same plan');
    }
    $pdo->prepare("
        INSERT INTO event_staff_travel_legs
            (staff_id, leg, mode, airline, flight_number, origin_code, dest_code,
             depart_at, arrive_at, vehicle_desc, carpool_with_staff_id, confirmation, notes)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    ")->execute([
        $staffId, $leg, $mode,
        $b['airline'] ?? null, $b['flight_number'] ?? null,
        $b['origin_code'] ?? null, $b['dest_code'] ?? null,
        eow_dtOrNull($b['depart_at'] ?? null), eow_dtOrNull($b['arrive_at'] ?? null),
        $b['vehicle_desc'] ?? null, $carpool, $b['confirmation'] ?? null, $b['notes'] ?? null,
    ]);
    rsa_jsonResponse(['success' => true, 'leg_id' => (int) $pdo->lastInsertId()], 201);
}

function eow_updateTravelLeg(PDO $pdo, int $userId, string $role): void {
    eo_requireAdmin($pdo, $userId, $role);
    $b = eo_body();
    $id = (int) ($b['leg_id'] ?? 0);
    if (!$id) eow_fail('leg_id required');
    $chk = $pdo->prepare("SELECT staff_id FROM event_staff_travel_legs WHERE id = ? AND deleted_at IS NULL");
    $chk->execute([$id]);
    if (!$chk->fetchColumn()) eow_fail('Travel leg not found', 404);

    $fields = []; $params = [];
    foreach (['airline','flight_number','origin_code','dest_code','vehicle_desc','confirmation','notes'] as $f) {
        if (array_key_exists($f, $b)) { $fields[] = "`$f` = ?"; $params[] = $b[$f] === '' ? null : $b[$f]; }
    }
    foreach (['depart_at','arrive_at'] as $f) {
        if (array_key_exists($f, $b)) { $fields[] = "`$f` = ?"; $params[] = eow_dtOrNull($b[$f]); }
    }
    foreach (['leg','mode'] as $f) {
        if (array_key_exists($f, $b)) {
            eo_validateEnum($b[$f], $f === 'leg' ? EOW_TRAVEL_LEGS : EOW_TRAVEL_MODES, $f);
            $fields[] = "`$f` = ?"; $params[] = $b[$f];
        }
    }
    if (array_key_exists('carpool_with_staff_id', $b)) {
        $fields[] = 'carpool_with_staff_id = ?';
        $params[] = $b['carpool_with_staff_id'] ? (int) $b['carpool_with_staff_id'] : null;
    }
    if (!$fields) eow_fail('No fields to update');
    $params[] = $id;
    $pdo->prepare("UPDATE event_staff_travel_legs SET " . implode(', ', $fields) . " WHERE id = ?")->execute($params);
    rsa_jsonResponse(['success' => true]);
}

function eow_deleteTravelLeg(PDO $pdo, int $userId, string $role): void {
    eo_requireAdmin($pdo, $userId, $role);
    $id = (int) (eo_body()['leg_id'] ?? 0);
    if (!$id) eow_fail('leg_id required');
    $pdo->prepare("UPDATE event_staff_travel_legs SET deleted_at = ? WHERE id = ?")->execute([date('Y-m-d H:i:s'), $id]);
    rsa_jsonResponse(['success' => true]);
}

/** Upsert the lodging record for a confirmed staff row (one per staff). */
function eow_upsertStaffLodging(PDO $pdo, int $userId, string $role): void {
    eo_requireAdmin($pdo, $userId, $role);
    $b = eo_body();
    $staffId = (int) ($b['staff_id'] ?? 0);
    $s = eow_getStaffOrFail($pdo, $staffId);
    $type = $b['type'] ?? '';
    eo_validateEnum($type, EOW_LODGING_TYPES, 'type');
    $roommateStaff = !empty($b['roommate_staff_id']) ? (int) $b['roommate_staff_id'] : null;
    if ($roommateStaff) {
        $rm = eow_getStaffOrFail($pdo, $roommateStaff);
        if ((int) $rm['event_plan_id'] !== (int) $s['event_plan_id']) eow_fail('roommate must be staff on the same plan');
    }

    $chk = $pdo->prepare("SELECT id FROM event_staff_lodging WHERE staff_id = ? AND deleted_at IS NULL");
    $chk->execute([$staffId]);
    $existing = (int) ($chk->fetchColumn() ?: 0);

    $vals = [
        $type, $b['property_name'] ?? null,
        eow_dateOrNull($b['check_in'] ?? null), eow_dateOrNull($b['check_out'] ?? null),
        $b['confirmation'] ?? null, $b['room_number'] ?? null,
        $roommateStaff, $b['roommate_name'] ?? null,
        $b['site_notes'] ?? null, $b['notes'] ?? null,
    ];
    if ($existing) {
        $vals[] = $existing;
        $pdo->prepare("
            UPDATE event_staff_lodging SET type=?, property_name=?, check_in=?, check_out=?,
                confirmation=?, room_number=?, roommate_staff_id=?, roommate_name=?, site_notes=?, notes=?
            WHERE id=?
        ")->execute($vals);
        rsa_jsonResponse(['success' => true, 'lodging_id' => $existing]);
    }
    $pdo->prepare("
        INSERT INTO event_staff_lodging
            (staff_id, type, property_name, check_in, check_out, confirmation, room_number,
             roommate_staff_id, roommate_name, site_notes, notes)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)
    ")->execute([$staffId, ...$vals]);
    rsa_jsonResponse(['success' => true, 'lodging_id' => (int) $pdo->lastInsertId()], 201);
}

/** Aggregate staffing summary for a plan's canonical event — admin only. */
function eow_getStaffingSummary(PDO $pdo, int $userId, string $role): void {
    eo_requireAdmin($pdo, $userId, $role);
    $planId = eo_intParam('plan_id');
    $plan = eo_getPlanOrFail($pdo, $planId);
    $peId = (int) ($plan['parity_event_id'] ?? 0);

    $out = [
        'requests'  => ['requested' => 0, 'confirmed' => 0, 'waitlisted' => 0, 'declined' => 0, 'cancelled' => 0],
        'travel'    => [], 'lodging_intent' => [],
        'beverages' => [], 'dietary_on_file' => 0,
        'coverage'  => [],
    ];

    if ($peId) {
        $rows = $pdo->prepare("SELECT status, travel_intent, lodging_intent, dietary_category FROM event_staff_requests WHERE parity_event_id = ?");
        $rows->execute([$peId]);
        foreach ($rows->fetchAll(PDO::FETCH_ASSOC) as $r) {
            if (isset($out['requests'][$r['status']])) $out['requests'][$r['status']]++;
            if ($r['travel_intent'])  $out['travel'][$r['travel_intent']] = ($out['travel'][$r['travel_intent']] ?? 0) + 1;
            if ($r['lodging_intent']) $out['lodging_intent'][$r['lodging_intent']] = ($out['lodging_intent'][$r['lodging_intent']] ?? 0) + 1;
            if ($r['dietary_category'] && $r['dietary_category'] !== 'none') $out['dietary_on_file']++;
        }
        // Beverage demand = request overrides if present else profile defaults
        $bev = $pdo->prepare("
            SELECT beverage, COUNT(*) AS n FROM (
                SELECT rb.beverage FROM event_staff_request_beverages rb
                JOIN event_staff_requests r ON r.id = rb.request_id
                WHERE r.parity_event_id = ? AND r.status IN ('requested','confirmed','waitlisted')
                UNION ALL
                SELECT wb.beverage FROM event_worker_beverage_prefs wb
                JOIN event_staff_requests r ON r.user_id = wb.user_id
                WHERE r.parity_event_id = ? AND r.status IN ('requested','confirmed','waitlisted')
                  AND NOT EXISTS (SELECT 1 FROM event_staff_request_beverages rb WHERE rb.request_id = r.id)
            ) t GROUP BY beverage ORDER BY n DESC
        ");
        $bev->execute([$peId, $peId]);
        $out['beverages'] = $bev->fetchAll(PDO::FETCH_ASSOC);
    }

    // Function coverage: which suggestion functions have at least one confirmed staff duty
    $cov = $pdo->prepare("
        SELECT DISTINCT d.duty FROM event_plan_staff_duties d
        JOIN event_plan_staff s ON s.id = d.staff_id
        WHERE d.event_plan_id = ? AND d.deleted_at IS NULL AND s.deleted_at IS NULL AND s.is_active = 1
    ");
    $cov->execute([$planId]);
    $out['covered_duties'] = $cov->fetchAll(PDO::FETCH_COLUMN);

    $cnt = $pdo->prepare("SELECT COUNT(*) FROM event_plan_staff WHERE event_plan_id = ? AND deleted_at IS NULL AND is_active = 1");
    $cnt->execute([$planId]);
    $out['staff_count'] = (int) $cnt->fetchColumn();

    rsa_jsonResponse(['summary' => $out]);
}
