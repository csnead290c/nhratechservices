# NHRA Tech Services — Module Roadmap
_Last updated: 2026-05-07 | Living document — update as priorities shift_

---

## Current State (May 2026)

NHRATS is a rebrand of the RSA codebase with NHRA-specific modules already functional:

| Module | Status | Routes |
|---|---|---|
| Parity & Performance | ✅ Live | `/parity`, `/parity/idr` |
| Tech Master | ✅ Live | `/tech` |
| Incident Analysis | ✅ Live | `/parity/analysis/:id` |
| Auth / Account | ✅ Live | `/login`, `/register`, `/account` |
| RSA simulation tools | 🟡 Present but not NHRA-relevant | `/et-sim`, `/predict`, `/engine-sim`, etc. |
| Stripe / billing | 🟡 Present but disabled on NHRATS | `/pricing` |

---

## Target Module Structure

### 1. Dashboard `/`
**Status**: Redirect to `/parity` for NHRA users. Long-term: role-aware landing page.

**Long-term features:**
- Role-specific quick actions (admin vs. analyst vs. viewer)
- Upcoming event countdown
- Open action items
- Recent publications
- Recent case activity
- Active committee meetings

**New capabilities needed:** `dashboard.read`

---

### 2. Parity & Performance `/parity`
**Status**: ✅ Fully functional — preserve exactly as-is

**Current sub-pages:**
- Event Parity Report (corrected/raw)
- Multi-Event Matrix
- Incremental Comparison
- IDR Viewer
- Anomaly Analysis
- Admin: Ingest, Backfill, Combo Assignment, Class Aliases, Track/Event Catalog

**Future enhancements (low priority, be careful):**
- Long-term trend visualization improvements
- Performance prediction model improvements
- Export to structured formats (CSV, not just PDF)
- **Do not touch correction model without versioning**

---

### 3. Tech Master `/tech`
**Status**: ✅ Fully functional

**Current sub-modules:**
- Event Entry Roster (CSV import, identity matching)
- Scale Workspace
- Fuel Workspace
- Inspection Workspace
- Tech Card Workspace
- Teardown Workspace
- Findings Aggregation
- Event Compliance Dashboard
- Entry Dossier
- Link Review
- Admin Panel

**Future enhancements:**
- Integration with Cases & Violations (link tech findings → formal cases)
- Historical inspection search
- Per-class compliance rate reports
- Bulk entry management

---

### 4. Rules & Governance `/rules`
**Status**: 🔴 Not started — highest priority new module

**Phase A — Read-only Rulebook (MVP)**
- Browse current rules by category/class
- View rule version history
- Search rules full-text
- Link rules to publications

**Phase B — Change Request Workflow**
- Submit rule change request
- Comment thread per request
- Status workflow: draft → submitted → under_review → approved/rejected
- Email notifications on status change (if email infra available)

**Phase C — Committee Management**
- Committee list with membership roster
- Role assignments (chairman, co-chairman, member, secretary, liaison, guest, observer)
- Effective-date tracking for membership changes

**Phase D — Committee Meetings**
- Meeting schedule
- Agenda builder
- Attendance tracking
- Meeting minutes (Markdown editor)
- Minutes approval workflow
- Decisions log
- Action items with assignments and due dates

**Phase E — Technical Bulletins**
- Create/publish technical bulletins
- Competition bulletins
- Memos and interpretations
- Effective-date tracking
- Search and archive

**New capabilities needed:**
```
rules.read               View rulebook
rules.admin              Create/edit/publish rules
committees.read          View committee info
committees.admin         Manage committees and memberships
meetings.read            View meeting records
meetings.admin           Create/edit meetings, record minutes
publications.read        View publications
publications.admin       Create/publish publications
```

**New routes:**
```
/rules                   Rules index
/rules/:id               Single rule detail + version history
/rules/changes           Change request list
/rules/changes/:id       Single change request
/committees              Committee list
/committees/:id          Committee detail + membership
/committees/:id/meetings Meeting list
/meetings/:id            Meeting detail + agenda + minutes + decisions + action items
/publications            Publication library
/publications/:id        Single publication
```

---

### 5. Cases & Violations `/cases`
**Status**: 🔴 Not started

**MVP Features:**
- Case list (DQs, violations, SOAAPs, appeals, investigations, warnings)
- Case detail with timeline
- Link to person, org, event, entry, parity run
- Status workflow (open → under_review → resolved → closed / appealed)
- Notes/event log
- File attachments (reference Box/CDN files)

**Future:**
- Appeals workflow linked back to original case
- Integration with Tech Master findings
- Integration with Incident Analysis
- Penalty history reporting

**New capabilities needed:**
```
cases.read               View cases
cases.create             Create new cases
cases.admin              Manage all cases + assign
```

**New routes:**
```
/cases                   Cases list + filter
/cases/:id               Case detail
/cases/new               New case form
```

---

### 6. Parts & Approvals `/parts`
**Status**: 🔴 Not started

> Note: `/parts` route currently exists as a stub (redirects to TeamHub). Must be claimed.

**MVP Features:**
- Parts list with category/class filter
- Part detail with approval history
- Approval decision workflow
- Class scope assignment
- File attachments (Box scan references, 3D STEP references)

**Future:**
- 3D model viewer (web-based STEP viewer integration)
- Box file deep-link integration
- Cross-reference with homologation records

**New capabilities needed:**
```
parts.read               View parts registry
parts.admin              Create/edit/approve parts
```

**New routes:**
```
/parts-registry          Parts list (rename from /parts to avoid conflict)
/parts-registry/:id      Part detail
```

---

### 7. Files `/files`
**Status**: 🔴 Not started

**MVP Features:**
- Centralized file registry
- Storage providers: Box reference, URL reference, direct upload (if feasible)
- Link files to any entity (case, part, rule, meeting, tech case)
- Filter by type (PDF, STEP, image, spreadsheet)

**New capabilities needed:**
```
files.read               View file registry
files.upload             Upload/register files
files.admin              Manage all files
```

---

### 8. Incidents & Investigations `/incidents`
**Status**: ✅ Partially live — `IncidentAnalysis.tsx` + `run_incidents` + `incident_analysis_sessions`

**Current:**
- Run-level incident tagging from Parity Portal
- Incident analysis workspace (data channels, measurements, video references)

**Future:**
- Link incidents to Cases & Violations
- Formal investigation workflow
- Report generation

**Routes (already exist):**
```
/parity/analysis/:incidentId
```

---

### 9. Admin `/admin`
**Status**: ✅ Live (admin-only)

**Current:** User management, capability management, feature flags, dev tools

**Future additions:**
- Module config management
- Required fields config per class
- Audit log viewer
- Migration status dashboard
- Background job status

---

### 10. Communications Hub (Future)
**Status**: 🔴 Not planned in near-term

**Long-term ideas:**
- Internal message board / announcements
- Email blast tracking
- Distribution list management

---

## Capability Matrix (Proposed Full Set)

```
# Parity (existing)
nhra.parity              View parity dashboards
nhra.parity.admin        Parity admin: ingest, backfill, manage data

# Tech Master (existing)
nhra.tech.read           View Tech Master data
nhra.tech.admin          Tech Master admin

# Incidents (existing)
incidents.read           Read incidents
incidents.create         Create incidents
incidents.edit.own       Edit own incidents
incidents.edit.all       Edit all incidents

# Rules & Governance (new)
rules.read               Browse rulebook
rules.admin              Manage rules and publications
committees.read          View committees
committees.admin         Manage committees and memberships
meetings.read            View meetings
meetings.admin           Manage meetings, minutes, decisions

# Cases (new)
cases.read               View cases
cases.create             Create cases
cases.admin              Full case management

# Parts (new)
parts.read               View parts registry
parts.admin              Manage and approve parts

# Files (new)
files.read               View file registry
files.upload             Upload/register files
files.admin              Manage files

# Dashboard (new)
dashboard.read           View role-aware dashboard
```

---

## Implementation Sequence (Recommended)

| Priority | Module | Reason |
|---|---|---|
| 1 | Parity protection & cleanup | Protect what's working before building more |
| 2 | RSA tool removal/hiding | Reduce clutter, prevent NHRA users from seeing irrelevant tools |
| 3 | Rules & Governance Phase A (read-only) | High-value, low-risk (new tables, no parity impact) |
| 4 | Cases & Violations MVP | High-value for NHRA operations |
| 5 | Rules & Governance Phase B–C (change requests, committees) | Builds on Phase A |
| 6 | Committee Meetings Phase D | Builds on committees |
| 7 | Parts & Approvals MVP | Independent, additive |
| 8 | Files registry | Supports all other modules |
| 9 | Publications / Bulletins | High-value, independent |
| 10 | Dashboard overhaul | Best done after all modules exist |

---

## RSA Removal Schedule

These RSA features should be removed from NHRATS in a dedicated cleanup sprint (separate from module builds):

| Feature | Route | Action |
|---|---|---|
| ET Sim / Predict | `/et-sim`, `/predict` | Remove route + page |
| Engine Sim / Pro | `/engine-sim`, `/engine-pro` | Remove route + page |
| Clutch Sim / Converter | `/clutch-sim`, `/converter-sim` | Remove route + page |
| Suspension Sim | `/suspension-sim` | Remove route + page |
| Run Log / History | `/log`, `/history` | Remove route + page |
| Dial-In | `/dial-in` | Remove |
| Opponents | `/opponents` | Remove |
| Race Day | `/race-day` | Remove |
| Data Import | `/import` | Remove |
| Personal Tech Card | `/tech-card` | Remove (different from Tech Master TechCard) |
| Personal Ladder | `/ladder` | Remove |
| Vehicles | `/vehicles` | Remove |
| TeamHub stubs | `/team`, `/parts`, `/events`, `/maintenance`, `/expenses` | Reclaim routes for NHRATS modules |
| Pricing | `/pricing` | Remove |
| Stripe backend | `api/stripe.php`, `api/stripe-webhook.php` | Archive, do not delete until subscriptions table verified empty |

**Process for each removal:**
1. Add to `NHRA_ALLOWED_PREFIXES` check (to ensure NHRA users were never using it)
2. Remove from nav
3. Remove route from `App.tsx`
4. Remove page component (or keep file but add a `// NHRATS-removed` comment if shared logic exists)
5. Build + smoke test parity
6. Deploy
