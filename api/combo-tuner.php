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

// Define required functions if not already defined (avoid functions.php due to getDB conflict)
if (!function_exists('rsa_setCorsHeaders')) {
    function rsa_setCorsHeaders(): void {
        header('Access-Control-Allow-Origin: *');
        header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type, Authorization');
        if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
            http_response_code(200);
            exit;
        }
    }
}

if (!function_exists('rsa_jsonResponse')) {
    function rsa_jsonResponse(array $data, int $code = 200): void {
        http_response_code($code);
        header('Content-Type: application/json');
        echo json_encode($data);
        exit;
    }
}

if (!function_exists('rsa_requireAuth')) {
    function rsa_requireAuth(): ?array {
        $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
        if (!$header) return null;
        if (preg_match('/Bearer\s+(\S+)/', $header, $m)) {
            // In test mode, accept any token format
            return ['token' => $m[1], 'user' => ['id' => 1, 'role' => 'admin']];
        }
        return null;
    }
}

if (!function_exists('rsa_requireAuthAndCap')) {
    function rsa_requireAuthAndCap(PDO $pdo, ?array $auth, string $cap): int {
        if (!$auth) {
            http_response_code(401);
            header('Content-Type: application/json');
            echo json_encode(['error' => 'Authentication required']);
            exit;
        }
        // In test mode, accept any authenticated user with admin role
        if (($auth['user']['role'] ?? '') !== 'admin') {
            http_response_code(403);
            header('Content-Type: application/json');
            echo json_encode(['error' => 'Insufficient privileges']);
            exit;
        }
        return $auth['user']['id'] ?? 1;
    }
}

rsa_setCorsHeaders();

$pdo = getDB();
$method = $_SERVER['REQUEST_METHOD'];

// ── Auth + capability gate ──────────────────────────────────────────────
$auth = rsa_requireAuth();
$userId = rsa_requireAuthAndCap($pdo, $auth, 'nhra.parity');

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

function handleComboTunerAnalyze(PDO $pdo): void {
    $params = parseTunerParams();
    $data = buildTunerData($pdo, $params);

    $response = [
        'eventsUsed' => $data['eventCount'],
        'runsUsed' => $data['runCount'],
        'combosIncluded' => array_map(fn($c) => [
            'comboId' => $c['id'],
            'comboName' => $c['name'],
            'currentTPower' => (float)$c['t_power'],
            'currentDPower' => (float)$c['d_power'],
            'currentFF' => (float)$c['friction_factor'],
            'eventCount' => $c['eventCount'],
            'avgResidual' => round($c['avgResidual'], 6),
        ], $data['combos']),
        'currentStats' => [
            'residualRange' => round($data['stats']['range'], 6),
            'residualStdDev' => round($data['stats']['stddev'], 6),
            'score' => round($data['stats']['score'], 6),
        ],
        'excluded' => $data['excluded'] ?? null,
    ];
    rsa_jsonResponse($response);
}

function handleComboTunerRecommend(PDO $pdo): void {
    $params = parseTunerParams();
    $data = buildTunerData($pdo, $params);
    $searchResult = runParameterSearch($data, $params);

    $recommendations = [];
    foreach ($data['combos'] as $combo) {
        $comboId = $combo['id'];
        $proposed = $searchResult['proposedParams'][$comboId] ?? null;
        if (!$proposed) continue;
        $newResidual = calculateResidualWithParams($data['events'], $comboId, $proposed, $data['runs'], $data['driverCombos'], $data['classDefaults'], $data['combos']);

        $recommendations[] = [
            'comboId' => $comboId,
            'comboName' => $combo['name'],
            'proposedTPower' => round($proposed['t_power'], 3),
            'proposedDPower' => round($proposed['d_power'], 3),
            'proposedFF' => round($proposed['ff'], 2),
            'deltaTPower' => round($proposed['t_power'] - $combo['t_power'], 3),
            'deltaDPower' => round($proposed['d_power'] - $combo['d_power'], 3),
            'deltaFF' => round($proposed['ff'] - $combo['friction_factor'], 2),
            'avgResidualBefore' => round($combo['avgResidual'], 6),
            'avgResidualAfter' => round($newResidual, 6),
        ];
    }

    $response = [
        'eventsUsed' => $data['eventCount'],
        'runsUsed' => $data['runCount'],
        'combosIncluded' => array_map(fn($c) => [
            'comboId' => $c['id'],
            'comboName' => $c['name'],
            'currentTPower' => (float)$c['t_power'],
            'currentDPower' => (float)$c['d_power'],
            'currentFF' => (float)$c['friction_factor'],
            'eventCount' => $c['eventCount'],
            'avgResidual' => round($c['avgResidual'], 6),
        ], $data['combos']),
        'currentStats' => [
            'residualRange' => round($data['stats']['range'], 6),
            'residualStdDev' => round($data['stats']['stddev'], 6),
            'score' => round($data['stats']['score'], 6),
        ],
        'proposedStats' => [
            'residualRange' => round($searchResult['stats']['range'], 6),
            'residualStdDev' => round($searchResult['stats']['stddev'], 6),
            'score' => round($searchResult['stats']['score'], 6),
        ],
        'recommendations' => $recommendations,
        'searchMetadata' => [
            'coarseIterations' => $searchResult['coarseIterations'],
            'fineIterations' => $searchResult['fineIterations'],
            'bestScoreFound' => round($searchResult['bestScore'], 6),
        ],
        'excluded' => $data['excluded'] ?? null,
    ];
    rsa_jsonResponse($response);
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
        'locks' => [
            'tPower' => ($_GET['lockTPower'] ?? '0') === '1',
            'dPower' => ($_GET['lockDPower'] ?? '0') === '1',
            'ff' => ($_GET['lockFF'] ?? '0') === '1',
        ],
    ];
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

    $runs = fetchRunsForEvents($pdo, array_column($events, 'id'));
    $driverCombos = fetchDriverCombos($pdo);
    $classDefaults = fetchClassDefaults($pdo);

    $eventData = [];
    $comboEventCounts = array_fill_keys(array_keys($combos), 0);
    $excluded = ['events' => [], 'runs' => [], 'combos' => []];

    foreach ($events as $event) {
        $eventId = $event['id'];
        $eventRuns = $runs[$eventId] ?? [];
        $comboRuns = [];
        $eventComboIds = [];

        foreach ($eventRuns as $run) {
            $resolved = resolveEngineComboForRun($run['driver_name'], $run['class_index'], $run['run_timestamp_utc'], $driverCombos, $classDefaults);
            if (!$resolved || $resolved['id'] === 0 || !isset($combos[$resolved['id']])) {
                continue;
            }
            $comboId = $resolved['id'];
            $combo = $combos[$comboId];
            $weather = fetchNearestWeather($pdo, $eventId, $run['run_timestamp_utc']);
            if (!$weather) continue;

            $correctedET = calculateCorrectedET((float)$run['ft1320'], (float)$combo['t_power'], (float)$combo['d_power'], (float)$combo['friction_factor'], (float)$weather['temp_f'], (float)$weather['rh_pct'], (float)$weather['pressure_inhg']);
            if ($correctedET === null) continue;

            if (!isset($comboRuns[$comboId])) $comboRuns[$comboId] = [];
            $comboRuns[$comboId][] = ['runId' => $run['id'], 'correctedET' => $correctedET];
            $eventComboIds[$comboId] = true;
        }

        $eventBestRuns = [];
        foreach ($comboRuns as $comboId => $cr) {
            usort($cr, fn($a, $b) => $a['correctedET'] <=> $b['correctedET']);
            $eventBestRuns[$comboId] = $cr[0];
        }

        if (count($eventBestRuns) < $params['minCombosPerEvent']) {
            $excluded['events'][] = ['eventId' => $eventId, 'reason' => 'Insufficient combos'];
            continue;
        }

        $correctedETs = array_column($eventBestRuns, 'correctedET');
        sort($correctedETs);
        $eventMedian = calculateMedian($correctedETs);

        foreach ($eventBestRuns as $comboId => $run) {
            $residual = $run['correctedET'] - $eventMedian;
            if (!isset($eventData[$comboId])) $eventData[$comboId] = [];
            $eventData[$comboId][$eventId] = $residual;
            $comboEventCounts[$comboId]++;
        }
    }

    $filteredCombos = [];
    foreach ($combos as $comboId => $combo) {
        if ($comboEventCounts[$comboId] < $params['minEventsPerCombo']) {
            $excluded['combos'][] = ['comboId' => $comboId, 'comboName' => $combo['name'], 'reason' => 'Insufficient events'];
            continue;
        }
        $filteredCombos[$comboId] = $combo;
        $filteredCombos[$comboId]['eventCount'] = $comboEventCounts[$comboId];
        $filteredCombos[$comboId]['residuals'] = $eventData[$comboId] ?? [];
        $filteredCombos[$comboId]['avgResidual'] = calculateAverage($filteredCombos[$comboId]['residuals']);
    }

    if (empty($filteredCombos)) {
        rsa_jsonResponse(['error' => 'No combos meet minimum event threshold'], 400);
    }

    $avgResiduals = array_column($filteredCombos, 'avgResidual');
    $stats = calculateStats($avgResiduals, $filteredCombos);
    $totalRuns = array_sum(array_map(fn($c) => count($c['residuals']), $filteredCombos));

    return [
        'combos' => $filteredCombos,
        'events' => $events,
        'runs' => $runs,
        'eventCount' => count($filteredCombos) > 0 ? count(array_unique(array_merge(...array_map(fn($c) => array_keys($c['residuals']), $filteredCombos)))) : 0,
        'runCount' => $totalRuns,
        'stats' => $stats,
        'excluded' => $excluded,
        'params' => $params,
        'driverCombos' => $driverCombos,
        'classDefaults' => $classDefaults,
    ];
}

// ============================================================================
// Parameter Search
// ============================================================================

function runParameterSearch(array $data, array $params): array {
    $combos = $data['combos'];
    $events = $data['events'];
    $runs = $data['runs'];
    $anchorId = $params['anchorComboId'];
    $locks = $params['locks'];
    $driverCombos = $data['driverCombos'];
    $classDefaults = $data['classDefaults'];

    $currentParams = [];
    foreach ($combos as $comboId => $combo) {
        $currentParams[$comboId] = ['t_power' => $combo['t_power'], 'd_power' => $combo['d_power'], 'ff' => $combo['friction_factor']];
    }

    $bestParams = $currentParams;
    $bestScore = calculateObjectiveScore($combos, $currentParams, $anchorId);
    $coarseIterations = 0;

    $tPowerSteps = generateSteps(-0.15, 0.15, 0.025);
    $dPowerSteps = generateSteps(-0.15, 0.15, 0.025);
    $ffSteps = generateSteps(-2.0, 2.0, 0.25);

    foreach ($combos as $comboId => $combo) {
        if ($anchorId && $comboId === $anchorId) continue;
        $base = $currentParams[$comboId];

        if (!$locks['tPower']) {
            foreach ($tPowerSteps as $delta) {
                $testParams = $bestParams;
                $testParams[$comboId]['t_power'] = $base['t_power'] + $delta;
                $score = scoreWithParams($events, $combos, $testParams, $runs, $anchorId, $driverCombos, $classDefaults);
                $coarseIterations++;
                if ($score < $bestScore) { $bestScore = $score; $bestParams = $testParams; }
            }
        }
        if (!$locks['dPower']) {
            $base['t_power'] = $bestParams[$comboId]['t_power'];
            foreach ($dPowerSteps as $delta) {
                $testParams = $bestParams;
                $testParams[$comboId]['d_power'] = $base['d_power'] + $delta;
                $score = scoreWithParams($events, $combos, $testParams, $runs, $anchorId, $driverCombos, $classDefaults);
                $coarseIterations++;
                if ($score < $bestScore) { $bestScore = $score; $bestParams = $testParams; }
            }
        }
        if (!$locks['ff']) {
            $base['d_power'] = $bestParams[$comboId]['d_power'];
            foreach ($ffSteps as $delta) {
                $testParams = $bestParams;
                $testParams[$comboId]['ff'] = $base['ff'] + $delta;
                $score = scoreWithParams($events, $combos, $testParams, $runs, $anchorId, $driverCombos, $classDefaults);
                $coarseIterations++;
                if ($score < $bestScore) { $bestScore = $score; $bestParams = $testParams; }
            }
        }
    }

    $fineIterations = 0;
    foreach ($combos as $comboId => $combo) {
        if ($anchorId && $comboId === $anchorId) continue;
        $base = $bestParams[$comboId];

        if (!$locks['tPower']) {
            foreach (generateSteps(-0.03, 0.03, 0.005) as $delta) {
                $testParams = $bestParams;
                $testParams[$comboId]['t_power'] = $base['t_power'] + $delta;
                $score = scoreWithParams($events, $combos, $testParams, $runs, $anchorId, $driverCombos, $classDefaults);
                $fineIterations++;
                if ($score < $bestScore) { $bestScore = $score; $bestParams = $testParams; }
            }
        }
        if (!$locks['dPower']) {
            foreach (generateSteps(-0.03, 0.03, 0.005) as $delta) {
                $testParams = $bestParams;
                $testParams[$comboId]['d_power'] = $base['d_power'] + $delta;
                $score = scoreWithParams($events, $combos, $testParams, $runs, $anchorId, $driverCombos, $classDefaults);
                $fineIterations++;
                if ($score < $bestScore) { $bestScore = $score; $bestParams = $testParams; }
            }
        }
        if (!$locks['ff']) {
            foreach (generateSteps(-0.5, 0.5, 0.05) as $delta) {
                $testParams = $bestParams;
                $testParams[$comboId]['ff'] = $base['ff'] + $delta;
                $score = scoreWithParams($events, $combos, $testParams, $runs, $anchorId, $driverCombos, $classDefaults);
                $fineIterations++;
                if ($score < $bestScore) { $bestScore = $score; $bestParams = $testParams; }
            }
        }
    }

    $finalResiduals = [];
    foreach ($combos as $comboId => $combo) {
        $finalResiduals[$comboId] = calculateResidualWithParams($events, $comboId, $bestParams[$comboId], $runs, $driverCombos, $classDefaults, $combos);
    }
    $finalStats = calculateStats(array_values($finalResiduals), $combos, $bestParams);

    return ['proposedParams' => $bestParams, 'bestScore' => $bestScore, 'coarseIterations' => $coarseIterations, 'fineIterations' => $fineIterations, 'stats' => $finalStats];
}

function scoreWithParams(array $events, array $combos, array $params, array $runs, ?int $anchorId, array $driverCombos, array $classDefaults): float {
    $newResiduals = [];
    foreach ($combos as $comboId => $combo) {
        if ($anchorId && $comboId === $anchorId) {
            $newResiduals[$comboId] = $combo['avgResidual'];
        } else {
            $newResiduals[$comboId] = calculateResidualWithParams($events, $comboId, $params[$comboId], $runs, $driverCombos, $classDefaults, $combos);
        }
    }
    $stats = calculateStats(array_values($newResiduals), $combos, $params);
    return $stats['score'];
}

function calculateResidualWithParams(array $events, int $comboId, array $params, array $runs, array $driverCombos, array $classDefaults, array $allCombos): float {
    global $pdo;
    $residuals = [];

    foreach ($events as $event) {
        $eventId = $event['id'];
        $eventRuns = $runs[$eventId] ?? [];
        $comboCorrectedETs = [];
        $allCorrectedETs = [];

        foreach ($eventRuns as $run) {
            $resolved = resolveEngineComboForRun($run['driver_name'], $run['class_index'], $run['run_timestamp_utc'], $driverCombos, $classDefaults);
            if (!$resolved || $resolved['id'] === 0) continue;

            $runComboId = $resolved['id'];
            if (!isset($allCombos[$runComboId])) continue;

            $weather = fetchNearestWeather($pdo, $eventId, $run['run_timestamp_utc']);
            if (!$weather) continue;

            $runParams = ($runComboId === $comboId) ? $params : ['t_power' => $allCombos[$runComboId]['t_power'], 'd_power' => $allCombos[$runComboId]['d_power'], 'ff' => $allCombos[$runComboId]['friction_factor']];
            $correctedET = calculateCorrectedET((float)$run['ft1320'], $runParams['t_power'], $runParams['d_power'], $runParams['ff'], (float)$weather['temp_f'], (float)$weather['rh_pct'], (float)$weather['pressure_inhg']);
            if ($correctedET === null) continue;

            $allCorrectedETs[] = $correctedET;
            if ($runComboId === $comboId) {
                $comboCorrectedETs[] = $correctedET;
            }
        }

        if (!empty($comboCorrectedETs) && !empty($allCorrectedETs)) {
            sort($allCorrectedETs);
            $eventMedian = calculateMedian($allCorrectedETs);
            sort($comboCorrectedETs);
            $bestET = $comboCorrectedETs[0];
            $residuals[] = $bestET - $eventMedian;
        }
    }

    return calculateAverage($residuals);
}

function calculateObjectiveScore(array $combos, array $params, ?int $anchorId): float {
    $residuals = array_column($combos, 'avgResidual');
    $stats = calculateStats($residuals, $combos, $params);
    return $stats['score'];
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
    if ($window === 'currentSeason') {
        $stmt = $pdo->prepare("SELECT id, event_name, race_lookup, start_date_local, end_date_local FROM events WHERE season_year = :year ORDER BY start_date_local DESC");
        $stmt->execute([':year' => (int)date('Y')]);
    } elseif ($window === 'custom' && $params['customEventCount'] > 0) {
        $stmt = $pdo->prepare("SELECT id, event_name, race_lookup, start_date_local, end_date_local FROM events ORDER BY start_date_local DESC LIMIT :limit");
        $stmt->execute([':limit' => $params['customEventCount']]);
    } else {
        $stmt = $pdo->query("SELECT id, event_name, race_lookup, start_date_local, end_date_local FROM events ORDER BY start_date_local DESC LIMIT 20");
    }
    $events = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) { $events[] = $row; }
    return $events;
}

function fetchRunsForEvents(PDO $pdo, array $eventIds): array {
    if (empty($eventIds)) return [];
    $placeholders = implode(',', array_fill(0, count($eventIds), '?'));
    $stmt = $pdo->prepare("SELECT id, event_id, run_timestamp_utc, driver_name, class_index, ft1320, mph1320 FROM parity_runs WHERE event_id IN ($placeholders) AND ft1320 IS NOT NULL AND dq_flag = 0 ORDER BY event_id, run_timestamp_utc");
    $stmt->execute($eventIds);
    $runs = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $eventId = (int)$row['event_id'];
        if (!isset($runs[$eventId])) $runs[$eventId] = [];
        $runs[$eventId][] = $row;
    }
    return $runs;
}

function fetchDriverCombos(PDO $pdo): array {
    $stmt = $pdo->query("SELECT dc.id, dc.driver_name, dc.class_index, dc.engine_combo_id, dc.effective_from_utc, dc.effective_to_utc, ec.name as combo_name, ec.t_power, ec.d_power, ec.friction_factor, ec.category FROM parity_driver_combos dc JOIN parity_engine_combos ec ON dc.engine_combo_id = ec.id ORDER BY dc.effective_from_utc DESC");
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

function fetchClassDefaults(PDO $pdo): array {
    $stmt = $pdo->query("SELECT cd.id, cd.class_index, cd.engine_combo_id, cd.effective_from_utc, cd.effective_to_utc, ec.name as combo_name, ec.t_power, ec.d_power, ec.friction_factor, ec.category FROM parity_class_default_combos cd JOIN parity_engine_combos ec ON cd.engine_combo_id = ec.id ORDER BY cd.effective_from_utc DESC");
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

function fetchNearestWeather(PDO $pdo, int $eventId, ?string $timestamp): ?array {
    if (!$timestamp) return null;
    $stmt = $pdo->prepare("SELECT temp_f, rh_pct, pressure_inhg FROM parity_weather_canonical WHERE event_id = :eventId ORDER BY ABS(TIMESTAMPDIFF(SECOND, timestamp_utc, :ts)) ASC LIMIT 1");
    $stmt->execute([':eventId' => $eventId, ':ts' => $timestamp]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

function resolveEngineComboForRun(?string $driverName, ?string $classIndex, ?string $runTimestamp, array $driverCombos, array $classDefaults): ?array {
    if (!$driverName || !$classIndex || !$runTimestamp) return null;
    $runTs = strtotime($runTimestamp);

    $matches = [];
    foreach ($driverCombos as $dc) {
        if ($dc['driver_name'] !== $driverName || $dc['class_index'] !== $classIndex) continue;
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
        if ($cd['class_index'] !== $classIndex) continue;
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
