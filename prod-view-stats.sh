#!/bin/bash
# View comprehensive payment statistics from production database

echo "📊 Overall Payment Statistics"
echo "=============================="
echo ""

ssh ubuntu@track.twentyone.ist "cd /var/www/blinkpos && docker-compose -f docker-compose.prod.yml exec -T postgres psql -U blinkpos -d blinkpos -c \"
SELECT 
  COUNT(*) as total_payments,
  SUM(total_amount) as total_sats,
  SUM(base_amount) as merchant_sats,
  SUM(tip_amount) as tips_sats,
  AVG(total_amount)::int as avg_payment,
  COUNT(DISTINCT tip_recipient) as unique_recipients,
  COUNT(DISTINCT display_currency) as currencies_used
FROM payment_splits
WHERE status = 'completed';
\""

echo ""
echo "📅 Daily Revenue Summary (Last 30 Days)"
echo "======================================="
echo ""

ssh ubuntu@track.twentyone.ist "cd /var/www/blinkpos && docker-compose -f docker-compose.prod.yml exec -T postgres psql -U blinkpos -d blinkpos -c \"
SELECT 
  DATE(created_at) as date,
  COUNT(*) as num_payments,
  SUM(total_amount) as total_revenue_sats,
  SUM(base_amount) as merchant_amount_sats,
  SUM(tip_amount) as tips_amount_sats,
  AVG(total_amount)::int as avg_payment_sats
FROM payment_splits
WHERE status = 'completed'
GROUP BY DATE(created_at)
ORDER BY date DESC
LIMIT 30;
\""

echo ""
echo "🏆 Top Tip Recipients (All Time)"
echo "================================"
echo ""

ssh ubuntu@track.twentyone.ist "cd /var/www/blinkpos && docker-compose -f docker-compose.prod.yml exec -T postgres psql -U blinkpos -d blinkpos -c \"
SELECT 
  tip_recipient,
  COUNT(*) as total_payments,
  SUM(tip_amount) as total_tips_sats,
  AVG(tip_amount)::int as avg_tip_sats,
  MIN(tip_amount) as min_tip,
  MAX(tip_amount) as max_tip
FROM payment_splits
WHERE tip_amount > 0 AND status = 'completed'
GROUP BY tip_recipient
ORDER BY total_tips_sats DESC
LIMIT 10;
\""

echo ""
echo "💱 Payments by Currency"
echo "======================"
echo ""

ssh ubuntu@track.twentyone.ist "cd /var/www/blinkpos && docker-compose -f docker-compose.prod.yml exec -T postgres psql -U blinkpos -d blinkpos -c \"
SELECT 
  display_currency,
  COUNT(*) as num_payments,
  SUM(total_amount) as total_sats,
  AVG(total_amount)::int as avg_sats
FROM payment_splits
WHERE status = 'completed'
GROUP BY display_currency
ORDER BY num_payments DESC;
\""

echo ""
echo "📈 Status Breakdown"
echo "=================="
echo ""

ssh ubuntu@track.twentyone.ist "cd /var/www/blinkpos && docker-compose -f docker-compose.prod.yml exec -T postgres psql -U blinkpos -d blinkpos -c \"
SELECT 
  status,
  COUNT(*) as count,
  SUM(total_amount) as total_sats,
  AVG(total_amount)::INTEGER as avg_sats
FROM payment_splits 
GROUP BY status 
ORDER BY count DESC;
\""

