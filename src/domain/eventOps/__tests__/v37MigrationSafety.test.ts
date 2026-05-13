/**
 * v37 Migration Safety Tests
 *
 * Validates:
 * - Migration file contains no DROP/TRUNCATE/DELETE
 * - Migration is CREATE TABLE IF NOT EXISTS only
 * - Runner defaults to dry-run without --apply
 * - No parity table modifications
 * - All 7 v37 tables defined
 * - No sample data seeded
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve('/Users/csnead/Documents/NHRATS/api/migrations/v37-event-ops-plans.php');
const RUNNER_PATH    = resolve('/Users/csnead/Documents/NHRATS/scripts/migrations/run-v37-event-ops-plans.mjs');
const CHECK_PATH     = resolve('/Users/csnead/Documents/NHRATS/scripts/migrations/check-v37-event-ops-plans.mjs');

const migrationSrc = readFileSync(MIGRATION_PATH, 'utf8');
const runnerSrc    = readFileSync(RUNNER_PATH, 'utf8');
const checkSrc     = readFileSync(CHECK_PATH, 'utf8');

describe('v37 migration file safety', () => {
  it('contains no DROP TABLE statement', () => {
    expect(migrationSrc.toUpperCase()).not.toMatch(/DROP\s+TABLE/);
  });

  it('contains no TRUNCATE statement', () => {
    // Allow word in comments/docs — check for actual SQL TRUNCATE TABLE
    expect(migrationSrc.toUpperCase()).not.toMatch(/TRUNCATE\s+TABLE/);
  });

  it('contains no bare DELETE statement', () => {
    expect(migrationSrc.toUpperCase()).not.toMatch(/\bDELETE\s+FROM\b/);
  });

  it('contains no UPDATE statement against data rows', () => {
    // ON UPDATE CURRENT_TIMESTAMP is valid schema syntax — skip it.
    // Check there is no UPDATE <table> SET pattern (DML mutation).
    expect(migrationSrc.toUpperCase()).not.toMatch(/\bUPDATE\s+\w+\s+SET\b/);
  });

  it('uses CREATE TABLE IF NOT EXISTS', () => {
    expect(migrationSrc).toContain('CREATE TABLE IF NOT EXISTS');
  });

  it('includes dryRun guard', () => {
    expect(migrationSrc).toContain('dryRun');
    expect(migrationSrc).toContain('DRY RUN');
  });

  it('does not reference any parity tables', () => {
    const parityTables = ['parity_runs','parity_events','engine_combos','weather_runs','parity_class_aliases'];
    for (const t of parityTables) {
      expect(migrationSrc).not.toContain(t);
    }
  });

  it('defines all 7 v37 tables', () => {
    const tables = [
      'event_plans',
      'event_plan_staff',
      'event_plan_sections',
      'event_plan_sessions',
      'event_plan_tasks',
      'event_plan_task_targets',
      'event_plan_files',
    ];
    for (const t of tables) {
      expect(migrationSrc).toContain(t);
    }
  });

  it('all tables use soft delete (deleted_at)', () => {
    const tables = [
      'event_plans',
      'event_plan_staff',
      'event_plan_sections',
      'event_plan_sessions',
      'event_plan_tasks',
      'event_plan_task_targets',
      'event_plan_files',
    ];
    for (const t of tables) {
      const tableBlock = migrationSrc.slice(
        migrationSrc.indexOf(`CREATE TABLE IF NOT EXISTS ${t}`),
        migrationSrc.indexOf(') ENGINE=InnoDB', migrationSrc.indexOf(`CREATE TABLE IF NOT EXISTS ${t}`)) + 100,
      );
      expect(tableBlock).toContain('deleted_at');
    }
  });

  it('does not seed any INSERT data', () => {
    expect(migrationSrc.toUpperCase()).not.toMatch(/\bINSERT\s+INTO\b/);
  });

  it('exports v37GetEventOpsTableCounts function', () => {
    expect(migrationSrc).toContain('function v37GetEventOpsTableCounts');
  });

  it('exports v37MigrateEventOpsPlans function', () => {
    expect(migrationSrc).toContain('function v37MigrateEventOpsPlans');
  });
});

describe('v37 runner defaults to dry-run', () => {
  it('runner uses !APPLY as dry-run flag', () => {
    expect(runnerSrc).toContain('const DRY_RUN = !APPLY');
  });

  it('runner requires --apply flag to apply', () => {
    expect(runnerSrc).toContain("args.includes('--apply')");
  });

  it('runner outputs dry-run message when not applying', () => {
    expect(runnerSrc).toContain('DRY-RUN');
  });

  it('runner contains no direct SQL execution itself', () => {
    expect(runnerSrc.toUpperCase()).not.toMatch(/\bDROP TABLE\b/);
    expect(runnerSrc.toUpperCase()).not.toMatch(/\bTRUNCATE TABLE\b/);
  });
});

describe('v37 check script', () => {
  it('check script forces dry-run = true', () => {
    expect(checkSrc).toContain('$dryRun = true');
  });

  it('check script does not apply migration', () => {
    expect(checkSrc).not.toContain('--apply');
  });
});
