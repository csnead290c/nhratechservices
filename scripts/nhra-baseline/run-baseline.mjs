#!/usr/bin/env node
// run-baseline.mjs — NHRA Parity Baseline Orchestrator
// Runs all available automated baseline checks and produces a unified report.
// All checks are READ-ONLY. No mutations, no writes, no backfills.
//
// Usage:
//   node scripts/nhra-baseline/run-baseline.mjs [--section=api|db|config|rsa|browser|all]
//   npm run baseline:nhra

import { spawn } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync, mkdirSync, readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const BASELINE_DIR = resolve(__dirname);

const SECTIONS = {
  api:    { script: 'check-api.mjs',          label: 'API Smoke Tests' },
  db:     { script: 'check-db.mjs',           label: 'DB Baseline Row Counts' },
  config: { script: 'check-prod-config.mjs',  label: 'Production Config Verification' },
  rsa:    { script: 'check-rsa-isolation.mjs', label: 'RSA Isolation' },
  browser:{ script: 'check-browser.spec.ts',  label: 'Browser Smoke Tests (Playwright)', runner: 'playwright' },
};

function runNodeScript(scriptPath, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [scriptPath, ...args], {
      cwd: REPO_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });

    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });

    child.on('error', (err) => {
      reject(err);
    });
  });
}

function runPlaywright(scriptPath) {
  return new Promise((resolve) => {
    const child = spawn('npx', ['playwright', 'test', scriptPath, '--config', resolve(REPO_ROOT, 'playwright.config.ts')], {
      cwd: REPO_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, NHRATS_BASE_URL: process.env.NHRATS_BASE_URL || 'https://nhratechservices.com' },
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });

    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });

    child.on('error', (err) => {
      resolve({ code: 2, stdout: '', stderr: `Spawn error: ${err.message}` });
    });
  });
}

async function runSection(id) {
  const section = SECTIONS[id];
  if (!section) {
    console.log(`Unknown section: ${id}`);
    return null;
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Running: ${section.label}`);
  console.log(`${'='.repeat(60)}`);

  const scriptPath = resolve(BASELINE_DIR, section.script);

  let result;
  if (section.runner === 'playwright') {
    result = await runPlaywright(scriptPath);
  } else {
    result = await runNodeScript(scriptPath);
  }

  console.log(result.stdout);
  if (result.stderr) {
    console.error(result.stderr);
  }

  // Try to read JSON results
  let jsonResult = null;
  try {
    const jsonPath = resolve(BASELINE_DIR, 'results', `${id}.json`);
    jsonResult = JSON.parse(readFileSync(jsonPath, 'utf-8'));
  } catch {}

  return {
    section: id,
    label: section.label,
    exitCode: result.code,
    results: jsonResult,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const sectionArg = args.find((a) => a.startsWith('--section='));
  const targetSection = sectionArg ? sectionArg.split('=')[1] : 'all';

  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║     NHRA Parity Baseline Automation — Orchestrator      ║');
  console.log('║     All checks are READ-ONLY. No mutations.             ║');
  console.log('╚══════════════════════════════════════════════════════════╝');

  // Print available env vars (without values)
  const relevantVars = [
    'NHRATS_BASE_URL', 'NHRATS_TEST_EMAIL', 'NHRATS_TEST_PASSWORD',
    'NHRATS_ADMIN_EMAIL', 'NHRATS_ADMIN_PASSWORD',
    'NHRATS_DB_HOST', 'NHRATS_DB_NAME', 'NHRATS_DB_USER',
    'NHRATS_SSH_HOST', 'NHRATS_SSH_USER',
    'RSA_BASE_URL', 'RSA_DB_HOST', 'RSA_DB_NAME',
  ];

  console.log('\nEnvironment status:');
  for (const v of relevantVars) {
    const status = process.env[v] ? '✅ set' : '🔒 not set';
    console.log(`  ${v}: ${status}`);
  }

  const sectionsToRun = targetSection === 'all'
    ? Object.keys(SECTIONS)
    : [targetSection];

  const allResults = [];

  for (const id of sectionsToRun) {
    const sectionResult = await runSection(id);
    if (sectionResult) {
      allResults.push(sectionResult);
    }
  }

  // Write unified report
  const reportDir = resolve(REPO_ROOT, 'scripts', 'nhra-baseline', 'results');
  mkdirSync(reportDir, { recursive: true });

  const report = {
    timestamp: new Date().toISOString(),
    baseUrl: process.env.NHRATS_BASE_URL || 'https://nhratechservices.com',
    hasCredentials: !!(process.env.NHRATS_TEST_EMAIL && process.env.NHRATS_TEST_PASSWORD),
    hasAdminCredentials: !!(process.env.NHRATS_ADMIN_EMAIL && process.env.NHRATS_ADMIN_PASSWORD),
    hasDbAccess: !!(process.env.NHRATS_DB_HOST && process.env.NHRATS_DB_NAME && process.env.NHRATS_DB_USER && process.env.NHRATS_DB_PASSWORD),
    hasSshAccess: !!(process.env.NHRATS_SSH_HOST && process.env.NHRATS_SSH_USER),
    sections: allResults.map((r) => ({
      section: r.section,
      label: r.label,
      exitCode: r.exitCode,
      results: r.results,
    })),
  };

  writeFileSync(resolve(reportDir, 'unified-report.json'), JSON.stringify(report, null, 2));

  // Summary
  console.log(`\n${'='.repeat(60)}`);
  console.log('BASELINE ORCHESTRATOR COMPLETE');
  console.log(`${'='.repeat(60)}`);
  console.log(`Sections run: ${allResults.length}`);
  console.log(`Unified report: scripts/nhra-baseline/results/unified-report.json`);

  const anyFailures = allResults.some((r) => r.exitCode !== 0);
  process.exit(anyFailures ? 1 : 0);
}

main().catch((e) => {
  console.error('Orchestrator fatal error:', e.message);
  process.exit(2);
});
