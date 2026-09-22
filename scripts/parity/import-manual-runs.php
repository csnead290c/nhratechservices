<?php
/**
 * Import timing-system runs from a CSV file into the parity tables.
 *
 * Use this for sessions that never appear in the NHRA OData feed (private
 * tests, rain-outs, match races). Published national event results should
 * still be pulled with the normal ingest path in the parity portal.
 *
 * The CSV uses the same column names as the OData feed, so rows go through
 * parity_normalizeRow() / parity_computeRowHash() / parity_upsertRun() — the
 * same normalization, hashing and merge behaviour as a live ingest. Re-running
 * the same file is therefore idempotent.
 *
 * Two extra columns have no OData equivalent:
 *   Notes  free text stored as a 'note' run flag (shown in the portal).
 *   Flag   'bad' or 'exclude' to also file that flag, using Notes as the reason.
 *
 * Usage (run from the repo root or the api directory on the host):
 *
 *   php scripts/parity/import-manual-runs.php \
 *     --csv=data/parity-imports/20260908-indy-test-session-runs.csv \
 *     --race-lookup=20260908 \
 *     --event="Indy Test Session" \
 *     --track="Lucas Oil Indianapolis Raceway Park" \
 *     --timezone=America/Indiana/Indianapolis \
 *     --label=indy-test-2026 \
 *     --dry-run
 *
 * Options:
 *   --csv           Path to the run CSV (required).
 *   --race-lookup   YYYYMMDD key the runs and event are filed under (required).
 *   --event         Event name; created when missing.
 *   --track         Track name; created when missing.
 *   --timezone      IANA timezone used for local -> UTC conversion.
 *   --lat/--lon     Track coordinates; filled in when the track has none yet
 *                   (the Open-Meteo weather backfill needs them).
 *   --start/--end   Event local dates; default to the race lookup date.
 *   --label         Short tag recorded on the import row.
 *   --force         Allow a second import for a race lookup that already has one.
 *   --dry-run       Roll back instead of committing.
 */

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "This script is CLI-only.\n");
    exit(1);
}

$apiDir = dirname(__DIR__, 2) . '/api';
require_once $apiDir . '/config.php';
require_once $apiDir . '/functions.php';
require_once $apiDir . '/lib/parity.php';

const RUN_CSV_COLUMNS = [
    'TimeStamp', 'Category', 'ClassIndex', 'Round', 'Lane', 'Name', 'CarNumber',
    'RT', 'ft60', 'ft330', 'ft660', 'mph660', 'ft1000', 'mph1000', 'ft1320', 'mph1320',
];

const RUN_FLAG_TYPES = ['bad', 'note', 'exclude'];

/** @return array<string,string> */
function importArgs(array $argv): array {
    $args = [];
    foreach (array_slice($argv, 1) as $arg) {
        if (!str_starts_with($arg, '--')) {
            fwrite(STDERR, "Unrecognized argument: $arg\n");
            exit(1);
        }
        $parts = explode('=', substr($arg, 2), 2);
        $args[$parts[0]] = $parts[1] ?? '1';
    }
    return $args;
}

/** Read the CSV into header-keyed rows, dropping fully blank lines. */
function readRunCsv(string $path): array {
    $handle = fopen($path, 'r');
    if ($handle === false) {
        fwrite(STDERR, "Cannot open CSV: $path\n");
        exit(1);
    }
    $header = fgetcsv($handle);
    if ($header === false) {
        fwrite(STDERR, "CSV is empty: $path\n");
        exit(1);
    }
    $header = array_map(static fn($h) => trim((string)$h), $header);
    $missing = array_diff(RUN_CSV_COLUMNS, $header);
    if ($missing) {
        fwrite(STDERR, "CSV is missing required columns: " . implode(', ', $missing) . "\n");
        exit(1);
    }

    $rows = [];
    while (($line = fgetcsv($handle)) !== false) {
        if (count(array_filter($line, static fn($v) => trim((string)$v) !== '')) === 0) {
            continue;
        }
        $row = [];
        foreach ($header as $i => $name) {
            $value = trim((string)($line[$i] ?? ''));
            $row[$name] = ($value === '') ? null : $value;
        }
        $rows[] = $row;
    }
    fclose($handle);
    return $rows;
}

function upsertRunFlag(PDO $pdo, int $runId, string $flagType, ?string $reason): void {
    $pdo->prepare("
        INSERT INTO parity_run_flags (run_id, flag_type, reason, created_by_user_id)
        VALUES (?, ?, ?, NULL)
        ON DUPLICATE KEY UPDATE reason = VALUES(reason)
    ")->execute([$runId, $flagType, $reason]);
}

function findOrCreateTrack(PDO $pdo, string $trackName, string $timezone, ?float $lat, ?float $lon): int {
    $stmt = $pdo->prepare("SELECT id FROM parity_tracks WHERE track_name = ? LIMIT 1");
    $stmt->execute([$trackName]);
    $id = $stmt->fetchColumn();
    if ($id === false) {
        $pdo->prepare("INSERT INTO parity_tracks (track_name, timezone_iana, latitude, longitude) VALUES (?, ?, ?, ?)")
            ->execute([$trackName, $timezone, $lat, $lon]);
        return (int)$pdo->lastInsertId();
    }
    $id = (int)$id;
    if ($lat !== null && $lon !== null) {
        $pdo->prepare("
            UPDATE parity_tracks SET latitude = ?, longitude = ?
            WHERE id = ? AND (latitude IS NULL OR longitude IS NULL)
        ")->execute([$lat, $lon, $id]);
    }
    return $id;
}

function findOrCreateEvent(
    PDO $pdo,
    string $raceLookup,
    string $eventName,
    int $trackId,
    string $startDate,
    string $endDate
): int {
    $stmt = $pdo->prepare("SELECT id FROM parity_events WHERE race_lookup = ? LIMIT 1");
    $stmt->execute([$raceLookup]);
    $id = $stmt->fetchColumn();
    if ($id !== false) {
        return (int)$id;
    }
    $pdo->prepare("
        INSERT INTO parity_events (event_name, season_year, track_id, start_date_local, end_date_local, race_lookup)
        VALUES (?, ?, ?, ?, ?, ?)
    ")->execute([$eventName, (int)substr($startDate, 0, 4), $trackId, $startDate, $endDate, $raceLookup]);
    return (int)$pdo->lastInsertId();
}

$args = importArgs($argv);
$csvPath = $args['csv'] ?? '';
$raceLookup = $args['race-lookup'] ?? '';
$eventName = $args['event'] ?? '';
$trackName = $args['track'] ?? '';
$timezone = $args['timezone'] ?? 'America/New_York';
$label = $args['label'] ?? 'manual-csv';
$lat = isset($args['lat']) ? (float)$args['lat'] : null;
$lon = isset($args['lon']) ? (float)$args['lon'] : null;
$dryRun = isset($args['dry-run']);
$force = isset($args['force']);

if ($csvPath === '' || $raceLookup === '' || $eventName === '' || $trackName === '') {
    fwrite(STDERR, "Required: --csv, --race-lookup, --event, --track\n");
    exit(1);
}
if (!preg_match('/^\d{8}$/', $raceLookup)) {
    fwrite(STDERR, "--race-lookup must be YYYYMMDD (e.g. 20260908)\n");
    exit(1);
}
try {
    new DateTimeZone($timezone);
} catch (Exception $e) {
    fwrite(STDERR, "Unknown IANA timezone: $timezone\n");
    exit(1);
}

$defaultDate = substr($raceLookup, 0, 4) . '-' . substr($raceLookup, 4, 2) . '-' . substr($raceLookup, 6, 2);
$startDate = $args['start'] ?? $defaultDate;
$endDate = $args['end'] ?? $startDate;

$rows = readRunCsv($csvPath);
if (!$rows) {
    fwrite(STDERR, "No data rows in $csvPath\n");
    exit(1);
}

$pdo = getDB();

$existing = $pdo->prepare("
    SELECT uuid, row_count, fetched_at_utc
    FROM parity_run_imports
    WHERE race_lookup = ? AND status = 'success'
    ORDER BY fetched_at_utc DESC LIMIT 1
");
$existing->execute([$raceLookup]);
$prior = $existing->fetch(PDO::FETCH_ASSOC);
if ($prior && !$force) {
    fwrite(STDERR, sprintf(
        "Race lookup %s already has an import (%s, %d rows, %s). Re-run with --force.\n",
        $raceLookup,
        $prior['uuid'],
        (int)$prior['row_count'],
        $prior['fetched_at_utc']
    ));
    exit(1);
}

$now = gmdate('Y-m-d H:i:s');
$importUuid = parity_generateUUID();
$sourceUrl = 'manual-csv:' . $label . ':' . basename($csvPath);

$pdo->beginTransaction();

$trackId = findOrCreateTrack($pdo, $trackName, $timezone, $lat, $lon);
$eventId = findOrCreateEvent($pdo, $raceLookup, $eventName, $trackId, $startDate, $endDate);

// Track timezone wins over --timezone when the track already existed, so runs
// line up with weather samples already stored for that track.
$tzStmt = $pdo->prepare("SELECT timezone_iana FROM parity_tracks WHERE id = ?");
$tzStmt->execute([$trackId]);
$trackTz = (string)($tzStmt->fetchColumn() ?: $timezone);

// (race_lookup, requested_at_utc) is unique, so a re-run inside the same
// second borrows the next free timestamp rather than failing.
$insertImport = $pdo->prepare("
    INSERT INTO parity_run_imports (uuid, race_lookup, requested_at_utc, fetched_at_utc, status, row_count, source_url, created_by_user_id)
    VALUES (?, ?, ?, ?, 'success', ?, ?, NULL)
");
$requestedAt = $now;
for ($attempt = 0; ; $attempt++) {
    try {
        $insertImport->execute([$importUuid, $raceLookup, $requestedAt, $now, count($rows), $sourceUrl]);
        break;
    } catch (PDOException $e) {
        if ($attempt >= 10 || strpos($e->getMessage(), 'uk_pri_race_fetch') === false) {
            throw $e;
        }
        $requestedAt = gmdate('Y-m-d H:i:s', strtotime($requestedAt . ' UTC') + 1);
    }
}
$importId = (int)$pdo->lastInsertId();

$counts = ['inserted' => 0, 'updated' => 0, 'skipped' => 0];
$flagCount = 0;
foreach ($rows as $index => $raw) {
    $normalized = parity_normalizeRow($raw, $raceLookup);
    if ($normalized['driver_name'] === null) {
        fwrite(STDERR, sprintf("Row %d has no driver name — aborting.\n", $index + 2));
        $pdo->rollBack();
        exit(1);
    }
    $localTime = $normalized['run_timestamp_utc']; // normalizer returns local wall clock
    $utcTime = ($localTime !== null) ? parity_localToUtc($localTime, $trackTz) : null;
    $rowHash = parity_computeRowHash($raceLookup, $normalized, $raw);

    $result = parity_upsertRun($pdo, $normalized, $rowHash, $importId, $raceLookup, $utcTime, $localTime);
    $counts[$result]++;

    $pdo->prepare("
        INSERT INTO parity_runs_raw (uuid, import_id, row_hash, raw_json)
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE raw_json = VALUES(raw_json)
    ")->execute([parity_generateUUID(), $importId, $rowHash, json_encode($raw, JSON_UNESCAPED_SLASHES)]);

    $notes = $raw['Notes'] ?? null;
    $flag = $raw['Flag'] ?? null;
    if ($notes === null && $flag === null) {
        continue;
    }
    if ($flag !== null && !in_array($flag, RUN_FLAG_TYPES, true)) {
        fwrite(STDERR, sprintf("Row %d has unknown Flag '%s'.\n", $index + 2, $flag));
        $pdo->rollBack();
        exit(1);
    }
    $runStmt = $pdo->prepare("SELECT id FROM parity_runs WHERE race_lookup = ? AND row_hash = ? LIMIT 1");
    $runStmt->execute([$raceLookup, $rowHash]);
    $runId = (int)$runStmt->fetchColumn();
    if ($notes !== null) {
        upsertRunFlag($pdo, $runId, 'note', $notes);
        $flagCount++;
    }
    if ($flag !== null && $flag !== 'note') {
        upsertRunFlag($pdo, $runId, $flag, $notes);
        $flagCount++;
    }
}

$pdo->prepare("UPDATE parity_run_imports SET row_count = ? WHERE id = ?")
    ->execute([$counts['inserted'], $importId]);

if ($dryRun) {
    $pdo->rollBack();
} else {
    $pdo->commit();
}

printf(
    "%s  event=%s (id %d)  track=%s (id %d, %s)  import=%s\n  rows=%d inserted=%d updated=%d skipped=%d flags=%d\n",
    $dryRun ? 'DRY RUN (rolled back)' : 'Imported',
    $eventName,
    $eventId,
    $trackName,
    $trackId,
    $trackTz,
    $importUuid,
    count($rows),
    $counts['inserted'],
    $counts['updated'],
    $counts['skipped'],
    $flagCount
);
printf("Next: run the weather backfill for this event in the parity portal.\n");
