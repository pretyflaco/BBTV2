#!/bin/bash
# View active/pending/failed payments from production database

echo "⏳ Active/Pending Payments"
echo "=========================="
echo ""

ssh ubuntu@track.twentyone.ist "cd /var/www/blinkpos && docker-compose -f docker-compose.prod.yml exec -T postgres psql -U blinkpos -d blinkpos -c \"
SELECT 
  LEFT(payment_hash, 16) || '...' as payment,
  total_amount as sats,
  status,
  TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS') as created,
  ROUND(EXTRACT(EPOCH FROM (NOW() - created_at))/60)::int as minutes_ago,
  memo
FROM payment_splits
WHERE status IN ('pending', 'processing', 'failed')
ORDER BY created_at DESC;
\""

echo ""
echo "🚨 Stuck Payments (>1 hour in pending)"
echo "======================================"
echo ""

ssh ubuntu@track.twentyone.ist "cd /var/www/blinkpos && docker-compose -f docker-compose.prod.yml exec -T postgres psql -U blinkpos -d blinkpos -c \"
SELECT 
  LEFT(payment_hash, 16) || '...' as payment,
  total_amount as sats,
  status,
  TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS') as created,
  ROUND(EXTRACT(EPOCH FROM (NOW() - created_at))/3600, 1) as hours_ago
FROM payment_splits
WHERE status = 'pending'
  AND created_at < NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;
\""

echo ""
echo "📊 Redis Cache (Active Invoices):"
ssh ubuntu@track.twentyone.ist "cd /var/www/blinkpos && docker-compose -f docker-compose.prod.yml exec -T redis redis-cli --scan --pattern 'blinkpos:payment:*' | wc -l | xargs echo 'Active invoices in Redis cache:'"

