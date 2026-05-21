<?php
/**
 * NHRA Tech Divisional Parity API
 *
 * Endpoints:
 *   GET  ?action=listDivEvents         — List divisional events (supports ?year=&division=)
 *   GET  ?action=listDivTracks         — List tracks in div DB
 *   GET  ?action=divEventCategories    — Distinct category/class for a div event
 *   GET  ?action=divRuns               — Query runs from div DB
 *   POST ?action=createDivEvent        — Admin: create divisional event
 *   POST ?action=updateDivEvent        — Admin: update divisional event
 *   POST ?action=ingestDivEventRuns    — Admin: fetch OData + upsert div_runs
 *   POST ?action=ingestDivMany         — Admin: batch ingest [{raceLookup, division}]
 *   POST ?action=scrapeDivSchedule     — Admin: scrape nhra.com divisional schedule pages
 *   POST ?action=suggestDivRaceLookups — Admin: auto-discover historical race lookups by probing OData
 *   POST ?action=backfillDivWeather    — Admin: Open-Meteo backfill for div event
 *   POST ?action=refreshDivEventData   — Admin: timing + weather backfill in one call
 *
 * Auth: nhra.parity capability required for all endpoints.
 */

ini_set('display_errors', '0');
error_reporting(E_ALL);

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/config_div.php';
require_once __DIR__ . '/functions.php';
require_once __DIR__ . '/lib/capabilities.php';
require_once __DIR__ . '/lib/parity.php';

rsa_setCorsHeaders();

$pdo    = getDB();     // main DB (auth/user/capabilities live here)
$pdoDiv = getDivDB();  // divisional DB
$method = $_SERVER['REQUEST_METHOD'];

// ── Auth + capability gate ──────────────────────────────────────────────────
$auth   = rsa_requireAuth();
$userId = rsa_requireAuthAndCap($pdo, $auth, 'nhra.parity');

// ── Routing ──────────────────────────────────────────────────────────────────
$action = $_GET['action'] ?? '';

// Valid division codes
define('DIV_CODES', ['D1','D2','D3','D4','D5','D6','D7','W']);

function requireDivAdminRole(array $auth): void {
    $role = $auth['role'] ?? '';
    if (!in_array($role, ['owner', 'admin'], true)) {
        rsa_jsonResponse(['error' => 'Admin role required'], 403);
    }
}

function validateDivision(string $div): void {
    if (!in_array($div, DIV_CODES, true)) {
        rsa_jsonResponse(['error' => "Invalid division '$div'. Must be D1-D7 or W"], 400);
    }
}

try {
    switch ($action) {

        // ── Read endpoints ──────────────────────────────────────────────────
        case 'listDivEvents':
            if ($method !== 'GET') rsa_jsonResponse(['error' => 'Method not allowed'], 405);
            handleListDivEvents($pdoDiv);
            break;

        case 'listDivTracks':
            if ($method !== 'GET') rsa_jsonResponse(['error' => 'Method not allowed'], 405);
            handleListDivTracks($pdoDiv);
            break;

        case 'divEventCategories':
            if ($method !== 'GET') rsa_jsonResponse(['error' => 'Method not allowed'], 405);
            handleDivEventCategories($pdoDiv);
            break;

        case 'divRuns':
            if ($method !== 'GET') rsa_jsonResponse(['error' => 'Method not allowed'], 405);
            handleDivRuns($pdoDiv);
            break;

        // ── Admin write endpoints ───────────────────────────────────────────
        case 'createDivEvent':
            if ($method !== 'POST') rsa_jsonResponse(['error' => 'Method not allowed'], 405);
            handleCreateDivEvent($pdoDiv, $auth);
            break;

        case 'updateDivEvent':
            if ($method !== 'POST') rsa_jsonResponse(['error' => 'Method not allowed'], 405);
            handleUpdateDivEvent($pdoDiv, $auth);
            break;

        case 'ingestDivEventRuns':
            if ($method !== 'POST') rsa_jsonResponse(['error' => 'Method not allowed'], 405);
            handleIngestDivEventRuns($pdoDiv, $userId, $auth);
            break;

        case 'ingestDivMany':
            if ($method !== 'POST') rsa_jsonResponse(['error' => 'Method not allowed'], 405);
            handleIngestDivMany($pdoDiv, $userId, $auth);
            break;

        case 'scrapeDivSchedule':
            if ($method !== 'POST') rsa_jsonResponse(['error' => 'Method not allowed'], 405);
            handleScrapeDivSchedule($pdoDiv, $userId, $auth);
            break;

        case 'suggestDivRaceLookups':
            if ($method !== 'POST') rsa_jsonResponse(['error' => 'Method not allowed'], 405);
            handleSuggestDivRaceLookups($auth);
            break;

        case 'backfillDivWeather':
            if ($method !== 'POST') rsa_jsonResponse(['error' => 'Method not allowed'], 405);
            handleBackfillDivWeather($pdoDiv, $auth);
            break;

        case 'refreshDivEventData':
            if ($method !== 'POST') rsa_jsonResponse(['error' => 'Method not allowed'], 405);
            handleRefreshDivEventData($pdoDiv, $userId, $auth);
            break;

        default:
            rsa_jsonResponse(['error' => "Unknown action: $action"], 400);
    }
} catch (PDOException $e) {
    error_log("parity_div.php PDOException: " . $e->getMessage());
    rsa_jsonResponse(['error' => 'Database error'], 500);
} catch (Exception $e) {
    error_log("parity_div.php Exception: " . $e->getMessage());
    rsa_jsonResponse(['error' => $e->getMessage()], 500);
}

// ============================================================================
// GET ?action=listDivEvents[&year=2026][&division=D2]
// ============================================================================

function handleListDivEvents(PDO $pdoDiv): void {
    $year     = isset($_GET['year'])     ? (int)$_GET['year']              : null;
    $division = isset($_GET['division']) ? strtoupper(trim($_GET['division'])) : null;

    $where = [];
    $params = [];

    if ($year) {
        $where[] = 'e.season_year = ?';
        $params[] = $year;
    }
    if ($division) {
        validateDivision($division);
        $where[] = 'e.nhra_division = ?';
        $params[] = $division;
    }

    $whereClause = $where ? 'WHERE ' . implode(' AND ', $where) : '';

    $stmt = $pdoDiv->prepare("
        SELECT e.id, e.event_name, e.season_year, e.nhra_division, e.race_lookup,
               e.start_date_local, e.end_date_local, e.event_code,
               t.id AS track_id, t.track_name, t.timezone_iana, t.city, t.state,
               t.latitude, t.longitude,
               COUNT(r.id) AS run_count,
               MAX(ri.fetched_at_utc) AS last_imported_at
        FROM div_events e
        JOIN div_tracks t ON t.id = e.track_id
        LEFT JOIN div_runs r ON r.race_lookup = e.race_lookup AND r.nhra_division = e.nhra_division
        LEFT JOIN div_run_imports ri ON ri.race_lookup = e.race_lookup AND ri.nhra_division = e.nhra_division AND ri.status = 'success'
        $whereClause
        GROUP BY e.id
        ORDER BY e.start_date_local DESC, e.nhra_division
    ");
    $stmt->execute($params);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    foreach ($rows as &$r) {
        $r['run_count'] = (int)$r['run_count'];
        $r['track_id']  = (int)$r['track_id'];
    }

    rsa_jsonResponse(['events' => $rows]);
}

// ============================================================================
// GET ?action=listDivTracks
// ============================================================================

function handleListDivTracks(PDO $pdoDiv): void {
    $rows = $pdoDiv->query("
        SELECT id, track_name, timezone_iana, city, state, zip, latitude, longitude, nhra_division
        FROM div_tracks
        ORDER BY track_name
    ")->fetchAll(PDO::FETCH_ASSOC);

    foreach ($rows as &$r) { $r['id'] = (int)$r['id']; }
    rsa_jsonResponse(['tracks' => $rows]);
}

// ============================================================================
// GET ?action=divEventCategories&eventId=N
// ============================================================================

function handleDivEventCategories(PDO $pdoDiv): void {
    $eventId = (int)($_GET['eventId'] ?? 0);
    if ($eventId <= 0) rsa_jsonResponse(['error' => 'eventId is required'], 400);

    $ev = $pdoDiv->prepare("SELECT race_lookup, nhra_division FROM div_events WHERE id = ?");
    $ev->execute([$eventId]);
    $event = $ev->fetch(PDO::FETCH_ASSOC);
    if (!$event) rsa_jsonResponse(['error' => "Event $eventId not found"], 404);

    $stmt = $pdoDiv->prepare("
        SELECT category, class_index, COUNT(*) AS run_count
        FROM div_runs
        WHERE race_lookup = ? AND nhra_division = ? AND class_index IS NOT NULL AND class_index != ''
        GROUP BY category, class_index
        ORDER BY category, class_index
    ");
    $stmt->execute([$event['race_lookup'], $event['nhra_division']]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    foreach ($rows as &$r) { $r['run_count'] = (int)$r['run_count']; }

    rsa_jsonResponse(['eventId' => $eventId, 'categories' => $rows]);
}

// ============================================================================
// GET ?action=divRuns&eventId=N[&classIndex=&round=&driverName=&limit=&offset=]
// ============================================================================

function handleDivRuns(PDO $pdoDiv): void {
    $eventId    = (int)($_GET['eventId'] ?? 0);
    $classIndex = trim($_GET['classIndex'] ?? '');
    $round      = trim($_GET['round'] ?? '');
    $driverName = trim($_GET['driverName'] ?? '');
    $limit      = min(500, max(1, (int)($_GET['limit'] ?? 200)));
    $offset     = max(0, (int)($_GET['offset'] ?? 0));

    if ($eventId <= 0) rsa_jsonResponse(['error' => 'eventId is required'], 400);

    $ev = $pdoDiv->prepare("SELECT race_lookup, nhra_division FROM div_events WHERE id = ?");
    $ev->execute([$eventId]);
    $event = $ev->fetch(PDO::FETCH_ASSOC);
    if (!$event) rsa_jsonResponse(['error' => "Event $eventId not found"], 404);

    $where = ['race_lookup = ?', 'nhra_division = ?'];
    $params = [$event['race_lookup'], $event['nhra_division']];

    if ($classIndex) { $where[] = 'class_index = ?'; $params[] = $classIndex; }
    if ($round)      { $where[] = 'round = ?';       $params[] = $round; }
    if ($driverName) { $where[] = 'driver_name LIKE ?'; $params[] = "%$driverName%"; }

    $whereClause = 'WHERE ' . implode(' AND ', $where);
    $params[] = $limit;
    $params[] = $offset;

    $stmt = $pdoDiv->prepare("
        SELECT id, uuid, race_lookup, nhra_division, run_timestamp_utc, run_time_local,
               category, class_index, round, lane, driver_name, car_number,
               dial_in, rt, ft60, ft330, ft660, mph660, ft1000, mph1000, ft1320, mph1320,
               win_flag, dq_flag, mov, place
        FROM div_runs
        $whereClause
        ORDER BY run_timestamp_utc, class_index, round, lane
        LIMIT ? OFFSET ?
    ");
    $stmt->execute($params);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    rsa_jsonResponse(['runs' => $rows, 'count' => count($rows)]);
}

// ============================================================================
// POST ?action=createDivEvent
// Body: { eventName, trackName, startDateLocal, endDateLocal, division, seasonYear?, eventCode?, timezoneIana? }
// ============================================================================

function handleCreateDivEvent(PDO $pdoDiv, array $auth): void {
    requireDivAdminRole($auth);
    $input = rsa_getJsonInput();

    $eventName  = trim($input['eventName'] ?? '');
    $trackName  = trim($input['trackName'] ?? '');
    $startDate  = trim($input['startDateLocal'] ?? '');
    $endDate    = trim($input['endDateLocal'] ?? '');
    $division   = strtoupper(trim($input['division'] ?? ''));
    $seasonYear = isset($input['seasonYear']) ? (int)$input['seasonYear'] : (int)substr($startDate, 0, 4);
    $eventCode  = trim($input['eventCode'] ?? '') ?: null;
    $tz         = trim($input['timezoneIana'] ?? 'America/New_York');

    if (!$eventName) rsa_jsonResponse(['error' => 'eventName is required'], 400);
    if (!$trackName) rsa_jsonResponse(['error' => 'trackName is required'], 400);
    if (!$startDate) rsa_jsonResponse(['error' => 'startDateLocal is required'], 400);
    if (!$endDate)   rsa_jsonResponse(['error' => 'endDateLocal is required'], 400);
    validateDivision($division);

    // Upsert track
    $stmtFindTrack = $pdoDiv->prepare("SELECT id FROM div_tracks WHERE track_name = ?");
    $stmtFindTrack->execute([$trackName]);
    $track = $stmtFindTrack->fetch(PDO::FETCH_ASSOC);

    if (!$track) {
        $pdoDiv->prepare("INSERT INTO div_tracks (track_name, timezone_iana, nhra_division) VALUES (?, ?, ?)")
               ->execute([$trackName, $tz, $division]);
        $trackId = (int)$pdoDiv->lastInsertId();
    } else {
        $trackId = (int)$track['id'];
    }

    $raceLookup = str_replace('-', '', $startDate);

    try {
        $pdoDiv->prepare("
            INSERT INTO div_events (event_name, track_id, start_date_local, end_date_local, race_lookup, season_year, nhra_division, event_code)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ")->execute([$eventName, $trackId, $startDate, $endDate, $raceLookup, $seasonYear, $division, $eventCode]);
        $id = (int)$pdoDiv->lastInsertId();
        rsa_jsonResponse(['id' => $id, 'raceLookup' => $raceLookup, 'division' => $division]);
    } catch (PDOException $e) {
        if (strpos($e->getMessage(), 'Duplicate') !== false) {
            rsa_jsonResponse(['error' => "Event with race_lookup $raceLookup and division $division already exists"], 409);
        }
        throw $e;
    }
}

// ============================================================================
// POST ?action=updateDivEvent
// Body: { id, eventName?, startDateLocal?, endDateLocal?, division?, seasonYear?, eventCode? }
// ============================================================================

function handleUpdateDivEvent(PDO $pdoDiv, array $auth): void {
    requireDivAdminRole($auth);
    $input = rsa_getJsonInput();

    $id = (int)($input['id'] ?? 0);
    if ($id <= 0) rsa_jsonResponse(['error' => 'id is required'], 400);

    $existing = $pdoDiv->prepare("SELECT * FROM div_events WHERE id = ?");
    $existing->execute([$id]);
    $ev = $existing->fetch(PDO::FETCH_ASSOC);
    if (!$ev) rsa_jsonResponse(['error' => "Event $id not found"], 404);

    $eventName  = trim($input['eventName'] ?? $ev['event_name']);
    $startDate  = trim($input['startDateLocal'] ?? $ev['start_date_local']);
    $endDate    = trim($input['endDateLocal'] ?? $ev['end_date_local']);
    $division   = strtoupper(trim($input['division'] ?? $ev['nhra_division']));
    $seasonYear = isset($input['seasonYear']) ? (int)$input['seasonYear'] : (int)$ev['season_year'];
    $eventCode  = array_key_exists('eventCode', $input) ? (trim($input['eventCode']) ?: null) : $ev['event_code'];

    validateDivision($division);

    $pdoDiv->prepare("
        UPDATE div_events
        SET event_name = ?, start_date_local = ?, end_date_local = ?,
            nhra_division = ?, season_year = ?, event_code = ?
        WHERE id = ?
    ")->execute([$eventName, $startDate, $endDate, $division, $seasonYear, $eventCode, $id]);

    rsa_jsonResponse(['ok' => true, 'id' => $id]);
}

// ============================================================================
// POST ?action=ingestDivEventRuns
// Body: { eventId: int, force?: bool }
// ============================================================================

function handleIngestDivEventRuns(PDO $pdoDiv, int $userId, array $auth): void {
    requireDivAdminRole($auth);
    $input = rsa_getJsonInput();

    $eventId = (int)($input['eventId'] ?? 0);
    $force   = (bool)($input['force'] ?? false);

    if ($eventId <= 0) rsa_jsonResponse(['error' => 'eventId is required'], 400);

    $ev = $pdoDiv->prepare("
        SELECT e.id, e.race_lookup, e.nhra_division, t.timezone_iana
        FROM div_events e
        JOIN div_tracks t ON t.id = e.track_id
        WHERE e.id = ?
    ");
    $ev->execute([$eventId]);
    $event = $ev->fetch(PDO::FETCH_ASSOC);
    if (!$event) rsa_jsonResponse(['error' => "Event $eventId not found"], 404);

    $raceLookup = $event['race_lookup'];
    $division   = $event['nhra_division'];
    $trackTz    = $event['timezone_iana'];

    if (!preg_match('/^\d{8}$/', $raceLookup)) {
        rsa_jsonResponse(['error' => "Event has no valid race_lookup: $raceLookup"], 400);
    }

    // Check for existing import
    if (!$force) {
        $chk = $pdoDiv->prepare("
            SELECT uuid, row_count, fetched_at_utc
            FROM div_run_imports
            WHERE race_lookup = ? AND nhra_division = ? AND status = 'success' AND row_count > 0
            ORDER BY fetched_at_utc DESC LIMIT 1
        ");
        $chk->execute([$raceLookup, $division]);
        $existing = $chk->fetch(PDO::FETCH_ASSOC);
        if ($existing) {
            rsa_jsonResponse([
                'skipped'         => true,
                'raceLookup'      => $raceLookup,
                'division'        => $division,
                'existingImportId' => $existing['uuid'],
                'existingRowCount' => (int)$existing['row_count'],
                'message'         => 'Already imported. Use force=true to re-import.',
            ]);
            return;
        }
    }

    $requestedAt = gmdate('Y-m-d H:i:s');
    $importUuid  = parity_generateUUID();

    try {
        $result = parity_fetchODataResultsDiv($raceLookup, $division);
        $rows   = $result['rows'];
        $sourceUrl = $result['url'];
    } catch (Exception $e) {
        $pdoDiv->prepare("
            INSERT INTO div_run_imports (uuid, race_lookup, nhra_division, requested_at_utc, fetched_at_utc, status, row_count, error_message, source_url, created_by_user_id)
            VALUES (?, ?, ?, ?, ?, 'error', 0, ?, ?, ?)
        ")->execute([$importUuid, $raceLookup, $division, $requestedAt, gmdate('Y-m-d H:i:s'), $e->getMessage(), "odata/$raceLookup?eventType=$division", $userId]);
        rsa_jsonResponse(['error' => 'OData fetch failed: ' . $e->getMessage()], 502);
        return;
    }

    $fetchedAt = gmdate('Y-m-d H:i:s');
    $pdoDiv->prepare("
        INSERT INTO div_run_imports (uuid, race_lookup, nhra_division, requested_at_utc, fetched_at_utc, status, row_count, source_url, created_by_user_id)
        VALUES (?, ?, ?, ?, ?, 'success', ?, ?, ?)
    ")->execute([$importUuid, $raceLookup, $division, $requestedAt, $fetchedAt, count($rows), $sourceUrl, $userId]);
    $importId = (int)$pdoDiv->lastInsertId();

    $inserted = 0; $updated = 0; $skipped = 0;

    foreach ($rows as $raw) {
        $normalized = parity_normalizeRow($raw, $raceLookup);
        $rowHash    = parity_computeRowHash($raceLookup, $normalized, $raw);
        $localTime  = $normalized['run_timestamp_utc'];
        $utcTime    = ($localTime !== null) ? parity_localToUtc($localTime, $trackTz) : null;

        $res = divUpsertRun($pdoDiv, $normalized, $rowHash, $importId, $raceLookup, $division, $utcTime, $localTime);
        if ($res === 'inserted') $inserted++;
        elseif ($res === 'updated') $updated++;
        else $skipped++;
    }

    $pdoDiv->prepare("UPDATE div_run_imports SET row_count = ? WHERE id = ?")->execute([$inserted, $importId]);

    rsa_jsonResponse([
        'raceLookup'   => $raceLookup,
        'division'     => $division,
        'importId'     => $importUuid,
        'rowsFetched'  => count($rows),
        'rowsInserted' => $inserted,
        'rowsUpdated'  => $updated,
        'rowsDeduped'  => $updated + $skipped,
    ]);
}

// ============================================================================
// POST ?action=ingestDivMany
// Body: { items: [{raceLookup, division}], force?: bool, throttleMs?: int }
// ============================================================================

function handleIngestDivMany(PDO $pdoDiv, int $userId, array $auth): void {
    requireDivAdminRole($auth);
    $input = rsa_getJsonInput();

    $items      = $input['items'] ?? [];
    $force      = (bool)($input['force'] ?? false);
    $throttleMs = max(500, min(5000, (int)($input['throttleMs'] ?? 1000)));

    if (!is_array($items) || empty($items)) {
        rsa_jsonResponse(['error' => 'items must be a non-empty array of {raceLookup, division} objects'], 400);
    }
    if (count($items) > 100) {
        rsa_jsonResponse(['error' => 'Maximum 100 items per batch'], 400);
    }

    foreach ($items as $item) {
        if (!preg_match('/^\d{8}$/', $item['raceLookup'] ?? '')) {
            rsa_jsonResponse(['error' => "Invalid raceLookup: " . ($item['raceLookup'] ?? 'null')], 400);
        }
        validateDivision(strtoupper(trim($item['division'] ?? '')));
    }

    set_time_limit(600);
    $results = [];

    foreach ($items as $idx => $item) {
        $raceLookup = $item['raceLookup'];
        $division   = strtoupper(trim($item['division']));

        $entry = ['raceLookup' => $raceLookup, 'division' => $division, 'rowsFetched' => 0, 'rowsInserted' => 0, 'status' => 'pending'];

        // Resolve track timezone from matching event (if exists), else default
        $tzStmt = $pdoDiv->prepare("
            SELECT t.timezone_iana FROM div_events e
            JOIN div_tracks t ON t.id = e.track_id
            WHERE e.race_lookup = ? AND e.nhra_division = ? LIMIT 1
        ");
        $tzStmt->execute([$raceLookup, $division]);
        $tzRow   = $tzStmt->fetch(PDO::FETCH_ASSOC);
        $trackTz = ($tzRow && !empty($tzRow['timezone_iana'])) ? $tzRow['timezone_iana'] : 'America/New_York';

        // Auto-create placeholder event if no event exists for this raceLookup+division
        if (!$tzRow) {
            $evChk = $pdoDiv->prepare("SELECT id FROM div_events WHERE race_lookup = ? AND nhra_division = ?");
            $evChk->execute([$raceLookup, $division]);
            if (!$evChk->fetch()) {
                // Derive date from raceLookup YYYYMMDD
                $dateStr = substr($raceLookup, 0, 4) . '-' . substr($raceLookup, 4, 2) . '-' . substr($raceLookup, 6, 2);
                $year    = (int)substr($raceLookup, 0, 4);
                // Find or create a generic placeholder track for this division
                $phTrackName = "Unknown Track ({$division})";
                $trk = $pdoDiv->prepare("SELECT id FROM div_tracks WHERE track_name = ?");
                $trk->execute([$phTrackName]);
                $trkRow = $trk->fetch(PDO::FETCH_ASSOC);
                if ($trkRow) {
                    $placeholderTrackId = (int)$trkRow['id'];
                } else {
                    $pdoDiv->prepare("INSERT INTO div_tracks (track_name, timezone_iana, nhra_division) VALUES (?, 'America/New_York', ?)")
                           ->execute([$phTrackName, $division]);
                    $placeholderTrackId = (int)$pdoDiv->lastInsertId();
                }
                $pdoDiv->prepare("
                    INSERT INTO div_events (event_name, season_year, track_id, start_date_local, end_date_local, race_lookup, nhra_division)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                ")->execute(["{$division} Event {$dateStr}", $year, $placeholderTrackId, $dateStr, $dateStr, $raceLookup, $division]);
            }
        }

        if (!$force) {
            $chk = $pdoDiv->prepare("
                SELECT uuid FROM div_run_imports
                WHERE race_lookup = ? AND nhra_division = ? AND status = 'success' AND row_count > 0
                ORDER BY fetched_at_utc DESC LIMIT 1
            ");
            $chk->execute([$raceLookup, $division]);
            if ($chk->fetch()) {
                $entry['status'] = 'skipped';
                $entry['reason'] = 'already imported';
                $results[] = $entry;
                continue;
            }
        }

        $requestedAt = gmdate('Y-m-d H:i:s');
        $importUuid  = parity_generateUUID();

        try {
            $result    = parity_fetchODataResultsDiv($raceLookup, $division);
            $rows      = $result['rows'];
            $sourceUrl = $result['url'];
        } catch (Exception $e) {
            $pdoDiv->prepare("
                INSERT INTO div_run_imports (uuid, race_lookup, nhra_division, requested_at_utc, fetched_at_utc, status, row_count, error_message, source_url, created_by_user_id)
                VALUES (?, ?, ?, ?, ?, 'error', 0, ?, ?, ?)
            ")->execute([$importUuid, $raceLookup, $division, $requestedAt, gmdate('Y-m-d H:i:s'), $e->getMessage(), "odata/$raceLookup", $userId]);
            $entry['status'] = 'error';
            $entry['error']  = $e->getMessage();
            $results[] = $entry;
            if ($idx < count($items) - 1) usleep($throttleMs * 1000);
            continue;
        }

        $entry['rowsFetched'] = count($rows);

        if (empty($rows)) {
            $pdoDiv->prepare("
                INSERT INTO div_run_imports (uuid, race_lookup, nhra_division, requested_at_utc, fetched_at_utc, status, row_count, source_url, created_by_user_id)
                VALUES (?, ?, ?, ?, ?, 'success', 0, ?, ?)
            ")->execute([$importUuid, $raceLookup, $division, $requestedAt, gmdate('Y-m-d H:i:s'), $sourceUrl, $userId]);
            $entry['status'] = 'empty';
            $results[] = $entry;
            if ($idx < count($items) - 1) usleep($throttleMs * 1000);
            continue;
        }

        $fetchedAt = gmdate('Y-m-d H:i:s');
        $pdoDiv->prepare("
            INSERT INTO div_run_imports (uuid, race_lookup, nhra_division, requested_at_utc, fetched_at_utc, status, row_count, source_url, created_by_user_id)
            VALUES (?, ?, ?, ?, ?, 'success', ?, ?, ?)
        ")->execute([$importUuid, $raceLookup, $division, $requestedAt, $fetchedAt, count($rows), $sourceUrl, $userId]);
        $importId = (int)$pdoDiv->lastInsertId();

        $inserted = 0; $updated = 0; $skipped = 0;
        foreach ($rows as $raw) {
            $normalized = parity_normalizeRow($raw, $raceLookup);
            $rowHash    = parity_computeRowHash($raceLookup, $normalized, $raw);
            $localTime  = $normalized['run_timestamp_utc'];
            $utcTime    = ($localTime !== null) ? parity_localToUtc($localTime, $trackTz) : null;
            $res = divUpsertRun($pdoDiv, $normalized, $rowHash, $importId, $raceLookup, $division, $utcTime, $localTime);
            if ($res === 'inserted') $inserted++;
            elseif ($res === 'updated') $updated++;
            else $skipped++;
        }

        $pdoDiv->prepare("UPDATE div_run_imports SET row_count = ? WHERE id = ?")->execute([$inserted, $importId]);

        $entry['rowsInserted'] = $inserted;
        $entry['rowsUpdated']  = $updated;
        $entry['rowsDeduped']  = $updated + $skipped;
        $entry['status']       = 'success';
        $results[] = $entry;

        if ($idx < count($items) - 1) usleep($throttleMs * 1000);
    }

    $summary = [
        'total'             => count($results),
        'success'           => count(array_filter($results, fn($r) => $r['status'] === 'success')),
        'skipped'           => count(array_filter($results, fn($r) => $r['status'] === 'skipped')),
        'empty'             => count(array_filter($results, fn($r) => $r['status'] === 'empty')),
        'error'             => count(array_filter($results, fn($r) => $r['status'] === 'error')),
        'totalRowsInserted' => array_sum(array_column($results, 'rowsInserted')),
    ];

    rsa_jsonResponse(['summary' => $summary, 'results' => $results]);
}

// ============================================================================
// POST ?action=scrapeDivSchedule
// Body: { yearStart: int, yearEnd: int, throttleMs?: int, force?: bool }
// Scrapes https://www.nhra.com/{YEAR}-lucas-oil-divisional-series-schedule
// ============================================================================

function handleScrapeDivSchedule(PDO $pdoDiv, int $userId, array $auth): void {
    requireDivAdminRole($auth);
    $input = rsa_getJsonInput();

    $yearStart  = (int)($input['yearStart'] ?? 0);
    $yearEnd    = (int)($input['yearEnd'] ?? 0);
    $throttleMs = max(500, min(5000, (int)($input['throttleMs'] ?? 1000)));
    $force      = (bool)($input['force'] ?? false);

    if ($yearStart < 2018 || $yearEnd > 2030 || $yearStart > $yearEnd) {
        rsa_jsonResponse(['error' => 'yearStart/yearEnd must be 2018-2030'], 400);
    }

    $startedAt        = gmdate('Y-m-d H:i:s');
    $years            = range($yearStart, $yearEnd);
    $totalEventsUpserted = 0;
    $totalTracksUpserted = 0;
    $errors           = [];

    $stmtFindTrack   = $pdoDiv->prepare("SELECT id FROM div_tracks WHERE track_name = ?");
    $stmtInsertTrack = $pdoDiv->prepare("INSERT INTO div_tracks (track_name, timezone_iana, city, state, nhra_division) VALUES (?, ?, ?, ?, ?)");
    $stmtFindEvent   = $pdoDiv->prepare("SELECT id FROM div_events WHERE race_lookup = ? AND nhra_division = ?");
    $stmtInsertEvent = $pdoDiv->prepare("
        INSERT INTO div_events (event_name, season_year, track_id, start_date_local, end_date_local, race_lookup, nhra_division)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ");
    $stmtUpdateEvent = $pdoDiv->prepare("
        UPDATE div_events SET event_name = ?, season_year = ?, track_id = ?,
            start_date_local = ?, end_date_local = ?
        WHERE race_lookup = ? AND nhra_division = ?
    ");

    foreach ($years as $year) {
        // Try primary URL pattern, then fallback
        $urls = [
            "https://www.nhra.com/{$year}-lucas-oil-divisional-series-schedule",
            "https://www.nhra.com/lucas-oil-divisional-series-schedule/{$year}",
        ];
        $html = false;
        foreach ($urls as $url) {
            $html = parity_httpGet($url);
            if ($html !== false) break;
        }

        if ($html === false) {
            $errors[] = "Year $year: all URL patterns returned no response";
            continue;
        }

        $events = parseDivScheduleHtml($html, $year);

        if (empty($events)) {
            $errors[] = "Year $year: no events parsed from schedule page";
            continue;
        }

        foreach ($events as $ev) {
            try {
                $stmtFindTrack->execute([$ev['trackName']]);
                $track = $stmtFindTrack->fetch(PDO::FETCH_ASSOC);

                if (!$track) {
                    $tzInfo = stateToTimezoneDiv($ev['state'] ?? '');
                    $stmtInsertTrack->execute([$ev['trackName'], $tzInfo['tz'], $ev['city'] ?? null, $ev['state'] ?? null, $ev['division']]);
                    $trackId = (int)$pdoDiv->lastInsertId();
                    $totalTracksUpserted++;
                } else {
                    $trackId = (int)$track['id'];
                }

                $raceLookup = str_replace('-', '', $ev['startDateLocal']);

                $stmtFindEvent->execute([$raceLookup, $ev['division']]);
                $existing = $stmtFindEvent->fetch(PDO::FETCH_ASSOC);

                if (!$existing) {
                    $stmtInsertEvent->execute([
                        $ev['eventName'], $year, $trackId,
                        $ev['startDateLocal'], $ev['endDateLocal'],
                        $raceLookup, $ev['division'],
                    ]);
                } else {
                    $stmtUpdateEvent->execute([
                        $ev['eventName'], $year, $trackId,
                        $ev['startDateLocal'], $ev['endDateLocal'],
                        $raceLookup, $ev['division'],
                    ]);
                }
                $totalEventsUpserted++;
            } catch (PDOException $e) {
                $errors[] = "Event '{$ev['eventName']}' ($year): " . $e->getMessage();
            }
        }

        if ($year < $yearEnd) usleep($throttleMs * 1000);
    }

    $endedAt = gmdate('Y-m-d H:i:s');
    $pdoDiv->prepare("
        INSERT INTO div_scrape_logs (started_at, ended_at, years, events_upserted, tracks_upserted, errors_json, created_by_user_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ")->execute([$startedAt, $endedAt, json_encode($years), $totalEventsUpserted, $totalTracksUpserted, json_encode($errors), $userId]);

    rsa_jsonResponse([
        'yearsScraped'     => $years,
        'eventsUpserted'   => $totalEventsUpserted,
        'tracksUpserted'   => $totalTracksUpserted,
        'errors'           => $errors,
    ]);
}

// ============================================================================
// POST ?action=suggestDivRaceLookups
// Body: { division: string, startDate: YYYY-MM-DD, endDate?: YYYY-MM-DD,
//         maxProbes?: int, throttleMs?: int }
// Auto-discovers valid race lookups by probing the OData API.
// Throttled. Returns { found: [{raceLookup, division, rowCount}], nextStartDate, probed }
// ============================================================================

function handleSuggestDivRaceLookups(array $auth): void {
    requireDivAdminRole($auth);
    $input = rsa_getJsonInput();

    $division   = strtoupper(trim($input['division'] ?? ''));
    $startDate  = trim($input['startDate'] ?? '2018-03-01');
    $endDate    = trim($input['endDate'] ?? date('Y-12-31'));
    $maxProbes  = min(200, max(10, (int)($input['maxProbes'] ?? 100)));
    $throttleMs = max(800, min(3000, (int)($input['throttleMs'] ?? 1000)));

    validateDivision($division);

    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $startDate) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $endDate)) {
        rsa_jsonResponse(['error' => 'startDate and endDate must be YYYY-MM-DD'], 400);
    }

    set_time_limit(600);

    // Generate candidate dates: Fridays and Saturdays within NHRA season (Mar–Oct)
    // between startDate and endDate (exclusive of future dates)
    $today     = new DateTime('today');
    $current   = new DateTime($startDate);
    $end       = new DateTime(min($endDate, $today->format('Y-m-d')));

    $candidates = [];
    while ($current <= $end) {
        $dow = (int)$current->format('N'); // 1=Mon...7=Sun
        $mon = (int)$current->format('n'); // month
        // NHRA divisional season: March–October; probe Fri/Sat/Sun
        if ($mon >= 3 && $mon <= 10 && in_array($dow, [5, 6, 7])) {
            $candidates[] = $current->format('Ymd');
        }
        $current->modify('+1 day');
    }

    $found       = [];
    $probed      = 0;
    $nextStartDate = null;

    foreach ($candidates as $i => $raceLookup) {
        if ($probed >= $maxProbes) {
            // Return a resume cursor for the next call
            $nextStartDate = substr($raceLookup, 0, 4) . '-' . substr($raceLookup, 4, 2) . '-' . substr($raceLookup, 6, 2);
            break;
        }

        $result = parity_probeDivOData($raceLookup, $division);
        $probed++;

        if ($result['reachable'] && $result['rowCount'] > 0) {
            $found[] = [
                'raceLookup' => $raceLookup,
                'division'   => $division,
                'rowCount'   => $result['rowCount'],
            ];
        }

        if ($i < count($candidates) - 1) usleep($throttleMs * 1000);
    }

    rsa_jsonResponse([
        'division'      => $division,
        'found'         => $found,
        'probed'        => $probed,
        'nextStartDate' => $nextStartDate,
    ]);
}

// ============================================================================
// POST ?action=backfillDivWeather
// Body: { eventId: int, throttleMs?: int }
// Open-Meteo only — no Tempest for divisional events.
// ============================================================================

function handleBackfillDivWeather(PDO $pdoDiv, array $auth): void {
    requireDivAdminRole($auth);
    $input = rsa_getJsonInput();

    $eventId    = (int)($input['eventId'] ?? 0);
    if ($eventId <= 0) rsa_jsonResponse(['error' => 'eventId is required'], 400);

    $evStmt = $pdoDiv->prepare("
        SELECT e.id, e.event_name, e.start_date_local, e.end_date_local,
               t.id AS track_id, t.timezone_iana, t.latitude, t.longitude
        FROM div_events e
        JOIN div_tracks t ON t.id = e.track_id
        WHERE e.id = ?
    ");
    $evStmt->execute([$eventId]);
    $event = $evStmt->fetch(PDO::FETCH_ASSOC);
    if (!$event) rsa_jsonResponse(['error' => "Event $eventId not found"], 404);

    $lat = (float)($event['latitude'] ?? 0);
    $lon = (float)($event['longitude'] ?? 0);
    if ($lat === 0.0 && $lon === 0.0) {
        rsa_jsonResponse(['error' => 'Track has no lat/lon coordinates — add them first'], 400);
    }

    $tz         = $event['timezone_iana'];
    $startLocal = $event['start_date_local'];
    $endLocal   = $event['end_date_local'] ?: (new DateTime($startLocal))->modify('+3 days')->format('Y-m-d');

    // Cap to today
    $todayLocal = (new DateTime('now', new DateTimeZone($tz)))->format('Y-m-d');
    if ($endLocal > $todayLocal) $endLocal = $todayLocal;

    // Build UTC range
    $tzObj    = new DateTimeZone($tz);
    $startDt  = new DateTimeImmutable("$startLocal 00:00:00", $tzObj);
    $endDt    = new DateTimeImmutable("$endLocal 23:59:59", $tzObj);
    $startUtc = $startDt->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s');
    $endUtc   = $endDt->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s');

    // Fetch from Open-Meteo
    $samples = divFetchOpenMeteo($lat, $lon, $startUtc, $endUtc);

    $stmtInsert = $pdoDiv->prepare("
        INSERT INTO div_weather_samples
            (timestamp_utc, event_id, track_id, event_local_time, temp_c, temp_f, rh_pct, station_pressure_raw, wind_speed_mph, wind_dir_deg, source)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ");

    $inserted = 0; $deduped = 0; $errors = [];

    foreach ($samples as $s) {
        try {
            $utcDt   = new DateTimeImmutable($s['timestampUtc'], new DateTimeZone('UTC'));
            $localDt = $utcDt->setTimezone(new DateTimeZone($tz));
            $localStr = $localDt->format('Y-m-d H:i:s');
            $tsUtcFmt = $utcDt->format('Y-m-d H:i:s');

            $tempC        = ($s['tempF'] - 32) * 5.0 / 9.0;
            $pressureMbar = $s['baroInHg'] / 0.02953;

            $stmtInsert->execute([
                $tsUtcFmt, $eventId, (int)$event['track_id'], $localStr,
                round($tempC, 4), round($s['tempF'], 4), round($s['humidityPct'], 2), round($pressureMbar, 4),
                isset($s['windSpeedMph']) ? round($s['windSpeedMph'], 2) : null,
                isset($s['windDirDeg']) ? (int)$s['windDirDeg'] : null,
                'open_meteo',
            ]);
            $inserted++;
        } catch (PDOException $e) {
            if (strpos($e->getMessage(), 'Duplicate') !== false) {
                $deduped++;
            } else {
                $errors[] = $e->getMessage();
            }
        }
    }

    // Rebuild canonical
    divRebuildCanonicalRange($pdoDiv, $startUtc, $endUtc, $eventId, (int)$event['track_id'], $tz);

    rsa_jsonResponse([
        'ok'       => true,
        'eventId'  => $eventId,
        'inserted' => $inserted,
        'deduped'  => $deduped,
        'errors'   => $errors,
    ]);
}

// ============================================================================
// POST ?action=refreshDivEventData
// Body: { eventId: int }
// Orchestrates: timing ingest → Open-Meteo backfill → canonical rebuild
// ============================================================================

function handleRefreshDivEventData(PDO $pdoDiv, int $userId, array $auth): void {
    requireDivAdminRole($auth);
    $input   = rsa_getJsonInput();
    $eventId = (int)($input['eventId'] ?? 0);
    if ($eventId <= 0) rsa_jsonResponse(['error' => 'eventId is required'], 400);

    set_time_limit(600);
    $t0 = microtime(true);

    $evStmt = $pdoDiv->prepare("
        SELECT e.id, e.event_name, e.race_lookup, e.nhra_division, e.start_date_local, e.end_date_local,
               t.id AS track_id, t.timezone_iana, t.latitude, t.longitude
        FROM div_events e
        JOIN div_tracks t ON t.id = e.track_id
        WHERE e.id = ?
    ");
    $evStmt->execute([$eventId]);
    $event = $evStmt->fetch(PDO::FETCH_ASSOC);
    if (!$event) rsa_jsonResponse(['error' => "Event $eventId not found"], 404);

    $tz         = $event['timezone_iana'];
    $raceLookup = $event['race_lookup'];
    $division   = $event['nhra_division'];
    $startLocal = $event['start_date_local'];
    $endLocal   = $event['end_date_local'] ?: (new DateTime($startLocal))->modify('+3 days')->format('Y-m-d');
    $todayLocal = (new DateTime('now', new DateTimeZone($tz)))->format('Y-m-d');
    if ($endLocal > $todayLocal) $endLocal = $todayLocal;

    // ── Step 1: Timing ingest ─────────────────────────────────────────────
    $timingResult = ['fetched' => 0, 'inserted' => 0, 'updated' => 0, 'errors' => []];

    if (preg_match('/^\d{8}$/', $raceLookup)) {
        try {
            $odataResult = parity_fetchODataResultsDiv($raceLookup, $division);
            $rows        = $odataResult['rows'];
            $timingResult['fetched'] = count($rows);

            if (!empty($rows)) {
                $requestedAt = gmdate('Y-m-d H:i:s');
                $importUuid  = parity_generateUUID();
                $pdoDiv->prepare("
                    INSERT INTO div_run_imports (uuid, race_lookup, nhra_division, requested_at_utc, fetched_at_utc, status, row_count, source_url, created_by_user_id)
                    VALUES (?, ?, ?, ?, ?, 'success', ?, ?, ?)
                ")->execute([$importUuid, $raceLookup, $division, $requestedAt, gmdate('Y-m-d H:i:s'), count($rows), $odataResult['url'], $userId]);
                $importId = (int)$pdoDiv->lastInsertId();

                foreach ($rows as $raw) {
                    $normalized = parity_normalizeRow($raw, $raceLookup);
                    $rowHash    = parity_computeRowHash($raceLookup, $normalized, $raw);
                    $localTime  = $normalized['run_timestamp_utc'];
                    $utcTime    = ($localTime !== null) ? parity_localToUtc($localTime, $tz) : null;
                    $res = divUpsertRun($pdoDiv, $normalized, $rowHash, $importId, $raceLookup, $division, $utcTime, $localTime);
                    if ($res === 'inserted') $timingResult['inserted']++;
                    elseif ($res === 'updated') $timingResult['updated']++;
                }
                $pdoDiv->prepare("UPDATE div_run_imports SET row_count = ? WHERE id = ?")->execute([$timingResult['inserted'], $importId]);
            }
        } catch (Exception $e) {
            $timingResult['errors'][] = $e->getMessage();
        }
    } else {
        $timingResult['errors'][] = 'No valid race_lookup on event';
    }

    // ── Step 2: Open-Meteo weather backfill ───────────────────────────────
    $weatherResult = ['inserted' => 0, 'deduped' => 0, 'errors' => []];

    $lat = (float)($event['latitude'] ?? 0);
    $lon = (float)($event['longitude'] ?? 0);

    if ($lat !== 0.0 || $lon !== 0.0) {
        try {
            $tzObj    = new DateTimeZone($tz);
            $startDt  = new DateTimeImmutable("$startLocal 00:00:00", $tzObj);
            $endDt    = new DateTimeImmutable("$endLocal 23:59:59", $tzObj);
            $startUtc = $startDt->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s');
            $endUtc   = $endDt->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s');

            $samples = divFetchOpenMeteo($lat, $lon, $startUtc, $endUtc);
            $stmtWx  = $pdoDiv->prepare("
                INSERT INTO div_weather_samples
                    (timestamp_utc, event_id, track_id, event_local_time, temp_c, temp_f, rh_pct, station_pressure_raw, wind_speed_mph, wind_dir_deg, source)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");

            foreach ($samples as $s) {
                try {
                    $utcDt   = new DateTimeImmutable($s['timestampUtc'], new DateTimeZone('UTC'));
                    $localStr = $utcDt->setTimezone(new DateTimeZone($tz))->format('Y-m-d H:i:s');
                    $tsUtcFmt = $utcDt->format('Y-m-d H:i:s');
                    $tempC        = ($s['tempF'] - 32) * 5.0 / 9.0;
                    $pressureMbar = $s['baroInHg'] / 0.02953;

                    $stmtWx->execute([
                        $tsUtcFmt, $eventId, (int)$event['track_id'], $localStr,
                        round($tempC, 4), round($s['tempF'], 4), round($s['humidityPct'], 2), round($pressureMbar, 4),
                        isset($s['windSpeedMph']) ? round($s['windSpeedMph'], 2) : null,
                        isset($s['windDirDeg']) ? (int)$s['windDirDeg'] : null,
                        'open_meteo',
                    ]);
                    $weatherResult['inserted']++;
                } catch (PDOException $e) {
                    if (strpos($e->getMessage(), 'Duplicate') !== false) $weatherResult['deduped']++;
                    else $weatherResult['errors'][] = $e->getMessage();
                }
            }

            divRebuildCanonicalRange($pdoDiv, $startUtc, $endUtc, $eventId, (int)$event['track_id'], $tz);
        } catch (Exception $e) {
            $weatherResult['errors'][] = $e->getMessage();
        }
    } else {
        $weatherResult['errors'][] = 'No track coordinates — skipping weather backfill';
    }

    $durationMs = (int)((microtime(true) - $t0) * 1000);

    rsa_jsonResponse([
        'ok'          => true,
        'event_id'    => $eventId,
        'event_name'  => $event['event_name'],
        'timing'      => $timingResult,
        'weather'     => $weatherResult,
        'duration_ms' => $durationMs,
    ]);
}

// ============================================================================
// Helper: divUpsertRun — same merge strategy as parity_upsertRun
// ============================================================================

function divUpsertRun(PDO $pdoDiv, array $normalized, string $rowHash, int $importId, string $raceLookup, string $division, ?string $utcTime, ?string $localTime): string {
    static $mergeFields = [
        'category','class_index','round','lane','driver_name','car_number',
        'dial_in','rt','ft60','ft330','ft660','mph660','ft1000','mph1000',
        'ft1320','mph1320','win_flag','dq_flag','mov','place','source_ref',
    ];

    $stmtInsert = $pdoDiv->prepare("
        INSERT INTO div_runs (uuid, import_id, race_lookup, nhra_division, run_timestamp_utc, run_time_local,
            category, class_index, round, lane, driver_name, car_number, dial_in, rt, ft60, ft330,
            ft660, mph660, ft1000, mph1000, ft1320, mph1320, win_flag, dq_flag, mov, place, source_ref, row_hash)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ");

    try {
        $stmtInsert->execute([
            parity_generateUUID(), $importId, $raceLookup, $division,
            $utcTime, $localTime,
            $normalized['category'], $normalized['class_index'],
            $normalized['round'], $normalized['lane'], $normalized['driver_name'], $normalized['car_number'],
            $normalized['dial_in'], $normalized['rt'], $normalized['ft60'], $normalized['ft330'],
            $normalized['ft660'], $normalized['mph660'], $normalized['ft1000'], $normalized['mph1000'],
            $normalized['ft1320'], $normalized['mph1320'], $normalized['win_flag'], $normalized['dq_flag'],
            $normalized['mov'], $normalized['place'], $normalized['source_ref'], $rowHash,
        ]);
        return 'inserted';
    } catch (PDOException $e) {
        if (strpos($e->getMessage(), 'Duplicate') === false) throw $e;
    }

    // Merge-update partial row
    $stmtFind = $pdoDiv->prepare("
        SELECT id, rt, ft60, ft330, ft660, mph660, ft1000, mph1000, ft1320, mph1320,
               dial_in, car_number, win_flag, dq_flag, mov, place, source_ref,
               run_timestamp_utc, run_time_local, category, class_index, driver_name, round, lane
        FROM div_runs
        WHERE race_lookup = ? AND nhra_division = ? AND row_hash = ?
        LIMIT 1
    ");
    $stmtFind->execute([$raceLookup, $division, $rowHash]);
    $existing = $stmtFind->fetch(PDO::FETCH_ASSOC);
    if (!$existing) return 'skipped';

    $setClauses = []; $setParams = [];
    foreach ($mergeFields as $field) {
        $incomingVal = $normalized[$field] ?? null;
        $existingVal = $existing[$field] ?? null;
        if ($incomingVal !== null && $incomingVal !== '' && ($existingVal === null || $existingVal === '')) {
            $setClauses[] = "$field = ?";
            $setParams[]  = $incomingVal;
        }
    }
    if ($utcTime !== null && ($existing['run_timestamp_utc'] === null || $existing['run_timestamp_utc'] === '')) {
        $setClauses[] = "run_timestamp_utc = ?"; $setParams[] = $utcTime;
    }
    if ($localTime !== null && ($existing['run_time_local'] === null || $existing['run_time_local'] === '')) {
        $setClauses[] = "run_time_local = ?"; $setParams[] = $localTime;
    }

    if (empty($setClauses)) return 'skipped';

    $setParams[] = (int)$existing['id'];
    $pdoDiv->prepare("UPDATE div_runs SET " . implode(', ', $setClauses) . " WHERE id = ?")->execute($setParams);
    return 'updated';
}

// ============================================================================
// Helper: divFetchOpenMeteo — fetches hourly weather from Open-Meteo archive API
// ============================================================================

function divFetchOpenMeteo(float $lat, float $lon, string $startUtc, string $endUtc): array {
    // Reuse Open-Meteo logic — extract date range from UTC strings
    $startDate = substr($startUtc, 0, 10);
    $endDate   = substr($endUtc, 0, 10);

    $url = "https://archive-api.open-meteo.com/v1/archive?" . http_build_query([
        'latitude'   => $lat,
        'longitude'  => $lon,
        'start_date' => $startDate,
        'end_date'   => $endDate,
        'hourly'     => 'temperature_2m,relativehumidity_2m,surface_pressure,windspeed_10m,winddirection_10m',
        'temperature_unit' => 'fahrenheit',
        'windspeed_unit'   => 'mph',
        'timezone'         => 'UTC',
    ]);

    $response = parity_httpGet($url);
    if ($response === false) throw new RuntimeException("Open-Meteo fetch failed: $url");

    $data = json_decode($response, true);
    if (!$data || !isset($data['hourly'])) throw new RuntimeException("Invalid Open-Meteo response");

    $hourly   = $data['hourly'];
    $times    = $hourly['time']              ?? [];
    $temps    = $hourly['temperature_2m']    ?? [];
    $rh       = $hourly['relativehumidity_2m'] ?? [];
    $pressure = $hourly['surface_pressure']  ?? [];
    $wind     = $hourly['windspeed_10m']     ?? [];
    $windDir  = $hourly['winddirection_10m'] ?? [];

    $samples = [];
    foreach ($times as $i => $timeStr) {
        $tsIso   = str_replace('T', ' ', $timeStr) . ':00';
        $tempF   = isset($temps[$i]) ? (float)$temps[$i] : null;
        $rhVal   = isset($rh[$i]) ? (float)$rh[$i] : null;
        $pressMb = isset($pressure[$i]) ? (float)$pressure[$i] : null;
        $pressInHg = ($pressMb !== null) ? round($pressMb * 0.02953, 4) : null;
        $windMph = isset($wind[$i]) ? (float)$wind[$i] : null;
        $windDeg = isset($windDir[$i]) ? (int)$windDir[$i] : null;

        if ($tempF === null || $rhVal === null || $pressInHg === null) continue;

        $samples[] = [
            'timestampUtc' => $tsIso,
            'tempF'        => $tempF,
            'humidityPct'  => $rhVal,
            'baroInHg'     => $pressInHg,
            'windSpeedMph' => $windMph,
            'windDirDeg'   => $windDeg,
            'source'       => 'open_meteo',
        ];
    }

    return $samples;
}

// ============================================================================
// Helper: divRebuildCanonicalRange — bucket weather into 30-min canonical rows
// ============================================================================

function divRebuildCanonicalRange(PDO $pdoDiv, string $startUtc, string $endUtc, int $eventId, int $trackId, string $tz): void {
    // Fetch all samples in range for this event
    $stmt = $pdoDiv->prepare("
        SELECT timestamp_utc, temp_f, rh_pct, station_pressure_raw, wind_speed_mph, wind_dir_deg
        FROM div_weather_samples
        WHERE event_id = ? AND timestamp_utc BETWEEN ? AND ?
        ORDER BY timestamp_utc
    ");
    $stmt->execute([$eventId, $startUtc, $endUtc]);
    $samples = $stmt->fetchAll(PDO::FETCH_ASSOC);

    if (empty($samples)) return;

    $INHG_TO_MB = 33.8639;
    $buckets = [];

    foreach ($samples as $s) {
        // Round to nearest 30 minutes
        $ts = strtotime($s['timestamp_utc']);
        $bucket = gmdate('Y-m-d H:', $ts) . (((int)gmdate('i', $ts) < 30) ? '00:00' : '30:00');

        if (!isset($buckets[$bucket])) {
            $buckets[$bucket] = ['temp_f' => [], 'rh' => [], 'pressure' => [], 'wind' => [], 'wind_dir' => []];
        }
        if ($s['temp_f'] !== null)               $buckets[$bucket]['temp_f'][]   = (float)$s['temp_f'];
        if ($s['rh_pct'] !== null)               $buckets[$bucket]['rh'][]       = (float)$s['rh_pct'];
        if ($s['station_pressure_raw'] !== null) $buckets[$bucket]['pressure'][] = (float)$s['station_pressure_raw'] / $INHG_TO_MB;
        if ($s['wind_speed_mph'] !== null)       $buckets[$bucket]['wind'][]     = (float)$s['wind_speed_mph'];
        if ($s['wind_dir_deg'] !== null)         $buckets[$bucket]['wind_dir'][] = (int)$s['wind_dir_deg'];
    }

    $stmtUpsert = $pdoDiv->prepare("
        INSERT INTO div_weather_canonical (bucket_utc, event_id, track_id, temp_f, rh_pct, pressure_inhg, wind_speed_mph, wind_dir_deg, source_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            temp_f = VALUES(temp_f), rh_pct = VALUES(rh_pct), pressure_inhg = VALUES(pressure_inhg),
            wind_speed_mph = VALUES(wind_speed_mph), wind_dir_deg = VALUES(wind_dir_deg),
            source_count = VALUES(source_count)
    ");

    $avg = fn(array $a) => count($a) ? round(array_sum($a) / count($a), 4) : null;

    foreach ($buckets as $bucket => $data) {
        $stmtUpsert->execute([
            $bucket, $eventId, $trackId,
            $avg($data['temp_f']),
            $avg($data['rh']),
            $avg($data['pressure']),
            $avg($data['wind']),
            count($data['wind_dir']) ? (int)round(array_sum($data['wind_dir']) / count($data['wind_dir'])) : null,
            count($data['temp_f']),
        ]);
    }
}

// ============================================================================
// Helper: parseDivScheduleHtml — parse NHRA divisional schedule page
// ============================================================================

function parseDivScheduleHtml(string $html, int $year): array {
    $events = [];
    if (!$html) return $events;

    $dom = new DOMDocument();
    @$dom->loadHTML($html);
    $xpath = new DOMXPath($dom);

    // NHRA schedule pages use event cards / list items; attempt multiple selectors
    // Each event card typically contains: title, track/location, date range

    // Strategy: find elements with date patterns and nearby text for name/location
    $nodes = $xpath->query('//*[contains(@class,"schedule") or contains(@class,"event-card") or contains(@class,"event-item") or contains(@class,"race-item") or contains(text(),"Division")]');

    // Fallback: extract structured data from JSON-LD if present
    $jsonLdNodes = $xpath->query('//script[@type="application/ld+json"]');
    foreach ($jsonLdNodes as $node) {
        $jsonStr = $node->textContent;
        $data    = json_decode($jsonStr, true);
        if (!$data) continue;
        $items = isset($data['@type']) ? [$data] : ($data['@graph'] ?? []);
        foreach ($items as $item) {
            if (($item['@type'] ?? '') !== 'Event') continue;
            $name      = $item['name'] ?? '';
            $startDate = substr($item['startDate'] ?? '', 0, 10);
            $endDate   = substr($item['endDate'] ?? $startDate, 0, 10);
            $location  = $item['location']['name'] ?? '';
            $address   = $item['location']['address'] ?? [];
            $state     = is_array($address) ? ($address['addressRegion'] ?? '') : '';
            $city      = is_array($address) ? ($address['addressLocality'] ?? '') : '';

            if (!$name || !$startDate) continue;

            // Derive division from name (e.g. "Lucas Oil Divisional Series - Division 2" → D2)
            $division = 'D1';
            if (preg_match('/division\s*(\d)/i', $name, $m)) {
                $division = 'D' . $m[1];
            }

            $events[] = [
                'eventName'      => $name,
                'trackName'      => $location ?: "Track $year",
                'startDateLocal' => $startDate,
                'endDateLocal'   => $endDate ?: $startDate,
                'division'       => $division,
                'city'           => $city,
                'state'          => $state,
            ];
        }
        if (!empty($events)) return $events;
    }

    // HTML heuristic: find date strings and surrounding text
    $allText = $dom->textContent;
    preg_match_all('/(\w+ \d{1,2}[-–]\d{1,2},?\s*' . $year . '|\w+ \d{1,2},?\s*' . $year . ')/', $allText, $dateMatches);

    // If no structured data and no heuristic matches, return empty — admin can enter manually
    return $events;
}

// ============================================================================
// Helper: stateToTimezoneDiv — state abbreviation → IANA timezone
// ============================================================================

function stateToTimezoneDiv(string $state): array {
    $map = [
        'AL'=>'America/Chicago','AK'=>'America/Anchorage','AZ'=>'America/Phoenix',
        'AR'=>'America/Chicago','CA'=>'America/Los_Angeles','CO'=>'America/Denver',
        'CT'=>'America/New_York','DE'=>'America/New_York','FL'=>'America/New_York',
        'GA'=>'America/New_York','HI'=>'Pacific/Honolulu','ID'=>'America/Denver',
        'IL'=>'America/Chicago','IN'=>'America/Indiana/Indianapolis','IA'=>'America/Chicago',
        'KS'=>'America/Chicago','KY'=>'America/New_York','LA'=>'America/Chicago',
        'ME'=>'America/New_York','MD'=>'America/New_York','MA'=>'America/New_York',
        'MI'=>'America/Detroit','MN'=>'America/Chicago','MS'=>'America/Chicago',
        'MO'=>'America/Chicago','MT'=>'America/Denver','NE'=>'America/Chicago',
        'NV'=>'America/Los_Angeles','NH'=>'America/New_York','NJ'=>'America/New_York',
        'NM'=>'America/Denver','NY'=>'America/New_York','NC'=>'America/New_York',
        'ND'=>'America/Chicago','OH'=>'America/New_York','OK'=>'America/Chicago',
        'OR'=>'America/Los_Angeles','PA'=>'America/New_York','RI'=>'America/New_York',
        'SC'=>'America/New_York','SD'=>'America/Chicago','TN'=>'America/Chicago',
        'TX'=>'America/Chicago','UT'=>'America/Denver','VT'=>'America/New_York',
        'VA'=>'America/New_York','WA'=>'America/Los_Angeles','WV'=>'America/New_York',
        'WI'=>'America/Chicago','WY'=>'America/Denver',
    ];
    $s = strtoupper(trim($state));
    return [
        'tz'         => $map[$s] ?? 'America/New_York',
        'tz_unknown' => !isset($map[$s]),
    ];
}
