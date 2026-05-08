// Shared utilities for NHRA baseline automation
// All checks are READ-ONLY. No mutations, no writes, no backfills.

import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');

/**
 * Result types for baseline checks
 */
export const Status = {
  PASS: 'PASS',
  FAIL: 'FAIL',
  BLOCKED: 'BLOCKED — ACCESS NEEDED',
  PARTIAL: 'PARTIAL',
  NOT_TESTED: 'NOT TESTED',
};

/**
 * Create a check result object
 */
export function result(name, status, detail = null, missingEnv = null) {
  return { name, status, detail, missingEnv, timestamp: new Date().toISOString() };
}

/**
 * Check which required env vars are missing
 */
export function missingEnvVars(required) {
  return required.filter((v) => !process.env[v]);
}

/**
 * Redact sensitive values from strings
 */
export function redact(str) {
  if (!str) return str;
  return str
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/Authorization:\s*\S+/gi, 'Authorization: [REDACTED]')
    .replace(/rsa_token[=:]\s*\S+/gi, 'rsa_token=[REDACTED]')
    .replace(/"token"\s*:\s*"[^"]+"/gi, '"token":"[REDACTED]"');
}

/**
 * Safe string check — returns true/false without revealing value
 */
export function isNonEmpty(str) {
  return typeof str === 'string' && str.trim().length > 0;
}

export function isNotDefault(str, defaultVal) {
  return isNonEmpty(str) && str !== defaultVal;
}

/**
 * Write results JSON to file
 */
export function writeResults(sectionId, results) {
  const dir = resolve(REPO_ROOT, 'scripts', 'nhra-baseline', 'results');
  mkdirSync(dir, { recursive: true });
  const path = resolve(dir, `${sectionId}.json`);
  writeFileSync(path, JSON.stringify(results, null, 2));
  return path;
}

/**
 * Print a summary table of results
 */
export function printSummary(title, results) {
  const counts = { PASS: 0, FAIL: 0, 'BLOCKED — ACCESS NEEDED': 0, PARTIAL: 0, 'NOT TESTED': 0 };
  console.log(`\n## ${title}`);
  for (const r of results) {
    counts[r.status] = (counts[r.status] || 0) + 1;
    const icon = r.status === 'PASS' ? '✅' : r.status === 'FAIL' ? '❌' : r.status.startsWith('BLOCKED') ? '🔒' : r.status === 'PARTIAL' ? '⚠️' : '⏭️';
    console.log(`  ${icon} ${r.name}: ${r.status}${r.detail ? ' — ' + r.detail : ''}`);
    if (r.missingEnv) {
      console.log(`     Missing env vars: ${r.missingEnv.join(', ')}`);
    }
  }
  console.log(`  Counts: ${counts.PASS} PASS, ${counts.FAIL} FAIL, ${counts['BLOCKED — ACCESS NEEDED']} BLOCKED, ${counts.PARTIAL} PARTIAL, ${counts['NOT TESTED']} NOT TESTED`);
  return counts;
}

export { REPO_ROOT };
