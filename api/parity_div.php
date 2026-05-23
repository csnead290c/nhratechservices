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
require_once __DIR__ . '/lib/parity_anomaly.php';

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

        case 'divRunsWithWeather':
            if ($method !== 'GET') rsa_jsonResponse(['error' => 'Method not allowed'], 405);
            handleDivRunsWithWeather($pdoDiv);
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

        // ── Analysis endpoints (divisional equivalents) ────────────────────
        case 'divAnomalyAnalysis':
            if ($method !== 'GET') rsa_jsonResponse(['error' => 'Method not allowed'], 405);
            handleDivAnomalyAnalysis($pdoDiv);
            break;

        case 'divQualSheet':
            if ($method !== 'GET') rsa_jsonResponse(['error' => 'Method not allowed'], 405);
            handleDivQualSheet($pdoDiv);
            break;

        case 'divRtAnalysis':
            if ($method !== 'GET') rsa_jsonResponse(['error' => 'Method not allowed'], 405);
            handleDivRtAnalysis($pdoDiv);
            break;

        case 'divIncrementalComparison':
            if ($method !== 'GET') rsa_jsonResponse(['error' => 'Method not allowed'], 405);
            handleDivIncrementalComparison($pdoDiv);
            break;

        case 'divWeatherTimeseries':
            if ($method !== 'GET') rsa_jsonResponse(['error' => 'Method not allowed'], 405);
            handleDivWeatherTimeseries($pdoDiv);
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

// ============================================================================
// GET ?action=divAnomalyAnalysis&raceLookup=YYYYMMDD[&category=Top Fuel][&limit=2000]
// Mirrors national anomalyAnalysis but queries div_runs
// ============================================================================

function handleDivAnomalyAnalysis(PDO $pdoDiv): void {
    $raceLookup = trim($_GET['raceLookup'] ?? '');
    if (!$raceLookup) rsa_jsonResponse(['error' => 'raceLookup is required'], 400);

    $where = ['r.race_lookup = ?'];
    $params = [$raceLookup];
    if (!empty($_GET['category'])) {
        $where[] = 'r.category = ?';
        $params[] = trim($_GET['category']);
    } elseif (!empty($_GET['classIndex'])) {
        $where[] = 'r.class_index = ?';
        $params[] = trim($_GET['classIndex']);
    }
    $whereClause = implode(' AND ', $where);
    $limit = min((int)($_GET['limit'] ?? 2000), 5000);

    $stmt = $pdoDiv->prepare("
        SELECT r.id, r.uuid, r.race_lookup, r.run_timestamp_utc, r.run_time_local,
               r.category, r.class_index, r.round, r.lane, r.driver_name, r.car_number,
               r.rt, r.ft60, r.ft330, r.ft660, r.mph660, r.ft1000, r.mph1000,
               r.ft1320, r.mph1320, r.win_flag, r.dq_flag, r.dial_in
        FROM div_runs r
        WHERE $whereClause
        ORDER BY COALESCE(r.run_time_local, r.run_timestamp_utc, r.created_at) ASC
        LIMIT $limit
    ");
    $stmt->execute($params);
    $runs = $stmt->fetchAll(PDO::FETCH_ASSOC);

    foreach ($runs as &$run) {
        foreach (['rt','ft60','ft330','ft660','mph660','ft1000','mph1000','ft1320','mph1320','dial_in'] as $f) {
            if ($run[$f] !== null) $run[$f] = (float)$run[$f];
        }
        $run['id'] = (int)$run['id'];
    }
    unset($run);

    $runMap = [];
    foreach ($runs as $r) $runMap[(int)$r['id']] = $r;

    $hardFailIds = [];
    $allIntervals = [];
    $allL1Flags = [];
    foreach ($runs as $r) {
        $iv = anomaly_computeIntervals($r);
        $allIntervals[(int)$r['id']] = $iv;
        $l1 = anomaly_layer1($r, $iv);
        $allL1Flags[(int)$r['id']] = $l1;
        $hasCriticalOrHigh = false;
        foreach ($l1 as $f) {
            if ($f['severity'] === 'critical' || $f['severity'] === 'high') { $hasCriticalOrHigh = true; break; }
        }
        if ($hasCriticalOrHigh) $hardFailIds[(int)$r['id']] = true;
    }

    $suspectIds = [];
    foreach ($runs as $r) {
        $rid = (int)$r['id'];
        if (isset($hardFailIds[$rid])) continue;
        $l1 = $allL1Flags[$rid];
        $iv = $allIntervals[$rid];
        $l2 = anomaly_layer2($r, $iv);
        $combined = array_merge($l1, $l2);
        $mediumCount = count(array_filter($combined, fn($f) => $f['severity'] === 'medium'));
        if ($mediumCount >= 2 || count($combined) >= 3) {
            $suspectIds[$rid] = true;
        }
    }

    $initialCleanIds = [];
    foreach ($runs as $r) {
        $rid = (int)$r['id'];
        if (!isset($hardFailIds[$rid]) && !isset($suspectIds[$rid])) {
            $initialCleanIds[$rid] = true;
        }
    }

    $offPaceIds = [];
    $offPaceReasons = [];
    $initialCleanRuns = array_filter($runs, fn($r) => isset($initialCleanIds[(int)$r['id']]));
    $prelimBaselines = count($initialCleanRuns) >= 5 ? anomaly_buildBaselines(array_values($initialCleanRuns)) : [];
    foreach ($runs as $r) {
        $rid = (int)$r['id'];
        if (isset($hardFailIds[$rid]) || isset($suspectIds[$rid])) continue;
        $l1 = $allL1Flags[$rid] ?? [];
        $op = anomaly_detectOffPace($r, $prelimBaselines, $l1);
        if (!$op['representative']) {
            $offPaceIds[$rid] = true;
            if ($op['reason']) $offPaceReasons[$rid] = $op['reason'];
        }
    }

    $cleanIds = [];
    foreach ($runs as $r) {
        $rid = (int)$r['id'];
        if (!isset($hardFailIds[$rid]) && !isset($suspectIds[$rid]) && !isset($offPaceIds[$rid])) {
            $cleanIds[$rid] = true;
        }
    }
    $totalExcluded = count($hardFailIds) + count($suspectIds) + count($offPaceIds);

    $repFinishETs = [];
    foreach ($runs as $r) {
        $rid = (int)$r['id'];
        if (!isset($cleanIds[$rid])) continue;
        $f = anomaly_resolveFinish($r);
        if ($f['effectiveFinishTime'] !== null) $repFinishETs[] = $f['effectiveFinishTime'];
    }
    sort($repFinishETs);
    $competitiveMedianET = !empty($repFinishETs) ? anomaly_median($repFinishETs) : null;

    $results = [];
    foreach ($runs as $r) {
        $results[] = anomaly_analyzeRun($r, $runs, $cleanIds, $totalExcluded, $offPaceIds, $offPaceReasons, $hardFailIds, $competitiveMedianET);
    }

    $bandCounts = ['High' => 0, 'Medium' => 0, 'Low' => 0, 'Critical' => 0];
    $fieldFlagCounts = [];
    $representativeCount = 0;
    $offPaceCount = 0;
    $competitiveCount = 0;
    $competitiveIssueCount = 0;
    foreach ($results as $r) {
        $bandCounts[$r['band']]++;
        if ($r['representativeRun']) $representativeCount++; else $offPaceCount++;
        if ($r['competitiveRun']) {
            $competitiveCount++;
            if ($r['band'] !== 'High') $competitiveIssueCount++;
        }
        foreach ($r['suspectFields'] as $f) {
            $fieldFlagCounts[$f] = ($fieldFlagCounts[$f] ?? 0) + 1;
        }
    }
    arsort($fieldFlagCounts);
    $mostFlaggedField = !empty($fieldFlagCounts) ? array_key_first($fieldFlagCounts) : null;
    $mostFlaggedCount = $mostFlaggedField ? $fieldFlagCounts[$mostFlaggedField] : 0;

    $rollups = anomaly_computeRollups($results, $runMap);

    $runsSummary = array_map(function($r) {
        return [
            'runId' => $r['runId'],
            'runUuid' => $r['runUuid'],
            'overallScore' => $r['overallScore'],
            'band' => $r['band'],
            'classification' => $r['classification'],
            'flagCount' => $r['flagCount'],
            'suspectFields' => $r['suspectFields'],
            'primaryReasonCode' => $r['primaryReasonCode'],
            'primaryReasonText' => $r['primaryReasonText'],
            'fieldScores' => $r['fieldScores'],
            'intervals' => $r['intervals'],
            'baseline' => $r['baseline'],
            'narrative' => $r['narrative'],
            'finish' => $r['finish'],
            'representativeRun' => $r['representativeRun'],
            'representativeRunReason' => $r['representativeRunReason'],
            'excludedFromBaseline' => $r['excludedFromBaseline'],
            'baselineExclusionReason' => $r['baselineExclusionReason'],
            'competitiveRun' => $r['competitiveRun'],
            'competitiveWeight' => $r['competitiveWeight'],
            'trapDerived' => $r['trapDerived'],
            'driverName' => null,
            'category' => null,
            'lane' => null,
            'round' => null,
            'ft1320' => null,
            'mph1320' => null,
        ];
    }, $results);

    foreach ($runsSummary as &$rs) {
        $run = $runMap[$rs['runId']] ?? null;
        if ($run) {
            $rs['driverName'] = $run['driver_name'];
            $rs['category'] = $run['category'];
            $rs['lane'] = $run['lane'];
            $rs['round'] = $run['round'];
            $rs['ft1320'] = $run['ft1320'];
            $rs['mph1320'] = $run['mph1320'];
        }
    }
    unset($rs);

    rsa_jsonResponse([
        'summary' => [
            'runsAnalyzed' => count($results),
            'highCount' => $bandCounts['High'],
            'mediumCount' => $bandCounts['Medium'],
            'lowCount' => $bandCounts['Low'],
            'criticalCount' => $bandCounts['Critical'],
            'mostFlaggedField' => $mostFlaggedField,
            'mostFlaggedFieldCount' => $mostFlaggedCount,
            'baselineExcluded' => $totalExcluded,
            'representativeCount' => $representativeCount,
            'offPaceCount' => $offPaceCount,
            'competitiveCount' => $competitiveCount,
            'competitiveIssueCount' => $competitiveIssueCount,
        ],
        'rollups' => $rollups,
        'runs' => $runsSummary,
    ]);
}

// ============================================================================
// GET ?action=divQualSheet&eventId=N&classIndex=SS
// Mirrors national qualSheet but queries div_runs / div_events
// ============================================================================

function handleDivQualSheet(PDO $pdoDiv): void {
    $eventId = (int)($_GET['eventId'] ?? 0);
    $classIndex = trim($_GET['classIndex'] ?? '');

    if ($eventId <= 0 || !$classIndex) {
        rsa_jsonResponse(['error' => 'eventId and classIndex are required'], 400);
    }

    $stmt = $pdoDiv->prepare("SELECT race_lookup FROM div_events WHERE id = ?");
    $stmt->execute([$eventId]);
    $raceLookup = $stmt->fetchColumn();
    if (!$raceLookup) rsa_jsonResponse(['error' => 'Event not found'], 404);

    $sql = "
        SELECT r.id, r.uuid, r.race_lookup, r.run_timestamp_utc, r.run_time_local, r.class_index,
               r.round, r.lane, r.driver_name, r.car_number, r.rt,
               r.ft60, r.ft330, r.ft660, r.mph660, r.ft1000, r.mph1000,
               r.ft1320, r.mph1320, r.win_flag, r.dq_flag, r.place
        FROM div_runs r
        WHERE r.race_lookup = ? AND r.class_index = ? AND r.round LIKE 'Q%'
        ORDER BY COALESCE(r.run_time_local, r.run_timestamp_utc) ASC
    ";
    $stmtRuns = $pdoDiv->prepare($sql);
    $stmtRuns->execute([$raceLookup, $classIndex]);
    $allQualRuns = $stmtRuns->fetchAll(PDO::FETCH_ASSOC);

    foreach ($allQualRuns as &$run) {
        $run['id'] = (int)$run['id'];
        foreach (['rt','ft60','ft330','ft660','mph660','ft1000','mph1000','ft1320','mph1320'] as $f) {
            if ($run[$f] !== null) $run[$f] = (float)$run[$f];
        }
        foreach (['win_flag','dq_flag'] as $f) {
            if ($run[$f] !== null) $run[$f] = (bool)(int)$run[$f];
        }
    }
    unset($run);

    $byDriver = [];
    foreach ($allQualRuns as $r) {
        $driver = $r['driver_name'] ?? '(unknown)';
        if (!isset($byDriver[$driver])) {
            $byDriver[$driver] = ['driver' => $driver, 'car_number' => $r['car_number'], 'qual_runs' => [], 'all_dq' => true, 'total_runs' => 0];
        }
        $byDriver[$driver]['total_runs']++;
        $isDQ = !empty($r['dq_flag']);
        if ($isDQ) continue;
        $byDriver[$driver]['all_dq'] = false;
        if ($r['ft1320'] === null || $r['ft1320'] <= 0) continue;
        $byDriver[$driver]['qual_runs'][] = $r;
    }

    $validDrivers = [];
    $invalidDrivers = [];

    foreach ($byDriver as $driverData) {
        $driver = $driverData['driver'];
        $qualRuns = $driverData['qual_runs'];

        if (count($qualRuns) === 0) {
            $invalidDrivers[] = [
                'driver' => $driver, 'car_number' => $driverData['car_number'],
                'best_et' => null, 'best_mph' => null, 'best_rt' => null,
                'best_ft60' => null, 'best_ft660' => null, 'best_timestamp' => null,
                'corrected_best_et' => null, 'correction_factor' => null,
                'temp_f' => null, 'pressure_inhg' => null, 'rh_pct' => null,
                'run_count' => $driverData['total_runs'], 'is_valid' => false,
            ];
            continue;
        }

        usort($qualRuns, function ($a, $b) {
            $etCmp = $a['ft1320'] <=> $b['ft1320'];
            if ($etCmp !== 0) return $etCmp;
            $mphCmp = ($b['mph1320'] ?? 0) <=> ($a['mph1320'] ?? 0);
            if ($mphCmp !== 0) return $mphCmp;
            return ($a['run_time_local'] ?? $a['run_timestamp_utc'] ?? '') <=> ($b['run_time_local'] ?? $b['run_timestamp_utc'] ?? '');
        });

        $best = $qualRuns[0];
        $validDrivers[] = [
            'driver' => $driver, 'car_number' => $driverData['car_number'],
            'best_et' => $best['ft1320'], 'best_mph' => $best['mph1320'],
            'best_rt' => $best['rt'], 'best_ft60' => $best['ft60'], 'best_ft660' => $best['ft660'],
            'best_timestamp' => $best['run_time_local'] ?? $best['run_timestamp_utc'],
            'best_timestamp_utc' => $best['run_timestamp_utc'],
            'corrected_best_et' => null, 'correction_factor' => null,
            'temp_f' => null, 'pressure_inhg' => null, 'rh_pct' => null,
            'run_count' => $driverData['total_runs'], 'is_valid' => true,
        ];
    }

    usort($validDrivers, function ($a, $b) {
        $etCmp = ($a['best_et'] ?? 999) <=> ($b['best_et'] ?? 999);
        if ($etCmp !== 0) return $etCmp;
        $mphCmp = ($b['best_mph'] ?? 0) <=> ($a['best_mph'] ?? 0);
        if ($mphCmp !== 0) return $mphCmp;
        return ($a['best_timestamp'] ?? '') <=> ($b['best_timestamp'] ?? '');
    });

    $sheet = [];
    $pos = 1;
    foreach ($validDrivers as $row) { $row['qual_pos'] = $pos++; $sheet[] = $row; }
    foreach ($invalidDrivers as $row) { $row['qual_pos'] = null; $sheet[] = $row; }

    $ev = $pdoDiv->prepare("
        SELECT e.event_name, e.start_date_local, e.end_date_local, e.season_year,
               t.track_name, t.city, t.state
        FROM div_events e JOIN div_tracks t ON t.id = e.track_id
        WHERE e.id = ?
    ");
    $ev->execute([$eventId]);
    $eventInfo = $ev->fetch(PDO::FETCH_ASSOC);

    rsa_jsonResponse([
        'eventId' => $eventId,
        'classIndex' => $classIndex,
        'event' => $eventInfo ?: null,
        'correction_model_version' => null,
        'qualifier_count' => count($validDrivers),
        'total_drivers' => count($sheet),
        'sheet' => $sheet,
    ]);
}

// ============================================================================
// GET ?action=divRtAnalysis&eventId=N&category=Top Fuel
// Mirrors national rtAnalysis but queries div_runs / div_events
// ============================================================================

function handleDivRtAnalysis(PDO $pdoDiv): void {
    $eventId  = isset($_GET['eventId']) ? (int)$_GET['eventId'] : 0;
    $category = trim($_GET['category'] ?? '');

    if (empty($category)) { rsa_jsonResponse(['error' => 'category is required'], 400); return; }
    if ($eventId <= 0) { rsa_jsonResponse(['error' => 'eventId is required'], 400); return; }

    $evRow = $pdoDiv->prepare("SELECT race_lookup FROM div_events WHERE id=?");
    $evRow->execute([$eventId]);
    $raceLookup = $evRow->fetchColumn();
    if (!$raceLookup) { rsa_jsonResponse(['error' => 'Event not found'], 404); return; }

    $runStmt = $pdoDiv->prepare("
        SELECT r.driver_name, r.round, r.lane, r.rt, r.ft60, r.win_flag, r.dq_flag, r.race_lookup
        FROM div_runs r
        WHERE r.race_lookup = ? AND r.category = ?
          AND r.rt IS NOT NULL AND r.rt >= 0 AND r.rt <= 0.500
        ORDER BY r.race_lookup, r.round, r.driver_name
    ");
    $runStmt->execute([$raceLookup, $category]);
    $rawRuns = $runStmt->fetchAll(PDO::FETCH_ASSOC);

    if (empty($rawRuns)) {
        rsa_jsonResponse(['mode' => 'event', 'category' => $category, 'runs' => [], 'driverStats' => [], 'holeshots' => []]);
        return;
    }

    $classifyRound = function(string $round): string {
        $r = strtoupper(trim($round));
        if (str_starts_with($r, 'Q')) return 'qual';
        if (str_starts_with($r, 'E')) return 'elim';
        return 'other';
    };

    $runs = [];
    foreach ($rawRuns as $r) {
        $runs[] = [
            'driver'     => $r['driver_name'],
            'round'      => $r['round'],
            'roundType'  => $classifyRound($r['round']),
            'lane'       => $r['lane'],
            'rt'         => (float)$r['rt'],
            'ft60'       => $r['ft60'] !== null ? (float)$r['ft60'] : null,
            'winFlag'    => (bool)$r['win_flag'],
            'dqFlag'     => (bool)$r['dq_flag'],
            'raceLookup' => $r['race_lookup'],
        ];
    }

    $driverData = [];
    foreach ($runs as $run) {
        if ($run['dqFlag']) continue;
        $d = $run['driver'];
        if (!isset($driverData[$d])) {
            $driverData[$d] = ['rts' => [], 'qualRts' => [], 'elimRts' => [], 'ft60s' => []];
        }
        $driverData[$d]['rts'][] = $run['rt'];
        if ($run['roundType'] === 'qual') $driverData[$d]['qualRts'][] = $run['rt'];
        if ($run['roundType'] === 'elim') $driverData[$d]['elimRts'][] = $run['rt'];
        if ($run['ft60'] !== null) $driverData[$d]['ft60s'][] = $run['ft60'];
    }

    $calcMedian = function(array $arr): float {
        if (!$arr) return 0.0;
        sort($arr);
        $n = count($arr); $m = (int)floor($n / 2);
        return $n % 2 ? $arr[$m] : ($arr[$m-1] + $arr[$m]) / 2;
    };
    $calcMean = function(array $arr): float { return $arr ? array_sum($arr) / count($arr) : 0.0; };
    $calcStddev = function(array $arr) use ($calcMean): float {
        if (count($arr) < 2) return 0.0;
        $avg = $calcMean($arr);
        return sqrt(array_sum(array_map(fn($x) => ($x - $avg) ** 2, $arr)) / count($arr));
    };

    $driverStats = [];
    foreach ($driverData as $driver => $data) {
        if (count($data['rts']) < 1) continue;
        $avgRT   = $calcMean($data['rts']);
        $qualAvg = $data['qualRts'] ? $calcMean($data['qualRts']) : null;
        $elimAvg = $data['elimRts'] ? $calcMean($data['elimRts']) : null;
        $avgFt60 = $data['ft60s']   ? $calcMean($data['ft60s'])   : null;
        $driverStats[$driver] = [
            'driver'        => $driver,
            'runCount'      => count($data['rts']),
            'elimRounds'    => count($data['elimRts']),
            'avgRT'         => round($avgRT, 4),
            'medianRT'      => round($calcMedian($data['rts']), 4),
            'stddevRT'      => round($calcStddev($data['rts']), 4),
            'qualAvgRT'     => $qualAvg !== null ? round($qualAvg, 4) : null,
            'elimAvgRT'     => $elimAvg !== null ? round($elimAvg, 4) : null,
            'elimStepup'    => ($qualAvg !== null && $elimAvg !== null) ? round($elimAvg - $qualAvg, 4) : null,
            'avgFt60'       => $avgFt60 !== null ? round($avgFt60, 4) : null,
            'netLaunch'     => $avgFt60 !== null ? round($avgRT + $avgFt60, 4) : null,
            'holeshotCount' => 0,
            'radar'         => null,
        ];
    }

    $holeshots = [];
    $pairings  = [];
    foreach ($runs as $run) {
        if ($run['roundType'] !== 'elim' || $run['dqFlag']) continue;
        $key = $run['raceLookup'] . '|' . $run['round'];
        $pairings[$key][] = $run;
    }
    foreach ($pairings as $pair) {
        $laneRuns = [];
        foreach ($pair as $r) {
            if ($r['lane'] === 'L' || $r['lane'] === 'R') $laneRuns[$r['lane']] = $r;
        }
        if (count($laneRuns) !== 2) continue;
        $rtWinner = ($laneRuns['L']['rt'] <= $laneRuns['R']['rt']) ? $laneRuns['L'] : $laneRuns['R'];
        $rtLoser  = ($laneRuns['L']['rt'] <= $laneRuns['R']['rt']) ? $laneRuns['R'] : $laneRuns['L'];
        if ($rtWinner['winFlag'] && !$rtLoser['winFlag']) {
            $holeshots[] = [
                'round' => $rtWinner['round'], 'raceLookup' => $rtWinner['raceLookup'],
                'winner' => $rtWinner['driver'], 'loser' => $rtLoser['driver'],
                'winnerRT' => $rtWinner['rt'], 'loserRT' => $rtLoser['rt'],
            ];
            if (isset($driverStats[$rtWinner['driver']])) $driverStats[$rtWinner['driver']]['holeshotCount']++;
        }
    }

    if (!empty($driverStats)) {
        $drivers = array_values($driverStats);
        $getCol  = fn(string $f) => array_filter(array_column($drivers, $f), fn($v) => $v !== null);
        $norm    = function(array $all, float $v, bool $inv): float {
            if (count($all) < 2) return 0.5;
            $mn = min($all); $mx = max($all);
            if ($mx <= $mn) return 0.5;
            $n = ($v - $mn) / ($mx - $mn);
            return $inv ? 1.0 - $n : $n;
        };
        $rtVals   = array_values($getCol('medianRT'));
        $sdVals   = array_values($getCol('stddevRT'));
        $ft60Vals = array_values($getCol('avgFt60'));
        $stepVals = array_values($getCol('elimStepup'));
        $nlVals   = array_values($getCol('netLaunch'));
        $hsRates  = [];
        foreach ($drivers as $d) {
            $hsRates[$d['driver']] = $d['elimRounds'] > 0 ? $d['holeshotCount'] / $d['elimRounds'] : 0.0;
        }
        $hsRateVals = array_values($hsRates);
        foreach ($driverStats as $driver => &$ds) {
            $ds['radar'] = [
                'rtQuickness'   => $ds['medianRT']   !== null ? $norm($rtVals,   $ds['medianRT'],   true)  : null,
                'rtConsistency' => $ds['stddevRT']   !== null ? $norm($sdVals,   $ds['stddevRT'],   true)  : null,
                'stagingDepth'  => $ds['avgFt60']    !== null ? $norm($ft60Vals, $ds['avgFt60'],    false) : null,
                'elimStepup'    => $ds['elimStepup'] !== null ? $norm($stepVals, $ds['elimStepup'], true)  : null,
                'netLaunch'     => $ds['netLaunch']  !== null ? $norm($nlVals,   $ds['netLaunch'],  true)  : null,
                'holeshotRate'  => $norm($hsRateVals, $hsRates[$driver] ?? 0.0, false),
            ];
        }
        unset($ds);
    }

    $sorted = array_values($driverStats);
    usort($sorted, fn($a, $b) => $a['medianRT'] <=> $b['medianRT']);

    rsa_jsonResponse([
        'mode'        => 'event',
        'category'    => $category,
        'runs'        => $runs,
        'driverStats' => $sorted,
        'holeshots'   => $holeshots,
    ]);
}

// ============================================================================
// GET ?action=divIncrementalComparison&eventId=N&category=Top Fuel[&session=qualifying][&classIndex=SS]
// Mirrors national incrementalComparison but queries div_runs. mode is always 'raw'.
// ============================================================================

function handleDivIncrementalComparison(PDO $pdoDiv): void {
    $eventId    = (int)($_GET['eventId'] ?? 0);
    $category   = trim($_GET['category'] ?? '');
    $classIndex = trim($_GET['classIndex'] ?? '');
    $session    = trim($_GET['session'] ?? '');

    if ($eventId <= 0) rsa_jsonResponse(['error' => 'eventId is required'], 400);
    if ($category === '' && $classIndex === '') rsa_jsonResponse(['error' => 'category or classIndex is required'], 400);
    if ($session !== '' && !in_array($session, ['qualifying', 'elimination'])) rsa_jsonResponse(['error' => 'session must be qualifying or elimination'], 400);

    $evStmt = $pdoDiv->prepare("SELECT race_lookup FROM div_events WHERE id = ?");
    $evStmt->execute([$eventId]);
    $raceLookup = $evStmt->fetchColumn();
    if (!$raceLookup) rsa_jsonResponse(['error' => 'Event not found'], 404);

    $params = [$raceLookup];
    $filters = [];
    if ($category !== '') {
        $filters[] = "r.category = ?";
        $params[] = $category;
    } else {
        $filters[] = "r.class_index = ?";
        $params[] = $classIndex;
    }
    if ($session !== '') {
        if ($session === 'qualifying') $filters[] = "UPPER(r.round) LIKE 'Q%'";
        else $filters[] = "UPPER(r.round) NOT LIKE 'Q%'";
    }
    $filterClause = $filters ? 'AND ' . implode(' AND ', $filters) : '';

    $sql = "SELECT r.id, r.driver_name, r.car_number, r.class_index, r.lane,
                   r.round, r.run_timestamp_utc,
                   r.ft60, r.ft330, r.ft660, r.mph660,
                   r.ft1000, r.mph1000, r.ft1320, r.mph1320, r.dq_flag
            FROM div_runs r
            WHERE r.race_lookup = ?
            $filterClause
            AND r.ft1320 IS NOT NULL AND r.ft1320 > 0
            ORDER BY r.ft60 ASC";

    $stmt = $pdoDiv->prepare($sql);
    $stmt->execute($params);
    $runs = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $timeFields = ['ft60','ft330','ft660','ft1000','ft1320'];
    $mphFields  = ['mph660','mph1000','mph1320'];
    $numFields  = array_merge($timeFields, $mphFields);

    foreach ($runs as &$run) {
        foreach ($numFields as $f) {
            $run[$f] = $run[$f] !== null ? (float)$run[$f] : null;
        }
    }
    unset($run);

    $rows = [];
    $pos = 0;
    foreach ($runs as $run) {
        $pos++;
        $ft60  = $run['ft60'];
        $ft330 = $run['ft330'];
        $ft660 = $run['ft660'];
        $ft1000 = $run['ft1000'];
        $ft1320 = $run['ft1320'];

        $inc60_330   = ($ft60 !== null && $ft330 !== null)  ? round($ft330 - $ft60, 4)   : null;
        $inc330_660  = ($ft330 !== null && $ft660 !== null)  ? round($ft660 - $ft330, 4)  : null;
        $inc660_1000 = ($ft660 !== null && $ft1000 !== null) ? round($ft1000 - $ft660, 4) : null;
        $inc1000_1320= ($ft1000 !== null && $ft1320 !== null)? round($ft1320 - $ft1000, 4): null;
        $last18      = ($ft660 !== null && $ft1320 !== null) ? round($ft1320 - $ft660, 4) : null;
        $last18mph   = ($run['mph660'] !== null && $run['mph1320'] !== null) ? round($run['mph1320'] - $run['mph660'], 2) : null;

        $rows[] = [
            'pos'          => $pos,
            'lane'         => $run['lane'],
            'carNumber'    => $run['car_number'],
            'driverName'   => $run['driver_name'],
            'round'        => $run['round'],
            'dqFlag'       => (bool)$run['dq_flag'],
            'runId'        => (int)$run['id'],
            'engineComboName' => null,
            'bodyStyleName'   => null,
            'ft60'         => $ft60,
            'inc60_330'    => $inc60_330,
            'ft330'        => $ft330,
            'inc330_660'   => $inc330_660,
            'ft660'        => $ft660,
            'mph660'       => $run['mph660'],
            'inc660_1000'  => $inc660_1000,
            'ft1000'       => $ft1000,
            'mph1000'      => $run['mph1000'],
            'inc1000_1320' => $inc1000_1320,
            'last18'       => $last18,
            'last18mph'    => $last18mph,
            'ft1320'       => $ft1320,
            'mph1320'      => $run['mph1320'],
        ];
    }

    rsa_jsonResponse([
        'eventId'   => $eventId,
        'category'  => $category ?: $classIndex,
        'session'   => $session,
        'mode'      => 'raw',
        'totalRuns' => count($rows),
        'rows'      => $rows,
    ]);
}

// ============================================================================
// GET ?action=divWeatherTimeseries&eventId=N
// Mirrors national weatherTimeseries but queries div_weather_canonical / div_weather_samples
// ============================================================================

function handleDivWeatherTimeseries(PDO $pdoDiv): void {
    $eventId = (int)($_GET['eventId'] ?? 0);
    if ($eventId <= 0) rsa_jsonResponse(['error' => 'eventId is required'], 400);

    $evStmt = $pdoDiv->prepare("
        SELECT e.id, e.event_name, e.start_date_local, e.end_date_local, e.race_lookup,
               t.id AS track_id, t.track_name, t.timezone_iana, t.city, t.state
        FROM div_events e
        JOIN div_tracks t ON t.id = e.track_id
        WHERE e.id = ?
    ");
    $evStmt->execute([$eventId]);
    $event = $evStmt->fetch(PDO::FETCH_ASSOC);
    if (!$event) rsa_jsonResponse(['error' => 'Event not found'], 404);

    $tz = $event['timezone_iana'];
    $startLocal = $event['start_date_local'];
    $endLocal = $event['end_date_local'] ?: $startLocal;
    try {
        $tzObj = new DateTimeZone($tz);
        $startUtc = (new DateTimeImmutable("$startLocal 00:00:00", $tzObj))
            ->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s');
        $endUtc = (new DateTimeImmutable("$endLocal 23:59:59", $tzObj))
            ->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s');
    } catch (Exception $e) {
        rsa_jsonResponse(['error' => 'Timezone error: ' . $e->getMessage()], 500);
    }

    if (!empty($_GET['startUtc'])) $startUtc = $_GET['startUtc'];
    if (!empty($_GET['endUtc'])) $endUtc = $_GET['endUtc'];

    $cnStmt = $pdoDiv->prepare("
        SELECT bucket_utc AS timestamp_utc, temp_f, rh_pct, pressure_inhg,
               'open_meteo' AS canonical_source_kind, NULL AS canonical_source_detail,
               source_count AS sample_count,
               NULL AS station_temp_delta, NULL AS station_humidity_delta, NULL AS station_pressure_delta
        FROM div_weather_canonical
        WHERE event_id = ? AND bucket_utc BETWEEN ? AND ?
        ORDER BY bucket_utc ASC
    ");
    $cnStmt->execute([$eventId, $startUtc, $endUtc]);
    $canonical = $cnStmt->fetchAll(PDO::FETCH_ASSOC);

    $stStmt = $pdoDiv->prepare("
        SELECT timestamp_utc, temp_f, rh_pct, station_pressure_raw
        FROM div_weather_samples
        WHERE event_id = ? AND timestamp_utc BETWEEN ? AND ?
        ORDER BY timestamp_utc ASC
    ");
    $stStmt->execute([$eventId, $startUtc, $endUtc]);
    $stationRaw = $stStmt->fetchAll(PDO::FETCH_ASSOC);

    $hPaToInHg = function($v) { return $v !== null ? round((float)$v * 0.02953, 4) : null; };

    $stationByTs = [];
    foreach ($stationRaw as $s) {
        $epoch = strtotime($s['timestamp_utc']);
        $bucket = date('Y-m-d H:i:s', (int)(round($epoch / 1800) * 1800));
        $stationByTs[$bucket] = $s;
    }

    $points = [];
    $tempSums = ['canonical' => [], 'station' => [], 'backup' => []];
    $rhSums = ['canonical' => [], 'station' => [], 'backup' => []];
    $pressSums = ['canonical' => [], 'station' => [], 'backup' => []];
    $stationCount = 0;
    $prevTs = null;
    $largestGap = 0;
    $largestGapAt = null;
    $sourceBreakdown = [];

    foreach ($canonical as $c) {
        $ts = $c['timestamp_utc'];
        $epoch = strtotime($ts);
        $bucket = date('Y-m-d H:i:s', (int)(round($epoch / 1800) * 1800));

        $cTempF = $c['temp_f'] !== null ? (float)$c['temp_f'] : null;
        $cRhPct = $c['rh_pct'] !== null ? (float)$c['rh_pct'] : null;
        $cPressInhg = $c['pressure_inhg'] !== null ? (float)$c['pressure_inhg'] : null;
        $srcKind = $c['canonical_source_kind'] ?? 'open_meteo';
        $sampleCount = (int)($c['sample_count'] ?? 1);

        $st = $stationByTs[$bucket] ?? null;
        $sTempF = $st ? (float)$st['temp_f'] : null;
        $sRhPct = $st ? (float)$st['rh_pct'] : null;
        $sPressInhg = $st ? $hPaToInHg($st['station_pressure_raw']) : null;
        if ($sTempF !== null) $stationCount++;

        $sourceBreakdown[$srcKind] = ($sourceBreakdown[$srcKind] ?? 0) + 1;

        $points[] = [
            'timestamp_utc' => $ts,
            'canonical_temp_f' => $cTempF,
            'canonical_rh_pct' => $cRhPct,
            'canonical_pressure_inhg' => $cPressInhg,
            'station_temp_f' => $sTempF,
            'station_rh_pct' => $sRhPct,
            'station_pressure_inhg' => $sPressInhg,
            'backup_temp_f' => null,
            'backup_rh_pct' => null,
            'backup_pressure_inhg' => null,
            'station_temp_delta' => null,
            'station_humidity_delta' => null,
            'station_pressure_delta' => null,
            'canonical_source_kind' => $srcKind,
            'sample_count' => $sampleCount,
        ];

        if ($cTempF !== null) $tempSums['canonical'][] = $cTempF;
        if ($cRhPct !== null) $rhSums['canonical'][] = $cRhPct;
        if ($cPressInhg !== null) $pressSums['canonical'][] = $cPressInhg;
        if ($sTempF !== null) $tempSums['station'][] = $sTempF;
        if ($sRhPct !== null) $rhSums['station'][] = $sRhPct;
        if ($sPressInhg !== null) $pressSums['station'][] = $sPressInhg;

        if ($prevTs !== null) {
            $gap = $epoch - strtotime($prevTs);
            if ($gap > $largestGap) { $largestGap = $gap; $largestGapAt = $prevTs; }
        }
        $prevTs = $ts;
    }

    $statHelper = function(array $vals): array {
        if (empty($vals)) return ['min' => null, 'max' => null, 'avg' => null, 'count' => 0];
        return ['min' => round(min($vals), 4), 'max' => round(max($vals), 4), 'avg' => round(array_sum($vals) / count($vals), 4), 'count' => count($vals)];
    };

    $totalPoints = count($points);
    $expectedPoints = $totalPoints > 0 ? max(1, round((strtotime($endUtc) - strtotime($startUtc)) / 1800)) : 0;
    $coveragePct = $expectedPoints > 0 ? round(($totalPoints / $expectedPoints) * 100, 1) : 0;

    $stats = [
        'pointsCount' => $totalPoints,
        'expectedPoints' => (int)$expectedPoints,
        'coveragePct' => min(100, $coveragePct),
        'stationPointsCount' => $stationCount,
        'backupPointsCount' => 0,
        'largestGapMinutes' => round($largestGap / 60, 1),
        'largestGapAt' => $largestGapAt,
        'sourceBreakdown' => $sourceBreakdown,
        'temp' => ['canonical' => $statHelper($tempSums['canonical']), 'station' => $statHelper($tempSums['station']), 'backup' => $statHelper([])],
        'rh'   => ['canonical' => $statHelper($rhSums['canonical']),   'station' => $statHelper($rhSums['station']),   'backup' => $statHelper([])],
        'pressure' => ['canonical' => $statHelper($pressSums['canonical']), 'station' => $statHelper($pressSums['station']), 'backup' => $statHelper([])],
    ];

    rsa_jsonResponse([
        'eventId' => $eventId,
        'event' => [
            'event_name' => $event['event_name'],
            'track_name' => $event['track_name'],
            'city' => $event['city'],
            'state' => $event['state'],
            'start_date_local' => $event['start_date_local'],
            'end_date_local' => $event['end_date_local'],
            'timezone' => $tz,
        ],
        'startUtc' => $startUtc,
        'endUtc' => $endUtc,
        'points' => $points,
        'stats' => $stats,
    ]);
}

// ============================================================================
// GET ?action=divRunsWithWeather
// Returns div_runs rows joined with nearest div_weather_canonical sample.
// Response mirrors the national runsWithWeather shape so the same frontend
// components can render divisional data without modification.
// ============================================================================

function handleDivRunsWithWeather(PDO $pdoDiv): void {
    $raceLookup   = trim($_GET['raceLookup'] ?? '');
    $eventId      = isset($_GET['eventId']) ? (int)$_GET['eventId'] : 0;
    $category     = trim($_GET['category'] ?? '');
    $classIndex   = trim($_GET['classIndex'] ?? '');
    $driverName   = trim($_GET['driverName'] ?? '');
    $lane         = trim($_GET['lane'] ?? '');
    $round        = trim($_GET['round'] ?? '');
    $limit        = min(10000, max(1, (int)($_GET['limit'] ?? 500)));
    $offset       = max(0, (int)($_GET['offset'] ?? 0));

    // Resolve event
    if (!$raceLookup && $eventId > 0) {
        $ev = $pdoDiv->prepare("SELECT race_lookup, nhra_division FROM div_events WHERE id = ?");
        $ev->execute([$eventId]);
        $row = $ev->fetch(PDO::FETCH_ASSOC);
        if (!$row) rsa_jsonResponse(['error' => "Event $eventId not found"], 404);
        $raceLookup = $row['race_lookup'];
    }
    if (!$raceLookup) rsa_jsonResponse(['error' => 'raceLookup or eventId is required'], 400);

    // Determine nhra_division from event
    $evStmt = $pdoDiv->prepare("SELECT id, nhra_division FROM div_events WHERE race_lookup = ? LIMIT 1");
    $evStmt->execute([$raceLookup]);
    $evRow = $evStmt->fetch(PDO::FETCH_ASSOC);
    if (!$evRow) rsa_jsonResponse(['error' => "No event found for raceLookup $raceLookup"], 404);
    $division = $evRow['nhra_division'];

    // Build run filter
    $where  = ['r.race_lookup = ?', 'r.nhra_division = ?'];
    $params = [$raceLookup, $division];

    if ($category)    { $where[] = 'r.category = ?';            $params[] = $category; }
    elseif ($classIndex) { $where[] = 'r.class_index = ?';      $params[] = $classIndex; }
    if ($driverName)  { $where[] = 'r.driver_name LIKE ?';      $params[] = "%$driverName%"; }
    if ($lane)        { $where[] = 'r.lane = ?';                $params[] = $lane; }
    if ($round)       { $where[] = 'r.round = ?';               $params[] = $round; }

    $whereClause = 'WHERE ' . implode(' AND ', $where);

    $countStmt = $pdoDiv->prepare("SELECT COUNT(*) FROM div_runs r $whereClause");
    $countStmt->execute($params);
    $total = (int)$countStmt->fetchColumn();

    $runParams = array_merge($params, [$limit, $offset]);
    $runsStmt = $pdoDiv->prepare("
        SELECT r.id, r.uuid, r.race_lookup, r.nhra_division, r.run_timestamp_utc, r.run_time_local,
               r.category, r.class_index, r.round, r.lane, r.driver_name, r.car_number,
               r.dial_in, r.rt, r.ft60, r.ft330, r.ft660, r.mph660, r.ft1000, r.mph1000,
               r.ft1320, r.mph1320, r.win_flag, r.dq_flag, r.mov, r.place
        FROM div_runs r
        $whereClause
        ORDER BY r.run_timestamp_utc, r.class_index, r.round, r.lane
        LIMIT ? OFFSET ?
    ");
    $runsStmt->execute($runParams);
    $runs = $runsStmt->fetchAll(PDO::FETCH_ASSOC);

    // Load canonical weather for this event to join
    $wxStmt = $pdoDiv->prepare("
        SELECT bucket_utc AS timestamp_utc, temp_f, rh_pct, pressure_inhg
        FROM div_weather_canonical
        WHERE event_id = ?
        ORDER BY bucket_utc
    ");
    $wxStmt->execute([$evRow['id']]);
    $wxRows = $wxStmt->fetchAll(PDO::FETCH_ASSOC);

    // Build time index for nearest-sample lookup
    $wxTimes = array_map(function($w) { return strtotime($w['timestamp_utc']); }, $wxRows);

    $joinedCount = 0;

    foreach ($runs as &$run) {
        $run['source_ref']   = null;
        $run['created_at']   = '';
        $run['incident_count'] = 0;

        // Cast numeric fields
        foreach (['dial_in','rt','ft60','ft330','ft660','mph660','ft1000','mph1000','ft1320','mph1320','mov'] as $f) {
            if ($run[$f] !== null) $run[$f] = (float)$run[$f];
        }
        $run['win_flag'] = (bool)$run['win_flag'];
        $run['dq_flag']  = (bool)$run['dq_flag'];

        // Join nearest canonical weather sample (within 30 min)
        $run['weather'] = null;
        if (!empty($wxRows) && $run['run_timestamp_utc']) {
            $runTs = strtotime($run['run_timestamp_utc']);
            $best  = null;
            $bestDelta = PHP_INT_MAX;
            foreach ($wxRows as $i => $wx) {
                $delta = abs($wxTimes[$i] - $runTs);
                if ($delta < $bestDelta) { $bestDelta = $delta; $best = $wx; }
            }
            if ($best && $bestDelta <= 1800) {
                $run['weather'] = [
                    'timestamp_utc'             => $best['timestamp_utc'],
                    'temp_f'                    => $best['temp_f'] !== null ? (float)$best['temp_f'] : null,
                    'rh_pct'                    => $best['rh_pct'] !== null ? (float)$best['rh_pct'] : null,
                    'pressure_inhg'             => $best['pressure_inhg'] !== null ? (float)$best['pressure_inhg'] : null,
                    'delta_seconds'             => $bestDelta,
                    'canonical_source_kind'     => 'div_canonical',
                    'canonical_source_detail'   => null,
                    'sample_count'              => 1,
                    'sample_sources_json'       => null,
                ];
                $joinedCount++;
            }
        }
    }
    unset($run);

    rsa_jsonResponse([
        'runs'          => $runs,
        'total'         => $total,
        'joinedCount'   => $joinedCount,
        'windowMinutes' => 30,
        'limit'         => $limit,
        'offset'        => $offset,
        'raceLookup'    => $raceLookup,
    ]);
}
