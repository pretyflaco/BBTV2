# Production Database Scripts - Complete Guide

This guide covers all production database monitoring scripts that let you query your live database from your local machine via SSH.

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [All Available Scripts](#all-available-scripts)
4. [Detailed Examples](#detailed-examples)
5. [Query Details](#query-details)
6. [Customization](#customization)
7. [Troubleshooting](#troubleshooting)

---

## Overview

These scripts provide easy access to production data without:
- ❌ Manual SSH login
- ❌ Docker exec commands
- ❌ Remembering SQL queries
- ❌ Typing connection strings

Instead:
- ✅ Run simple bash scripts from local machine
- ✅ Get formatted, readable output
- ✅ Safe, read-only queries
- ✅ Uses existing SSH key authentication

**Based on:** All queries match `AUDIT_QUERIES.md` but adapted for remote production access.

---

## Prerequisites

1. **SSH Key Access:** Your SSH key must be set up for `ubuntu@track.twentyone.ist`
2. **Docker Running:** Production server must have Docker containers running
3. **Local Machine:** Scripts run from `/home/kasita/Documents/BLINK/BBTV2/`

**Test your access:**
```bash
ssh ubuntu@track.twentyone.ist "docker ps"
```

---

## All Available Scripts

### 1. `prod-view-stats.sh` - Comprehensive Statistics

**What it shows:**
- Overall payment statistics (total payments, sats, tips)
- Daily revenue summary (last 30 days)
- Top tip recipients (all time)
- Payments by currency (USD, BTC, EUR, etc.)
- Status breakdown (completed, pending, failed)

**When to use:** Daily monitoring, weekly reports, performance analysis

**Example:**
```bash
./prod-view-stats.sh
```

**Output includes:**
```
📊 Overall Payment Statistics
==============================
total_payments | total_sats | merchant_sats | tips_sats | avg_payment | unique_recipients | currencies_used
---------------+------------+---------------+-----------+-------------+------------------+----------------
            66 |       1250 |          1130 |       120 |          19 |                3 |               2

📅 Daily Revenue Summary (Last 30 Days)
=======================================
   date    | num_payments | total_revenue_sats | merchant_amount_sats | tips_amount_sats | avg_payment_sats
-----------+--------------+--------------------+---------------------+------------------+-----------------
2025-11-03 |            4 |                 66 |                  58 |                8 |               17
...
```

---

### 2. `prod-view-transactions.sh` - Recent Payments

**What it shows:**
- Last 50 transactions
- Full details: payment hash, amounts, recipient, status, currency, memo, timestamp

**When to use:** General monitoring, checking recent activity

**Example:**
```bash
./prod-view-transactions.sh
```

**Output:**
```
🔍 Recent Payment Transactions
==============================
    payment     | sats | base | tip | recipient | status    | curr | memo              | created
----------------+------+------+-----+-----------+-----------+------+-------------------+--------------------
c344682398...  |   11 |    9 |   2 | elturco   | completed | USD  | Payment via Blink | 2025-11-03 11:50:14
...
```

---

### 3. `prod-view-today.sh` - Today's Activity

**What it shows:**
- All payments made today
- Hourly breakdown
- Today's summary statistics

**When to use:** Morning routine, end-of-day review

**Example:**
```bash
./prod-view-today.sh
```

---

### 4. `prod-view-month.sh` - This Month's Activity

**What it shows:**
- All payments this month
- Monthly summary
- Unique recipients count

**When to use:** Monthly reporting, performance tracking

**Example:**
```bash
./prod-view-month.sh
```

---

### 5. `prod-view-hourly.sh` - Hourly Volume Analysis

**What it shows:**
- Payment distribution by hour (today)
- Peak hours analysis
- Average payment per hour

**When to use:** Understanding busy periods, staffing decisions

**Example:**
```bash
./prod-view-hourly.sh
```

**Output:**
```
🕐 Hourly Payment Volume (Today)
================================
hour | num_payments | total_sats | avg_sats
-----+--------------+------------+---------
  10 |            2 |         44 |       22
  11 |            2 |         22 |       11

📊 Peak Hours Analysis
=====================
peak_hour | payments | sats
----------+----------+-----
       10 |        2 |   44
       11 |        2 |   22
```

---

### 6. `prod-view-daterange.sh` - Custom Date Range

**What it shows:**
- All payments between two dates
- Summary statistics for that period

**When to use:** Custom reports, historical analysis, auditing

**Example:**
```bash
./prod-view-daterange.sh 2025-11-01 2025-11-30
./prod-view-daterange.sh 2025-10-01 2025-10-31  # October report
```

---

### 7. `prod-search-payment.sh` - Find Specific Payment

**What it shows:**
- Full payment details
- Complete event history (audit trail)
- All status changes
- Event data JSON

**When to use:** Troubleshooting, customer inquiries, debugging

**Example:**
```bash
./prod-search-payment.sh c344682
./prod-search-payment.sh efe2dde
```

**Output:**
```
🔍 Searching for payment: c344682

💳 Payment Details
==================
payment_hash                         | total_amount | base_amount | tip_amount | tip_recipient | ...
-------------------------------------+--------------+-------------+------------+--------------
c3446823988d4fba9c8e7d2a1b3c5f6e... |           11 |           9 |          2 | elturco      

📝 Full Event History (Audit Trail)
===================================
payment_hash | total_amount | tip_recipient | event_type    | event_status | event_data | timestamp
-------------+--------------+---------------+---------------+--------------+------------+----------
c344682...   |           11 | elturco       | created       | success      | {...}      | 11:50:10
c344682...   |           11 | elturco       | forwarded     | success      | {...}      | 11:50:14
c344682...   |           11 | elturco       | status_update | success      | {...}      | 11:50:14
```

---

### 8. `prod-view-tips.sh` - Tips by Recipient

**What it shows:**
- All tips received by specific person
- Total tips summary
- Min/max/average tip amounts
- Last tip date

**When to use:** Staff tip reports, payroll, performance reviews

**Example:**
```bash
./prod-view-tips.sh elturco
./prod-view-tips.sh alice
```

**Output:**
```
💰 Tips Received by: elturco
==============================
   payment     | tip_sats | total_sats | memo              | created             | status
---------------+----------+------------+-------------------+--------------------+-----------
c344682...    |        2 |         11 | Payment via Blink | 2025-11-03 11:50:14 | completed
...

📊 Total Tips Summary
====================
tip_recipient | total_tips | total_tips_sats | avg_tip_sats | min_tip | max_tip | last_tip_date
--------------+------------+-----------------+--------------+---------+---------+--------------
elturco       |          4 |               8 |            2 |       1 |       3 | 2025-11-03
```

---

### 9. `prod-view-active.sh` - Active/Pending Payments

**What it shows:**
- Currently pending/processing payments
- Time elapsed (minutes ago)
- Stuck payments (>1 hour in pending)
- Redis cache count

**When to use:** Identifying issues, monitoring payment flow, troubleshooting delays

**Example:**
```bash
./prod-view-active.sh
```

**Output:**
```
⏳ Active/Pending Payments
==========================
(No active payments currently)

🚨 Stuck Payments (>1 hour in pending)
======================================
(No stuck payments)

📊 Redis Cache (Active Invoices):
Active invoices in Redis cache: 0
```

---

### 10. `prod-view-events.sh` - Event Log (Audit Trail)

**What it shows:**
- Last 100 payment events
- Event types (created, forwarded, status_update, etc.)
- Event status (success/error)
- Event data preview
- Timestamps

**When to use:** Debugging, auditing, understanding payment flow

**Example:**
```bash
./prod-view-events.sh
```

---

### 11. `prod-system-health.sh` - System Health Check

**What it shows:**
- Docker container status
- Redis connectivity
- PostgreSQL connectivity
- Database statistics
- Cache statistics

**When to use:** Daily health check, before/after deployment, troubleshooting

**Example:**
```bash
./prod-system-health.sh
```

**Output:**
```
🏥 Production System Health Check
=================================

📦 Docker Containers
-------------------
CONTAINER          STATUS         UPTIME
blinkpos-app       Up (healthy)   2 hours ago
blinkpos-postgres  Up (healthy)   2 hours ago
blinkpos-redis     Up             2 hours ago

🗄️  PostgreSQL Status
--------------------
✅ Connected successfully
Database: blinkpos
Total tables: 4
Total payment records: 66

📦 Redis Status
--------------
✅ Connected successfully
Active payment caches: 0
```

---

## Query Details

All queries are based on `AUDIT_QUERIES.md` but enhanced for production:

| Feature | AUDIT_QUERIES.md | Production Scripts |
|---------|-----------------|-------------------|
| Daily revenue (30 days) | ✅ Query #6 | ✅ In `prod-view-stats.sh` |
| Top tip recipients | ✅ Query #5 | ✅ Enhanced with min/max |
| Hourly volume | ✅ Query #11 | ✅ In `prod-view-hourly.sh` |
| Date ranges | ✅ Query #3 | ✅ In `prod-view-daterange.sh` |
| Stuck payments | ✅ Query #7 | ✅ In `prod-view-active.sh` |
| Full audit trail | ✅ Query #8 | ✅ In `prod-search-payment.sh` |
| Payments by currency | ✅ Query #9 | ✅ In `prod-view-stats.sh` |
| Tips by recipient | ✅ Query #4 | ✅ In `prod-view-tips.sh` |
| Today's payments | ✅ Query #1 | ✅ In `prod-view-today.sh` |
| Monthly payments | ✅ Query #2 | ✅ In `prod-view-month.sh` |

**Enhancement:** All production scripts add:
- Formatted timestamps
- Truncated payment hashes for readability
- Multiple related queries in one script
- Color/emoji indicators for better UX

---

## Customization

### Modify a Script

All scripts follow the same pattern:

```bash
#!/bin/bash
# Description

echo "Title"
echo "====="

ssh ubuntu@track.twentyone.ist "cd /var/www/blinkpos && docker-compose -f docker-compose.prod.yml exec -T postgres psql -U blinkpos -d blinkpos -c \"
YOUR SQL QUERY HERE
\""
```

**Example:** Change transaction limit from 50 to 100:

Edit `prod-view-transactions.sh`:
```bash
LIMIT 50;  # Change to: LIMIT 100;
```

### Add New Script

1. Copy an existing script:
```bash
cp prod-view-transactions.sh prod-view-custom.sh
```

2. Edit the SQL query

3. Make executable:
```bash
chmod +x prod-view-custom.sh
```

4. Test:
```bash
./prod-view-custom.sh
```

### Use Different Server

Change this line in any script:
```bash
ssh ubuntu@track.twentyone.ist ...
```

To:
```bash
ssh your-user@your-server.com ...
```

---

## Troubleshooting

### "Permission denied (publickey)"

**Problem:** SSH key not set up

**Solution:**
```bash
# Test SSH access
ssh ubuntu@track.twentyone.ist "echo Connection OK"

# If fails, check SSH config
cat ~/.ssh/config
```

### "docker: command not found"

**Problem:** Docker not installed on production server

**Solution:**
```bash
ssh ubuntu@track.twentyone.ist
sudo docker ps  # Try with sudo
```

### "database connection failed"

**Problem:** PostgreSQL container not running

**Solution:**
```bash
./prod-system-health.sh  # Check container status

# Or manually:
ssh ubuntu@track.twentyone.ist "cd /var/www/blinkpos && docker-compose -f docker-compose.prod.yml ps"
```

### Empty/No Results

**Problem:** No data in database yet

**Solution:**
```bash
# Check if any data exists
ssh ubuntu@track.twentyone.ist "cd /var/www/blinkpos && docker-compose -f docker-compose.prod.yml exec -T postgres psql -U blinkpos -d blinkpos -c 'SELECT COUNT(*) FROM payment_splits;'"
```

### Script Hangs/Timeout

**Problem:** Server unreachable or query too slow

**Solution:**
```bash
# Add timeout to SSH
timeout 30 ./prod-view-stats.sh

# Or edit script to add connection timeout
ssh -o ConnectTimeout=10 ubuntu@track.twentyone.ist ...
```

---

## Advanced Usage

### Pipe to File

Save output for reporting:
```bash
./prod-view-stats.sh > monthly-report-nov-2025.txt
./prod-view-daterange.sh 2025-11-01 2025-11-30 > november-payments.txt
```

### Watch for Changes

Monitor active payments in real-time:
```bash
watch -n 10 ./prod-view-active.sh  # Updates every 10 seconds
```

### Combine Multiple Scripts

Create a daily report:
```bash
#!/bin/bash
echo "=== Daily Report $(date) ===" > daily-report.txt
./prod-view-today.sh >> daily-report.txt
./prod-view-active.sh >> daily-report.txt
./prod-system-health.sh >> daily-report.txt
cat daily-report.txt
```

### Extract Specific Data

Use grep/awk for specific info:
```bash
# Find all failed payments
./prod-view-transactions.sh | grep failed

# Count transactions today
./prod-view-today.sh | grep -c "completed"

# Get total sats from stats
./prod-view-stats.sh | grep "total_sats" | awk '{print $3}'
```

---

## Security Notes

**✅ Safe Practices:**
- Scripts only run `SELECT` queries (read-only)
- No credentials stored in scripts
- Uses SSH key authentication
- Safe to commit to Git
- Safe to share with team

**⚠️ Reminders:**
- Never hardcode passwords in scripts
- Keep SSH keys secure (`chmod 600 ~/.ssh/id_rsa`)
- Don't expose database credentials
- Review queries before running custom SQL

---

## Related Documentation

- **AUDIT_QUERIES.md** - Local development queries (same SQL patterns)
- **PROD_SCRIPTS_README.md** - Quick reference guide
- **DOCKER_DEPLOYMENT_GUIDE.md** - How production environment is set up
- **HYBRID_STORAGE_ARCHITECTURE.md** - Database schema details

---

## Appendix: All Scripts Summary

| Script | Lines | Queries | Primary Use |
|--------|-------|---------|-------------|
| prod-view-stats.sh | 84 | 5 | Daily monitoring |
| prod-view-transactions.sh | 24 | 1 | Recent activity |
| prod-view-today.sh | 35 | 2 | Daily review |
| prod-view-month.sh | 37 | 2 | Monthly reports |
| prod-view-hourly.sh | 42 | 2 | Peak hours |
| prod-view-daterange.sh | 41 | 2 | Custom periods |
| prod-search-payment.sh | 47 | 2 | Troubleshooting |
| prod-view-tips.sh | 51 | 2 | Staff reports |
| prod-view-active.sh | 46 | 3 | Issue detection |
| prod-view-events.sh | 21 | 1 | Audit trail |
| prod-system-health.sh | 65 | 5 | Health checks |

**Total:** 11 scripts, 28 queries, covering all use cases from AUDIT_QUERIES.md

---

**Created:** November 3, 2025  
**Last Updated:** November 3, 2025  
**Version:** 2.0 (Enhanced to match AUDIT_QUERIES.md)
