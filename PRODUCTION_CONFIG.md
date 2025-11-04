# Production Server Configuration

## 🎯 CRITICAL INFORMATION - READ FIRST

### Production Server Details
- **Domain**: `track.twentyone.ist`
- **Server IP**: (SSH config: `track.twentyone.ist`)
- **SSH User**: `ubuntu`
- **Deployment Path**: `/var/www/blinkpos`

### ⚠️ WRONG SERVERS - DO NOT USE
- ❌ `lnbits.ideasarelikeflames.org` - This is NOT our server!
- ❌ Any other domain/server

## 🏗️ Architecture Overview

```
[Client Browser]
      ↓
[Nginx Reverse Proxy] (Port 443 → 3000)
      ↓
[Docker Container: blinkpos-app] (Port 3000)
      ↓
[Next.js App] + [Redis] + [PostgreSQL]
```

### Key Components

1. **Nginx** (`/etc/nginx/sites-enabled/*`)
   - Handles HTTPS/SSL
   - Proxies to Docker container on port 3000
   - **Has caching disabled** but may cache connections

2. **Docker Compose** (`/var/www/blinkpos/docker-compose.prod.yml`)
   - `blinkpos-app`: Main Next.js application
   - `blinkpos-postgres`: PostgreSQL database
   - `blinkpos-redis`: Redis cache

3. **Next.js** (Built in Docker)
   - Source: `/var/www/blinkpos/`
   - Build output: Inside container at `/app/.next/`
   - Standalone mode for production

4. **Service Worker** (`/public/sw.js`)
   - **CRITICAL**: Caches entire app on client side
   - Must bump `CACHE_NAME` version on every deploy
   - Clients won't see updates until SW updates

## 📝 Environment Configuration

### Production Environment Variables
Located in: `/var/www/blinkpos/.env.production`

**Important**: Docker copies `.env.production` during build, so:
- Changes to `.env` alone won't work
- Must update `.env.production`
- Must rebuild Docker container

Key variables:
```bash
BLINKPOS_API_KEY=blink_...
BLINKPOS_BTC_WALLET_ID=...
POSTGRES_PASSWORD=...
JWT_SECRET=...
```

## 🚀 Deployment Workflow

### Current Status: Git-Based Deployment

The repository is at: `https://github.com/pretyflaco/BBTV2.git`

**Deployment steps are in**: `DEPLOYMENT_PROCEDURE.md`

## 🐛 Common Issues & Solutions

### Issue 1: Changes Not Showing in Browser
**Cause**: Service Worker + Browser Cache
**Solution**:
1. Bump `CACHE_NAME` in `/public/sw.js` (e.g., `v4` → `v5`)
2. Rebuild Docker container
3. Users must clear site data or wait for SW auto-update

### Issue 2: Changes Not Showing After Deploy
**Cause**: Docker using old source files
**Solution**:
1. Verify files on server: `ssh ubuntu@track.twentyone.ist "ls -la /var/www/blinkpos/components/"`
2. Check file timestamps match recent changes
3. Full rebuild: `docker-compose -f docker-compose.prod.yml up --build -d`

### Issue 3: API Changes Not Working
**Cause**: Environment variables not reloaded
**Solution**:
1. Update `.env.production` (not just `.env`)
2. Rebuild container (restart alone won't reload build-time env vars)

### Issue 4: Wrong Server Deployed To
**Cause**: Confusion about server domains
**Prevention**: 
- **ALWAYS** check `track.twentyone.ist` is the target
- **NEVER** deploy to `lnbits.ideasarelikeflames.org`

## 📋 Health Checks

```bash
# Check containers
ssh ubuntu@track.twentyone.ist "docker ps"

# Check health endpoint
curl https://track.twentyone.ist/api/health

# Check logs
ssh ubuntu@track.twentyone.ist "docker logs blinkpos-app --tail 50"

# Check Nginx
ssh ubuntu@track.twentyone.ist "sudo nginx -t"
```

## 🔄 Cache Clearing Checklist

When deploying UI changes:
- [ ] Update `CACHE_NAME` in `public/sw.js`
- [ ] Commit and push to GitHub
- [ ] Deploy to server
- [ ] Verify new SW version deployed
- [ ] Test in incognito/private window first
- [ ] Clear browser cache if needed

## 📞 Quick Reference

| What | Where | Command |
|------|-------|---------|
| Server | `track.twentyone.ist` | `ssh ubuntu@track.twentyone.ist` |
| App Path | `/var/www/blinkpos` | `cd /var/www/blinkpos` |
| Logs | Docker container | `docker logs blinkpos-app` |
| Restart | Docker Compose | `docker-compose -f docker-compose.prod.yml restart app` |
| Rebuild | Docker Compose | `docker-compose -f docker-compose.prod.yml up --build -d` |
| Health | HTTPS | `curl https://track.twentyone.ist/api/health` |

## 🎯 Pre-Deployment Checklist

Before deploying:
1. [ ] Changes committed to `main` branch
2. [ ] Pushed to GitHub
3. [ ] Service Worker version bumped (if UI changes)
4. [ ] Correct server: `track.twentyone.ist` ✅
5. [ ] Environment variables updated (if needed)

## 🔐 Secrets Management

**Never commit these to Git:**
- `.env`
- `.env.production`
- API keys
- Database passwords

**Current storage:**
- Production: `/var/www/blinkpos/.env.production`
- Local dev: `/home/kasita/Documents/BLINK/BBTV2/.env`

