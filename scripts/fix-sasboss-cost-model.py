"""
Fix SasBoss cost model:
- The 155 'supplier_invoice' records have retail totals in monthlyCost
- Move retail total to monthlyRevenue
- Apply correct wholesale cost from Access4 invoice data (already imported with correct pricebook costs)
- For enterprises where we have pricebook-matched services, sum their wholesale costs
- For enterprises with no pricebook match, set monthlyCost=0 and flag for review
"""
import os, urllib.parse
import pymysql

url = os.environ.get('DATABASE_URL', '')
parsed = urllib.parse.urlparse(url)
conn = pymysql.connect(
    host=parsed.hostname, port=parsed.port or 3306,
    user=parsed.username, password=parsed.password,
    database=parsed.path.lstrip('/'), ssl={'ssl': {}},
    cursorclass=pymysql.cursors.DictCursor,
    autocommit=False
)
cur = conn.cursor()

print("=== Fixing SasBoss Cost Model ===\n")

# Step 1: Get all supplier_invoice SasBoss records (aggregate retail rows)
cur.execute("""
    SELECT id, customerName, customerExternalId, monthlyCost, monthlyRevenue
    FROM services 
    WHERE provider = 'SasBoss' AND costSource = 'supplier_invoice'
    ORDER BY monthlyCost DESC
""")
retail_rows = cur.fetchall()
print(f"Found {len(retail_rows)} supplier_invoice (retail aggregate) records to fix")
print(f"Total retail amount currently in monthlyCost: ${sum(r['monthlyCost'] or 0 for r in retail_rows):.2f}")

# Step 2: For each enterprise, find the wholesale cost from pricebook-matched services
# The Access4 March invoice was imported as separate per-product services with correct wholesale costs
# These have costSource = 'access4_diamond_pricebook_excel' or 'access4_diamond_pricebook'
# We need to sum the wholesale costs per customer

cur.execute("""
    SELECT customerExternalId, customerName, SUM(monthlyCost) as total_wholesale
    FROM services 
    WHERE provider = 'SasBoss' 
    AND costSource IN ('access4_diamond_pricebook_excel', 'access4_diamond_pricebook')
    AND customerExternalId IS NOT NULL
    GROUP BY customerExternalId, customerName
""")
wholesale_by_customer = {r['customerExternalId']: r['total_wholesale'] for r in cur.fetchall()}
print(f"\nFound wholesale cost data for {len(wholesale_by_customer)} customers from pricebook-matched services")

# Step 3: Apply fixes
updated = 0
no_wholesale_found = 0
total_retail_moved = 0
total_wholesale_applied = 0

for row in retail_rows:
    retail_amount = float(row['monthlyCost'] or 0)
    cust_id = row['customerExternalId']
    
    # Get wholesale cost for this customer
    wholesale_cost = float(wholesale_by_customer.get(cust_id, 0)) if cust_id else 0
    
    if wholesale_cost > 0:
        # Move retail to revenue, apply wholesale as cost
        cur.execute("""
            UPDATE services 
            SET monthlyRevenue = %s,
                monthlyCost = %s,
                costSource = 'access4_invoice_corrected'
            WHERE id = %s
        """, (retail_amount, wholesale_cost, row['id']))
        total_retail_moved += retail_amount
        total_wholesale_applied += wholesale_cost
        updated += 1
    else:
        # No wholesale data found - move retail to revenue, set cost to 0, flag for review
        cur.execute("""
            UPDATE services 
            SET monthlyRevenue = %s,
                monthlyCost = 0,
                costSource = 'retail_only_no_wholesale'
            WHERE id = %s
        """, (retail_amount, row['id']))
        total_retail_moved += retail_amount
        no_wholesale_found += 1

conn.commit()

print(f"\n=== Results ===")
print(f"Updated with wholesale cost: {updated}")
print(f"Set to retail_only (no wholesale match): {no_wholesale_found}")
print(f"Total retail moved to monthlyRevenue: ${total_retail_moved:.2f}")
print(f"Total wholesale applied to monthlyCost: ${total_wholesale_applied:.2f}")

# Step 4: Verify final SasBoss totals
cur.execute("""
    SELECT costSource, COUNT(*) as cnt, SUM(monthlyCost) as total_cost, SUM(monthlyRevenue) as total_revenue
    FROM services 
    WHERE provider = 'SasBoss'
    GROUP BY costSource
    ORDER BY total_cost DESC
""")
rows = cur.fetchall()
print("\n=== Final SasBoss breakdown by costSource ===")
total_cost = 0
total_rev = 0
for r in rows:
    c = float(r['total_cost'] or 0)
    rv = float(r['total_revenue'] or 0)
    total_cost += c
    total_rev += rv
    print(f"  {r['costSource']}: count={r['cnt']}, monthlyCost=${c:.2f}, monthlyRevenue=${rv:.2f}")

print(f"\nGRAND TOTAL SasBoss: monthlyCost=${total_cost:.2f}, monthlyRevenue=${total_rev:.2f}")
print(f"Implied margin: ${total_rev - total_cost:.2f} ({((total_rev - total_cost) / total_rev * 100):.1f}% if rev > 0)")

conn.close()
print("\nDone.")
