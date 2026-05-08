# NHRA Parity Baseline Automation

Automated, repeatable, read-only checks for verifying NHRA parity system health.

**All checks are READ-ONLY.** No mutations, no writes, no backfills, no migrations, no ingest jobs.

## Quick Start

```bash
# Run all available checks
npm run baseline:nhra

# Run a specific section
npm run baseline:nhra:api
npm run baseline:nhra:db
npm run baseline:nhra:config
npm run baseline:nhra:rsa
npm run baseline:nhra:browser
```

## Required Environment Variables

None are strictly required — checks gracefully degrade to BLOCKED status when access is unavailable.

### For full coverage, set these:

```bash
# Target (default: https://nhratechservices.com)
export NHRATS_BASE_URL=https://nhratechservices.com

# Browser + API auth (NHRA-plan user)
export NHRATS_TEST_EMAIL=user@example.com
export NHRATS_TEST_PASSWORD=password

# Admin auth (for admin gate checks)
export NHRATS_ADMIN_EMAIL=admin@example.com
export NHRATS_ADMIN_PASSWORD=password

# Database (for row count baseline)
export NHRATS_DB_HOST=localhost
export NHRATS_DB_PORT=3306
export NHRATS_DB_NAME=nhrats_db
export NHRATS_DB_USER=readonly_user
export NHRATS_DB_PASSWORD=password

# SSH (for production config verification)
export NHRATS_SSH_HOST=example.com
export NHRATS_SSH_PORT=22
export NHRATS_SSH_USER=deploy
export NHRATS_SSH_API_PATH=/home/user/public_html/api

# RSA isolation checks
export RSA_BASE_URL=https://racingsystemsanalysis.com
export RSA_DB_HOST=localhost
export RSA_DB_PORT=3306
export RSA_DB_NAME=rsa_db
export RSA_DB_USER=readonly_user
export RSA_DB_PASSWORD=password
```

**Never commit `.env` files or hardcode credentials.**

## What Each Script Checks

| Script | Checks | Requires |
|---|---|---|
| `check-api.mjs` | 8 parity API endpoints: events, tracks, eventsWithStats, listEngineCombos, listDriverCombos, paritySmokeTest, auth/me, capabilities | `NHRATS_TEST_EMAIL` + `NHRATS_TEST_PASSWORD` or `NHRATS_JWT_TOKEN` |
| `check-db.mjs` | Row counts for all 13 parity tables + null race_lookup check | `NHRATS_DB_*` + `mysql2` package |
| `check-prod-config.mjs` | ALLOWED_ORIGIN, FRONTEND_URL, JWT_SECRET (exists/not-default/non-empty) — values redacted | `NHRATS_SSH_*` |
| `check-rsa-isolation.mjs` | HTTP accessibility of both sites, DB name/count comparison | `RSA_BASE_URL`, `NHRATS_DB_*` + `RSA_DB_*` |
| `check-browser.spec.ts` | Auth gates, dashboard load, event selector, corrected/raw toggle, qual sheet, weather panel, combos, PDF exports, admin gates, page title | `NHRATS_TEST_EMAIL` + `NHRATS_TEST_PASSWORD` |

## Read-Only Guarantee

- API checks: GET requests only
- DB checks: SELECT queries only (COUNT, DATABASE())
- Config checks: grep only (no file writes)
- Browser checks: navigation + assertions only (no form submissions that mutate data)
- No INSERT, UPDATE, DELETE, ALTER, TRUNCATE, DROP, or migration queries
- No ingest, backfill, purge, or admin write operations

## Intentionally Not Tested

- JWT cross-site validation (risk of token leakage in automation)
- Stripe/payment functionality (not relevant to parity)
- Email delivery (not relevant to parity)
- RSA simulation tools (not relevant to NHRATS)
- Performance/load testing

## Results

Results are written to `scripts/nhra-baseline/results/`:
- `api.json` — API check results
- `db.json` — DB row count results
- `prod-config.json` — Production config results
- `rsa-isolation.json` — RSA isolation results
- `unified-report.json` — Orchestrator unified report

## Redaction Rules

- JWT tokens are never printed (replaced with `[REDACTED]`)
- Authorization headers are never printed
- JWT_SECRET values are never printed (only PASS/FAIL status)
- DB credentials are never printed
- Full API response bodies are truncated to 200 chars in failure messages

## Known Limitations

- Browser tests require stable selectors; some UI patterns may not be detectable
- SSH config check requires key-based or passwordless SSH access
- DB checks require the `mysql2` npm package (`npm install --save-dev mysql2`)
- JWT isolation cannot be fully automated without cross-site token validation risk
