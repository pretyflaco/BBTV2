#!/bin/bash
# BlinkPOS Deployment Script
# This script deploys BlinkPOS to a remote server using Docker

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SERVER_USER="${SERVER_USER:-root}"
SERVER_HOST="${SERVER_HOST}"
SERVER_PORT="${SERVER_PORT:-22}"
DEPLOY_DIR="${DEPLOY_DIR:-/var/www/blinkpos}"
APP_NAME="blinkpos"

# Function to print colored messages
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

# Check if SERVER_HOST is set
if [ -z "$SERVER_HOST" ]; then
    print_error "SERVER_HOST environment variable is not set!"
    echo "Usage: SERVER_HOST=your-server-ip ./deploy.sh"
    exit 1
fi

print_info "Starting deployment to $SERVER_HOST..."

# Check if .env.production exists
if [ ! -f .env.production ]; then
    print_error ".env.production file not found!"
    print_info "Please create .env.production from .env.production.example"
    exit 1
fi

# Step 1: Build locally (optional, comment out if building on server)
print_info "Building Docker image locally..."
# docker build -t ${APP_NAME}:latest .
# print_success "Docker image built successfully"

# Step 2: Create deployment directory on server
print_info "Creating deployment directory on server..."
ssh -p $SERVER_PORT ${SERVER_USER}@${SERVER_HOST} "mkdir -p ${DEPLOY_DIR}"
print_success "Deployment directory created"

# Step 3: Upload files to server
print_info "Uploading files to server..."
rsync -avz --delete \
    --exclude 'node_modules' \
    --exclude '.next' \
    --exclude '.git' \
    --exclude '.env' \
    --exclude '.env.local' \
    --exclude '*.log' \
    --exclude '.tip-store.json' \
    -e "ssh -p $SERVER_PORT" \
    ./ ${SERVER_USER}@${SERVER_HOST}:${DEPLOY_DIR}/
print_success "Files uploaded successfully"

# Step 4: Upload .env.production as .env
print_info "Uploading production environment configuration..."
scp -P $SERVER_PORT .env.production ${SERVER_USER}@${SERVER_HOST}:${DEPLOY_DIR}/.env
print_success "Environment configuration uploaded"

# Step 5: Deploy on server
print_info "Deploying application on server..."
ssh -p $SERVER_PORT ${SERVER_USER}@${SERVER_HOST} bash <<EOF
    set -e
    cd ${DEPLOY_DIR}
    
    # Install Docker and Docker Compose if not already installed
    if ! command -v docker &> /dev/null; then
        echo "Installing Docker..."
        curl -fsSL https://get.docker.com -o get-docker.sh
        sh get-docker.sh
        rm get-docker.sh
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        echo "Installing Docker Compose..."
        curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-\$(uname -s)-\$(uname -m)" -o /usr/local/bin/docker-compose
        chmod +x /usr/local/bin/docker-compose
    fi
    
    # Stop existing containers
    echo "Stopping existing containers..."
    docker-compose -f docker-compose.prod.yml down || true
    
    # Build and start containers
    echo "Building and starting containers..."
    docker-compose -f docker-compose.prod.yml up --build -d
    
    # Wait for services to be healthy
    echo "Waiting for services to be healthy..."
    sleep 10
    
    # Check container status
    docker-compose -f docker-compose.prod.yml ps
    
    echo "Deployment completed!"
EOF

print_success "Deployment completed successfully!"

# Step 6: Display logs
print_info "Displaying application logs (Ctrl+C to exit)..."
ssh -p $SERVER_PORT ${SERVER_USER}@${SERVER_HOST} "cd ${DEPLOY_DIR} && docker-compose -f docker-compose.prod.yml logs -f app"

