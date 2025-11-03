#!/bin/bash
# Check production system health and resource usage

echo "🏥 Production System Health"
echo "============================"
echo ""

echo "Container Status:"
ssh ubuntu@track.twentyone.ist "cd /var/www/blinkpos && docker-compose -f docker-compose.prod.yml ps"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "API Health Check:"
curl -s https://track.twentyone.ist/api/health | jq '.'

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "Resource Usage:"
ssh ubuntu@track.twentyone.ist "free -h && echo '' && df -h / && echo '' && docker stats --no-stream"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "Database Stats:"
ssh ubuntu@track.twentyone.ist "cd /var/www/blinkpos && docker-compose -f docker-compose.prod.yml exec -T postgres psql -U blinkpos -d blinkpos -c \"
SELECT 
  'Total Payments' as metric, COUNT(*)::TEXT as value FROM payment_splits
UNION ALL
SELECT 
  'Completed' as metric, COUNT(*)::TEXT FROM payment_splits WHERE status = 'completed'
UNION ALL
SELECT 
  'Pending' as metric, COUNT(*)::TEXT FROM payment_splits WHERE status = 'pending'
UNION ALL
SELECT 
  'Total Volume (sats)' as metric, SUM(total_amount)::TEXT FROM payment_splits WHERE status = 'completed'
UNION ALL
SELECT 
  'Total Tips (sats)' as metric, SUM(tip_amount)::TEXT FROM payment_splits WHERE status = 'completed';
\""

echo ""
echo "Redis Stats:"
ssh ubuntu@track.twentyone.ist "cd /var/www/blinkpos && docker-compose -f docker-compose.prod.yml exec -T redis redis-cli INFO memory | grep -E 'used_memory_human|maxmemory_human' && docker-compose -f docker-compose.prod.yml exec -T redis redis-cli DBSIZE | xargs echo 'Keys in cache:'"

