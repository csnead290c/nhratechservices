/**
 * v38 Event Ops Live Checklist Migration Safety Tests
 *
 * Verifies:
 *   - Migration file is additive (no DROP/TRUNCATE/DELETE/UPDATE on data rows)
 *   - All 4 tables are defined with CREATE TABLE IF NOT EXISTS
 *   - All tables have soft delete (deleted_at)
 *   - No sample data seeded (no INSERT)
 *   - No parity table references
 *   - dryRun guard is present
 *   - run script defaults to dry-run, requires --apply
 *   - check script is always dry-run
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';

const ROOT = resolve(__dirname, '../../../../');

function readMigration(): string {
  return readFileSync(resolve(ROOT, 'api/migrations/v38-event-ops-live-checklist.php'), 'utf8');
}

function readRunner(): string {
  return readFileSync(resolve(ROOT, 'scripts/migrations/run-v38-event-ops-live-checklist.mjs'), 'utf8');
}

function readCheck(): string {
  return readFileSync(resolve(ROOT, 'scripts/migrations/check-v38-event-ops-live-checklist.mjs'), 'utf8');
}

describe('v38 migration file safety', () => {
  it('file exists and is non-empty', () => {
    expect(readMigration().length).toBeGreaterThan(100);
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

  it('uses CREATE TABLE IF NOT EXISTS for all 4 tables', () => {
    const src = readMigration();
    const tables = [
      'event_live_checklists',
      'event_live_task_updates',
      'event_live_task_files',
      'event_live_session_status',
    ];
    for (const t of tables) {
      expect(src).toContain(`CREATE TABLE IF NOT EXISTS ${t}`);
    }
  });

  it('has no INSERT statements (no sample data)', () => {
    const sql = readMigration().replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(/\bINSERT\s+INTO\b/i.test(sql)).toBe(false);
  });

  it('all 4 tables have deleted_at for soft delete', () => {
    const src = readMigration();
    const tables = [
      'event_live_checklists',
      'event_live_task_updates',
      'event_live_task_files',
      'event_live_session_status',
    ];
    for (const t of tables) {
      const blockStart = src.indexOf(`CREATE TABLE IF NOT EXISTS ${t}`);
      const blockEnd   = src.indexOf('ENGINE=InnoDB', blockStart) + 60;
      const block      = src.slice(blockStart, blockEnd);
      expect(block).toContain('deleted_at');
    }
  });

  it('has no parity table references', () => {
    const src = readMigration();
    const parityTables = ['parity_events', 'parity_cars', 'parity_tracks', 'event_weather', 'combo_corrections'];
    for (const t of parityTables) {
      expect(src).not.toContain(t);
    }
  });

  it('dryRun guard is present', () => {
    expect(readMigration()).toContain('$dryRun');
    expect(readMigration()).toContain('DRY RUN');
  });

  it('defines v38MigrateEventOpsLiveChecklist function', () => {
    expect(readMigration()).toContain('function v38MigrateEventOpsLiveChecklist');
  });

  it('defines v38GetEventOpsLiveTableCounts function', () => {
    expect(readMigration()).toContain('function v38GetEventOpsLiveTableCounts');
  });

  it('declares all 4 expected tables in table list', () => {
    const src = readMigration();
    expect(src).toContain("'event_live_checklists'");
    expect(src).toContain("'event_live_task_updates'");
    expect(src).toContain("'event_live_task_files'");
    expect(src).toContain("'event_live_session_status'");
  });
});

describe('v38 runner script safety', () => {
  it('runner file exists', () => {
    expect(readRunner().length).toBeGreaterThan(100);
  });

  it('runner defaults to dry-run without --apply', () => {
    const src = readRunner();
    expect(src).toContain('--apply');
    expect(src).toContain('DRY-RUN');
  });

  it('runner requires --apply flag to make changes', () => {
    const src = readRunner();
    expect(src).toContain("args.includes('--apply')");
  });

  it('runner does not use rsync --delete', () => {
    expect(readRunner()).not.toContain('--delete');
  });
});

describe('v38 check script safety', () => {
  it('check file exists', () => {
    expect(readCheck().length).toBeGreaterThan(50);
  });

  it('check script always sets dryRun = true', () => {
    expect(readCheck()).toContain('$dryRun = true');
  });

  it('check script does not have --apply mode', () => {
    expect(readCheck()).not.toContain("'--apply'");
  });
});
