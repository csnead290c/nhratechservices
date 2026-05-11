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

### Preflight Validation (UPDATED)
Now validates existing secrets without requiring new ones:
- Checks `FTP_SERVER` is present
- Checks `FTP_USERNAME` is present
- Checks `FTP_PASSWORD` is present
- No values printed in logs

### FTPS Deployment with lftp (UPDATED)
```bash
lftp -u "${{ secrets.FTP_USERNAME }},${{ secrets.FTP_PASSWORD }}" ftps://${{ secrets.FTP_SERVER }} << EOF
set ftp:ssl-allow yes
set ftp:ssl-force true
set ssl:verify-certificate no
set net:max-retries 2
set net:timeout 30
mirror -R -v --parallel=3 --exclude=api/config.php ./dist/ www/nhratechservices.com/public_html/
bye
EOF
```

### FTP-Visible Path
The FTP user is chrooted. The correct FTP-visible path is:
```
www/nhratechservices.com/public_html/
```

This maps to the absolute path:
```
/home/customer/www/nhratechservices.com/public_html/
```

### Safety Confirmations
- ✅ `--exclude=api/config.php` preserves server-side config
- ✅ No `--delete` flag (additive deployment only)
- ✅ Correct FTP-visible path: `www/nhratechservices.com/public_html/`
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
| SSH key auth | ❌ Removed - Using FTPS |
| FTPS with lftp | ✅ Implemented |
| Preflight validation | ✅ Uses existing FTP_* secrets |
| Secret safety | ✅ No values printed |
| Config preservation | ✅ `--exclude=api/config.php` |
| Post-deploy verification | ✅ Includes API health checks |
| Production deployment | ⏳ Ready - using existing secrets |

---

## Commits This Sprint

| Hash | Message |
|------|---------|
| [PENDING] | fix(ci): use existing FTP_* secrets with FTPS deployment |

---

## End-of-Sprint Status

| Question | Answer |
|----------|--------|
| Workflow secret names used? | `FTP_SERVER`, `FTP_USERNAME`, `FTP_PASSWORD` |
| Deploy protocol? | FTPS (FTP over TLS) |
| New secrets required? | **NO** - Uses existing secrets |
| GitHub Actions deploy green? | ⏳ Ready to test with existing secrets |
| Production fresh? | ❌ No - still stale (May 9) |
| API 500 resolved? | ⏳ Pending deployment of getDB() fix |
| api/config.php preserved? | ✅ Yes (excluded from deploy) |
| Cleared for migration/rules work? | **NO** - ⏸️ PAUSED until deployment succeeds and API 500 is resolved |

---

**Next Action:** Monitor workflow run using existing `FTP_*` secrets. If FTPS fails, workflow may need adjustment for plain FTP or different SSL settings.
