# GitHub Actions SSH Deploy Setup Guide

This guide explains how to configure SSH key authentication for GitHub Actions deployment to SiteGround.

## Background

The previous FTP-based deployment is no longer functional due to an invalid FTP home directory configuration. SSH/rsync is now the supported deployment method.

## Required GitHub Secrets

Add these secrets to your GitHub repository (Settings → Secrets and variables → Actions):

| Secret Name | Required | Description |
|-------------|----------|-------------|
| `SITEGROUND_SSH_HOST` | ✅ Yes | SSH server hostname (e.g., `ssh.nhratechservices.com`) |
| `SITEGROUND_SSH_USER` | ✅ Yes | SSH username (e.g., `u3542-cpixgw37zfgv`) |
| `SITEGROUND_SSH_PORT` | ✅ Yes | SSH port (e.g., `18765`) |
| `SITEGROUND_SSH_PRIVATE_KEY` | ✅ Yes | SSH private key content (PEM format) |
| `SITEGROUND_SSH_PASSPHRASE` | ⚠️ Optional | Passphrase if key is encrypted |

## Step 1: Generate SSH Deploy Key

On your local machine, generate a dedicated SSH key pair for deployment:

```bash
# Generate a new ED25519 key (recommended)
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/siteground_deploy

# Or generate RSA key if ED25519 is not supported
ssh-keygen -t rsa -b 4096 -C "github-actions-deploy" -f ~/.ssh/siteground_deploy
```

When prompted for a passphrase:
- **Option A (Recommended):** Press Enter for no passphrase (unencrypted key)
- **Option B:** Enter a passphrase and you'll need to add `SITEGROUND_SSH_PASSPHRASE` secret

This creates two files:
- `~/.ssh/siteground_deploy` (private key) - **Keep secret!**
- `~/.ssh/siteground_deploy.pub` (public key) - Safe to share

## Step 2: Add Public Key to SiteGround

1. Log in to your SiteGround hosting panel
2. Navigate to **Advanced → SSH/Shell Access** or **Security → SSH Keys**
3. Add a new SSH key
4. Copy the contents of your public key file:
   ```bash
   cat ~/.ssh/siteground_deploy.pub
   ```
5. Paste the public key into SiteGround's SSH key manager
6. Save the key

Alternatively, if you have SSH access already, you can append the public key manually:

```bash
ssh -p 18765 u3542-cpixgw37zfgv@ssh.nhratechservices.com
mkdir -p ~/.ssh
chmod 700 ~/.ssh
echo "ssh-ed25519 AAAAC3... github-actions-deploy" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

## Step 3: Add Private Key to GitHub Secrets

1. Copy the private key content:
   ```bash
   cat ~/.ssh/siteground_deploy
   ```
   
   Output will look like:
   ```
   -----BEGIN OPENSSH PRIVATE KEY-----
   b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW
   ...
   -----END OPENSSH PRIVATE KEY-----
   ```

2. Go to your GitHub repository
3. Navigate to **Settings → Secrets and variables → Actions**
4. Click **New repository secret**
5. Name: `SITEGROUND_SSH_PRIVATE_KEY`
6. Value: Paste the entire private key content (including BEGIN/END lines)
7. Click **Add secret**

## Step 4: Add Other Required Secrets

Repeat Step 3 for each required secret:

| Secret Name | Example Value | Description |
|-------------|---------------|-------------|
| `SITEGROUND_SSH_HOST` | `ssh.nhratechservices.com` | SSH server hostname |
| `SITEGROUND_SSH_USER` | `u3542-cpixgw37zfgv` | SiteGround SSH username |
| `SITEGROUND_SSH_PORT` | `18765` | SSH port (SiteGround uses non-standard port) |

## Quick Setup Guide (Current Project)

If the deploy key has already been generated and added to SiteGround, complete these steps:

### Step 1: Copy the private key
```bash
cat ~/.ssh/siteground_nhrats_deploy
# OR if in project tmp directory:
cat .tmp/siteground_nhrats_deploy
```

Copy the entire output including:
```
-----BEGIN OPENSSH PRIVATE KEY-----
...
-----END OPENSSH PRIVATE KEY-----
```

### Step 2: Open GitHub repository secrets page
1. Go to: `https://github.com/csnead290c/nhratechservices/settings/secrets/actions`
2. Click **"New repository secret"** button

### Step 3: Add SITEGROUND_SSH_PRIVATE_KEY
- **Name:** `SITEGROUND_SSH_PRIVATE_KEY`
- **Value:** Paste the entire private key content from Step 1
- Click **"Add secret"**

### Step 4: Add remaining secrets
Repeat for each:

| Secret Name | Value to enter |
|-------------|----------------|
| `SITEGROUND_SSH_HOST` | `ssh.nhratechservices.com` |
| `SITEGROUND_SSH_USER` | `u3542-cpixgw37zfgv` |
| `SITEGROUND_SSH_PORT` | `18765` |

### Step 5: Verify secrets are set
Return to: `https://github.com/csnead290c/nhratechservices/settings/secrets/actions`

You should see:
- ✅ `SITEGROUND_SSH_HOST`
- ✅ `SITEGROUND_SSH_PRIVATE_KEY`
- ✅ `SITEGROUND_SSH_PORT`
- ✅ `SITEGROUND_SSH_USER`

(The key is now installed on SiteGround - public key added to `~/.ssh/authorized_keys`)

## Step 5: Test Deployment

1. Push a commit to the `main` branch
2. Go to **Actions** tab in your GitHub repository
3. Watch the "Build and Deploy" workflow run
4. Verify all steps complete successfully:
   - ✅ Preflight validation passes
   - ✅ SSH key setup succeeds
   - ✅ Deploy via SSH/rsync completes
   - ✅ Post-deploy verification passes

## Troubleshooting

### "Permission denied (publickey)"
- Verify the public key was added to SiteGround correctly
- Check that `SITEGROUND_SSH_USER` matches your SiteGround username
- Ensure the private key format is correct (PEM/OpenSSH)

### "Host key verification failed"
- The workflow runs `ssh-keyscan` to add the host key automatically
- If this fails, manually add the host key to the workflow

### Deploy key with passphrase
If your key has a passphrase, you have two options:

**Option A: Use ssh-agent (recommended)**
The workflow automatically handles this if `SITEGROUND_SSH_PASSPHRASE` is set.

**Option B: Use unencrypted key**
Generate a new key without passphrase:
```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/siteground_deploy -N ""
```

## Security Best Practices

1. **Dedicated key:** Use a separate SSH key only for deployment
2. **Limited access:** Restrict the key to only deployment operations
3. **No passphrase in logs:** The workflow never prints secret values
4. **Rotate keys:** Periodically generate new keys and revoke old ones
5. **Protect private key:** Never commit the private key to git or share it

## Verification

After successful setup, verify deployment works:

```bash
# Check production is updated
curl -s https://nhratechservices.com/index.html | grep -oE 'index-[A-Za-z0-9]+-[0-9]+\.js'

# Check API health
curl -s -o /dev/null -w "%{http_code}" https://nhratechservices.com/api/auth.php?action=me
# Should return 401 (not 500)
```

## Support

If deployment fails:
1. Check GitHub Actions logs for specific error messages
2. Verify all secrets are configured correctly
3. Ensure SSH key is added to SiteGround authorized_keys
4. Test SSH connection manually from local machine
