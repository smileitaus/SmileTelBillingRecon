#!/usr/bin/env python3
"""
Merge duplicate Salter Brothers / Spicers customer records.
The Xero-imported records (C02xx) are the canonical records (have legal entity names + revenue).
The Vocus/ABB-imported records (C24xx/C26xx) have wholesale cost services only.
Strategy: reassign all services from the duplicate to the canonical, then delete the duplicate.
"""
import pymysql
import os
import re

url = os.environ['DATABASE_URL']
# Parse mysql://user:pass@host:port/db
m = re.match(r'mysql://([^:]+):([^@]+)@([^:]+):(\d+)/(.+)', url)
user, password, host, port, db = m.group(1), m.group(2), m.group(3), int(m.group(4)), m.group(5)

conn = pymysql.connect(host=host, port=port, user=user, password=password, database=db, charset='utf8mb4', ssl={'ssl_mode': 'REQUIRED'})
cur = conn.cursor()

# High-confidence merge pairs: (keep_id, merge_from_id, description)
MERGE_PAIRS = [
    ('C0208', 'C2659', 'Salter Brothers (Clovelly) ← Spicers Clovelly Estate'),
    ('C0210', 'C2660', 'Salter Brothers (Peak Lodge) ← Spicers Peak Lodge'),
    ('C0211', 'C2662', 'Salter Brothers (Sangoma) ← Spicers Sangoma'),
    ('C0212', 'C2663', 'Salter Brothers (Tamarind) ← Spicers Tamarind'),
    ('C0213', 'C2664', 'Salter Brothers (Vineyards) ← Spicers Vineyards'),
    ('C0209', 'C2445', 'Salter Brothers (Guesthouse) ← Spicers Guest House'),
    # Potts Point / Spicers Potts Point
    ('C0216', 'C2439', 'Salter Brothers Mgmt (Potts Point) ← Salter Bros Potts Point'),
    # Luxury Collection / Spicers Retreats
    ('C0214', 'C2661', 'Salter Brothers Luxury Collection ← Spicers Retreats Hotels and Lodges'),
    # Balfour Hotel merges
    ('C2440', 'C2437', 'Salter Brothers ← Salter Bros Balfour Hotel'),
    ('C2440', 'C2444', 'Salter Brothers ← Spicers BH'),
]

total_services_moved = 0
total_customers_deleted = 0

for keep_id, merge_id, desc in MERGE_PAIRS:
    # Check both exist
    cur.execute('SELECT externalId, name FROM customers WHERE externalId = %s', (keep_id,))
    keep_row = cur.fetchone()
    cur.execute('SELECT externalId, name FROM customers WHERE externalId = %s', (merge_id,))
    merge_row = cur.fetchone()
    
    if not keep_row:
        print(f'SKIP: {desc} — keep record {keep_id} not found')
        continue
    if not merge_row:
        print(f'SKIP: {desc} — merge record {merge_id} not found')
        continue
    
    # Count services on the merge-from record
    cur.execute('SELECT COUNT(*) FROM services WHERE customerExternalId = %s', (merge_id,))
    svc_count = cur.fetchone()[0]
    
    # Reassign services
    cur.execute(
        'UPDATE services SET customerExternalId = %s, updatedAt = NOW() WHERE customerExternalId = %s',
        (keep_id, merge_id)
    )
    moved = cur.rowcount
    
    # Update the canonical customer's notes to record the merge
    cur.execute(
        'UPDATE customers SET updatedAt = NOW() WHERE externalId = %s',
        (keep_id,)
    )
    
    # Delete the duplicate customer (no services remain)
    cur.execute('DELETE FROM customers WHERE externalId = %s', (merge_id,))
    deleted = cur.rowcount
    
    total_services_moved += moved
    total_customers_deleted += deleted
    
    print(f'MERGED: {desc}')
    print(f'  Keep: {keep_id} ({keep_row[1]})')
    print(f'  From: {merge_id} ({merge_row[1]}) — moved {moved} services, deleted {deleted} customer record')

conn.commit()
print(f'\n=== SUMMARY ===')
print(f'Total services reassigned: {total_services_moved}')
print(f'Total duplicate customers deleted: {total_customers_deleted}')

# Also set billingPlatform = 'Datagate' on Vocus services for Salter Brothers
cur.execute("""
    UPDATE services 
    SET billingPlatform = 'Datagate', updatedAt = NOW()
    WHERE provider = 'Vocus' 
      AND (billingPlatform IS NULL OR billingPlatform = '')
""")
vocus_updated = cur.rowcount
conn.commit()
print(f'Vocus services updated with billingPlatform=Datagate: {vocus_updated}')

# Final check: Salter Brothers service counts
cur.execute("""
    SELECT c.externalId, c.name, COUNT(s.id) as svc_count,
           SUM(s.monthlyCost) as totalCost, SUM(s.monthlyRevenue) as totalRev
    FROM customers c
    LEFT JOIN services s ON s.customerExternalId = c.externalId
    WHERE c.name LIKE '%Salter%' OR c.name LIKE '%Spicers%'
    GROUP BY c.externalId, c.name
    ORDER BY c.externalId
""")
rows = cur.fetchall()
print('\n=== SALTER/SPICERS CUSTOMERS AFTER MERGE ===')
for r in rows:
    print(f'{r[0]} | {r[1]} | {r[2]} services | cost ${r[3] or 0:.2f} | rev ${r[4] or 0:.2f}')

conn.close()
