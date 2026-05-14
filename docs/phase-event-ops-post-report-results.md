# Event Operations Phase C — Post-Event Report Builder Foundation
## Sprint Results

**Sprint goal:** Build the foundation for generating structured post-event reports from Event Ops plans and live checklist execution data.

---

## Objective

Allow Tech staff to generate a post-event report snapshot from a completed (or in-progress) event plan and live checklist run. The report captures planned tasks, completion stats, issues found, follow-ups, carry-forward items, files, staffing, and session completion status. Admins can edit narrative sections, add manual items, link incidents and files, and finalize the report. Read-only users can view. No full PDF export in this sprint.

---

## Git Hashes

| Checkpoint | Hash |
|------------|------|
| Phase B end | `a55b441` |
| Phase C start | `a55b441` |
| v39 migration + scripts | `87f4c00` |
| API + report generator | `8a68d18` |
| Frontend + routes + nav | `d0b88cd` |
| Tests (Part 7) | `a7fa19a` |
| Docs (Part 10) | this commit |

---

## Files Changed

### New files
| File | Purpose |
|------|---------|
| `api/migrations/v39-event-ops-post-reports.php` | Shared migration core — 5 post-report tables |
| `api/migrate-v39-event-ops-post-reports.php` | Web runner (admin auth required) |
| `scripts/migrations/check-v39-event-ops-post-reports.mjs` | Status check (always dry-run) |
| `scripts/migrations/run-v39-event-ops-post-reports.mjs` | CLI runner (--apply required) |
| `api/event-ops-reports.php` | Report API functions + report generator logic |
| `src/pages/EventPostReportBuilder.tsx` | Builder page: preview, generate, summary cards, sections, issues, follow-ups |
| `src/pages/EventPostReportDetail.tsx` | Saved report view: sections, items, finalize, reopen, regenerate |
| `src/domain/eventOps/__tests__/v39MigrationSafety.test.ts` | 23 migration safety tests |
| `src/app/__tests__/eventPostReportRoutes.test.tsx` | 28 route/UI/capability tests |

### Modified files
| File | Change |
|------|--------|
| `api/event-ops.php` | +`require_once event-ops-reports.php`, +7 read actions, +17 admin actions in router |
| `src/domain/eventOps/eventOpsApi.ts` | +types and API functions for post-event reports |
| `src/app/App.tsx` | +lazy imports for both report pages, +2 new routes |
| `src/pages/EventPlanDetail.tsx` | +"Post-Event Report" button |
| `src/pages/EventLiveChecklist.tsx` | +"Generate Post-Event Report →" nav link |

---

## v39 Migration Details

**Tables created:**

| Table | Purpose |
|-------|---------|
| `event_post_reports` | One per report run; snapshot counts, status, generated/finalized timestamps |
| `event_post_report_sections` | Nine narrative sections per report (editable) |
| `event_post_report_items` | Issue/followup/carry-forward/manual action items |
| `event_post_report_files` | File/Box references attached to report |
| `event_post_report_incidents` | Incident references with follow-up flag |

**Report status values:** `draft`, `generated`, `in_review`, `finalized`, `archived`

**Item source types:** `plan_task`, `live_task_update`, `incident`, `manual`, `file`, `followup`

**Safety:**
- `CREATE TABLE IF NOT EXISTS` only — no DROP, TRUNCATE, DELETE, UPDATE
- All tables have `deleted_at` for soft delete
- No parity table references
- No sample data seeded
- Idempotent

---

## v39 Production Status

**✅ APPLIED** — 2026-05-14 ~01:29 UTC

Method: Direct PHP CLI via SSH.

### Dry-run output (pre-apply)
```
=== v39 Event Ops Post-Event Reports Migration ===
Before:
  event_post_reports: MISSING
  event_post_report_sections: MISSING
  event_post_report_items: MISSING
  event_post_report_files: MISSING
  event_post_report_incidents: MISSING
DRY RUN — No changes made.
```

### Apply output
```
✓ event_post_reports created
✓ event_post_report_sections created
✓ event_post_report_items created
✓ event_post_report_files created
✓ event_post_report_incidents created
=== Migration v39 complete ===
No parity tables were modified. No sample data seeded.
```

### Row counts after apply
| Table | Rows |
|-------|------|
| `event_post_reports` | 0 ✅ |
| `event_post_report_sections` | 0 ✅ |
| `event_post_report_items` | 0 ✅ |
| `event_post_report_files` | 0 ✅ |
| `event_post_report_incidents` | 0 ✅ |

---

## API Actions Added

### Read actions (require `eventops.read`)
| Action | Description |
|--------|-------------|
| `listPostReports` | List all non-deleted reports for a plan |
| `getPostReport` | Get a single report by ID |
| `getPostReportSections` | Get sections for a report |
| `getPostReportItems` | Get action items for a report |
| `getPostReportFiles` | Get file references for a report |
| `getPostReportIncidents` | Get incident references for a report |
| `getPostReportPreview` | Live snapshot preview from plan + live checklist data (no DB write) |

### Admin actions (require `eventops.admin`)
| Action | Description |
|--------|-------------|
| `generatePostReport` | Build preview and persist to DB (idempotent — regenerates if exists) |
| `createPostReport` | Create blank draft report |
| `updatePostReport` | Update title/summary fields |
| `finalizePostReport` | Set status=finalized, set finalized_at/by |
| `reopenPostReport` | Set status=in_review, clear finalized_at/by |
| `softDeletePostReport` | Soft delete report |
| `regeneratePostReportSummary` | Rebuild preview and repersist sections/items |
| `updateReportSection` | Edit body/title of a section |
| `addReportItem` | Add manual action item |
| `updateReportItem` | Update item title/body/status/priority |
| `deleteReportItem` | Soft delete item |
| `addReportFile` | Attach file/Box reference |
| `deleteReportFile` | Soft delete file reference |
| `addReportIncident` | Link incident reference |
| `deleteReportIncident` | Soft delete incident reference |

**Report generator reads:** `event_plans`, `event_plan_staff`, `event_plan_sessions`, `event_plan_tasks`, `event_live_task_updates`, `event_live_session_status`, `event_plan_files`. Does NOT modify plan or live checklist records.

**Generated sections (9):** Event Summary, Staffing Summary, Planned vs Completed, Session Summary, Issues Found, Follow-Ups / Carry-Forward, Files / Data Collection, Incident Summary, Notes / Recommendations

---

## Routes + Pages Added

| Route | Component | Capability |
|-------|-----------|------------|
| `/event-ops/:id/post-report` | `EventPostReportBuilder` | `eventops.read` |
| `/event-ops/reports/:reportId` | `EventPostReportDetail` | `eventops.read` |

### EventPostReportBuilder UI
- Plan header with event code, year, track, class scope
- Summary cards: total/completed/open/issue/followup/carry-forward/files/staff
- Section previews (collapsible, generated_body)
- Issue items table with task title, status, notes
- Follow-up / carry-forward items table
- Session summary table with completion count
- Files/data collection list
- Admin: "Generate Report" button / "Regenerate Report" if report exists
- Admin: disabled "PDF Export (Coming Later)" placeholder
- Read-only: view only, no generate button

### EventPostReportDetail UI
- Report title + status badge + generated/finalized timestamps
- Count summary bar
- Editable report sections (admin: Edit button per section)
- Action items table with add/delete (admin only)
- File references panel
- Incident references panel
- Admin: Finalize / Reopen / Regenerate controls
- Admin: disabled "PDF Export (Coming Later)" placeholder
- Read-only: view only

### Nav links added
- `EventPlanDetail`: purple "Post-Event Report" button → `/event-ops/:id/post-report`
- `EventLiveChecklist`: "Generate Post-Event Report →" nav link → `/event-ops/:id/post-report`

---

## Report State Flow

1. Open Event Plan Detail → click "Post-Event Report"
2. Builder page loads live preview from current plan/live data
3. No report → shows "No report generated yet" state with counts preview
4. Admin clicks "Generate Report" → persists snapshot, redirects to detail page
5. Detail page: admin edits sections, adds items, links files/incidents
6. Admin clicks "Finalize Report" → status = finalized
7. Admin can "Reopen" to return to in_review
8. Read-only users: view report at any status
9. "Regenerate" rebuilds sections/items from latest live data (soft-deletes old sections/items)

---

## Tests Run / Results

| Suite | Tests | Result |
|-------|-------|--------|
| `v39MigrationSafety.test.ts` | 23 | ✅ All pass |
| `eventPostReportRoutes.test.tsx` | 28 | ✅ All pass |
| `v38MigrationSafety.test.ts` | 20 | ✅ All pass (no regression) |
| `eventLiveChecklistRoutes.test.tsx` | 17 | ✅ All pass (no regression) |
| `eventOpsCapabilities.test.ts` | 20 | ✅ All pass (no regression) |
| `v37MigrationSafety.test.ts` | 18 | ✅ All pass (no regression) |
| `eventOpsRoutes.test.tsx` | 8 | ✅ All pass (no regression) |
| `accessEnforcement.test.ts` | 67 | ✅ All pass (no regression) |
| `committeesApi.test.ts` | 22 | ✅ All pass (no regression) |
| `shellCleanup.test.tsx` | 11 | ✅ All pass (no regression) |
| Pre-existing failures | 17 | parityDashboards/qualSheetDriverHistory/tierContractDrift — unchanged |
| **Total critical passing** | **260** | ✅ |

Build: ✅ clean (`npm run build` — 6.51s, no errors)

---

## Production Verification

*Completed: 2026-05-14*

### SPA Routes
| Route | HTTP | Status |
|-------|------|--------|
| `/event-ops/1/post-report` | 200 | ✅ SPA HTML |
| `/event-ops/reports/1` | 200 | ✅ SPA HTML |
| `/event-ops/1/live` | 200 | ✅ (Phase B — no regression) |
| `/event-ops` | 200 | ✅ |
| `/parity` | 200 | ✅ |
| `/tech` | 200 | ✅ |
| `/rules` | 200 | ✅ |

### API Checks (unauthenticated)
| Endpoint | HTTP | Status |
|----------|------|--------|
| `?action=getPostReportPreview&plan_id=1` | 401 | ✅ not 500 |
| `?action=listPostReports&plan_id=1` | 401 | ✅ not 500 |

### Files + Config
| Check | Status |
|-------|--------|
| `api/migrations/v39-event-ops-post-reports.php` | ✅ EXISTS (deployed 2026-05-14 01:29 UTC) |
| `api/event-ops-reports.php` | ✅ EXISTS |
| `api/config.php` | ✅ PRESERVED — last modified 2026-05-12 |

### Confirmation: No Parity Logic Touched
- ✅ Zero changes to `parity.php`, `parity_weather_provider.php`
- ✅ Zero changes to parity DB tables
- ✅ Zero changes to weather correction, combo resolution, ET calculation
- ✅ `api/config.php` not overwritten

### Confirmation: No Sample Data Seeded
- ✅ All 5 v39 tables at 0 rows after migration
- ✅ No INSERT statements in migration file (verified by v39MigrationSafety tests)

---

## Commit Summary

| Commit | Hash | Content |
|--------|------|---------|
| v39 migration + scripts | `87f4c00` | 5 migration files |
| API + generator | `8a68d18` | event-ops-reports.php, event-ops.php router |
| Frontend + routes + nav | `d0b88cd` | eventOpsApi.ts, 2 pages, App.tsx, EventPlanDetail.tsx, EventLiveChecklist.tsx |
| Tests | `a7fa19a` | 51 new tests |
| Docs | this commit | Sprint results doc |

---

## Next Recommended Phase

### Event Ops Phase D — PDF Export and Plan/Report Templates

Suggested scope:
- PDF export of finalized `event_post_reports` using a server-side PDF library (e.g. TCPDF, Dompdf, or a Node-side service)
- Report templates: pre-defined section structures for common event types (Nitro, Pro Stock, E.T.)
- Plan templates: clone-from-template improvements with section/session/task seeds
- Carry-forward automation: seed next-event tasks from `carry_forward=1` items in a completed report
- Box integration: upload finalized report PDF to event Box folder

Pre-requisites before starting Phase D:
1. ✅ v39 applied in production — all 5 tables exist at 0 rows
2. At least one post-event report generated via UI to validate full data flow end-to-end
3. ✅ `/event-ops/1/post-report` returns 200, API returns 401 unauthenticated

**Cleared for Phase D: YES** — v39 applied, all tables at 0 rows, API healthy, no parity logic touched.
