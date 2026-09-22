/**
 * v40 Schedule API source-level tests
 *
 * The PHP endpoint functions respond via echo/exit, so they can't be invoked
 * in-process. These tests statically verify api/event-ops-schedule.php and the
 * dispatch tables in api/event-ops.php for the guarantees the user asked for:
 *
 * - schedule CRUD actions are dispatched
 * - read actions go through eo_requireRead, writes through eo_requireAdmin
 * - cross-event leakage protection (plan-ownership validators on every write)
 * - soft deletes only (deleted_at, never DELETE FROM)
 * - schedule ordering is scoped to (plan, date)
 * - schedule_date validated as YYYY-MM-DD
 * - staff duty and assignment relationships are validated to the owning plan
 * - extensible status/activity lists (VARCHAR-backed value lists)
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';

const ROOT = resolve(__dirname, '../../../../');

const sched = readFileSync(resolve(ROOT, 'api/event-ops-schedule.php'), 'utf8');
const eo = readFileSync(resolve(ROOT, 'api/event-ops.php'), 'utf8');

function fnBody(name: string): string {
  const start = sched.indexOf(`function ${name}(`);
  if (start < 0) return '';
  // crude but sufficient: capture until the next top-level `function ` or EOF
  const rest = sched.slice(start);
  const next = rest.slice(10).search(/\nfunction /);
  return next < 0 ? rest : rest.slice(0, next + 10);
}

describe('v40 action dispatch (api/event-ops.php)', () => {
  const readActions = ['getSchedule'];
  const adminActions = [
    'addScheduleItem', 'updateScheduleItem', 'deleteScheduleItem',
    'duplicateScheduleItem', 'reorderScheduleItems', 'setScheduleItemStatus',
    'addScheduleAssignment', 'updateScheduleAssignment', 'deleteScheduleAssignment',
    'addStaffDuty', 'updateStaffDuty', 'deleteStaffDuty',
  ];

  it('registers read actions in the read dispatch map', () => {
    const readMap = eo.slice(eo.indexOf('$readActions'), eo.indexOf('$adminActions'));
    for (const a of readActions) {
      expect(readMap).toContain(`'${a}'`);
    }
  });

  it('registers all write actions in the admin dispatch map', () => {
    const adminMap = eo.slice(eo.indexOf('$adminActions'));
    for (const a of adminActions) {
      expect(adminMap).toContain(`'${a}'`);
    }
  });

  it('includes the schedule endpoints file', () => {
    expect(eo).toContain("require_once __DIR__ . '/event-ops-schedule.php'");
  });
});

describe('v40 handler capability enforcement', () => {
  const writeFns = [
    'eo_addScheduleItem', 'eo_updateScheduleItem', 'eo_deleteScheduleItem',
    'eo_duplicateScheduleItem', 'eo_reorderScheduleItems', 'eo_setScheduleItemStatus',
    'eo_addScheduleAssignment', 'eo_updateScheduleAssignment', 'eo_deleteScheduleAssignment',
    'eo_addStaffDuty', 'eo_updateStaffDuty', 'eo_deleteStaffDuty',
  ];

  it('read handler calls eo_requireRead', () => {
    expect(fnBody('eo_getSchedule')).toContain('eo_requireRead');
  });

  for (const fn of writeFns) {
    it(`${fn} calls eo_requireAdmin`, () => {
      const body = fnBody(fn);
      expect(body.length).toBeGreaterThan(0);
      expect(body).toContain('eo_requireAdmin');
    });
  }
});

describe('v40 cross-event leakage protection', () => {
  it('plan-ownership validators exist', () => {
    for (const fn of ['eos_validateItemBelongsToPlan', 'eos_validateStaffBelongsToPlan', 'eos_validateSessionBelongsToPlan']) {
      expect(sched).toContain(`function ${fn}(`);
    }
  });

  it('item validator rejects items from another plan with 403', () => {
    const body = fnBody('eos_validateItemBelongsToPlan');
    expect(body).toContain("item['event_plan_id'] !== $planId");
    expect(body).toContain('403');
  });

  it('staff validator scopes to event_plan_id', () => {
    const body = fnBody('eos_validateStaffBelongsToPlan');
    expect(body).toContain('event_plan_id = ?');
  });

  it('every item-scoped write loads the item via the existence guard', () => {
    for (const fn of ['eo_updateScheduleItem', 'eo_deleteScheduleItem', 'eo_duplicateScheduleItem', 'eo_setScheduleItemStatus']) {
      const body = fnBody(fn);
      expect(body).toContain('eos_getScheduleItemOrFail');
    }
  });

  it('item writes validate session ownership to prevent cross-plan linkage', () => {
    expect(fnBody('eo_addScheduleItem')).toContain('eos_validateSessionBelongsToPlan');
    expect(fnBody('eo_updateScheduleItem')).toContain('eos_validateSessionBelongsToPlan');
  });

  it('assignment writes validate both item existence and staff plan ownership', () => {
    const body = fnBody('eo_addScheduleAssignment');
    expect(body).toContain('eos_getScheduleItemOrFail');
    expect(body).toContain('eos_validateStaffBelongsToPlan');
    // staff plan is derived from the item's plan — not trusted from the request
    expect(body).toContain("$planId = (int) $item['event_plan_id']");
  });

  it('duty writes derive event_plan_id from the staff record, not the request', () => {
    const body = fnBody('eo_addStaffDuty');
    expect(body).toContain("$staff['event_plan_id']");
    expect(body).toContain('Staff member does not belong to this plan');
  });

  it('getSchedule scopes items to the requested plan', () => {
    const body = fnBody('eo_getSchedule');
    expect(body).toContain('event_plan_id = ?');
    expect(body).toContain('eo_getPlanOrFail');
  });
});

describe('v40 deletion and ordering semantics', () => {
  it('delete uses soft delete (deleted_at), never DELETE FROM', () => {
    const body = fnBody('eo_deleteScheduleItem');
    expect(body).toContain('deleted_at');
    expect(body).not.toContain('DELETE FROM');
    // entire file must not hard-delete schedule rows
    expect(sched).not.toMatch(/DELETE\s+FROM\s+event_schedule/);
    expect(sched).not.toMatch(/DELETE\s+FROM\s+event_plan_staff_duties/);
  });

  it('reorder renumbers within (plan, date) scope only', () => {
    const body = fnBody('eos_renumberDay');
    expect(body).toContain('event_plan_id = ?');
    expect(body).toContain('schedule_date');
    expect(body).toContain('sort_order');
  });

  it('reorder validates all ids belong to the plan day (filtered against existing)', () => {
    const body = fnBody('eos_renumberDay');
    // ids not in the day's existing set are dropped, not renumbered
    expect(body).toContain('in_array');
    expect(body).toContain('$existing');
  });
});

describe('v40 date/time handling and extensibility', () => {
  it('schedule_date is validated as YYYY-MM-DD', () => {
    expect(sched).toContain('schedule_date must be YYYY-MM-DD');
    expect(sched).toMatch(/schedule_date.*\\d\{4\}-\\d\{2\}-\\d\{2\}|preg_match.*schedule_date/s);
  });

  it('status values are an extensible list (VARCHAR, app-level validation)', () => {
    expect(sched).toContain('EO_SCHEDULE_STATUSES');
    expect(sched).toContain("'called'");
    expect(sched).toContain("'running'");
    expect(sched).toContain("'delayed'");
    // not a hard-coded ENUM in the schema — the migration uses VARCHAR
    const mig = readFileSync(resolve(ROOT, 'api/migrations/v40-event-ops-schedule.php'), 'utf8');
    expect(mig).toContain("status              VARCHAR(32)");
  });

  it('activity types cover the printed schedule activities', () => {
    for (const t of ['racing', 'meeting', 'inspection', 'contingency', 'parade', 'teardown', 'secure', 'other']) {
      expect(sched).toContain(`'${t}'`);
    }
  });

  it('duplicate copies assignments to the new item', () => {
    const body = fnBody('eo_duplicateScheduleItem');
    expect(body).toContain('event_schedule_assignments');
    expect(body).toContain('INSERT');
  });

  it('staff duties accept free-text duty names (not enum-locked)', () => {
    const body = fnBody('eo_addStaffDuty');
    expect(body).toContain("'duty required'");
    expect(body).not.toContain('in_array'); // duty text is not restricted to a fixed list
  });
});
