#!/bin/bash
# View all payments this month

echo "📅 All Payments This Month"
echo "========================="
echo ""

ssh ubuntu@track.twentyone.ist "cd /var/www/blinkpos && docker-compose -f docker-compose.prod.yml exec -T postgres psql -U blinkpos -d blinkpos -c \"
SELECT 
  LEFT(payment_hash, 16) || '...' as payment,
  total_amount as sats,
  base_amount as base,
  tip_amount as tip,
  COALESCE(tip_recipient, '-') as recipient,
  status,
  TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS') as created
FROM payment_splits
WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE)
ORDER BY created_at DESC;
\""

echo ""
echo "📊 This Month's Summary"
echo "======================="
ssh ubuntu@track.twentyone.ist "cd /var/www/blinkpos && docker-compose -f docker-compose.prod.yml exec -T postgres psql -U blinkpos -d blinkpos -c \"
SELECT 
  COUNT(*) as total_payments,
  SUM(total_amount) as total_sats,
  SUM(base_amount) as merchant_sats,
  SUM(tip_amount) as tips_sats,
  AVG(total_amount)::int as avg_payment,
  COUNT(DISTINCT tip_recipient) as unique_recipients
FROM payment_splits
WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE)
  AND status = 'completed';
\""


