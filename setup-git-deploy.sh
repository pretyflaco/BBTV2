#!/bin/bash
# One-time setup script to convert production deployment to git-based

set -e

PROD_SERVER="track.twentyone.ist"
PROD_USER="ubuntu"
PROD_PATH="/var/www/blinkpos"
GITHUB_REPO="https://github.com/pretyflaco/BBTV2.git"
BRANCH="main"

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

print_info() { echo -e "${BLUE}ℹ${NC} $1"; }
print_success() { echo -e "${GREEN}✓${NC} $1"; }
print_error() { echo -e "${RED}✗${NC} $1"; }

echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}  Setting Up Git-Based Deployment${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

print_info "This will convert ${PROD_PATH} to a git repository"
print_info "Current files will be backed up to ${PROD_PATH}.backup"
echo ""

read -p "Continue? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    print_error "Setup cancelled"
    exit 1
fi

print_info "Connecting to ${PROD_SERVER}..."

ssh ${PROD_USER}@${PROD_SERVER} bash <<EOF
    set -e
    
    echo "📦 Backing up current deployment..."
    if [ -d "${PROD_PATH}.backup" ]; then
        echo "Removing old backup..."
        rm -rf ${PROD_PATH}.backup
    fi
    
    # Create backup
    cp -r ${PROD_PATH} ${PROD_PATH}.backup
    echo "✓ Backup created at ${PROD_PATH}.backup"
    
    echo ""
    echo "🔄 Converting to git repository..."
    cd ${PROD_PATH}
    
    # Initialize git if not already
    if [ ! -d .git ]; then
        git init
        echo "✓ Git initialized"
    fi
    
    # Add remote
    git remote remove origin 2>/dev/null || true
    git remote add origin ${GITHUB_REPO}
    echo "✓ Remote added: ${GITHUB_REPO}"
    
    # Fetch from GitHub
    echo "📥 Fetching from GitHub..."
    git fetch origin
    
    # Reset to match GitHub main branch
    echo "🔄 Resetting to origin/${BRANCH}..."
    git reset --hard origin/${BRANCH}
    
    echo ""
    echo "✅ Git setup complete!"
    echo ""
    echo "Current status:"
    git status
    echo ""
    echo "Latest commit:"
    git log -1 --oneline
    
EOF

print_success "Git-based deployment setup complete!"
echo ""
print_info "You can now use: ${CYAN}./deploy-prod.sh${NC} to deploy"
echo ""
print_info "Backup location: ${CYAN}${PROD_PATH}.backup${NC}"
echo ""

