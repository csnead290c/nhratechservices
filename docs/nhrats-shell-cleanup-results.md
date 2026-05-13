# NHRATS Shell Cleanup Results

## Objective

Remove all RSA-related navigation, home page references, direct route access, and app/icon branding from nhratechservices.com. The site should feel like a clean NHRA Technical Services internal tool.

---

## Git Hashes

| Item | Hash |
|------|------|
| Starting hash | `19825e5` |
| Route/nav/home/manifest cleanup | `f0f84af` |
| Tests | `320d81f` |
| Documentation | *(this commit)* |

---

## RSA Routes Hidden/Blocked

All of the following routes now render the `NotFound` page instead of RSA content. Page/component files are **not deleted** per safety rules.

| Route | Former Page | Action |
|-------|-------------|--------|
| `/vehicles` | Vehicles | → NotFound |
| `/et-sim` | Predict (ET Sim) | → NotFound |
| `/predict` | Predict (ET Sim) | → NotFound |
| `/engine-sim` | EngineSimDashboard | → NotFound |
| `/engine-sim-legacy` | EngineSim | → NotFound |
| `/engine-pro` | EngineSimDashboard | → NotFound |
| `/log` | Log | → NotFound |
| `/history` | History | → NotFound |
| `/dial-in` | DialIn | → NotFound |
| `/opponents` | Opponents | → NotFound |
| `/race-day` | RaceDay | → NotFound |
| `/import` | DataImport | → NotFound |
| `/tech-card` | TechCard | → NotFound |
| `/ladder` | Ladder | → NotFound |
| `/clutch-sim` | ClutchSim | → NotFound |
| `/converter-sim` | ConverterSim | → NotFound |
| `/suspension-sim` | SuspensionSim | → NotFound |
| `/team` | TeamHub | → NotFound |
| `/parts` | TeamHub | → NotFound |
| `/events` | TeamHub | → NotFound |
| `/maintenance` | TeamHub | → NotFound |
| `/expenses` | TeamHub | → NotFound |
| `/about` | About | → NotFound |
| `/pricing` | Pricing | → NotFound |
| `/calculators` | Calculators | → NotFound |
| `/calcs` | Calculators | → NotFound |
| `/register` | Register | → NotFound |

---

## Allowed NHRATS Routes (Unchanged/Preserved)

| Route | Notes |
|-------|-------|
| `/` | Home dashboard (NHRATS modules) |
| `/login` | Auth |
| `/reset-password` | Auth |
| `/help` | Help center |
| `/account` | User account |
| `/parity` | Capability-gated: `nhra.parity` |
| `/parity/analysis/:incidentId` | Capability-gated: `incidents.read` |
| `/parity/idr` | Capability-gated: `nhra.parity` |
| `/tech` | Capability-gated: `nhra.tech.read` |
| `/rules` | Capability-gated: `rules.read` |
| `/rules/:id` | Capability-gated: `rules.read` |
| `/rules/committees` | Capability-gated: `committees.read` |
| `/rules/committees/:id` | Capability-gated: `committees.read` |
| `/admin` | Role-gated: owner/admin only |
| `/dev` | Role-gated: owner/admin only |
| `*` | NotFound |

---

## Nav / Home / NotFound Changes

### Navigation (`src/app/App.tsx`)
- **Before:** Two branches — NHRA users got clean nav, RSA users got vehicles/ET-sim/engine nav
- **After:** Single unified nav for all users: Home / Parity / Tech Master / Rules (all capability-gated) + Help / Admin / Dev in hamburger
- Removed: Vehicles, Quarter, Engine, Calculators, History, Team, About links
- Removed: `tierPill` tier badge function (unused)
- Removed: `useSubscription` from `UserMenu` (no RSA team link)
- Removed: Team link from user account dropdown

### Home Page (`src/pages/Home.tsx`)
- **Before:** Three branches — unauthenticated → Landing, NHRA → NhratsDashboard, other → RSA fallback
- **After:** Two branches — unauthenticated → Landing, authenticated → NhratsDashboard
- All authenticated users on nhratechservices.com see the NHRATS dashboard

### Landing Page (`src/pages/Landing.tsx`)
- **Before:** RSA marketing page with "Turn On More Win Lights!", Quarter Jr/Pro cards, Engine Jr/Pro, pricing tiers ($9.99/$24.99), subscription CTA
- **After:** Clean NHRATS internal-tool landing: NHRA logo, "NHRA Tech Services" heading, one-line description, Sign In button

### NotFound Page (`src/pages/NotFound.tsx`)
- Already NHRATS-clean from Phase 3C — no changes needed
- Shows: Parity, Tech Master, Rules, Account links (capability-filtered)
- Shows Internal links section (dev/incidents) for owner/admin only

### `NHRA_ALLOWED_PREFIXES` (App.tsx)
- **Added:** `/tech`, `/admin`, `/dev` (were missing, causing redirects for NHRA users with those roles)

### `NhraHomeRedirect`
- Removed auto-redirect of NHRA plan users to `/parity` — home IS the dashboard now

---

## Icon / Manifest Files Changed

| File | Change |
|------|--------|
| `public/manifest.webmanifest` | `name`: Racing Systems Analysis → NHRA Tech Services; `short_name`: RSA → NHRATS; `theme_color`: #007bff → #262E87; icon src: `/icon-192.png` / `/icon-512.png` → `/android-chrome-192x192.png` / `/android-chrome-512x512.png` |
| `public/site.webmanifest` | Already correct — NHRA Tech Services / NHRATS / #262E87 |
| `vite.config.ts` PWA manifest | Already correct — NHRA Tech Services / NHRATS |

**Icon files left unchanged** (all already use NHRA branding from prior work):
- `public/favicon.ico`, `public/favicon-16x16.png`, `public/favicon-32x32.png`
- `public/apple-touch-icon.png`
- `public/android-chrome-192x192.png`, `public/android-chrome-512x512.png`
- `public/pwa-192x192.png`, `public/pwa-512x512.png`

**RSA icon files left in place** (not deleted — safe to remove later if desired):
- `public/rsa-icon.png`
- `public/rsa-logo.png`

---

## RSA User-Facing References Fixed

| File | Change |
|------|--------|
| `src/shared/components/MatchMyTimes.tsx:324` | "RSA will automatically adjust" → "The simulator will automatically adjust" |
| `public/manifest.webmanifest` | Full rebrand (see above) |
| `src/pages/Landing.tsx` | Full rewrite (see above) |

### RSA References Intentionally Left in Code (Internal Only)

| File | Type | Reason |
|------|------|--------|
| `src/shared/utils/chartScaling.ts` | Code comment: "VB6 RSALIB.bas" | Internal math library reference |
| `src/shared/utils/vb6DatParser.ts` | Code comment: "Quarter Jr/Pro .DAT files" | Internal parser docs |
| `src/shared/state/userLevel.ts` | Code values: `quarterJr`, `quarterPro` | Internal enum/tier identifiers |
| `src/shared/components/FieldHelp.tsx` | Comments: "RSA manuals", "RSA pattern" | Internal doc reference |
| `src/shared/components/VehicleEditorUnified.tsx` | Alert: "Pro subscription required" | In blocked RSA page |
| `src/shared/components/CapabilityRoute.tsx` | Message: "ET Simulator requires..." | In blocked RSA route guard |
| `src/domain/ui/publicSurface.ts` | `INTERNAL_ROUTES` keys: `/dial-in`, `/tech-card`, etc. | Internal route registry |
| `src/dev/panels/AuditSnapshot.tsx` | Label: "ET Sim (et_sim)" | Internal dev panel |
| `src/dev/panels/ParityRunner.tsx` | Comment: "Quarter Pro/Jr targets" | Internal benchmark tool |
| `public/rsa-icon.png`, `public/rsa-logo.png` | Static files | Not referenced in manifests; left for safety |

---

## Tests Added / Updated

| File | Tests | Status |
|------|-------|--------|
| `src/app/__tests__/shellCleanup.test.tsx` | **37 new** | ✅ All passing |
| `src/app/__tests__/landingPublic.test.tsx` | Updated 4 | ✅ All passing |
| `src/app/__tests__/notFoundRouting.test.tsx` | Updated → 8 tests | ✅ All passing |
| `src/pages/__tests__/nhratsHome.test.tsx` | 9 (unchanged) | ✅ All passing |
| `src/pages/__tests__/nhratsNotFound.test.tsx` | 6 (unchanged) | ✅ All passing |
| `src/app/__tests__/hamburgerMenu.test.tsx` | 3 (unchanged) | ✅ All passing |
| `src/domain/rules/__tests__/committeesApi.test.ts` | 22 (unchanged) | ✅ All passing |
| `src/domain/config/__tests__/accessEnforcement.test.ts` | 67 (unchanged) | ✅ All passing |

**Pre-existing failures (not caused by this sprint):**
- `src/pages/__tests__/parityDashboards.test.ts`: 6 failures — confirmed pre-existing before this sprint

---

## Safety Verification

| Check | Status |
|-------|--------|
| Parity math untouched | ✅ |
| Weather correction untouched | ✅ |
| Combo resolution untouched | ✅ |
| Parity DB tables untouched | ✅ |
| No migrations run | ✅ |
| `api/config.php` unchanged | ✅ |
| No secrets committed | ✅ |
| No sample data added | ✅ |
| `rsa_token`/localStorage unchanged | ✅ |
| No Phase 3D work started | ✅ |

---

## Production Verification Checklist

After deploy completes:

- [ ] `/` loads NHRATS home with no RSA/Simulator/Vehicle references
- [ ] `/rules` loads without console 500s
- [ ] `/rules/committees` loads without console 500s
- [ ] `/parity` works when authenticated
- [ ] `/vehicles` → NotFound (no RSA vehicles page)
- [ ] `/et-sim` → NotFound
- [ ] `/engine-sim` → NotFound
- [ ] Favicon in browser tab uses NHRA branding
- [ ] PWA install metadata uses NHRA name/icon
- [ ] `api/config.php` preserved

---

## NHRATS Shell Cleanup Complete?

**YES — Shell cleanup is complete.**

All RSA-specific routes are blocked, navigation shows only NHRA tools, the landing page is NHRATS-branded, the manifest is corrected, and test coverage covers all blocked routes and nav changes. RSA page/component files are preserved in the repo per safety rules.

---

*Generated: May 13, 2026*
