# Deployment Workflow Current Failure Debug Results

**Sprint Goal:** Convert deployment from password-based lftp SFTP to SSH-key-based SFTP deployment

**Date:** May 11, 2026

---

## Part 1: Current Workflow Failure Confirmed

### Latest GitHub Actions Run Analysis
| Attribute | Value |
|-----------|-------|
| Workflow commit | `bef91b9` (current HEAD) |
| Deployment method | lftp (password-based) |
| Failure type | **Authentication - NEW ISSUE** |
| Error message | `Permission denied (publickey)` |

### Root Cause Identified
**SiteGround requires SSH key authentication, not password authentication.**

The error `Permission denied (publickey)` indicates:
1. lftp successfully connected to SiteGround's SFTP server
2. SiteGround rejected the username/password authentication
3. SiteGround expects publickey/SSH key authentication

This is **different** from the earlier appleboy issue which failed with SSH handshake errors.

### Required GitHub Secrets (NEW)
The workflow now requires these secrets for SSH key authentication:

| Secret | Required | Purpose |
|--------|----------|---------|
| `SITEGROUND_HOST` | ✅ Yes | SSH hostname (e.g., `ssh.nhratechservices.com`) |
| `SITEGROUND_USER` | ✅ Yes | SSH username |
| `SITEGROUND_PORT` | ✅ Yes | SSH port (18765) |
| `SITEGROUND_SSH_PRIVATE_KEY` | ✅ Yes | SSH private key content |
| `SITEGROUND_SSH_PASSPHRASE` | ⚠️ Optional | Passphrase if key is encrypted |

**Note:** The previous secrets (`FTP_SERVER`, `FTP_USERNAME`, `FTP_PASSWORD`) are no longer used.

---

## Part 2: Workflow Changes Made

### Preflight Validation (NEW)
Before attempting deployment, the workflow now validates all required secrets are present:
- Checks each secret without printing values
- Fails early with clear error if any required secret is missing
- Reports optional passphrase status

### SSH Key Setup (NEW)
```bash
mkdir -p ~/.ssh
chmod 700 ~/.ssh
printf '%s\n' "${{ secrets.SITEGROUND_SSH_PRIVATE_KEY }}" > ~/.ssh/siteground_deploy_key
chmod 600 ~/.ssh/siteground_deploy_key
ssh-keyscan -p "${{ secrets.SITEGROUND_PORT }}" "${{ secrets.SITEGROUND_HOST }}" >> ~/.ssh/known_hosts
```

### lftp with SSH Key Auth (UPDATED)
```bash
lftp << EOF
set sftp:auto-confirm yes
set net:max-retries 2
set net:timeout 30
set sftp:connect-program "ssh -a -x -i ~/.ssh/siteground_deploy_key -p ${{ secrets.SITEGROUND_PORT }} -o StrictHostKeyChecking=accept-new"
open sftp://${{ secrets.SITEGROUND_USER }}@${{ secrets.SITEGROUND_HOST }}
mirror -R -v --parallel=3 --exclude=api/config.php ./dist/ /home/customer/www/nhratechservices.com/public_html/
bye
EOF
```

### Safety Confirmations
- ✅ `--exclude=api/config.php` preserves server-side config
- ✅ No `--delete` flag (additive deployment only)
- ✅ Correct remote path: `/home/customer/www/nhratechservices.com/public_html/`
- ✅ Secrets not printed in logs

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

## Part 4: Pending Actions

### Required Before Next Deployment
1. **Configure new GitHub secrets:**
   - `SITEGROUND_HOST`: `ssh.nhratechservices.com`
   - `SITEGROUND_USER`: `u3542-cpixgw37zfgv`
   - `SITEGROUND_PORT`: `18765`
   - `SITEGROUND_SSH_PRIVATE_KEY`: [SSH private key content]
   - `SITEGROUND_SSH_PASSPHRASE`: [Optional - only if key is encrypted]

2. **Verify SSH key works:**
   ```bash
   ssh -p 18765 -i ~/.ssh/your_key u3542-cpixgw37zfgv@ssh.nhratechservices.com
   ```

3. **Trigger workflow run** after secrets are configured

4. **Monitor deployment** for success/failure

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
| Password-based lftp | ❌ Failed - SiteGround requires key auth |
| SSH key-based lftp | ✅ Implemented, waiting for secrets |
| Preflight validation | ✅ Added |
| Secret safety | ✅ No values printed |
| Config preservation | ✅ `--exclude=api/config.php` |
| Post-deploy verification | ✅ Includes API health checks |
| Production deployment | ⏳ Blocked - needs secrets configured |

---

## Commits This Sprint

| Hash | Message |
|------|---------|
| [PENDING] | fix(ci): convert lftp to SSH key authentication |

---

## End-of-Sprint Status

| Question | Answer |
|----------|--------|
| Deployment uses SSH key auth? | ✅ Yes (workflow updated) |
| GitHub Actions deploy green? | ⏳ Pending - needs secrets configured |
| Production fresh? | ❌ No - still stale (May 9) |
| API 500 resolved? | ⏳ Pending deployment of fix |
| api/config.php preserved? | ✅ Yes (excluded from deploy) |
| Cleared for migration/rules work? | **NO** - ⏸️ PAUSED until deployment succeeds |

---

**Next Action:** Configure required GitHub secrets (`SITEGROUND_HOST`, `SITEGROUND_USER`, `SITEGROUND_PORT`, `SITEGROUND_SSH_PRIVATE_KEY`) and trigger workflow run.
