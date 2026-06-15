<?php
/**
 * Combo Tuner API
 *
 * Provides analysis and recommendations for engine combo tPower, dPower, and FF tuning.
 * Uses historical event run data to minimize long-term corrected performance spread.
 */

ini_set('display_errors', '0');
error_reporting(E_ALL);

// Respect router's config loading
if (!defined('RSA_CONFIG_LOADED')) {
    require_once 'config.php';
}

// Load functions.php if getDB not available (some servers don't auto-load it)
if (!function_exists('getDB')) {
    require_once 'functions.php';
}

// Load real RSA functions from functions.php if not already loaded
// These provide proper JWT validation, CORS, and JSON response
if (!function_exists('rsa_requireAuth') || !function_exists('rsa_setCorsHeaders') || !function_exists('rsa_jsonResponse')) {
    require_once 'functions.php';
}

// Load capabilities library for rsa_requireAuthAndCap if not already loaded
if (!function_exists('rsa_requireAuthAndCap')) {
    require_once 'lib/capabilities.php';
}

rsa_setCorsHeaders();

$pdo = getDB();
$method = $_SERVER['REQUEST_METHOD'];

// ── Simple auth gate ────────────────────────────────────────────────────
// Page is already gated to admin/owner users, just verify authenticated
$auth = rsa_requireAuth();
if (!$auth) {
    rsa_jsonResponse(['error' => 'Authentication required'], 401);
}

// Get user ID from JWT and verify role from database
$userId = $auth['user_id'] ?? null;
if (!$userId) {
    rsa_jsonResponse(['error' => 'Invalid authentication'], 401);
}

// Resolve numeric user ID
if (!is_numeric($userId)) {
    $clerkId = $auth['clerk_user_id'] ?? str_replace('clerk_', '', $userId);
    $stmt = $pdo->prepare("SELECT id FROM users WHERE clerk_user_id = ?");
    $stmt->execute([$clerkId]);
    $row = $stmt->fetch();
    if (!$row) {
        rsa_jsonResponse(['error' => 'User not found'], 403);
    }
    $userId = (int)$row['id'];
} else {
    $userId = (int)$userId;
}

// Verify admin/owner role from database
$stmt = $pdo->prepare("SELECT role FROM users WHERE id = ?");
$stmt->execute([$userId]);
$row = $stmt->fetch();
$role = $row ? ($row['role'] ?? 'user') : 'user';

if ($role !== 'admin' && $role !== 'owner') {
    rsa_jsonResponse(['error' => 'Insufficient privileges'], 403);
}

// ── Routing ─────────────────────────────────────────────────────────────
$action = $_GET['action'] ?? '';

try {
    switch ($action) {
        case 'comboTunerAnalyze':
            if ($method !== 'GET') { rsa_jsonResponse(['error' => 'Method not allowed'], 405); }
            handleComboTunerAnalyze($pdo);
            break;
        case 'comboTunerRecommend':
            if ($method !== 'GET') { rsa_jsonResponse(['error' => 'Method not allowed'], 405); }
            handleComboTunerRecommend($pdo);
            break;
        case 'comboTunerEvaluate':
            if ($method !== 'GET' && $method !== 'POST') { rsa_jsonResponse(['error' => 'Method not allowed'], 405); }
            handleComboTunerEvaluate($pdo);
            break;
        default:
            rsa_jsonResponse(['error' => 'Unknown action: ' . $action], 400);
    }
} catch (Throwable $e) {
    error_log("combo-tuner.php error: " . $e->getMessage());
    rsa_jsonResponse(['error' => 'Internal server error'], 500);
}

// ============================================================================
// Main Handlers
// ============================================================================

function combosIncludedPayload(array $data): array {
    return array_values(array_map(fn($c) => [
        'comboId' => (int)$c['id'],
        'comboName' => $c['name'],
        'currentTPower' => (float)$c['t_power'],
        'currentDPower' => (float)$c['d_power'],
        'currentFF' => (float)$c['friction_factor'],
        'eventCount' => $c['eventCount'],
        'avgResidual' => round($c['avgResidual'], 6),
        'residualStdDev' => round($c['residualStdDev'], 6),
    ], $data['combos']));
}

function coveragePayload(array $data): array {
    $cov = $data['coverage'];
    $total = max(1, $cov['runsTotal']);
    return [
        'runsTotal' => $cov['runsTotal'],
        'runsResolved' => $cov['runsResolved'],
        'runsWithWeather' => $cov['runsWithWeather'],
        'runsUsable' => $cov['runsUsable'],
        'resolvedPct' => round(100 * $cov['runsResolved'] / $total, 1),
        'weatherPct' => round(100 * $cov['runsWithWeather'] / $total, 1),
        'usablePct' => round(100 * $cov['runsUsable'] / $total, 1),
    ];
}

function comboLabels(array $reportCombos): array {
    return array_values(array_map(fn($c) => $c['name'], $reportCombos));
}

/**
 * Build a chronological per-event parity series for charting.
 * Each point: { event, date, <comboName>: residual|null }.
 */
function buildParitySeries(array $residuals, array $events, array $reportCombos): array {
    $ordered = $events;
    usort($ordered, fn($a, $b) => strcmp($a['start_date_local'] ?? '', $b['start_date_local'] ?? ''));
    $series = [];
    foreach ($ordered as $ev) {
        $eid = $ev['id'];
        $point = [
            'event' => $ev['event_name'] ?: ($ev['race_lookup'] ?? (string)$eid),
            'date'  => $ev['start_date_local'] ?? null,
        ];
        $any = false;
        foreach ($reportCombos as $cid => $c) {
            $val = $residuals[$cid]['byEvent'][$eid] ?? null;
            $point[$c['name']] = ($val !== null) ? round($val, 6) : null;
            if ($val !== null) $any = true;
        }
        if ($any) $series[] = $point;
    }
    return $series;
}

function handleComboTunerAnalyze(PDO $pdo): void {
    $params = parseTunerParams();
    $data = buildTunerData($pdo, $params);

    rsa_jsonResponse([
        'eventsUsed' => $data['eventCount'],
        'runsUsed' => $data['runCount'],
        'targetComboId' => $params['targetComboId'],
        'combosIncluded' => combosIncludedPayload($data),
        'currentStats' => [
            'residualRange' => round($data['stats']['range'], 6),
            'residualStdDev' => round($data['stats']['stddev'], 6),
            'score' => round($data['stats']['score'], 6),
        ],
        'coverage' => coveragePayload($data),
        'excluded' => $data['excluded'] ?? null,
    ]);
}

function handleComboTunerRecommend(PDO $pdo): void {
    $params = parseTunerParams();
    $data = buildTunerData($pdo, $params);
    $search = runParameterSearch($data, $params);

    $tuneIds = array_flip($search['tuneIds']);
    $recommendations = [];
    foreach ($data['combos'] as $cid => $combo) {
        $proposed = $search['proposedParams'][$cid] ?? null;
        if (!$proposed) continue;
        // Only combos that were actually tuned get a non-trivial recommendation;
        // fixed/anchor/non-target combos are reported with zero deltas for context.
        $after = $search['finalResiduals'][$cid]['avg'] ?? $combo['avgResidual'];
        $recommendations[] = [
            'comboId' => (int)$cid,
            'comboName' => $combo['name'],
            'tuned' => isset($tuneIds[$cid]),
            'currentTPower' => (float)$combo['t_power'],
            'currentDPower' => (float)$combo['d_power'],
            'currentFF' => (float)$combo['friction_factor'],
            'proposedTPower' => round($proposed['t_power'], 3),
            'proposedDPower' => round($proposed['d_power'], 3),
            'proposedFF' => round($proposed['ff'], 2),
            'deltaTPower' => round($proposed['t_power'] - (float)$combo['t_power'], 3),
            'deltaDPower' => round($proposed['d_power'] - (float)$combo['d_power'], 3),
            'deltaFF' => round($proposed['ff'] - (float)$combo['friction_factor'], 2),
            'avgResidualBefore' => round($combo['avgResidual'], 6),
            'avgResidualAfter' => round($after, 6),
            'hitBound' => $search['hitBounds'][$cid] ?? null,
        ];
    }

    rsa_jsonResponse([
        'eventsUsed' => $data['eventCount'],
        'runsUsed' => $data['runCount'],
        'mode' => $search['mode'],
        'targetComboId' => $search['targetComboId'],
        'combosIncluded' => combosIncludedPayload($data),
        'currentStats' => [
            'residualRange' => round($data['stats']['range'], 6),
            'residualStdDev' => round($data['stats']['stddev'], 6),
            'score' => round($data['stats']['score'], 6),
        ],
        'proposedStats' => [
            'residualRange' => round($search['stats']['range'], 6),
            'residualStdDev' => round($search['stats']['stddev'], 6),
            'score' => round($search['stats']['score'], 6),
        ],
        'recommendations' => $recommendations,
        'searchMetadata' => [
            'iterations' => $search['iterations'],
            'bestScoreFound' => round($search['bestScore'], 6),
        ],
        'comboLabels' => comboLabels($data['combos']),
        'seriesCurrent' => buildParitySeries($data['residuals'], $data['events'], $data['combos']),
        'seriesProposed' => buildParitySeries($search['finalResiduals'], $data['events'], $data['combos']),
        'coverage' => coveragePayload($data),
        'excluded' => $data['excluded'] ?? null,
    ]);
}

/**
 * Evaluate user-supplied custom params (overrides) without running the optimizer.
 * Reuses the SAME residual definition so the "what-if" exactly matches Analyze.
 * Overrides: JSON object { "<comboId>": { "t": float, "d": float, "ff": float }, ... }
 */
function handleComboTunerEvaluate(PDO $pdo): void {
    $params = parseTunerParams();
    $data = buildTunerData($pdo, $params);

    // Read overrides from query string (GET) or JSON body (POST).
    $overridesRaw = $_GET['overrides'] ?? '';
    if ($overridesRaw === '' && ($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
        $body = json_decode(file_get_contents('php://input') ?: '', true);
        if (is_array($body) && isset($body['overrides'])) {
            $overridesRaw = is_string($body['overrides']) ? $body['overrides'] : json_encode($body['overrides']);
        }
    }
    $overrides = [];
    if ($overridesRaw !== '') {
        $decoded = json_decode($overridesRaw, true);
        if (is_array($decoded)) $overrides = $decoded;
    }

    // Apply overrides (clamped) on top of current params for the full field.
    $evalParams = $data['currentParams'];
    foreach ($overrides as $cid => $o) {
        $cid = (int)$cid;
        if (!isset($evalParams[$cid]) || !is_array($o)) continue;
        if (isset($o['t']))  $evalParams[$cid]['t_power'] = tunerClamp('t_power', (float)$o['t']);
        if (isset($o['d']))  $evalParams[$cid]['d_power'] = tunerClamp('d_power', (float)$o['d']);
        if (isset($o['ff'])) $evalParams[$cid]['ff']      = tunerClamp('ff', (float)$o['ff']);
    }

    $evalResiduals = computeResiduals($data['enrichedByEvent'], $evalParams, $params['metric'], $params['minCombosPerEvent']);

    $evalAvgs = [];
    foreach ($data['combos'] as $cid => $_) {
        if (isset($evalResiduals[$cid])) $evalAvgs[] = $evalResiduals[$cid]['avg'];
    }
    $evalStats = [
        'residualRange' => round((count($evalAvgs) >= 2) ? (max($evalAvgs) - min($evalAvgs)) : 0.0, 6),
        'residualStdDev' => round(stddevOf($evalAvgs), 6),
        'score' => round(((count($evalAvgs) >= 2) ? (max($evalAvgs) - min($evalAvgs)) : 0.0) + 0.35 * stddevOf($evalAvgs), 6),
    ];

    $combos = array_values(array_map(function ($c) use ($evalResiduals, $evalParams) {
        $cid = (int)$c['id'];
        $ep = $evalParams[$cid];
        return [
            'comboId' => $cid,
            'comboName' => $c['name'],
            'currentTPower' => (float)$c['t_power'],
            'currentDPower' => (float)$c['d_power'],
            'currentFF' => (float)$c['friction_factor'],
            'evalTPower' => round($ep['t_power'], 3),
            'evalDPower' => round($ep['d_power'], 3),
            'evalFF' => round($ep['ff'], 2),
            'avgResidualBefore' => round($c['avgResidual'], 6),
            'avgResidualAfter' => round($evalResiduals[$cid]['avg'] ?? $c['avgResidual'], 6),
            'residualStdAfter' => round($evalResiduals[$cid]['std'] ?? 0, 6),
        ];
    }, $data['combos']));

    rsa_jsonResponse([
        'eventsUsed' => $data['eventCount'],
        'runsUsed' => $data['runCount'],
        'combos' => $combos,
        'currentStats' => [
            'residualRange' => round($data['stats']['range'], 6),
            'residualStdDev' => round($data['stats']['stddev'], 6),
            'score' => round($data['stats']['score'], 6),
        ],
        'evalStats' => $evalStats,
        'comboLabels' => comboLabels($data['combos']),
        'seriesCurrent' => buildParitySeries($data['residuals'], $data['events'], $data['combos']),
        'seriesProposed' => buildParitySeries($evalResiduals, $data['events'], $data['combos']),
    ]);
}

// ============================================================================
// Parameter Parsing
// ============================================================================

function parseTunerParams(): array {
    return [
        'category' => $_GET['category'] ?? '',
        'eventWindow' => $_GET['eventWindow'] ?? 'previous20',
        'customEventCount' => isset($_GET['customEventCount']) ? (int)$_GET['customEventCount'] : null,
        'metric' => $_GET['metric'] ?? 'quickest',
        'minEventsPerCombo' => isset($_GET['minEventsPerCombo']) ? (int)$_GET['minEventsPerCombo'] : 3,
        'minCombosPerEvent' => isset($_GET['minCombosPerEvent']) ? (int)$_GET['minCombosPerEvent'] : 2,
        'anchorComboId' => isset($_GET['anchorComboId']) ? (int)$_GET['anchorComboId'] : null,
        'targetComboId' => isset($_GET['targetComboId']) && $_GET['targetComboId'] !== '' ? (int)$_GET['targetComboId'] : null,
        'locks' => [
            'tPower' => ($_GET['lockTPower'] ?? '0') === '1',
            'dPower' => ($_GET['lockDPower'] ?? '0') === '1',
            'ff' => ($_GET['lockFF'] ?? '0') === '1',
        ],
    ];
}

// ============================================================================
// Tuning Engine — shared residual computation & scoring
// ============================================================================
//
// Runs are filtered by the `category` column in SQL (see fetchRunsForEvents),
// so no class->category mapping is needed. Each run is enriched ONCE with its
// resolved engine combo id and nearest weather, then all residual computations
// (Analyze and Recommend) reuse that cached data via computeResiduals().

// Physically "within reason" absolute bounds for proposed parameters.
function tunerBounds(): array {
    return [
        't_power' => [0.30, 1.50],
        'd_power' => [0.70, 1.60],
        'ff'      => [0.0, 30.0],
    ];
}

function tunerClamp(string $key, float $v): float {
    [$lo, $hi] = tunerBounds()[$key];
    return max($lo, min($hi, $v));
}

/** HPC correction using already-fetched weather (no DB). */
function correctRunET(array $run, array $p): ?float {
    return calculateCorrectedET(
        $run['rawET'], $p['t_power'], $p['d_power'], $p['ff'],
        $run['T'], $run['H'], $run['BP']
    );
}

/** Aggregate a combo's corrected ETs for one event per the chosen metric. */
function aggregateETs(array $correctedETs, string $metric): ?float {
    if (empty($correctedETs)) return null;
    sort($correctedETs); // quickest first (lower ET better)
    switch ($metric) {
        case 'avg2': $slice = array_slice($correctedETs, 0, 2); break;
        case 'avg4': $slice = array_slice($correctedETs, 0, 4); break;
        case 'quickest':
        default:     $slice = [$correctedETs[0]]; break;
    }
    return array_sum($slice) / count($slice);
}

function stddevOf(array $values): float {
    $n = count($values);
    if ($n === 0) return 0.0;
    $mean = array_sum($values) / $n;
    $var = 0.0;
    foreach ($values as $v) { $var += ($v - $mean) * ($v - $mean); }
    return sqrt($var / $n);
}

/**
 * Single source of truth for residuals — used by BOTH Analyze and Recommend.
 *
 * For each event, each present combo's corrected ETs are aggregated (metric),
 * the event "field median" is the median of those per-combo aggregates, and a
 * combo's residual for that event = its aggregate − field median. An event only
 * contributes if at least minCombosPerEvent combos are present (so the field
 * median is meaningful).
 *
 * @param array $enrichedByEvent eventId => [ ['cid'=>int,'rawET'=>f,'T'=>f,'H'=>f,'BP'=>f], ... ]
 * @param array $paramsByCombo   comboId => ['t_power'=>,'d_power'=>,'ff'=>]
 * @return array comboId => ['avg'=>float,'std'=>float,'count'=>int,'byEvent'=>[eventId=>residual]]
 */
function computeResiduals(array $enrichedByEvent, array $paramsByCombo, string $metric, int $minCombosPerEvent): array {
    $byCombo = [];
    foreach ($enrichedByEvent as $eventId => $runs) {
        // Group corrected ETs by combo for this event
        $etsByCombo = [];
        foreach ($runs as $r) {
            $cid = $r['cid'];
            $p = $paramsByCombo[$cid] ?? null;
            if (!$p) continue;
            $cet = correctRunET($r, $p);
            if ($cet === null) continue;
            $etsByCombo[$cid][] = $cet;
        }
        // Aggregate per combo
        $aggByCombo = [];
        foreach ($etsByCombo as $cid => $ets) {
            $agg = aggregateETs($ets, $metric);
            if ($agg !== null) $aggByCombo[$cid] = $agg;
        }
        if (count($aggByCombo) < $minCombosPerEvent) continue; // can't form a field
        $fieldMedian = calculateMedian(array_values($aggByCombo));
        foreach ($aggByCombo as $cid => $agg) {
            $byCombo[$cid]['byEvent'][$eventId] = $agg - $fieldMedian;
        }
    }
    // Summaries
    $out = [];
    foreach ($byCombo as $cid => $info) {
        $vals = array_values($info['byEvent']);
        $out[$cid] = [
            'avg' => calculateAverage($vals),
            'std' => stddevOf($vals),
            'count' => count($vals),
            'byEvent' => $info['byEvent'],
        ];
    }
    return $out;
}

/** Param-move penalty relative to current definitions (discourages large moves). */
function movePenalty(array $paramsByCombo, array $currentParams, ?int $onlyComboId = null): float {
    $penalty = 0.0;
    foreach ($paramsByCombo as $cid => $p) {
        if ($onlyComboId !== null && (int)$cid !== $onlyComboId) continue;
        $c = $currentParams[$cid] ?? null;
        if (!$c) continue;
        $penalty += abs($p['t_power'] - $c['t_power']) * 0.010;
        $penalty += abs($p['d_power'] - $c['d_power']) * 0.010;
        $penalty += abs($p['ff'] - $c['ff']) * 0.002;
    }
    return $penalty;
}

/** Relative objective: minimize spread of combo avg residuals across the field. */
function scoreRelative(array $residuals, array $reportCombos, array $paramsByCombo, array $currentParams): float {
    $avgs = [];
    foreach ($reportCombos as $cid => $_) {
        if (isset($residuals[$cid])) $avgs[] = $residuals[$cid]['avg'];
    }
    if (count($avgs) < 2) return PHP_FLOAT_MAX;
    $range = max($avgs) - min($avgs);
    $std = stddevOf($avgs);
    return $range + 0.35 * $std + movePenalty($paramsByCombo, $currentParams);
}

/**
 * Single-combo objective: drive the target combo to match the field (mean ≈ 0)
 * AND be consistent across events/weather (low residual stddev). Other combos
 * are held fixed as the reference field.
 */
function scoreTarget(array $residuals, int $targetId, array $paramsByCombo, array $currentParams): float {
    if (!isset($residuals[$targetId]) || $residuals[$targetId]['count'] < 1) return PHP_FLOAT_MAX;
    $r = $residuals[$targetId];
    return abs($r['avg']) + 0.5 * $r['std'] + movePenalty($paramsByCombo, $currentParams, $targetId);
}

// ============================================================================
// Data Building
// ============================================================================

function buildTunerData(PDO $pdo, array $params): array {
    $combos = fetchEngineCombos($pdo, $params['category']);
    if (empty($combos)) {
        rsa_jsonResponse(['error' => 'No engine combos found for category: ' . $params['category']], 400);
    }

    $events = fetchEventsForWindow($pdo, $params);
    if (empty($events)) {
        rsa_jsonResponse(['error' => 'No events found for specified window'], 400);
    }

    $runs = fetchRunsForEvents($pdo, $events, $params['category']);
    $driverCombos = fetchDriverCombos($pdo);
    $classDefaults = fetchClassDefaults($pdo);

    // ── Enrich runs ONCE: resolve combo + nearest weather, cache raw ET ──
    // All later residual/score computations reuse this cached data (no per-run
    // DB lookups inside the optimizer — the key performance fix).
    $enrichedByEvent = [];
    $coverage = ['runsTotal' => 0, 'runsResolved' => 0, 'runsWithWeather' => 0, 'runsUsable' => 0];
    $excluded = ['combos' => []];
    $failedClassIndices = [];

    foreach ($events as $event) {
        $eventId = $event['id'];
        foreach ($runs[$eventId] ?? [] as $run) {
            $coverage['runsTotal']++;
            $resolved = resolveEngineComboForRun($run['driver_name'], $run['class_index'], $run['run_timestamp_utc'], $driverCombos, $classDefaults);
            if (!$resolved || !isset($combos[$resolved['id']])) {
                $ci = $run['class_index'] ?? '(none)';
                $failedClassIndices[$ci] = ($failedClassIndices[$ci] ?? 0) + 1;
                continue;
            }
            $coverage['runsResolved']++;
            $weather = fetchNearestWeather($pdo, $run['run_timestamp_utc']);
            if (!$weather) continue;
            $coverage['runsWithWeather']++;
            if ($run['ft1320'] === null) continue;
            $enrichedByEvent[$eventId][] = [
                'cid'   => (int)$resolved['id'],
                'rawET' => (float)$run['ft1320'],
                'T'     => (float)$weather['temp_f'],
                'H'     => (float)$weather['rh_pct'],
                'BP'    => (float)$weather['pressure_inhg'],
            ];
            $coverage['runsUsable']++;
        }
    }

    // ── Current params for every combo (the full reference field) ──
    $currentParams = [];
    foreach ($combos as $cid => $c) {
        $currentParams[$cid] = [
            't_power' => (float)$c['t_power'],
            'd_power' => (float)$c['d_power'],
            'ff'      => (float)$c['friction_factor'],
        ];
    }

    // ── Residuals at current params (single source of truth) ──
    $residuals = computeResiduals($enrichedByEvent, $currentParams, $params['metric'], $params['minCombosPerEvent']);

    // ── Filter combos by minimum event participation ──
    $filteredCombos = [];
    foreach ($combos as $cid => $combo) {
        $cnt = $residuals[$cid]['count'] ?? 0;
        if ($cnt < $params['minEventsPerCombo']) {
            $excluded['combos'][] = ['comboId' => $cid, 'comboName' => $combo['name'], 'reason' => 'Insufficient events', 'eventCount' => $cnt];
            continue;
        }
        $filteredCombos[$cid] = $combo;
        $filteredCombos[$cid]['eventCount'] = $cnt;
        $filteredCombos[$cid]['avgResidual'] = $residuals[$cid]['avg'];
        $filteredCombos[$cid]['residualStdDev'] = $residuals[$cid]['std'];
    }

    if (empty($filteredCombos)) {
        $debug = [
            'comboCount' => count($combos),
            'eventCount' => count($events),
            'coverage' => $coverage,
            'failedClassIndices' => $failedClassIndices,
            'comboEventCounts' => array_map(fn($r) => $r['count'], $residuals),
            'minEventsPerCombo' => $params['minEventsPerCombo'],
            'minCombosPerEvent' => $params['minCombosPerEvent'],
        ];
        rsa_jsonResponse(['error' => 'No combos meet minimum event threshold', 'debug' => $debug], 400);
    }

    // ── Field stats at current params (relative spread across reported combos) ──
    $avgResiduals = array_values(array_map(fn($c) => $c['avgResidual'], $filteredCombos));
    $stats = [
        'range'  => (count($avgResiduals) >= 2) ? (max($avgResiduals) - min($avgResiduals)) : 0.0,
        'stddev' => stddevOf($avgResiduals),
    ];
    $stats['score'] = $stats['range'] + 0.35 * $stats['stddev'];

    // Events that actually contributed to the field
    $seenEvents = [];
    foreach ($filteredCombos as $cid => $_) {
        foreach (array_keys($residuals[$cid]['byEvent']) as $eid) { $seenEvents[$eid] = true; }
    }

    return [
        'combos'          => $filteredCombos,   // reported/tunable combos
        'allCombos'       => $combos,           // full field (median reference)
        'currentParams'   => $currentParams,
        'enrichedByEvent' => $enrichedByEvent,
        'residuals'       => $residuals,
        'events'          => $events,
        'eventCount'      => count($seenEvents),
        'runCount'        => $coverage['runsUsable'],
        'coverage'        => $coverage,
        'stats'           => $stats,
        'excluded'        => $excluded,
        'params'          => $params,
    ];
}

// ============================================================================
// Parameter Search
// ============================================================================

function runParameterSearch(array $data, array $params): array {
    $reportCombos  = $data['combos'];        // filtered/reported combos
    $currentParams = $data['currentParams']; // comboId => t/d/ff for FULL field
    $enriched      = $data['enrichedByEvent'];
    $metric        = $params['metric'];
    $minCombos     = $params['minCombosPerEvent'];
    $locks         = $params['locks'];
    $anchorId      = $params['anchorComboId'];
    $targetId      = $params['targetComboId'];

    // Which combos do we tune?
    //  - Target mode: only the chosen combo; all others stay fixed as the field.
    //  - Relative mode: all reported combos except the (optional) anchor.
    $isTarget = ($targetId !== null && isset($reportCombos[$targetId]));
    $tuneIds = [];
    if ($isTarget) {
        $tuneIds = [$targetId];
    } else {
        foreach ($reportCombos as $cid => $_) {
            if ($anchorId && $cid === $anchorId) continue;
            $tuneIds[] = $cid;
        }
    }

    // Score closure — uses the SAME residual definition as Analyze.
    $scoreFn = function (array $p) use ($enriched, $metric, $minCombos, $reportCombos, $currentParams, $isTarget, $targetId) {
        $r = computeResiduals($enriched, $p, $metric, $minCombos);
        return $isTarget
            ? scoreTarget($r, $targetId, $p, $currentParams)
            : scoreRelative($r, $reportCombos, $p, $currentParams);
    };

    // Start at current params for the FULL field (median reference intact).
    $bestParams = $currentParams;
    $bestScore  = $scoreFn($bestParams);
    $iterations = 0;

    // Coordinate descent, iterated to convergence: coarse grid then fine grid.
    $phases = [
        ['t' => generateSteps(-0.15, 0.15, 0.025), 'd' => generateSteps(-0.15, 0.15, 0.025), 'f' => generateSteps(-2.0, 2.0, 0.25)],
        ['t' => generateSteps(-0.03, 0.03, 0.005), 'd' => generateSteps(-0.03, 0.03, 0.005), 'f' => generateSteps(-0.5, 0.5, 0.05)],
    ];
    $axes = [
        ['t_power', 't', 'tPower'],
        ['d_power', 'd', 'dPower'],
        ['ff',      'f', 'ff'],
    ];
    $maxSweeps = 8;

    foreach ($phases as $steps) {
        for ($sweep = 0; $sweep < $maxSweeps; $sweep++) {
            $improved = false;
            foreach ($tuneIds as $cid) {
                foreach ($axes as [$key, $stepKey, $lockKey]) {
                    if ($locks[$lockKey]) continue;
                    $base = $bestParams[$cid][$key];
                    foreach ($steps[$stepKey] as $delta) {
                        $cand = tunerClamp($key, $base + $delta);
                        if ($cand === $bestParams[$cid][$key]) continue;
                        $test = $bestParams;
                        $test[$cid][$key] = $cand;
                        $iterations++;
                        $s = $scoreFn($test);
                        if ($s < $bestScore - 1e-12) { $bestScore = $s; $bestParams = $test; $improved = true; }
                    }
                }
            }
            if (!$improved) break;
        }
    }

    // Final residuals/stats at proposed params (consistent with Analyze).
    $finalResiduals = computeResiduals($enriched, $bestParams, $metric, $minCombos);
    $finalAvgs = [];
    foreach ($reportCombos as $cid => $_) {
        if (isset($finalResiduals[$cid])) $finalAvgs[] = $finalResiduals[$cid]['avg'];
    }
    $finalStats = [
        'range'  => (count($finalAvgs) >= 2) ? (max($finalAvgs) - min($finalAvgs)) : 0.0,
        'stddev' => stddevOf($finalAvgs),
    ];
    $finalStats['score'] = $finalStats['range'] + 0.35 * $finalStats['stddev'];

    // Flag any tuned param that landed on a "within reason" bound.
    $hitBounds = [];
    $bounds = tunerBounds();
    foreach ($tuneIds as $cid) {
        $flags = [];
        foreach (['t_power', 'd_power', 'ff'] as $key) {
            [$lo, $hi] = $bounds[$key];
            $v = $bestParams[$cid][$key];
            if ($v <= $lo + 1e-9 || $v >= $hi - 1e-9) $flags[$key] = true;
        }
        if ($flags) $hitBounds[$cid] = $flags;
    }

    return [
        'proposedParams' => $bestParams,
        'finalResiduals' => $finalResiduals,
        'bestScore'      => $bestScore,
        'iterations'     => $iterations,
        'stats'          => $finalStats,
        'hitBounds'      => $hitBounds,
        'tuneIds'        => $tuneIds,
        'mode'           => $isTarget ? 'target' : 'relative',
        'targetComboId'  => $isTarget ? $targetId : null,
    ];
}

function generateSteps(float $min, float $max, float $step): array {
    $steps = [];
    for ($v = $min; $v <= $max + 0.0001; $v += $step) { $steps[] = round($v, 6); }
    return $steps;
}

// ============================================================================
// Math Helpers
// ============================================================================

function calculateCorrectedET(float $rawET, float $tPower, float $dPower, float $ff, float $tempF, float $rhPct, float $pressInHg): ?float {
    $H = $rhPct / 100;
    $theta = ($tempF + 459.67) / 519.67;
    $vp = $H * (29.98 / exp(35.83 * (212 - $tempF) / pow($tempF + 459.67, 1.152)));
    $delta = ($pressInHg - $vp) / 29.92;
    $hpc = (1 + $ff / 100) * (pow($theta, $tPower) / pow($delta, $dPower)) - $ff / 100;
    if (!($hpc > 0) || !is_finite($hpc)) return null;
    return $rawET * pow($hpc, -0.33);
}

function calculateMedian(array $values): float {
    if (empty($values)) return 0.0;
    sort($values);
    $n = count($values);
    $mid = (int)($n / 2);
    return ($n % 2 === 0) ? ($values[$mid - 1] + $values[$mid]) / 2 : $values[$mid];
}

function calculateAverage(array $values): float {
    if (empty($values)) return 0.0;
    return array_sum($values) / count($values);
}

function calculateStats(array $avgResiduals, ?array $combos = null, ?array $params = null): array {
    if (empty($avgResiduals)) {
        return ['range' => 0, 'stddev' => 0, 'score' => PHP_FLOAT_MAX];
    }
    $min = min($avgResiduals);
    $max = max($avgResiduals);
    $range = $max - $min;
    $mean = array_sum($avgResiduals) / count($avgResiduals);
    $variance = array_sum(array_map(fn($v) => pow($v - $mean, 2), $avgResiduals)) / count($avgResiduals);
    $stddev = sqrt($variance);

    $penalty = 0.0;
    if ($combos && $params) {
        foreach ($combos as $comboId => $combo) {
            $p = $params[$comboId] ?? null;
            if (!$p) continue;
            $penalty += abs($p['t_power'] - $combo['t_power']) * 0.010;
            $penalty += abs($p['d_power'] - $combo['d_power']) * 0.010;
            $penalty += abs($p['ff'] - $combo['friction_factor']) * 0.002;
        }
    }

    return ['range' => $range, 'stddev' => $stddev, 'score' => $range + 0.35 * $stddev + $penalty];
}

// ============================================================================
// Database Helpers
// ============================================================================

function fetchEngineCombos(PDO $pdo, string $category): array {
    $stmt = $pdo->prepare("SELECT id, name, category, t_power, d_power, friction_factor, fuel_type, uses_n2o FROM parity_engine_combos WHERE category = :category ORDER BY name");
    $stmt->execute([':category' => $category]);
    $combos = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) { $combos[(int)$row['id']] = $row; }
    return $combos;
}

function fetchEventsForWindow(PDO $pdo, array $params): array {
    $window = $params['eventWindow'];
    $category = $params['category'];

    // Only include COMPLETED events that actually have runs for this category.
    // This mirrors the long-term parity dashboard (HAVING run_count > 0) and
    // excludes scheduled future events that have no data yet.
    $base = "
        SELECT e.id, e.event_name, e.race_lookup, e.start_date_local, e.end_date_local,
               COUNT(r.id) AS run_count
        FROM parity_events e
        JOIN parity_runs r ON r.race_lookup = e.race_lookup AND r.category = :category
    ";

    if ($window === 'currentSeason') {
        $stmt = $pdo->prepare($base . "
            WHERE e.season_year = :year
            GROUP BY e.id
            HAVING run_count > 0
            ORDER BY e.start_date_local DESC
        ");
        $stmt->execute([':category' => $category, ':year' => (int)date('Y')]);
    } elseif ($window === 'custom' && $params['customEventCount'] > 0) {
        $limit = (int)$params['customEventCount'];
        $stmt = $pdo->prepare($base . "
            GROUP BY e.id
            HAVING run_count > 0
            ORDER BY e.start_date_local DESC
            LIMIT $limit
        ");
        $stmt->execute([':category' => $category]);
    } else {
        // Default: previous 20 completed events with data for this category
        $stmt = $pdo->prepare($base . "
            GROUP BY e.id
            HAVING run_count > 0
            ORDER BY e.start_date_local DESC
            LIMIT 20
        ");
        $stmt->execute([':category' => $category]);
    }

    $events = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) { $events[] = $row; }
    return $events;
}

function fetchRunsForEvents(PDO $pdo, array $events, string $category): array {
    if (empty($events)) return [];
    
    // Build map of race_lookup to event_id
    $raceLookupToEventId = [];
    foreach ($events as $event) {
        if (!empty($event['race_lookup'])) {
            $raceLookupToEventId[$event['race_lookup']] = $event['id'];
        }
    }
    
    if (empty($raceLookupToEventId)) {
        error_log("fetchRunsForEvents: No race_lookups found in events");
        return [];
    }
    
    error_log("fetchRunsForEvents: Looking up runs for race_lookups: " . json_encode(array_keys($raceLookupToEventId)) . " category: $category");
    
    $placeholders = implode(',', array_fill(0, count($raceLookupToEventId), '?'));
    $raceLookups = array_keys($raceLookupToEventId);
    
    // Filter by category directly from the database
    $stmt = $pdo->prepare("SELECT id, race_lookup, run_timestamp_utc, driver_name, class_index, ft1320, mph1320 FROM parity_runs WHERE race_lookup IN ($placeholders) AND category = ? AND ft1320 IS NOT NULL ORDER BY race_lookup, run_timestamp_utc");
    $stmt->execute(array_merge($raceLookups, [$category]));
    
    $runs = [];
    $rowCount = 0;
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $rowCount++;
        $eventId = $raceLookupToEventId[$row['race_lookup']] ?? null;
        if ($eventId === null) {
            error_log("fetchRunsForEvents: No eventId mapping for race_lookup: " . $row['race_lookup']);
            continue;
        }
        if (!isset($runs[$eventId])) $runs[$eventId] = [];
        $runs[$eventId][] = $row;
    }
    
    error_log("fetchRunsForEvents: Found $rowCount total runs for category $category, mapped to " . count($runs) . " events");
    return $runs;
}

function fetchDriverCombos(PDO $pdo): array {
    $stmt = $pdo->query("SELECT dc.id, dc.driver_name, dc.class_index, dc.engine_combo_id, dc.effective_from_utc, dc.effective_to_utc, ec.name as combo_name, ec.t_power, ec.d_power, ec.friction_factor, ec.category FROM parity_driver_combos dc JOIN parity_engine_combos ec ON dc.engine_combo_id = ec.id ORDER BY dc.effective_from_utc DESC");
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

function fetchClassDefaults(PDO $pdo): array {
    $stmt = $pdo->query("SELECT cd.id, cd.class_index, cd.engine_combo_id, cd.effective_from_utc, cd.effective_to_utc, ec.name as combo_name, ec.t_power, ec.d_power, ec.friction_factor, ec.category FROM parity_class_defaults cd JOIN parity_engine_combos ec ON cd.engine_combo_id = ec.id ORDER BY cd.effective_from_utc DESC");
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

function fetchNearestWeather(PDO $pdo, ?string $timestamp): ?array {
    if (!$timestamp) return null;
    // Look up weather by timestamp proximity (canonical table has no event_id).
    // Use positional placeholders bound once per occurrence; named placeholders
    // cannot be reused when PDO emulated prepares are disabled (HY093).
    static $stmt = null;
    if ($stmt === null) {
        $stmt = $pdo->prepare("
            SELECT temp_f, rh_pct, pressure_inhg 
            FROM parity_weather_canonical 
            WHERE timestamp_utc BETWEEN DATE_SUB(?, INTERVAL 30 MINUTE) AND DATE_ADD(?, INTERVAL 30 MINUTE)
            ORDER BY ABS(TIMESTAMPDIFF(SECOND, timestamp_utc, ?)) ASC 
            LIMIT 1
        ");
    }
    $stmt->execute([$timestamp, $timestamp, $timestamp]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

function resolveEngineComboForRun(?string $driverName, ?string $classIndex, ?string $runTimestamp, array $driverCombos, array $classDefaults): ?array {
    if (!$driverName || !$classIndex || !$runTimestamp) return null;
    $dn = strtoupper($driverName);
    $ci = strtoupper($classIndex);
    $runTs = strtotime($runTimestamp);
    if ($runTs === false) return null;

    $matches = [];
    foreach ($driverCombos as $dc) {
        if (strtoupper($dc['driver_name']) !== $dn || strtoupper($dc['class_index']) !== $ci) continue;
        $from = strtotime($dc['effective_from_utc']);
        $to = $dc['effective_to_utc'] ? strtotime($dc['effective_to_utc']) : PHP_INT_MAX;
        if ($runTs >= $from && $runTs < $to) $matches[] = $dc;
    }
    if (!empty($matches)) {
        usort($matches, fn($a, $b) => strtotime($b['effective_from_utc']) <=> strtotime($a['effective_from_utc']));
        return ['id' => (int)$matches[0]['engine_combo_id'], 'name' => $matches[0]['combo_name'], 't_power' => (float)$matches[0]['t_power'], 'd_power' => (float)$matches[0]['d_power'], 'friction_factor' => (float)$matches[0]['friction_factor'], 'category' => $matches[0]['category']];
    }

    $matches = [];
    foreach ($classDefaults as $cd) {
        if (strtoupper($cd['class_index']) !== $ci) continue;
        $from = $cd['effective_from_utc'] ? strtotime($cd['effective_from_utc']) : 0;
        $to = $cd['effective_to_utc'] ? strtotime($cd['effective_to_utc']) : PHP_INT_MAX;
        if ($runTs >= $from && $runTs < $to) $matches[] = $cd;
    }
    if (!empty($matches)) {
        usort($matches, fn($a, $b) => strtotime($b['effective_from_utc'] ?? '1970-01-01') <=> strtotime($a['effective_from_utc'] ?? '1970-01-01'));
        return ['id' => (int)$matches[0]['engine_combo_id'], 'name' => $matches[0]['combo_name'], 't_power' => (float)$matches[0]['t_power'], 'd_power' => (float)$matches[0]['d_power'], 'friction_factor' => (float)$matches[0]['friction_factor'], 'category' => $matches[0]['category']];
    }
    return null;
}
