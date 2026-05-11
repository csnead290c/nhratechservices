#!/usr/bin/env node
/**
 * Safe Read-Only Status Check for v35 Rules Foundation Migration
 * 
 * Checks whether rules and rule_versions tables exist and their row counts.
 * Does NOT modify any data.
 * Does NOT print credentials.
 */

import mysql from 'mysql2/promise';

// Required environment variables for external DB access
const REQUIRED_ENV_VARS = [
  'NHRATS_DB_HOST',
  'NHRATS_DB_NAME',
  'NHRATS_DB_USER',
];

// Optional environment variables
const OPTIONAL_ENV_VARS = [
  'NHRATS_DB_PASSWORD',
  'NHRATS_DB_PORT',
];

function checkEnvVars() {
  const missing = REQUIRED_ENV_VARS.filter(v => !process.env[v]);
  if (missing.length > 0) {
    console.error('BLOCKED — ACCESS NEEDED');
    console.error('Missing required environment variables:');
    for (const v of missing) {
      console.error(`  - ${v}`);
    }
    console.error('\nTo check production status, provide DB access via env vars.');
    console.error('Example:');
    console.error('  export NHRATS_DB_HOST=your-db-host');
    console.error('  export NHRATS_DB_NAME=your-db-name');
    console.error('  export NHRATS_DB_USER=your-db-user');
    console.error('  export NHRATS_DB_PASSWORD=your-db-password');
    console.error('  export NHRATS_DB_PORT=3306  # optional, defaults to 3306');
    return false;
  }
  return true;
}

async function checkStatus() {
  if (!checkEnvVars()) {
    process.exit(1);
  }

  const config = {
    host: process.env.NHRATS_DB_HOST,
    database: process.env.NHRATS_DB_NAME,
    user: process.env.NHRATS_DB_USER,
    password: process.env.NHRATS_DB_PASSWORD || '',
    port: parseInt(process.env.NHRATS_DB_PORT || '3306', 10),
    ssl: process.env.NHRATS_DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  };

  let connection;
  try {
    connection = await mysql.createConnection(config);

    // Check if tables exist
    const [rulesTables] = await connection.execute(
      "SHOW TABLES LIKE 'rules'"
    );
    const [ruleVersionsTables] = await connection.execute(
      "SHOW TABLES LIKE 'rule_versions'"
    );

    const rulesExists = rulesTables.length > 0;
    const ruleVersionsExists = ruleVersionsTables.length > 0;

    console.log('=== v35 Rules Foundation Migration Status ===\n');
    console.log(`rules table exists:        ${rulesExists ? 'YES' : 'NO'}`);
    console.log(`rule_versions table exists: ${ruleVersionsExists ? 'YES' : 'NO'}`);

    // Get row counts if tables exist
    if (rulesExists) {
      const [rulesCount] = await connection.execute('SELECT COUNT(*) as cnt FROM rules');
      console.log(`rules row count:           ${rulesCount[0].cnt}`);
    }

    if (ruleVersionsExists) {
      const [versionsCount] = await connection.execute('SELECT COUNT(*) as cnt FROM rule_versions');
      console.log(`rule_versions row count:   ${versionsCount[0].cnt}`);
    }

    console.log('\n=== Migration Status Summary ===');
    if (rulesExists && ruleVersionsExists) {
      console.log('✓ v35 migration APPLIED');
    } else if (!rulesExists && !ruleVersionsExists) {
      console.log('✗ v35 migration NOT APPLIED');
    } else {
      console.log('⚠ v35 migration PARTIALLY APPLIED (unexpected state)');
    }

    await connection.end();
    process.exit(0);

  } catch (err) {
    console.error('ERROR: Failed to connect to database');
    console.error(err.message);
    if (connection) {
      try { await connection.end(); } catch {}
    }
    process.exit(1);
  }
}

checkStatus();
