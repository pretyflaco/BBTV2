# Docker Deployment Guide for BlinkPOS

Complete guide for deploying BlinkPOS with Docker on a 1GB RAM VPS.

---

## 🎯 Overview

This guide uses Docker and Docker Compose to deploy BlinkPOS with:
- **Next.js Application** (containerized)
- **Redis Cache** (containerized) - 50MB memory limit
- **PostgreSQL Database** (containerized) - optimized for 1GB RAM
- **Automatic Health Checks** and **Restart Policies**

---

## 📋 Prerequisites

### On Your Local Machine
- Git
- SSH access to your server
- `.env.production` file configured

### On Your Server
- Ubuntu 20.04+ or Debian 11+
- 1GB RAM minimum (2GB recommended)
- 15GB disk space
- Root or sudo access

---

## 🚀 Quick Deployment (Recommended)

### Step 1: Prepare Your Server

SSH into your server and run the setup script:

```bash
# SSH into your server
ssh root@your-server-ip

# Download and run the server setup script
curl -fsSL https://raw.githubusercontent.com/YOUR_USERNAME/BBTV2/main/server-setup.sh | bash
```

Or manually:

```bash
# Upload and run the server setup script
scp server-setup.sh root@your-server-ip:/tmp/
ssh root@your-server-ip "bash /tmp/server-setup.sh"
```

This script will:
- Install Docker and Docker Compose
- Create swap space (2GB)
- Configure firewall
- Set up backup scripts
- Create monitoring tools

### Step 2: Configure Environment Variables

On your **local machine**, create `.env.production`:

```bash
cp .env.production.example .env.production
nano .env.production
```

**Required changes:**
- Set `BLINKPOS_API_KEY` (from https://dashboard.blink.sv/api-keys)
- Set `BLINKPOS_BTC_WALLET_ID` (your Blink BTC wallet ID)
- Set `POSTGRES_PASSWORD` (strong password)
- Set `JWT_SECRET` (generate with: `openssl rand -base64 32`)

### Step 3: Deploy Application

From your **local machine**:

```bash
# Make deploy script executable
chmod +x deploy.sh

# Deploy to server
SERVER_HOST=your-server-ip ./deploy.sh
```

The deployment script will:
1. Upload all files to server
2. Upload production environment config
3. Build Docker images on server
4. Start all containers
5. Display logs

### Step 4: Verify Deployment

```bash
# SSH into server
ssh root@your-server-ip

# Check container status
cd /var/www/blinkpos
docker-compose -f docker-compose.prod.yml ps

# Check health endpoint
curl http://localhost:3000/api/health

# View logs
docker-compose -f docker-compose.prod.yml logs -f
```

---

## 🔧 Manual Deployment Steps

If you prefer to deploy manually:

### 1. Install Docker on Server

```bash
# SSH into server
ssh root@your-server-ip

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Install Docker Compose
curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# Verify installations
docker --version
docker-compose --version
```

### 2. Create Swap Space (Important for 1GB RAM!)

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h  # Verify swap is active
```

### 3. Upload Project Files

From your **local machine**:

```bash
# Create deployment directory on server
ssh root@your-server-ip "mkdir -p /var/www/blinkpos"

# Upload files (excluding node_modules and build artifacts)
rsync -avz --exclude 'node_modules' --exclude '.next' --exclude '.git' --exclude '.env' \
    ./ root@your-server-ip:/var/www/blinkpos/

# Upload production environment file
scp .env.production root@your-server-ip:/var/www/blinkpos/.env
```

### 4. Start Containers

On your **server**:

```bash
cd /var/www/blinkpos

# Build and start containers
docker-compose -f docker-compose.prod.yml up --build -d

# Wait for services to start
sleep 10

# Check status
docker-compose -f docker-compose.prod.yml ps

# View logs
docker-compose -f docker-compose.prod.yml logs -f app
```

---

## 🔍 Container Management

### View Status
```bash
cd /var/www/blinkpos
docker-compose -f docker-compose.prod.yml ps
```

### View Logs
```bash
# All containers
docker-compose -f docker-compose.prod.yml logs -f

# Specific service
docker-compose -f docker-compose.prod.yml logs -f app
docker-compose -f docker-compose.prod.yml logs -f redis
docker-compose -f docker-compose.prod.yml logs -f postgres
```

### Restart Services
```bash
# Restart all
docker-compose -f docker-compose.prod.yml restart

# Restart specific service
docker-compose -f docker-compose.prod.yml restart app
```

### Stop Services
```bash
docker-compose -f docker-compose.prod.yml stop
```

### Start Services
```bash
docker-compose -f docker-compose.prod.yml start
```

### Rebuild and Restart
```bash
docker-compose -f docker-compose.prod.yml up --build -d
```

---

## 🔄 Updates and Redeployment

### Method 1: Using Deploy Script (Recommended)

From your **local machine**:

```bash
# Pull latest changes
git pull origin main

# Deploy updates
SERVER_HOST=your-server-ip ./deploy.sh
```

### Method 2: Manual Update

On your **server**:

```bash
cd /var/www/blinkpos

# Pull latest code (if using git on server)
git pull origin main

# Or upload files from local machine
# rsync -avz ... (see Manual Deployment Steps above)

# Rebuild and restart
docker-compose -f docker-compose.prod.yml up --build -d
```

---

## 💾 Backup and Restore

### Automatic Backups

Backups run automatically at 2 AM daily (configured by server-setup.sh):

```bash
# Check backup logs
tail -f /var/log/blinkpos-backup.log

# List backups
ls -lh /var/backups/blinkpos/
```

### Manual Backup

```bash
# Run backup script
/usr/local/bin/backup-blinkpos.sh

# Or manually:
cd /var/www/blinkpos

# Backup PostgreSQL
docker-compose -f docker-compose.prod.yml exec -T postgres \
    pg_dump -U blinkpos blinkpos | gzip > backup_$(date +%Y%m%d).sql.gz

# Backup Redis
docker-compose -f docker-compose.prod.yml exec -T redis \
    redis-cli --rdb /data/dump.rdb
docker cp blinkpos-redis:/data/dump.rdb ./backup_redis_$(date +%Y%m%d).rdb
```

### Restore from Backup

```bash
cd /var/www/blinkpos

# Restore PostgreSQL
gunzip < backup_20231027.sql.gz | \
    docker-compose -f docker-compose.prod.yml exec -T postgres \
    psql -U blinkpos blinkpos

# Restore Redis
docker cp backup_redis_20231027.rdb blinkpos-redis:/data/dump.rdb
docker-compose -f docker-compose.prod.yml restart redis
```

---

## 📊 Monitoring

### System Monitoring Script

```bash
# Run monitoring script
/usr/local/bin/monitor-blinkpos.sh
```

### Manual Monitoring Commands

```bash
# Memory usage
free -h

# Disk usage
df -h

# Container stats (live)
docker stats

# Check health endpoint
curl http://localhost:3000/api/health | jq

# Database stats
cd /var/www/blinkpos
docker-compose -f docker-compose.prod.yml exec postgres \
    psql -U blinkpos -d blinkpos -c "SELECT * FROM payment_statistics LIMIT 10;"

# Redis stats
docker-compose -f docker-compose.prod.yml exec redis redis-cli INFO stats
```

---

## 🛠️ Troubleshooting

### App Won't Start

```bash
# Check logs
docker-compose -f docker-compose.prod.yml logs app

# Check health
docker-compose -f docker-compose.prod.yml exec app node -v
docker-compose -f docker-compose.prod.yml exec app env

# Rebuild from scratch
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml up --build -d
```

### Database Connection Issues

```bash
# Check PostgreSQL logs
docker-compose -f docker-compose.prod.yml logs postgres

# Test connection
docker-compose -f docker-compose.prod.yml exec postgres \
    psql -U blinkpos -d blinkpos -c "SELECT 1;"

# Check if tables exist
docker-compose -f docker-compose.prod.yml exec postgres \
    psql -U blinkpos -d blinkpos -c "\dt"
```

### Redis Connection Issues

```bash
# Check Redis logs
docker-compose -f docker-compose.prod.yml logs redis

# Test connection
docker-compose -f docker-compose.prod.yml exec redis redis-cli ping
```

### Out of Memory

```bash
# Check memory usage
free -h
docker stats --no-stream

# Restart with memory cleanup
docker-compose -f docker-compose.prod.yml down
docker system prune -a -f
docker-compose -f docker-compose.prod.yml up -d
```

### Container Keeps Restarting

```bash
# Check logs for errors
docker-compose -f docker-compose.prod.yml logs --tail=100 app

# Check health status
docker inspect blinkpos-app | jq '.[0].State.Health'

# Disable auto-restart temporarily
docker-compose -f docker-compose.prod.yml up --no-start
docker-compose -f docker-compose.prod.yml start app
docker-compose -f docker-compose.prod.yml logs -f app
```

---

## 🔐 Security Hardening

### 1. Configure Firewall

```bash
# Allow only necessary ports
ufw allow 22/tcp   # SSH
ufw allow 80/tcp   # HTTP
ufw allow 443/tcp  # HTTPS
ufw enable
```

### 2. Change Default Passwords

Edit `.env` on server:
```bash
nano /var/www/blinkpos/.env
```

Change:
- `POSTGRES_PASSWORD`
- `JWT_SECRET`
- `REDIS_PASSWORD` (if you add one)

Then restart:
```bash
docker-compose -f docker-compose.prod.yml restart
```

### 3. Set Up SSL (Let's Encrypt)

```bash
# Install Certbot
apt install -y certbot

# Get certificate
certbot certonly --standalone -d your-domain.com

# Configure nginx or add nginx to docker-compose.prod.yml
```

### 4. Limit Database Access

PostgreSQL and Redis are bound to `127.0.0.1` only in docker-compose.prod.yml, so they're not accessible from outside the server.

---

## 📈 Performance Optimization

### For 1GB RAM Servers

The docker-compose.prod.yml is already optimized for 1GB RAM:
- Redis limited to 50MB
- PostgreSQL configured with minimal memory settings
- Single app instance

### Monitoring Resource Usage

```bash
# Check memory usage continuously
watch -n 1 free -h

# Check Docker container resources
docker stats

# If using more than 85% RAM consistently, consider:
# 1. Upgrading server RAM
# 2. Reducing Redis maxmemory
# 3. Lowering PostgreSQL connections
```

---

## 🎯 Next Steps After Deployment

1. **Set up SSL certificate** (Let's Encrypt)
2. **Configure domain DNS** to point to your server
3. **Test payment flow** end-to-end
4. **Monitor for 24-48 hours** to ensure stability
5. **Set up external monitoring** (optional: UptimeRobot, Pingdom)
6. **Configure log aggregation** (optional: for production)

---

## 📚 Additional Resources

- **Docker Documentation**: https://docs.docker.com/
- **Docker Compose**: https://docs.docker.com/compose/
- **Next.js Deployment**: https://nextjs.org/docs/deployment
- **PostgreSQL on Docker**: https://hub.docker.com/_/postgres
- **Redis on Docker**: https://hub.docker.com/_/redis

---

**Generated:** November 2025  
**Version:** 1.0.0

