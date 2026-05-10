# Phase 3A Rules & Governance Read-Only Foundation — Results

**Objective:** Build the read-only foundation for the Rules & Governance module without touching parity logic.

**Starting git hash:** `f6ee4b1`
**Ending git hash:** _(to be filled after commit)_

---

## Files Changed

| File | Type | Description |
|---|---|---|
| `api/migrate-v35-rules-foundation.php` | New | Migration: creates `rules` + `rule_versions` tables |
| `api/rules.php` | New | Read-only API: list, get, versions, categories |
| `api/lib/capabilities.php` | Modified | Added `rules.read` to nhra plan, `rules.read` + `rules.admin` to owner/admin roles |
| `src/domain/config/capabilities.ts` | Modified | Added `rules.read` + `rules.admin` to CAPABILITY_KEYS, PLAN_CAPABILITIES, ROLE_CAPABILITIES, aliases |
| `src/app/App.tsx` | Modified | Added `/rules` + `/rules/:id` routes, `/rules` to NHRA_ALLOWED_PREFIXES, lazy imports |
| `src/domain/rules/rulesApi.ts` | New | Typed API service for rules endpoints |
| `src/pages/RulesList.tsx` | New | Rules list page with search/filter |
| `src/pages/RuleDetail.tsx` | New | Rule detail page with version history |
| `src/domain/config/__tests__/capabilities.test.ts` | Modified | Added rules capability tests (12 tests) |
| `src/domain/config/__tests__/accessEnforcement.test.ts` | Modified | Added rules access enforcement tests (3 tests) |

---

## Migration

**File:** `api/migrate-v35-rules-foundation.php`

Creates two tables:
- **`rules`** — id, uuid, rule_number, category, class_scope, title, body, status, effective_from/to, current_version_id, created_by, timestamps, deleted_at. Indexes on status, category, effective dates, class_scope.
- **`rule_versions`** — id, rule_id, version_number, rule_number, title, body, change_summary, effective_from/to, created_by, created_at. Unique key on (rule_id, version_number). Indexes on rule_id, effective dates.

Uses `CREATE TABLE IF NOT EXISTS`. FKs added with try/catch for idempotency.

---

## Capabilities Added

| Capability | Description | Granted To |
|---|---|---|
| `rules.read` | Browse rulebook | nhra plan, owner role, admin role |
| `rules.admin` | Create/edit/publish rules | owner role, admin role |

---

## Routes Added

| Route | Component | Capability |
|---|---|---|
| `/rules` | RulesList | `rules.read` |
| `/rules/:id` | RuleDetail | `rules.read` |

Both added to `NHRA_ALLOWED_PREFIXES`.

---

## API Endpoints

**File:** `api/rules.php`

| Action | Method | Auth | Description |
|---|---|---|---|
| `list` | GET | `rules.read` | List rules with filters (category, status, class_scope, search) |
| `get` | GET | `rules.read` | Get single rule by id or uuid |
| `versions` | GET | `rules.read` | List version history for a rule |
| `categories` | GET | `rules.read` | List distinct categories |

---

## Tests Added

**capabilities.test.ts** (+46 lines):
- nhra plan grants rules.read
- nhra plan does NOT grant rules.admin
- free plan does NOT grant rules.read or rules.admin
- basic/pro/team plans do NOT grant rules capabilities
- owner role grants rules.admin
- admin role grants rules.admin
- member role does NOT grant rules.admin
- viewer role does NOT grant rules.admin

**accessEnforcement.test.ts** (+18 lines):
- NHRA user can access rules.read, cannot access rules.admin
- Admin NHRA user can access rules.read + rules.admin
- Free user cannot access rules.read or rules.admin

---

## Validation

| Command | Result |
|---|---|
| `npm run build` | ✅ PASS |
| 8 critical parity/NHRA test files | ✅ 495/495 PASS |
| `tierContractDrift.test.ts` | ✅ PASS |
| `accessEnforcement.test.ts` | ✅ PASS |
| `capabilities.test.ts` | ✅ PASS |
| `hamburgerMenu.test.tsx` | ✅ PASS |

---

## Explicit Confirmations

- ✅ **No parity logic files were touched** — `api/parity.php`, `src/domain/parity/weatherCorrection.ts`, combo resolution, correction model, corrected/raw behavior, qualifying raw behavior, PDF exports, event refresh, ingest, purge, backfill — all untouched.
- ✅ **No parity DB tables were modified** — additive migration only.
- ✅ **No migrations other than v35 were added.**
- ✅ **No localStorage/rsa_token behavior changed.**
- ✅ **No secrets committed.**
- ✅ **No RSA routes/pages deleted.**
- ✅ **No write/edit rule functionality built** — read-only only.
- ✅ **No committees, rule-change workflow, or publications built.**

---

## Follow-Up Items

- **Phase 3B:** Rule Detail/Version polish — improve version diff display, add markdown rendering for rule body, link rules to publications via entity_links
- **Phase 3C:** Rule Change Requests — submit/review/approve workflow
- **When credentials are available:** Seed the rulebook with NHRA rule data
- **Nav entry:** Rules & Governance nav link should be added to the desktop navigation for users with `rules.read` (not yet wired — currently accessible via direct URL only)

---

## Phase 3B Cleared?

**✅ YES.** Phase 3A Rules & Governance Read-Only Foundation is complete. All routes, API endpoints, capabilities, and tests are in place. Proceed to Phase 3B Rule Detail/Version polish or Phase 3C Rule Change Requests.
