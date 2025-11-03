#!/bin/bash
# Search for specific payment by hash in production database

if [ -z "$1" ]; then
    echo "Usage: ./prod-search-payment.sh <payment_hash_prefix>"
    echo "Example: ./prod-search-payment.sh 056d7a40"
    exit 1
fi

HASH_PREFIX="$1"

echo "🔍 Searching for payment: $HASH_PREFIX"
echo ""

echo "💳 Payment Details"
echo "=================="
ssh ubuntu@track.twentyone.ist "cd /var/www/blinkpos && docker-compose -f docker-compose.prod.yml exec -T postgres psql -U blinkpos -d blinkpos -c \"
SELECT 
  payment_hash,
  total_amount,
  base_amount,
  tip_amount,
  tip_recipient,
  display_currency,
  status,
  memo,
  TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS') as created,
  TO_CHAR(processed_at, 'YYYY-MM-DD HH24:MI:SS') as processed
FROM payment_splits 
WHERE payment_hash LIKE '$HASH_PREFIX%'
ORDER BY created_at DESC;
\""

echo ""
echo "📝 Full Event History (Audit Trail)"
echo "==================================="
ssh ubuntu@track.twentyone.ist "cd /var/www/blinkpos && docker-compose -f docker-compose.prod.yml exec -T postgres psql -U blinkpos -d blinkpos -c \"
SELECT 
  ps.payment_hash,
  ps.total_amount,
  ps.tip_recipient,
  pe.event_type,
  pe.event_status,
  pe.event_data,
  TO_CHAR(pe.created_at, 'YYYY-MM-DD HH24:MI:SS') as timestamp
FROM payment_splits ps
LEFT JOIN payment_events pe ON ps.payment_hash = pe.payment_hash
WHERE ps.payment_hash LIKE '$HASH_PREFIX%'
ORDER BY pe.created_at ASC;
\""

