#!/usr/bin/env node
/**
 * Safe CLI Migration Runner for v41 Event Ops Structured Staffing
 *
 * Requirements:
 *   - CLI-only execution
 *   - Requires --apply flag to make changes (default is dry-run)
 *   - Uses production api/config.php for DB credentials
 *   - Idempotent (safe to run multiple times)
 *   - No destructive SQL (no DROP, TRUNCATE, DELETE)
 *   - Does not seed sample data
 *
 * Usage:
 *   # Dry-run / status check (no changes)
 *   node scripts/migrations/run-v41-event-ops-staffing.mjs
 *
 *   # Apply migration
 *   node scripts/migrations/run-v41-event-ops-staffing.mjs --apply
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { existsSync, writeFileSync, unlinkSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PROJECT_ROOT = resolve(__dirname, '../..');
const SHARED_MIGRATION = resolve(PROJECT_ROOT, 'api/migrations/v41-event-ops-staffing.php');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const DRY_RUN = !APPLY;

console.log('=== v41 Event Ops Structured Staffing Migration Runner ===\n');
console.log(`Mode: ${DRY_RUN ? 'DRY-RUN (status check only)' : 'APPLY (will modify database)'}`);

if (!APPLY) {
  console.log('\nTo apply the migration, run with --apply flag:\n  node scripts/migrations/run-v41-event-ops-staffing.mjs --apply\n');
}

if (!existsSync(SHARED_MIGRATION)) {
  console.error(`ERROR: Shared migration not found: ${SHARED_MIGRATION}`);
  process.exit(1);
}

const cliScript = `<?php
$dryRun = in_array('--dry-run', $argv) || !in_array('--apply', $argv);
require_once __DIR__ . '/../../config.php';
require_once __DIR__ . '/../../functions.php';
require_once __DIR__ . '/v41-event-ops-staffing.php';
if (php_sapi_name() !== 'cli') { fwrite(STDERR, "ERROR: CLI only\\n"); exit(1); }
$pdo = getDB();
$result = v41MigrateEventOpsStaffing($pdo, $dryRun);
foreach ($result['messages'] as $msg) { echo $msg . "\\n"; }
if (!empty($result['errors'])) {
    fwrite(STDERR, "\\nERRORS:\\n");
    foreach ($result['errors'] as $err) { fwrite(STDERR, "  ✗ $err\\n"); }
}
$counts = v41GetEventOpsStaffingTableCounts($pdo);
echo "\\nTable row counts:\\n";
foreach ($counts as $t => $c) { echo "  $t: " . ($c === -1 ? 'NOT FOUND' : $c . ' rows') . "\\n"; }
exit(empty($result['errors']) ? 0 : 1);
`;

const scriptPath = resolve(PROJECT_ROOT, 'api/migrations/v41-run-cli.php');
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
