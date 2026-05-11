# Deployment Workflow Current Failure Debug Results

**Sprint Goal:** Fix deployment workflow and resolve FTP account home directory issue

**Date:** May 11, 2026

---

## Part 1: FTP Account Home Directory Root Cause

### Latest GitHub Actions Run Analysis
| Attribute | Value |
|-----------|-------|
| Workflow commit | `f2aa80d` (current HEAD) |
| Deployment method | lftp with FTP diagnostic |
| Preflight status | ✅ FTP_* secrets present |
| Failure type | **FTP account home directory invalid** |

### Root Cause Identified
**FTP account home directory points to deleted path.**

SSH inspection revealed:
| Path | Status |
|------|--------|
| `/home/customer/www/nhratechservices.com/public_html/` | ✅ **Exists** (correct document root) |
| `/home/customer/www/public_html/` | ❌ **DELETED** (likely FTP home) |
| `/home/customer/www/public_html/nhratechservices.com/` | ❌ **DELETED** |

**FTP Diagnostic Results:**
- **Explicit FTPS**: Certificate hostname mismatch
- **Plain FTP**: `421 Home directory not available - aborting`
- **Deploy step**: Same `421 Home directory not available` error

**Conclusion:** The FTP account was configured with a home directory pointing to `/home/customer/www/public_html/` which was deleted during server cleanup. FTP login fails because the home directory doesn't exist.

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

## Part 3: SSH Hotfix Deployment (Manual Recovery)

### Action Taken
Due to FTP account being unusable, performed manual SSH-based deployment as temporary recovery:

```bash
rsync -avz --exclude='api/config.php' \
  -e "ssh -p 18765" \
  dist/ \
  "u3542-cpixgw37zfgv@ssh.nhratechservices.com:/home/customer/www/nhratechservices.com/public_html/"
```

### Hotfix Safety Measures
- ✅ Used `--exclude=api/config.php` to preserve server secrets
- ✅ No `--delete` flag (additive deployment)
- ✅ Deployed to correct document root
- ✅ Verified getDB() function present in build

### Hotfix Results

| Metric | Result |
|--------|--------|
| **Deploy method** | rsync over SSH (manual) |
| **Files sent** | 15,411,279 bytes |
| **Deploy time** | ~12 seconds |
| **Production asset hash** | `index-BupLlgB4-1778511384982.js` ✅ **FRESH** |
| **API auth.php** | `401` ✅ **Not 500** |
| **API parity.php** | `401` ✅ **Not 500** |
| **config.php** | `492 bytes` ✅ **Preserved** |

**API Health:** The `401` responses (not `500`) confirm the `getDB()` fix is working. Endpoints now require authentication rather than crashing with undefined function errors.

---

## Part 4: Validation Results

### Build
```
✓ built in 5.09s
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

## Summary

| Component | Status |
|-----------|--------|
| FTP account home directory | ❌ **INVALID** - Points to deleted path |
| FTP login working | ❌ **NO** - "421 Home directory not available" |
| SSH hotfix deployed | ✅ **YES** - Production now fresh |
| API 500 resolved | ✅ **YES** - getDB() fix deployed |
| Production asset hash | ✅ `index-BupLlgB4-1778511384982.js` |
| GitHub Actions deploy | ❌ **BROKEN** - FTP account needs fixing |

---

## Commits This Sprint

| Hash | Message |
|------|---------|
| `f2aa80d` | fix(ci): add FTP diagnostic step to determine protocol and path |

---

## End-of-Sprint Status

| Question | Answer |
|----------|--------|
| FTP account home confirmed invalid? | ✅ **YES** - Points to deleted `/home/customer/www/public_html/` |
| FTP login reaches pwd/ls? | ❌ **NO** - "421 Home directory not available" |
| Working protocol? | ❌ **NONE** - All FTP modes fail |
| FTP-visible document root? | ❌ **UNKNOWN** - FTP cannot login |
| Production hotfixed by SSH? | ✅ **YES** - Manual rsync deployed successfully |
| Production asset hash? | ✅ `index-BupLlgB4-1778511384982.js` (May 11, 2026) |
| API 500 resolved? | ✅ **YES** - Returns 401 (requires auth) |
| GitHub Actions deploy green? | ❌ **NO** - FTP account broken |
| Cleared for migration/rules work? | ⚠️ **PARTIAL** - Production healthy, but CI deploy broken |

---

## Recovery Options (Next Steps)

### Option A: Fix FTP Account Home (Recommended)
Recreate the missing directory `/home/customer/www/public_html/` as a symlink to the correct document root:
```bash
mkdir -p /home/customer/www/public_html/
# OR create symlink:
ln -s /home/customer/www/nhratechservices.com/public_html/ /home/customer/www/public_html/
```

### Option B: Configure New FTP Account
Create a dedicated SiteGround FTP account rooted directly at:
`/home/customer/www/nhratechservices.com/public_html/`

### Option C: Convert to SSH-based CI Deploy
Update GitHub Actions to use SSH key auth (requires new secrets):
- `SITEGROUND_HOST`
- `SITEGROUND_USER`
- `SITEGROUND_PORT`
- `SITEGROUND_SSH_PRIVATE_KEY`

---

**Immediate Status:** Production is healthy via SSH hotfix. GitHub Actions FTP deploy remains broken until FTP account is fixed or workflow converted to SSH.
