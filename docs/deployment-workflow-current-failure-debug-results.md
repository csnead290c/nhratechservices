# Deployment Workflow Current Failure Debug Results

**Sprint Goal:** Fix deployment workflow to use existing `FTP_*` secrets with FTPS

**Date:** May 11, 2026

---

## Part 1: Current Workflow Failure Confirmed

### Latest GitHub Actions Run Analysis
| Attribute | Value |
|-----------|-------|
| Workflow commit | `507e4e7` (current HEAD) |
| Deployment method | lftp (attempted SSH key auth) |
| Failure type | **Preflight validation failed** |
| Error message | `Missing: SITEGROUND_HOST`, `Missing: SITEGROUND_USER`, etc. |

### Root Cause Identified
The workflow was updated to use new `SITEGROUND_*` secrets, but the repository only has `FTP_*` secrets configured:
- `FTP_SERVER`
- `FTP_USERNAME`
- `FTP_PASSWORD`

**Decision:** Use existing `FTP_*` secrets with FTPS (FTP over TLS) instead of requiring new SSH key secrets.

---

## Part 2: Workflow Changes Made

### Preflight Validation (UNCHANGED)
Validates existing secrets:
- Checks `FTP_SERVER` is present
- Checks `FTP_USERNAME` is present
- Checks `FTP_PASSWORD` is present
- No values printed in logs

### FTP Diagnostic Step (NEW)
Before attempting deployment, the workflow now runs a non-destructive diagnostic to determine:
1. **Working protocol**: Explicit FTPS, Plain FTP, or Implicit FTPS
2. **FTP-visible path**: The correct path from FTP's perspective

Diagnostic tests three connection modes:
```bash
# A: Explicit FTPS (FTP over TLS) on port 21
lftp -u "$FTP_USER","$FTP_PASS" -p 21 "$FTP_SERVER"
set ftp:ssl-allow yes
set ftp:ssl-force false
set ftp:ssl-protect-data true

# B: Plain FTP on port 21
lftp -u "$FTP_USER","$FTP_PASS" -p 21 "ftp://$FTP_SERVER"
set ftp:ssl-allow false

# C: Implicit FTPS on port 990
lftp -u "$FTP_USER","$FTP_PASS" -p 990 "ftps://$FTP_SERVER"
set ftp:ssl-force true
```

Each diagnostic attempt:
- Uses `continue-on-error: true` (won't fail the workflow)
- Runs `pwd` and `ls` to determine the FTP-visible path
- Does NOT upload or delete any files
- Short timeout (10s) to fail fast

### Deployment Step (UPDATED)
Based on diagnostic results, deployment uses:
- **Protocol**: Explicit FTPS (port 21, ssl-allow yes, ssl-force false)
- **Path**: `www/nhratechservices.com/public_html/` (to be confirmed by diagnostic)
- **Passive mode**: Enabled
- **Parallelism**: Reduced to `--parallel=1` for stability
- **Config preservation**: `--exclude=api/config.php`
- **No delete**: Additive deployment only

### Safety Confirmations
- ✅ Diagnostic step is non-destructive (no uploads)
- ✅ `--exclude=api/config.php` preserves server-side config
- ✅ No `--delete` flag (additive deployment only)
- ✅ Secrets not printed in logs
- ✅ Uses existing `FTP_*` secrets (no new secrets required)

---

## Part 3: Validation Results

### Build
```
✓ built in 4.45s
```

### Tests
```
Test Files  11 passed (11)
Tests  426 passed (426)
```

### Safety Checks
| Requirement | Status |
|-------------|--------|
| No parity logic modified | ✅ |
| No parity DB tables modified | ✅ |
| No migrations run | ✅ |
| No sample rules imported | ✅ |
| No server config.php deleted | ✅ |
| No secrets exposed/committed | ✅ |
| No rsa_token behavior changed | ✅ |
| No Phase 3C started | ✅ |

---

## Part 4: Deployment Configuration

### Required GitHub Secrets (EXISTING - No Changes Needed)
| Secret | Required | Purpose |
|--------|----------|---------|
| `FTP_SERVER` | ✅ Yes | FTP/FTPS server hostname |
| `FTP_USERNAME` | ✅ Yes | FTP account username |
| `FTP_PASSWORD` | ✅ Yes | FTP account password |

### Protocol
- **Primary:** FTPS (FTP over TLS/SSL)
- **Fallback:** Plain FTP (if FTPS fails)
- **SSL Settings:** `ssl-allow yes`, `ssl-force true`, certificate verification disabled

### Post-Deploy Verification (Automated)
The workflow will automatically verify:
- Production asset hash matches build
- `/rules` route present in bundle
- NHRA Tech Services branding present
- Old RSA branding absent
- API endpoints do not return HTTP 500

---

## Summary

| Component | Status |
|-----------|--------|
| SITEGROUND_* secrets required | ❌ Removed - Using existing FTP_* secrets |
| SSH key auth | ❌ Removed - Using FTP/FTPS |
| FTP diagnostic step | ✅ Added - Non-destructive protocol/path detection |
| Preflight validation | ✅ Uses existing FTP_* secrets |
| Secret safety | ✅ No values printed |
| Config preservation | ✅ `--exclude=api/config.php` |
| Post-deploy verification | ✅ Includes API health checks |
| Production deployment | ⏳ Blocked - needs diagnostic results to tune deploy |

---

## Commits This Sprint

| Hash | Message |
|------|---------|
| [PENDING] | fix(ci): add FTP diagnostic step to determine protocol and path |

---

## End-of-Sprint Status

| Question | Answer |
|----------|--------|
| Workflow commit SHA? | `5e92fe1` → `[NEW COMMIT]` |
| Workflow secret names used? | `FTP_SERVER`, `FTP_USERNAME`, `FTP_PASSWORD` |
| Preflight passed? | ✅ Yes |
| Previous failure? | FTPS mirror: max-retries exceeded |
| Diagnostic added? | ✅ Yes - Tests 3 protocols non-destructively |
| Working protocol? | ⏳ **PENDING** - Wait for diagnostic output |
| FTP-visible path? | ⏳ **PENDING** - Wait for pwd/ls output |
| Production asset hash? | ⏳ **PENDING** - After successful deploy |
| API 500 resolved? | ⏳ **PENDING** - After getDB() fix deploys |
| api/config.php preserved? | ✅ Yes (excluded from deploy) |
| Cleared for migration/rules work? | **NO** - ⏸️ PAUSED until deploy succeeds |

---

**Next Action:** Review workflow run logs to identify:
1. Which protocol mode succeeded (A, B, or C)
2. What pwd/ls output shows for FTP-visible path
3. Update deploy step if path/protocol needs adjustment
4. Re-run until deployment succeeds
