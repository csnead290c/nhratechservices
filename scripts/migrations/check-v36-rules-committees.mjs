#!/usr/bin/env node
/**
 * Safe Read-Only Status Check for v36 Rules Committees Migration
 *
 * Checks whether rules_committees and committee_memberships tables exist and their row counts.
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
    const [committeesTables] = await connection.execute(
      "SHOW TABLES LIKE 'rules_committees'"
    );
    const [membershipsTables] = await connection.execute(
      "SHOW TABLES LIKE 'committee_memberships'"
    );

    const committeesExists = committeesTables.length > 0;
    const membershipsExists = membershipsTables.length > 0;

    console.log('=== v36 Rules Committees Migration Status ===\n');
    console.log(`rules_committees table exists:      ${committeesExists ? 'YES' : 'NO'}`);
    console.log(`committee_memberships table exists: ${membershipsExists ? 'YES' : 'NO'}`);

    // Get row counts if tables exist
    if (committeesExists) {
      const [committeesCount] = await connection.execute('SELECT COUNT(*) as cnt FROM rules_committees');
      console.log(`rules_committees row count:         ${committeesCount[0].cnt}`);
    }

    if (membershipsExists) {
      const [membershipsCount] = await connection.execute('SELECT COUNT(*) as cnt FROM committee_memberships');
      console.log(`committee_memberships row count:    ${membershipsCount[0].cnt}`);
    }

    console.log('\n=== Migration Status Summary ===');
    if (committeesExists && membershipsExists) {
      console.log('✓ v36 migration APPLIED');
    } else if (!committeesExists && !membershipsExists) {
      console.log('✗ v36 migration NOT APPLIED');
    } else {
      console.log('⚠ v36 migration PARTIALLY APPLIED (unexpected state)');
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
