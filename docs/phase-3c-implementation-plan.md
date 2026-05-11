# Phase 3C — Rules Committees & Memberships Implementation Plan

**Objective:** Build foundation for rules committees so NHRA Tech Services can define committees and assign chairman, co-chairman, and members by user.

**Date:** May 11, 2026
**Starting Git Hash:** `1e7daa0`

---

## Documentation Review Summary

### From docs/nhra-future-data-model.md
**Phase 3: Rules Committees tables already defined:**
- `rules_committees` - Committee metadata (name, category, status, dates)
- `committee_memberships` - Who holds what role (chairman, co_chairman, member, etc.)

### From docs/nhra-module-roadmap.md
**Phase C — Committee Management:**
- Committee list with membership roster
- Role assignments (chairman, co_chairman, member, secretary, liaison, guest, observer)
- Effective-date tracking for membership changes

**Capabilities needed:**
- `committees.read` - View committee info
- `committees.admin` - Manage committees and memberships

---

## Implementation Plan

### Part 1: Database Migration (v36)

**File:** `api/migrations/v36-rules-committees.php`

**Tables to create:**

1. **rules_committees**
   - id (PK, auto_increment)
   - uuid (VARCHAR(36), unique, not null)
   - name (VARCHAR(255), not null)
   - slug (VARCHAR(100), unique) - URL-friendly identifier
   - description (TEXT, nullable)
   - category (VARCHAR(100), nullable)
   - class_scope (VARCHAR(255), nullable) - comma-separated or JSON array
   - status (ENUM: 'active', 'inactive', 'dissolved', default 'active')
   - created_by (INT, FK to users.id, nullable)
   - created_at (TIMESTAMP, default CURRENT_TIMESTAMP)
   - updated_at (TIMESTAMP, default CURRENT_TIMESTAMP ON UPDATE)
   - deleted_at (TIMESTAMP, nullable) - soft delete
   - Indexes: status, category, class_scope

2. **committee_memberships**
   - id (PK, auto_increment)
   - committee_id (INT, FK to rules_committees.id, not null)
   - user_id (INT, FK to users.id, not null) - using users table directly
   - role (ENUM: 'chair', 'co_chair', 'member', 'advisor', not null)
   - title (VARCHAR(100), nullable) - custom title if needed
   - voting_member (TINYINT(1), default 1)
   - start_date (DATE, not null)
   - end_date (DATE, nullable) - for historical tracking
   - created_by (INT, FK to users.id, nullable)
   - created_at (TIMESTAMP, default CURRENT_TIMESTAMP)
   - updated_at (TIMESTAMP, default CURRENT_TIMESTAMP ON UPDATE)
   - deleted_at (TIMESTAMP, nullable) - soft delete
   - Indexes: committee_id, user_id, role, status (via deleted_at check)
   - Unique: prevent duplicate active memberships (committee_id, user_id, role) where deleted_at IS NULL

**Safety requirements:**
- CREATE TABLE IF NOT EXISTS only
- No DROP, TRUNCATE, DELETE
- No parity table references
- Idempotent

---

### Part 2: Migration Scripts

**Files:**
- `scripts/migrations/check-v36-rules-committees.mjs` - Read-only status check
- `scripts/migrations/run-v36-rules-committees.mjs` - CLI runner with --apply flag

**Pattern:** Follow v35 scripts exactly
- Default dry-run mode
- Requires --apply to write
- Uses DB env vars (NHRATS_DB_*)
- BLOCKED — ACCESS NEEDED if env vars missing
- No credentials printed

---

### Part 3: API Endpoint

**File:** `api/rules-committees.php`

**Actions:**

**Read endpoints (require `rules.read`):**
- `list` - List committees with filters (status, category)
- `get` - Get committee by id or slug with full membership roster
- `members` - List members for a specific committee
- `categories` - List distinct committee categories

**Admin endpoints (require `rules.admin`):**
- `create` - POST - Create new committee
- `update` - PUT - Update committee metadata
- `delete` - DELETE - Soft delete committee
- `addMember` - POST - Add member to committee
- `updateMember` - PUT - Update membership (role, dates)
- `removeMember` - DELETE - Soft delete membership
- `eligibleUsers` - GET - List users who can be added to committees

**Response formats:**
- Committees list: `{ committees: [...], count: N }`
- Committee detail: `{ committee: {...}, members: [...] }`
- Members list: `{ members: [...], count: N, chair: {...}, co_chair: {...} }`

---

### Part 4: Frontend Service

**File:** `src/domain/rules/committeesApi.ts`

**Interfaces:**
```typescript
Committee {
  id, uuid, name, slug, description, category, class_scope,
  status, member_count, chair, co_chair,
  created_at, updated_at
}

CommitteeMember {
  id, committee_id, user_id, role, title, voting_member,
  start_date, end_date,
  user: { id, name, email } // joined
}
```

**Functions:**
- `fetchCommittees(params?)` - List with filters
- `fetchCommittee(idOrSlug)` - Get single with members
- `fetchCommitteeMembers(committeeId)` - List members
- `createCommittee(data)` - Admin only
- `updateCommittee(id, data)` - Admin only
- `deleteCommittee(id)` - Admin only (soft delete)
- `addCommitteeMember(committeeId, data)` - Admin only
- `updateCommitteeMember(memberId, data)` - Admin only
- `removeCommitteeMember(memberId)` - Admin only (soft delete)
- `fetchEligibleUsers()` - Admin only, for assignment dropdown

---

### Part 5: Frontend Pages

**Lazy imports in App.tsx:**
```typescript
const RulesCommitteesList = lazy(() => import('../pages/RulesCommitteesList'));
const RulesCommitteeDetail = lazy(() => import('../pages/RulesCommitteeDetail'));
```

**Routes (in App.tsx):**
```typescript
<Route path="/rules/committees/:id" element={
  <CapabilityRoute requireCap="rules.read">
    <RulesCommitteeDetail />
  </CapabilityRoute>
} />
<Route path="/rules/committees" element={
  <CapabilityRoute requireCap="rules.read">
    <RulesCommitteesList />
  </CapabilityRoute>
} />
```

**Pages:**

1. **RulesCommitteesList.tsx**
   - Show committees in card/table format
   - Columns: Name, Category, Status, Chair, Member Count
   - Filters: Status (active/inactive/dissolved), Category
   - Empty state: "No committees defined yet"
   - Admin: "Create Committee" button (only if rules.admin)

2. **RulesCommitteeDetail.tsx**
   - Committee metadata (name, description, category, class scope)
   - Status badge
   - Leadership section: Chair, Co-Chair (if assigned)
   - Members table: Name, Role, Title, Voting status, Start date
   - Advisors section (if any)
   - Admin controls (only if rules.admin):
     - Edit committee button
     - Add member button
     - Edit/remove member buttons per row
   - Back to committees link

---

### Part 6: Navigation

**RulesList.tsx:** Add card/link to "Committees" sub-section
- Keep main nav clean
- Use existing subnavigation pattern within Rules section

---

### Part 7: Capabilities

**Add to capabilities.ts:**

```typescript
// In CAPABILITY_KEYS:
'committees.read',     // View committees
'committees.admin',    // Manage committees

// In ALIASES:
'committees_read':     'committees.read',
'committees_admin':      'committees.admin',

// In PLAN_CAPABILITIES.nhra:
'committees.read',     // Add to nhra plan

// In ROLE_CAPABILITIES.owner/admin:
'committees.admin',    // Add to both
```

**Note:** Only NHRA plan users and owner/admin can access committees.

---

### Part 8: Tests

**New tests to add:**

1. **Migration tests:**
   - v36 SQL contains no DROP/TRUNCATE/DELETE
   - v36 runner defaults to dry-run
   - v36 runner requires --apply
   - v36 runner rejects arbitrary paths

2. **API tests:**
   - Read endpoints require rules.read
   - Write endpoints require rules.admin
   - Soft delete works (deleted_at populated, not hard delete)
   - Duplicate active membership prevented
   - Committee chair/co_chair returned in detail view

3. **Frontend tests:**
   - Committees list renders empty state
   - Committee detail shows members
   - Admin controls hidden from read-only users
   - Admin controls visible to owner/admin

4. **Capability tests:**
   - nhra plan users have committees.read
   - owner/admin have committees.admin
   - free/basic/pro/team plans do NOT have committees.read

---

### Part 9: Production Deployment

**Sequence:**
1. Build and test locally
2. Deploy migration files to production
3. Run status check (dry-run)
4. Run migration with --apply
5. Verify tables created (0 rows)
6. Deploy frontend
7. Verify /rules/committees loads (401 for unauth, empty list for auth)

**Safety:**
- No sample committees seeded
- No fake members added
- Tables created with 0 rows

---

## Files Expected to Change

### New Files
1. `api/migrations/v36-rules-committees.php` - Shared migration core
2. `api/migrate-v36-rules-committees.php` - Web endpoint
3. `api/rules-committees.php` - API endpoint
4. `scripts/migrations/check-v36-rules-committees.mjs` - Status script
5. `scripts/migrations/run-v36-rules-committees.mjs` - Runner script
6. `src/domain/rules/committeesApi.ts` - Frontend service
7. `src/pages/RulesCommitteesList.tsx` - List page
8. `src/pages/RulesCommitteeDetail.tsx` - Detail page
9. `docs/phase-3c-rules-committees-results.md` - Documentation

### Modified Files
1. `src/domain/config/capabilities.ts` - Add committees capabilities
2. `src/app/App.tsx` - Add routes, lazy imports
3. `src/pages/RulesList.tsx` - Add Committees link

---

## Safety Confirmations (Pre-Implementation)

| Requirement | Status |
|-------------|--------|
| No parity math modified | ✅ Will not touch |
| No weather correction modified | ✅ Will not touch |
| No combo resolution modified | ✅ Will not touch |
| No parity DB tables modified | ✅ Will not touch |
| Migration is additive only | ✅ CREATE TABLE IF NOT EXISTS |
| No sample data in production | ✅ Tables will be 0 rows |
| api/config.php preserved | ✅ No changes |
| rsa_token unchanged | ✅ No changes |

---

## End-of-Plan Checklist

- [x] Working tree clean: `1e7daa0` committed
- [x] Documentation reviewed
- [x] Existing patterns reviewed
- [x] Implementation plan written
- [ ] Plan reviewed by user
- [ ] Ready for Phase 3C coding

---

## Follow-up: Phase 3D Recommendation

**Phase 3D: Committee Meeting Notes & Decisions**

Tables needed:
- `committee_meetings` - Meeting schedule, location, status
- `meeting_attendance` - Who attended
- `meeting_minutes` - Markdown content, approval status
- `meeting_decisions` - Decisions made at meeting
- `meeting_action_items` - Tasks assigned with due dates

Not started in Phase 3C per user instruction.
