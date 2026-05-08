// check-prod-config.mjs — Verify production api/config.php settings
// READ-ONLY: only greps config.php, never modifies it.
// Never prints JWT_SECRET, DB credentials, or other secret values.

import { execSync } from 'child_process';
import { result, Status, missingEnvVars, isNonEmpty, isNotDefault, writeResults, printSummary } from './shared.mjs';

const REQUIRED_ENV = ['NHRATS_SSH_HOST', 'NHRATS_SSH_USER', 'NHRATS_SSH_API_PATH'];

const TEMPLATE_JWT_DEFAULT = 'rsa_jwt_secret_change_this_in_production_2024';

/**
 * Run an SSH command and return stdout
 */
function sshExec(cmd) {
  const host = process.env.NHRATS_SSH_HOST;
  const port = process.env.NHRATS_SSH_PORT || '22';
  const user = process.env.NHRATS_SSH_USER;
  const sshCmd = `ssh -p ${port} -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new ${user}@${host} '${cmd}'`;
  return execSync(sshCmd, { encoding: 'utf-8', timeout: 30000, maxBuffer: 1024 * 1024 });
}

/**
 * Extract a PHP define value from a grep line
 * Returns the value between the quotes, or null
 */
function extractDefineValue(line, constantName) {
  const regex = new RegExp(`define\\s*\\(\\s*['"]${constantName}['"]\\s*,\\s*['"]([^'"]*)['"]`);
  const match = line.match(regex);
  return match ? match[1] : null;
}

/**
 * Main entry point
 */
async function main() {
  console.log(`\n=== NHRA Production Config Verification ===`);

  const results = [];
  const missing = missingEnvVars(REQUIRED_ENV);

  if (missing.length > 0) {
    console.log(`  🔒 Missing SSH env vars: ${missing.join(', ')}`);
    results.push(result('ALLOWED_ORIGIN', Status.BLOCKED, 'SSH access not configured', missing));
    results.push(result('FRONTEND_URL', Status.BLOCKED, 'SSH access not configured', missing));
    results.push(result('JWT_SECRET (exists)', Status.BLOCKED, 'SSH access not configured', missing));
    results.push(result('JWT_SECRET (not default)', Status.BLOCKED, 'SSH access not configured', missing));
    results.push(result('JWT_SECRET (non-empty)', Status.BLOCKED, 'SSH access not configured', missing));
    printSummary('Production Config', results);
    writeResults('prod-config', results);
    process.exit(0);
  }

  try {
    const apiPath = process.env.NHRATS_SSH_API_PATH;
    const grepCmd = `grep -E "ALLOWED_ORIGIN|FRONTEND_URL|JWT_SECRET" ${apiPath}/config.php`;
    const output = sshExec(grepCmd);
    const lines = output.trim().split('\n');

    // Check ALLOWED_ORIGIN
    const allowedOrigin = extractDefineValue(output, 'ALLOWED_ORIGIN');
    if (allowedOrigin === null) {
      results.push(result('ALLOWED_ORIGIN', Status.FAIL, 'Not found in config.php'));
    } else if (allowedOrigin === '*') {
      results.push(result('ALLOWED_ORIGIN', Status.FAIL, 'Wildcard — must be https://nhratechservices.com'));
    } else if (allowedOrigin === 'https://nhratechservices.com') {
      results.push(result('ALLOWED_ORIGIN', Status.PASS, 'https://nhratechservices.com'));
    } else {
      results.push(result('ALLOWED_ORIGIN', Status.FAIL, `Unexpected value (not nhratechservices.com)`));
    }

    // Check FRONTEND_URL
    const frontendUrl = extractDefineValue(output, 'FRONTEND_URL');
    if (frontendUrl === null) {
      results.push(result('FRONTEND_URL', Status.FAIL, 'Not found in config.php'));
    } else if (frontendUrl === 'https://nhratechservices.com') {
      results.push(result('FRONTEND_URL', Status.PASS, 'https://nhratechservices.com'));
    } else if (frontendUrl.includes('racingsystemsanalysis')) {
      results.push(result('FRONTEND_URL', Status.FAIL, 'Still set to RSA domain'));
    } else {
      results.push(result('FRONTEND_URL', Status.FAIL, `Unexpected value (not nhratechservices.com)`));
    }

    // Check JWT_SECRET
    const jwtSecret = extractDefineValue(output, 'JWT_SECRET');
    if (jwtSecret === null) {
      results.push(result('JWT_SECRET (exists)', Status.FAIL, 'Not found in config.php'));
      results.push(result('JWT_SECRET (not default)', Status.FAIL, 'Not found'));
      results.push(result('JWT_SECRET (non-empty)', Status.FAIL, 'Not found'));
    } else {
      results.push(result('JWT_SECRET (exists)', Status.PASS, 'Present'));
      results.push(result('JWT_SECRET (not default)', isNotDefault(jwtSecret, TEMPLATE_JWT_DEFAULT) ? Status.PASS : Status.FAIL, isNotDefault(jwtSecret, TEMPLATE_JWT_DEFAULT) ? 'Not the template default' : 'Still using template default'));
      results.push(result('JWT_SECRET (non-empty)', isNonEmpty(jwtSecret) ? Status.PASS : Status.FAIL, isNonEmpty(jwtSecret) ? 'Non-empty' : 'Empty'));
    }

  } catch (e) {
    console.log(`  ❌ SSH error: ${e.message}`);
    results.push(result('SSH connection', Status.FAIL, e.message));
    results.push(result('ALLOWED_ORIGIN', Status.BLOCKED, 'SSH connection failed', REQUIRED_ENV));
    results.push(result('FRONTEND_URL', Status.BLOCKED, 'SSH connection failed', REQUIRED_ENV));
    results.push(result('JWT_SECRET', Status.BLOCKED, 'SSH connection failed', REQUIRED_ENV));
  }

  const counts = printSummary('Production Config', results);
  writeResults('prod-config', results);
  process.exit(counts.FAIL > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('Fatal error in check-prod-config.mjs:', e.message);
  process.exit(2);
});
