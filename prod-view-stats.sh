#!/bin/bash
# View payment statistics from production database

echo "📊 Payment Statistics"
echo "===================="
echo ""

echo "Status Breakdown:"
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

echo ""
echo "Daily Summary (Last 7 Days):"
ssh ubuntu@track.twentyone.ist "cd /var/www/blinkpos && docker-compose -f docker-compose.prod.yml exec -T postgres psql -U blinkpos -d blinkpos -c \"
SELECT 
  DATE(created_at) as date,
  COUNT(*) as payments,
  SUM(total_amount) as total_sats,
  SUM(tip_amount) as tips_sats,
  COUNT(DISTINCT tip_recipient) as unique_recipients
FROM payment_splits 
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;
\""

echo ""
echo "Top Tip Recipients:"
ssh ubuntu@track.twentyone.ist "cd /var/www/blinkpos && docker-compose -f docker-compose.prod.yml exec -T postgres psql -U blinkpos -d blinkpos -c \"
SELECT 
  tip_recipient,
  COUNT(*) as tip_count,
  SUM(tip_amount) as total_tips_sats,
  AVG(tip_amount)::INTEGER as avg_tip_sats,
  MAX(created_at)::DATE as last_tip
FROM payment_splits 
WHERE tip_recipient IS NOT NULL AND status = 'completed'
GROUP BY tip_recipient
ORDER BY total_tips_sats DESC
LIMIT 10;
\""

