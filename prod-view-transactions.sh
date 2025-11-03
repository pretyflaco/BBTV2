#!/bin/bash
# View recent transactions from production database

echo "🔍 Recent Payment Transactions"
echo "=============================="
echo ""

ssh ubuntu@track.twentyone.ist "cd /var/www/blinkpos && docker-compose -f docker-compose.prod.yml exec -T postgres psql -U blinkpos -d blinkpos -c \"
SELECT 
  LEFT(payment_hash, 16) || '...' as payment,
  total_amount as sats,
  base_amount as base,
  tip_amount as tip,
  COALESCE(tip_recipient, '-') as recipient,
  status,
  display_currency as curr,
  memo,
  TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS') as created
FROM payment_splits 
ORDER BY created_at DESC 
LIMIT 50;
\""

