// check-rsa-isolation.mjs — Verify RSA and NHRATS are isolated
// Checks: HTTP accessibility of both sites, DB separation if credentials available.
// All checks are READ-ONLY.

import { result, Status, missingEnvVars, writeResults, printSummary } from './shared.mjs';

const NHRATS_URL = process.env.NHRATS_BASE_URL || 'https://nhratechservices.com';
const RSA_URL = process.env.RSA_BASE_URL || 'https://racingsystemsanalysis.com';

/**
 * Check if a URL returns HTTP 200
 */
async function checkHttpOk(url, label) {
  try {
    const res = await fetch(url, { method: 'GET', redirect: 'manual' });
    // Accept 200 or redirect (301/302) as "accessible"
    if (res.status === 200 || res.status === 301 || res.status === 302) {
      return result(label, Status.PASS, `HTTP ${res.status}`);
    }
    return result(label, Status.FAIL, `HTTP ${res.status}`);
  } catch (e) {
    return result(label, Status.FAIL, `Network error: ${e.message}`);
  }
}

/**
 * Compare DB row counts between RSA and NHRATS
 */
async function compareDbCounts() {
  const nhratsEnv = ['NHRATS_DB_HOST', 'NHRATS_DB_NAME', 'NHRATS_DB_USER', 'NHRATS_DB_PASSWORD'];
  const rsaEnv = ['RSA_DB_HOST', 'RSA_DB_NAME', 'RSA_DB_USER', 'RSA_DB_PASSWORD'];

  const nhratsMissing = missingEnvVars(nhratsEnv);
  const rsaMissing = missingEnvVars(rsaEnv);

  if (nhratsMissing.length > 0 && rsaMissing.length > 0) {
    return [
      result('DB comparison', Status.BLOCKED, 'Neither NHRATS nor RSA DB credentials available', [...nhratsEnv, ...rsaEnv]),
    ];
  }
  if (nhratsMissing.length > 0) {
    return [
      result('DB comparison', Status.BLOCKED, 'NHRATS DB credentials missing', nhratsEnv),
    ];
  }
  if (rsaMissing.length > 0) {
    return [
      result('DB comparison', Status.BLOCKED, 'RSA DB credentials missing', rsaEnv),
    ];
  }

  let mysql;
  try {
    mysql = await import('mysql2/promise');
  } catch {
    return [
      result('DB comparison', Status.BLOCKED, 'mysql2 package not installed. Run: npm install --save-dev mysql2', ['mysql2 package']),
    ];
  }

  let nhratsConn, rsaConn;
  try {
    nhratsConn = await mysql.createConnection({
      host: process.env.NHRATS_DB_HOST,
      port: parseInt(process.env.NHRATS_DB_PORT || '3306'),
      database: process.env.NHRATS_DB_NAME,
      user: process.env.NHRATS_DB_USER,
      password: process.env.NHRATS_DB_PASSWORD,
      connectTimeout: 10000,
    });
    rsaConn = await mysql.createConnection({
      host: process.env.RSA_DB_HOST,
      port: parseInt(process.env.RSA_DB_PORT || '3306'),
      database: process.env.RSA_DB_NAME,
      user: process.env.RSA_DB_USER,
      password: process.env.RSA_DB_PASSWORD,
      connectTimeout: 10000,
    });
  } catch (e) {
    if (nhratsConn) await nhratsConn.end();
    return [
      result('DB comparison', Status.FAIL, `Connection error: ${e.message}`),
    ];
  }

  const results = [];
  try {
    // Compare DB names
    const [nDb] = await nhratsConn.execute('SELECT DATABASE() AS db');
    const [rDb] = await rsaConn.execute('SELECT DATABASE() AS db');
    const nName = nDb[0].db;
    const rName = rDb[0].db;

    if (nName !== rName) {
      results.push(result('DB names differ', Status.PASS, `NHRATS: ${nName}, RSA: ${rName}`));
    } else {
      results.push(result('DB names differ', Status.FAIL, `Both use same DB: ${nName}`));
    }

    // Compare parity_runs counts
    const [nRuns] = await nhratsConn.execute('SELECT COUNT(*) AS cnt FROM parity_runs');
    const [rRuns] = await rsaConn.execute('SELECT COUNT(*) AS cnt FROM parity_runs');
    const nCount = nRuns[0].cnt;
    const rCount = rRuns[0].cnt;

    results.push(result('parity_runs counts', Status.PASS, `NHRATS: ${nCount}, RSA: ${rCount}`));

    if (nCount !== rCount) {
      results.push(result('DBs are separate', Status.PASS, 'Row counts differ — confirmed separate databases'));
    } else {
      results.push(result('DBs are separate', Status.PARTIAL, 'Row counts match — may be same DB or synced'));
    }

  } finally {
    await nhratsConn.end();
    await rsaConn.end();
  }

  return results;
}

/**
 * Main entry point
 */
async function main() {
  console.log(`\n=== RSA Isolation Check ===`);

  const results = [];

  // HTTP accessibility
  results.push(await checkHttpOk(NHRATS_URL, `NHRATS HTTP (${NHRATS_URL})`));
  results.push(await checkHttpOk(RSA_URL, `RSA HTTP (${RSA_URL})`));

  // DB isolation
  const dbResults = await compareDbCounts();
  results.push(...dbResults);

  // JWT isolation check — can't fully automate without risking token leakage
  results.push(result('JWT isolation', Status.NOT_TESTED, 'Requires cross-site token validation — not automated to avoid token leakage risk'));

  const counts = printSummary('RSA Isolation', results);
  writeResults('rsa-isolation', results);
  process.exit(counts.FAIL > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('Fatal error in check-rsa-isolation.mjs:', e.message);
  process.exit(2);
});
