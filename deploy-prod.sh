#!/bin/bash
# Production Deployment Script - Git-Based Workflow
# Uses git pull instead of rsync for cleaner deployments

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration - HARDCODED TO PREVENT MISTAKES
PROD_SERVER="170.75.172.111"  # track.twentyone.ist
PROD_USER="ubuntu"
PROD_PATH="/var/www/blinkpos"
GITHUB_REPO="https://github.com/pretyflaco/BBTV2.git"
BRANCH="main"

# Functions
print_header() {
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}  $1${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

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

confirm() {
    read -p "$(echo -e ${YELLOW}⚠${NC}) $1 (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_error "Deployment cancelled"
        exit 1
    fi
}

# Start deployment
print_header "🚀 BLINK POS Production Deployment"

echo ""
print_info "Target Server: ${GREEN}${PROD_SERVER}${NC}"
print_info "Deployment Path: ${CYAN}${PROD_PATH}${NC}"
print_info "GitHub Branch: ${CYAN}${BRANCH}${NC}"
echo ""

# Verify server
if [ "$PROD_SERVER" != "170.75.172.111" ]; then
    print_error "WRONG SERVER! Must be 170.75.172.111 (track.twentyone.ist)"
    print_error "Current target: $PROD_SERVER"
    exit 1
fi

print_success "Server verified: 170.75.172.111 (track.twentyone.ist) ✅"
echo ""

# Step 1: Check for uncommitted changes
print_header "Step 1: Checking Local Repository"

if [ -n "$(git status --porcelain)" ]; then
    print_warning "You have uncommitted changes:"
    git status --short
    echo ""
    confirm "Commit these changes before deploying?"
    
    print_info "Enter commit message:"
    read -r COMMIT_MSG
    
    git add -A
    git commit -m "$COMMIT_MSG"
    print_success "Changes committed"
fi

# Step 2: Push to GitHub
print_header "Step 2: Pushing to GitHub"

print_info "Pushing ${BRANCH} to origin..."
git push origin ${BRANCH}
print_success "Pushed to GitHub successfully"
echo ""

# Step 3: Check Service Worker version
print_header "Step 3: Checking Service Worker"

SW_VERSION=$(grep "CACHE_NAME = " public/sw.js | head -1 || echo "not found")
print_info "Current SW version: ${CYAN}${SW_VERSION}${NC}"

if [[ $SW_VERSION == *"not found"* ]]; then
    print_warning "Service Worker not found or version not set"
fi
echo ""

# Step 4: Deploy to server
print_header "Step 4: Deploying to Production Server"

print_info "Connecting to ${PROD_SERVER}..."

ssh ${PROD_USER}@${PROD_SERVER} bash <<EOF
    set -e
    
    echo "📁 Navigating to deployment directory..."
    cd ${PROD_PATH}
    
    echo "📥 Pulling latest changes from GitHub..."
    git fetch origin
    git reset --hard origin/${BRANCH}
    
    echo "🔍 Verifying files..."
    echo "Latest commit:"
    git log -1 --oneline
    
    echo ""
    echo "🐳 Stopping containers..."
    docker-compose -f docker-compose.prod.yml down
    
    echo ""
    echo "🔨 Building and starting containers..."
    docker-compose -f docker-compose.prod.yml up --build -d
    
    echo ""
    echo "⏳ Waiting for containers to be healthy..."
    sleep 15
    
    echo ""
    echo "📊 Container status:"
    docker ps --filter name=blinkpos
    
    echo ""
    echo "🏥 Health check:"
    curl -s http://localhost:3000/api/health | head -3 || echo "Health check failed"
    
    echo ""
    echo "✅ Deployment complete!"
EOF

print_success "Deployment completed successfully!"
echo ""

# Step 5: Verification
print_header "Step 5: Verifying Deployment"

print_info "Checking public health endpoint..."
if curl -f -s https://${PROD_SERVER}/api/health > /dev/null; then
    print_success "Public health check: PASS ✅"
else
    print_warning "Public health check: FAIL ⚠️"
    print_info "Check Nginx configuration and SSL"
fi

echo ""
print_info "Checking deployed commit..."
DEPLOYED_COMMIT=$(ssh ${PROD_USER}@${PROD_SERVER} "cd ${PROD_PATH} && git log -1 --oneline")
LOCAL_COMMIT=$(git log -1 --oneline)

echo "  Local:    ${CYAN}${LOCAL_COMMIT}${NC}"
echo "  Deployed: ${GREEN}${DEPLOYED_COMMIT}${NC}"

if [ "$LOCAL_COMMIT" = "$DEPLOYED_COMMIT" ]; then
    print_success "Commits match! Deployment verified ✅"
else
    print_warning "Commits don't match - may need investigation"
fi

echo ""

# Step 6: Post-deployment info
print_header "📋 Post-Deployment Checklist"

echo ""
echo "Please verify:"
echo "  • Open https://track.twentyone.ist in incognito mode"
echo "  • Check that UI changes are visible"
echo "  • Test key functionality (create invoice, NFC, etc.)"
echo "  • Check browser console for errors"
echo ""

if [[ $SW_VERSION != *"not found"* ]]; then
    print_info "Service Worker active: Users may need to:"
    echo "  • Close and reopen the app"
    echo "  • Clear site data (Settings → Site settings → Clear & reset)"
fi

echo ""
print_header "✅ Deployment Complete!"

echo ""
print_info "View logs: ${CYAN}ssh ${PROD_USER}@${PROD_SERVER} 'docker logs blinkpos-app --tail 50'${NC}"
print_info "Monitor: ${CYAN}ssh ${PROD_USER}@${PROD_SERVER} 'docker logs blinkpos-app -f'${NC}"
echo ""

print_success "🎉 Production is live at https://${PROD_SERVER}"
echo ""

