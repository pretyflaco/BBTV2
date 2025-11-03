# Hybrid Storage Quick Start Guide

This guide will help you set up and test the hybrid Redis + PostgreSQL storage system for BlinkPOS.

## 📋 Prerequisites

- Docker and Docker Compose installed
- Node.js (v14+ recommended, v18+ for full Redis features)
- BlinkPOS project set up locally

## 🚀 Quick Setup (5 minutes)

### Step 1: Configure Environment Variables

Copy the environment template and fill in your credentials:

```bash
cp .env.example .env
```

Edit `.env` and set at minimum:
```bash
# Required for BlinkPOS operation
BLINKPOS_API_KEY=your_actual_api_key
BLINKPOS_BTC_WALLET_ID=your_actual_wallet_id

# Hybrid storage is pre-configured for local development
# These defaults should work out of the box:
REDIS_HOST=localhost
REDIS_PORT=6379
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=blinkpos
POSTGRES_USER=blinkpos
POSTGRES_PASSWORD=blinkpos_dev_password
```

### Step 2: Start Storage Infrastructure

Launch Redis and PostgreSQL using Docker Compose:

```bash
# Start in detached mode
docker-compose up -d

# Verify containers are running
docker-compose ps
```

You should see 4 containers running:
- `blinkpos-redis` - Redis cache
- `blinkpos-postgres` - PostgreSQL database
- `blinkpos-redis-commander` - Redis management UI
- `blinkpos-pgadmin` - PostgreSQL management UI

### Step 3: Verify Database Initialization

Check that the PostgreSQL database was initialized correctly:

```bash
# Connect to PostgreSQL
docker exec -it blinkpos-postgres psql -U blinkpos -d blinkpos

# Run these commands in psql:
\dt    # List tables (should show: payment_splits, payment_events, etc.)
\dv    # List views (should show: active_payments, payment_statistics, etc.)
\q     # Quit
```

Or view via pgAdmin:
- Open http://localhost:5050
- Login: `admin@blinkpos.local` / `admin`
- Add server connection: `blinkpos-postgres` / `blinkpos` / `blinkpos_dev_password`

### Step 4: (Optional) Migrate Existing Data

If you have existing tip data in `.tip-store.json`, migrate it:

```bash
# Dry run first (preview changes)
node scripts/migrate-to-hybrid.js --dry-run

# Perform actual migration with backup
node scripts/migrate-to-hybrid.js --backup

# Check migration results
docker exec -it blinkpos-postgres psql -U blinkpos -d blinkpos \
  -c "SELECT COUNT(*) FROM payment_splits;"
```

### Step 5: Start BlinkPOS

```bash
npm run dev
```

The application will now use hybrid storage automatically!

## 🧪 Testing the Setup

### Test 1: Create a Payment

1. Open BlinkPOS at http://localhost:3000
2. Enter your API key and select a wallet
3. Create an invoice with a tip
4. Check that payment was stored:

```bash
# Via Redis CLI
docker exec -it blinkpos-redis redis-cli
> KEYS blinkpos:payment:*
> GET blinkpos:payment:<payment_hash>
> exit

# Via PostgreSQL
docker exec -it blinkpos-postgres psql -U blinkpos -d blinkpos \
  -c "SELECT * FROM payment_splits ORDER BY created_at DESC LIMIT 5;"
```

### Test 2: Complete a Payment

1. Pay the invoice using a Lightning wallet
2. Check that payment was processed:

```bash
# Check payment events
docker exec -it blinkpos-postgres psql -U blinkpos -d blinkpos \
  -c "SELECT * FROM payment_events ORDER BY created_at DESC LIMIT 10;"

# Check payment status
docker exec -it blinkpos-postgres psql -U blinkpos -d blinkpos \
  -c "SELECT payment_hash, status, processed_at FROM payment_splits WHERE status = 'completed' ORDER BY processed_at DESC LIMIT 5;"
```

### Test 3: View Analytics

```bash
# Active payments
docker exec -it blinkpos-postgres psql -U blinkpos -d blinkpos \
  -c "SELECT * FROM active_payments;"

# Payment statistics
docker exec -it blinkpos-postgres psql -U blinkpos -d blinkpos \
  -c "SELECT * FROM payment_statistics ORDER BY date DESC LIMIT 7;"

# Top tip recipients
docker exec -it blinkpos-postgres psql -U blinkpos -d blinkpos \
  -c "SELECT * FROM top_tip_recipients LIMIT 10;"
```

## 🎛️ Management UIs

### Redis Commander
- URL: http://localhost:8081
- No authentication required
- View/edit Redis keys, monitor performance

### pgAdmin
- URL: http://localhost:5050
- Login: `admin@blinkpos.local` / `admin`
- Full PostgreSQL management interface

## 🔧 Troubleshooting

### Containers won't start

```bash
# Check logs
docker-compose logs redis
docker-compose logs postgres

# Restart containers
docker-compose restart

# Full reset (WARNING: deletes all data)
docker-compose down -v
docker-compose up -d
```

### Can't connect to Redis/PostgreSQL

```bash
# Check if ports are available
netstat -an | grep 6379
netstat -an | grep 5432

# If ports are in use, edit docker-compose.yml to use different ports
# Or stop conflicting services
```

### Application not using hybrid storage

```bash
# Check environment variables
node -e "console.log(process.env.REDIS_HOST, process.env.POSTGRES_HOST)"

# Check connection logs in application
npm run dev
# Look for: "✅ Redis connected" and "✅ PostgreSQL connected"
```

### Migration script fails

```bash
# Check Docker containers are running
docker-compose ps

# Verify database connectivity
docker exec -it blinkpos-postgres pg_isready -U blinkpos

# Check Redis connectivity
docker exec -it blinkpos-redis redis-cli ping
# Should return: PONG
```

## 📊 Monitoring

### View Storage Statistics

```bash
# From application logs (when running npm run dev)
# Look for periodic cleanup logs: "🧹 Expired X old payments"

# Via API endpoint (add this to your app):
curl http://localhost:3000/api/storage/stats
```

### Check Database Size

```bash
docker exec -it blinkpos-postgres psql -U blinkpos -d blinkpos \
  -c "SELECT 
    pg_size_pretty(pg_database_size('blinkpos')) as db_size,
    (SELECT COUNT(*) FROM payment_splits) as total_payments,
    (SELECT COUNT(*) FROM payment_events) as total_events;"
```

### Check Redis Memory

```bash
docker exec -it blinkpos-redis redis-cli INFO memory
```

## 🧹 Maintenance

### Clean up old data

```bash
# Delete payment data older than 90 days (default)
docker exec -it blinkpos-postgres psql -U blinkpos -d blinkpos \
  -c "SELECT * FROM cleanup_old_data();"

# Delete payment data older than 30 days
docker exec -it blinkpos-postgres psql -U blinkpos -d blinkpos \
  -c "SELECT * FROM cleanup_old_data(30);"
```

### Backup Database

```bash
# Create backup
docker exec blinkpos-postgres pg_dump -U blinkpos blinkpos > backup_$(date +%Y%m%d).sql

# Restore from backup
cat backup_20251026.sql | docker exec -i blinkpos-postgres psql -U blinkpos -d blinkpos
```

### Backup Redis

```bash
# Trigger manual save
docker exec blinkpos-redis redis-cli BGSAVE

# Copy RDB file
docker cp blinkpos-redis:/data/dump.rdb ./redis_backup_$(date +%Y%m%d).rdb
```

## 🎯 Performance Tips

### For Development
- The default configuration is optimized for development
- Redis and PostgreSQL run with moderate resources
- Data is persisted to Docker volumes

### For Production
1. **Update passwords** in `docker-compose.yml` and `.env`
2. **Configure PostgreSQL connection pooling** (already set to 20 connections)
3. **Enable Redis persistence** (already enabled with AOF)
4. **Set up regular backups** (use the commands above in cron)
5. **Monitor storage usage** and clean up old data regularly
6. **Use a reverse proxy** (nginx) for management UIs
7. **Encrypt sensitive data** (userApiKey in metadata)

## 📚 Additional Resources

- [Redis Documentation](https://redis.io/docs/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [HYBRID_STORAGE_ARCHITECTURE.md](./HYBRID_STORAGE_ARCHITECTURE.md) - Detailed architecture
- [ROADMAP.md](./ROADMAP.md) - Future development plans

## 🆘 Getting Help

If you encounter issues:
1. Check the logs: `docker-compose logs`
2. Review this guide
3. Check the [DEVELOPMENT_INSIGHTS.md](./DEVELOPMENT_INSIGHTS.md)
4. Open an issue on the repository

---

**Next Steps:**
- ✅ Start using BlinkPOS with hybrid storage
- 📊 Monitor performance and storage usage
- 🔒 Update credentials before deploying to production
- 📈 Explore analytics views for business insights
