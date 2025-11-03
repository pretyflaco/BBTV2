#!/bin/bash
# View all payments made today

echo "📅 All Payments Today"
echo "===================="
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
  TO_CHAR(created_at, 'HH24:MI:SS') as time
FROM payment_splits
WHERE DATE(created_at) = CURRENT_DATE
ORDER BY created_at DESC;
\""

echo ""
echo "📊 Today's Summary"
echo "================="
ssh ubuntu@track.twentyone.ist "cd /var/www/blinkpos && docker-compose -f docker-compose.prod.yml exec -T postgres psql -U blinkpos -d blinkpos -c \"
SELECT 
  COUNT(*) as total_payments,
  SUM(total_amount) as total_sats,
  SUM(tip_amount) as tips_sats,
  AVG(total_amount)::int as avg_payment
FROM payment_splits
WHERE DATE(created_at) = CURRENT_DATE AND status = 'completed';
\""


