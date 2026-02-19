#!/bin/bash

# BlinkPOS Dev Environment - Start Script

echo ""
echo "🚀 Starting BlinkPOS Development Environment..."
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "⚠️  Docker is not running!"
    echo ""
    echo "Please start Docker first:"
    echo "  • Docker Desktop: Open the application"
    echo "  • Linux: sudo systemctl start docker"
    echo ""
    exit 1
fi

# Clear Next.js cache to ensure fresh build
echo "0️⃣  Clearing Next.js cache..."
rm -rf .next/cache 2>/dev/null
echo "   ✅ Cache cleared"
echo ""

# Start Docker containers
echo "1️⃣  Starting Docker containers..."
docker start blinkpos-postgres blinkpos-redis blinkpos-pgadmin blinkpos-redis-commander 2>/dev/null

if [ $? -ne 0 ]; then
    echo "   ⚠️  Containers not found. Creating them..."
    echo ""
    echo "   Please run the Docker setup first:"
    echo "   cd ~/Documents/BLINK/blink-terminal"
    echo "   docker-compose up -d"
    echo ""
    exit 1
fi

echo "   ✅ Docker containers started"

# Wait for databases to initialize
echo ""
echo "2️⃣  Waiting for databases to initialize..."
sleep 5

# Check if containers are healthy
RUNNING=$(docker ps --filter "name=blinkpos" --format "{{.Names}}" | wc -l)

if [ $RUNNING -ge 4 ]; then
    echo "   ✅ All containers are running"
else
    echo "   ⚠️  Only $RUNNING/4 containers running"
    echo ""
    echo "   Running containers:"
    docker ps --format "   • {{.Names}}" | grep blinkpos
    echo ""
    echo "   Check logs with: docker logs <container-name>"
    echo ""
fi

# Show status
echo ""
echo "3️⃣  Services Available:"
echo "   • PostgreSQL:        localhost:5432"
echo "   • Redis:             localhost:6379"
echo "   • pgAdmin:           http://localhost:5050"
echo "   • Redis Commander:   http://localhost:8081"

# Ask if user wants to start Next.js
echo ""
echo "4️⃣  Start Next.js dev server?"
echo ""
echo "   Option A: Start in foreground (recommended for development)"
echo "   Option B: Start in background"
echo "   Option C: Skip (start manually later)"
echo ""
read -p "   Choose [A/B/C]: " choice

case $choice in
    [Aa]* )
        echo ""
        echo "   Starting Next.js in foreground..."
        echo "   Press Ctrl+C to stop the dev server"
        echo ""
        sleep 2
        npm run dev
        ;;
    [Bb]* )
        echo ""
        echo "   Starting Next.js in background..."
        npm run dev > /tmp/blinkpos-dev.log 2>&1 &
        echo "   ✅ Next.js started (PID: $!)"
        echo ""
        echo "   View logs: tail -f /tmp/blinkpos-dev.log"
        echo "   Stop: pkill -f 'next dev'"
        echo ""
        ;;
    * )
        echo ""
        echo "   Skipped. Start manually when ready:"
        echo "   cd ~/Documents/BLINK/blink-terminal"
        echo "   npm run dev"
        echo ""
        ;;
esac

# Show final status
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Dev Environment Ready!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🌐 Open in browser:"
echo "   http://localhost:3000"
echo ""
echo "📊 Management Tools:"
echo "   • pgAdmin (Database):  http://localhost:5050"
echo "   • Redis Commander:     http://localhost:8081"
echo ""
echo "🛑 To stop everything:"
echo "   ./dev-stop.sh"
echo ""



