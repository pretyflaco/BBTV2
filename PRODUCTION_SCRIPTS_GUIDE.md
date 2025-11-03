# Production Database Scripts Guide

Easy-to-use scripts for viewing your production BlinkPOS data.

## 🚀 Quick Start

All scripts connect via SSH to your production server and query the database. No credentials needed in the scripts - they use your existing SSH key authentication.

```bash
cd /home/kasita/Documents/BLINK/BBTV2

# View recent transactions
./prod-view-transactions.sh

# View statistics
./prod-view-stats.sh

# Check system health
./prod-system-health.sh
```

---

## 📋 Available Scripts

### 1. `prod-view-transactions.sh`
**View recent payment transactions**

Shows the last 20 transactions with details:
- Payment hash (shortened)
- Amounts (total, base, tip)
- Tip recipient
- Status
- Timestamps

**Usage:**
```bash
./prod-view-transactions.sh
```

**Example Output:**
```
payment_hash      | total_sats | base_sats | tip_sats | tip_recipient | status    | created             | processed
056d7a40ac60...   | 33         | 30        | 3        | elturco       | completed | 2025-11-03 10:56:13 | 2025-11-03 10:56:32
77805104bcba...   | 11         | 10        | 1        | elturco       | completed | 2025-11-03 10:45:33 | 2025-11-03 10:45:47
```

---

### 2. `prod-view-stats.sh`
**View payment statistics and analytics**

Shows:
- Status breakdown (completed, pending, failed)
- Daily summary (last 7 days)
- Top tip recipients

**Usage:**
```bash
./prod-view-stats.sh
```

**Shows:**
- Total payments by status
- Daily volume and tip amounts
- Top tipped users
- Average payment sizes

---

### 3. `prod-view-active.sh`
**View active (pending) payments**

Shows payments currently waiting for payment:
- Pending invoices
- Time remaining until expiry
- Redis cache status

**Usage:**
```bash
./prod-view-active.sh
```

**Useful for:**
- Monitoring unpaid invoices
- Checking what's in the cache
- Seeing expired payments

---

### 4. `prod-view-events.sh`
**View recent payment events (audit log)**

Shows the last 30 payment events:
- Event types (created, forwarded, completed, failed)
- Event status
- Timestamps

**Usage:**
```bash
./prod-view-events.sh
```

**Event Types:**
- `created` - Invoice created
- `status_processing` - Payment received, processing started
- `forwarded` - Payment forwarded to user
- `status_completed` - Payment completed successfully
- `failed` - Payment processing failed

---

### 5. `prod-search-payment.sh`
**Search for a specific payment**

Find a payment by hash prefix and see all its details and events.

**Usage:**
```bash
./prod-search-payment.sh <payment_hash_prefix>
```

**Example:**
```bash
# Search for payment starting with 056d7a40
./prod-search-payment.sh 056d7a40
```

**Shows:**
- Complete payment details
- Full payment hash
- All events for that payment
- Timeline of processing

---

### 6. `prod-system-health.sh`
**Complete system health check**

Comprehensive overview of your production system:
- Container status
- API health check
- Resource usage (RAM, disk, CPU)
- Database statistics
- Redis cache stats

**Usage:**
```bash
./prod-system-health.sh
```

**Shows:**
- Docker container health
- Memory and disk usage
- Payment counts and volumes
- Redis memory usage
- Overall system status

---

## 💡 Common Use Cases

### Daily Monitoring
```bash
# Morning routine - check overnight activity
./prod-view-stats.sh
./prod-system-health.sh
```

### Troubleshooting a Payment
```bash
# User reports payment issue with hash starting "abc123"
./prod-search-payment.sh abc123
./prod-view-events.sh
```

### Performance Monitoring
```bash
# Check system resources
./prod-system-health.sh

# See active payments
./prod-view-active.sh
```

### Analytics
```bash
# View payment trends
./prod-view-stats.sh

# See recent activity
./prod-view-transactions.sh
```

---

## 🔒 Security Notes

**These scripts are safe because:**
- ✅ No credentials stored in scripts
- ✅ Uses existing SSH key authentication
- ✅ Read-only database queries
- ✅ No modification of data
- ✅ Can be committed to git safely

**What they access:**
- Production PostgreSQL database (read-only)
- Production Redis cache (read-only)
- Docker container status
- System resource information

---

## 🛠️ Customization

All scripts are simple bash scripts that you can customize:

```bash
# Edit any script
nano prod-view-transactions.sh

# Change the LIMIT to show more/fewer transactions
# Modify the SQL queries
# Add filters or sorting
```

---

## 📊 Direct Database Access

If you need to run custom queries:

```bash
# SSH into server
ssh ubuntu@track.twentyone.ist

# Access PostgreSQL
cd /var/www/blinkpos
docker-compose -f docker-compose.prod.yml exec postgres psql -U blinkpos -d blinkpos

# Now you can run any SQL query
SELECT * FROM payment_splits WHERE tip_recipient = 'elturco';
\q  # to exit
```

---

## 🔍 Useful SQL Queries

### Find payments by date
```sql
SELECT * FROM payment_splits 
WHERE DATE(created_at) = '2025-11-03';
```

### Calculate total tips for a user
```sql
SELECT 
  tip_recipient,
  COUNT(*) as payments,
  SUM(tip_amount) as total_tips
FROM payment_splits 
WHERE tip_recipient = 'elturco' AND status = 'completed'
GROUP BY tip_recipient;
```

### Find failed payments
```sql
SELECT * FROM payment_splits 
WHERE status = 'failed' 
ORDER BY created_at DESC;
```

### View payment processing times
```sql
SELECT 
  payment_hash,
  EXTRACT(EPOCH FROM (processed_at - created_at)) as seconds_to_process
FROM payment_splits 
WHERE status = 'completed'
ORDER BY created_at DESC 
LIMIT 10;
```

---

## 🚨 Troubleshooting

### Script shows "Connection refused"
```bash
# Check if you can SSH to server
ssh ubuntu@track.twentyone.ist "echo 'Connection OK'"

# Check if containers are running
ssh ubuntu@track.twentyone.ist "docker ps"
```

### Script shows "Database does not exist"
```bash
# Verify database name
ssh ubuntu@track.twentyone.ist "docker exec blinkpos-postgres psql -U blinkpos -l"
```

### Script shows "Permission denied"
```bash
# Make scripts executable
chmod +x prod-*.sh
```

---

## 📝 Adding New Scripts

Create your own monitoring scripts following this pattern:

```bash
#!/bin/bash
# My custom script

echo "🔍 My Custom Query"
echo ""

ssh ubuntu@track.twentyone.ist "cd /var/www/blinkpos && docker-compose -f docker-compose.prod.yml exec -T postgres psql -U blinkpos -d blinkpos -c \"
SELECT * FROM your_custom_query;
\""
```

Make it executable:
```bash
chmod +x my-custom-script.sh
```

---

## 📚 Database Schema Reference

**Main Tables:**
- `payment_splits` - All payment transactions
- `payment_events` - Audit log of events
- `tip_recipient_stats` - Aggregated tip statistics
- `system_metrics` - System performance metrics

**Views:**
- `active_payments` - Currently active invoices
- `payment_statistics` - Daily/weekly stats
- `top_tip_recipients` - Leaderboard

**For complete schema:**
```bash
# View table structure
ssh ubuntu@track.twentyone.ist "cd /var/www/blinkpos && docker-compose -f docker-compose.prod.yml exec -T postgres psql -U blinkpos -d blinkpos -c '\d payment_splits'"
```

---

**Created:** November 3, 2025  
**Server:** track.twentyone.ist  
**Database:** blinkpos (PostgreSQL)  
**Cache:** Redis

