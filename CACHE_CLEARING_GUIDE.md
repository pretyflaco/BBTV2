# Cache Clearing Guide - How to See Latest Updates

## The Problem
Your app is a PWA (Progressive Web App) with aggressive caching. When you deploy updates, users see the old version because:
1. **Browser cache** stores old JavaScript/CSS files
2. **Service Worker cache** stores old app assets
3. **Next.js wasn't rebuilt** on the server

## The Solution (3 Steps)

### STEP 1: Proper Server Deployment ✅

**What you did WRONG before:**
```bash
ssh ubuntu@track.twentyone.ist 'cd BBTV2 && git pull && pm2 restart bbtv2'
```
❌ This only restarts the app, doesn't rebuild Next.js!

**What you should ALWAYS do:**
```bash
ssh ubuntu@track.twentyone.ist 'cd BBTV2 && git pull && npm run build && pm2 restart bbtv2'
```
✅ This rebuilds Next.js with new code, then restarts

**Create an alias to make it easy:**
```bash
# Add to your ~/.bashrc or ~/.zshrc
alias deploy-bbtv2="ssh ubuntu@track.twentyone.ist 'cd BBTV2 && git pull && npm run build && pm2 restart bbtv2'"

# Then just run:
deploy-bbtv2
```

### STEP 2: Update Service Worker Version 🔄

**Before every deployment, update this file:**
`public/sw.js` - Line 2

```javascript
// OLD (causes caching issues):
const CACHE_NAME = 'blink-tracker-v1';

// NEW (forces cache refresh):
const CACHE_NAME = 'blink-tracker-v2-2025-01-01';
```

**Best practice:** Include date or version number
- `blink-tracker-v2-2025-01-01`
- `blink-tracker-v2.1.0`
- `blink-tracker-build-123`

### STEP 3: Clear Client Cache 🧹

After deploying, users need to clear their cache:

#### **Desktop Browser:**

1. **Chrome/Edge/Brave:**
   - Windows: `Ctrl + Shift + Delete`
   - Mac: `Cmd + Shift + Delete`
   - Select "Cached images and files"
   - Click "Clear data"

2. **Hard Refresh:**
   - Windows: `Ctrl + Shift + R` or `Ctrl + F5`
   - Mac: `Cmd + Shift + R`

3. **Service Worker Reset:**
   - Open DevTools (F12)
   - Go to Application tab
   - Click "Service Workers"
   - Click "Unregister" for your site
   - Reload page (F5)

#### **Mobile Browser:**

**iOS Safari:**
1. Settings app
2. Safari
3. Clear History and Website Data
4. Clear History and Data

**Android Chrome:**
1. Chrome menu (⋮)
2. Settings
3. Privacy and security
4. Clear browsing data
5. Select "Cached images and files"
6. Clear data

#### **Mobile PWA (Installed App):**

**iOS:**
1. Delete the app from home screen
2. Open Safari
3. Clear cache (see above)
4. Visit site and reinstall PWA

**Android:**
1. Settings app
2. Apps
3. Find "Blink Balance Tracker"
4. Storage
5. Clear Cache
6. Clear Data (if cache doesn't work)

## Permanent Solution: Automatic Cache Busting 🚀

Add this to your deployment script to auto-update cache version:

```bash
#!/bin/bash
# deploy.sh

# Update service worker cache version with timestamp
CACHE_VERSION="blink-tracker-$(date +%Y%m%d-%H%M%S)"
sed -i "s/const CACHE_NAME = .*/const CACHE_NAME = '$CACHE_VERSION';/" public/sw.js

# Commit the change
git add public/sw.js
git commit -m "Auto-update service worker cache version: $CACHE_VERSION"
git push origin main

# Deploy to server
ssh ubuntu@track.twentyone.ist 'cd BBTV2 && git pull && npm run build && pm2 restart bbtv2'

echo "✅ Deployed with cache version: $CACHE_VERSION"
```

Make it executable:
```bash
chmod +x deploy.sh
./deploy.sh
```

## Quick Reference Card 📋

**Every deployment checklist:**
- [ ] Update `CACHE_NAME` in `public/sw.js`
- [ ] `git add`, `git commit`, `git push`
- [ ] SSH to server
- [ ] `git pull`
- [ ] **`npm run build`** ← Don't skip this!
- [ ] `pm2 restart bbtv2`
- [ ] Clear browser cache (hard refresh)
- [ ] Test the new features

## Why This Happens

Your app is a PWA with:
- **Service Worker** (`public/sw.js`) - Caches assets for offline use
- **Manifest** (`public/manifest.json`) - Makes it installable
- **Aggressive Caching** - Great for performance, bad for updates

Without proper cache versioning, users will see old content indefinitely!

## Current Status ✅

**Fixed today:**
- ✅ Service worker cache updated to `v2-2025-01-01`
- ✅ Server rebuilt with `npm run build`
- ✅ PM2 restarted

**Now clear YOUR browser cache:**
1. Desktop: `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)
2. Mobile: Clear browser data or reinstall PWA
3. Check DevTools → Application → Service Workers → Unregister

You should now see:
- 72 currency options
- Clean payment animation (green + checkmark)
- No orange POS header
- Tips info in main header

---

**Pro Tip:** Keep this guide handy for future deployments! 🎯
