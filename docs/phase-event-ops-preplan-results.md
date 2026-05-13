# Event Operations Phase A — Pre-Event Plan Builder Results

*Sprint completed: May 13, 2026*

---

## Objective

Build the foundation for creating structured pre-event plans on nhratechservices.com,
modeled on the Nitro pre-event plan sample. Create the data model, API, and basic UI
for creating, editing, and viewing pre-event plans.

Not in scope for this sprint: live execution checklists, post-event reports.

---

## Starting Git Hash

`0550c3e` — feat(payload): targeted SSH cleanup of legacy server files + docs update

---

## Ending Git Hash

`4c20efc` — feat(eventops): Part 8 — 46 new tests (capabilities, migration safety, routes)

---

## Commits

| Hash | Description |
|------|-------------|
| `c1ae3a7` | Part 1+2 — capabilities + routes |
| `41012dc` | Part 3 — v37 migration |
| `052cc79` | Part 4 — api/event-ops.php |
| `f891d6d` | Parts 5+6+7 — frontend service, pages, Nitro template |
| `4c20efc` | Part 8 — 46 new tests |

---

## Files Changed

### New files
| File | Description |
|------|-------------|
| `api/migrations/v37-event-ops-plans.php` | Core migration — 7 tables |
| `api/migrate-v37-event-ops-plans.php` | Web runner (admin auth) |
| `scripts/migrations/run-v37-event-ops-plans.mjs` | CLI runner (--apply required) |
| `scripts/migrations/check-v37-event-ops-plans.mjs` | Dry-run status check |
| `api/event-ops.php` | REST API — 23 actions |
| `src/domain/eventOps/eventOpsApi.ts` | Typed frontend API client |
| `src/domain/eventOps/nitroTemplate.ts` | Static Nitro pre-event plan template |
| `src/pages/EventOpsList.tsx` | List page with create modal |
| `src/pages/EventPlanDetail.tsx` | 8-tab read-only detail view |
| `src/pages/EventPrePlanEditor.tsx` | 6-tab admin editor |
| `src/domain/eventOps/__tests__/eventOpsCapabilities.test.ts` | 20 capability tests |
| `src/domain/eventOps/__tests__/v37MigrationSafety.test.ts` | 18 migration safety tests |
| `src/app/__tests__/eventOpsRoutes.test.tsx` | 8 route/UI tests |

### Modified files
| File | Change |
|------|--------|
| `api/lib/capabilities.php` | Added `eventops.read` to nhra plan; `eventops.read/admin` to owner/admin roles |
| `src/domain/config/capabilities.ts` | Same additions in TypeScript |
| `src/app/App.tsx` | Routes, nav, NHRA_ALLOWED_PREFIXES |

---

## Capability Model

| Capability | Who has it |
|------------|-----------|
| `eventops.read` | `nhra` plan members; `owner` role; `admin` role |
| `eventops.admin` | `owner` role; `admin` role only |

- `nhra` plan members can view all plans but cannot create, edit, or delete
- `owner`/`admin` roles get both capabilities regardless of plan
- `fullAccess` context grants both capabilities

---

## Routes Added

| Route | Capability Gate | Page |
|-------|----------------|------|
| `/event-ops` | `eventops.read` | EventOpsList |
| `/event-ops/:id` | `eventops.read` | EventPlanDetail |
| `/event-ops/:id/pre-plan` | `eventops.read` | EventPrePlanEditor (admin gate inside) |

`/event-ops` added to `NHRA_ALLOWED_PREFIXES` — NHRA plan users are allowed here.

---

## API Endpoints Added (`/api/event-ops.php?action=<action>`)

### Read actions (require `eventops.read`)
| Action | Description |
|--------|-------------|
| `listPlans` | List all non-deleted plans |
| `getPlan` | Get single plan by plan_id |
| `getPlanStaff` | Get staff for a plan |
| `getPlanSections` | Get freeform sections |
| `getPlanSessions` | Get sessions |
| `getPlanTasks` | Get tasks |
| `getPlanFiles` | Get file references |

### Admin actions (require `eventops.admin`)
| Action | Description |
|--------|-------------|
| `createPlan` | Create new plan |
| `updatePlan` | Update plan fields |
| `softDeletePlan` | Soft delete plan |
| `clonePlan` | Clone plan + sections + sessions |
| `generateFromTemplate` | Placeholder (not yet implemented) |
| `addStaff` / `updateStaff` / `deleteStaff` | Staff CRUD |
| `addSection` / `updateSection` / `deleteSection` | Section CRUD |
| `addSession` / `updateSession` / `deleteSession` | Session CRUD |
| `addTask` / `updateTask` / `deleteTask` | Task CRUD |
| `addTaskTarget` / `deleteTaskTarget` | Task target CRUD |
| `addFile` / `updateFile` / `deleteFile` | File reference CRUD |

---

## v37 Migration Details

### Tables Created (all `CREATE TABLE IF NOT EXISTS`)

| Table | Key Columns |
|-------|-------------|
| `event_plans` | id, uuid, event_instance_id (nullable FK), parity_event_id (nullable FK), year, event_code, title, plan_type, status, created_by, deleted_at |
| `event_plan_staff` | id, event_plan_id, user_id (null), person_id (null), display_name, assignment, arrive_at, depart_at, deleted_at |
| `event_plan_sections` | id, event_plan_id, section_key, title, body (LONGTEXT), sort_order, deleted_at |
| `event_plan_sessions` | id, event_plan_id, session_key, title, class_scope, scheduled_at, deleted_at |
| `event_plan_tasks` | id, event_plan_id, session_id (null), title, task_type, priority, status, carry_forward_to_next_event, deleted_at |
| `event_plan_task_targets` | id, task_id, event_entry_id (null), driver_name, class_code, deleted_at |
| `event_plan_files` | id, event_plan_id, file_type, title, url, box_file_id, box_folder_id, deleted_at |

### Indexes
- `event_plan_id` on all child tables
- `event_instance_id`, `parity_event_id` on `event_plans`
- `class_scope`, `status` on relevant tables
- `session_id` on `event_plan_tasks`

### Safety
- `CREATE TABLE IF NOT EXISTS` only — idempotent
- No `DROP`, `TRUNCATE TABLE`, `DELETE FROM`, `UPDATE … SET`
- No parity table modifications
- No sample data inserted
- Soft delete (`deleted_at`) on all tables
- Runner defaults to dry-run; requires `--apply` to execute

---

## v37 Migration Production Status

**✅ APPLIED** — 2026-05-13 ~23:40 UTC

Method: Direct PHP CLI via SSH (Node scripts not deployed to production — same pattern as v35/v36).

```
php -r "... v37MigrateEventOpsPlans($pdo, false) ..."
```

### Actual Row Counts After Apply
| Table | Rows | Status |
|-------|------|--------|
| event_plans | 0 | ✅ |
| event_plan_staff | 0 | ✅ |
| event_plan_sections | 0 | ✅ |
| event_plan_sessions | 0 | ✅ |
| event_plan_tasks | 0 | ✅ |
| event_plan_task_targets | 0 | ✅ |
| event_plan_files | 0 | ✅ |

No sample data seeded. No parity tables modified.

---

## Tests Run / Results

| Suite | Tests | Result |
|-------|-------|--------|
| `eventOpsCapabilities.test.ts` | 20 | ✅ All pass |
| `v37MigrationSafety.test.ts` | 18 | ✅ All pass |
| `eventOpsRoutes.test.tsx` | 8 | ✅ All pass |
| `shellCleanup.test.tsx` | 37 | ✅ All pass (no regression) |
| `helpCenter.test.tsx` | 11 | ✅ All pass (no regression) |
| `accessEnforcement.test.ts` | 67 | ✅ All pass (no regression) |
| `committeesApi.test.ts` | 22 | ✅ All pass (no regression) |
| Pre-existing failures | 17 | Pre-existing in parityDashboards/qualSheetDriverHistory — unchanged |
| **Total passing** | **201** | ✅ |

Build: ✅ clean (`npm run build` — no errors, one chunk-size warning pre-existing)

`npm run baseline:nhra`: 2 PASS, 0 FAIL — API/DB checks BLOCKED (no credentials in CI env — expected, exit code 0)

---

## Production Verification

*Completed: 2026-05-13*

### GitHub Actions / Deploy
- **Workflow**: Build and Deploy to SiteGround — triggered on push to `main`
- **Deploy hash**: `db4a44c` (all Phase A commits confirmed on server by file timestamps 2026-05-13 23:39 UTC)
- **Production asset**: `assets/index-CKSJOy5B-1778715561493.js`
- **Event Ops in bundle**: ✅ — `/event-ops` route strings and `eventops` capability strings confirmed in production JS
- **deploy-check.txt note**: Shows older SHA `252917d` — stale from a prior workflow run; actual file timestamps confirm current code is live

### Production Files Verified (SSH)
| File | Status |
|------|--------|
| `api/event-ops.php` | ✅ EXISTS (deployed 2026-05-13 23:39 UTC) |
| `api/migrations/v37-event-ops-plans.php` | ✅ EXISTS (deployed 2026-05-13 23:39 UTC) |
| `api/migrate-v37-event-ops-plans.php` | ✅ EXISTS |
| `api/config.php` | ✅ EXISTS — last modified 2026-05-12 (not overwritten by deploy) |
| `api/lib/capabilities.php` | ✅ EXISTS (deployed 2026-05-13 23:39 UTC) |

### SPA Routes
| Route | HTTP | Status |
|-------|------|--------|
| `/event-ops` | 200 | ✅ |
| `/parity` | 200 | ✅ |
| `/tech` | 200 | ✅ |
| `/rules` | 200 | ✅ |
| `/rules/committees` | 200 | ✅ |

### API Checks (unauthenticated)
| Endpoint | HTTP | Status |
|----------|------|--------|
| `/api/event-ops.php?action=listPlans` | 401 | ✅ not 500 |
| `/api/event-ops.php?action=getPlan&plan_id=1` | 401 | ✅ not 500 |
| `/api/parity.php?action=events` | 401 | ✅ not 500 |
| `/api/rules.php?action=list` | 401 | ✅ not 500 |
| `/api/rules-committees.php?action=list` | 401 | ✅ not 500 |
| `/api/auth.php?action=me` | 401 | ✅ not 500 |

### Authenticated Checks
- **BLOCKED — ACCESS NEEDED**: No test JWT available in local env. Authenticated `eventops.read` flow not exercised automatically.
- Manual verification recommended: log in as NHRA user → confirm `/event-ops` shows empty state.

### Confirmation: No Sample Plans Seeded
- ✅ All 7 v37 tables at 0 rows after migration
- ✅ No INSERT statements in migration file (verified by v37MigrationSafety tests)

### Confirmation: No Parity Logic Touched
- ✅ Zero changes to `parity.php`, `parity_weather_provider.php`
- ✅ Zero changes to parity DB tables
- ✅ Zero changes to weather correction, combo resolution, ET calculation
- ✅ `api/config.php` not overwritten (timestamp confirms: last modified 2026-05-12)

---

## Nitro Pre-Event Plan Template

`src/domain/eventOps/nitroTemplate.ts` — `NITRO_PRE_EVENT_TEMPLATE`

Sections (7): Event Schedule, Staffing, Event Map, Entry List by Class,
Priority Inspections & Surveys, Session Plan, Incident Plan/Checklist

Sessions (7): Pre-Event Tech, Practice 1, Q1, Q2, Q3, Eliminations R1, Finals

Tasks (8): New entrant docs, fuel system inspection, ballistic blanket check,
scale calibration, staff briefing, pre-session check-in, winner inspection,
incident system verification

Usage: "Apply Nitro Template" button in EventPrePlanEditor (Sections/Sessions tabs).
Adds only missing sections/sessions — never overwrites existing content.
**Not auto-inserted into DB.**

---

## Next Recommended Phase: Event Ops Phase B

**Live Event Checklist + Post-Event Reports**

Suggested scope:
- Live checklist execution mode — mark tasks complete during event
- Task status updates with timestamps and completed_by
- Post-event report generation from task results
- Carry-forward task automation (tasks with `carry_forward_to_next_event = 1`)
- Entry list integration with TM entries API
- Priority inspection auto-population from class entry list
- PDF export placeholder → actual PDF generation

Pre-requisites before starting Phase B:
1. ✅ Deploy v37 migration to production — **DONE**
2. Create at least one test plan via UI to validate data flow — pending manual use
3. ✅ `api/event-ops.php?action=listPlans` returns 401 (auth) not 500 — confirmed

**Cleared for Phase B: YES** — v37 applied, all tables exist at 0 rows, API healthy, no parity logic touched.
