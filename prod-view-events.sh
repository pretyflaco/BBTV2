#!/bin/bash
# View recent payment events from production

echo "📋 Recent Payment Events"
echo "========================"
echo ""

ssh ubuntu@track.twentyone.ist "cd /var/www/blinkpos && docker-compose -f docker-compose.prod.yml exec -T postgres psql -U blinkpos -d blinkpos -c \"
SELECT 
  LEFT(payment_hash, 16) || '...' as payment,
  event_type,
  event_status,
  TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS') as timestamp
FROM payment_events 
ORDER BY created_at DESC 
LIMIT 30;
\""

