/**
 * v41 Request/Roster Integrity Tests (PR review fixes)
 *
 * Static verification of api/event-ops-staffing.php, api/event-ops.php and
 * api/migrations/v41-event-ops-staffing.php for the data-integrity guarantees
 * required before production:
 *
 *   1. Request status ↔ confirmed-roster consistency (transition model,
 *      transactions, staff deactivation instead of silent divergence)
 *   2. Confirmation happens on the exact plan being viewed (plan_id required,
 *      parity-event match enforced, no "latest plan" inference)
 *   3. Worker-supplied person_id is never persisted — identity comes from the
 *      trusted (admin-linked) worker profile
 *   4. v41 lodging migration records real errors instead of a false
 *      "already exists" message
 *   5. carpool_with_staff_id is same-plan validated on UPDATE as well as INSERT
 *   6. Dependent-field invariants (partial availability, roommate, dietary)
 *      are enforced identically on submit and update
 *   7. Re-linking a plan to a parity event re-syncs its canonical identity
 *   8. Worker-facing navigation exists for /event-ops/requests
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';

const ROOT = resolve(__dirname, '../../../../');
const staffing = () => readFileSync(resolve(ROOT, 'api/event-ops-staffing.php'), 'utf8');
const plans = () => readFileSync(resolve(ROOT, 'api/event-ops.php'), 'utf8');
const migration = () => readFileSync(resolve(ROOT, 'api/migrations/v41-event-ops-staffing.php'), 'utf8');
const app = () => readFileSync(resolve(ROOT, 'src/app/App.tsx'), 'utf8');
const apiClient = () => readFileSync(resolve(ROOT, 'src/domain/eventOps/eventOpsApi.ts'), 'utf8');

/** Extract one PHP function body (from `function name(` to the next top-level `function` or EOF). */
function fn(src: string, name: string): string {
  const i = src.indexOf(`function ${name}(`);
  if (i < 0) return '';
  const rest = src.slice(i);
  const next = rest.indexOf('\nfunction ', 10);
  return next < 0 ? rest : rest.slice(0, next);
}

describe('request status ↔ roster transition model', () => {
  it('defines an explicit allowed-transition map', () => {
    const src = staffing();
    expect(src).toContain('EOW_DECISION_TRANSITIONS');
    expect(src).toContain("'requested'  => ['confirmed', 'waitlisted', 'declined']");
    expect(src).toContain("'waitlisted' => ['confirmed', 'declined']");
    expect(src).toContain("'declined'   => ['requested']");
    expect(src).toContain("'cancelled'  => ['requested']");
    expect(src).toContain("'confirmed'  => ['cancelled', 'declined', 'waitlisted', 'requested']");
  });

  it('rejects transitions outside the allowed map', () => {
    const decide = fn(staffing(), 'eow_decideWorkRequest');
    expect(decide).toContain('EOW_DECISION_TRANSITIONS[$current]');
    expect(decide).toContain("Cannot transition request from");
  });

  it('leaving confirmed deactivates the staff row instead of deleting it', () => {
    const decide = fn(staffing(), 'eow_decideWorkRequest');
    expect(decide).toContain("$current === 'confirmed'");
    expect(decide).toContain('SET is_active = 0');
    expect(decide).not.toContain('DELETE FROM event_plan_staff');
  });

  it('re-confirmation reactivates the linked staff row on the same plan', () => {
    const decide = fn(staffing(), 'eow_decideWorkRequest');
    expect(decide).toContain('SET is_active = 1');
    expect(decide).toContain("different plan");
  });

  it('wraps the staff-row + request update in a transaction', () => {
    const decide = fn(staffing(), 'eow_decideWorkRequest');
    expect(decide).toContain('$pdo->beginTransaction()');
    expect(decide).toContain('$pdo->commit()');
    expect(decide).toContain('rollBack');
    // History insert inside the transaction
    const txStart = decide.indexOf('beginTransaction');
    const txEnd = decide.indexOf('commit()');
    expect(decide.indexOf('INSERT INTO event_plan_staff', txStart)).toBeLessThan(txEnd);
    expect(decide.indexOf('eow_recordRequestEvent', txStart)).toBeLessThan(txEnd);
    expect(decide.indexOf('UPDATE event_staff_requests', txStart)).toBeLessThan(txEnd);
  });

  it('worker self-cancel is forbidden for confirmed requests', () => {
    const src = staffing();
    expect(src).toContain('EOW_WORKER_CANCELLABLE');
    expect(src).toContain("'requested', 'waitlisted'");
    const cancel = fn(src, 'eow_cancelWorkRequest');
    expect(cancel).toContain('EOW_WORKER_CANCELLABLE');
    expect(cancel).toContain('confirmed');
    expect(cancel).toContain('administrator');
  });
});

describe('confirmation on the exact viewed plan', () => {
  const decide = () => fn(staffing(), 'eow_decideWorkRequest');

  it('requires plan_id and loads that exact plan', () => {
    expect(decide()).toContain("plan_id required");
    expect(decide()).toContain('eo_getPlanOrFail($pdo, $planId)');
  });

  it('rejects a plan whose parity_event_id differs from the request', () => {
    expect(decide()).toContain("does not belong to the same canonical event");
  });

  it('creates/reuses staff rows only on the supplied plan', () => {
    const d = decide();
    expect(d).toContain('WHERE event_plan_id = ? AND user_id = ?');
    expect(d).toContain("(int) $plan['id']");
    expect(d).not.toContain('eow_planForParityEvent');
  });

  it('the latest-plan inference helper is gone entirely', () => {
    expect(staffing()).not.toContain('eow_planForParityEvent');
    // decideWorkRequest must not infer a plan by recency
    expect(decide()).not.toContain('ORDER BY id DESC');
  });

  it('client passes plan_id to decideWorkRequest', () => {
    expect(apiClient()).toContain('plan_id: planId');
    const panel = readFileSync(resolve(ROOT, 'src/pages/eventops/EventStaffPanel.tsx'), 'utf8');
    expect(panel).toContain('decideWorkRequest(r.id, planId, decision)');
  });
});

describe('worker person_id cannot be forged', () => {
  it('submit derives person_id from the trusted profile, not the body', () => {
    const submit = fn(staffing(), 'eow_submitWorkRequest');
    expect(submit).toContain('eow_trustedPersonId($pdo, $userId)');
    expect(submit).not.toContain("$b['person_id']");
  });

  it('profile create never persists a worker-supplied person_id', () => {
    const prof = fn(staffing(), 'eow_updateMyWorkerProfile');
    expect(prof).not.toContain("$b['person_id']");
    expect(prof).toContain('VALUES (?,?,NULL,?,?,?,?,?)');
  });

  it('trusted linkage reads only the admin-controlled profile person_id', () => {
    const helper = fn(staffing(), 'eow_trustedPersonId');
    expect(helper).toContain('eow_profile($pdo, $userId)');
    expect(helper).not.toContain('$b[');
  });

  it('admin link endpoint exists, requires admin, validates person exists', () => {
    const link = fn(staffing(), 'eow_adminLinkWorkerPerson');
    expect(link).toContain('eo_requireAdmin');
    expect(link).toContain('person_id not found');
    expect(link).toContain('UPDATE event_worker_profiles SET person_id');
    expect(plans()).toContain("'adminLinkWorkerPerson'     => 'eow_adminLinkWorkerPerson'");
  });
});

describe('v41 lodging migration error handling', () => {
  it('lodging create failure is recorded as an error, not "already exists"', () => {
    const src = migration();
    expect(src).toContain('"Failed to create event_staff_lodging: " . $e->getMessage()');
    // The false-success pattern must not survive inside the catch block
    // (the explicit `else` "already exists" branch is correct and stays).
    const lodging = src.slice(src.indexOf('event_staff_lodging ───'));
    const catchIdx = lodging.indexOf('catch (PDOException');
    const catchBlock = lodging.slice(catchIdx, lodging.indexOf('}', catchIdx));
    expect(catchBlock).not.toContain('already exists');
    expect(catchBlock).toContain("$result['errors'][]");
  });
});

describe('carpool validation on travel-leg update', () => {
  it('updateTravelLeg loads the owning staff row and enforces same plan', () => {
    const upd = fn(staffing(), 'eow_updateTravelLeg');
    expect(upd).toContain('eow_getStaffOrFail($pdo, (int) $legStaffId)');
    expect(upd).toContain("carpool_with_staff_id");
    expect(upd).toContain("c['event_plan_id'] !== (int) $legStaff['event_plan_id']");
    expect(upd).toContain('carpool driver must be staff on the same plan');
  });
});

describe('request dependent-field invariants (submit + update)', () => {
  it('shared normalizer enforces all invariants', () => {
    const norm = fn(staffing(), 'eow_normalizeRequestFields');
    expect(norm).toContain("=== 'partial'");
    expect(norm).toContain('available_from and available_through');
    expect(norm).toContain('available_from must be on or before available_through');
    expect(norm).toContain("'hotel'");
    expect(norm).toContain("'specific_person'");
    expect(norm).toContain("'none'");
    // clears dependent fields
    expect(norm).toContain("$v['available_from'] = null");
    expect(norm).toContain("$v['roommate_person_id'] = null");
    expect(norm).toContain("$v['dietary_detail'] = null");
  });

  it('both submit and update run the normalizer', () => {
    expect(fn(staffing(), 'eow_submitWorkRequest')).toContain('eow_normalizeRequestFields($v)');
    expect(fn(staffing(), 'eow_updateWorkRequest')).toContain('eow_normalizeRequestFields($v)');
  });

  it('update merges body over the existing row before normalizing', () => {
    const upd = fn(staffing(), 'eow_updateWorkRequest');
    expect(upd).toContain("array_key_exists('lodging_intent', $b) ? $b['lodging_intent'] : $r['lodging_intent']");
    expect(upd).toContain("array_key_exists('dietary_category', $b)");
  });
});

describe('canonical plan re-link consistency', () => {
  const upd = () => fn(plans(), 'eo_updatePlan');

  it('loads the parity event + track when parity_event_id is supplied', () => {
    const u = upd();
    expect(u).toContain("array_key_exists('parity_event_id', $b)");
    expect(u).toContain('track_name_canonical');
    expect(u).toContain('parity_event_id not found');
  });

  it('syncs identity fields from the canonical event when not overridden', () => {
    const u = upd();
    expect(u).toContain("$b['year'] = (int) $pe['season_year']");
    expect(u).toContain("$b['event_code'] = $pe['event_code']");
    expect(u).toContain("$b['event_date'] = $pe['start_date_local']");
    expect(u).toContain("$b['track_name'] = $pe['track_name_canonical']");
    expect(u).toContain("$b['event_instance_id'] = $pe['event_instance_id']");
  });

  it('explicit detach clears the parity bridge link', () => {
    const u = upd();
    expect(u).toContain("if (!array_key_exists('event_instance_id', $b)) $b['event_instance_id'] = null;");
  });
});

describe('worker navigation discoverability', () => {
  it('/event-ops/requests route requires only auth', () => {
    const a = app();
    const routeIdx = a.indexOf('path="/event-ops/requests"');
    const routeBlock = a.slice(routeIdx, routeIdx + 400);
    expect(routeBlock).toContain('ProtectedRoute');
    expect(routeBlock).not.toContain('CapabilityRoute');
  });

  it('nav exposes Work an Event to every authenticated user', () => {
    const a = app();
    expect(a).toContain('Work an Event');
    expect(a).toContain('to="/event-ops/requests"');
    // gated on login only — NOT on eventops.read
    const navIdx = a.indexOf('Work an Event');
    const navBlock = a.slice(Math.max(0, navIdx - 300), navIdx);
    expect(navBlock).toContain('isLoggedIn');
    expect(navBlock).not.toContain('canAccessEventOps');
  });
});
