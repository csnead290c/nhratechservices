/**
 * v41 Migration Safety Tests
 *
 * Verifies that api/migrations/v41-event-ops-staffing.php:
 *   - creates the 8 staffing tables with CREATE TABLE IF NOT EXISTS
 *   - uses deterministic-only parity_event_id backfill (no fuzzy name matching)
 *   - respects soft-deleted plans during backfill
 *   - keeps requested roommate (request row) separate from actual roommate (lodging)
 *   - stores dietary detail only on profile/request rows
 *   - uses signed INT columns compatible with the signed PKs of referenced tables
 *   - has no DROP/TRUNCATE/DELETE and no sample data
 *   - uses INFORMATION_SCHEMA (not SHOW TABLES LIKE ?) for existence checks —
 *     MariaDB/native prepares reject placeholders in SHOW statements
 *   - exports v41MigrateEventOpsStaffing + v41GetEventOpsStaffingTableCounts
 *
 * CLI runner / web endpoint tests mirror the v40 suite.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';

const ROOT = resolve(__dirname, '../../../../');

function readMigration(): string {
  return readFileSync(resolve(ROOT, 'api/migrations/v41-event-ops-staffing.php'), 'utf8');
}
function readRunner(): string {
  return readFileSync(resolve(ROOT, 'scripts/migrations/run-v41-event-ops-staffing.mjs'), 'utf8');
}
function readCheck(): string {
  return readFileSync(resolve(ROOT, 'scripts/migrations/check-v41-event-ops-staffing.mjs'), 'utf8');
}
function stripComments(src: string): string {
  return src.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

const TABLES = [
  'event_worker_profiles',
  'event_worker_beverage_prefs',
  'event_staff_requests',
  'event_staff_request_beverages',
  'event_staff_request_events',
  'event_staff_classes',
  'event_staff_travel_legs',
  'event_staff_lodging',
];

describe('v41 migration file safety', () => {
  it('migration file exists and is non-empty', () => {
    expect(readMigration().length).toBeGreaterThan(100);
  });

  it('creates all 8 staffing tables with CREATE TABLE IF NOT EXISTS', () => {
    const src = readMigration();
    for (const t of TABLES) {
      expect(src).toContain(`CREATE TABLE IF NOT EXISTS ${t}`);
    }
  });

  it('has no DROP TABLE / TRUNCATE / DELETE statements', () => {
    const sql = stripComments(readMigration());
    expect(/\bDROP\s+TABLE\b/i.test(sql)).toBe(false);
    expect(/\bTRUNCATE\s+TABLE\b/i.test(sql)).toBe(false);
    expect(/\bDELETE\s+FROM\b/i.test(sql)).toBe(false);
  });

  it('has no INSERT INTO (no sample data)', () => {
    expect(/\bINSERT\s+INTO\b/i.test(stripComments(readMigration()))).toBe(false);
  });

  it('only UPDATEs event_plans during backfill — no other table mutated', () => {
    const sql = stripComments(readMigration())
      .replace(/ON\s+UPDATE\s+CURRENT_TIMESTAMP/gi, '')
      .replace(/DEFAULT\s+CURRENT_TIMESTAMP/gi, '');
    const updates = sql.match(/UPDATE\s+`?(\w+)`?/gi) ?? [];
    for (const u of updates) {
      expect(u.toLowerCase()).toContain('event_plans');
    }
  });

  it('backfill is deterministic — bridge FK and exact code+year only, no fuzzy match', () => {
    const src = readMigration();
    expect(src).toContain('pe.event_instance_id = p.event_instance_id');
    expect(src).toContain('pe.event_code = p.event_code');
    expect(src).toContain('pe.season_year = p.year');
    // No fuzzy event-name matching
    expect(/event_name\s+LIKE|LIKE\s+.*event_name|SOUNDEX|LEVENSHTEIN/i.test(src)).toBe(false);
  });

  it('backfill skips soft-deleted plans', () => {
    const src = readMigration();
    const backfillSection = src.slice(src.indexOf('Backfill event_plans'));
    expect(backfillSection).toContain('deleted_at IS NULL');
  });

  it('reports unresolved plans instead of guessing', () => {
    const src = readMigration();
    expect(src).toContain('unresolved_plans');
    expect(src).toContain('parity_event_id IS NULL AND deleted_at IS NULL');
  });

  it('requests anchor to parity_event_id (canonical event), not event_plan_id', () => {
    const src = readMigration();
    const block = src.slice(
      src.indexOf('CREATE TABLE IF NOT EXISTS event_staff_requests'),
      src.indexOf(') ENGINE=', src.indexOf('CREATE TABLE IF NOT EXISTS event_staff_requests')),
    );
    expect(block).toContain('parity_event_id       INT NOT NULL');
    expect(block).not.toContain('event_plan_id');
    expect(block).toContain('REFERENCES parity_events(id)');
  });

  it('requested roommate (request) and actual roommate (lodging) are separate columns', () => {
    const src = readMigration();
    const reqBlock = src.slice(
      src.indexOf('CREATE TABLE IF NOT EXISTS event_staff_requests'),
      src.indexOf(') ENGINE=', src.indexOf('CREATE TABLE IF NOT EXISTS event_staff_requests')),
    );
    expect(reqBlock).toContain('roommate_pref');
    expect(reqBlock).toContain('roommate_person_id');
    expect(reqBlock).toContain('roommate_name');
    const lodgBlock = src.slice(
      src.indexOf('CREATE TABLE IF NOT EXISTS event_staff_lodging'),
      src.indexOf(') ENGINE=', src.indexOf('CREATE TABLE IF NOT EXISTS event_staff_lodging')),
    );
    expect(lodgBlock).toContain('roommate_staff_id');
    expect(lodgBlock).toContain('roommate_name');
  });

  it('request status history is preserved in a dedicated events table', () => {
    const src = readMigration();
    const block = src.slice(
      src.indexOf('CREATE TABLE IF NOT EXISTS event_staff_request_events'),
      src.indexOf(') ENGINE=', src.indexOf('CREATE TABLE IF NOT EXISTS event_staff_request_events')),
    );
    expect(block).toContain('request_id');
    expect(block).toContain('status');
    expect(block).toContain('changed_by');
  });

  it('beverage preferences exist at both profile-default and per-request levels', () => {
    const src = readMigration();
    expect(src).toContain('CREATE TABLE IF NOT EXISTS event_worker_beverage_prefs');
    expect(src).toContain('CREATE TABLE IF NOT EXISTS event_staff_request_beverages');
  });

  it('dietary fields live only on profile/request rows (sensitive data boundary)', () => {
    const src = readMigration();
    const profileBlock = src.slice(
      src.indexOf('CREATE TABLE IF NOT EXISTS event_worker_profiles'),
      src.indexOf(') ENGINE=', src.indexOf('CREATE TABLE IF NOT EXISTS event_worker_profiles')),
    );
    expect(profileBlock).toContain('dietary_category');
    expect(profileBlock).toContain('dietary_detail');
    // No dietary columns on schedule/travel/lodging tables
    for (const t of ['event_staff_travel_legs', 'event_staff_lodging', 'event_staff_classes']) {
      const block = src.slice(
        src.indexOf(`CREATE TABLE IF NOT EXISTS ${t}`),
        src.indexOf(') ENGINE=', src.indexOf(`CREATE TABLE IF NOT EXISTS ${t}`)),
      );
      expect(block).not.toContain('dietary');
    }
  });

  it('uses signed INT columns for FK fields (referenced PKs are signed INT)', () => {
    const src = readMigration();
    for (const t of TABLES) {
      const block = src.slice(
        src.indexOf(`CREATE TABLE IF NOT EXISTS ${t}`),
        src.indexOf(') ENGINE=', src.indexOf(`CREATE TABLE IF NOT EXISTS ${t}`)),
      );
      // FK columns must not be UNSIGNED — referenced PKs (users, persons,
      // parity_events, event_plan_staff) are signed INT
      expect(/(user_id|staff_id|person_id|parity_event_id|request_id|roommate_\w+|carpool_\w+)\s+INT\s+UNSIGNED/i.test(block)).toBe(false);
    }
  });

  it('uses INFORMATION_SCHEMA for table/column checks (SHOW … ? breaks on MariaDB)', () => {
    const src = readMigration();
    expect(src).toContain('INFORMATION_SCHEMA.TABLES');
    expect(src).toContain('INFORMATION_SCHEMA.COLUMNS');
    expect(/SHOW\s+TABLES\s+LIKE\s+\?/.test(src)).toBe(false);
  });

  it('verifies base tables exist before running', () => {
    const src = readMigration();
    expect(src).toContain('Required base table missing');
    for (const t of ['event_plans', 'event_plan_staff', 'parity_events', 'parity_tracks', 'users', 'persons']) {
      expect(src).toContain(`'${t}'`);
    }
  });

  it('status fields are VARCHAR (not ENUM) for extensibility', () => {
    const src = readMigration();
    const block = src.slice(
      src.indexOf('CREATE TABLE IF NOT EXISTS event_staff_requests'),
      src.indexOf(') ENGINE=', src.indexOf('CREATE TABLE IF NOT EXISTS event_staff_requests')),
    );
    expect(/status\s+VARCHAR\(20\)/i.test(block)).toBe(true);
    expect(/status\s+ENUM/i.test(block)).toBe(false);
  });

  it('has dry-run guard and idempotent skip path', () => {
    const src = readMigration();
    expect(src).toContain('$dryRun');
    expect(src).toContain('DRY RUN');
    expect(src).toContain('already exists — skipped');
  });

  it('exports v41MigrateEventOpsStaffing and v41GetEventOpsStaffingTableCounts', () => {
    const src = readMigration();
    expect(src).toContain('function v41MigrateEventOpsStaffing');
    expect(src).toContain('function v41GetEventOpsStaffingTableCounts');
  });
});

describe('v41 API file safety', () => {
  const api = () => readFileSync(resolve(ROOT, 'api/event-ops-staffing.php'), 'utf8');

  it('worker endpoints self-scope by user_id', () => {
    const src = api();
    expect(src).toContain('(int) $r[\'user_id\'] !== $userId');
    expect(src).toContain('eow_getMyWorkerProfile');
    expect(src).toContain('eow_getMyRequests');
  });

  it('admin endpoints require eventops.admin', () => {
    const src = api();
    expect(src).toContain('eo_requireAdmin');
  });

  it('list endpoint strips dietary detail (privacy)', () => {
    const src = api();
    expect(src).toContain('eow_shapeRequest');
    expect(src).toContain('dietary_on_file');
    expect(src).toContain("unset($out['dietary_detail']");
  });

  it('confirmation creates/links an event_plan_staff row', () => {
    const src = api();
    expect(src).toContain('event_plan_staff_id');
    expect(src).toContain('INSERT INTO event_plan_staff');
  });

  it('travel legs enforce same-plan carpool', () => {
    expect(api()).toContain('carpool driver must be staff on the same plan');
  });

  it('lodging enforces same-plan roommate', () => {
    expect(api()).toContain('roommate must be staff on the same plan');
  });
});

describe('v41 CLI runner + web endpoint safety', () => {
  it('run script exists and requires --apply', () => {
    const src = readRunner();
    expect(src.length).toBeGreaterThan(50);
    expect(src).toContain("args.includes('--apply')");
    expect(src).toContain('DRY-RUN');
  });

  it('run script does not hardcode credentials', () => {
    expect(readRunner()).not.toMatch(/password\s*=\s*['"][^'"]{3,}/i);
  });

  it('check script exists and always uses dry-run = true', () => {
    expect(readCheck()).toContain('dryRun = true');
  });

  it('migrate-v41 web endpoint exists and requires admin/owner', () => {
    const src = readFileSync(resolve(ROOT, 'api/migrate-v41-event-ops-staffing.php'), 'utf8');
    expect(src.length).toBeGreaterThan(50);
    expect(src).toContain("'admin'");
    expect(src).toContain("'owner'");
  });
});
