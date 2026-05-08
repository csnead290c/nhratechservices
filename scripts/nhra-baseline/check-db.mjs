// check-db.mjs — NHRA Parity database baseline row counts
// ALL CHECKS ARE READ-ONLY SELECT QUERIES.
// No INSERT, UPDATE, DELETE, ALTER, TRUNCATE, DROP, or migration queries.

import { result, Status, missingEnvVars, writeResults, printSummary } from './shared.mjs';

const REQUIRED_ENV = ['NHRATS_DB_HOST', 'NHRATS_DB_NAME', 'NHRATS_DB_USER', 'NHRATS_DB_PASSWORD'];

/**
 * Get a mysql2 connection. Returns null if mysql2 is not installed or credentials missing.
 */
async function getConnection() {
  const missing = missingEnvVars(REQUIRED_ENV);
  if (missing.length > 0) return { error: `Missing env vars: ${missing.join(', ')}`, missing };

  try {
    const mysql = await import('mysql2/promise');
    const conn = await mysql.createConnection({
      host: process.env.NHRATS_DB_HOST,
      port: parseInt(process.env.NHRATS_DB_PORT || '3306'),
      database: process.env.NHRATS_DB_NAME,
      user: process.env.NHRATS_DB_USER,
      password: process.env.NHRATS_DB_PASSWORD,
      connectTimeout: 10000,
    });
    return { conn, mysql };
  } catch (e) {
    if (e.code === 'ERR_MODULE_NOT_FOUND' || e.message?.includes('Cannot find')) {
      return { error: 'mysql2 package not installed. Run: npm install --save-dev mysql2', missing: [] };
    }
    return { error: `Connection failed: ${e.message}`, missing: [] };
  }
}

/**
 * Run a single SELECT and return the count
 */
async function countRows(conn, table) {
  const [rows] = await conn.execute(`SELECT COUNT(*) AS cnt FROM \`${table}\``);
  return rows[0].cnt;
}

/**
 * Main entry point
 */
async function main() {
  console.log(`\n=== NHRA DB Baseline Row Counts ===`);

  const results = [];
  const { conn, error, missing } = await getConnection();

  if (error) {
    console.log(`  🔒 ${error}`);
    const tables = [
      'parity_runs', 'parity_runs_raw', 'parity_run_imports',
      'parity_engine_combos', 'parity_driver_combos', 'parity_events',
      'parity_tracks', 'parity_weather_canonical', 'parity_weather_samples',
      'parity_class_aliases', 'parity_class_defaults',
      'parity_body_styles', 'parity_driver_body_styles',
      'null_race_lookups', 'current_db',
    ];
    for (const t of tables) {
      results.push(result(t, Status.BLOCKED, error, missing.length > 0 ? missing : ['mysql2 package']));
    }
    printSummary('DB Baseline', results);
    writeResults('db', results);
    process.exit(0);
  }

  try {
    // Get current database name
    const [dbRows] = await conn.execute('SELECT DATABASE() AS db');
    const dbName = dbRows[0].db;
    results.push(result('current_db', Status.PASS, dbName));

    // Row counts for all parity tables
    const tables = [
      'parity_runs',
      'parity_runs_raw',
      'parity_run_imports',
      'parity_engine_combos',
      'parity_driver_combos',
      'parity_events',
      'parity_tracks',
      'parity_weather_canonical',
      'parity_weather_samples',
      'parity_class_aliases',
      'parity_class_defaults',
      'parity_body_styles',
      'parity_driver_body_styles',
    ];

    for (const table of tables) {
      try {
        const cnt = await countRows(conn, table);
        results.push(result(table, Status.PASS, `${cnt} rows`));
      } catch (e) {
        results.push(result(table, Status.FAIL, `Query error: ${e.message}`));
      }
    }

    // Check for null race_lookup values
    try {
      const [nullRows] = await conn.execute('SELECT COUNT(*) AS cnt FROM parity_runs WHERE race_lookup IS NULL');
      const nullCount = nullRows[0].cnt;
      if (nullCount === 0) {
        results.push(result('null_race_lookups', Status.PASS, '0 null values'));
      } else {
        results.push(result('null_race_lookups', Status.FAIL, `${nullCount} null race_lookup values found`));
      }
    } catch (e) {
      results.push(result('null_race_lookups', Status.FAIL, `Query error: ${e.message}`));
    }

  } finally {
    await conn.end();
  }

  const counts = printSummary('DB Baseline', results);
  writeResults('db', results);
  process.exit(counts.FAIL > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('Fatal error in check-db.mjs:', e.message);
  process.exit(2);
});
