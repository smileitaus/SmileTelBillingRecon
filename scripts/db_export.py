#!/usr/bin/env python3
"""
SmileTel Billing Recon — Production DB Export Script
Uses pymysql directly to avoid mysqldump timeout issues with TiDB Serverless.
Generates INSERT statements compatible with MySQL/TiDB.

Usage:
    python3 scripts/db_export.py --output db-snapshots/production_YYYY-MM-DD.sql
"""

import pymysql
import os
import re
import sys
import argparse
from datetime import datetime, timezone

# Tables to skip (internal/framework only)
SKIP_TABLES = {"__drizzle_migrations"}

def parse_url(url):
    m = re.match(r"mysql://([^:]+):([^@]+)@([^:]+):(\d+)/([^?]+)", url)
    if not m:
        raise ValueError(f"Cannot parse DATABASE_URL: {url[:40]}...")
    return m.group(1), m.group(2), m.group(3), int(m.group(4)), m.group(5)

def escape_value(val):
    if val is None:
        return "NULL"
    if isinstance(val, bool):
        return "1" if val else "0"
    if isinstance(val, (int, float)):
        return str(val)
    if isinstance(val, datetime):
        return f"'{val.strftime('%Y-%m-%d %H:%M:%S')}'"
    if isinstance(val, bytes):
        hex_str = val.hex()
        return f"0x{hex_str}" if hex_str else "NULL"
    # String — escape single quotes and backslashes
    s = str(val)
    s = s.replace("\\", "\\\\")
    s = s.replace("'", "\\'")
    s = s.replace("\n", "\\n")
    s = s.replace("\r", "\\r")
    s = s.replace("\0", "\\0")
    return f"'{s}'"

def export_table(cur, table_name, out):
    cur.execute(f"SELECT * FROM `{table_name}`")
    rows = cur.fetchall()
    if not rows:
        return 0

    cols = [d[0] for d in cur.description]
    col_list = ", ".join(f"`{c}`" for c in cols)

    out.write(f"\n-- Table: {table_name} ({len(rows)} rows)\n")
    out.write(f"LOCK TABLES `{table_name}` WRITE;\n")
    out.write(f"/*!40000 ALTER TABLE `{table_name}` DISABLE KEYS */;\n")

    # Write in batches of 100 rows
    batch_size = 100
    for i in range(0, len(rows), batch_size):
        batch = rows[i:i+batch_size]
        values_list = []
        for row in batch:
            vals = ", ".join(escape_value(v) for v in row)
            values_list.append(f"({vals})")
        values_str = ",\n  ".join(values_list)
        out.write(f"INSERT INTO `{table_name}` ({col_list}) VALUES\n  {values_str};\n")

    out.write(f"/*!40000 ALTER TABLE `{table_name}` ENABLE KEYS */;\n")
    out.write(f"UNLOCK TABLES;\n")
    return len(rows)

def main():
    parser = argparse.ArgumentParser(description="Export production DB to SQL file")
    parser.add_argument("--output", required=True, help="Output SQL file path")
    parser.add_argument("--tables", help="Comma-separated list of tables (default: all)")
    args = parser.parse_args()

    db_url = os.environ.get("DATABASE_URL", "")
    if not db_url:
        print("ERROR: DATABASE_URL not set", file=sys.stderr)
        sys.exit(1)

    user, pwd, host, port, db = parse_url(db_url)
    print(f"Connecting to {host}/{db}...")

    conn = pymysql.connect(
        host=host, port=port, user=user, password=pwd,
        database=db, ssl={"ssl": {}}, connect_timeout=30,
        read_timeout=300, write_timeout=300
    )
    cur = conn.cursor()

    # Get table list
    if args.tables:
        tables = [t.strip() for t in args.tables.split(",")]
    else:
        cur.execute("SHOW TABLES")
        tables = [row[0] for row in cur.fetchall() if row[0] not in SKIP_TABLES]

    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    print(f"Exporting {len(tables)} tables at {timestamp}...")

    os.makedirs(os.path.dirname(args.output) if os.path.dirname(args.output) else ".", exist_ok=True)

    with open(args.output, "w", encoding="utf-8") as out:
        out.write(f"-- SmileTel Billing Recon — Production DB Export\n")
        out.write(f"-- Exported: {timestamp}\n")
        out.write(f"-- Source: {host}/{db}\n")
        out.write(f"-- Tables: {len(tables)}\n\n")
        out.write("SET FOREIGN_KEY_CHECKS=0;\n")
        out.write("SET SQL_MODE='NO_AUTO_VALUE_ON_ZERO';\n")
        out.write("SET NAMES utf8mb4;\n\n")

        total_rows = 0
        for i, table in enumerate(tables):
            try:
                count = export_table(cur, table, out)
                total_rows += count
                print(f"  [{i+1}/{len(tables)}] {table}: {count} rows")
            except Exception as e:
                print(f"  WARNING: Skipping {table}: {e}", file=sys.stderr)

        out.write("\nSET FOREIGN_KEY_CHECKS=1;\n")
        out.write(f"\n-- Export complete: {total_rows} total rows\n")

    file_size = os.path.getsize(args.output)
    print(f"\nExport complete: {total_rows} rows → {args.output} ({file_size/1024/1024:.1f} MB)")

    conn.close()

if __name__ == "__main__":
    main()
