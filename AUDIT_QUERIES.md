# Audit Queries Guide

Quick reference for viewing transaction data for audit purposes.

## 🔗 Quick Access

### pgAdmin (GUI)
- **URL**: http://localhost:5050
- **Email**: admin@blinkpos.com
- **Password**: admin

### PostgreSQL CLI
```bash
# Via Docker
docker exec -it blinkpos-postgres psql -U blinkpos -d blinkpos

# Direct connection
psql -h localhost -p 5432 -U blinkpos -d blinkpos
# Password: blinkpos_dev_password
```

---

## 📊 Key Tables

### `payment_splits`
Main table with all payment split information:
- `payment_hash` - Unique payment identifier
- `total_amount`, `base_amount`, `tip_amount` - Amounts in satoshis
- `tip_recipient` - Who received the tip
- `user_wallet_id` - Merchant wallet ID
- `status` - Payment status (pending/processing/completed/failed)
- `created_at`, `processed_at` - Timestamps
- `display_currency` - Currency used at POS (USD, BTC, etc.)
- `memo` - Payment description

### `payment_events`
Audit log of all events:
- `payment_hash` - Links to payment_splits
- `event_type` - Type of event (created, forwarded, status_*, etc.)
- `event_status` - success/error
- `event_data` - JSON with additional details
- `created_at` - When event occurred

### `tip_recipient_stats`
Aggregated statistics per recipient per month:
- `tip_recipient` - Blink username
- `month` - YYYY-MM format
- `total_tips_received` - Total sats received
- `tips_count` - Number of tips
- `avg_tip_amount` - Average tip size

---

## 🔍 Common Audit Queries

### 1. All Payments Today
```sql
SELECT 
  payment_hash,
  total_amount,
  base_amount,
  tip_amount,
  tip_recipient,
  status,
  display_currency,
  memo,
  created_at
FROM payment_splits
WHERE DATE(created_at) = CURRENT_DATE
ORDER BY created_at DESC;
```

### 2. All Payments This Month
```sql
SELECT 
  payment_hash,
  total_amount,
  base_amount,
  tip_amount,
  tip_recipient,
  status,
  created_at
FROM payment_splits
WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE)
ORDER BY created_at DESC;
```

### 3. Payments by Date Range
```sql
SELECT 
  payment_hash,
  total_amount,
  base_amount,
  tip_amount,
  tip_recipient,
  status,
  created_at
FROM payment_splits
WHERE created_at BETWEEN '2025-10-01' AND '2025-10-31'
ORDER BY created_at DESC;
```

### 4. Tips Received by Specific Person
```sql
SELECT 
  payment_hash,
  tip_amount,
  total_amount,
  memo,
  created_at,
  status
FROM payment_splits
WHERE tip_recipient = 'elturco'
  AND status = 'completed'
ORDER BY created_at DESC;
```

### 5. Total Tips by Recipient (All Time)
```sql
SELECT 
  tip_recipient,
  COUNT(*) as total_payments,
  SUM(tip_amount) as total_tips_sats,
  AVG(tip_amount) as avg_tip_sats,
  MIN(tip_amount) as min_tip,
  MAX(tip_amount) as max_tip
FROM payment_splits
WHERE tip_amount > 0 
  AND status = 'completed'
GROUP BY tip_recipient
ORDER BY total_tips_sats DESC;
```

### 6. Daily Revenue Summary
```sql
SELECT 
  DATE(created_at) as date,
  COUNT(*) as num_payments,
  SUM(total_amount) as total_revenue_sats,
  SUM(base_amount) as merchant_amount_sats,
  SUM(tip_amount) as tips_amount_sats,
  AVG(total_amount) as avg_payment_sats
FROM payment_splits
WHERE status = 'completed'
GROUP BY DATE(created_at)
ORDER BY date DESC
LIMIT 30;
```

### 7. Failed/Pending Payments (Issues to Investigate)
```sql
SELECT 
  payment_hash,
  total_amount,
  status,
  created_at,
  EXTRACT(EPOCH FROM (NOW() - created_at))/60 as minutes_ago,
  memo
FROM payment_splits
WHERE status IN ('pending', 'failed')
ORDER BY created_at DESC;
```

### 8. Payment Event History (Full Audit Trail)
```sql
SELECT 
  ps.payment_hash,
  ps.total_amount,
  ps.tip_recipient,
  pe.event_type,
  pe.event_status,
  pe.event_data,
  pe.created_at
FROM payment_splits ps
LEFT JOIN payment_events pe ON ps.payment_hash = pe.payment_hash
WHERE ps.payment_hash = 'YOUR_PAYMENT_HASH_HERE'
ORDER BY pe.created_at ASC;
```

### 9. Payments by Currency Used
```sql
SELECT 
  display_currency,
  COUNT(*) as num_payments,
  SUM(total_amount) as total_sats,
  AVG(total_amount) as avg_sats
FROM payment_splits
WHERE status = 'completed'
GROUP BY display_currency
ORDER BY num_payments DESC;
```

### 10. Top Tip Recipients This Month
```sql
SELECT 
  tip_recipient,
  COUNT(*) as tips_count,
  SUM(tip_amount) as total_tips_sats,
  AVG(tip_amount) as avg_tip_sats
FROM payment_splits
WHERE tip_amount > 0 
  AND status = 'completed'
  AND created_at >= DATE_TRUNC('month', CURRENT_DATE)
GROUP BY tip_recipient
ORDER BY total_tips_sats DESC
LIMIT 10;
```

### 11. Hourly Payment Volume (Today)
```sql
SELECT 
  EXTRACT(HOUR FROM created_at) as hour,
  COUNT(*) as num_payments,
  SUM(total_amount) as total_sats
FROM payment_splits
WHERE DATE(created_at) = CURRENT_DATE
  AND status = 'completed'
GROUP BY EXTRACT(HOUR FROM created_at)
ORDER BY hour;
```

### 12. All Events for Audit Trail
```sql
SELECT 
  payment_hash,
  event_type,
  event_status,
  event_data,
  created_at
FROM payment_events
ORDER BY created_at DESC
LIMIT 100;
```

---

## 📈 Analytics Views (Pre-built)

### Monthly Payment Summary View
```sql
SELECT * FROM monthly_payment_summary;
```

Returns:
- `month` - YYYY-MM
- `total_payments` - Number of payments
- `completed_payments` - Successful payments
- `total_amount` - Total revenue in sats
- `total_tips` - Total tips distributed

### Tip Recipient Summary View
```sql
SELECT * FROM tip_recipient_summary;
```

Returns:
- `tip_recipient` - Username
- `total_tips` - Lifetime tips received
- `tips_count` - Number of tips
- `avg_tip` - Average tip amount
- `last_tip_date` - Most recent tip

---

## 💾 Export Data to CSV

### From PostgreSQL CLI:
```sql
-- Export all completed payments to CSV
\copy (SELECT * FROM payment_splits WHERE status = 'completed' ORDER BY created_at DESC) TO '/tmp/payments.csv' CSV HEADER;

-- Export daily summary to CSV
\copy (SELECT DATE(created_at) as date, COUNT(*) as payments, SUM(total_amount) as total_sats FROM payment_splits WHERE status = 'completed' GROUP BY DATE(created_at) ORDER BY date DESC) TO '/tmp/daily_summary.csv' CSV HEADER;
```

### From pgAdmin:
1. Run your query in Query Tool
2. Click "Download as CSV" button (🔽 icon)
3. Choose filename and save

---

## 🔐 Security Best Practices

### Sensitive Data
The `metadata` JSONB column contains:
- `userApiKey` - **SENSITIVE!** Currently stored in plain text
- `baseAmountDisplay`, `tipAmountDisplay` - Display amounts

**Production Recommendation:**
- Encrypt `userApiKey` before storing
- Use PostgreSQL's `pgcrypto` extension
- Or store encrypted on application side

### Example Encryption (for future):
```sql
-- Enable pgcrypto
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Encrypt API key
UPDATE payment_splits 
SET metadata = jsonb_set(
  metadata, 
  '{userApiKey}', 
  to_jsonb(encode(encrypt(metadata->>'userApiKey'::bytea, 'encryption-key', 'aes'), 'base64'))
);
```

---

## 🚨 Common Issues & Troubleshooting

### No Data Showing Up?
```sql
-- Check if database is receiving data
SELECT COUNT(*) FROM payment_splits;

-- Check recent activity
SELECT MAX(created_at) as last_payment FROM payment_splits;
```

### Orphaned Pending Payments?
```sql
-- Find payments stuck in pending for > 1 hour
SELECT 
  payment_hash,
  created_at,
  EXTRACT(EPOCH FROM (NOW() - created_at))/3600 as hours_ago
FROM payment_splits
WHERE status = 'pending'
  AND created_at < NOW() - INTERVAL '1 hour';
```

### Event Log Missing Entries?
```sql
-- Check if events are being logged
SELECT COUNT(*) FROM payment_events;

-- Find payments without events
SELECT ps.payment_hash 
FROM payment_splits ps
LEFT JOIN payment_events pe ON ps.payment_hash = pe.payment_hash
WHERE pe.id IS NULL;
```

---

## 📊 Sample Output

### Daily Revenue Summary:
```
   date    | num_payments | total_revenue_sats | merchant_amount_sats | tips_amount_sats 
-----------+--------------+--------------------+---------------------+-----------------
2025-10-26 |           15 |               1250 |                1130 |             120
2025-10-25 |           23 |               2100 |                1890 |             210
2025-10-24 |           18 |               1580 |                1420 |             160
```

### Top Tip Recipients:
```
tip_recipient | tips_count | total_tips_sats | avg_tip_sats
--------------+------------+-----------------+-------------
elturco       |         45 |            3200 |          71
alice         |         32 |            2150 |          67
bob           |         28 |            1890 |          67
```

---

## 🔗 Quick Links

- **pgAdmin**: http://localhost:5050
- **Redis Commander**: http://localhost:8081
- **PostgreSQL Port**: localhost:5432
- **Database**: blinkpos
- **Username**: blinkpos
- **Password**: blinkpos_dev_password

---

## 📝 Notes

- All amounts are stored in **satoshis**
- Timestamps are in **UTC**
- Payment hashes are from Lightning invoices
- Status flow: `pending` → `processing` → `completed` (or `failed`)
- Events are immutable audit log entries

---

Generated: October 26, 2025

