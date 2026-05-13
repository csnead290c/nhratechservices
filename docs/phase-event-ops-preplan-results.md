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

**NOT YET APPLIED** — migration files deployed; to apply:

```bash
# 1. Check status (dry-run, no changes)
node scripts/migrations/check-v37-event-ops-plans.mjs

# 2. Dry-run via CLI runner
node scripts/migrations/run-v37-event-ops-plans.mjs

# 3. Apply
node scripts/migrations/run-v37-event-ops-plans.mjs --apply

# 4. Verify status again
node scripts/migrations/check-v37-event-ops-plans.mjs
```

Or via web (requires admin/owner auth):
```
GET https://nhratechservices.com/api/migrate-v37-event-ops-plans.php
```

### Expected Row Counts After Apply (before any data entry)
| Table | Expected Rows |
|-------|--------------|
| event_plans | 0 |
| event_plan_staff | 0 |
| event_plan_sections | 0 |
| event_plan_sessions | 0 |
| event_plan_tasks | 0 |
| event_plan_task_targets | 0 |
| event_plan_files | 0 |

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
| **Total passing** | **183** | ✅ |

Build: ✅ clean (`npm run build` — no errors, one chunk-size warning pre-existing)

---

## Production Verification

*(To be completed after deployment and v37 apply)*

- [ ] `/event-ops` returns SPA HTML (200)
- [ ] `/api/event-ops.php?action=listPlans` returns 401 unauthenticated (not 500)
- [ ] Authenticated `eventops.read` user sees empty state
- [ ] `/parity` still works
- [ ] `/tech` still works
- [ ] `/rules` still works
- [ ] `api/config.php` preserved

---

## Confirmation: No Parity Logic Touched

- ✅ No changes to `parity.php`, `parity_weather_provider.php`
- ✅ No changes to any parity DB tables or migrations
- ✅ No changes to weather correction, combo resolution, or ET calculation
- ✅ No changes to `rsa_token` / localStorage behavior
- ✅ No RSA simulation code touched
- ✅ `api/config.php` not modified
- ✅ No `rsync --delete` added

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
1. Deploy v37 migration to production (`--apply`)
2. Create at least one test plan via UI to validate data flow
3. Confirm `api/event-ops.php?action=listPlans` returns 200 for authenticated user

**Cleared for Phase B: YES** — pending v37 production migration apply and deployment verification.
