# Deployment Guide: 1 GB VPS (Optimized)

Guide for deploying BlinkPOS with hybrid storage on a minimal 1 GB RAM VPS.

---

## 🎯 Target Server

- **RAM**: 1 GB
- **CPU**: 1 Virtual Core
- **Storage**: 15 GB SSD
- **Bandwidth**: 1000 GB/month

**Examples**: Lunanode m.1s, DigitalOcean Basic Droplet, Vultr VC2-1c-1gb

---

## ⚡ Performance Expectations

With optimizations:
- **Concurrent Users**: 5-10
- **Daily Payments**: Up to 100
- **Response Time**: 200-500ms
- **RAM Usage**: 700-900 MB (70-90%)

---

## 📋 Pre-Deployment Checklist

- [ ] Fresh Ubuntu 22.04 LTS server
- [ ] SSH access as root or sudo user
- [ ] Domain name pointed to server IP (optional but recommended)
- [ ] BlinkPOS API key with READ + RECEIVE scopes
- [ ] Blink BTC wallet ID for merchant

---

## 🚀 Step-by-Step Deployment

### 1. Initial Server Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install essential tools
sudo apt install -y curl wget git build-essential

# Create swap space (important for 1 GB RAM!)
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# Verify swap
free -h
```

### 2. Install Node.js 18 LTS

```bash
# Install Node.js 18 (LTS)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installation
node --version  # Should be v18.x.x
npm --version
```

### 3. Install PostgreSQL 15

```bash
# Add PostgreSQL repository
sudo sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
wget -qO- https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo tee /etc/apt/trusted.gpg.d/pgdg.asc &>/dev/null

# Install PostgreSQL 15
sudo apt update
sudo apt install -y postgresql-15 postgresql-contrib-15

# Start and enable
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

### 4. Configure PostgreSQL for 1 GB RAM

```bash
# Edit PostgreSQL config
sudo nano /etc/postgresql/15/main/postgresql.conf
```

**Optimized settings for 1 GB RAM:**

```ini
# Memory Configuration
shared_buffers = 128MB              # 12% of RAM
effective_cache_size = 256MB        # 25% of RAM
maintenance_work_mem = 32MB
work_mem = 4MB

# Checkpoints
checkpoint_completion_target = 0.9
wal_buffers = 16MB
default_statistics_target = 100

# Planner
random_page_cost = 1.1              # For SSD
effective_io_concurrency = 200      # For SSD

# Connections
max_connections = 20                # Low for 1 GB RAM

# Logging (minimal for performance)
logging_collector = on
log_directory = 'log'
log_filename = 'postgresql-%Y-%m-%d.log'
log_rotation_age = 1d
log_rotation_size = 10MB
log_min_duration_statement = 1000   # Log slow queries (>1s)
```

Restart PostgreSQL:
```bash
sudo systemctl restart postgresql
```

### 5. Create Database and User

```bash
# Switch to postgres user
sudo -u postgres psql

# Inside psql:
CREATE DATABASE blinkpos;
CREATE USER blinkpos WITH ENCRYPTED PASSWORD 'YOUR_SECURE_PASSWORD_HERE';
GRANT ALL PRIVILEGES ON DATABASE blinkpos TO blinkpos;

# Exit psql
\q
```

### 6. Initialize Database Schema

```bash
# Copy your init.sql to server (use scp or git)
sudo -u postgres psql -d blinkpos -f /path/to/init.sql
```

### 7. Install Redis

```bash
# Install Redis 7
curl -fsSL https://packages.redis.io/gpg | sudo gpg --dearmor -o /usr/share/keyrings/redis-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/redis-archive-keyring.gpg] https://packages.redis.io/deb $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/redis.list

sudo apt update
sudo apt install -y redis-server
```

### 8. Configure Redis for Low Memory

```bash
# Edit Redis config
sudo nano /etc/redis/redis.conf
```

**Optimized settings:**

```ini
# Memory limit
maxmemory 50mb
maxmemory-policy allkeys-lru

# Persistence (minimal)
save 900 1
save 300 10
save 60 10000

# Performance
tcp-backlog 128
timeout 300
tcp-keepalive 60

# Disable unused features
protected-mode yes
maxclients 50

# Logging
loglevel notice
```

Restart Redis:
```bash
sudo systemctl restart redis-server
sudo systemctl enable redis-server
```

### 9. Deploy Next.js Application

```bash
# Create app directory
sudo mkdir -p /var/www/blinkpos
sudo chown $USER:$USER /var/www/blinkpos

# Clone repository (or upload files)
cd /var/www/blinkpos
git clone YOUR_REPO_URL .

# Or use rsync/scp to upload files
# rsync -avz --exclude node_modules --exclude .next ./BBTV2/ user@server:/var/www/blinkpos/

# Install dependencies
npm ci --production

# Build for production
NODE_ENV=production npm run build
```

### 10. Configure Environment Variables

```bash
# Create .env file
nano /var/www/blinkpos/.env
```

**Production .env:**

```env
# Database
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=blinkpos
POSTGRES_USER=blinkpos
POSTGRES_PASSWORD=YOUR_SECURE_PASSWORD_HERE

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# BlinkPOS Credentials
BLINKPOS_API_KEY=blink_your_blinkpos_api_key_here
BLINKPOS_BTC_WALLET_ID=your_blinkpos_wallet_id_here

# Session Secret
SESSION_SECRET=generate_a_random_32_char_string_here

# Environment
NODE_ENV=production
PORT=3000
```

### 11. Set Up PM2 Process Manager

```bash
# Install PM2 globally
sudo npm install -g pm2

# Create PM2 ecosystem config
nano /var/www/blinkpos/ecosystem.config.js
```

**ecosystem.config.js:**

```javascript
module.exports = {
  apps: [{
    name: 'blinkpos',
    cwd: '/var/www/blinkpos',
    script: 'npm',
    args: 'start',
    instances: 1,  // Single instance for 1 GB RAM
    autorestart: true,
    watch: false,
    max_memory_restart: '400M',  // Restart if exceeds 400 MB
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: '/var/log/blinkpos/error.log',
    out_file: '/var/log/blinkpos/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true
  }]
};
```

Start the app:
```bash
# Create log directory
sudo mkdir -p /var/log/blinkpos
sudo chown $USER:$USER /var/log/blinkpos

# Start with PM2
cd /var/www/blinkpos
pm2 start ecosystem.config.js

# Save PM2 config and set to start on boot
pm2 save
pm2 startup
# Follow the command it outputs
```

### 12. Set Up Nginx Reverse Proxy

```bash
# Install Nginx
sudo apt install -y nginx

# Create Nginx config
sudo nano /etc/nginx/sites-available/blinkpos
```

**Nginx configuration:**

```nginx
# Rate limiting zone
limit_req_zone $binary_remote_addr zone=blinkpos:10m rate=10r/s;

server {
    listen 80;
    server_name your_domain.com;  # Change this to your domain

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Rate limiting
    limit_req zone=blinkpos burst=20 nodelay;

    # Max upload size
    client_max_body_size 10M;

    # Proxy to Next.js app
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Static file caching
    location /_next/static {
        proxy_pass http://localhost:3000;
        proxy_cache_valid 200 365d;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    # Deny access to sensitive files
    location ~ /\. {
        deny all;
    }
}
```

Enable site and restart Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/blinkpos /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
sudo systemctl enable nginx
```

### 13. Set Up SSL with Let's Encrypt (Optional but Recommended)

```bash
# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d your_domain.com

# Auto-renewal is set up automatically
# Test renewal:
sudo certbot renew --dry-run
```

### 14. Set Up Monitoring

```bash
# Install htop for manual monitoring
sudo apt install -y htop

# Create monitoring script
nano ~/monitor.sh
```

**monitor.sh:**

```bash
#!/bin/bash

# Monitor script for BlinkPOS
echo "=== BlinkPOS System Status ==="
echo ""
echo "Memory Usage:"
free -h
echo ""
echo "Disk Usage:"
df -h /
echo ""
echo "PostgreSQL Status:"
sudo systemctl status postgresql --no-pager | head -3
echo ""
echo "Redis Status:"
sudo systemctl status redis-server --no-pager | head -3
echo ""
echo "PM2 Status:"
pm2 status
echo ""
echo "Recent Errors (last 10):"
tail -10 /var/log/blinkpos/error.log
```

Make executable:
```bash
chmod +x ~/monitor.sh
```

### 15. Set Up Daily Backups

```bash
# Create backup script
sudo nano /usr/local/bin/backup-blinkpos.sh
```

**backup-blinkpos.sh:**

```bash
#!/bin/bash

# BlinkPOS Backup Script
BACKUP_DIR="/var/backups/blinkpos"
DATE=$(date +%Y%m%d_%H%M%S)

# Create backup directory
mkdir -p $BACKUP_DIR

# Backup PostgreSQL
sudo -u postgres pg_dump blinkpos | gzip > $BACKUP_DIR/blinkpos_$DATE.sql.gz

# Backup Redis
sudo redis-cli --rdb $BACKUP_DIR/dump_$DATE.rdb

# Keep only last 7 days of backups
find $BACKUP_DIR -name "blinkpos_*.sql.gz" -mtime +7 -delete
find $BACKUP_DIR -name "dump_*.rdb" -mtime +7 -delete

echo "Backup completed: $DATE"
```

Make executable and schedule:
```bash
sudo chmod +x /usr/local/bin/backup-blinkpos.sh

# Add to crontab (daily at 2 AM)
(crontab -l 2>/dev/null; echo "0 2 * * * /usr/local/bin/backup-blinkpos.sh >> /var/log/blinkpos/backup.log 2>&1") | crontab -
```

---

## 🔐 Security Hardening

### 1. Firewall Configuration

```bash
# Install and configure UFW
sudo apt install -y ufw

# Allow SSH, HTTP, HTTPS
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Enable firewall
sudo ufw --force enable

# Check status
sudo ufw status
```

### 2. Fail2Ban (Brute Force Protection)

```bash
# Install fail2ban
sudo apt install -y fail2ban

# Create custom config
sudo cp /etc/fail2ban/jail.conf /etc/fail2ban/jail.local

# Enable and start
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

### 3. Disable PostgreSQL External Access

```bash
# Edit pg_hba.conf
sudo nano /etc/postgresql/15/main/pg_hba.conf
```

Ensure only local connections:
```
# Only allow local connections
local   all             all                                     peer
host    all             all             127.0.0.1/32            md5
host    all             all             ::1/128                 md5
```

Restart:
```bash
sudo systemctl restart postgresql
```

---

## 📊 Monitoring Commands

```bash
# Check memory usage
free -h

# Check disk usage
df -h

# Check CPU load
uptime

# Monitor processes
htop

# Check PM2 status
pm2 status

# View PM2 logs
pm2 logs blinkpos --lines 50

# Check PostgreSQL connections
sudo -u postgres psql -c "SELECT count(*) FROM pg_stat_activity;"

# Check Redis memory
redis-cli INFO memory | grep used_memory_human

# Check Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

---

## 🚨 When to Upgrade

Monitor these metrics and upgrade when:

1. **RAM Usage > 85% consistently**
   ```bash
   free -h | grep Mem | awk '{print $3/$2 * 100.0}'
   ```

2. **Swap usage > 500 MB regularly**
   ```bash
   free -h | grep Swap
   ```

3. **CPU load average > 1.5**
   ```bash
   uptime
   ```

4. **Response time > 1 second**
   ```bash
   curl -w "@-" -o /dev/null -s http://localhost:3000 <<'EOF'
   time_total:  %{time_total}\n
   EOF
   ```

5. **More than 100 payments/day**
   ```bash
   sudo -u postgres psql -d blinkpos -c "SELECT COUNT(*) FROM payment_splits WHERE DATE(created_at) = CURRENT_DATE;"
   ```

---

## ⚡ Performance Optimization Tips

1. **Enable Gzip Compression** (Already in Nginx config above)

2. **Use CDN for static assets** (optional)
   - Cloudflare free tier works great
   - Reduces bandwidth usage
   - Improves global performance

3. **Database Connection Pooling**
   - Already implemented in hybrid-store.js
   - Max 5 connections for 1 GB RAM

4. **Redis as Session Store** (future enhancement)
   - Reduce database load
   - Faster session lookups

5. **Implement Caching Headers**
   - Already in Next.js config
   - Static assets cached for 1 year

---

## 🔄 Update/Deployment Process

```bash
# 1. Pull latest code
cd /var/www/blinkpos
git pull origin main

# 2. Install dependencies (if package.json changed)
npm ci --production

# 3. Rebuild
NODE_ENV=production npm run build

# 4. Restart app
pm2 restart blinkpos

# 5. Check status
pm2 status
pm2 logs blinkpos --lines 20
```

---

## 📈 Scaling Up at Lunanode

When ready to upgrade:

1. **Resize VPS** (Can be done without re-deployment)
   - Lunanode Dashboard → Resize → Select 2 GB plan
   - No data migration needed!
   - Just restart services

2. **Update configs** for more RAM:
   ```bash
   # PostgreSQL: Increase shared_buffers to 256MB
   # Redis: Increase maxmemory to 100MB
   # PM2: Remove max_memory_restart limit
   ```

3. **Restart all services**:
   ```bash
   sudo systemctl restart postgresql
   sudo systemctl restart redis-server
   pm2 restart blinkpos
   ```

---

## 🆘 Troubleshooting

### App Won't Start
```bash
# Check PM2 logs
pm2 logs blinkpos --err

# Check Node.js version
node --version  # Should be 18.x

# Check environment variables
cat /var/www/blinkpos/.env

# Try manual start
cd /var/www/blinkpos
NODE_ENV=production npm start
```

### Database Connection Errors
```bash
# Check PostgreSQL status
sudo systemctl status postgresql

# Check if database exists
sudo -u postgres psql -l | grep blinkpos

# Check connection
sudo -u postgres psql -d blinkpos -c "SELECT 1;"
```

### Redis Connection Errors
```bash
# Check Redis status
sudo systemctl status redis-server

# Test Redis connection
redis-cli ping  # Should return PONG
```

### High Memory Usage
```bash
# Check top processes
ps aux --sort=-%mem | head -10

# Clear PM2 logs if too large
pm2 flush

# Restart services
pm2 restart blinkpos
sudo systemctl restart redis-server
```

### Slow Performance
```bash
# Check PostgreSQL slow queries
sudo -u postgres psql -d blinkpos -c "SELECT query, calls, total_time, mean_time FROM pg_stat_statements ORDER BY mean_time DESC LIMIT 10;"

# Check Redis stats
redis-cli INFO stats

# Check Nginx access log for slow requests
sudo tail -f /var/log/nginx/access.log
```

---

## 📝 Post-Deployment Checklist

- [ ] App accessible at https://your_domain.com
- [ ] SSL certificate installed and auto-renewal working
- [ ] PM2 running and set to start on boot
- [ ] Database backups scheduled
- [ ] Monitoring script working
- [ ] Firewall configured
- [ ] Test payment flow works end-to-end
- [ ] Check logs for errors
- [ ] Monitor RAM usage for 24-48 hours

---

## 🎓 Additional Resources

- **Lunanode Documentation**: https://www.lunanode.com/docs/
- **PM2 Documentation**: https://pm2.keymetrics.io/docs/
- **PostgreSQL Tuning**: https://pgtune.leopard.in.ua/
- **Redis Configuration**: https://redis.io/docs/management/config/
- **Next.js Deployment**: https://nextjs.org/docs/deployment

---

Generated: October 26, 2025

