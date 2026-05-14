#!/usr/bin/env node
/**
 * run-v39-event-ops-post-reports.mjs
 * CLI runner for v39 migration.
 * Defaults to DRY-RUN. Pass --apply to make changes.
 */

import { readFileSync, writeFileSync, unlinkSync } from 'fs';
import { execSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../../');
const CONFIG = resolve(ROOT, 'api/config.php');
const MIGRATION = resolve(ROOT, 'api/migrations/v39-event-ops-post-reports.php');

const args   = process.argv.slice(2);
const apply  = args.includes('--apply');

if (!apply) {
  console.log('DRY-RUN mode (pass --apply to execute migration)');
  console.log('');
}

const configSrc = readFileSync(CONFIG, 'utf8');
const dbMatch   = configSrc.match(/define\s*\(\s*'DB_DSN'\s*,\s*'([^']+)'\s*\)/);
const userMatch = configSrc.match(/define\s*\(\s*'DB_USER'\s*,\s*'([^']+)'\s*\)/);
const passMatch = configSrc.match(/define\s*\(\s*'DB_PASS'\s*,\s*'([^']+)'\s*\)/);

if (!dbMatch || !userMatch || !passMatch) {
  console.error('Could not parse DB credentials from api/config.php');
  process.exit(1);
}

const tmpFile = resolve(tmpdir(), `v39-run-${randomBytes(6).toString('hex')}.php`);

const phpScript = `<?php
define('DB_DSN',  '${dbMatch[1]}');
define('DB_USER', '${userMatch[1]}');
define('DB_PASS', '${passMatch[1]}');

function getDB() {
  return new PDO(DB_DSN, DB_USER, DB_PASS, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
  ]);
}

require_once '${MIGRATION}';

$pdo    = getDB();
$dryRun = ${apply ? 'false' : 'true'};
$result = v39MigrateEventOpsPostReports($pdo, $dryRun);
$counts = v39GetEventOpsPostReportTableCounts($pdo);

foreach ($result['messages'] as $m) { echo $m . PHP_EOL; }
if (!empty($result['errors'])) {
  foreach ($result['errors'] as $e) { echo 'ERROR: ' . $e . PHP_EOL; }
}
echo PHP_EOL;
foreach ($counts as $t => $n) {
  echo $t . ': ' . ($n === -1 ? 'NOT FOUND' : $n . ' rows') . PHP_EOL;
}
`;

writeFileSync(tmpFile, phpScript);
try {
  const out = execSync(`php "${tmpFile}"`, { encoding: 'utf8' });
  console.log(out);
} catch (e) {
  console.error(e.stdout || e.message);
  process.exit(1);
} finally {
  unlinkSync(tmpFile);
}
