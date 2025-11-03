#!/bin/bash
# Search for a specific payment by hash (partial match)

if [ -z "$1" ]; then
    echo "Usage: ./prod-search-payment.sh <payment_hash_prefix>"
    echo "Example: ./prod-search-payment.sh 056d7a40"
    exit 1
fi

HASH_PREFIX="$1"

echo "🔍 Searching for payment starting with: $HASH_PREFIX"
echo ""

echo "Payment Details:"
ssh ubuntu@track.twentyone.ist "cd /var/www/blinkpos && docker-compose -f docker-compose.prod.yml exec -T postgres psql -U blinkpos -d blinkpos -c \"
SELECT 
  payment_hash,
  total_amount,
  base_amount,
  tip_amount,
  tip_recipient,
  display_currency,
  status,
  created_at,
  processed_at
FROM payment_splits 
WHERE payment_hash LIKE '$HASH_PREFIX%'
ORDER BY created_at DESC;
\""

echo ""
echo "Payment Events:"
ssh ubuntu@track.twentyone.ist "cd /var/www/blinkpos && docker-compose -f docker-compose.prod.yml exec -T postgres psql -U blinkpos -d blinkpos -c \"
SELECT 
  event_type,
  event_status,
  created_at
FROM payment_events 
WHERE payment_hash LIKE '$HASH_PREFIX%'
ORDER BY created_at ASC;
\""

