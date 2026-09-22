/**
 * v40 Migration Safety Tests
 *
 * Verifies that api/migrations/v40-event-ops-schedule.php:
 *   - creates event_schedule_items, event_schedule_assignments, event_plan_staff_duties
 *   - adds staff/plan columns via guarded ADD COLUMN (INFORMATION_SCHEMA check)
 *   - is CREATE TABLE IF NOT EXISTS only
 *   - has no DROP/TRUNCATE/DELETE
 *   - has no bare UPDATE on data rows
 *   - has no parity table references
 *   - has no sample data (INSERT INTO)
 *   - keeps status/activity_type as VARCHAR (extensible, not ENUM)
 *   - preserves legacy freeform sections (no event_plan_sections mutation)
 *   - exports v40MigrateEventOpsSchedule + v40GetEventOpsScheduleTableCounts
 *
 * CLI runner tests:
 *   - run script exists and defaults to dry-run
 *   - run script requires --apply to execute
 *   - check script exists and always dry-runs
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';

const ROOT = resolve(__dirname, '../../../../');

function readMigration(): string {
  return readFileSync(resolve(ROOT, 'api/migrations/v40-event-ops-schedule.php'), 'utf8');
}

function readRunner(): string {
  return readFileSync(resolve(ROOT, 'scripts/migrations/run-v40-event-ops-schedule.mjs'), 'utf8');
}

function readCheck(): string {
  return readFileSync(resolve(ROOT, 'scripts/migrations/check-v40-event-ops-schedule.mjs'), 'utf8');
}

function stripComments(src: string): string {
  return src.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

const TABLES = [
  'event_schedule_items',
  'event_schedule_assignments',
  'event_plan_staff_duties',
];

describe('v40 migration file safety', () => {
  it('migration file exists and is non-empty', () => {
    expect(readMigration().length).toBeGreaterThan(100);
  });

  it('has no DROP TABLE statement', () => {
    expect(/\bDROP\s+TABLE\b/i.test(stripComments(readMigration()))).toBe(false);
  });

  it('has no TRUNCATE TABLE statement', () => {
    expect(/\bTRUNCATE\s+TABLE\b/i.test(stripComments(readMigration()))).toBe(false);
  });

  it('has no DELETE FROM statement', () => {
    expect(/\bDELETE\s+FROM\b/i.test(stripComments(readMigration()))).toBe(false);
  });

  it('has no bare UPDATE … SET on data rows', () => {
    const sql = stripComments(readMigration())
      .replace(/ON\s+UPDATE\s+CURRENT_TIMESTAMP/gi, '')
      .replace(/DEFAULT\s+CURRENT_TIMESTAMP/gi, '');
    expect(/\bUPDATE\s+\w/i.test(sql)).toBe(false);
  });

  it('has no INSERT INTO (no sample data)', () => {
    expect(/\bINSERT\s+INTO\b/i.test(stripComments(readMigration()))).toBe(false);
  });

  it('uses CREATE TABLE IF NOT EXISTS for all 3 new tables', () => {
    const src = readMigration();
    for (const t of TABLES) {
      expect(src).toContain(`CREATE TABLE IF NOT EXISTS ${t}`);
    }
  });

  it('has no parity table references', () => {
    const src = readMigration().toLowerCase();
    for (const t of ['parity_runs', 'parity_events', 'parity_vehicles', 'parity_adjustments']) {
      expect(src).not.toContain(t);
    }
  });

  it('does not mutate existing event_plan_sections (legacy schedule preserved)', () => {
    const sql = stripComments(readMigration());
    // Only event_plan_staff and event_plans may be ALTERed — never sections.
    const alters = sql.match(/ALTER\s+TABLE\s+`?\w+`?/gi) ?? [];
    for (const a of alters) {
      expect(a.toLowerCase()).not.toContain('event_plan_sections');
      expect(a.toLowerCase()).not.toContain('event_plan_tasks');
    }
  });

  it('status and activity_type are VARCHAR (not ENUM) for future extensibility', () => {
    const src = readMigration();
    const itemsBlock = src.slice(
      src.indexOf('CREATE TABLE IF NOT EXISTS event_schedule_items'),
      src.indexOf(') ENGINE='),
    );
    expect(itemsBlock).toContain('activity_type       VARCHAR(32)');
    expect(itemsBlock).toContain('status              VARCHAR(32)');
    expect(/activity_type\s+ENUM/i.test(itemsBlock)).toBe(false);
    expect(/status\s+ENUM/i.test(itemsBlock)).toBe(false);
  });

  it('schedule items carry all printed-schedule fields', () => {
    const src = readMigration();
    const block = src.slice(
      src.indexOf('CREATE TABLE IF NOT EXISTS event_schedule_items'),
      src.indexOf(') ENGINE='),
    );
    for (const col of [
      'schedule_date', 'sort_order', 'scheduled_time', 'projected_time',
      'activity_type', 'category_code', 'round_label', 'expected_car_count',
      'comments', 'scale_required', 'fuel_required', 'status',
      'actual_start_at', 'actual_end_at', 'session_id',
    ]) {
      expect(block).toContain(col);
    }
  });

  it('assignments support both staff_id and free-text assignee_name', () => {
    const src = readMigration();
    const raw = src.slice(src.indexOf('CREATE TABLE IF NOT EXISTS event_schedule_assignments'));
    const block = raw.slice(0, raw.indexOf(') ENGINE='));
    expect(block).toContain('staff_id');
    expect(block).toContain('assignee_name');
    expect(block).toContain('responsibility');
    expect(block).toContain('schedule_item_id');
    expect(block).toContain('event_plan_id');
  });

  it('all 3 tables have deleted_at for soft delete', () => {
    const src = readMigration();
    for (const t of TABLES) {
      const block = src.slice(src.indexOf(`CREATE TABLE IF NOT EXISTS ${t}`));
      const ddl = block.slice(0, block.indexOf(') ENGINE='));
      expect(ddl).toContain('deleted_at');
    }
  });

  it('staff column additions are guarded by INFORMATION_SCHEMA check', () => {
    const src = readMigration();
    expect(src).toContain('INFORMATION_SCHEMA.COLUMNS');
    expect(src).toContain('v40AddColumnIfMissing');
    for (const col of ['radio_number', 'vehicle', 'phone', 'is_active']) {
      expect(src).toContain(`'${col}'`);
    }
    for (const col of ['event_date', 'lifecycle_stage']) {
      expect(src).toContain(`'${col}'`);
    }
  });

  it('exports v40MigrateEventOpsSchedule function', () => {
    expect(readMigration()).toContain('function v40MigrateEventOpsSchedule');
  });

  it('exports v40GetEventOpsScheduleTableCounts function', () => {
    expect(readMigration()).toContain('function v40GetEventOpsScheduleTableCounts');
  });

  it('verifies base tables exist before running (v37 dependency)', () => {
    const src = readMigration();
    expect(src).toContain('Required base table missing');
    expect(src).toContain('event_plans');
    expect(src).toContain('event_plan_staff');
  });

  it('has dry-run guard (dryRun check before writes)', () => {
    expect(readMigration()).toContain('$dryRun');
    expect(readMigration()).toContain('DRY RUN');
  });

  it('migration is idempotent (already-exists path present)', () => {
    expect(readMigration()).toContain('already exists — skipped');
  });
});

describe('v40 CLI runner safety', () => {
  it('run script file exists', () => {
    expect(readRunner().length).toBeGreaterThan(50);
  });

  it('run script defaults to dry-run (dryRun = true when --apply absent)', () => {
    const src = readRunner();
    expect(src).toContain('--apply');
    expect(src).toContain('DRY-RUN');
  });

  it('run script requires --apply flag to execute', () => {
    expect(readRunner()).toContain("args.includes('--apply')");
  });

  it('run script does not hardcode credentials', () => {
    expect(readRunner()).not.toMatch(/password\s*=\s*['"][^'"]{3,}/i);
  });

  it('check script exists and always uses dry-run = true', () => {
    expect(readCheck()).toContain('dryRun = true');
  });
});

describe('v40 web endpoint safety', () => {
  it('migrate-v40 web endpoint exists', () => {
    const src = readFileSync(resolve(ROOT, 'api/migrate-v40-event-ops-schedule.php'), 'utf8');
    expect(src.length).toBeGreaterThan(50);
  });

  it('migrate-v40 web endpoint requires admin/owner role', () => {
    const src = readFileSync(resolve(ROOT, 'api/migrate-v40-event-ops-schedule.php'), 'utf8');
    expect(src).toContain("'admin'");
    expect(src).toContain("'owner'");
  });
});
