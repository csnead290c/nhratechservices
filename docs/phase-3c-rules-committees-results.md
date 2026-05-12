# Phase 3C — Rules Committees & Memberships Results

**Objective:** Build foundation for rules committees so NHRA Tech Services can define committees and assign chairman, co-chairman, and members by user.

**Status:** ✅ COMPLETE

---

## Git Information

- **Starting Git Hash:** `1e7daa0`
- **Ending Git Hash:** `da32c4d`

### Commits

| Hash | Message | Description |
|------|---------|-------------|
| `2ce5ef9` | feat(v36): add rules committees migration + scripts | v36 migration core, web endpoint, CLI scripts, implementation plan |
| `450b5b3` | feat(capabilities): add committees.read and committees.admin | Backend + frontend capabilities, routing, NHRA prefixes |
| `9e09a46` | feat(frontend): add committees service and pages | API endpoint, frontend service, list/detail pages, navigation |
| `da32c4d` | test(nhrats): add rules committees coverage | Unit tests for committeesApi.ts |

---

## Files Created/Modified

### New Files
- `api/migrations/v36-rules-committees.php` — Migration core (idempotent, safe)
- `api/migrate-v36-rules-committees.php` — Web migration endpoint
- `api/rules-committees.php` — Full REST API endpoint
- `scripts/migrations/check-v36-rules-committees.mjs` — CLI status checker
- `scripts/migrations/run-v36-rules-committees.mjs` — CLI migration runner
- `src/domain/rules/committeesApi.ts` — Frontend API service
- `src/domain/rules/__tests__/committeesApi.test.ts` — Unit tests
- `src/pages/RulesCommitteesList.tsx` — Committee list page
- `src/pages/RulesCommitteeDetail.tsx` — Committee detail page

### Modified Files
- `api/lib/capabilities.php` — Added committees.read and committees.admin
- `src/domain/config/capabilities.ts` — Added committees capabilities
- `src/app/App.tsx` — Added routes and lazy imports
- `src/pages/RulesList.tsx` — Added Committees navigation link
- `docs/phase-3c-implementation-plan.md` — Implementation planning doc

---

## Capability Model

### New Capabilities

| Capability | Granted To | Purpose |
|------------|-----------|---------|
| `committees.read` | nhra plan, owner, admin | View committee list and details |
| `committees.admin` | owner, admin only | Create/edit committees and manage memberships |

### Capability Matrix

| Role | committees.read | committees.admin |
|------|----------------|------------------|
| owner | ✅ | ✅ |
| admin | ✅ | ✅ |
| member | ❌ | ❌ |
| viewer | ❌ | ❌ |

| Plan | committees.read | committees.admin |
|------|----------------|------------------|
| nhra | ✅ | ❌ (requires role) |
| basic | ❌ | ❌ |
| pro | ❌ | ❌ |

---

## Routes Added

| Route | Component | Capability Required |
|-------|-----------|---------------------|
| `/rules/committees` | RulesCommitteesList | committees.read |
| `/rules/committees/:id` | RulesCommitteeDetail | committees.read |

**Navigation:** Added "Rules Committees" link card on `/rules` page.

---

## API Endpoints

### Read Endpoints (require committees.read)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/rules-committees.php?action=list` | GET | List committees with filters |
| `/api/rules-committees.php?action=get&id={id}` | GET | Get committee by id/slug |
| `/api/rules-committees.php?action=members&committee_id={id}` | GET | List committee members |
| `/api/rules-committees.php?action=categories` | GET | List distinct categories |

### Admin Endpoints (require committees.admin)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/rules-committees.php?action=create` | POST | Create new committee |
| `/api/rules-committees.php?action=update&id={id}` | PUT | Update committee |
| `/api/rules-committees.php?action=delete&id={id}` | DELETE | Soft delete committee |
| `/api/rules-committees.php?action=addMember` | POST | Add member to committee |
| `/api/rules-committees.php?action=updateMember&id={id}` | PUT | Update membership |
| `/api/rules-committees.php?action=removeMember&id={id}` | DELETE | Remove member |
| `/api/rules-committees.php?action=eligibleUsers` | GET | List eligible users |

---

## Database Schema

### rules_committees Table

| Column | Type | Description |
|--------|------|-------------|
| id | INT PK | Auto-increment ID |
| uuid | VARCHAR(36) | UUID for external refs |
| name | VARCHAR(200) | Committee name (required) |
| slug | VARCHAR(100) | URL-friendly slug |
| description | TEXT | Committee description |
| category | VARCHAR(50) | Category (Safety, Technical, etc.) |
| class_scope | VARCHAR(50) | Class restriction if any |
| status | ENUM | active, inactive, dissolved |
| created_by | INT FK | User who created committee |
| created_at | DATETIME | Creation timestamp |
| updated_at | DATETIME | Last update timestamp |
| deleted_at | DATETIME | Soft delete timestamp |

### committee_memberships Table

| Column | Type | Description |
|--------|------|-------------|
| id | INT PK | Auto-increment ID |
| committee_id | INT FK | → rules_committees |
| user_id | INT FK (nullable) | → users |
| person_id | INT FK (nullable) | → persons |
| role | ENUM | chairman, co_chairman, member, advisor, secretary, liaison, guest, observer |
| title | VARCHAR(100) | Custom title |
| voting_member | TINYINT | 1 = voting, 0 = non-voting |
| start_date | DATE | When membership began |
| end_date | DATE | When membership ended |
| created_by | INT FK | User who created membership |
| created_at | DATETIME | Creation timestamp |
| updated_at | DATETIME | Last update timestamp |
| deleted_at | DATETIME | Soft delete timestamp |

**Constraint:** At least one of user_id or person_id must be provided.

---

## v36 Migration Status

**Applied:** ✅ May 12, 2026 via PHP CLI

**Tables Created:**
- `rules_committees` — EXISTS, 0 rows
- `committee_memberships` — EXISTS, 0 rows

**Method:** Dry-run verification followed by `--apply` execution using temporary CLI runner.

**Safety:**
- ✅ Additive only (CREATE TABLE IF NOT EXISTS)
- ✅ No data modification
- ✅ No sample committees seeded
- ✅ Foreign keys use ON DELETE CASCADE
- ✅ Indexes created for performance

---

## Production Verification Results

### Migration Verification

| Check | Result |
|-------|--------|
| rules_committees table exists | ✅ YES |
| committee_memberships table exists | ✅ YES |
| rules_committees row count | 0 ✅ |
| committee_memberships row count | 0 ✅ |

### API Verification

| Endpoint | Unauthenticated | Expected |
|----------|-------------------|----------|
| `/api/rules-committees.php?action=list` | 401 Unauthorized | ✅ Correct |
| `/api/rules-committees.php?action=categories` | 401 Unauthorized | ✅ Correct |

**Note:** Authenticated tests require valid JWT token with committees.read capability. Marked as:
- 🔒 BLOCKED — ACCESS NEEDED for full authenticated verification

### Frontend Verification

| Route | Result |
|-------|--------|
| `/rules/committees` | 200 SPA HTML ✅ |

**Bundle contains:**
- ✅ RulesCommitteesList lazy chunk
- ✅ RulesCommitteeDetail lazy chunk
- ✅ committees.read capability checks
- ✅ committees.admin capability checks

---

## Test Results

### Unit Tests

```
Test Files  11 passed (11)
Tests       438 passed (438)
Duration    ~1.5s
```

**New Tests Added:**
- `src/domain/rules/__tests__/committeesApi.test.ts` (24 tests)
  - Read endpoints: list, get, members, categories
  - Admin endpoints: create, update, delete, addMember, updateMember, removeMember
  - Error handling: 401, 403, network errors
  - Filter parameters

**Existing Tests (All Passing):**
- Tier contract drift
- Access enforcement
- NHRATS Home/NotFound
- Rules import validation
- v35 migration tests
- Capability guards

### Build Verification

```
✓ built in ~4.5s
✓ TypeScript compilation successful
✓ No critical errors
```

---

## Safety Confirmations

| Requirement | Status |
|-------------|--------|
| No parity math modified | ✅ CONFIRMED |
| No weather correction modified | ✅ CONFIRMED |
| No combo resolution modified | ✅ CONFIRMED |
| No parity DB tables touched | ✅ CONFIRMED |
| Migration is additive only | ✅ CONFIRMED (CREATE TABLE IF NOT EXISTS) |
| No sample committees seeded | ✅ CONFIRMED (0 rows in both tables) |
| No secrets committed | ✅ CONFIRMED |
| api/config.php preserved | ✅ CONFIRMED (not in diff) |
| rsa_token unchanged | ✅ CONFIRMED (no localStorage changes) |

---

## Known Blockers

| Item | Status | Notes |
|------|--------|-------|
| Authenticated API tests | 🔒 BLOCKED | Requires valid JWT token with committees.read/committees.admin |
| Production committee creation | 🔒 BLOCKED | Requires committees.admin capability |

These are expected access limitations, not implementation blockers.

---

## Cleared for Phase 3D

### ✅ YES — Phase 3C Complete

Rules Committees foundation is:
- ✅ Committed and pushed
- ✅ Deployed to production
- ✅ Migration applied (v36)
- ✅ API endpoints live
- ✅ Frontend pages accessible
- ✅ Capability model enforced
- ✅ Zero sample data
- ✅ All safety rules followed

### Recommended Phase 3D Scope

**Committee Meetings, Meeting Notes, Decisions, and Action Items**

**New tables needed:**
- `committee_meetings` — Meeting schedule, location, type, status
- `meeting_attendance` — Who attended which meeting
- `meeting_minutes` — Markdown notes, approval workflow
- `meeting_decisions` — Decisions made at meetings
- `meeting_action_items` — Tasks with assignees and due dates

---

## End-of-Sprint Summary

| Metric | Value |
|--------|-------|
| Commits | 4 |
| Files Created | 9 |
| Files Modified | 5 |
| Tests Added | 24 |
| Total Tests Passing | 438/438 |
| Migration Applied | v36 |
| Tables Created | 2 |
| Rows in Production | 0 (as intended) |
| API Endpoints | 10 |
| Frontend Routes | 2 |
| Safety Violations | 0 |

**Status:** ✅ **CLEARED FOR PHASE 3D**

---

*Generated: May 12, 2026*
