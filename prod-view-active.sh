#!/bin/bash
# View active (pending) payments from production

echo "⏳ Active Payments (Pending/Processing)"
echo "========================================"
echo ""

ssh ubuntu@track.twentyone.ist "cd /var/www/blinkpos && docker-compose -f docker-compose.prod.yml exec -T postgres psql -U blinkpos -d blinkpos -c \"
SELECT 
  LEFT(payment_hash, 16) || '...' as payment_hash,
  total_amount as sats,
  status,
  TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS') as created,
  TO_CHAR(expires_at, 'YYYY-MM-DD HH24:MI:SS') as expires,
  EXTRACT(EPOCH FROM (expires_at - NOW()))::INTEGER as seconds_left
FROM payment_splits 
WHERE status IN ('pending', 'processing')
ORDER BY created_at DESC;
\""

echo ""
echo "Redis Cache (Active Invoices):"
ssh ubuntu@track.twentyone.ist "cd /var/www/blinkpos && docker-compose -f docker-compose.prod.yml exec -T redis redis-cli --scan --pattern 'blinkpos:payment:*' | wc -l | xargs echo 'Active invoices in Redis cache:'"

