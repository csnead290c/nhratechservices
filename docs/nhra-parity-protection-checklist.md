# NHRA Parity Protection Checklist
_Run this checklist before ANY migration step that touches parity code, DB schema, auth, or deployment config._  
_Last updated: 2026-05-07_

---

## Instructions
- Mark each item ✅ PASS, ❌ FAIL, or ⚠️ PARTIAL before proceeding
- A single ❌ FAIL on a critical item = STOP and investigate before continuing
- Keep a dated copy of each completed checklist run

---

## A. Pre-Migration Baseline

- [ ] Confirm current NHRATS prod build is clean: `npm run build` exits 0
- [ ] Confirm NHRATS prod is accessible at `https://nhratechservices.com`
- [ ] Confirm DB has expected parity run count (check against last known count: 670,062 as of 2026-05-07)
- [ ] Confirm `api/config.php` `ALLOWED_ORIGIN` = `'https://nhratechservices.com'`
- [ ] Confirm `api/config.php` DB credentials are correct
- [ ] Confirm `PARITY_CORRECTION_MODEL_VERSION` in `parity.php` is unchanged

---

## B. Auth & Capability Gate

- [ ] Login with an `nhra`-plan user → lands on `/parity`
- [ ] `nhra`-plan user cannot navigate to `/et-sim` (should redirect to `/parity`)
- [ ] `nhra`-plan user cannot navigate to `/admin` (should get 404 or redirect)
- [ ] Non-authenticated user accessing `/parity` → redirected to `/login`
- [ ] `owner` or `admin` role user → full access including `/parity` and `/tech`
- [ ] Capability endpoint: `GET /api/capabilities-endpoint.php` returns `nhra.parity` for nhra-plan user
- [ ] Basic-plan user cannot access `/parity` (should get capability denied)

---

## C. Parity Dashboard Load

- [ ] `/parity` loads without console errors
- [ ] Event selector populates with events
- [ ] Most recent event auto-selected (or expected default event shown)
- [ ] Year selector correctly scopes event list
- [ ] Switching events loads new data without page reload
- [ ] Dashboard summary panel shows run counts

---

## D. Event Parity Report — Core Behavior

- [ ] Event parity report loads for at least one known good event
- [ ] Run count in report matches expected value for that event
- [ ] Corrected mode is default
- [ ] Corrected ETs are different from raw ETs (correction is being applied)
- [ ] Correction factor column is present and non-null for runs with weather data
- [ ] Runs without weather data show `null` correction factor (not 0 or error)
- [ ] Class filter works (switching class updates table)
- [ ] Driver filter works

---

## E. Corrected / Raw Toggle

- [ ] Toggle to raw mode: ETs change to actual (uncorrected) values
- [ ] Toggle back to corrected: ETs revert to corrected values
- [ ] Parity summary percentages change between raw and corrected modes
- [ ] Incrementals update correctly when switching modes
- [ ] No JavaScript errors on mode toggle

---

## F. Qualifying — Raw Enforcement

- [ ] Qualifying sheet displays raw (uncorrected) times
- [ ] Corrected mode toggle does NOT apply correction to qualifying rows
- [ ] Qual sheet PDF exports with raw times

---

## G. Incrementals

- [ ] Incremental breakdown shows expected segments (60', 330', 660', 1000', 1320')
- [ ] Incremental comparison panel loads data for a known event
- [ ] Side-by-side comparison renders without error
- [ ] In corrected mode, incremental segments reflect corrected distances

---

## H. Weather Correction Data

- [ ] Session weather panel loads for at least one event with weather data
- [ ] Temperature, pressure, humidity displayed for multiple time points
- [ ] Canonical weather coverage: events with full coverage show no gaps
- [ ] At least one event shows Tempest as source
- [ ] At least one event shows Open-Meteo as fallback source (if known event uses it)
- [ ] Weather timeseries chart renders without error

---

## I. Combo Assignments

- [ ] Parity report shows engine combos for known drivers
- [ ] Combo color coding is consistent (same combo = same color across rows)
- [ ] A driver with a known combo change mid-season shows correct combos before/after effective date
- [ ] Class default combos apply to drivers without explicit assignments
- [ ] Class alias expansion: runs in aliased class (e.g., PS) resolve to correct combo

---

## J. Driver Drilldown

- [ ] Drivers list loads for an event
- [ ] Clicking a driver opens run history
- [ ] Driver run history shows correct events/runs
- [ ] Long-term driver trend data is present

---

## K. Multi-Event / Range Reports

- [ ] Multi-event parity panel loads for a year range
- [ ] Range parity matrix shows data across events
- [ ] Cross-event deltas are reasonable (no NaN or Infinity)

---

## L. Anomaly Analysis

- [ ] Anomaly analysis loads for a known event
- [ ] Anomaly scores are non-zero for at least some runs
- [ ] Anomaly detail view opens for a flagged run

---

## M. PDF Exports

- [ ] Qual sheet PDF exports successfully (file downloads, non-empty)
- [ ] Ladder PDF exports successfully
- [ ] Parity summary PDF exports successfully
- [ ] Event parity report PDF exports successfully
- [ ] PDF opens in viewer without errors
- [ ] PDF contains expected event name and date
- [ ] PDF header is NHRA-branded (check color, logo/text)

---

## N. Admin Parity Tools

- [ ] Admin: ingest dry-run for a known race_lookup returns expected row counts
- [ ] Admin: event catalog CRUD works (add/edit/delete a test event, then undo)
- [ ] Admin: combo assignment UI loads existing combos
- [ ] Admin: class aliases list loads
- [ ] Admin: backfill job can be started and cancelled without error
- [ ] Admin: parity smoke test (`?action=paritySmokeTest`) returns success

---

## O. Long-Term Parity Reports

- [ ] Full season report generates for current year
- [ ] Previous year data is present and unchanged
- [ ] Performance prediction loads without error
- [ ] RT analysis loads without error

---

## P. API Endpoint Health (Smoke Tests)

Run the following manually or via `api/smoke-*.php` scripts:

- [ ] `GET /api/parity.php?action=events` → returns event list, HTTP 200
- [ ] `GET /api/parity.php?action=tracks` → returns track list, HTTP 200
- [ ] `GET /api/parity.php?action=eventsWithStats` → returns stats, HTTP 200
- [ ] `GET /api/parity.php?action=listEngineCombos` → returns combo list, HTTP 200
- [ ] `GET /api/parity.php?action=listDriverCombos` → returns driver combos, HTTP 200
- [ ] `GET /api/parity.php?action=paritySmokeTest` → returns `{"ok": true}` or equivalent, HTTP 200
- [ ] `GET /api/auth.php?action=me` with valid token → returns user object, HTTP 200
- [ ] `GET /api/capabilities-endpoint.php` with valid token → returns capabilities array, HTTP 200

---

## Q. Database Migration State

- [ ] Confirm all migrations through current version have been run on NHRATS DB
- [ ] `parity_runs` row count unchanged after migration
- [ ] `parity_engine_combos` row count unchanged
- [ ] `parity_driver_combos` row count unchanged
- [ ] No unexpected NULL values in `parity_runs.race_lookup`

---

## R. Deployment Config Sanity

- [ ] `vite.config.ts` proxy target = `https://nhratechservices.com` (or appropriate dev URL)
- [ ] `index.html` title = `NHRA Tech Services`
- [ ] `public/site.webmanifest` name = `NHRA Tech Services`
- [ ] `api/config.php` `FRONTEND_URL` = `https://nhratechservices.com`
- [ ] `api/config.php` `ALLOWED_ORIGIN` = `https://nhratechservices.com`
- [ ] JWT_SECRET on NHRATS is different from RSA JWT_SECRET
- [ ] No Stripe keys present in NHRATS `config.php`

---

## S. RSA Isolation

After any cleanup/removal step:

- [ ] RSA site (`racingsystemsanalysis.com`) still loads and functions independently
- [ ] NHRATS DB is separate from RSA DB (spot-check row counts differ)
- [ ] NHRATS JWT tokens do not work on RSA API (different secret)
- [ ] No shared file system state between RSA and NHRATS servers

---

## T. Automated Test Suite

- [ ] `npm run test` (vitest) passes on NHRATS
- [ ] `tierContractDrift.test.ts` passes (client/server capability sync)
- [ ] `accessEnforcement.test.ts` passes (NHRA user routing tests)
- [ ] `hamburgerMenu.test.tsx` passes (uses `nhrats-*` testids)
- [ ] No new test failures introduced by the migration step

---

## Sign-Off

| Item | Date | Verified By | Notes |
|---|---|---|---|
| Pre-migration baseline | | | |
| Auth & capability gate | | | |
| Parity dashboard load | | | |
| Corrected/raw toggle | | | |
| Qualifying raw enforcement | | | |
| Weather correction | | | |
| Combo assignments | | | |
| PDF exports | | | |
| Admin tools | | | |
| API endpoint health | | | |
| DB migration state | | | |
| Deployment config | | | |
| Automated tests | | | |
