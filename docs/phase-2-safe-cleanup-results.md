# Phase 2 Safe Cleanup — Results

**Sprint objective:** Remove RSA leftovers and unsafe templates without modifying parity logic, deleting files, or weakening auth.

**Starting git hash:** `bc79188`  
**Ending git hash:** _(to be filled after commit)_

---

## Files Changed

| File | Phase | Change |
|---|---|---|
| `api/functions.php` | 2A | RSA domain → NHRATS domain in password-reset email (URL, subject, body, From/Reply-To, X-Mailer) |
| `api/lib/admin-user-lifecycle.php` | 2A | Hardcoded RSA invite URL → `FRONTEND_URL` with `nhratechservices.com` fallback |
| `api/config.template.php` | 2B | `ALLOWED_ORIGIN` → `https://nhratechservices.com` (was `*`); `FRONTEND_URL` → `https://nhratechservices.com`; JWT_SECRET placeholder clearly marked REQUIRED; Stripe constants emptied with NHRATS-disabled comment |
| `src/shared/components/MobileNav.tsx` | 2C | Added NHRA-aware nav items (Parity/Help for NHRA users, RSA sim tools for others) |
| `api/stripe.php` | 2D | Added early-return guard when `STRIPE_SECRET_KEY` is empty or template default |
| `api/stripe-webhook.php` | 2D | Added early-return guard when `STRIPE_SECRET_KEY` is empty or template default |

---

## Explicit Confirmations

- ✅ **No parity logic files were touched** — `api/parity.php`, `src/domain/parity/weatherCorrection.ts`, combo resolution, correction model, corrected/raw behavior, qualifying raw behavior, PDF exports, event refresh, ingest, purge, backfill — all untouched.
- ✅ **No migrations were added.**
- ✅ **No localStorage key behavior was changed** — `rsa_token` and `rsa.auth.*` keys remain unchanged.
- ✅ **No auth/capability checks were weakened** — `rsa_requireAuthAndCap($pdo, $auth, 'nhra.parity')` unchanged.
- ✅ **No secrets were committed** — no `.env` files, no real API keys, no JWT secrets.
- ✅ **No RSA routes/pages were deleted** — only nav visibility adjusted.
- ✅ **No backend files were deleted** — Stripe endpoints preserved with guards.

---

## Phase 2C Detail: Nav Cleanup

The desktop navigation in `App.tsx` already handles NHRA users correctly:
- **Primary links:** NHRA users see only "Parity". Non-NHRA see Home, Vehicles, Quarter, Engine.
- **Secondary links (hamburger):** NHRA users see only "Help". Non-NHRA see Calculators, History, Team, Parity, Tech Master, Help, About.
- **Route guard:** `NhraPageGuard` blocks NHRA users from any route not in `NHRA_ALLOWED_PREFIXES`.

`MobileNav.tsx` was updated to match this pattern, though it is not currently imported in the app.

---

## Phase 2D Detail: Stripe Archiving

Both `api/stripe.php` and `api/stripe-webhook.php` now check `STRIPE_SECRET_KEY` before initializing Stripe. If the key is empty or still the template default (`sk_test_xxx`), the endpoint returns HTTP 503 with:
```json
{"error": "Stripe is not configured on this server."}
```

To re-enable Stripe: set a real `STRIPE_SECRET_KEY` in `config.php` and remove the guard.

---

## Validation Commands Run

| Command | Result |
|---|---|
| `npm run build` | ✅ PASS — 4.41s |
| 8 critical parity/NHRA tests | ✅ 483/483 PASS |
| `accessEnforcement.test.ts` (63 tests) | ✅ PASS |
| `hamburgerMenu.test.tsx` (3 tests) | ✅ PASS |
| `tierContractDrift.test.ts` (162 tests) | ✅ PASS |
| `weatherCorrection.test.ts` (76 tests) | ✅ PASS |
| `qualSheet.test.ts` (40 tests) | ✅ PASS |
| `correctRunClient.test.ts` (32 tests) | ✅ PASS |
| `timelineInsert.test.ts` (11 tests) | ✅ PASS |
| `capabilities.test.ts` (96 tests) | ✅ PASS |

---

## Baseline Automation Summary

| Section | Status |
|---|---|
| Build | ✅ PASS |
| Critical parity tests | ✅ 483/483 PASS |
| API endpoint health | 🔒 BLOCKED — `NHRATS_TEST_EMAIL`, `NHRATS_TEST_PASSWORD` |
| DB baseline row counts | 🔒 BLOCKED — `NHRATS_DB_*` |
| Browser/auth smoke tests | 🔒 BLOCKED — `NHRATS_TEST_EMAIL`, `NHRATS_TEST_PASSWORD` |
| Production config | 🔒 BLOCKED — `NHRATS_SSH_*` |
| RSA isolation (HTTP) | ✅ PASS — both sites HTTP 200 |
| RSA isolation (DB) | 🔒 BLOCKED — `NHRATS_DB_*`, `RSA_DB_*` |

---

## Blocked Checks (Missing Env Vars)

| Required Env Vars | Unblocks |
|---|---|
| `NHRATS_TEST_EMAIL`, `NHRATS_TEST_PASSWORD` | API + Browser checks |
| `NHRATS_ADMIN_EMAIL`, `NHRATS_ADMIN_PASSWORD` | Admin gate checks |
| `NHRATS_DB_HOST`, `NHRATS_DB_NAME`, `NHRATS_DB_USER`, `NHRATS_DB_PASSWORD` | DB baseline |
| `NHRATS_SSH_HOST`, `NHRATS_SSH_USER`, `NHRATS_SSH_API_PATH` | Production config |
| `RSA_DB_HOST`, `RSA_DB_NAME`, `RSA_DB_USER`, `RSA_DB_PASSWORD` | RSA DB comparison |

---

## Follow-Up Items

- **Phase 3:** Rules & Governance read-only MVP — build NHRA-specific modules (no more cleanup)
- **When credentials are available:** Run `npm run baseline:nhra` to complete the full baseline picture
- **When Stripe is needed on NHRATS:** Remove guards in `stripe.php` and `stripe-webhook.php`, configure real keys

---

## Phase 3 Cleared?

**✅ YES.** Phase 2 Safe Cleanup is complete. All RSA domain leakage is fixed. All template defaults are NHRATS-safe. Nav clutter is hidden for NHRA users. Stripe is safely disabled. No parity regressions. Proceed to Phase 3 Rules & Governance MVP.
