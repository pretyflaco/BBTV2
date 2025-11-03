# Quick Deployment Guide

## 📝 Pre-Deployment Checklist

✅ All changes pushed to GitHub  
✅ `.env.production` file created with production credentials  
✅ Docker deployment files ready  
✅ Deployment scripts created and executable  

## 🚀 Deployment Steps

### Option 1: Automated Deployment (Recommended)

```bash
# Deploy to your server (replace with your server IP/hostname)
SERVER_HOST=your-server-ip ./deploy.sh

# Or if using SSH config hostname:
SERVER_HOST=lnbits.ideasarelikeflames.org ./deploy.sh
```

### Option 2: Manual Deployment

#### Step 1: Run Server Setup (First Time Only)

SSH into your server and run:

```bash
ssh ubuntu@your-server-ip
curl -fsSL https://raw.githubusercontent.com/pretyflaco/BBTV2/main/server-setup.sh -o setup.sh
sudo bash setup.sh
```

Or upload and run locally:

```bash
scp server-setup.sh ubuntu@your-server-ip:/tmp/
ssh ubuntu@your-server-ip "sudo bash /tmp/server-setup.sh"
```

#### Step 2: Deploy Application

From your local machine:

```bash
# Set server details
export SERVER_HOST=your-server-ip
export SERVER_USER=ubuntu  # or root
export DEPLOY_DIR=/var/www/blinkpos

# Run deployment
./deploy.sh
```

## 🔍 Post-Deployment Verification

```bash
# SSH into server
ssh ubuntu@your-server-ip

# Check container status
cd /var/www/blinkpos
docker-compose -f docker-compose.prod.yml ps

# Check health
curl http://localhost:3000/api/health

# View logs
docker-compose -f docker-compose.prod.yml logs -f
```

## 🔧 Quick Commands

### On Your Server

```bash
# Check status
cd /var/www/blinkpos && docker-compose -f docker-compose.prod.yml ps

# View logs
docker-compose -f docker-compose.prod.yml logs -f app

# Restart services
docker-compose -f docker-compose.prod.yml restart

# Stop services
docker-compose -f docker-compose.prod.yml down

# Start services
docker-compose -f docker-compose.prod.yml up -d

# Rebuild and restart
docker-compose -f docker-compose.prod.yml up --build -d
```

### Monitor Resources

```bash
# Check memory
free -h

# Check disk
df -h

# Check Docker stats
docker stats

# Run monitoring script
/usr/local/bin/monitor-blinkpos.sh
```

### Backup and Restore

```bash
# Manual backup
/usr/local/bin/backup-blinkpos.sh

# View backups
ls -lh /var/backups/blinkpos/
```

## ⚠️ Important Notes

1. **First Deployment**: Run `server-setup.sh` first to install Docker and dependencies
2. **Environment Variables**: Ensure `.env.production` has correct values
3. **Passwords**: PostgreSQL password is generated and stored in `.env.production`
4. **Firewall**: Ports 80, 443, and 22 should be open
5. **SSL**: After deployment, set up SSL certificate with Let's Encrypt

## 🆘 Troubleshooting

### Container won't start
```bash
docker-compose -f docker-compose.prod.yml logs app
```

### Database connection issues
```bash
docker-compose -f docker-compose.prod.yml logs postgres
```

### Out of memory
```bash
free -h
docker stats
# Consider upgrading server RAM
```

## 📞 Need Help?

- Check `DOCKER_DEPLOYMENT_GUIDE.md` for detailed instructions
- Check `DEPLOYMENT_1GB_SERVER.md` for 1GB RAM optimization tips
- Review logs: `docker-compose -f docker-compose.prod.yml logs -f`

---

**Your Server Info:**
- PostgreSQL Password: `E7SX47m5pi6e2CGfc2AdIs6LWD/rBf1pNvBoMbLFkMU=`
- JWT Secret: Already configured from dev environment
- Blink API Key: Already configured from dev environment

Keep this information secure!

