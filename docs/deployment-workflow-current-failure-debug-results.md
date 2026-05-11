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

## Part 2: Workflow Changes — FTP Abandoned, SSH/rsync Implemented

### FTP Abandoned
**FTP deployment is permanently abandoned due to broken account configuration.**

The FTP account home directory points to a deleted path (`/home/customer/www/public_html/`), causing all FTP login attempts to fail with:
```
421 Home directory not available - aborting
```

FTP secrets (`FTP_SERVER`, `FTP_USERNAME`, `FTP_PASSWORD`) are no longer used for deployment.

### New SSH/rsync Deployment
Workflow now uses SSH key authentication with rsync:

#### Preflight Validation (SSH Secrets)
Validates new SSH deployment secrets:
- Checks `SITEGROUND_SSH_HOST` is present
- Checks `SITEGROUND_SSH_USER` is present
- Checks `SITEGROUND_SSH_PORT` is present
- Checks `SITEGROUND_SSH_PRIVATE_KEY` is present
- Reports optional `SITEGROUND_SSH_PASSPHRASE` status
- No values printed in logs

#### SSH Key Setup
```bash
mkdir -p ~/.ssh
chmod 700 ~/.ssh
printf '%s\n' "${{ secrets.SITEGROUND_SSH_PRIVATE_KEY }}" > ~/.ssh/siteground_deploy_key
chmod 600 ~/.ssh/siteground_deploy_key
ssh-keyscan -p "${{ secrets.SITEGROUND_SSH_PORT }}" "${{ secrets.SITEGROUND_SSH_HOST }}" >> ~/.ssh/known_hosts
```

#### Deploy via SSH/rsync
```bash
rsync -avz \
  --exclude 'api/config.php' \
  -e "ssh -i ~/.ssh/siteground_deploy_key -p ${{ secrets.SITEGROUND_SSH_PORT }} -o StrictHostKeyChecking=yes" \
  dist/ \
  "${{ secrets.SITEGROUND_SSH_USER }}@${{ secrets.SITEGROUND_SSH_HOST }}:/home/customer/www/nhratechservices.com/public_html/"
```

### Safety Confirmations
- ✅ SSH key deployed safely (600 permissions)
- ✅ `--exclude=api/config.php` preserves server-side config
- ✅ No `--delete` flag (additive deployment only)
- ✅ Correct absolute path: `/home/customer/www/nhratechservices.com/public_html/`
- ✅ Secrets not printed in logs
- ✅ Uses working SSH method (proven by manual hotfix)

### Required Secrets (NEW)
See `docs/github-actions-ssh-deploy-setup.md` for setup instructions.

| Secret | Required | Example |
|--------|----------|---------|
| `SITEGROUND_SSH_HOST` | ✅ Yes | `ssh.nhratechservices.com` |
| `SITEGROUND_SSH_USER` | ✅ Yes | `u3542-cpixgw37zfgv` |
| `SITEGROUND_SSH_PORT` | ✅ Yes | `18765` |
| `SITEGROUND_SSH_PRIVATE_KEY` | ✅ Yes | [SSH private key PEM] |
| `SITEGROUND_SSH_PASSPHRASE` | ⚠️ Optional | [Passphrase if encrypted] |

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
| FTP deployment | ❌ **ABANDONED** - Permanently broken |
| SSH/rsync workflow | ✅ **IMPLEMENTED** - Uses SSH key auth |
| SSH hotfix deployed | ✅ **YES** - Production now fresh |
| API 500 resolved | ✅ **YES** - getDB() fix deployed |
| Production asset hash | ✅ `index-BupLlgB4-1778511384982.js` |
| GitHub Actions deploy | ⏳ **READY** - Needs SSH secrets configured |

---

## Commits This Sprint

| Hash | Message |
|------|---------|
| [PENDING] | fix(ci): convert deployment from FTP to SSH/rsync |

---

## End-of-Sprint Status

| Question | Answer |
|----------|--------|
| FTP account home confirmed invalid? | ✅ **YES** - Points to deleted `/home/customer/www/public_html/` |
| FTP login working? | ❌ **NO** - "421 Home directory not available" |
| FTP abandoned? | ✅ **YES** - Permanently removed from workflow |
| SSH/rsync implemented? | ✅ **YES** - Workflow updated |
| Production hotfixed by SSH? | ✅ **YES** - Manual rsync deployed successfully |
| Production asset hash? | ✅ `index-BupLlgB4-1778511384982.js` (May 11, 2026) |
| API 500 resolved? | ✅ **YES** - Returns 401 (requires auth) |
| GitHub Actions deploy green? | ⏳ **PENDING** - Needs SSH secrets configured |
| Cleared for migration/rules work? | ⚠️ **PARTIAL** - Production healthy, CI deploy ready but needs secrets |

---

## Part 5: SSH Setup Completion Status

### Deploy Key Generated
- **Type:** ED25519
- **Comment:** `github-actions-nhrats-deploy`
- **Fingerprint:** `SHA256:qpqJn48xIcuGw0KpIbFfVqS6i5w8Lt8kmO3VP7whAPo`
- **Location:** Generated in `.tmp/` and removed after setup
- **Private key:** Saved to local machine for GitHub secret import

### Public Key Installed on SiteGround
- **Location:** `~/.ssh/authorized_keys`
- **Permissions:** 
  - `~/.ssh` directory: 700
  - `~/.ssh/authorized_keys`: 600
- **Key count:** 1 key installed
- **Test:** SSH connection working with new key

### GitHub Secrets Status
| Secret | Status |
|--------|--------|
| `SITEGROUND_SSH_HOST` | ⏳ **PENDING** - Add via GitHub UI |
| `SITEGROUND_SSH_USER` | ⏳ **PENDING** - Add via GitHub UI |
| `SITEGROUND_SSH_PORT` | ⏳ **PENDING** - Add via GitHub UI |
| `SITEGROUND_SSH_PRIVATE_KEY` | ⏳ **PENDING** - Add via GitHub UI |
| `SITEGROUND_SSH_PASSPHRASE` | ⏳ **OPTIONAL** - Not needed (unencrypted key) |

### How to Complete Setup
GitHub CLI (`gh`) requires browser authentication which cannot be automated.

**Manual steps required:**
1. Go to: `https://github.com/csnead290c/nhratechservices/settings/secrets/actions`
2. Add these 4 secrets:
   | Secret | Value |
   |--------|-------|
   | `SITEGROUND_SSH_HOST` | `ssh.nhratechservices.com` |
   | `SITEGROUND_SSH_USER` | `u3542-cpixgw37zfgv` |
   | `SITEGROUND_SSH_PORT` | `18765` |
   | `SITEGROUND_SSH_PRIVATE_KEY` | Copy from `cat ~/.ssh/siteground_nhrats_deploy` |

See `docs/github-actions-ssh-deploy-setup.md` for detailed screenshots and steps.

---

## Next Steps

### Required Before GitHub Actions Deploy Works
1. ✅ **Generate SSH deploy key** - COMPLETED
2. ✅ **Add public key to SiteGround** - COMPLETED (added to `~/.ssh/authorized_keys`)
3. ⏳ **Configure GitHub secrets** - PENDING (requires manual UI entry)
   - `SITEGROUND_SSH_HOST`: `ssh.nhratechservices.com`
   - `SITEGROUND_SSH_USER`: `u3542-cpixgw37zfgv`
   - `SITEGROUND_SSH_PORT`: `18765`
   - `SITEGROUND_SSH_PRIVATE_KEY`: Copy from local key file
4. ⏳ **Trigger workflow run** - PENDING (after secrets configured)
5. ⏳ **Verify post-deploy checks pass** - PENDING

---

**Immediate Status:**
- ✅ Production is healthy (fresh deploy, API working)
- ✅ SSH/rsync workflow implemented and ready
- ✅ Deploy key generated and installed on SiteGround
- ⏳ GitHub Actions deploy **BLOCKED** - needs 4 secrets added via GitHub UI
