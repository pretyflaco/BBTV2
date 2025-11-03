#!/bin/bash

# BlinkPOS Dev Environment - Stop Script

echo ""
echo "🔴 Stopping BlinkPOS Development Environment..."
echo ""

# Stop Next.js dev server
echo "1️⃣  Stopping Next.js dev server..."
pkill -f "next dev" 2>/dev/null
if [ $? -eq 0 ]; then
    echo "   ✅ Next.js stopped"
else
    echo "   ℹ️  Next.js was not running"
fi

# Stop Docker containers
echo ""
echo "2️⃣  Stopping Docker containers..."
docker stop blinkpos-postgres blinkpos-redis blinkpos-pgadmin blinkpos-redis-commander 2>/dev/null

if [ $? -eq 0 ]; then
    echo "   ✅ Docker containers stopped"
else
    echo "   ℹ️  Docker containers were not running"
fi

# Show status
echo ""
echo "3️⃣  Current Status:"
RUNNING=$(docker ps --format "{{.Names}}" | grep blinkpos | wc -l)

if [ $RUNNING -eq 0 ]; then
    echo "   ✅ All containers stopped"
    echo ""
    echo "💤 Dev environment is shut down!"
    echo ""
    echo "📝 Your data is preserved in Docker volumes:"
    echo "   • PostgreSQL data"
    echo "   • Redis data"
    echo "   • pgAdmin settings"
    echo ""
    echo "🌅 To start again tomorrow:"
    echo "   ./dev-start.sh"
    echo ""
else
    echo "   ⚠️  Some containers still running:"
    docker ps --format "   • {{.Names}}" | grep blinkpos
    echo ""
    echo "Run this script again or stop manually:"
    echo "   docker stop \$(docker ps -q)"
    echo ""
fi



