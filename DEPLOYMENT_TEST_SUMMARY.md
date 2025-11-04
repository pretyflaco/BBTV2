# Deployment Test Summary - Nov 4, 2025

## 🎯 Objective
Test the new Git-based deployment workflow by fixing a swipe navigation bug and deploying it to production.

## 🐛 Bug Fixed
**Issue**: Swipe navigation was responding on all screens (POS, History, Tips, Checkout)
**Expected**: Swipe should only work between POS numpad screen ↔ History screen

### Changes Made
1. **`components/POS.js`**: Updated to notify parent when tip dialog is showing
   - Modified `onInvoiceStateChange` to include both `invoice` and `showTipDialog` states
   
2. **`components/Dashboard.js`**: Updated swipe handler logic
   - Added check for `!showingInvoice` condition before allowing swipe from POS to History
   - Swipe now only works when on POS numpad (not invoice/tips) or on History screen

3. **`public/sw.js`**: Bumped cache version
   - Updated from `v4-2025-11-04-nfc-invoice` to `v5-2025-11-04-swipe-fix`

## ✅ Deployment Process

### Step 1: Code Changes
- Fixed swipe bug in components
- Committed and pushed to GitHub (commit `72adcc8`)

### Step 2: Git Repository Setup on Server
- SSH connection issue discovered: hostname `track.twentyone.ist` refused connection
- Resolved by using IP address `170.75.172.111`
- Successfully initialized Git repository on server at `/var/www/blinkpos`
- Pulled latest code from GitHub `main` branch

### Step 3: Docker Rebuild
- Built and deployed new Docker image with swipe fix
- Container successfully started and healthy

### Step 4: Service Worker Update
- Bumped SW cache version (commit `5c56437`)
- Pulled and rebuilt to ensure clients get latest changes

### Step 5: Deployment Script Update
- Updated `deploy-prod.sh` to use IP address instead of hostname
- Ensures future deployments won't have SSH connection issues

## 📋 Deployment Commands Used

```bash
# Setup Git on server
ssh ubuntu@170.75.172.111 "cd /var/www/blinkpos && git init && git remote add origin https://github.com/pretyflaco/BBTV2.git && git fetch origin && git reset --hard origin/main"

# Deploy changes
ssh ubuntu@170.75.172.111 "cd /var/www/blinkpos && git pull origin main && docker-compose -f docker-compose.prod.yml up --build -d"
```

## 🔍 Verification

### Health Check
```bash
curl https://track.twentyone.ist/api/health
```
✅ Status: healthy
✅ Redis: up
✅ Postgres: up
✅ Blink API: configured

### Service Worker Version
```bash
ssh ubuntu@170.75.172.111 "grep CACHE_NAME /var/www/blinkpos/public/sw.js"
```
✅ Confirmed: `blink-tracker-v5-2025-11-04-swipe-fix`

### Latest Commit
```bash
ssh ubuntu@170.75.172.111 "cd /var/www/blinkpos && git log -1 --oneline"
```
✅ Confirmed: `72adcc8 Fix swipe navigation to only work on POS numpad and History screens`

## 🎉 Results

### ✅ Successes
1. **Git-based deployment working**: Server now pulls from GitHub instead of using rsync
2. **Docker rebuild process smooth**: Build time ~35 seconds, no issues
3. **Service Worker cache busting**: Updated version ensures clients get latest code
4. **SSH access resolved**: Using IP address instead of hostname
5. **Deployment script improved**: Updated for future use

### 📝 Lessons Learned
1. **SSH Configuration**: Hostname DNS resolution may fail; IP address is more reliable
2. **Git Reset Strategy**: Using `git reset --hard origin/main` ensures clean state
3. **Service Worker Importance**: Must update cache version after every deployment
4. **Backup Strategy**: Created backup in `/tmp/blinkpos.backup` before Git conversion

## 🚀 Future Deployments

The deployment process is now streamlined:

```bash
# From local machine
cd /home/kasita/Documents/BLINK/BBTV2

# Make changes, commit, push
git add .
git commit -m "Description of changes"
git push origin main

# Deploy to production (automated via script)
bash deploy-prod.sh
```

Or manually:
```bash
ssh ubuntu@170.75.172.111 "cd /var/www/blinkpos && git pull origin main && docker-compose -f docker-compose.prod.yml up --build -d"
```

## 📁 Files Modified This Session

| File | Change | Commit |
|------|--------|--------|
| `components/POS.js` | Fix swipe logic - notify parent of tip dialog state | `72adcc8` |
| `components/Dashboard.js` | Update swipe handler condition | `72adcc8` |
| `public/sw.js` | Bump cache version to v5 | `5c56437` |
| `deploy-prod.sh` | Use IP address for SSH | `5dc3823` |

## 🎯 Ready for Production Testing

The swipe navigation fix is now live on production at:
**https://track.twentyone.ist**

Users should:
1. Unregister old service worker (if needed)
2. Refresh the page to get new SW version
3. Test swipe navigation:
   - ✅ Swipe LEFT on POS numpad → goes to History
   - ✅ Swipe RIGHT on History → goes to POS numpad
   - ❌ Swipe on Checkout page → does nothing (fixed!)
   - ❌ Swipe on Tips page → does nothing (fixed!)

