# NHRA Tech Services — Master Plan
_Last updated: 2026-05-07 | Primary planning document for nhratechservices.com_

---

## What We're Building

**nhratechservices.com** is the long-term NHRA Technical Services operating system. It will serve as the authoritative internal platform for every aspect of NHRA technical administration:

- Parity tracking and performance analysis
- Rules, rule history, and rule change management
- Rules committees, membership, meetings, decisions, and action items
- Technical bulletins, competition bulletins, and interpretations
- Technical inspection (Tech Master)
- SOAAPs, DQs, violations, appeals, and penalty history
- Parts and component approvals (including Box/3D file references)
- Incident review and investigation
- Inspection and checklist management
- Data analysis and performance reporting
- Institutional history — searchable across all of the above

---

## Current State (May 2026)

### ✅ What's Working Right Now
- Full NHRA parity system is live on nhratechservices.com
- Tech Master (event entries, scale, fuel, inspection, teardown, tech cases) is live
- Incident analysis workspace is live
- NHRA branding is applied (tokens, logo, header, footer, pages)
- Auth and capability system is working with `nhra` plan users
- NHRA users are correctly gated to parity/tech routes only
- Build and deployment pipeline is working (GitHub Actions → SiteGround FTP)

### 🟡 Present But Not Yet Cleaned Up
- RSA simulation tools (ET sim, engine sim, etc.) still exist in codebase — not shown to NHRA users but not yet removed
- Stripe/billing infrastructure still present — should be archived
- `rsa_token`, `rsa.auth.currentUser` localStorage keys — still using legacy RSA names
- Personal racing tools (run log, dial-in, opponents) — still in codebase

### 🔴 Not Yet Built
- Rules & Governance module
- Cases & Violations module
- Parts & Approvals module
- Files registry
- Committee Meetings workflow
- Publications library

---

## Architecture Overview

### Stack
```
Frontend:   Vite + React + TypeScript
Routing:    React Router v6
Styling:    CSS custom properties (tokens.css) — NHRA color palette applied
Auth:       JWT (PHP-issued) stored in localStorage as rsa_token
State:      Zustand + React context
Build:      Vite → SiteGround /public_html
Deploy:     GitHub Actions → SiteGround FTP
```

### Backend
```
Language:   PHP 8+
DB:         MySQL 8 on SiteGround
Auth:       JWT (HS256) — NHRATS secret differs from RSA
CORS:       Enforced: ALLOWED_ORIGIN = nhratechservices.com
API path:   /api/*.php (same-domain, no separate subdomain)
```

### File Structure
```
/                        Vite SPA (React)
/api/                    PHP endpoints
  parity.php             14,181 lines — all parity actions
  parity_weather_provider.php
  tm-*.php               Tech Master endpoints
  incidents.php / incident-analysis.php
  auth.php / users.php / admin.php / capabilities-endpoint.php
  migrate-v*.php         Migration scripts (run manually)
  lib/capabilities.php   Server-side capability map
  lib/parity.php         Shared parity helpers
/src/
  app/App.tsx            Routes, shell, auth guard
  pages/                 All pages (parity, tech, admin, etc.)
  components/parity/     Parity-specific UI components
  domain/parity/         Parity business logic (correction, combos, formatting)
  domain/config/capabilities.ts  Client capability map (MUST sync with PHP)
  services/parityApi.ts  All parity API calls + types
  services/parityPdf.ts  Client-side PDF export
  services/techMasterApi.ts
  shared/components/CapabilityRoute.tsx
  shared/ui/tokens.css   NHRA color variables
/public/
  nhra-header-logo.png   Primary logo
  site.webmanifest       PWA manifest
/docs/                   ← This documentation directory
```

---

## Parity Architecture (Summary — Full Detail in nhra-parity-inventory.md)

### How a Parity Report Is Generated
```
1. NHRA OData feed → parity.php?action=ingest → parity_runs_raw + parity_runs
2. parity_runs joined to parity_weather_canonical (nearest 30-min bucket)
3. parity_correctionFactor(tempF, pressInhg, rhPct) applied per run
4. corrected_et = actual_et × correction_factor
5. resolveComboForRun() maps driver+class → engine_combo by timeline effective date
6. Reports aggregate by combo, event, driver
7. PDF export: client-side jsPDF from live DOM data
```

### Key Invariants (Must Never Change)
- `PARITY_CORRECTION_MODEL_VERSION = 'v1-density-ratio'` — bump before any formula change
- Qualifying rounds are always raw (no correction applied)
- `parity_runs` table is append-only for historical integrity
- Combo timeline uses `effective_from_utc` + `effective_to_utc` — never edit in place
- `rsa_requireAuthAndCap($pdo, $auth, 'nhra.parity')` on every parity endpoint

---

## Capability System (Summary — Full Detail in nhra-parity-inventory.md)

```
Plan: nhra
  Grants: nhra.parity, nhra.tech.read, nhra.tech.admin,
          incidents.read, incidents.create, incidents.edit.own

Role: owner / admin
  Grants: everything above + nhra.parity.admin, incidents.edit.all

Client: src/domain/config/capabilities.ts
Server: api/lib/capabilities.php
Drift test: src/domain/config/__tests__/tierContractDrift.test.ts
```

**Critical rule:** Every new module capability must be added to BOTH files simultaneously.  
**Critical rule:** Every new module route must be added to `NHRA_ALLOWED_PREFIXES` in `App.tsx`.

---

## Migration Safety Rules

Full detail in `docs/nhra-migration-risk-map.md`. Short version:

1. **Never modify** `parity_correctionFactor()` without versioning and full regression
2. **Never modify** `resolveComboForRun()` without combo regression
3. **Never modify** `parity_runs` schema destructively (additive only)
4. **Never rename** `rsa_token` without a coordinated migration
5. **Never desync** `capabilities.php` ↔ `capabilities.ts`
6. **Always add** new module routes to `NHRA_ALLOWED_PREFIXES`
7. **Always add** the auth gate to new PHP endpoints
8. **Always run** the parity protection checklist before deploying parity-adjacent changes

---

## Recommended Migration Sequence

### Phase 0 — Already Complete ✓
- RSA codebase forked to NHRATS
- NHRA branding applied (tokens, logo, header, footer, pages)
- NHRATS deployed at nhratechservices.com
- Separate DB and JWT secret from RSA

### Phase 1 — Stability & Documentation (Current Sprint)
- [x] Create all inventory and planning docs (this sprint)
- [ ] Run full parity protection checklist against prod, document baseline
- [ ] Confirm DB schema matches latest migrations
- [ ] Identify any production data issues

### Phase 2 — Safe Cleanup
- [ ] Add new module route prefixes to `NHRA_ALLOWED_PREFIXES` (as they're built)
- [ ] Remove or hide RSA nav links for NHRA users (without deleting code)
- [ ] Archive Stripe endpoints (keep files, disable routes)
- [ ] Run parity smoke test after each nav change

### Phase 3 — Rules & Governance Phase A (Read-Only Rulebook)
- [ ] Add `rules`, `rule_versions` tables (additive migration)
- [ ] Seed rules data (import from existing rulebook)
- [ ] Build `/rules` browse page + `/rules/:id` detail page
- [ ] Add `rules.read` / `rules.admin` capabilities to capability maps
- [ ] Add `/rules` to `NHRA_ALLOWED_PREFIXES`

### Phase 4 — Cases & Violations MVP
- [ ] Add `cases`, `case_events`, `case_status_history` tables
- [ ] Build `/cases` list + `/cases/:id` detail
- [ ] Link cases to persons, orgs, event entries
- [ ] Add `cases.read` / `cases.create` / `cases.admin` capabilities

### Phase 5 — Rules Committees & Meetings
- [ ] Add `rules_committees`, `committee_memberships` tables
- [ ] Add `committee_meetings`, attendees, decisions, action items tables
- [ ] Build committee browse + meeting pages

### Phase 6 — Publications Library
- [ ] Add `publications`, `publication_items` tables
- [ ] Build publication browse + publish workflow

### Phase 7 — Parts & Approvals
- [ ] Add `parts`, `part_approvals` tables
- [ ] Build parts registry + approval workflow
- [ ] Claim `/parts-registry` route (reclaim from TeamHub stub)

### Phase 8 — Files Registry
- [ ] Add `files`, `file_links` tables
- [ ] Build file registry UI
- [ ] Integrate Box reference links

### Phase 9 — Cross-Module Linking
- [ ] Add `entity_links` table
- [ ] Wire: case → parity run, rule → bulletin, incident → case

### Phase 10 — RSA Code Removal
- [ ] Remove simulation tools (one at a time, verify parity after each)
- [ ] Remove personal racing tools
- [ ] Remove Stripe files

### Phase 11 — localStorage Key Migration
- [ ] Migrate `rsa_token` → `nhrats_token` with backward-compat read/fallback
- [ ] Migrate `rsa.auth.*` keys
- [ ] Coordinate with all active NHRA users

---

## Questions / Assumptions That Need Clarification

| # | Question | Default Assumption |
|---|---|---|
| 1 | Should NHRATS share a DB with RSA, or stay fully separate? | **Assumed separate** — different MySQL databases on SiteGround |
| 2 | Is the NHRA rules content (rule text) already in a structured format, or does it need to be imported from documents? | Assumed document import required (Word/PDF → rule rows) |
| 3 | Is Box.com the intended file storage for 3D/STEP files and tech bulletins? | Assumed yes — file registry will reference Box file IDs |
| 4 | Are there email/notification requirements (e.g., notify on case status change)? | Not planned in Phase 1 — add when email infra is confirmed |
| 5 | Should rule change requests be visible to all NHRA users or only admin/committee members? | Assumed admin/committee only — add `rules.admin` gate |
| 6 | Will nhratechservices.com eventually need public-facing pages (e.g., published bulletins)? | TBD — current design is fully authenticated |
| 7 | Is there an existing person/organization directory to import into `persons`/`organizations`? | Assumed manual entry initially; import script later |
| 8 | What's the desired behavior for NHRA users who don't have `nhra.tech.read`? | Currently: Tech Master hidden, no nav item shown |
| 9 | Should the Parity portal eventually support multiple sanctioning bodies (not just NHRA)? | Assumed NHRA-only for now — schema supports multi-org via category fields |
| 10 | Will SSO/SAML/OAuth with NHRA's internal identity provider be required? | Not in scope for current phase — JWT auth is sufficient |

---

## First Implementation Step (After This Documentation Pass)

**Recommended: Run the full parity protection checklist against production.**

1. Log into nhratechservices.com as an NHRA-plan user
2. Walk through every section of `docs/nhra-parity-protection-checklist.md`
3. Document baseline DB row counts for parity tables
4. Verify `PARITY_CORRECTION_MODEL_VERSION` matches `api/parity.php`
5. Save a dated copy of the completed checklist

Once baseline is confirmed, Phase 2 (safe cleanup) can begin with confidence.

---

## Documents in This Series

| Document | Purpose |
|---|---|
| `docs/nhra-tech-services-master-plan.md` | **This file** — overall plan and sequence |
| `docs/nhra-parity-inventory.md` | Complete inventory of all parity code, endpoints, tables |
| `docs/nhra-migration-risk-map.md` | Risk levels for every touchable area + migration sequence |
| `docs/nhra-parity-protection-checklist.md` | Pre-migration verification checklist — run before any parity-adjacent change |
| `docs/nhra-future-data-model.md` | Proposed schema for all future modules with full DDL |
| `docs/nhra-module-roadmap.md` | Module-by-module product roadmap, capability matrix, RSA removal schedule |
