#!/bin/bash
# View hourly payment volume for today

echo "🕐 Hourly Payment Volume (Today)"
echo "================================"
echo ""

ssh ubuntu@track.twentyone.ist "cd /var/www/blinkpos && docker-compose -f docker-compose.prod.yml exec -T postgres psql -U blinkpos -d blinkpos -c \"
SELECT 
  EXTRACT(HOUR FROM created_at)::int as hour,
  COUNT(*) as num_payments,
  SUM(total_amount) as total_sats,
  AVG(total_amount)::int as avg_sats
FROM payment_splits
WHERE DATE(created_at) = CURRENT_DATE
  AND status = 'completed'
GROUP BY EXTRACT(HOUR FROM created_at)
ORDER BY hour;
\""

echo ""
echo "📊 Peak Hours Analysis"
echo "====================="
ssh ubuntu@track.twentyone.ist "cd /var/www/blinkpos && docker-compose -f docker-compose.prod.yml exec -T postgres psql -U blinkpos -d blinkpos -c \"
SELECT 
  EXTRACT(HOUR FROM created_at)::int as peak_hour,
  COUNT(*) as payments,
  SUM(total_amount) as sats
FROM payment_splits
WHERE DATE(created_at) = CURRENT_DATE
  AND status = 'completed'
GROUP BY EXTRACT(HOUR FROM created_at)
ORDER BY payments DESC
LIMIT 3;
\""


