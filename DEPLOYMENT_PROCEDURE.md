# Production Deployment Procedure

## 🎯 Quick Deploy (Standard Workflow)

```bash
# 1. From your local machine, after committing changes
./deploy-prod.sh
```

That's it! The script handles everything.

## 📋 What the Deployment Script Does

1. **Verifies** you're deploying to correct server (`track.twentyone.ist`)
2. **Pushes** latest changes to GitHub
3. **Pulls** from GitHub on production server
4. **Checks** if Service Worker needs updating
5. **Rebuilds** Docker containers
6. **Verifies** deployment health
7. **Shows** logs to confirm success

## 🔧 Manual Deployment (If Script Fails)

### Step 1: Push to GitHub
```bash
cd /home/kasita/Documents/BLINK/BBTV2
git add -A
git commit -m "Your commit message"
git push origin main
```

### Step 2: Pull on Server & Rebuild
```bash
ssh ubuntu@track.twentyone.ist << 'EOF'
  cd /var/www/blinkpos
  
  # Pull latest from GitHub
  git pull origin main
  
  # Rebuild Docker containers
  docker-compose -f docker-compose.prod.yml down
  docker-compose -f docker-compose.prod.yml up --build -d
  
  # Wait for health
  sleep 15
  docker ps
EOF
```

### Step 3: Verify Deployment
```bash
curl https://track.twentyone.ist/api/health
```

## ⚡ Hot Restart (Code changes only, no dependencies)

If you only changed code (not package.json or .env):

```bash
ssh ubuntu@track.twentyone.ist << 'EOF'
  cd /var/www/blinkpos
  git pull origin main
  docker-compose -f docker-compose.prod.yml restart app
EOF
```

## 🎨 UI Changes Checklist

When deploying UI/component changes:

1. **Update Service Worker** (CRITICAL!)
   ```bash
   # Edit public/sw.js
   # Change: CACHE_NAME = 'blink-tracker-v4-...'
   # To: CACHE_NAME = 'blink-tracker-v5-...'
   ```

2. **Commit & Deploy**
   ```bash
   git add public/sw.js
   git commit -m "Bump SW cache for UI update"
   ./deploy-prod.sh
   ```

3. **Verify Clients Update**
   - Open app in incognito mode
   - Should see new version immediately
   - Regular users will update on next app open

## 🔑 Environment Variable Updates

When changing API keys or secrets:

```bash
# 1. SSH to server
ssh ubuntu@track.twentyone.ist

# 2. Edit production env file
nano /var/www/blinkpos/.env.production

# 3. Update the variable (e.g., BLINKPOS_API_KEY)

# 4. Rebuild (restart won't pick up build-time vars)
cd /var/www/blinkpos
docker-compose -f docker-compose.prod.yml up --build -d
```

## 🐛 Troubleshooting Deployments

### Deployment Success But Changes Not Visible

**Check 1: Files on Server**
```bash
ssh ubuntu@track.twentyone.ist "ls -la /var/www/blinkpos/components/ | head -20"
```
Files should have recent timestamps.

**Check 2: Service Worker Version**
```bash
# Check what's deployed
ssh ubuntu@track.twentyone.ist "grep CACHE_NAME /var/www/blinkpos/public/sw.js"

# Compare with local
grep CACHE_NAME /home/kasita/Documents/BLINK/BBTV2/public/sw.js
```

**Check 3: Docker Build Time**
```bash
ssh ubuntu@track.twentyone.ist "docker inspect blinkpos-app | grep Created"
```
Should be recent (within last few minutes).

**Solution**: Full rebuild
```bash
ssh ubuntu@track.twentyone.ist "cd /var/www/blinkpos && docker-compose -f docker-compose.prod.yml up --build -d --no-cache"
```

### Container Won't Start

**Check logs:**
```bash
ssh ubuntu@track.twentyone.ist "docker logs blinkpos-app --tail 100"
```

Common issues:
- **Port already in use**: Old container still running
- **Environment vars missing**: Check `.env.production`
- **Build failed**: Check for syntax errors in code

### Nginx Issues

**Test Nginx config:**
```bash
ssh ubuntu@track.twentyone.ist "sudo nginx -t"
```

**Reload Nginx:**
```bash
ssh ubuntu@track.twentyone.ist "sudo systemctl reload nginx"
```

## 📊 Deployment Verification Checklist

After deployment, verify:

- [ ] Containers running: `docker ps` shows 3 healthy containers
- [ ] Health check: `curl https://track.twentyone.ist/api/health` returns `{"status":"healthy"}`
- [ ] No errors in logs: `docker logs blinkpos-app --tail 50`
- [ ] UI loads: Open in browser (incognito)
- [ ] Changes visible: Check specific features you modified

## 🔄 Rollback Procedure

If deployment breaks production:

```bash
# 1. SSH to server
ssh ubuntu@track.twentyone.ist
cd /var/www/blinkpos

# 2. Check recent commits
git log --oneline -5

# 3. Rollback to previous commit
git reset --hard HEAD~1

# 4. Rebuild
docker-compose -f docker-compose.prod.yml up --build -d

# 5. Verify
curl http://localhost:3000/api/health
```

## 📝 Deployment Log

Keep track of deployments in your notes:

```
Date: 2025-11-04
Commit: 5db33e8
Changes: NFC UX improvements
Status: ✅ Success
Notes: Removed error alerts, moved icon to invoice header
```

## 🎯 Best Practices

1. **Always commit before deploying**
   - Never deploy uncommitted changes
   - Use descriptive commit messages

2. **Test locally first**
   - Run `npm run dev` and test changes
   - Fix any console errors

3. **Bump SW on UI changes**
   - Always update `CACHE_NAME` version
   - Users won't see changes otherwise

4. **Deploy during low-traffic times**
   - Deployment takes ~30-60 seconds
   - App is briefly unavailable

5. **Monitor after deploy**
   - Check logs for 5-10 minutes
   - Watch for errors or issues

6. **One change at a time**
   - Deploy related changes together
   - Easier to rollback if issues occur

## 🚨 Emergency Contacts

If deployment completely breaks:

1. Check server status: `ssh ubuntu@track.twentyone.ist "docker ps -a"`
2. Check logs: `docker logs blinkpos-app --tail 200`
3. Rollback if needed (see Rollback Procedure above)
4. Document what happened for future prevention

