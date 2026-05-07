# NHRA Parity Baseline Report — 2026-05-07
_Phase 1 Stability Sprint | Pre-Phase-2 baseline verification_  
_Verified by: Cascade + Clinton Snead (manual sections pending)_  
_Date: 2026-05-07_  
_Git HEAD: `baaefc7` — "docs: NHRA Tech Services master plan, parity inventory..."_

---

## ⚡ Executive Summary

| Category | Automated Result | Manual Status |
|---|---|---|
| Build | ✅ PASS | — |
| Critical parity unit tests | ✅ ALL PASS (483 tests) | — |
| Correction model constants | ✅ PASS | — |
| Deployment config (source) | ✅ PASS with 3 ⚠️ findings | — |
| Full test suite | ⚠️ PARTIAL — 29 pre-existing failures, 0 parity regressions | — |
| API endpoint health | ⏳ MANUAL REQUIRED | Pending |
| DB baseline row counts | ⏳ MANUAL REQUIRED | Pending |
| Browser/auth smoke tests | ⏳ MANUAL REQUIRED | Pending |
| Production config (server-side) | ⏳ MANUAL REQUIRED | Pending |

**Blocking issues:** None identified in automated checks.  
**Safe to proceed to Phase 2 (Safe Cleanup)?** ✅ YES — after manual items are verified by Clinton.

---

## 🚨 Blocking Issues

_None identified. See Findings section for non-blocking concerns._

---

## ⚠️ Non-Blocking Findings (Resolve Before Phase 3)

### FINDING-01: RSA Domain Leakage in Committed PHP Files
**Severity**: Low (not parity-breaking)  
**Files affected**:
- `api/functions.php` line 148: fallback `$frontendUrl = ... 'https://racingsystemsanalysis.com'`
- `api/functions.php` lines 167–168: email `From:` and `Reply-To:` hardcoded to `noreply@racingsystemsanalysis.com`
- `api/lib/admin-user-lifecycle.php` line 141: invite URL hardcoded to `https://racingsystemsanalysis.com/register?invite=...`
- `api/config.template.php` line 37: `FRONTEND_URL = 'https://racingsystemsanalysis.com'`

**Impact**: Email notifications and invite links sent from NHRATS will reference the wrong domain unless `FRONTEND_URL` is set correctly in production `config.php`. The fallback URL in `functions.php` is wrong if `FRONTEND_URL` is not defined. None of these touch parity data or auth.

**Recommended fix** (Phase 2): Update the three committed PHP files to use `nhratechservices.com`. This is a safe non-parity change.

---

### FINDING-02: `api/config.template.php` Has Stripe Credentials Pattern and Wildcard CORS
**Severity**: Low (template only — not deployed)  
**Details**:
- `ALLOWED_ORIGIN = '*'` — wildcard CORS in template. A developer who copies this without updating will have open CORS.
- Stripe key constants are present in the template with non-placeholder values.
- `JWT_SECRET` default is `'rsa_jwt_secret_change_this_in_production_2024'` — obvious placeholder but contains RSA name.

**Impact**: None unless a developer copies the template verbatim without updating secrets. No production impact.  
**Recommended fix** (Phase 2): Update template to use `nhratechservices.com` in `FRONTEND_URL` and `ALLOWED_ORIGIN`. Replace Stripe key values with clearly labeled `YOUR_STRIPE_KEY_HERE` placeholders.

---

### FINDING-03: 29 Pre-Existing Test Failures (Non-Parity)
**Severity**: Informational — all pre-existing at Initial Commit  
**Details**: 29 tests across 7 files fail. None are parity-critical. See Section T for full breakdown.

---

### FINDING-04: Local `api/config.php` Has RSA Domain
**Severity**: Informational — local dev file only, gitignored  
**Details**: The local `api/config.php` (gitignored, not deployed) contains `FRONTEND_URL = 'https://racingsystemsanalysis.com'`. This is the developer's local config. Production `config.php` on SiteGround must be verified separately (see Section Q).

---

## A. Pre-Migration Baseline

| Item | Status | Notes |
|---|---|---|
| `npm run build` exits 0 | ✅ PASS | Built in 4.39s. Chunk size warning on `ParityPortal-*.js` (923 kB) and `index-*.js` (1,624 kB) — pre-existing, not blocking |
| NHRATS prod accessible at nhratechservices.com | ⏳ MANUAL REQUIRED | See manual steps below |
| DB parity_runs row count matches baseline | ⏳ MANUAL REQUIRED | Last known: 670,062 (2026-05-07). See SQL below |
| `api/config.php` ALLOWED_ORIGIN correct | ⏳ MANUAL REQUIRED | Cannot verify prod config without server access |
| `api/config.php` DB credentials correct | ⏳ MANUAL REQUIRED | Cannot verify without server access |
| `PARITY_CORRECTION_MODEL_VERSION` unchanged | ✅ PASS | Confirmed `'v1-density-ratio'` at `api/parity.php` line 41 |

**Build output (condensed):**
```
✓ built in 4.39s
dist/assets/ParityPortal-*.js   923.53 kB (gzip: 253.90 kB)  ← largest chunk
dist/assets/index-*.js        1,624.67 kB (gzip: 412.08 kB)
(!) Chunk size warning — pre-existing, not a regression
```

**Correction model constants confirmed:**
```
api/parity.php line 37: define('PARITY_STD_TEMP_F',     60.0);
api/parity.php line 38: define('PARITY_STD_PRESS_INHG', 29.92);
api/parity.php line 39: define('PARITY_STD_RH_PCT',     0.0);
api/parity.php line 41: define('PARITY_CORRECTION_MODEL_VERSION', 'v1-density-ratio');
```

---

## B–Q. Browser / API / DB Sections

_All sections B through Q and S require browser access, authenticated API calls, or direct DB access. These are MANUAL REQUIRED. Exact steps are provided below._

---

## R. Deployment Config Sanity

| Item | Status | Notes |
|---|---|---|
| `vite.config.ts` proxy target | ✅ PASS | `'https://nhratechservices.com'` (with `VITE_API_BASE_URL` override for dev) |
| `index.html` title | ✅ PASS | `<title>NHRA Tech Services</title>` |
| `index.html` meta description | ✅ PASS | "NHRA Technical Services tools, data, and administrative resources." |
| `public/site.webmanifest` name | ✅ PASS | `"name":"NHRA Tech Services","short_name":"NHRATS","theme_color":"#262E87"` |
| VitePWA manifest name | ✅ PASS | `name: 'NHRA Tech Services'` in `vite.config.ts` |
| `api/config.php` FRONTEND_URL (prod) | ⏳ MANUAL REQUIRED | Gitignored — verify on SiteGround |
| `api/config.php` ALLOWED_ORIGIN (prod) | ⏳ MANUAL REQUIRED | Must = `'https://nhratechservices.com'` |
| JWT_SECRET differs from RSA | ⏳ MANUAL REQUIRED | Cannot verify without comparing prod configs |
| No Stripe keys in committed source | ⚠️ CONCERN | `api/config.template.php` contains Stripe key-shaped values — see FINDING-02 |
| No RSA domain in committed source files | ⚠️ PARTIAL | `api/functions.php` and `api/lib/admin-user-lifecycle.php` contain RSA domain — see FINDING-01 |
| No RSA domain in frontend source | ✅ PASS | No `racingsystemsanalysis` references in `src/` |

---

## S. RSA Isolation

| Item | Status | Notes |
|---|---|---|
| RSA site functions independently | ⏳ MANUAL REQUIRED | Verify `racingsystemsanalysis.com` loads normally |
| NHRATS DB is separate from RSA DB | ⏳ MANUAL REQUIRED | Spot-check: compare row counts between the two |
| NHRATS JWT tokens don't work on RSA | ⏳ MANUAL REQUIRED | Different JWT_SECRET required |
| No shared filesystem state | ⏳ MANUAL REQUIRED | Verify separate SiteGround hosting |

---

## T. Automated Test Suite

### T1. Critical Parity / NHRA Tests — ALL PASS ✅

Run: `npx vitest run [8 critical test files]`  
Result: **8 files, 483 tests — ALL PASS**

| Test File | Tests | Result | Covers |
|---|---|---|---|
| `src/dev/__tests__/tierContractDrift.test.ts` | 162 | ✅ PASS | Client/server capability sync |
| `src/domain/config/__tests__/accessEnforcement.test.ts` | 63 | ✅ PASS | NHRA user route gating |
| `src/app/__tests__/hamburgerMenu.test.tsx` | 3 | ✅ PASS | `nhrats-*` testid branding |
| `src/domain/parity/__tests__/weatherCorrection.test.ts` | 76 | ✅ PASS | Correction formula math |
| `src/domain/parity/__tests__/qualSheet.test.ts` | 40 | ✅ PASS | Qualifying raw enforcement |
| `src/domain/parity/__tests__/correctRunClient.test.ts` | 32 | ✅ PASS | Client-side correction |
| `src/domain/parity/__tests__/timelineInsert.test.ts` | 11 | ✅ PASS | Combo timeline logic |
| `src/domain/config/__tests__/capabilities.test.ts` | 96 | ✅ PASS | Capability grants by plan |

### T2. Additional Parity Tests — ALL PASS ✅

| Test File | Tests | Result |
|---|---|---|
| `src/domain/parity/__tests__/anomalyEngine.test.ts` | 45 | ✅ PASS |
| `src/domain/parity/__tests__/nhraMapper.test.ts` | 59 | ✅ PASS |
| `src/domain/parity/__tests__/weatherReliability.test.ts` | 47 | ✅ PASS |
| `src/domain/parity/__tests__/liveDataValidation.test.ts` | 17 | ✅ PASS |
| `src/domain/parity/__tests__/realDataValidation.test.ts` | 17 | ✅ PASS |
| `src/domain/parity/__tests__/canonicalProvenance.test.ts` | 24 | ✅ PASS |
| `src/domain/parity/__tests__/openMeteoProvider.test.ts` | 11 | ✅ PASS |
| `src/domain/parity/__tests__/optimalRun.test.ts` | 7 | ✅ PASS |
| `src/domain/parity/__tests__/stationCsvImport.test.ts` | 37 | ✅ PASS |
| `src/domain/parity/__tests__/resolveDefaultEvent.test.ts` | 13 | ✅ PASS |
| `src/domain/parity/__tests__/eventImport.test.ts` | 35 | ✅ PASS |
| `src/domain/parity/__tests__/weather.test.ts` | 23 | ✅ PASS |
| `src/services/__tests__/incidentAnalysisApi.test.ts` | 59 | ✅ PASS |
| `src/services/__tests__/incidentsApi.test.ts` | 30 | ✅ PASS |

### T3. Full Test Suite Summary

```
Test Files:  7 failed | 89 passed (96 total)
Tests:      29 failed | 2518 passed | 3 todo (2550 total)
Duration:   7.77s
```

### T4. Failing Tests — Pre-Existing, Non-Parity

All 29 failures are pre-existing (present since Initial Commit). Zero parity regressions.

| File | Failures | Category | Root Cause |
|---|---|---|---|
| `parityDashboards.test.ts` | 6/211 | Parity UI — future spec | Tests check for unimplemented features: `Extra` column picker group, category filter param, `parity_computeRowHash` timing exclusion, `category` prop threading, 4-endpoint fetch pattern. These are spec tests written ahead of implementation. |
| `qualSheetDriverHistory.test.ts` | 11/66 | Parity UI — future spec | Tests for `DriverDrilldownPanel` view modes (standard/incrementals/weather) and chart toggle — not yet implemented in `ParityPortal.tsx`. |
| `parityReportSections.test.ts` | 3/10 | Parity UI — future spec | Tests for `SummaryCompactTable`, `bestComboValue`, and no-ad-hoc-`toFixed` structural patterns. Features not yet added to `ParityReport.tsx`. |
| `no-adhoc-gating.test.ts` | 1/15 | Arch lint | Checks App.tsx imports `canAccessEtSim` from centralized guards. Pattern not yet applied — RSA guard architecture test. |
| `worksheetBehavior.test.tsx` | 3/15 | RSA sim | jsdom CSS limitation: `cursor: pointer` not computed by jsdom; double-click sim worksheet behavior |
| `WorksheetModal.transfer.test.tsx` | 4/6 | RSA sim | Unimplemented worksheet modal transfer feature |
| `buildVb6DetailedParameters.test.ts` | 1/29 | RSA sim | VB6 label format mismatch: expected `'60.0 mph'`, got `'0–60 mph'` |

**Assessment**: The 3 parity UI spec failures (`parityDashboards`, `qualSheetDriverHistory`, `parityReportSections`) represent planned-but-not-yet-built features. They are not regressions — these tests fail in the initial commit as well. They represent the next planned development work on the parity dashboard.

---

## Manual Steps for Clinton

_Complete these and add results to the Sign-Off table at the bottom of this document._

---

### MANUAL-01: Production Site Accessibility

**Steps:**
1. Navigate to `https://nhratechservices.com` in a browser (not logged in)
2. Confirm the page loads without a server error
3. Confirm the page title is "NHRA Tech Services" (browser tab)
4. Confirm the NHRA logo appears in the header
5. Note the page you land on (should be `/login` or a landing page)

**Record:** ✅ PASS / ❌ FAIL / ⚠️ PARTIAL + notes

---

### MANUAL-02: Auth & NHRA User Route Gating

**Steps:**
1. Log in as an `nhra`-plan user
2. Confirm you land on `/parity` after login
3. Try navigating to `https://nhratechservices.com/et-sim` → should redirect to `/parity`
4. Try navigating to `https://nhratechservices.com/admin` → should get 404 or redirect
5. Log out
6. Try navigating to `https://nhratechservices.com/parity` while logged out → should redirect to `/login`
7. Log in as `owner` or `admin` role user → confirm `/parity` and `/tech` both load

**Record:** Each sub-step ✅ / ❌

---

### MANUAL-03: Parity Dashboard Load

**Steps:**
1. Logged in as NHRA user, navigate to `/parity`
2. Confirm no console errors (open DevTools → Console)
3. Confirm the event selector populates with a list of events
4. Confirm the most recent event is auto-selected (or a sensible default)
5. Change the year in the year selector → confirm event list updates
6. Switch to a different event → confirm run data loads without page reload
7. Confirm the dashboard summary shows run counts for the selected event

**Record:** ✅ / ❌ / ⚠️

---

### MANUAL-04: Corrected / Raw Mode

**Steps:**
1. Load a parity report for any event that has weather data
2. Confirm the default mode shows **Corrected** ETs
3. Note 3–5 corrected ET values from the report
4. Toggle to **Raw** mode
5. Confirm those same ET values are different (raw ≠ corrected)
6. Toggle back to **Corrected** → confirm ETs revert to the corrected values
7. Confirm no JavaScript errors in console during toggle

**Record:** ✅ / ❌ / ⚠️

---

### MANUAL-05: Qualifying Raw Enforcement

**Steps:**
1. Open the Qual Sheet for any event
2. Confirm qualifying times are displayed
3. Enable **Corrected** mode (if the qual sheet has a mode toggle)
4. Confirm that qualifying run times remain **unchanged** (they must not be corrected)
5. Export the Qual Sheet PDF → confirm it downloads, opens in a PDF viewer, and shows raw times

**Record:** ✅ / ❌ / ⚠️

---

### MANUAL-06: Combo Assignments

**Steps:**
1. Load a parity report for an event with known engine combo assignments
2. Confirm engine combo labels appear next to driver rows
3. Confirm the same combo label shows the same color consistently in the report
4. If you know a driver who changed combos mid-season, load an event from before and after the change and verify different combos are shown

**Record:** ✅ / ❌ / ⚠️

---

### MANUAL-07: Weather Panel

**Steps:**
1. Load a parity report for an event with weather data (e.g., any 2024–2025 national event)
2. Open the Session Weather panel/tab
3. Confirm temperature, pressure, and humidity values appear for multiple time points
4. Confirm the weather source (Tempest or Open-Meteo) is shown
5. Confirm the weather timeseries chart renders without error

**Record:** ✅ / ❌ / ⚠️

---

### MANUAL-08: PDF Exports

**Steps:**
1. Export a Qual Sheet PDF → verify it downloads with filename `NHRA_QualSheet_*.pdf`
2. Export a Ladder PDF → verify `NHRA_Ladder_*.pdf`
3. Export a Parity Summary PDF → verify `NHRA_ParitySummary_*.pdf`
4. Export an Event Parity Report PDF → verify `NHRA_EventParityReport_*.pdf`
5. Open each PDF — confirm non-empty, correct event name/date, NHRA-branded header

**Record:** Each PDF ✅ / ❌ / ⚠️

---

### MANUAL-09: API Endpoint Smoke Tests

_Run these in a browser tab while authenticated, or via browser DevTools console._

**Steps — open browser DevTools console while logged in, then paste:**

```javascript
// Test 1: events
fetch('/api/parity.php?action=events', {
  headers: { Authorization: 'Bearer ' + localStorage.getItem('rsa_token') }
}).then(r => r.json()).then(d => console.log('events:', d.events?.length ?? d));

// Test 2: tracks
fetch('/api/parity.php?action=tracks', {
  headers: { Authorization: 'Bearer ' + localStorage.getItem('rsa_token') }
}).then(r => r.json()).then(d => console.log('tracks:', d.tracks?.length ?? d));

// Test 3: eventsWithStats
fetch('/api/parity.php?action=eventsWithStats', {
  headers: { Authorization: 'Bearer ' + localStorage.getItem('rsa_token') }
}).then(r => r.json()).then(d => console.log('eventsWithStats:', d.events?.length ?? d));

// Test 4: listEngineCombos
fetch('/api/parity.php?action=listEngineCombos', {
  headers: { Authorization: 'Bearer ' + localStorage.getItem('rsa_token') }
}).then(r => r.json()).then(d => console.log('engineCombos:', d.combos?.length ?? d));

// Test 5: listDriverCombos
fetch('/api/parity.php?action=listDriverCombos', {
  headers: { Authorization: 'Bearer ' + localStorage.getItem('rsa_token') }
}).then(r => r.json()).then(d => console.log('driverCombos:', d.combos?.length ?? d));

// Test 6: paritySmokeTest
fetch('/api/parity.php?action=paritySmokeTest', {
  headers: { Authorization: 'Bearer ' + localStorage.getItem('rsa_token') }
}).then(r => r.json()).then(d => console.log('smokeTest:', d));

// Test 7: auth me
fetch('/api/auth.php?action=me', {
  headers: { Authorization: 'Bearer ' + localStorage.getItem('rsa_token') }
}).then(r => r.json()).then(d => console.log('me:', d.user?.email, d.user?.plan));

// Test 8: capabilities
fetch('/api/capabilities-endpoint.php', {
  headers: { Authorization: 'Bearer ' + localStorage.getItem('rsa_token') }
}).then(r => r.json()).then(d => console.log('capabilities:', d.capabilities?.includes('nhra.parity')));
```

**Expected results:**
- `events:` → a number > 0
- `tracks:` → a number > 0
- `eventsWithStats:` → a number > 0
- `engineCombos:` → a number > 0
- `driverCombos:` → a number > 0
- `smokeTest:` → `{ok: true}` or similar success object
- `me:` → user email and `plan: 'nhra'` (or `role: 'owner'` etc.)
- `capabilities:` → `true`

**Record each result:** ✅ / ❌ + actual value

---

### MANUAL-10: Database Baseline Row Counts

_Run these queries on the NHRATS MySQL database (SiteGround phpMyAdmin or SSH). Read-only SELECT only — no updates._

```sql
-- Parity run counts
SELECT 'parity_runs' AS tbl, COUNT(*) AS row_count FROM parity_runs
UNION ALL
SELECT 'parity_runs_raw', COUNT(*) FROM parity_runs_raw
UNION ALL
SELECT 'parity_run_imports', COUNT(*) FROM parity_run_imports
UNION ALL
SELECT 'parity_engine_combos', COUNT(*) FROM parity_engine_combos
UNION ALL
SELECT 'parity_driver_combos', COUNT(*) FROM parity_driver_combos
UNION ALL
SELECT 'parity_events', COUNT(*) FROM parity_events
UNION ALL
SELECT 'parity_tracks', COUNT(*) FROM parity_tracks
UNION ALL
SELECT 'parity_weather_canonical', COUNT(*) FROM parity_weather_canonical
UNION ALL
SELECT 'parity_weather_samples', COUNT(*) FROM parity_weather_samples
UNION ALL
SELECT 'parity_class_aliases', COUNT(*) FROM parity_class_aliases
UNION ALL
SELECT 'parity_class_defaults', COUNT(*) FROM parity_class_defaults
UNION ALL
SELECT 'parity_body_styles', COUNT(*) FROM parity_body_styles
UNION ALL
SELECT 'parity_driver_body_styles', COUNT(*) FROM parity_driver_body_styles;

-- Verify no null race_lookup values in parity_runs
SELECT COUNT(*) AS null_race_lookups FROM parity_runs WHERE race_lookup IS NULL;

-- Confirm DB name / connection (non-sensitive)
SELECT DATABASE() AS current_db;
```

**Record results in the DB Baseline table below.**

---

### MANUAL-11: Production Config Verification

_SSH into SiteGround NHRATS hosting and run (do not share the actual values here):_

```bash
# From NHRATS public_html/api/ directory
grep -n "ALLOWED_ORIGIN\|FRONTEND_URL\|JWT_SECRET" config.php
```

**Verify:**
- `ALLOWED_ORIGIN` = `'https://nhratechservices.com'` ← must not be `*`
- `FRONTEND_URL` = `'https://nhratechservices.com'` ← must not be RSA domain
- `JWT_SECRET` is a unique, non-default value different from the template default

Do not record the actual secret values in this document.

---

### MANUAL-12: RSA Isolation Check

**Steps:**
1. Navigate to `https://racingsystemsanalysis.com` → confirm it loads normally (RSA is unaffected)
2. In phpMyAdmin: confirm the NHRATS database name differs from RSA database name
3. Note approximate `parity_runs` row count from both DBs — they should not be identical (NHRATS may have more due to continued ingestion)

---

## DB Baseline Table
_Fill in after completing MANUAL-10_

| Table | Row Count (2026-05-07) | Verified By |
|---|---|---|
| `parity_runs` | _(pending)_ | |
| `parity_runs_raw` | _(pending)_ | |
| `parity_run_imports` | _(pending)_ | |
| `parity_engine_combos` | _(pending)_ | |
| `parity_driver_combos` | _(pending)_ | |
| `parity_events` | _(pending)_ | |
| `parity_tracks` | _(pending)_ | |
| `parity_weather_canonical` | _(pending)_ | |
| `parity_weather_samples` | _(pending)_ | |
| `parity_class_aliases` | _(pending)_ | |
| `parity_class_defaults` | _(pending)_ | |
| `parity_body_styles` | _(pending)_ | |
| `parity_driver_body_styles` | _(pending)_ | |
| `null_race_lookups in parity_runs` | _(must be 0)_ | |

---

## Sign-Off Table

| Section | Auto Result | Manual Result | Date | Verified By | Notes |
|---|---|---|---|---|---|
| A. Pre-migration baseline | ⚠️ PARTIAL | ⏳ Pending | | | Build ✅, correction constants ✅, prod/DB manual |
| B. Auth & capability gate | NOT TESTED | ⏳ Pending | | | See MANUAL-02 |
| C. Parity dashboard load | NOT TESTED | ⏳ Pending | | | See MANUAL-03 |
| D. Event parity report | NOT TESTED | ⏳ Pending | | | See MANUAL-03/04 |
| E. Corrected/raw toggle | NOT TESTED | ⏳ Pending | | | See MANUAL-04 |
| F. Qualifying raw enforcement | NOT TESTED | ⏳ Pending | | | See MANUAL-05 |
| G. Incrementals | NOT TESTED | ⏳ Pending | | | Browser only |
| H. Weather correction data | NOT TESTED | ⏳ Pending | | | See MANUAL-07 |
| I. Combo assignments | NOT TESTED | ⏳ Pending | | | See MANUAL-06 |
| J. Driver drilldown | NOT TESTED | ⏳ Pending | | | Browser only |
| K. Multi-event / range reports | NOT TESTED | ⏳ Pending | | | Browser only |
| L. Anomaly analysis | NOT TESTED | ⏳ Pending | | | Browser only |
| M. PDF exports | NOT TESTED | ⏳ Pending | | | See MANUAL-08 |
| N. Admin parity tools | NOT TESTED | ⏳ Pending | | | Browser + admin login |
| O. Long-term reports | NOT TESTED | ⏳ Pending | | | Browser only |
| P. API endpoint health | NOT TESTED | ⏳ Pending | | | See MANUAL-09 |
| Q. Database migration state | NOT TESTED | ⏳ Pending | | | See MANUAL-10 |
| R. Deployment config sanity | ✅ PASS (source) | ⏳ Pending (server) | 2026-05-07 | Cascade | Source checks all pass; server config needs MANUAL-11 |
| S. RSA isolation | NOT TESTED | ⏳ Pending | | | See MANUAL-12 |
| T. Automated test suite | ⚠️ PARTIAL | N/A | 2026-05-07 | Cascade | All parity-critical pass; 29 pre-existing failures in RSA sim + parity spec tests |

---

## Automated Checks Reference

### Correction Formula Invariants (Source-Verified ✅)
```
api/parity.php:37  define('PARITY_STD_TEMP_F',     60.0);
api/parity.php:38  define('PARITY_STD_PRESS_INHG', 29.92);
api/parity.php:39  define('PARITY_STD_RH_PCT',     0.0);
api/parity.php:41  define('PARITY_CORRECTION_MODEL_VERSION', 'v1-density-ratio');
```
Correction model is emitted in API responses at: lines 1231, 3987, 4243, 5316.

### Auth Gate Pattern (Source-Verified ✅)
`rsa_requireAuthAndCap($pdo, $auth, 'nhra.parity')` present at `api/parity.php` line ~57 (before routing switch), applied globally to all parity actions.

### NHRA Routing (Source-Verified ✅)
```ts
// App.tsx line 462
const NHRA_ALLOWED_PREFIXES = ['/parity', '/account', '/login', '/help'];
```
NHRA plan users redirected to `/parity` on login (line 455-456).  
NHRA plan users blocked from routes outside `NHRA_ALLOWED_PREFIXES` (line 468-473).

### tierContractDrift: PASS ✅
162 tests confirm `capabilities.php` ↔ `capabilities.ts` are in sync as of this baseline.

### accessEnforcement: PASS ✅
63 tests confirm NHRA user routing behavior is correct.

---

## Next Recommended Sprint: Phase 2 Safe Cleanup

Once Clinton completes manual items MANUAL-01 through MANUAL-12 and records results above, Phase 2 is cleared to begin.

**Phase 2 tasks (no parity logic changes):**
1. Fix FINDING-01: Update `api/functions.php` and `api/lib/admin-user-lifecycle.php` RSA domain references → `nhratechservices.com`
2. Fix FINDING-02: Update `api/config.template.php` domain and CORS defaults
3. Hide RSA simulation nav links from NHRA users (no code deletion, just conditional nav)
4. Archive Stripe route (add early-return to `api/stripe.php` for NHRATS deploys)

**Each Phase 2 step must be followed by:** `npm run build` + parity smoke test + `npm run test` (confirm no new failures in critical parity tests).
