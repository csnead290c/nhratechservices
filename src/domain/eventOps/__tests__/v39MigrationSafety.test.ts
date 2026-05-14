/**
 * v39 Migration Safety Tests
 *
 * Verifies that api/migrations/v39-event-ops-post-reports.php:
 *   - is CREATE TABLE IF NOT EXISTS only
 *   - has no DROP/TRUNCATE/DELETE
 *   - has no bare UPDATE on data rows
 *   - has no parity table references
 *   - has no sample data (INSERT INTO)
 *   - defines all 5 required tables
 *   - exports v39MigrateEventOpsPostReports
 *   - exports v39GetEventOpsPostReportTableCounts
 *
 * CLI runner tests:
 *   - run script exists
 *   - run script defaults to dry-run
 *   - run script requires --apply to execute
 *   - check script exists and always dry-runs
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';

const ROOT = resolve(__dirname, '../../../../');

function readMigration(): string {
  return readFileSync(resolve(ROOT, 'api/migrations/v39-event-ops-post-reports.php'), 'utf8');
}

function readRunner(): string {
  return readFileSync(resolve(ROOT, 'scripts/migrations/run-v39-event-ops-post-reports.mjs'), 'utf8');
}

function readCheck(): string {
  return readFileSync(resolve(ROOT, 'scripts/migrations/check-v39-event-ops-post-reports.mjs'), 'utf8');
}

describe('v39 migration file safety', () => {
  it('migration file exists and is non-empty', () => {
    const src = readMigration();
    expect(src.length).toBeGreaterThan(100);
  });

  it('has no DROP TABLE statement', () => {
    const sql = readMigration().replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(/\bDROP\s+TABLE\b/i.test(sql)).toBe(false);
  });

  it('has no TRUNCATE TABLE statement', () => {
    const sql = readMigration().replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(/\bTRUNCATE\s+TABLE\b/i.test(sql)).toBe(false);
  });

  it('has no DELETE FROM statement', () => {
    const sql = readMigration().replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(/\bDELETE\s+FROM\b/i.test(sql)).toBe(false);
  });

  it('has no bare UPDATE … SET on data rows', () => {
    const sql = readMigration()
      .replace(/--.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/ON\s+UPDATE\s+CURRENT_TIMESTAMP/gi, '')
      .replace(/DEFAULT\s+CURRENT_TIMESTAMP/gi, '');
    expect(/\bUPDATE\s+\w/i.test(sql)).toBe(false);
  });

  it('has no INSERT INTO (no sample data)', () => {
    const sql = readMigration().replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(/\bINSERT\s+INTO\b/i.test(sql)).toBe(false);
  });

  it('uses CREATE TABLE IF NOT EXISTS for all 5 tables', () => {
    const src = readMigration();
    const tables = [
      'event_post_reports',
      'event_post_report_sections',
      'event_post_report_items',
      'event_post_report_files',
      'event_post_report_incidents',
    ];
    for (const t of tables) {
      expect(src).toContain(`CREATE TABLE IF NOT EXISTS ${t}`);
    }
  });

  it('has no parity table references', () => {
    const src = readMigration().toLowerCase();
    const parityTables = ['parity_runs', 'parity_events', 'parity_vehicles', 'parity_adjustments'];
    for (const t of parityTables) {
      expect(src).not.toContain(t);
    }
  });

  it('exports v39MigrateEventOpsPostReports function', () => {
    expect(readMigration()).toContain('function v39MigrateEventOpsPostReports');
  });

  it('exports v39GetEventOpsPostReportTableCounts function', () => {
    expect(readMigration()).toContain('function v39GetEventOpsPostReportTableCounts');
  });

  it('all 5 tables have deleted_at for soft delete', () => {
    const src = readMigration();
    const tables = [
      'event_post_reports',
      'event_post_report_sections',
      'event_post_report_items',
      'event_post_report_files',
      'event_post_report_incidents',
    ];
    for (const t of tables) {
      const tableBlock = src.slice(src.indexOf(`CREATE TABLE IF NOT EXISTS ${t}`));
      const closeIdx = tableBlock.indexOf(') ENGINE=');
      const ddl = tableBlock.slice(0, closeIdx);
      expect(ddl).toContain('deleted_at');
    }
  });

  it('event_post_report_items has source_type and source_id columns', () => {
    const src = readMigration();
    const block = src.slice(src.indexOf('CREATE TABLE IF NOT EXISTS event_post_report_items'));
    expect(block).toContain('source_type');
    expect(block).toContain('source_id');
  });

  it('event_post_reports has generated_at and finalized_at columns', () => {
    const src = readMigration();
    const block = src.slice(src.indexOf('CREATE TABLE IF NOT EXISTS event_post_reports'));
    expect(block).toContain('generated_at');
    expect(block).toContain('finalized_at');
  });

  it('event_post_reports status ENUM includes all required values', () => {
    const src = readMigration();
    const block = src.slice(src.indexOf('CREATE TABLE IF NOT EXISTS event_post_reports'));
    const ddl = block.slice(0, block.indexOf(') ENGINE='));
    expect(ddl).toContain("'draft'");
    expect(ddl).toContain("'generated'");
    expect(ddl).toContain("'in_review'");
    expect(ddl).toContain("'finalized'");
    expect(ddl).toContain("'archived'");
  });

  it('has dry-run guard (dryRun check before writes)', () => {
    expect(readMigration()).toContain('$dryRun');
    expect(readMigration()).toContain('DRY RUN');
  });

  it('migration is idempotent (already-exists path present)', () => {
    expect(readMigration()).toContain('already exists, skipping');
  });
});

describe('v39 CLI runner safety', () => {
  it('run script file exists', () => {
    expect(readRunner().length).toBeGreaterThan(50);
  });

  it('run script defaults to dry-run (dryRun = true when --apply absent)', () => {
    const src = readRunner();
    expect(src).toContain('--apply');
    expect(src).toContain('DRY-RUN');
  });

  it('run script requires --apply flag to execute', () => {
    const src = readRunner();
    expect(src).toContain("args.includes('--apply')");
  });

  it('run script does not hardcode credentials', () => {
    const src = readRunner();
    expect(src).not.toMatch(/password\s*=\s*['"][^'"]{3,}/i);
  });

  it('check script exists and always uses dry-run = true', () => {
    const src = readCheck();
    expect(src).toContain('dryRun = true');
  });
});

describe('v39 web endpoint safety', () => {
  it('migrate-v39 web endpoint exists', () => {
    const src = readFileSync(resolve(ROOT, 'api/migrate-v39-event-ops-post-reports.php'), 'utf8');
    expect(src.length).toBeGreaterThan(50);
  });

  it('migrate-v39 web endpoint requires admin/owner role', () => {
    const src = readFileSync(resolve(ROOT, 'api/migrate-v39-event-ops-post-reports.php'), 'utf8');
    expect(src).toContain("'admin'");
    expect(src).toContain("'owner'");
  });
});
