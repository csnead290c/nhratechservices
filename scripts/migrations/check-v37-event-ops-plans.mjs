#!/usr/bin/env node
/**
 * Status check for v37 Event Ops Plans migration (read-only, no changes)
 *
 * Usage:
 *   node scripts/migrations/check-v37-event-ops-plans.mjs
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { existsSync, writeFileSync, unlinkSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PROJECT_ROOT = resolve(__dirname, '../..');
const SHARED_MIGRATION = resolve(PROJECT_ROOT, 'api/migrations/v37-event-ops-plans.php');

console.log('=== v37 Event Ops Plans — Status Check ===\n');

if (!existsSync(SHARED_MIGRATION)) {
  console.error(`ERROR: Migration file not found: ${SHARED_MIGRATION}`);
  process.exit(1);
}

const cliScript = `<?php
$dryRun = true;
require_once __DIR__ . '/../../config.php';
require_once __DIR__ . '/../../functions.php';
require_once __DIR__ . '/v37-event-ops-plans.php';
if (php_sapi_name() !== 'cli') { fwrite(STDERR, "CLI only\\n"); exit(1); }
$pdo = getDB();
$result = v37MigrateEventOpsPlans($pdo, true);
foreach ($result['messages'] as $msg) { echo $msg . "\\n"; }
if (!empty($result['errors'])) {
    foreach ($result['errors'] as $err) { fwrite(STDERR, "ERROR: $err\\n"); }
}
$counts = v37GetEventOpsTableCounts($pdo);
echo "\\nTable row counts:\\n";
foreach ($counts as $t => $c) { echo "  $t: " . ($c === -1 ? 'NOT FOUND' : $c . ' rows') . "\\n"; }
exit(empty($result['errors']) ? 0 : 1);
`;

const scriptPath = resolve(PROJECT_ROOT, 'api/migrations/v37-check-cli.php');
writeFileSync(scriptPath, cliScript);

const proc = spawn(process.env.PHP_PATH || 'php', [scriptPath], {
  cwd: PROJECT_ROOT,
  stdio: 'inherit',
});

proc.on('close', (code) => {
  try { unlinkSync(scriptPath); } catch {}
  process.exit(code ?? 0);
});

proc.on('error', (err) => {
  try { unlinkSync(scriptPath); } catch {}
  console.error(`ERROR: ${err.message}`);
  process.exit(1);
});
