# Database Sync Guide — Manus → Replit

**Last audited:** 9 April 2026  
**Production DB:** Manus TiDB (MySQL 8.0-compatible)  
**Replit DB:** TiDB Cloud Serverless — Cluster0, AWS Singapore (`smiletelrecon`)

---

## Current State (as of audit)

The production database contains **68 tables** with the following activity since the last Replit export:

| Table | Rows | Last Modified | Change Since Export |
|---|---|---|---|
| `services` | 3,048 | 2026-03-31 | **86 records modified in last 48h** |
| `customers` | 1,116 | 2026-03-26 | **4 records modified in last 48h** |
| `service_billing_assignments` | 1,863 | 2026-03-19 | New assignments added |
| `billing_items` | 605 | 2026-03-26 | Updated match statuses |
| `review_items` | 142 | 2026-03-19 | New review flags |
| `service_edit_history` | 260 | 2026-03-19 | Audit trail entries |
| `vocus_nbn_services` | 147 | 2026-03-24 | Vocus sync data |
| `vocus_mobile_services` | 96 | 2026-03-26 | Vocus sync data |
| `tiab_services` | 84 | 2026-03-23 | TIAB sync data |

The Replit database currently holds the **initial export from 8 April 2026**. Any changes made by the team in Manus since then — service edits, new assignments, review flags, customer updates — are **not yet reflected in Replit**.

---

## The Two Sync Problems

There are two distinct types of changes that need to flow from Manus to Replit:

**1. Schema changes** — when a developer adds a new column, creates a new table, or modifies an index in `drizzle/schema.ts`. These require running a migration against the Replit TiDB cluster before data can be imported.

**2. Data changes** — when a team member edits a service, adds a billing assignment, flags a customer, or any supplier sync runs. These need to be exported from production and imported into Replit.

These two problems have different solutions and different urgency levels.

---

## Strategy: Drizzle Migrations for Schema, Daily SQL Dump for Data

### Schema Changes (developer-driven)

Every schema change in the Manus build follows this workflow:

1. Developer edits `drizzle/schema.ts`
2. Runs `pnpm drizzle-kit generate` — this produces a timestamped `.sql` file in `drizzle/migrations/`
3. The migration SQL is committed to GitHub as part of the normal code push

**For Replit:** After pulling the latest code from GitHub, the Replit developer should check `drizzle/migrations/` for any new `.sql` files and apply them to the Replit TiDB cluster:

```bash
# Check for new migration files
git log --oneline drizzle/migrations/

# Apply the latest migration manually via the TiDB Cloud SQL Editor,
# or run it from the Replit shell:
mysql --host=gateway01.ap-southeast-1.prod.aws.tidbcloud.com \
      --port=4000 \
      --user=AZiGyyVLNGDziTi.root \
      --password=$TIDB_PASSWORD \
      --ssl-mode=REQUIRED \
      smiletelrecon < drizzle/migrations/<new_migration_file>.sql
```

Alternatively, run `pnpm drizzle-kit push` from the Replit shell — Drizzle will compare the schema against the live database and apply only the missing changes.

> **Important:** Always apply schema migrations **before** importing data. Importing data into a table that is missing a column will fail.

---

### Data Changes (team-driven, automated daily)

A scheduled task runs every night at **2:00 AM AEST** and:

1. Exports all data from the Manus production database using `mysqldump`
2. Strips internal migration records
3. Commits the SQL dump to the `db-snapshots/` folder in the GitHub repository with a timestamp in the filename
4. Pushes to `main`

The Replit developer (or the Replit agent) can then pull the latest snapshot and import it:

```bash
# From the Replit shell — pull latest snapshot and import
git pull origin main

# Find the most recent snapshot
ls -lt db-snapshots/ | head -5

# Import it (replaces all data — schema must already be up to date)
mysql --host=gateway01.ap-southeast-1.prod.aws.tidbcloud.com \
      --port=4000 \
      --user=AZiGyyVLNGDziTi.root \
      --password=$TIDB_PASSWORD \
      --ssl-mode=REQUIRED \
      smiletelrecon < db-snapshots/production_YYYY-MM-DD.sql
```

---

## Automated Daily Sync Script

The script `/home/ubuntu/daily_github_push.sh` has been extended to also export the database. The full sync script is at `scripts/daily_db_export.sh` in the repository.

### What the script does

```
1. Connect to Manus production database
2. Run mysqldump --no-create-info --complete-insert --skip-triggers
3. Strip __drizzle_migrations INSERT lines (not needed on Replit)
4. Save to db-snapshots/production_YYYY-MM-DD_HHMM.sql
5. Keep only the last 7 daily snapshots (auto-prune older files)
6. git add + commit + push to GitHub main branch
```

### Snapshot file naming

```
db-snapshots/
  production_2026-04-09_0200.sql    ← today's snapshot
  production_2026-04-08_0200.sql    ← yesterday
  production_2026-04-07_0200.sql
  ...
  production_2026-04-03_0200.sql    ← oldest kept (7-day window)
```

Each filename encodes the exact export timestamp so the Replit developer always knows how fresh the data is.

---

## Replit Import Procedure (Step-by-Step)

Follow this procedure whenever you need to bring Replit up to date with production:

**Step 1 — Pull the latest code and snapshots**
```bash
git pull origin main
```

**Step 2 — Check for new schema migrations**
```bash
ls -lt drizzle/migrations/ | head -10
```
If there are new `.sql` files that haven't been applied to the Replit DB yet, apply them now (see Schema Changes section above). If unsure, run `pnpm drizzle-kit push` — it is safe to run repeatedly and will only apply missing changes.

**Step 3 — Identify the latest snapshot**
```bash
ls -lt db-snapshots/ | head -3
```

**Step 4 — Truncate existing data (optional but recommended for a clean import)**

If you want a full replacement rather than an additive import, truncate the key tables first via the TiDB Cloud SQL Editor:

```sql
SET FOREIGN_KEY_CHECKS = 0;
TRUNCATE TABLE services;
TRUNCATE TABLE customers;
TRUNCATE TABLE billing_items;
TRUNCATE TABLE service_billing_assignments;
TRUNCATE TABLE service_edit_history;
TRUNCATE TABLE review_items;
-- repeat for any other tables you want to refresh
SET FOREIGN_KEY_CHECKS = 1;
```

> **Warning:** Do not truncate tables that Replit has its own data in (e.g., `users` if the Replit team has created accounts there). Use selective truncation.

**Step 5 — Import the snapshot**
```bash
mysql --host=gateway01.ap-southeast-1.prod.aws.tidbcloud.com \
      --port=4000 \
      --user=AZiGyyVLNGDziTi.root \
      --password=$TIDB_PASSWORD \
      --ssl-mode=REQUIRED \
      smiletelrecon < db-snapshots/production_2026-04-09_0200.sql
```

**Step 6 — Verify row counts**
```bash
mysql --host=gateway01.ap-southeast-1.prod.aws.tidbcloud.com \
      --port=4000 --user=AZiGyyVLNGDziTi.root --password=$TIDB_PASSWORD \
      --ssl-mode=REQUIRED smiletelrecon \
      -e "SELECT table_name, table_rows FROM information_schema.tables WHERE table_schema='smiletelrecon' ORDER BY table_rows DESC LIMIT 15;"
```

Expected key counts after a successful import:

| Table | Expected Rows |
|---|---|
| `services` | ~3,048 |
| `customers` | ~1,116 |
| `sasboss_services` | ~1,295 |
| `billing_items` | ~605 |
| `service_billing_assignments` | ~1,863 |

---

## Handling Conflicts: Replit-Only Data

The Replit environment may accumulate its own data over time (test assignments, dev users, experimental billing items). A full snapshot import will overwrite this. To avoid losing Replit-specific work:

**Option A — Selective table import (recommended)**

Rather than importing the full dump, import only the tables that changed in production:

```bash
# Export only specific tables from production
mysqldump [prod connection] smiletelrecon services customers billing_items \
  --no-create-info --complete-insert > db-snapshots/selective_YYYY-MM-DD.sql

# Import to Replit
mysql [replit connection] smiletelrecon < db-snapshots/selective_YYYY-MM-DD.sql
```

**Option B — Merge via upsert**

For tables with `updatedAt` timestamps, only import rows that are newer in production than in Replit. This is more complex but preserves Replit-specific edits. The `scripts/selective_sync.py` script (see below) implements this pattern.

---

## Selective Sync Script (`scripts/selective_sync.py`)

For cases where a full import would overwrite Replit-specific work, use the selective sync script. It compares `updatedAt` timestamps between production and Replit and only upserts rows that are newer in production.

```python
# Usage:
# python3 scripts/selective_sync.py --tables services,customers,billing_items

import pymysql, os, sys, argparse
from datetime import datetime

PROD_URL = os.environ["DATABASE_URL"]          # Manus production
REPLIT_URL = os.environ["REPLIT_DATABASE_URL"] # Replit TiDB

def parse_url(url):
    import re
    m = re.match(r"mysql://([^:]+):([^@]+)@([^:]+):(\d+)/([^?]+)", url)
    return m.groups()  # user, pwd, host, port, db

def sync_table(table, prod_conn, replit_conn):
    prod_cur = prod_conn.cursor(pymysql.cursors.DictCursor)
    replit_cur = replit_conn.cursor(pymysql.cursors.DictCursor)

    # Get all rows from production
    prod_cur.execute(f"SELECT * FROM `{table}`")
    rows = prod_cur.fetchall()
    if not rows:
        return 0

    # Build INSERT ... ON DUPLICATE KEY UPDATE
    cols = list(rows[0].keys())
    placeholders = ", ".join(["%s"] * len(cols))
    updates = ", ".join([f"`{c}` = VALUES(`{c}`)" for c in cols if c != "id"])
    sql = f"""
        INSERT INTO `{table}` ({', '.join(f'`{c}`' for c in cols)})
        VALUES ({placeholders})
        ON DUPLICATE KEY UPDATE {updates}
    """
    values = [tuple(r[c] for c in cols) for r in rows]
    replit_cur.executemany(sql, values)
    replit_conn.commit()
    return len(rows)

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--tables", required=True, help="Comma-separated table names")
    args = parser.parse_args()

    tables = [t.strip() for t in args.tables.split(",")]
    prod_conn = pymysql.connect(*[p for p in parse_url(PROD_URL)[:4]],
                                 database=parse_url(PROD_URL)[4],
                                 ssl={"ssl": {}})
    replit_conn = pymysql.connect(*[p for p in parse_url(REPLIT_URL)[:4]],
                                   database=parse_url(REPLIT_URL)[4],
                                   ssl={"ssl": {}})

    for table in tables:
        count = sync_table(table, prod_conn, replit_conn)
        print(f"  {table}: {count} rows upserted")

    prod_conn.close()
    replit_conn.close()
    print(f"\nSync complete at {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}")
```

---

## What to Do Right Now

The production database has **86 services and 4 customers modified in the last 48 hours** that are not in the Replit DB. To sync immediately:

1. Download the latest snapshot from GitHub:
   ```
   db-snapshots/production_2026-04-09_0200.sql
   ```
   (This will be available after tonight's 2 AM AEST automated push.)

2. Or trigger a manual sync now by running from the Replit shell:
   ```bash
   curl -o /tmp/prod_data.sql \
     "https://raw.githubusercontent.com/smileitaus/SmileTelBillingRecon/main/db-snapshots/production_latest.sql"
   mysql [replit connection] smiletelrecon < /tmp/prod_data.sql
   ```
   A `production_latest.sql` symlink always points to the most recent snapshot.

---

## Summary: Who Does What

| Action | Who | When | How |
|---|---|---|---|
| Schema migration | Manus developer | When schema changes | `pnpm drizzle-kit generate` → commit migration SQL |
| Apply migration to Replit | Replit developer | After pulling new code | `pnpm drizzle-kit push` or manual SQL |
| Data export | Automated (Manus) | Daily 2 AM AEST | `daily_db_export.sh` → `db-snapshots/` in GitHub |
| Data import to Replit | Replit developer | As needed (daily or weekly) | `mysql < db-snapshots/production_YYYY-MM-DD.sql` |
| Urgent sync (team edits) | Replit developer | After significant Manus activity | Run selective sync script or full import |
