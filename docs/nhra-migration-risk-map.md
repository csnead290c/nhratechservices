# NHRA Migration Risk Map
_Last updated: 2026-05-07 | READ BEFORE TOUCHING PARITY CODE_

---

## Risk Level Legend
- 🔴 **CRITICAL** — Any change here can silently break parity data or lock out users
- 🟠 **HIGH** — Change requires careful testing and parity smoke test
- 🟡 **MEDIUM** — Controlled change, test after
- 🟢 **LOW** — Safe to change with standard testing

---

## Section 1: DO NOT TOUCH Without Written Approval

### 🔴 `parity_correctionFactor()` — `api/parity.php` ~line 3635
The entire weather correction model lives here. Any change alters all historical corrected ETs retroactively. Even a float precision change will produce different corrected times across 670,000+ runs.
- **Risk**: Silent, irreversible data corruption
- **Requirement**: Change requires new `PARITY_CORRECTION_MODEL_VERSION`, full regression of corrected vs. uncorrected outputs, and sign-off from parity analysts

### 🔴 `weatherCorrection.ts` — `src/domain/parity/weatherCorrection.ts`
Client-side mirror of the correction formula. Must stay exactly in sync with server.
- **Risk**: Client renders different corrections than server computes
- **Requirement**: Any change must be mirrored identically on server

### 🔴 `resolveComboForRun()` — `api/parity.php` ~line 9667
Determines which engine combo is assigned to each run. Combo colors, groupings, and comparative statistics all depend on this.
- **Risk**: Wrong combo assignment changes every parity report retroactively
- **Requirement**: Changes require full combo regression across known events

### 🔴 `parity_expandClassIndex()` — `api/parity.php`
Expands class aliases before combo resolution. If broken, class lookups silently return wrong combos.
- **Risk**: Alias expansion failure cascades through all reports

### 🔴 `parity_runs` table schema
Primary data store for 670,000+ normalized runs.
- **Risk**: Column additions are safe; any column removal, rename, or type change may break queries
- **Requirement**: All schema changes must be additive-only. Deprecate columns before removal. Never truncate.

### 🔴 `parity_weather_canonical` table + canonical build logic
The canonical weather bucket build is the bridge between raw Tempest data and per-run correction. If the bucket size, timezone logic, or event association changes, all corrections change.
- **Risk**: Silent correction drift across all historical runs

### 🔴 `rsa_token` localStorage key
All active NHRA users authenticate via this key. Renaming it logs everyone out.
- **Risk**: Complete user lockout
- **Migration path**: Read `rsa_token` → if present write to new key → delete old key. Must be done in a single release with no rollback.

### 🔴 `rsa_requireAuthAndCap($pdo, $auth, 'nhra.parity')` pattern
Every parity endpoint is gated by this. Removing or weakening it exposes raw run data.
- **Requirement**: Never remove, never lower to a less-specific capability

---

## Section 2: High Risk — Change With Full Testing

### 🟠 `NHRA_ALLOWED_PREFIXES` — `src/app/App.tsx` ~line 462
```ts
const NHRA_ALLOWED_PREFIXES = ['/parity', '/account', '/login', '/help'];
```
Controls which routes NHRA-plan users can access. Adding a new NHRATS module requires adding its prefix here — but forgetting to add it locks NHRA users out of the new module.
- **Required action when adding modules**: Add `/new-module-prefix` to this list and add a test case to `accessEnforcement.test.ts`

### 🟠 `PLAN_CAPABILITIES` — `api/lib/capabilities.php` ↔ `src/domain/config/capabilities.ts`
These two files must stay in sync. The `tierContractDrift.test.ts` test catches desync, but only if tests are run.
- **Risk**: Server denies access to capabilities the client thinks are granted (or vice versa)
- **Requirement**: Any capability change must be made in both files simultaneously

### 🟠 `parity_driver_combos` effective-date logic
Timeline inserts are safe; but updating `effective_from_utc` or `effective_to_utc` on existing rows can reassign combos for historical runs.
- **Requirement**: Admin combo changes should always use the timeline insert pattern, never direct date updates on existing rows

### 🟠 Qualifying raw mode
Qualifying rounds are intentionally kept raw (not corrected) in qual sheet reports. This is enforced by round-name matching logic. Any change to round classification logic may incorrectly apply correction to qualifying.

### 🟠 `parity_weather_samples` dedup key
`UNIQUE KEY uk_pws_source_event_ts (source, event_id, timestamp_utc)` — removing this allows duplicate samples, corrupting canonical build.

### 🟠 PDF export color constants in `parityPdf.ts`
`HEADER_BG: [30, 58, 95]` is hardcoded. If changed, all existing saved PDF templates look different. Low functional risk but high visual consistency risk.

### 🟠 `api/config.php` — DB credentials + CORS
`ALLOWED_ORIGIN` must exactly match the frontend domain. A mismatch causes all API requests to be blocked by CORS with no user-visible error.
- **Current value on NHRATS**: `ALLOWED_ORIGIN = 'https://nhratechservices.com'`
- **Risk**: If a new domain/subdomain is used, CORS must be updated first

---

## Section 3: Medium Risk

### 🟡 `api/functions.php` — `rsa_setCorsHeaders()`, `rsa_requireAuth()`, `rsa_jsonResponse()`
These are shared across every endpoint. Any change propagates everywhere. Changes should be carefully reviewed and smoke-tested against all endpoints.

### 🟡 `api/parity_weather_provider.php`
Tempest + Open-Meteo abstraction layer. Changes may affect weather data availability and canonical build quality. Changing API keys or endpoint URLs here requires weather smoke test.

### 🟡 Event timezone logic
`run_timestamp_utc` is derived from `run_time_local` via `parity_localToUtc()`. Changes to timezone handling affect all historical run UTC timestamps, which then affect weather-join correctness.

### 🟡 Class alias expansion breadth
Adding new aliases is safe. Removing aliases will cause previously-resolved combos to return `null` for affected runs.

### 🟡 `backfill` jobs infrastructure
Backfill jobs run as long-lived PHP processes. Starting a backfill on a corrupted or partially-migrated DB can produce inconsistent data at scale.

### 🟡 `vite.config.ts` proxy target
```ts
target: process.env.VITE_API_BASE_URL || 'https://nhratechservices.com'
```
If changed without updating the server, dev builds silently proxy to the wrong backend.

---

## Section 4: Low Risk

### 🟢 UI-only changes (colors, labels, layout)
Safe. No data impact.

### 🟢 Adding new parity endpoints
Safe as long as the auth gate (`rsa_requireAuthAndCap`) is applied and the new endpoint does not modify existing parity tables.

### 🟢 Adding new DB tables
Safe. Use `CREATE TABLE IF NOT EXISTS` pattern. New tables have no impact on existing queries.

### 🟢 Adding new capabilities
Safe as long as both `capabilities.php` and `capabilities.ts` are updated and tests are run.

### 🟢 Adding new frontend routes
Safe as long as `NHRA_ALLOWED_PREFIXES` is updated if the route is meant for NHRA users.

### 🟢 `src/services/parityApi.ts` — adding new typed wrappers
Safe. Existing wrappers are not affected.

---

## Section 5: RSA Removal Risk

The NHRATS codebase is a full copy of RSA. RSA-specific features exist but are not actively used on NHRATS. **Removing them carries these risks:**

| Removal Target | Risk | Safe to Remove? |
|---|---|---|
| `api/stripe.php` + `api/stripe-webhook.php` | No Stripe on NHRATS, but removing changes DB state behavior if any subscription rows exist | ✅ After verifying no active subscriptions |
| RSA simulation pages (`/et-sim`, `/predict`, etc.) | Low — NHRA users are route-blocked already | ✅ Safe, but do it in a dedicated cleanup PR |
| `Pricing` route | Low | ✅ Safe |
| `api/vehicles.php`, `api/runs.php` | Medium — may be called by shared components | 🟡 Audit callsites first |
| `api/engines.php`, `api/engine_sims.php` | Low on NHRATS — no active engine sim users | ✅ After verification |
| localStorage `rsa_*` key rename | HIGH — logs out active users | 🟠 Requires coordinated migration |
| `rsa_` prefixed localStorage keys for personal tools | LOW — those tools won't be on NHRATS | ✅ Safe when those routes are removed |

---

## Section 6: Migration Sequence (Recommended)

### Phase A — Already Done ✓
- Full RSA codebase copy to NHRATS
- NHRA branding applied
- Fresh git history, separate DB
- NHRATS deployed and smoke-tested

### Phase B — Documentation & Protection (This Sprint)
- Create all inventory/risk docs (this file)
- Confirm parity smoke test passes on NHRATS prod
- Do not change any parity code

### Phase C — Safe Cleanup (Next Sprint)
- Add NHRATS module prefixes to `NHRA_ALLOWED_PREFIXES`
- Hide (not delete) RSA-specific nav items for NHRA users
- Verify all parity routes still work after nav changes

### Phase D — RSA Feature Removal
- Remove RSA simulation routes one at a time
- Each removal: build check → deploy → smoke test parity
- Do NOT touch parity or tech master routes during removal

### Phase E — New Module Scaffolding
- Add new NHRATS-only modules (Rules & Governance, Cases, etc.)
- New tables only (additive migrations)
- New routes (add to NHRA_ALLOWED_PREFIXES)
- New PHP endpoints in new files (do not add to parity.php)

### Phase F — localStorage Key Migration
- Last step, planned independently
- Migrate `rsa_token` → `nhrats_token` with backward compatibility
- Coordinate with all active NHRA users
