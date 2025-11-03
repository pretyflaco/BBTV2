#!/bin/bash
# View recent transactions from production database

echo "🔍 Fetching recent transactions from production..."
echo ""

ssh ubuntu@track.twentyone.ist "cd /var/www/blinkpos && docker-compose -f docker-compose.prod.yml exec -T postgres psql -U blinkpos -d blinkpos -c \"
SELECT 
  LEFT(payment_hash, 16) || '...' as payment_hash,
  total_amount as total_sats,
  base_amount as base_sats,
  tip_amount as tip_sats,
  COALESCE(tip_recipient, 'none') as tip_recipient,
  status,
  TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS') as created,
  TO_CHAR(processed_at, 'YYYY-MM-DD HH24:MI:SS') as processed
FROM payment_splits 
ORDER BY created_at DESC 
LIMIT 20;
\""

