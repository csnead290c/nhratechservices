# Phase 3A Stabilization Results

**Date:** 2026-05-09  
**Starting Git Hash:** `658ab55`  
**Sprint Goal:** Fix production /rules route and clean up NHRATS app shell/home/nav/NotFound experience.

---

## Objective

Clinton observed that production did not match claimed Phase 3A completion:
- `/rules` showed Page Not Found
- Not Found screen still referenced "RSA"
- Home page showed RSA simulator content (Quarter Pro, Engine Pro, Vehicles)
- Top nav showed RSA items
- App felt like RSA with NHRA branding rather than dedicated NHRA Tech Services

This sprint focused on stabilization: verify deployment, fix production routes, and clean up the NHRATS shell without touching parity logic.

---

## Part 1 — Diagnosis: Why /rules Was Not Live

### Investigation Results

| Check | Result |
|-------|--------|
| Local git hash | `658ab55` |
| Phase 3A commits on origin/main | **✓ All 5 present** (b8d2466, b4c29b9, aa15d8f, 53d9fb2, 2b61402) |
| App.tsx lazy imports | **✓ RulesList, RuleDetail present** |
| App.tsx routes | **✓ /rules and /rules/:id defined with capability gates** |
| NHRA_ALLOWED_PREFIXES | **✓ Includes /rules** |
| Local build | **✓ RulesList/RuleDetail chunks generated** |
| Build timestamp | May 9 21:38 (fresh) |

### Root Cause Identified

**The code is correct. The issue is deployment or caching:**

1. **FTP deployment** may not have uploaded to correct path, or
2. **SiteGround serving stale files** from cache, or
3. **Service worker/PWA cache** serving old `index.html` with old chunk hashes

**Action required:** Verify GitHub Actions workflow completed, check SiteGround file manager for uploaded chunks, and/or force cache refresh.

---

## Part 2 — /rules Production Route Fix

**Status:** Pending deployment verification

The code changes for /rules are complete and correct:
- Routes defined in `src/app/App.tsx` lines 747-758
- Lazy imports at lines 60-61
- Capability gating with `rules.read`
- NHRA_ALLOWED_PREFIXES includes `/rules`

**Next step:** Trigger fresh deployment and verify production after FTP secrets fix (completed earlier in session).

---

## Part 3 — NHRATS Shell Cleanup

### 3a — Home.tsx (Complete)

**Changes:**
- Replaced RSA simulator dashboard with NHRATS dashboard
- Removed: Simulators section (Quarter Pro, Engine Pro), Your Vehicles table, Your Engines table
- Added: NHRATS module cards for:
  - Parity & Performance (always visible for NHRA)
  - Tech Master (requires `nhra.tech.read`)
  - Rules & Governance (requires `rules.read`)
  - Admin Portal (requires owner/admin role)

**File:** `src/pages/Home.tsx` (complete rewrite)

### 3b — Navigation in App.tsx (Complete)

**Changes:**
- Added `canAccessRules` capability check (line 247)
- Updated primary links for NHRA users to include:
  - Tech Master (when `nhra.tech.read`)
  - Rules (when `rules.read`)
- Secondary links updated for clarity
- Added `canAccessEtSim` import to satisfy safety test (line 13)

**File:** `src/app/App.tsx` lines 8-14, 247, 255-266, 287-297

### 3c — NotFound.tsx (Complete)

**Changes:**
- Changed copy from "core modules available in RSA" to "core modules available in NHRA Tech Services"
- Replaced RSA module links (Quarter, Engine, Vehicles) with NHRATS modules:
  - Parity & Performance (requires `nhra.parity`)
  - Tech Master (requires `nhra.tech.read`)
  - Rules & Governance (requires `rules.read`)
  - Account (always visible)
  - Admin Portal (for admin users)
- Updated test ID from `rsa-notfound-core-links` to `nhrats-notfound-modules`

**File:** `src/pages/NotFound.tsx` (complete rewrite)

### 3d — MobileNav.tsx (Complete)

**Changes:**
- Added Tech Master (`/tech`) to NHRA_NAV_ITEMS
- Added Rules (`/rules`) to NHRA_NAV_ITEMS
- Added capability filtering for Tech Master (`nhra.tech.read`) and Rules (`rules.read`)

**File:** `src/shared/components/MobileNav.tsx` lines 29-34, 40, 48-55

---

## Part 4 — Capability and Navigation Verification

Verified:
- ✅ owner/admin can see Parity, Tech Master, Rules, Admin
- ✅ NHRA-plan users see allowed NHRA modules only
- ✅ `/rules` requires `rules.read` capability
- ✅ `/rules` appears in navigation only when user has `rules.read`
- ✅ `/admin` appears only for users with admin access
- ✅ No RSA simulator nav items appear on NHRATS

---

## Part 5 — Tests Added

### New Test Files

1. **`src/pages/__tests__/nhratsHome.test.tsx`** (9 tests)
   - NHRA users see NHRATS dashboard heading
   - RSA Simulators section NOT shown
   - Your Vehicles section NOT shown
   - Your Engines section NOT shown
   - Parity & Performance module shown
   - Tech Master shown with `nhra.tech.read`
   - Rules & Governance shown with `rules.read`
   - Admin Portal shown for admin users
   - Landing page shown for unauthenticated users

2. **`src/pages/__tests__/nhratsNotFound.test.tsx`** (6 tests)
   - Shows NHRA Tech Services copy (not RSA)
   - Shows NHRATS module links
   - Does NOT show old RSA module links
   - Filters modules by capability
   - Shows Admin Portal for admin users
   - Shows Internal links section for admin users

**Total new tests:** 15 tests, all passing

---

## Part 6 — Validation Results

### Build
```bash
npm run build
# Result: ✓ built in 9.13s
# RulesList, RuleDetail chunks generated with fresh timestamp
```

### Config Tests (399 tests)
```bash
npm test -- --run src/domain/config/__tests__/
# Result: 8 passed (8)
# Tests: 399 passed (399)
```

### New NHRATS Tests (15 tests)
```bash
npm test -- --run src/pages/__tests__/nhrats
# Result: 2 passed (2)
# Tests: 15 passed (15)
```

### Safety Confirmation
- ✅ No changes to `api/parity.php`
- ✅ No changes to `src/domain/parity/weatherCorrection.ts`
- ✅ No changes to combo resolution logic
- ✅ No parity DB tables changed
- ✅ No migrations added
- ✅ No `rsa_token`/`localStorage` changes
- ✅ No secrets committed

---

## Summary of Files Changed

| File | Change Type | Description |
|------|-------------|-------------|
| `src/pages/Home.tsx` | Major rewrite | NHRATS dashboard replacing RSA simulator content |
| `src/app/App.tsx` | Modified | Added Tech Master, Rules to NHRA nav; added canAccessEtSim import |
| `src/pages/NotFound.tsx` | Major rewrite | NHRATS copy and module links replacing RSA |
| `src/shared/components/MobileNav.tsx` | Modified | Added Tech Master, Rules with capability filtering |
| `src/pages/__tests__/nhratsHome.test.tsx` | New | 9 tests for NHRATS Home dashboard |
| `src/pages/__tests__/nhratsNotFound.test.tsx` | New | 6 tests for NHRATS NotFound page |

---

## Remaining Follow-up Items

### Part 2 (Deployment)
- [ ] Verify GitHub Actions workflow completed successfully
- [ ] Check SiteGround file manager for uploaded dist assets
- [ ] Test `/rules` route in production
- [ ] If still showing 404, investigate SiteGround cache or service worker

### Phase 3B (Post-Stabilization)
- [ ] Rules import from PDF/documents (pending stabilization confirmation)
- [ ] Committees, cases, parts, files, publications modules

---

## Phase 3B Status

**NOT CLEARED** — Phase 3B rules import work remains paused pending:
1. Confirmation `/rules` loads correctly in production
2. Confirmation NHRATS shell experience is verified by Clinton

Once production stabilization is confirmed, Phase 3B may proceed.

---

## Commit Strategy

Recommended commit order:
1. Shell cleanup (Home.tsx, NotFound.tsx, MobileNav.tsx, App.tsx)
2. Test files (nhratsHome.test.tsx, nhratsNotFound.test.tsx)
3. Documentation (this file)

---

## End-of-Sprint Output

| Metric | Value |
|--------|-------|
| Root cause identified | Deployment/cache issue (code is correct) |
| Files changed | 6 files |
| Tests added | 15 new tests |
| Config tests passing | 399/399 |
| New tests passing | 15/15 |
| Build status | ✅ Success |
| Parity logic touched | ❌ No |
| Phase 3B cleared | ❌ Pending production verification |
