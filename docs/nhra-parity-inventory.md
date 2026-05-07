# NHRA Parity System — Technical Inventory
_Last updated: 2026-05-07 | Status: authoritative reference, do not edit without parity testing_

---

## 1. Frontend Routes

| Route | Component | Guard | Notes |
|---|---|---|---|
| `/parity` | `src/pages/ParityPortal.tsx` | `CapabilityRoute requireCap="nhra.parity"` | Main parity dashboard |
| `/parity/idr` | `src/pages/ParityIdrViewer.tsx` | `CapabilityRoute requireCap="nhra.parity"` | IDR data viewer |
| `/parity/analysis/:incidentId` | `src/pages/IncidentAnalysis.tsx` | `CapabilityRoute requireCap="incidents.read"` | Run incident analysis |
| `/tech` | `src/pages/TechMasterShell.tsx` | `CapabilityRoute requireCap="nhra.tech.read"` | Tech Master shell |

### NHRA User Route Guard
`NHRA_ALLOWED_PREFIXES = ['/parity', '/account', '/login', '/help']`  
Users with `plan === 'nhra'` are blocked from all other routes and redirected to `/parity`.  
**This list must be expanded as new NHRATS modules are added.**

---

## 2. Parity Frontend Pages / Components

### Primary Pages
- `src/pages/ParityPortal.tsx` — Main parity shell; manages event selection, tabs, report state
- `src/pages/ParityReport.tsx` — Detailed event parity report (corrected/raw/combo views)
- `src/pages/ParityDashPanel.tsx` — Dashboard summary panel
- `src/pages/MultiEventParityPanel.tsx` — Cross-event parity matrix
- `src/pages/IncrementalComparisonPanel.tsx` — Side-by-side incremental comparison
- `src/pages/ParityIdrViewer.tsx` — IDR/run-level data viewer
- `src/pages/AnomaliesPanel.tsx` — Anomaly detection / outlier analysis
- `src/pages/BatchBackfillPanel.tsx` — Admin: weather/run backfill jobs
- `src/pages/TrackCoordCoveragePanel.tsx` — Admin: track coordinate coverage
- `src/pages/Events.tsx` — Event catalog admin

### Tech Master Pages
- `src/pages/TechMasterShell.tsx` — Shell/tab container
- `src/pages/tech/EventEntriesPanel.tsx`
- `src/pages/tech/AddEntryForm.tsx`
- `src/pages/tech/EntryDetailDrawer.tsx`
- `src/pages/tech/EntryDossierPanel.tsx`
- `src/pages/tech/RosterImportModal.tsx`
- `src/pages/tech/ScaleWorkspacePanel.tsx`
- `src/pages/tech/FuelWorkspacePanel.tsx`
- `src/pages/tech/InspectionWorkspacePanel.tsx`
- `src/pages/tech/TechCardWorkspacePanel.tsx`
- `src/pages/tech/TeardownWorkspacePanel.tsx`
- `src/pages/tech/FindingsAggregationPanel.tsx`
- `src/pages/tech/EventComplianceDashboard.tsx`
- `src/pages/tech/LinkReviewPanel.tsx`
- `src/pages/tech/TechAdminPanel.tsx`

### Incident Pages
- `src/pages/IncidentAnalysis.tsx` — Run incident analysis workspace
- `src/pages/IncidentDrawer.tsx` — Incident side-drawer

### Parity Components / Utilities
- `src/components/parity/AssignmentPanel.tsx` — Engine/body combo assignment UI
- `src/components/parity/assignmentUtils.ts` — Combo assignment helpers
- `src/domain/parity/weatherCorrection.ts` — **DO NOT TOUCH** — client correction math
- `src/domain/parity/correctRunClient.ts` — Client-side per-run correction
- `src/domain/parity/format.ts` — Display formatting helpers
- `src/domain/parity/nhraMapper.ts` — OData field mapping
- `src/domain/parity/eventImport.ts` — Event import helpers
- `src/domain/parity/resolveDefaultEvent.ts` — Default event resolution logic
- `src/domain/parity/qualSheet.ts` — Qual sheet utilities
- `src/domain/parity/laneUtils.ts` — Lane display/sorting
- `src/domain/parity/anomalyEngine.ts` — Client anomaly engine
- `src/domain/parity/eventRange.ts` — Event date range helpers
- `src/domain/parity/useAutoRefresh.ts` — Auto-refresh hook
- `src/domain/parity/useClassPreset.ts` — Class preset hook
- `src/domain/parity/totalAvgFilter.ts` — Aggregate filter logic
- `src/domain/parity/weatherBackfill.ts` — Backfill coordination
- `src/domain/parity/formatLocalTime.ts` — Local-time display
- `src/domain/parity/timelineInsert.ts` — Timeline insert helpers

---

## 3. Services / API Client

### Primary API Clients
- `src/services/parityApi.ts` (3,169 lines) — All parity endpoint wrappers + types
- `src/services/parityPdf.ts` — Client-side PDF export (jsPDF + jspdf-autotable)
- `src/services/techMasterApi.ts` — Tech Master endpoint wrappers
- `src/services/incidentsApi.ts` — Incidents endpoint wrappers
- `src/services/incidentAnalysisApi.ts` — Incident analysis endpoint wrappers
- `src/services/api.ts` — Base API fetch utility; `API_BASE = '/api'` (Vite proxy → nhratechservices.com)

### API Base URL Strategy
- Dev: Vite proxy `/api` → `https://nhratechservices.com` (configurable via `VITE_API_BASE_URL`)
- Prod: relative `/api` path — same-domain PHP backend at `public_html/api/`
- **No hardcoded domain in parity service files** ✓

---

## 4. Backend PHP Endpoints

### Core Parity — `api/parity.php` (14,181 lines)
All actions require `nhra.parity` capability.

**Run Ingestion**
- `ingest` — Fetch & ingest runs from NHRA OData feed
- `ingestMany` — Batch ingest across multiple race lookups
- `ingestEventRuns` — Ingest for a specific event
- `refreshEventData` — Full refresh (runs + weather) for an event
- `refreshTimingOnly` — Runs-only refresh
- `refreshWeather` — Weather-only refresh
- `purgeEventRuns` — Delete all runs for a race_lookup

**Run Queries**
- `runs` — Query normalized parity runs (filterable by year/event/class/driver)
- `runsWithWeather` — Runs joined to nearest canonical weather
- `topByEvent` / `topByTrack` — Top-performance aggregates
- `eventSummary` — Per-event summary stats
- `drivers` — Driver list with stats
- `runsByDriver` — All runs for a driver
- `parityAllRuns` — Full run list for an event
- `parityQualOrder` — Qualifying order
- `updateRun` — Admin: edit individual run fields

**Parity Reports**
- `parityByCombo` — **Core report** — per-combo corrected/raw stats
- `paritySummary` — Class-level parity summary
- `parityDeltas` — Delta analysis across events
- `parityIncrementals` — Incremental segment breakdowns
- `paritySessionWeather` — Session weather overlay
- `rangeParityMatrix` — Cross-event range matrix
- `multiEventParity` — Multi-event comparative parity
- `eventOutlierAnalysis` — Statistical outlier detection
- `anomalyAnalysis` / `anomalyDetail` — Anomaly scoring

**Weather**
- `createTrack` / `tracks` / `updateTrack` / `mergeTracks` / `listTracksWithStats`
- `createEvent` / `events` / `updateEvent` / `eventCatalog` / `upsertEventCatalog`
- `weatherBackfill` — Backfill Tempest for event/date range
- `weatherBuildCanonical` — Build canonical weather from samples
- `weatherSamples` / `weatherCanonical` — Read weather data
- `weatherCoverage` / `weatherHealthBackfill` / `weatherHealthRebuild`
- `weatherTimeseries` — Weather chart data
- `tempestCurrentWeather` — Live Tempest reading
- `weatherForecast` — Forecast data
- `backfillEventWeather` / `batchWeatherBackfill`
- `importStationCsv` — Import historical station CSV

**Combo Assignment**
- `listEngineCombos` / `upsertEngineCombo` / `deleteEngineCombo`
- `listDriverCombos` / `upsertDriverCombo` / `deleteDriverCombo`
- `bulkUpsertDriverCombos` / `driversAtEvent`
- `listBodyStyles` / `upsertBodyStyle` / `deleteBodyStyle`
- `listDriverBodyStyles` / `upsertDriverBodyStyle` / `deleteDriverBodyStyle`
- `listClassAliases` / `addClassAlias` / `deleteClassAlias`
- `listClassDefaults` / `upsertClassDefault` / `deleteClassDefault`

**Admin / Backfill**
- `startBackfillRuns` / `startBackfillWeather` / `resumeBackfill` / `cancelBackfill` / `backfillStatus` / `backfillJobs`
- `backfillRunUtcFromLocal` / `backfillWeatherCsv` / `backfillWeatherProvider`
- `flagRun` / `unflagRun` / `runFlags`
- `slopeAnalysis` / `updateTrackCoords` / `bulkUpdateTrackCoords` / `trackCoordCoverage`
- `suggestRaceLookups` / `probeOData` / `peek` / `imports`
- `paritySmokeTest` / `timeSmokeTest` / `timeDiagnosticsSample`
- `performancePrediction` / `rtAnalysis`
- `ladder` / `qualSheet`
- `eventsWithStats` / `eventCategories` / `eventParitySummary`
- `listOrphanRuns` / `scrapeNhraSchedule` / `bulkCreateEvents`

### Other NHRA/Tech Backend Files
- `api/parity_weather_provider.php` — Tempest + Open-Meteo provider abstraction
- `api/tm-identities.php` — Persons, orgs, vehicles, components CRUD + matching
- `api/tm-events.php` — Event instances CRUD
- `api/tm-entries.php` — Event entries CRUD, roster import
- `api/tm-techcases.php` — Tech cases, findings, attachments CRUD
- `api/tm-scale.php` — Scale records + rules (10 actions)
- `api/tm-fuel.php` — Fuel records + rules
- `api/tm-inspection.php` — Inspection templates + records
- `api/tm-techcard.php` — Tech card declarations + artifacts
- `api/tm-teardown.php` — Teardown records
- `api/tm-dossier.php` — Entry dossier (composite view)
- `api/tm-admin.php` — Module config, finding status history
- `api/incidents.php` — Run incidents CRUD
- `api/incident-analysis.php` — Incident analysis sessions, datasets, channels

### Supporting Files
- `api/auth.php` — JWT auth: login, register, refresh, logout
- `api/capabilities-endpoint.php` — Capabilities endpoint
- `api/users.php` — User management
- `api/admin.php` — Admin tools
- `api/functions.php` — Shared helpers (`rsa_requireAuth`, `rsa_setCorsHeaders`, `rsa_jsonResponse`, etc.)
- `api/lib/capabilities.php` — Server-side capability enforcement + PLAN_CAPABILITIES map
- `api/lib/parity.php` — Shared parity library functions
- `api/config.php` — DB credentials, JWT secret, FRONTEND_URL, ALLOWED_ORIGIN

---

## 5. Database Tables

### Core Auth / Users (shared with all features)
| Table | Purpose |
|---|---|
| `users` | User accounts |
| `subscriptions` | Plan/subscription records |
| `user_capabilities` | Override capabilities (admin grants) |
| `webhook_events` | Webhook log |
| `audit_log` | Audit trail |
| `feature_flags` | Feature flag overrides |
| `password_resets` | Password reset tokens |

### Parity Tables (**DO NOT ALTER WITHOUT APPROVAL**)
| Table | Purpose | Migration |
|---|---|---|
| `parity_runs` | Normalized run data (primary table) | v6-parity |
| `parity_runs_raw` | Raw ingested rows (dedup source) | v6-parity |
| `parity_run_imports` | Import history | v6-parity |
| `parity_tracks` | Track definitions + coordinates | v6c-parity-weather |
| `parity_events` | Event catalog (name, track, dates) | v6c-parity-weather |
| `parity_weather_samples` | Raw weather samples per event | v6c-parity-weather |
| `parity_weather_canonical` | 30-min canonical weather buckets | v6c-parity-weather |
| `parity_engine_combos` | Engine combo definitions | v11-parity-combos |
| `parity_driver_combos` | Driver→combo timeline assignments | v11-parity-combos |
| `parity_class_aliases` | Class index aliases (PS→PRO, etc.) | v6c-parity-class-aliases |
| `parity_class_defaults` | Default engine combo per class | v12-class-defaults |
| `parity_body_styles` | Body style definitions | v30-body-styles |
| `parity_driver_body_styles` | Driver→body style timeline | v30-body-styles |

### Tech Master Tables
| Table | Purpose | Migration |
|---|---|---|
| `seasons` | Season definitions | v17 |
| `event_types` | Event type catalog | v17 |
| `event_instances` | Concrete events (bridged to parity_events) | v18 |
| `persons` | Identity: people | v19 |
| `organizations` | Identity: orgs/teams | v19 |
| `vehicle_assets` | Identity: vehicles | v19 |
| `components` | Identity: components | v19 |
| `event_entries` | Entry roster per event | v20 |
| `event_entry_changes` | Entry change history | v20 |
| `org_memberships` | Person↔org associations | v20 |
| `vehicle_org_assignments` | Vehicle↔org assignments | v20 |
| `tech_cases` | Tech inspection cases | v21 |
| `tech_findings` | Findings within cases | v21 |
| `tech_attachments` | File attachments (polymorphic) | v21 |
| `scale_records` | Scale measurement records | v23 |
| `scale_rules` | Minimum weight rules per class | v23 |
| `fuel_records` | Fuel sample records | v25 |
| `fuel_rules` | Fuel compliance rules | v25 |
| `inspection_templates` | Inspection checklist templates | v26 |
| `inspection_template_items` | Template line items | v26 |
| `inspection_records` | Inspection session records | v26 |
| `inspection_responses` | Per-item responses | v26 |
| `techcard_declarations` | Tech card form declarations | v27 |
| `techcard_declaration_fields` | Fields per declaration | v27 |
| `techcard_artifacts` | Tech card PDF artifacts | v27 |
| `teardown_templates` | Teardown checklist templates | v28 |
| `teardown_template_items` | Template line items | v28 |
| `teardown_records` | Teardown inspection sessions | v28 |
| `teardown_observed_items` | Observed items per teardown | v28 |
| `entry_holds` | Entry holds/flags | v30 |
| `finding_status_history` | Finding status audit trail | v29 |
| `required_module_config` | Per-module required config | v29 |
| `run_incidents` | Run-level incidents/flags | v15 |
| `incident_analysis_sessions` | Analysis sessions | v16 |
| `incident_analysis_datasets` | Datasets per session | v16 |
| `incident_analysis_channels` | Data channels | v16 |
| `incident_analysis_videos` | Video references | v16 |
| `incident_analysis_measurements` | Measurements | v16 |

---

## 6. Auth / Capability System

### Capability Definitions (NHRA-specific)
```
nhra.parity          View NHRA parity dashboards (view-only)
nhra.parity.admin    Parity admin: ingest, backfill, manage data
nhra.tech.read       View Tech Master data
nhra.tech.admin      Tech Master admin: create/edit
incidents.read       Read incidents
incidents.create     Create incidents
incidents.edit.own   Edit own incidents
incidents.edit.all   Edit all incidents (owner/admin only)
```

### Plan Grants
- `nhra` plan → `nhra.parity`, `nhra.tech.read`, `nhra.tech.admin`, `incidents.read`, `incidents.create`, `incidents.edit.own`
- `owner` role → all of the above + `nhra.parity.admin`, `incidents.edit.all`
- `admin` role → same as owner for NHRA capabilities

### Key Files
- Client: `src/domain/config/capabilities.ts` — `PLAN_CAPABILITIES` map, `Capability` union type
- Server: `api/lib/capabilities.php` — `PLAN_CAPABILITIES` PHP array (must stay in sync)
- Drift test: `src/domain/config/__tests__/tierContractDrift.test.ts` — catches client/server desync
- Gate component: `src/shared/components/CapabilityRoute.tsx`
- Auth hook: `src/shared/state/preferences.tsx` (reads `rsa_token` from localStorage)

### Session Storage Keys (currently `rsa_*` prefix)
```
rsa_token              JWT auth token — MUST NOT CHANGE while users are active
rsa.auth.currentUser   Current user object
rsa.auth.apiProducts   Product/capability cache
```
> ⚠️ These keys were inherited from RSA. Renaming them requires a coordinated migration (read old key → write new key → delete old key) to avoid logging out all active users.

---

## 7. Weather Correction Architecture

### Standard Conditions
```
PARITY_STD_TEMP_F     = 60.0 °F
PARITY_STD_PRESS_INHG = 29.92 inHg
PARITY_STD_RH_PCT     = 0.0 %
PARITY_CORRECTION_MODEL_VERSION = 'v1-density-ratio'
```

### Correction Formula
```
correction_factor = air_density(actual) / air_density(standard)
corrected_et = actual_et × correction_factor
```
Denser air → smaller factor → faster (lower) corrected ET.

### Weather Data Pipeline
1. **Tempest station** pulls raw samples → `parity_weather_samples`
2. **Open-Meteo** fallback when Tempest unavailable
3. `weatherBuildCanonical` aggregates samples into 30-min buckets → `parity_weather_canonical`
4. Each run is joined to the nearest canonical bucket by `run_timestamp_utc`
5. Correction factor computed inline per run when building parity reports

### Critical Functions
- `parity_correctionFactor(tempF, pressInhg, rhPct)` in `api/parity.php` (line ~3635) — **DO NOT MODIFY**
- `weatherCorrection.ts` in `src/domain/parity/` — client mirror — **DO NOT MODIFY**
- Qualifying rounds: intentionally kept raw (uncorrected) in qual sheet report

---

## 8. Combo Assignment Architecture

### Tables
- `parity_engine_combos` — define engine combinations (name, category, class_index)
- `parity_driver_combos` — timeline: `driver_name + class_index → engine_combo_id + effective_from_utc + effective_to_utc`
- `parity_class_defaults` — fallback combo if no driver-specific assignment
- `parity_class_aliases` — expand class aliases before lookups (e.g., PS → PRO)

### Resolution Logic (`resolveComboForRun()` in parity.php ~line 9667)
1. Expand class_index via `parity_expandClassIndex()` (alias lookup)
2. Find driver_combo where `driver_name` matches AND `run_timestamp_utc` falls within `effective_from_utc`/`effective_to_utc`
3. If no driver-specific combo, fall back to `parity_class_defaults` for the class
4. If no class default, combo is `null` (unassigned)

**Timeline**: A driver can have multiple combo entries over time (e.g., switched engine combos mid-season). The effective dates enforce which combo applies to each run.

---

## 9. PDF Export Architecture

**Location**: `src/services/parityPdf.ts`  
**Libraries**: jsPDF + jspdf-autotable  
**Rendering**: Client-side only — no server PDF generation

### Report Types
| Function | Output File |
|---|---|
| `exportQualSheetPdf()` | `NHRA_QualSheet_{event}_{date}.pdf` |
| `exportLadderPdf()` | `NHRA_Ladder_{event}_{date}.pdf` |
| `exportParitySummaryPdf()` | `NHRA_ParitySummary_{event}_{date}.pdf` |
| `exportEventParityReportPdf()` | `NHRA_EventParityReport_{event}_{date}.pdf` |

Charts are captured from live SVG DOM elements via Canvas → PNG and embedded in the PDF.  
**Header color**: `[30, 58, 95]` (dark blue — predates the NHRA theme token system)

---

## 10. RSA-Specific Items NOT Needed on NHRATS

These exist in the NHRATS codebase (as a full copy of RSA) but are **not part of the NHRA product** and should eventually be hidden/removed:

| Item | Route/File | Reason |
|---|---|---|
| ET Sim / Quarter Pro | `/et-sim`, `/predict` | RSA personal racing tool |
| Engine Sim / Engine Pro | `/engine-sim`, `/engine-pro` | RSA personal tool |
| Clutch Sim / Converter Sim | `/clutch-sim`, `/converter-sim` | RSA personal tool |
| Suspension Sim | `/suspension-sim` | RSA personal tool |
| Run Log / History | `/log`, `/history` | Personal run logging |
| Dial-In | `/dial-in` | Personal racing tool |
| Opponents | `/opponents` | Personal racing tool |
| Race Day | `/race-day` | Personal racing tool |
| Data Import | `/import` | Personal run import |
| Tech Card (personal) | `/tech-card` | RSA personal tool |
| Ladder (personal) | `/ladder` | RSA personal tool |
| Team Hub | `/team`, `/parts`, `/events`, `/maintenance`, `/expenses` | RSA team management |
| Pricing | `/pricing` | No Stripe on NHRATS |
| Vehicles | `/vehicles` | RSA simulation vehicles |
| Stripe/billing | `api/stripe.php`, `api/stripe-webhook.php` | No Stripe on NHRATS |
| Engine library | `api/engines.php`, `api/engine_sims.php` | RSA personal tool |

**Do not delete any of the above yet** — removal should be a planned, tested phase after all NHRA paths are verified stable.
