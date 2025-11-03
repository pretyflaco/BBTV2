#!/bin/bash

# BlinkPOS Dev Environment - Status Check

echo ""
echo "📊 BlinkPOS Development Environment Status"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check Docker
echo ""
echo "🐳 Docker:"
if docker info > /dev/null 2>&1; then
    echo "   ✅ Running"
else
    echo "   ❌ Not running"
    echo ""
    echo "   Start Docker first:"
    echo "   • Docker Desktop: Open the application"
    echo "   • Linux: sudo systemctl start docker"
    echo ""
    exit 1
fi

# Check containers
echo ""
echo "📦 Docker Containers:"
CONTAINERS=("blinkpos-postgres" "blinkpos-redis" "blinkpos-pgadmin" "blinkpos-redis-commander")
for container in "${CONTAINERS[@]}"; do
    if docker ps --format "{{.Names}}" | grep -q "^${container}$"; then
        STATUS="✅ Running"
    elif docker ps -a --format "{{.Names}}" | grep -q "^${container}$"; then
        STATUS="⏸️  Stopped"
    else
        STATUS="❌ Not created"
    fi
    echo "   • $container: $STATUS"
done

# Check Next.js
echo ""
echo "⚛️  Next.js Dev Server:"
if pgrep -f "next dev" > /dev/null; then
    PID=$(pgrep -f "next dev")
    echo "   ✅ Running (PID: $PID)"
    
    # Check if it's responding
    if curl -s http://localhost:3000 > /dev/null; then
        echo "   ✅ Responding at http://localhost:3000"
    else
        echo "   ⚠️  Process running but not responding"
    fi
else
    echo "   ❌ Not running"
fi

# Check port 3000
echo ""
echo "🔌 Port 3000:"
if lsof -i:3000 > /dev/null 2>&1; then
    PROCESS=$(lsof -i:3000 | tail -1 | awk '{print $1}')
    echo "   ✅ In use by: $PROCESS"
else
    echo "   ⏸️  Available"
fi

# Check database connections
echo ""
echo "🗄️  Database Connections:"

# PostgreSQL
if docker exec blinkpos-postgres pg_isready -U blinkpos > /dev/null 2>&1; then
    echo "   • PostgreSQL: ✅ Accepting connections"
    
    # Count payment records
    PAYMENTS=$(docker exec blinkpos-postgres psql -U blinkpos -d blinkpos -t -c "SELECT COUNT(*) FROM payment_splits;" 2>/dev/null | tr -d ' ')
    if [ ! -z "$PAYMENTS" ]; then
        echo "     └─ Payment records: $PAYMENTS"
    fi
else
    echo "   • PostgreSQL: ❌ Not accepting connections"
fi

# Redis
if docker exec blinkpos-redis redis-cli ping > /dev/null 2>&1; then
    echo "   • Redis: ✅ Responding"
    
    # Count cached payments
    CACHED=$(docker exec blinkpos-redis redis-cli KEYS "blinkpos:payment:*" 2>/dev/null | wc -l)
    echo "     └─ Cached payments: $CACHED"
else
    echo "   • Redis: ❌ Not responding"
fi

# Show available URLs
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🌐 Available Services:"
echo ""

if pgrep -f "next dev" > /dev/null && curl -s http://localhost:3000 > /dev/null; then
    echo "   ✅ BlinkPOS App:     http://localhost:3000"
else
    echo "   ⏸️  BlinkPOS App:     http://localhost:3000 (not running)"
fi

if docker ps --format "{{.Names}}" | grep -q "blinkpos-pgadmin"; then
    echo "   ✅ pgAdmin:          http://localhost:5050"
else
    echo "   ⏸️  pgAdmin:          http://localhost:5050 (not running)"
fi

if docker ps --format "{{.Names}}" | grep -q "blinkpos-redis-commander"; then
    echo "   ✅ Redis Commander:  http://localhost:8081"
else
    echo "   ⏸️  Redis Commander:  http://localhost:8081 (not running)"
fi

# Show resource usage
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "💾 Resource Usage:"
echo ""

# Docker stats (if any containers running)
RUNNING=$(docker ps -q | wc -l)
if [ $RUNNING -gt 0 ]; then
    docker stats --no-stream --format "   {{.Name}}: CPU {{.CPUPerc}} | RAM {{.MemUsage}}" | grep blinkpos
else
    echo "   (No containers running)"
fi

# Suggestions
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "💡 Quick Actions:"
echo ""

ALL_RUNNING=true
for container in "${CONTAINERS[@]}"; do
    if ! docker ps --format "{{.Names}}" | grep -q "^${container}$"; then
        ALL_RUNNING=false
    fi
done

if [ "$ALL_RUNNING" = false ]; then
    echo "   🚀 Start all services:   ./dev-start.sh"
fi

if [ "$ALL_RUNNING" = true ] && ! pgrep -f "next dev" > /dev/null; then
    echo "   ⚛️  Start Next.js:        npm run dev"
fi

if [ "$ALL_RUNNING" = true ] || pgrep -f "next dev" > /dev/null; then
    echo "   🛑 Stop all services:    ./dev-stop.sh"
fi

echo "   📊 View transactions:    node scripts/view-transactions.js --summary"
echo "   📖 View logs:            docker logs blinkpos-postgres"
echo ""



