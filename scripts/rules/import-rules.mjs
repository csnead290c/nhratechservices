#!/usr/bin/env node
/**
 * Rules Import Utility
 *
 * Imports rules from JSON into the database.
 * Default mode: dry-run only.
 * Requires --apply flag to write to database.
 *
 * Usage:
 *   node scripts/rules/import-rules.mjs [options]
 *
 * Options:
 *   --file <path>       Import file path (default: data/rules/sample-rules-import.json)
 *   --apply             Actually write to database (requires DB env vars)
 *   --check-db          Check for duplicates against existing database (requires DB env vars)
 *   --limit <n>         Process only first N rules
 *
 * Environment variables for --apply mode:
 *   NHRATS_DB_HOST      Database host (required)
 *   NHRATS_DB_NAME      Database name (required)
 *   NHRATS_DB_USER      Database user (required)
 *   NHRATS_DB_PASSWORD  Database password (required)
 *   NHRATS_DB_PORT      Database port (default: 3306)
 *
 * Exit codes:
 *   0 - Success (dry-run completed or import successful)
 *   1 - Validation errors or missing required env vars
 *   2 - Database connection error
 *   3 - Import aborted due to errors
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_INPUT = resolve(__dirname, '../../data/rules/sample-rules-import.json');

// Parse arguments
const args = process.argv.slice(2);
const flags = {
  file: null,
  apply: false,
  checkDb: false,
  limit: null,
};

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--apply') {
    flags.apply = true;
  } else if (arg === '--check-db') {
    flags.checkDb = true;
  } else if (arg === '--file' && i + 1 < args.length) {
    flags.file = args[++i];
  } else if (arg === '--limit' && i + 1 < args.length) {
    flags.limit = parseInt(args[++i], 10);
  } else if (!arg.startsWith('--') && !flags.file) {
    flags.file = arg;
  }
}

const inputPath = flags.file ? resolve(flags.file) : DEFAULT_INPUT;

// Status tracking
const stats = {
  total: 0,
  wouldInsert: 0,
  skipped: 0,
  errors: 0,
  inserted: 0,
  dbDuplicates: 0,
};

function log(message) {
  console.log(message);
}

function logError(message) {
  console.error(message);
}

function loadImportData() {
  log(`Loading: ${inputPath}`);
  
  if (!existsSync(inputPath)) {
    logError(`Error: File not found: ${inputPath}`);
    process.exit(1);
  }

  try {
    const content = readFileSync(inputPath, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    logError(`Error: Invalid JSON - ${err.message}`);
    process.exit(1);
  }
}

function validateEnvVars() {
  const required = ['NHRATS_DB_HOST', 'NHRATS_DB_NAME', 'NHRATS_DB_USER', 'NHRATS_DB_PASSWORD'];
  const missing = required.filter(v => !process.env[v]);
  
  if (missing.length > 0) {
    logError('BLOCKED — ACCESS NEEDED');
    logError('Missing required environment variables for database connection:');
    missing.forEach(v => logError(`  - ${v}`));
    logError('');
    logError('Set these variables or run without --apply for dry-run mode.');
    process.exit(1);
  }
}

async function connectDatabase() {
  // Dynamic import to avoid loading mysql2 in dry-run mode
  try {
    const { createConnection } = await import('mysql2/promise');
    
    const connection = await createConnection({
      host: process.env.NHRATS_DB_HOST,
      database: process.env.NHRATS_DB_NAME,
      user: process.env.NHRATS_DB_USER,
      password: process.env.NHRATS_DB_PASSWORD,
      port: parseInt(process.env.NHRATS_DB_PORT || '3306', 10),
      ssl: { rejectUnauthorized: false },
    });
    
    return connection;
  } catch (err) {
    logError(`Database connection error: ${err.message}`);
    process.exit(2);
  }
}

async function checkExistingRuleNumbers(connection, ruleNumbers) {
  if (!connection || ruleNumbers.length === 0) return new Set();
  
  try {
    const [rows] = await connection.execute(
      'SELECT rule_number FROM rules WHERE rule_number IN (?)',
      [ruleNumbers]
    );
    return new Set(rows.map(r => r.rule_number.toLowerCase()));
  } catch (err) {
    // Table might not exist yet
    if (err.message.includes("Table") && err.message.includes("doesn't exist")) {
      return new Set();
    }
    throw err;
  }
}

function generateUUID() {
  return randomUUID().replace(/-/g, '').substring(0, 32);
}

function formatDate(dateStr) {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().split('T')[0];
  } catch {
    return null;
  }
}

async function main() {
  log('=== NHRATS Rules Import ===');
  log('');

  // Load data
  const data = loadImportData();
  
  if (!Array.isArray(data.rules)) {
    logError('Error: Import must contain a "rules" array');
    process.exit(1);
  }

  // Apply limit if specified
  let rulesToProcess = data.rules;
  if (flags.limit && flags.limit > 0) {
    rulesToProcess = data.rules.slice(0, flags.limit);
    log(`Limit applied: Processing first ${flags.limit} of ${data.rules.length} rules`);
    log('');
  }

  stats.total = rulesToProcess.length;

  // Mode announcement
  if (flags.apply) {
    log('Mode: APPLY (will write to database)');
    validateEnvVars();
  } else {
    log('Mode: DRY-RUN (no database changes)');
    if (flags.checkDb) {
      validateEnvVars();
      log('Will check for duplicates against existing database');
    }
  }
  log('');

  // Connect to database if needed
  let connection = null;
  let existingRuleNumbers = new Set();
  
  if (flags.apply || flags.checkDb) {
    connection = await connectDatabase();
    log('Database connected');
    
    // Check for existing rule numbers
    const ruleNumbers = rulesToProcess.map(r => r.rule_number).filter(Boolean);
    existingRuleNumbers = await checkExistingRuleNumbers(connection, ruleNumbers);
    
    if (existingRuleNumbers.size > 0) {
      log(`Found ${existingRuleNumbers.size} existing rule(s) in database`);
    }
    log('');
  }

  // Process rules
  const processedRules = [];
  
  for (let i = 0; i < rulesToProcess.length; i++) {
    const rule = rulesToProcess[i];
    const ruleRef = `Rule ${i + 1}/${rulesToProcess.length}: ${rule.rule_number || '(no number)'}`;
    
    // Check for duplicates in database
    if (existingRuleNumbers.has(rule.rule_number?.toLowerCase())) {
      log(`${ruleRef}: SKIPPED (already exists in database)`);
      stats.skipped++;
      stats.dbDuplicates++;
      continue;
    }
    
    // Prepare rule data
    const ruleData = {
      uuid: generateUUID(),
      rule_number: rule.rule_number?.trim(),
      category: rule.category?.trim(),
      class_scope: rule.class_scope || null,
      title: rule.title?.trim(),
      body: rule.body?.trim(),
      status: rule.status || 'active',
      effective_from: formatDate(rule.effective_from),
      effective_to: formatDate(rule.effective_to) || null,
      version_number: parseInt(rule.version_number, 10) || 1,
      change_summary: rule.change_summary || null,
    };
    
    // Prepare version data (linked to rule)
    const versionData = {
      version_number: ruleData.version_number,
      rule_number: ruleData.rule_number,
      title: ruleData.title,
      body: ruleData.body,
      change_summary: ruleData.change_summary,
      effective_from: ruleData.effective_from,
      effective_to: ruleData.effective_to,
    };
    
    if (flags.apply) {
      try {
        // Insert rule
        const [ruleResult] = await connection.execute(
          `INSERT INTO rules (uuid, rule_number, category, class_scope, title, body, status, 
                             effective_from, effective_to, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
          [
            ruleData.uuid, ruleData.rule_number, ruleData.category, ruleData.class_scope,
            ruleData.title, ruleData.body, ruleData.status,
            ruleData.effective_from, ruleData.effective_to
          ]
        );
        
        const ruleId = ruleResult.insertId;
        
        // Insert version
        await connection.execute(
          `INSERT INTO rule_versions (rule_id, version_number, rule_number, title, body, 
                                     change_summary, effective_from, effective_to, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
          [
            ruleId, versionData.version_number, versionData.rule_number, versionData.title,
            versionData.body, versionData.change_summary, versionData.effective_from,
            versionData.effective_to
          ]
        );
        
        // Update rule with current_version_id
        await connection.execute(
          'UPDATE rules SET current_version_id = LAST_INSERT_ID() WHERE id = ?',
          [ruleId]
        );
        
        log(`${ruleRef}: INSERTED (ID: ${ruleId})`);
        stats.inserted++;
      } catch (err) {
        logError(`${ruleRef}: ERROR - ${err.message}`);
        stats.errors++;
      }
    } else {
      log(`${ruleRef}: Would insert`);
      stats.wouldInsert++;
    }
    
    processedRules.push(ruleData);
  }
  
  // Close connection
  if (connection) {
    await connection.end();
    log('');
    log('Database connection closed');
  }
  
  // Print summary
  log('');
  log('=== Import Summary ===');
  log(`Total rules processed: ${stats.total}`);
  
  if (flags.apply) {
    log(`Successfully inserted: ${stats.inserted}`);
    log(`Skipped (duplicates): ${stats.skipped}`);
    log(`Errors: ${stats.errors}`);
  } else {
    log(`Would insert: ${stats.wouldInsert}`);
    log(`Would skip (duplicates): ${stats.skipped}`);
  }
  
  if (stats.dbDuplicates > 0) {
    log(`Existing in DB: ${stats.dbDuplicates}`);
  }
  
  log('');
  
  if (flags.apply) {
    if (stats.errors === 0) {
      log('✓ Import completed successfully');
      process.exit(0);
    } else {
      log(`✗ Import completed with ${stats.errors} error(s)`);
      process.exit(3);
    }
  } else {
    log('✓ Dry-run completed (no changes made)');
    log('Run with --apply to execute the import');
    process.exit(0);
  }
}

main().catch(err => {
  logError(`Unexpected error: ${err.message}`);
  process.exit(1);
});
