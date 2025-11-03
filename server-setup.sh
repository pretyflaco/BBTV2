#!/bin/bash
# BlinkPOS Server Initial Setup Script
# Run this script on your server to prepare it for Docker deployment

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    print_error "Please run as root or with sudo"
    exit 1
fi

print_info "Starting BlinkPOS server setup..."

# Step 1: Update system
print_info "Updating system packages..."
apt update && apt upgrade -y
print_success "System packages updated"

# Step 2: Install essential tools
print_info "Installing essential tools..."
apt install -y curl wget git htop ufw fail2ban
print_success "Essential tools installed"

# Step 3: Create swap space (important for 1GB RAM servers)
if [ ! -f /swapfile ]; then
    print_info "Creating 2GB swap space..."
    fallocate -l 2G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
    print_success "Swap space created"
else
    print_warning "Swap file already exists, skipping..."
fi

# Step 4: Install Docker
if ! command -v docker &> /dev/null; then
    print_info "Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    rm get-docker.sh
    systemctl enable docker
    systemctl start docker
    print_success "Docker installed"
else
    print_success "Docker already installed"
fi

# Step 5: Install Docker Compose
if ! command -v docker-compose &> /dev/null; then
    print_info "Installing Docker Compose..."
    curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
    print_success "Docker Compose installed"
else
    print_success "Docker Compose already installed"
fi

# Step 6: Configure firewall
print_info "Configuring firewall..."
ufw --force enable
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw status
print_success "Firewall configured"

# Step 7: Create deployment directory
DEPLOY_DIR="/var/www/blinkpos"
print_info "Creating deployment directory at $DEPLOY_DIR..."
mkdir -p $DEPLOY_DIR
print_success "Deployment directory created"

# Step 8: Create backup directory
print_info "Creating backup directory..."
mkdir -p /var/backups/blinkpos
print_success "Backup directory created"

# Step 9: Setup log rotation
print_info "Setting up log rotation..."
cat > /etc/logrotate.d/blinkpos <<'EOF'
/var/www/blinkpos/logs/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 root root
    sharedscripts
}
EOF
print_success "Log rotation configured"

# Step 10: Create backup script
print_info "Creating backup script..."
cat > /usr/local/bin/backup-blinkpos.sh <<'EOF'
#!/bin/bash
# BlinkPOS Backup Script

BACKUP_DIR="/var/backups/blinkpos"
DATE=$(date +%Y%m%d_%H%M%S)
DEPLOY_DIR="/var/www/blinkpos"

# Create backup directory if it doesn't exist
mkdir -p $BACKUP_DIR

# Backup PostgreSQL database
echo "Backing up PostgreSQL database..."
cd $DEPLOY_DIR
docker-compose -f docker-compose.prod.yml exec -T postgres pg_dump -U blinkpos blinkpos | gzip > $BACKUP_DIR/postgres_$DATE.sql.gz

# Backup Redis data
echo "Backing up Redis data..."
docker-compose -f docker-compose.prod.yml exec -T redis redis-cli --rdb /data/dump.rdb
docker cp blinkpos-redis:/data/dump.rdb $BACKUP_DIR/redis_$DATE.rdb

# Keep only last 7 days of backups
find $BACKUP_DIR -name "postgres_*.sql.gz" -mtime +7 -delete
find $BACKUP_DIR -name "redis_*.rdb" -mtime +7 -delete

echo "Backup completed: $DATE"
EOF

chmod +x /usr/local/bin/backup-blinkpos.sh
print_success "Backup script created"

# Step 11: Schedule daily backups
print_info "Scheduling daily backups..."
(crontab -l 2>/dev/null | grep -v backup-blinkpos; echo "0 2 * * * /usr/local/bin/backup-blinkpos.sh >> /var/log/blinkpos-backup.log 2>&1") | crontab -
print_success "Daily backups scheduled at 2 AM"

# Step 12: Create monitoring script
print_info "Creating monitoring script..."
cat > /usr/local/bin/monitor-blinkpos.sh <<'EOF'
#!/bin/bash
# BlinkPOS Monitoring Script

echo "=== BlinkPOS System Status ==="
echo ""

echo "Memory Usage:"
free -h
echo ""

echo "Disk Usage:"
df -h /
echo ""

echo "Docker Containers:"
cd /var/www/blinkpos
docker-compose -f docker-compose.prod.yml ps
echo ""

echo "Recent Logs (last 20 lines):"
docker-compose -f docker-compose.prod.yml logs --tail=20 app
EOF

chmod +x /usr/local/bin/monitor-blinkpos.sh
print_success "Monitoring script created"

# Step 13: Print summary
echo ""
print_success "Server setup completed successfully!"
echo ""
print_info "Next steps:"
echo "  1. Copy your .env.production file to the server"
echo "  2. Run deployment from your local machine:"
echo "     SERVER_HOST=your-server-ip ./deploy.sh"
echo ""
print_info "Useful commands:"
echo "  - Monitor status: /usr/local/bin/monitor-blinkpos.sh"
echo "  - Manual backup: /usr/local/bin/backup-blinkpos.sh"
echo "  - View logs: cd /var/www/blinkpos && docker-compose -f docker-compose.prod.yml logs -f"
echo ""
print_warning "IMPORTANT: Make sure to:"
echo "  - Change default passwords in .env.production"
echo "  - Set up SSL certificate (use Certbot with Let's Encrypt)"
echo "  - Configure your domain's DNS to point to this server"
echo ""

# Display system info
print_info "System Information:"
echo "  - RAM: $(free -h | awk '/^Mem:/{print $2}')"
echo "  - Swap: $(free -h | awk '/^Swap:/{print $2}')"
echo "  - Disk: $(df -h / | awk 'NR==2{print $2}')"
echo "  - Docker: $(docker --version)"
echo "  - Docker Compose: $(docker-compose --version)"
echo ""

