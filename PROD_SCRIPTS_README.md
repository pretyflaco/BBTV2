# Production Database Scripts - Quick Reference

Easy-to-use scripts for viewing production database data without logging into the server.

## 🚀 Quick Start

All scripts use SSH to connect to your production server and run queries. No manual server login required!

```bash
cd /home/kasita/Documents/BLINK/BBTV2
./prod-view-stats.sh          # Quick overview
./prod-view-transactions.sh   # Recent payments
./prod-system-health.sh       # Health check
```

---

## 📊 Available Scripts

### General Overview
| Script | Description | Usage |
|--------|-------------|-------|
| `prod-view-stats.sh` | **Comprehensive statistics** - Overall stats, daily revenue (30 days), top recipients, currency breakdown, status summary | `./prod-view-stats.sh` |
| `prod-view-transactions.sh` | **Recent payments** - Last 50 transactions with full details | `./prod-view-transactions.sh` |
| `prod-system-health.sh` | **System health** - Docker, Redis, PostgreSQL status | `./prod-system-health.sh` |

### Time-Based Views
| Script | Description | Usage |
|--------|-------------|-------|
| `prod-view-today.sh` | **Today's payments** - All payments made today with hourly breakdown | `./prod-view-today.sh` |
| `prod-view-month.sh` | **This month's payments** - All payments this month with summary | `./prod-view-month.sh` |
| `prod-view-hourly.sh` | **Hourly volume** - Payment distribution by hour (today) | `./prod-view-hourly.sh` |
| `prod-view-daterange.sh` | **Custom date range** - Payments between specific dates | `./prod-view-daterange.sh 2025-11-01 2025-11-30` |

### Payment Analysis
| Script | Description | Usage |
|--------|-------------|-------|
| `prod-search-payment.sh` | **Find payment** - Full details + event history for specific payment | `./prod-search-payment.sh c344682` |
| `prod-view-tips.sh` | **Tips by recipient** - All tips received by specific person | `./prod-view-tips.sh elturco` |
| `prod-view-active.sh` | **Active/pending** - Current pending payments + stuck payment detection | `./prod-view-active.sh` |
| `prod-view-events.sh` | **Event log** - Last 100 payment events (audit trail) | `./prod-view-events.sh` |

---

## 💡 Common Use Cases

### Daily Monitoring
```bash
# Morning routine - check yesterday's activity
./prod-view-today.sh
./prod-system-health.sh
```

### Weekly Review
```bash
# See what happened this week
./prod-view-stats.sh           # Overall numbers
./prod-view-hourly.sh          # Peak hours
```

### Troubleshooting a Payment
```bash
# Customer says payment didn't go through
./prod-search-payment.sh abc123     # Find the payment
./prod-view-active.sh               # Check if still pending
```

### Check Staff Tips
```bash
# See how much elturco earned this month
./prod-view-tips.sh elturco
```

### Custom Analysis
```bash
# October report
./prod-view-daterange.sh 2025-10-01 2025-10-31
```

---

## 🎯 What's Different from AUDIT_QUERIES.md?

These scripts implement the **same comprehensive queries** from `AUDIT_QUERIES.md`, but with key improvements:

✅ **Production-ready** - Connects to live server via SSH  
✅ **No manual login** - Run from your local machine  
✅ **Safe & read-only** - Cannot modify data  
✅ **Enhanced queries** - Includes all 12+ query types from AUDIT_QUERIES.md:
- Daily revenue summaries (30 days)
- Payments by currency
- Top tip recipients with min/max/avg
- Hourly volume analysis
- Stuck payment detection
- Full event audit trails
- Date range analysis

---

## 🔒 Security

**Why these are safe:**
- No credentials stored in scripts
- Uses your existing SSH key authentication
- All queries are read-only (`SELECT` only)
- Safe to commit to GitHub
- Can be shared with team members

---

## 📖 Need More Details?

See `PRODUCTION_SCRIPTS_GUIDE.md` for:
- Detailed examples
- Sample output
- Customization guide
- Troubleshooting

---

## 🔗 Related Files

- `AUDIT_QUERIES.md` - Local development queries (same SQL, for local PostgreSQL)
- `PRODUCTION_SCRIPTS_GUIDE.md` - Comprehensive production scripts guide
- `scripts/view-transactions.js` - Old method (deprecated)

---

**Last Updated:** November 3, 2025
