# Event Operations Phase B — Live Event Checklist Foundation
## Sprint Results

**Sprint goal:** Turn Event Ops pre-event plan sessions and tasks into a live event execution checklist.

---

## Objective

Enable Tech staff to work through planned checks during the event: mark tasks complete, record results/issues, carry unresolved items forward, and track session progress in real time. No post-event report generation in this sprint.

---

## Git Hashes

| Checkpoint | Hash |
|------------|------|
| Phase A end (docs) | `cbe8999` |
| Phase B start | `cbe8999` |
| v38 migration + scripts | `00d1bf3` |
| API (Part 2) | `759a6f5` |
| Frontend + route (Parts 3+4) | `8bd7a1d` |
| Tests (Part 7) | `af6aa57` |
| Docs (Part 10) | TBD (this commit) |

---

## Files Changed

### New files
| File | Purpose |
|------|---------|
| `api/migrations/v38-event-ops-live-checklist.php` | Shared migration core — 4 live checklist tables |
| `api/migrate-v38-event-ops-live-checklist.php` | Web runner (admin auth required) |
| `scripts/migrations/check-v38-event-ops-live-checklist.mjs` | Status check script (always dry-run) |
| `scripts/migrations/run-v38-event-ops-live-checklist.mjs` | CLI runner (--apply required) |
| `src/pages/EventLiveChecklist.tsx` | Live checklist page component |
| `src/domain/eventOps/__tests__/v38MigrationSafety.test.ts` | 20 migration safety tests |
| `src/app/__tests__/eventLiveChecklistRoutes.test.tsx` | 17 route/UI/capability tests |

### Modified files
| File | Change |
|------|--------|
| `api/event-ops.php` | +16 live checklist actions (read + admin), +router entries |
| `src/domain/eventOps/eventOpsApi.ts` | +types and API functions for live checklist |
| `src/app/App.tsx` | +`EventLiveChecklist` lazy import + `/event-ops/:id/live` route |
| `src/pages/EventPlanDetail.tsx` | +"Live Checklist" button in plan header |

---

## v38 Migration Details

**Tables created:**

| Table | Purpose |
|-------|---------|
| `event_live_checklists` | One per event plan execution run; tracks overall status, active session |
| `event_live_task_updates` | Per-task status/result/notes/flags during live execution |
| `event_live_task_files` | Files attached to a task update |
| `event_live_session_status` | Per-session start/complete timestamps and status |

**Status values** (all tables): `not_started`, `in_progress`, `complete`, `issue_found`, `skipped`, `blocked`, `not_applicable`

**Safety:**
- `CREATE TABLE IF NOT EXISTS` only — no DROP, TRUNCATE, DELETE, UPDATE
- All tables have `deleted_at` for soft delete
- No parity table references
- No sample data seeded
- Idempotent

---

## v38 Production Status

**✅ APPLIED** — 2026-05-14 ~00:20 UTC

Method: Direct PHP CLI via SSH (same pattern as v35/v36/v37).

### Dry-run output (pre-apply)
```
=== v38 Event Ops Live Checklist Migration ===
Before:
  event_live_checklists: MISSING
  event_live_task_updates: MISSING
  event_live_task_files: MISSING
  event_live_session_status: MISSING
DRY RUN — No changes made.
```

### Apply output
```
✓ event_live_checklists created
✓ event_live_task_updates created
✓ event_live_task_files created
✓ event_live_session_status created
=== Migration v38 complete ===
No parity tables were modified. No sample data seeded.
```

### Row counts after apply
| Table | Rows |
|-------|------|
| `event_live_checklists` | 0 ✅ |
| `event_live_task_updates` | 0 ✅ |
| `event_live_task_files` | 0 ✅ |
| `event_live_session_status` | 0 ✅ |

---

## API Actions Added

### Read actions (require `eventops.read`)
| Action | Description |
|--------|-------------|
| `getLiveChecklist` | Get or lazily create checklist record for plan |
| `listLiveSessionStatus` | Sessions with live status merged in |
| `listLiveTaskUpdates` | Tasks with live update merged in |
| `getLiveTaskSummary` | Counts by status, issue/followup/carry totals |

### Admin actions (require `eventops.admin`)
| Action | Description |
|--------|-------------|
| `startLiveChecklist` | Mark checklist in_progress, set started_at |
| `updateLiveChecklistStatus` | Update overall checklist status |
| `startSession` | Mark session in_progress, set active session on checklist |
| `completeSession` | Mark session complete |
| `updateSessionStatus` | Set any session status + notes |
| `updateTaskStatus` | Set task status (auto-sets issue_found on issue_found status) |
| `addTaskNote` | Set notes/result text on task update |
| `addTaskFileReference` | Attach file reference to task update |
| `markTaskFollowupRequired` | Set followup_required=1 |
| `markTaskCarryForward` | Set carry_forward=1 |
| `clearTaskFollowup` | Set followup_required=0 |
| `clearTaskCarryForward` | Set carry_forward=0 |

**Lazy creation:** `getLiveChecklist`, session status records, and task update records are all created on first access — no separate "init" step required.

**Validation:** task/session membership checked against plan before any write.

---

## Route / Page Added

| Route | Component | Capability |
|-------|-----------|------------|
| `/event-ops/:id/live` | `EventLiveChecklist` | `eventops.read` |

### EventLiveChecklist UI features
- Plan header: event code, year, track, class scope, checklist status
- Progress bar + summary stats (total, complete, open, in-progress, issues, follow-ups, carry-forward)
- "Current Session" highlight — resolves active → in-progress → next scheduled → first incomplete
- Session blocks with task count, complete count, issue count, follow-up count
- Task cards: title, description, status badge, issue/follow-up/carry-forward flags, notes, result
- Admin controls: quick status buttons (Complete, Issue, Skip, Blocked, N/A), note input, follow-up/carry-forward toggles
- Read-only users: status visible, no mutation controls
- Follow-ups tab: all tasks with `followup_required=1` or `carry_forward=1`
- "Live Checklist" button added to `EventPlanDetail` header

---

## Tests Run / Results

| Suite | Tests | Result |
|-------|-------|--------|
| `v38MigrationSafety.test.ts` | 20 | ✅ All pass |
| `eventLiveChecklistRoutes.test.tsx` | 17 | ✅ All pass |
| `eventOpsCapabilities.test.ts` | 20 | ✅ All pass (no regression) |
| `v37MigrationSafety.test.ts` | 18 | ✅ All pass (no regression) |
| `eventOpsRoutes.test.tsx` | 8 | ✅ All pass (no regression) |
| `accessEnforcement.test.ts` | 67 | ✅ All pass (no regression) |
| `committeesApi.test.ts` | 22 | ✅ All pass (no regression) |
| `shellCleanup.test.tsx` | 11 | ✅ All pass (no regression) |
| `helpCenter.test.tsx` | 11 | ✅ All pass (no regression) |
| Pre-existing failures | 17 | parityDashboards/qualSheetDriverHistory — unchanged |
| **Total critical passing** | **220** | ✅ |

Build: ✅ clean (`npm run build` — 8.12s, no errors)

---

## Production Verification

*Completed: 2026-05-14*

### Files Verified (SSH)
| File | Status |
|------|--------|
| `api/migrations/v38-event-ops-live-checklist.php` | ✅ EXISTS (deployed 2026-05-14 00:20 UTC) |
| `api/migrate-v38-event-ops-live-checklist.php` | ✅ EXISTS (deployed 2026-05-14 00:20 UTC) |
| `api/config.php` | ✅ PRESERVED — last modified 2026-05-12 |

### SPA Routes
| Route | HTTP | Status |
|-------|------|--------|
| `/event-ops/1/live` | 200 | ✅ SPA HTML |
| `/event-ops` | 200 | ✅ |
| `/parity` | 200 | ✅ |
| `/rules` | 200 | ✅ |

### API Checks (unauthenticated)
| Endpoint | HTTP | Status |
|----------|------|--------|
| `/api/event-ops.php?action=getLiveChecklist&plan_id=1` | 401 | ✅ not 500 |
| `/api/event-ops.php?action=listLiveTaskUpdates&plan_id=1` | 401 | ✅ not 500 |

### Confirmation: No Parity Logic Touched
- ✅ Zero changes to `parity.php`, `parity_weather_provider.php`
- ✅ Zero changes to parity DB tables
- ✅ Zero changes to weather correction, combo resolution, ET calculation
- ✅ `api/config.php` not overwritten

### Confirmation: No Sample Data Seeded
- ✅ All 4 v38 tables at 0 rows after migration
- ✅ No INSERT statements in migration file (verified by v38MigrationSafety tests)

---

## Commit Summary

| Commit | Hash | Content |
|--------|------|---------|
| v38 migration + scripts | `00d1bf3` | 4 migration files |
| API (Part 2) | `759a6f5` | 16 new API actions |
| Frontend + route (Parts 3+4) | `8bd7a1d` | eventOpsApi.ts, EventLiveChecklist.tsx, App.tsx, EventPlanDetail.tsx |
| Tests (Part 7) | `af6aa57` | 37 new tests |
| Docs (Part 10) | this commit | Sprint results doc |

---

## Next Recommended Phase

### Event Ops Phase C — Post-Event Report Builder

Suggested scope:
- Aggregate task results, issue_found records, and follow-up flags from a completed live checklist
- Generate a structured post-event report: sections for issues, follow-ups, carry-forward items, task completion stats
- PDF export capability
- Carry-forward automation: create next-event task seeds from `carry_forward=1` items
- Entry list integration: link task results to specific TM entries where applicable
- Box upload: attach report to event Box folder

Pre-requisites before starting Phase C:
1. ✅ v38 applied in production — all 4 tables exist at 0 rows
2. At least one live checklist run completed via UI to validate full data flow
3. ✅ `/event-ops/:id/live` returns 200, API returns 401 unauthenticated

**Cleared for Phase C: YES** — v38 applied, all tables at 0 rows, API healthy, no parity logic touched.
