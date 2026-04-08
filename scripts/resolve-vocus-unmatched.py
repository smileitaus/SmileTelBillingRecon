#!/usr/bin/env python3
"""
resolve-vocus-unmatched.py

Resolves the 30 unmatched Vocus IPTel contracts using confirmed customer mappings.
Creates new customers where needed (Salter Brothers Hospitality, Hazelwood Estate,
Novus Glass, ASDL Ltd). Keeps "Pending" contracts unmatched but preserves their
original client names in discoveryNotes.
"""

import os
import sys
import pymysql
import pymysql.cursors
from urllib.parse import urlparse

DATABASE_URL = os.environ.get('DATABASE_URL', '')
if not DATABASE_URL:
    print("ERROR: DATABASE_URL not set", file=sys.stderr)
    sys.exit(1)

parsed = urlparse(DATABASE_URL)
conn = pymysql.connect(
    host=parsed.hostname,
    port=parsed.port or 3306,
    user=parsed.username,
    password=parsed.password,
    database=parsed.path.lstrip('/'),
    charset='utf8mb4',
    cursorclass=pymysql.cursors.DictCursor,
    autocommit=True,
    ssl={'ssl': {}},
)
cur = conn.cursor()

# ─── Get next customer externalId ─────────────────────────────────────────────
cur.execute("SELECT MAX(CAST(SUBSTRING(externalId, 2) AS UNSIGNED)) as maxId FROM customers WHERE externalId LIKE 'C%'")
row = cur.fetchone()
next_cust_id = (row['maxId'] or 0) + 1

def next_cust_ext_id():
    global next_cust_id
    eid = f"C{str(next_cust_id).zfill(4)}"
    next_cust_id += 1
    return eid

def create_customer(name, business_name=None):
    eid = next_cust_ext_id()
    cur.execute("""
        INSERT INTO customers (externalId, name, businessName, createdAt, updatedAt)
        VALUES (%s, %s, %s, NOW(), NOW())
    """, (eid, name, business_name or name))
    print(f"  Created customer: {eid} → {name}")
    return eid

def get_customer(name_like):
    cur.execute("SELECT externalId, name FROM customers WHERE name LIKE %s LIMIT 1", (f'%{name_like}%',))
    return cur.fetchone()

# ─── Resolve existing customers ───────────────────────────────────────────────

# Confirmed mappings: contract_id → customer externalId (or lookup key)
# Format: (contract_id, customer_ext_id_or_lookup, lookup_type)
# lookup_type: 'direct' = use ext_id directly, 'search' = search by name

# Known existing customers
smile_it = get_customer('Smile IT')
asg = get_customer('ASG')
young_guns = get_customer('Young Guns Container')
aussie_hail = get_customer('Aussie Hail')
sycamore = get_customer('Sycamore School')  # The Sycamore School
salter_potts = get_customer('Salter Bros Potts Point')

print("Found existing customers:")
for label, c in [('Smile IT', smile_it), ('ASG', asg), ('Young Guns Container', young_guns),
                  ('Aussie Hail', aussie_hail), ('Sycamore', sycamore), ('Salter Potts', salter_potts)]:
    print(f"  {label}: {c['externalId'] if c else 'NOT FOUND'} - {c['name'] if c else '?'}")

# ─── Create missing customers ─────────────────────────────────────────────────
print("\nCreating missing customers...")

# Check if Salter Brothers Hospitality exists
sbh = get_customer('Salter Brothers Hospitality')
if not sbh:
    sbh_id = create_customer('Salter Brothers Hospitality', 'Salter Brothers Hospitality Pty Ltd')
    sbh = {'externalId': sbh_id, 'name': 'Salter Brothers Hospitality'}

# Hazelwood Estate
hazelwood = get_customer('Hazelwood Estate')
if not hazelwood:
    hw_id = create_customer('Hazelwood Estate', 'Hazelwood Estate')
    hazelwood = {'externalId': hw_id, 'name': 'Hazelwood Estate'}

# Novus Glass
novus = get_customer('Novus Glass')
if not novus:
    nv_id = create_customer('Novus Glass', 'Novus Glass')
    novus = {'externalId': nv_id, 'name': 'Novus Glass'}

# ASDL Ltd
asdl = get_customer('ASDL')
if not asdl:
    asdl_id = create_customer('ASDL Ltd', 'ASDL Ltd')
    asdl = {'externalId': asdl_id, 'name': 'ASDL Ltd'}

# ─── Contract → customer mappings ─────────────────────────────────────────────
# Pending: SME (AB054529), BN-002035 V2 (AB031926), Milestone/Legrand (AB046638)

contract_mappings = {
    # SmileTel = Smile IT
    'AB028007': smile_it['externalId'] if smile_it else None,
    'AB029816': smile_it['externalId'] if smile_it else None,
    'AB030843': smile_it['externalId'] if smile_it else None,
    # SmileIT = Smile IT
    'AB056493': smile_it['externalId'] if smile_it else None,
    # SBH = Salter Brothers Hospitality
    'AB038552': sbh['externalId'],
    'AB038170': sbh['externalId'],   # SGH - same group
    'AB038011': sbh['externalId'],   # SGH - same group
    # Sp-Potts = Salter Brothers Potts Point
    'AB030398': salter_potts['externalId'] if salter_potts else None,
    # Action Smart Group and all ASG variants
    'AB056258': asg['externalId'] if asg else None,
    'AB056202': asg['externalId'] if asg else None,
    'AB052221': asg['externalId'] if asg else None,
    'AB058255': asg['externalId'] if asg else None,
    'AB056114': asg['externalId'] if asg else None,   # ASG End 2 End Hail Repair
    'AB056135': asg['externalId'] if asg else None,   # Action Smart End 2 End
    'IPH123946504': asg['externalId'] if asg else None,  # ASG Adelaide
    'IPH123946528': asg['externalId'] if asg else None,  # ASG Newcastle
    'IPH123932317': asg['externalId'] if asg else None,  # End 2 End Repair Solutions
    'IPH123932301': asg['externalId'] if asg else None,
    'IPH123932299': asg['externalId'] if asg else None,
    # YGCC = Young Guns Container
    'AB054331': young_guns['externalId'] if young_guns else None,
    # Aussie Hail
    'AB029824': aussie_hail['externalId'] if aussie_hail else None,
    # Hazelwood Estate
    'AB055689': hazelwood['externalId'],
    # Novus Glass
    'IPH123900226': novus['externalId'],
    'IPH123900223': novus['externalId'],
    'IPH123900224': novus['externalId'],
    # Sycamore
    'AB057970': sycamore['externalId'] if sycamore else None,
    # ASDL Ltd
    'AB058160': asdl['externalId'],
    # Pending (leave unmatched): SME AB054529, BN-002035 AB031926, Milestone AB046638
    'AB054529': None,   # SME - Pending
    'AB031926': None,   # BN-002035 V2 - Pending
    'AB046638': None,   # Milestone/Legrand - Pending
}

# ─── Apply mappings to services ───────────────────────────────────────────────
print("\nApplying contract → customer mappings to services...")

updated = 0
skipped_pending = 0

for contract_id, customer_ext_id in contract_mappings.items():
    # Find the service with this contract in discoveryNotes
    cur.execute("""
        SELECT id, externalId, discoveryNotes, customerExternalId
        FROM services
        WHERE dataSource = 'Vocus IPTel Import'
          AND discoveryNotes LIKE %s
    """, (f'%Contract: {contract_id}%',))
    svc = cur.fetchone()
    
    if not svc:
        print(f"  WARNING: No service found for contract {contract_id}")
        continue
    
    if customer_ext_id is None:
        print(f"  PENDING: {contract_id} → left unmatched (Pending)")
        skipped_pending += 1
        continue
    
    cur.execute("""
        UPDATE services
        SET customerExternalId = %s, updatedAt = NOW()
        WHERE id = %s
    """, (customer_ext_id, svc['id']))
    
    # Get customer name for logging
    cur.execute("SELECT name FROM customers WHERE externalId = %s", (customer_ext_id,))
    cust = cur.fetchone()
    print(f"  Matched: {contract_id} → {customer_ext_id} ({cust['name'] if cust else '?'})")
    updated += 1

conn.close()

print(f"\n=== RESULTS ===")
print(f"Contracts matched: {updated}")
print(f"Contracts left pending: {skipped_pending}")
print("Done.")
