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

# Step 2: Run Unit Tests
print_header "Step 2: Running Unit Tests"

print_info "Running unit tests before deployment..."
if npm run test:unit; then
    print_success "All unit tests passed ✅"
else
    print_error "Unit tests failed!"
    confirm "Deploy anyway? (not recommended)"
fi
echo ""

# Step 3: Push to GitHub
print_header "Step 3: Pushing to GitHub"

print_info "Pushing ${BRANCH} to origin..."
git push origin ${BRANCH}
print_success "Pushed to GitHub successfully"
echo ""

# Step 4: Check Service Worker version
print_header "Step 4: Checking Service Worker"

SW_VERSION=$(grep "CACHE_NAME = " public/sw.js | head -1 || echo "not found")
print_info "Current SW version: ${CYAN}${SW_VERSION}${NC}"

if [[ $SW_VERSION == *"not found"* ]]; then
    print_warning "Service Worker not found or version not set"
fi
echo ""

# Step 5: Deploy to server
print_header "Step 5: Deploying to Production Server"

print_info "Connecting to ${PROD_SERVER}..."

ssh ${PROD_USER}@${PROD_SERVER} bash <<EOF
    set -e
    
    echo "📁 Navigating to deployment directory..."
    cd ${PROD_PATH}
    
    # Pre-deployment backup of voucher store (safety net before container rebuild)
    echo ""
    echo "💾 Pre-deployment backup: voucher store..."
    if [ -f ".voucher-store.json" ]; then
        VOUCHER_BACKUP="voucher-store-backup-\$(date +%Y%m%d-%H%M%S).json"
        cp .voucher-store.json "/tmp/\${VOUCHER_BACKUP}"
        VOUCHER_COUNT=\$(grep -o '"id":' .voucher-store.json 2>/dev/null | wc -l || echo "0")
        echo "✅ Voucher store backed up: \${VOUCHER_BACKUP} (\${VOUCHER_COUNT} vouchers)"
    else
        echo "ℹ️  No .voucher-store.json found (using PostgreSQL or fresh install)"
    fi
    
    echo ""
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
    echo "💾 Creating database backup..."
    
    # Create timestamped backup
    BACKUP_FILE="backup-\$(date +%Y%m%d-%H%M%S).sql.gz"
    
    if docker-compose -f docker-compose.prod.yml exec -T postgres pg_dump -U blinkpos blinkpos 2>/dev/null | gzip > "/tmp/\${BACKUP_FILE}"; then
        BACKUP_SIZE=\$(ls -lh "/tmp/\${BACKUP_FILE}" 2>/dev/null | awk '{print \$5}')
        echo "✅ Database backup created: \${BACKUP_FILE} (\${BACKUP_SIZE})"
    else
        echo "⚠️  Database backup failed (continuing with deployment)"
    fi
    
    echo ""
    echo "📦 Running database migrations..."
    
    # Function to check schema version
    get_schema_version() {
        docker-compose -f docker-compose.prod.yml exec -T postgres psql -U blinkpos -d blinkpos -t -c \
          "SELECT COALESCE(MAX(metric_value::int), 0) FROM system_metrics WHERE metric_name = 'schema_version';" \
          2>/dev/null | tr -d ' \n\r' || echo "0"
    }
    
    # Check current schema version
    SCHEMA_VERSION=\$(get_schema_version)
    echo "📊 Current schema version: \${SCHEMA_VERSION}"
    
    # Apply migration 002 (network communities schema)
    if [ "\${SCHEMA_VERSION}" -lt 2 ]; then
        echo "🔄 Applying migration 002 (network communities schema)..."
        
        if ! docker-compose -f docker-compose.prod.yml exec -T postgres psql -U blinkpos -d blinkpos < database/migrations/002_network_communities.sql 2>&1 | tee /tmp/migration-002.log | grep -v "^$" | tail -20; then
            echo ""
            echo "❌ MIGRATION 002 FAILED!"
            echo "📋 Check logs: /tmp/migration-002.log"
            echo ""
            echo "🔙 Rolling back deployment..."
            docker-compose -f docker-compose.prod.yml down
            echo "❌ Deployment stopped due to migration failure"
            exit 1
        fi
        
        echo "✅ Migration 002 applied successfully"
    else
        echo "✅ Migration 002 already applied (skipping)"
    fi
    
    # Refresh schema version
    SCHEMA_VERSION=\$(get_schema_version)
    
    # Apply migration 003 (seed initial data)
    if [ "\${SCHEMA_VERSION}" -lt 3 ]; then
        echo "🔄 Applying migration 003 (seed initial communities & leaders)..."
        
        if ! docker-compose -f docker-compose.prod.yml exec -T postgres psql -U blinkpos -d blinkpos < database/migrations/003_seed_initial_data.sql 2>&1 | tee /tmp/migration-003.log | grep -v "^$" | tail -20; then
            echo ""
            echo "❌ MIGRATION 003 FAILED!"
            echo "📋 Check logs: /tmp/migration-003.log"
            echo ""
            echo "🔙 Rolling back deployment..."
            docker-compose -f docker-compose.prod.yml down
            echo "❌ Deployment stopped due to migration failure"
            exit 1
        fi
        
        echo "✅ Migration 003 applied successfully"
    else
        echo "✅ Migration 003 already applied (skipping)"
    fi
    
    # Refresh schema version
    SCHEMA_VERSION=\$(get_schema_version)
    
    # Apply migration 004 (add Blink Team community)
    if [ "\${SCHEMA_VERSION}" -lt 4 ]; then
        echo "🔄 Applying migration 004 (add Blink Team community)..."
        
        if ! docker-compose -f docker-compose.prod.yml exec -T postgres psql -U blinkpos -d blinkpos < database/migrations/004_add_blink_team.sql 2>&1 | tee /tmp/migration-004.log | grep -v "^$" | tail -20; then
            echo ""
            echo "❌ MIGRATION 004 FAILED!"
            echo "📋 Check logs: /tmp/migration-004.log"
            echo ""
            echo "🔙 Rolling back deployment..."
            docker-compose -f docker-compose.prod.yml down
            echo "❌ Deployment stopped due to migration failure"
            exit 1
        fi
        
        echo "✅ Migration 004 applied successfully"
    else
        echo "✅ Migration 004 already applied (skipping)"
    fi
    
    # Refresh schema version
    SCHEMA_VERSION=\$(get_schema_version)
    
    # Apply migration 005 (fix pending_applications view)
    if [ "\${SCHEMA_VERSION}" -lt 5 ]; then
        echo "🔄 Applying migration 005 (fix pending_applications view)..."
        
        if ! docker-compose -f docker-compose.prod.yml exec -T postgres psql -U blinkpos -d blinkpos < database/migrations/005_fix_pending_applications_view.sql 2>&1 | tee /tmp/migration-005.log | grep -v "^$" | tail -20; then
            echo ""
            echo "❌ MIGRATION 005 FAILED!"
            echo "📋 Check logs: /tmp/migration-005.log"
            echo ""
            echo "🔙 Rolling back deployment..."
            docker-compose -f docker-compose.prod.yml down
            echo "❌ Deployment stopped due to migration failure"
            exit 1
        fi
        
        echo "✅ Migration 005 applied successfully"
    else
        echo "✅ Migration 005 already applied (skipping)"
    fi
    
    # Refresh schema version
    SCHEMA_VERSION=\$(get_schema_version)
    
    # Apply migration 006 (update Blink Team location/description)
    if [ "\${SCHEMA_VERSION}" -lt 6 ]; then
        echo "🔄 Applying migration 006 (update Blink Team location)..."
        
        if ! docker-compose -f docker-compose.prod.yml exec -T postgres psql -U blinkpos -d blinkpos < database/migrations/006_update_blink_team.sql 2>&1 | tee /tmp/migration-006.log | grep -v "^$" | tail -20; then
            echo ""
            echo "❌ MIGRATION 006 FAILED!"
            echo "📋 Check logs: /tmp/migration-006.log"
            echo ""
            echo "🔙 Rolling back deployment..."
            docker-compose -f docker-compose.prod.yml down
            echo "❌ Deployment stopped due to migration failure"
            exit 1
        fi
        
        echo "✅ Migration 006 applied successfully"
    else
        echo "✅ Migration 006 already applied (skipping)"
    fi
    
    # Refresh schema version
    SCHEMA_VERSION=\$(get_schema_version)
    
    # Apply migration 007 (fix metrics overflow)
    if [ "\${SCHEMA_VERSION}" -lt 7 ]; then
        echo "🔄 Applying migration 007 (fix metrics overflow)..."
        
        if ! docker-compose -f docker-compose.prod.yml exec -T postgres psql -U blinkpos -d blinkpos < database/migrations/007_fix_metrics_overflow.sql 2>&1 | tee /tmp/migration-007.log | grep -v "^$" | tail -20; then
            echo ""
            echo "❌ MIGRATION 007 FAILED!"
            echo "📋 Check logs: /tmp/migration-007.log"
            echo ""
            echo "🔙 Rolling back deployment..."
            docker-compose -f docker-compose.prod.yml down
            echo "❌ Deployment stopped due to migration failure"
            exit 1
        fi
        
        echo "✅ Migration 007 applied successfully"
    else
        echo "✅ Migration 007 already applied (skipping)"
    fi
    
    # Refresh schema version
    SCHEMA_VERSION=\$(get_schema_version)
    
    # Apply migration 008 (vouchers table)
    if [ "\${SCHEMA_VERSION}" -lt 8 ]; then
        echo "🔄 Applying migration 008 (vouchers table for persistent storage)..."
        
        if ! docker-compose -f docker-compose.prod.yml exec -T postgres psql -U blinkpos -d blinkpos < database/migrations/008_vouchers_table.sql 2>&1 | tee /tmp/migration-008.log | grep -v "^$" | tail -20; then
            echo ""
            echo "❌ MIGRATION 008 FAILED!"
            echo "📋 Check logs: /tmp/migration-008.log"
            echo ""
            echo "🔙 Rolling back deployment..."
            docker-compose -f docker-compose.prod.yml down
            echo "❌ Deployment stopped due to migration failure"
            exit 1
        fi
        
        echo "✅ Migration 008 applied successfully"
        
        # Run one-time voucher migration from JSON to PostgreSQL
        echo ""
        echo "🔄 Checking for vouchers to migrate from JSON..."
        if docker-compose -f docker-compose.prod.yml exec -T app sh -c "test -f .voucher-store.json && echo 'exists'" | grep -q 'exists'; then
            echo "📦 Found .voucher-store.json, migrating vouchers to PostgreSQL..."
            docker-compose -f docker-compose.prod.yml exec -T app node scripts/migrate-vouchers-to-postgres.js || echo "⚠️  Voucher migration encountered issues (non-fatal)"
        else
            echo "✅ No JSON voucher store found (fresh installation or already migrated)"
        fi
    else
        echo "✅ Migration 008 already applied (skipping)"
    fi
    
    # Refresh schema version
    SCHEMA_VERSION=\$(get_schema_version)
    
    # Apply migration 009 (add Bitbiashara community)
    if [ "\${SCHEMA_VERSION}" -lt 9 ]; then
        echo "🔄 Applying migration 009 (add Bitbiashara community)..."
        
        if ! docker-compose -f docker-compose.prod.yml exec -T postgres psql -U blinkpos -d blinkpos < database/migrations/009_add_bitbiashara.sql 2>&1 | tee /tmp/migration-009.log | grep -v "^$" | tail -20; then
            echo ""
            echo "❌ MIGRATION 009 FAILED!"
            echo "📋 Check logs: /tmp/migration-009.log"
            echo ""
            echo "🔙 Rolling back deployment..."
            docker-compose -f docker-compose.prod.yml down
            echo "❌ Deployment stopped due to migration failure"
            exit 1
        fi
        
        echo "✅ Migration 009 applied successfully"
    else
        echo "✅ Migration 009 already applied (skipping)"
    fi
    
    # Refresh schema version
    SCHEMA_VERSION=\$(get_schema_version)
    
    # Apply migration 010 (add Afribit Kibera community)
    if [ "\${SCHEMA_VERSION}" -lt 10 ]; then
        echo "🔄 Applying migration 010 (add Afribit Kibera community)..."
        
        if ! docker-compose -f docker-compose.prod.yml exec -T postgres psql -U blinkpos -d blinkpos < database/migrations/010_add_afribit.sql 2>&1 | tee /tmp/migration-010.log | grep -v "^$" | tail -20; then
            echo ""
            echo "❌ MIGRATION 010 FAILED!"
            echo "📋 Check logs: /tmp/migration-010.log"
            echo ""
            echo "🔙 Rolling back deployment..."
            docker-compose -f docker-compose.prod.yml down
            echo "❌ Deployment stopped due to migration failure"
            exit 1
        fi
        
        echo "✅ Migration 010 applied successfully"
    else
        echo "✅ Migration 010 already applied (skipping)"
    fi
    
    # Refresh schema version
    SCHEMA_VERSION=\$(get_schema_version)
    
    # Apply migration 011 (fix Victoria Falls country ZW -> ZM)
    if [ "\${SCHEMA_VERSION}" -lt 11 ]; then
        echo "🔄 Applying migration 011 (fix Victoria Falls country to Zambia)..."
        
        if ! docker-compose -f docker-compose.prod.yml exec -T postgres psql -U blinkpos -d blinkpos < database/migrations/011_fix_victoria_falls_country.sql 2>&1 | tee /tmp/migration-011.log | grep -v "^$" | tail -20; then
            echo ""
            echo "❌ MIGRATION 011 FAILED!"
            echo "📋 Check logs: /tmp/migration-011.log"
            echo ""
            echo "🔙 Rolling back deployment..."
            docker-compose -f docker-compose.prod.yml down
            echo "❌ Deployment stopped due to migration failure"
            exit 1
        fi
        
        echo "✅ Migration 011 applied successfully"
    else
        echo "✅ Migration 011 already applied (skipping)"
    fi
    
    # Refresh schema version
    SCHEMA_VERSION=\$(get_schema_version)
    
    # Apply migration 012 (member balance snapshots for Bitcoin Preference)
    if [ "\${SCHEMA_VERSION}" -lt 12 ]; then
        echo "🔄 Applying migration 012 (member balance snapshots for Bitcoin Preference)..."
        
        if ! docker-compose -f docker-compose.prod.yml exec -T postgres psql -U blinkpos -d blinkpos < database/migrations/012_member_balance_snapshots.sql 2>&1 | tee /tmp/migration-012.log | grep -v "^$" | tail -20; then
            echo ""
            echo "❌ MIGRATION 012 FAILED!"
            echo "📋 Check logs: /tmp/migration-012.log"
            echo ""
            echo "🔙 Rolling back deployment..."
            docker-compose -f docker-compose.prod.yml down
            echo "❌ Deployment stopped due to migration failure"
            exit 1
        fi
        
        echo "✅ Migration 012 applied successfully"
    else
        echo "✅ Migration 012 already applied (skipping)"
    fi
    
    # Refresh schema version
    SCHEMA_VERSION=\$(get_schema_version)
    
    # Apply migration 013 (member removal columns)
    if [ "\${SCHEMA_VERSION}" -lt 13 ]; then
        echo "🔄 Applying migration 013 (member removal columns)..."
        
        if ! docker-compose -f docker-compose.prod.yml exec -T postgres psql -U blinkpos -d blinkpos < database/migrations/013_add_member_removal.sql 2>&1 | tee /tmp/migration-013.log | grep -v "^$" | tail -20; then
            echo ""
            echo "❌ MIGRATION 013 FAILED!"
            echo "📋 Check logs: /tmp/migration-013.log"
            echo ""
            echo "🔙 Rolling back deployment..."
            docker-compose -f docker-compose.prod.yml down
            echo "❌ Deployment stopped due to migration failure"
            exit 1
        fi
        
        echo "✅ Migration 013 applied successfully"
    else
        echo "✅ Migration 013 already applied (skipping)"
    fi
    
    # Display final schema version
    FINAL_VERSION=\$(get_schema_version)
    echo ""
    echo "📊 Final schema version: \${FINAL_VERSION}"
    
    # Verify network tables were created
    echo ""
    echo "📋 Verifying network tables..."
    TABLE_COUNT=\$(docker-compose -f docker-compose.prod.yml exec -T postgres psql -U blinkpos -d blinkpos -t -c \
      "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND (table_name LIKE '%communit%' OR table_name = 'super_admins');" \
      2>/dev/null | tr -d ' \n\r' || echo "0")
    
    if [ "\${TABLE_COUNT}" -ge 5 ]; then
        echo "✅ Network tables verified (\${TABLE_COUNT} tables found)"
    else
        echo "❌ NETWORK TABLES VERIFICATION FAILED!"
        echo "⚠️  Expected at least 5 tables, found \${TABLE_COUNT}"
        echo ""
        echo "🔙 Rolling back deployment..."
        docker-compose -f docker-compose.prod.yml down
        echo "❌ Deployment stopped due to verification failure"
        exit 1
    fi
    
    # Verify vouchers table exists
    echo ""
    echo "📋 Verifying vouchers table..."
    VOUCHER_TABLE=\$(docker-compose -f docker-compose.prod.yml exec -T postgres psql -U blinkpos -d blinkpos -t -c \
      "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'vouchers';" \
      2>/dev/null | tr -d ' \n\r' || echo "0")
    
    if [ "\${VOUCHER_TABLE}" -ge 1 ]; then
        VOUCHER_COUNT=\$(docker-compose -f docker-compose.prod.yml exec -T postgres psql -U blinkpos -d blinkpos -t -c \
          "SELECT COUNT(*) FROM vouchers;" \
          2>/dev/null | tr -d ' \n\r' || echo "0")
        echo "✅ Vouchers table verified (\${VOUCHER_COUNT} vouchers in database)"
    else
        echo "❌ VOUCHERS TABLE NOT FOUND!"
        echo "⚠️  Migration 008 may have failed"
    fi
    
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

# Step 6: Verification
print_header "Step 6: Verifying Deployment"

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
print_info "Verifying database migrations..."

# Check schema version
DEPLOYED_SCHEMA=$(ssh ${PROD_USER}@${PROD_SERVER} "cd ${PROD_PATH} && docker-compose -f docker-compose.prod.yml exec -T postgres psql -U blinkpos -d blinkpos -t -c \"SELECT COALESCE(MAX(metric_value::int), 0) FROM system_metrics WHERE metric_name = 'schema_version';\" 2>/dev/null | tr -d ' \n\r'" || echo "0")

if [ "${DEPLOYED_SCHEMA}" -ge 13 ]; then
    print_success "Database schema up to date (version ${DEPLOYED_SCHEMA})"
else
    print_warning "Database schema may need attention (version ${DEPLOYED_SCHEMA}, expected 13+)"
fi

# Check voucher persistence
VOUCHER_COUNT=$(ssh ${PROD_USER}@${PROD_SERVER} "cd ${PROD_PATH} && docker-compose -f docker-compose.prod.yml exec -T postgres psql -U blinkpos -d blinkpos -t -c \"SELECT COUNT(*) FROM vouchers WHERE status = 'ACTIVE';\" 2>/dev/null | tr -d ' \n\r'" || echo "0")

print_success "Vouchers in PostgreSQL: ${VOUCHER_COUNT} active"

# Check if communities exist
COMMUNITY_COUNT=$(ssh ${PROD_USER}@${PROD_SERVER} "cd ${PROD_PATH} && docker-compose -f docker-compose.prod.yml exec -T postgres psql -U blinkpos -d blinkpos -t -c \"SELECT COUNT(*) FROM communities;\" 2>/dev/null | tr -d ' \n\r'" || echo "0")

if [ "${COMMUNITY_COUNT}" -ge 5 ]; then
    print_success "Communities seeded (${COMMUNITY_COUNT} communities found)"
else
    print_warning "Communities may need verification (${COMMUNITY_COUNT} found, expected 5+)"
fi

echo ""

# Step 7: Post-deployment info
print_header "📋 Post-Deployment Checklist"

echo ""
echo "Please verify:"
echo "  • Open https://track.twentyone.ist in incognito mode"
echo "  • Check that UI changes are visible"
echo "  • Test key functionality (create invoice, NFC, etc.)"
echo "  • Check browser console for errors"
echo "  • Verify Network communities: Should show 5 pioneer communities (Bitcoin Ekasi, Victoria Falls, Blink Team, Bitbiashara, Afribit Kibera)"
echo "  • Test membership application and approval flow"
echo "  • Deploy again to verify member data persists across deployments"
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

