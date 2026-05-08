# NHRA Parity Baseline Automation

**Created:** 2026-05-08  
**Purpose:** Convert all manual baseline verification steps into automated, repeatable, read-only checks.

---

## How to Run

```bash
# Run all available checks
npm run baseline:nhra

# Run individual sections
npm run baseline:nhra:api       # API endpoint smoke tests
npm run baseline:nhra:db        # Database row counts
npm run baseline:nhra:config    # Production config verification (SSH)
npm run baseline:nhra:rsa       # RSA isolation checks
npm run baseline:nhra:browser   # Browser smoke tests (Playwright)
```

---

## Required Environment Variables

None are strictly required. Checks gracefully degrade to `BLOCKED — ACCESS NEEDED` when credentials are unavailable.

### For full coverage:

```bash
# Target URL (default: https://nhratechservices.com)
export NHRATS_BASE_URL=https://nhratechservices.com

# Browser + API auth (NHRA-plan test user)
export NHRATS_TEST_EMAIL=user@example.com
export NHRATS_TEST_PASSWORD=password

# Admin auth (optional — for admin gate checks)
export NHRATS_ADMIN_EMAIL=admin@example.com
export NHRATS_ADMIN_PASSWORD=password

# Database (for row count baseline)
export NHRATS_DB_HOST=your-db-host
export NHRATS_DB_PORT=3306
export NHRATS_DB_NAME=nhrats_db
export NHRATS_DB_USER=readonly_user
export NHRATS_DB_PASSWORD=password

# SSH (for production config verification)
export NHRATS_SSH_HOST=your-server
export NHRATS_SSH_PORT=22
export NHRATS_SSH_USER=deploy
export NHRATS_SSH_API_PATH=/home/user/public_html/api

# RSA isolation
export RSA_BASE_URL=https://racingsystemsanalysis.com
export RSA_DB_HOST=rsa-db-host
export RSA_DB_PORT=3306
export RSA_DB_NAME=rsa_db
export RSA_DB_USER=readonly_user
export RSA_DB_PASSWORD=password
```

**Never commit `.env` files or hardcode credentials.**

---

## What Each Script Checks

### `check-api.mjs` — API Smoke Tests

Authenticates via login API (or uses `NHRATS_JWT_TOKEN`), then hits 8 endpoints:

| Endpoint | Validates |
|---|---|
| `GET /api/parity.php?action=events` | Returns events array with count > 0 |
| `GET /api/parity.php?action=tracks` | Returns tracks array with count > 0 |
| `GET /api/parity.php?action=eventsWithStats` | Returns events array with count > 0 |
| `GET /api/parity.php?action=listEngineCombos` | Returns combos array with count > 0 |
| `GET /api/parity.php?action=listDriverCombos` | Returns combos array with count > 0 |
| `GET /api/parity.php?action=paritySmokeTest` | Returns `ok: true` or success object |
| `GET /api/auth.php?action=me` | Returns user object with email + plan |
| `GET /api/capabilities-endpoint.php` | Includes `nhra.parity` in capabilities |

**Requires:** `NHRATS_TEST_EMAIL` + `NHRATS_TEST_PASSWORD` or `NHRATS_JWT_TOKEN`

### `check-db.mjs` — Database Baseline Row Counts

Runs read-only SELECT COUNT(*) queries against all parity tables:

- `parity_runs`, `parity_runs_raw`, `parity_run_imports`
- `parity_engine_combos`, `parity_driver_combos`
- `parity_events`, `parity_tracks`
- `parity_weather_canonical`, `parity_weather_samples`
- `parity_class_aliases`, `parity_class_defaults`
- `parity_body_styles`, `parity_driver_body_styles`
- Null `race_lookup` check on `parity_runs`
- `SELECT DATABASE()` for DB name

**Requires:** `NHRATS_DB_HOST`, `NHRATS_DB_NAME`, `NHRATS_DB_USER`, `NHRATS_DB_PASSWORD` + `mysql2` package (`npm install --save-dev mysql2`)

### `check-prod-config.mjs` — Production Config Verification

SSHes into the production server and greps `api/config.php` for:

- `ALLOWED_ORIGIN` — must equal `https://nhratechservices.com` (not `*`)
- `FRONTEND_URL` — must equal `https://nhratechservices.com` (not RSA domain)
- `JWT_SECRET` — must exist, be non-empty, and not equal the template default

**Never prints JWT_SECRET values.** Only PASS/FAIL status is reported.

**Requires:** `NHRATS_SSH_HOST`, `NHRATS_SSH_USER`, `NHRATS_SSH_API_PATH`

### `check-rsa-isolation.mjs` — RSA Isolation

- Fetches both `NHRATS_BASE_URL` and `RSA_BASE_URL` — confirms HTTP 200
- If DB credentials available: compares DB names and `parity_runs` row counts
- JWT isolation marked NOT TESTED (cross-site token validation risk)

**Requires:** None for HTTP checks. `NHRATS_DB_*` + `RSA_DB_*` for DB comparison.

### `check-browser.spec.ts` — Browser Smoke Tests (Playwright)

Playwright spec that automates the full browser verification flow:

| Test Group | Tests |
|---|---|
| Auth & Route Gating (A1–A4) | Login redirect, NHRA lands on /parity, blocked from /et-sim and /admin |
| Dashboard Load (B1–B3) | No console errors, event selector populates, event change loads data |
| Corrected/Raw Toggle (C1–C2) | Corrected is default, raw toggle changes values |
| Qualifying (D1) | Qual sheet loads |
| Weather Panel (E1) | Weather elements present |
| Combo Assignments (F1) | Combo labels/colors appear |
| PDF Exports (G1) | Export button triggers .pdf download |
| Admin Gates (H1–H2) | Admin accesses /tech, NHRA user blocked from admin tools |
| Branding (I1–I2) | Page title is NHRA Tech Services, NHRA logo present |

**Requires:** `NHRATS_TEST_EMAIL` + `NHRATS_TEST_PASSWORD`. `NHRATS_ADMIN_EMAIL` + `NHRATS_ADMIN_PASSWORD` for admin checks.

---

## Read-Only Guarantee

- **API checks:** GET requests only. No POST/PUT/DELETE to mutation endpoints.
- **DB checks:** `SELECT COUNT(*)` and `SELECT DATABASE()` only. No INSERT, UPDATE, DELETE, ALTER, TRUNCATE, DROP.
- **Config checks:** `grep` only. No file writes, no config changes.
- **Browser checks:** Navigation + assertions only. No form submissions that create/edit/delete data.
- **No ingest, backfill, purge, or admin write operations.**

---

## Intentionally Not Tested

- JWT cross-site validation (risk of token leakage in automation scripts)
- Stripe/payment functionality (not relevant to parity)
- Email delivery (not relevant to parity)
- RSA simulation tools (not relevant to NHRATS)
- Performance/load testing
- Visual regression testing

---

## Results

Results are written to `scripts/nhra-baseline/results/`:

| File | Contents |
|---|---|
| `api.json` | API check results |
| `db.json` | DB row count results |
| `prod-config.json` | Production config results |
| `rsa-isolation.json` | RSA isolation results |
| `unified-report.json` | Orchestrator unified report |

---

## Redaction Rules

- JWT tokens: replaced with `[REDACTED]` in all output
- Authorization headers: never printed
- `JWT_SECRET` values: never printed (only PASS/FAIL status)
- DB credentials: never printed
- Full API response bodies: truncated to 200 characters in failure messages

---

## Known Limitations

- Browser tests require stable selectors. Some UI patterns may not be detectable without `data-testid` attributes.
- SSH config check requires key-based or passwordless SSH access.
- DB checks require the `mysql2` npm package (not installed by default).
- JWT isolation cannot be fully automated without cross-site token validation risk.
- Playwright tests run against the configured `NHRATS_BASE_URL` (production by default). Use caution.

---

## Adding New Checks

1. Create a new `check-*.mjs` or `check-*.spec.ts` in `scripts/nhra-baseline/`
2. Import `result`, `Status`, `writeResults`, `printSummary` from `shared.mjs`
3. Follow the read-only pattern — no mutations
4. Register in `run-baseline.mjs` `SECTIONS` object
5. Add a `package.json` script
6. Update this document
