#!/bin/bash
# View tips received by specific person

if [ -z "$1" ]; then
    echo "Usage: ./prod-view-tips.sh <recipient_username>"
    echo "Example: ./prod-view-tips.sh elturco"
    exit 1
fi

RECIPIENT="$1"

echo "💰 Tips Received by: $RECIPIENT"
echo "=============================="
echo ""

ssh ubuntu@track.twentyone.ist "cd /var/www/blinkpos && docker-compose -f docker-compose.prod.yml exec -T postgres psql -U blinkpos -d blinkpos -c \"
SELECT 
  LEFT(payment_hash, 16) || '...' as payment,
  tip_amount as tip_sats,
  total_amount as total_sats,
  memo,
  TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS') as created,
  status
FROM payment_splits
WHERE tip_recipient = '$RECIPIENT'
  AND status = 'completed'
ORDER BY created_at DESC;
\""

echo ""
echo "📊 Total Tips Summary"
echo "===================="
ssh ubuntu@track.twentyone.ist "cd /var/www/blinkpos && docker-compose -f docker-compose.prod.yml exec -T postgres psql -U blinkpos -d blinkpos -c \"
SELECT 
  tip_recipient,
  COUNT(*) as total_tips,
  SUM(tip_amount) as total_tips_sats,
  AVG(tip_amount)::int as avg_tip_sats,
  MIN(tip_amount) as min_tip,
  MAX(tip_amount) as max_tip,
  TO_CHAR(MAX(created_at), 'YYYY-MM-DD') as last_tip_date
FROM payment_splits
WHERE tip_recipient = '$RECIPIENT'
  AND status = 'completed'
GROUP BY tip_recipient;
\""


