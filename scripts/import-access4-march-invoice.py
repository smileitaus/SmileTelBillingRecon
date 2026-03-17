#!/usr/bin/env python3
"""Import Access4/SasBoss March 2026 invoice into the billing tool database.
Matches 74 enterprises to customers using fuzzy logic, stores mapping rules
for repeatable future imports, and updates the supplier registry cost totals.
"""
import os, urllib.parse, json
import pymysql
from difflib import SequenceMatcher

url = os.environ.get('DATABASE_URL', '')
parsed = urllib.parse.urlparse(url)
conn = pymysql.connect(
    host=parsed.hostname, port=parsed.port or 3306,
    user=parsed.username, password=parsed.password,
    database=parsed.path.lstrip('/'), ssl={'ssl': True},
    connect_timeout=10
)
cur = conn.cursor()

# 74 customer enterprises from Access4 Invoice #85657 March 2026
# (6 internal Smile IT entries excluded)
enterprises = [
    {"name": "A & K Financial Planning", "endpoints": 2, "mrc": 18.20, "variable": 0.78, "once_off": 0.00},
    {"name": "Active Living - Allen Developments Pty Ltd", "endpoints": 2, "mrc": 36.80, "variable": 1.20, "once_off": 0.00},
    {"name": "Adams Financial Group", "endpoints": 3, "mrc": 54.40, "variable": 8.00, "once_off": 0.00},
    {"name": "Affinage Professional", "endpoints": 1, "mrc": 89.13, "variable": 11.90, "once_off": 0.00},
    {"name": "ARM Group Pty Ltd ATF ARM Property Trust No. 2", "endpoints": 3, "mrc": 39.40, "variable": 0.40, "once_off": 0.00},
    {"name": "Aromas Noosa", "endpoints": 1, "mrc": 18.40, "variable": 0.00, "once_off": 0.00},
    {"name": "ASG Hail Pty Ltd", "endpoints": 33, "mrc": 1220.93, "variable": 106.16, "once_off": 0.00},
    {"name": "Atlantis Pool Shop", "endpoints": 3, "mrc": 54.40, "variable": 0.20, "once_off": 0.00},
    {"name": "Aus Ships", "endpoints": 1, "mrc": 14.42, "variable": 0.00, "once_off": 102.86},
    {"name": "Australian Air Science", "endpoints": 22, "mrc": 199.00, "variable": 10.70, "once_off": 0.00},
    {"name": "Australian Computer Traders", "endpoints": 19, "mrc": 157.39, "variable": 9.57, "once_off": 0.00},
    {"name": "Australian Resort Management Pty Ltd", "endpoints": 51, "mrc": 108.40, "variable": 0.40, "once_off": 0.00},
    {"name": "Back2Health", "endpoints": 1, "mrc": 7.90, "variable": 5.91, "once_off": 0.00},
    {"name": "Balanced Business Accounting", "endpoints": 6, "mrc": 57.23, "variable": 12.31, "once_off": 0.00},
    {"name": "Bar Alto", "endpoints": 3, "mrc": 27.60, "variable": 1.31, "once_off": 0.00},
    {"name": "Branyan Early Learning Centre", "endpoints": 6, "mrc": 48.40, "variable": 2.13, "once_off": 0.00},
    {"name": "BT Lawyers Pty Ltd", "endpoints": None, "mrc": 308.20, "variable": 25.80, "once_off": 0.00},
    {"name": "Bush to Beach Legal Pty Ltd", "endpoints": None, "mrc": 80.00, "variable": 98.86, "once_off": 0.00},
    {"name": "Butchulla Enterprises Ltd", "endpoints": 3, "mrc": 39.60, "variable": 0.00, "once_off": 0.00},
    {"name": "Caneland Engineering", "endpoints": 10, "mrc": 67.53, "variable": 6.66, "once_off": 0.00},
    {"name": "Cassels Strata Management Pty Ltd", "endpoints": None, "mrc": 54.60, "variable": 35.50, "once_off": 0.00},
    {"name": "Catolin Pty Ltd T-A Helloworld Strathpine", "endpoints": 11, "mrc": 150.60, "variable": 27.54, "once_off": 0.00},
    {"name": "CMC Property Management", "endpoints": 7, "mrc": 57.53, "variable": 2.17, "once_off": 0.00},
    {"name": "CPM Advisory and Project Management", "endpoints": 21, "mrc": 164.60, "variable": 5.56, "once_off": 0.00},
    {"name": "DanKel Electrical Pty Ltd", "endpoints": 1, "mrc": 18.40, "variable": 0.00, "once_off": 0.00},
    {"name": "DJ Steel Biloela - AJ and KL Fletcher", "endpoints": 11, "mrc": 160.20, "variable": 11.00, "once_off": 0.00},
    {"name": "Doyles Trade Centre", "endpoints": 29, "mrc": 168.70, "variable": 34.81, "once_off": 0.00},
    {"name": "Emergency Medicine Foundation", "endpoints": 1, "mrc": 9.40, "variable": 0.00, "once_off": 0.00},
    {"name": "Fast Cut Qld Pty Ltd", "endpoints": 5, "mrc": 90.33, "variable": 0.00, "once_off": 0.00},
    {"name": "First National Childers", "endpoints": 6, "mrc": 108.40, "variable": 0.80, "once_off": 0.00},
    {"name": "Flutterbys Child Care", "endpoints": 7, "mrc": 126.20, "variable": 0.80, "once_off": 0.00},
    {"name": "GEORGE'S LOADER HIRE PTY LTD", "endpoints": 4, "mrc": 36.40, "variable": 5.21, "once_off": 0.00},
    {"name": "Graphene Manufacturing Australia", "endpoints": None, "mrc": 5.20, "variable": 1.00, "once_off": 0.00},
    {"name": "Groundswell Accounting & Advisory", "endpoints": 10, "mrc": 99.36, "variable": 17.67, "once_off": 0.00},
    {"name": "Grunskes by the River", "endpoints": 10, "mrc": 147.20, "variable": 1.60, "once_off": 0.00},
    {"name": "Institute for Healthy Communities Australia", "endpoints": 18, "mrc": 80.20, "variable": 19.74, "once_off": 0.00},
    {"name": "Integrated Oral and Maxillofacial Surgery Pty Ltd", "endpoints": 6, "mrc": 93.20, "variable": 6.40, "once_off": 0.00},
    {"name": "Just Better Care", "endpoints": None, "mrc": 0.40, "variable": 0.00, "once_off": 0.00},
    {"name": "Kaleidoscope Australasia Pty Ltd", "endpoints": 9, "mrc": 95.20, "variable": 8.02, "once_off": 0.00},
    {"name": "Lead Childcare", "endpoints": 59, "mrc": 445.00, "variable": 84.62, "once_off": 0.00},
    {"name": "Livingstone Low Electrical Pty Ltd", "endpoints": 2, "mrc": 36.40, "variable": 0.40, "once_off": 0.00},
    {"name": "Loving Tan", "endpoints": 2, "mrc": 18.40, "variable": 0.07, "once_off": 0.00},
    {"name": "Makris Group - Balgra Shopping Centre", "endpoints": 12, "mrc": 110.00, "variable": 1.71, "once_off": 0.00},
    {"name": "Mega Electrics", "endpoints": 1, "mrc": 71.53, "variable": 9.10, "once_off": 0.00},
    {"name": "Mother Duck Bellbowrie", "endpoints": 6, "mrc": 46.20, "variable": 5.88, "once_off": 0.00},
    {"name": "Mother Duck Eatons Hill", "endpoints": 6, "mrc": 54.40, "variable": 4.38, "once_off": 0.00},
    {"name": "Mother Duck Enoggera", "endpoints": 6, "mrc": 0.49, "variable": 2.81, "once_off": 17.14},
    {"name": "Nicki's Professional Security Screens & Blinds", "endpoints": 2, "mrc": 21.40, "variable": 2.20, "once_off": 0.00},
    {"name": "Nina Bambino Dental", "endpoints": 10, "mrc": 84.20, "variable": 7.40, "once_off": 0.00},
    {"name": "North Coast Mower Centre", "endpoints": 4, "mrc": 57.20, "variable": 3.80, "once_off": 0.00},
    {"name": "Nurturing Brain Potential", "endpoints": 3, "mrc": 16.70, "variable": 7.98, "once_off": 0.00},
    {"name": "Paedicare Pty Ltd", "endpoints": 10, "mrc": 75.75, "variable": 47.93, "once_off": 0.00},
    {"name": "Promogear", "endpoints": 13, "mrc": 72.10, "variable": 1.75, "once_off": 0.00},
    {"name": "Red Roo Australia", "endpoints": 0, "mrc": -7.25, "variable": 1.22, "once_off": 0.00},
    {"name": "Res-Com Airconditioning Pty Ltd", "endpoints": 1, "mrc": 11.00, "variable": 0.64, "once_off": 0.00},
    {"name": "River City Maintenance", "endpoints": 12, "mrc": 116.80, "variable": 28.91, "once_off": 0.00},
    {"name": "Riverside Marine", "endpoints": None, "mrc": 0.20, "variable": 1100.00, "once_off": 0.00},
    {"name": "Rockwell Technology", "endpoints": 3, "mrc": 54.20, "variable": 0.20, "once_off": 0.00},
    {"name": "Seven Digit's Pty Ltd", "endpoints": 1, "mrc": 4.10, "variable": 1.38, "once_off": 0.00},
    {"name": "Sparrow Group Management Pty Ltd", "endpoints": 213, "mrc": 1654.42, "variable": 103.55, "once_off": 102.86},
    {"name": "STA Consulting Engineers", "endpoints": 75, "mrc": 706.53, "variable": 48.15, "once_off": 0.00},
    {"name": "Suncoast Building Approvals", "endpoints": 25, "mrc": 258.70, "variable": 9.79, "once_off": 0.00},
    {"name": "Swara", "endpoints": 1, "mrc": 9.60, "variable": 2.42, "once_off": 0.00},
    {"name": "T2 Electrical and Data", "endpoints": None, "mrc": 1.00, "variable": 0.00, "once_off": 0.00},
    {"name": "Talisman Partners", "endpoints": 1, "mrc": 9.20, "variable": 0.24, "once_off": 0.00},
    {"name": "The Sycamore School", "endpoints": 36, "mrc": 151.20, "variable": 14.15, "once_off": 0.00},
    {"name": "The Trustee for The Ferguson Family Trust", "endpoints": 2, "mrc": 60.04, "variable": 3.80, "once_off": 0.00},
    {"name": "THRL Pty Ltd trading as Scenic Rim Trail", "endpoints": 3, "mrc": 27.20, "variable": 5.13, "once_off": 0.00},
    {"name": "Travellers Group", "endpoints": 3, "mrc": 26.20, "variable": 0.00, "once_off": 0.00},
    {"name": "Troocoo", "endpoints": 4, "mrc": 36.60, "variable": 0.23, "once_off": 0.00},
    {"name": "True Metal Solutions", "endpoints": 9, "mrc": 117.20, "variable": 5.60, "once_off": 0.00},
    {"name": "Viribus Kippa-Ring Pty Ltd (Golds Gym)", "endpoints": 2, "mrc": 36.40, "variable": 0.00, "once_off": 0.00},
    {"name": "Wattle Court Homes Pty Ltd", "endpoints": 7, "mrc": 167.20, "variable": 1.00, "once_off": 0.00},
    {"name": "Wattlestone", "endpoints": 2, "mrc": 24.60, "variable": 0.03, "once_off": 0.00},
    {"name": "Wineology", "endpoints": 1, "mrc": 0.20, "variable": 0.00, "once_off": 0.00},
    {"name": "Woodlands Enterprises Pty Ltd", "endpoints": None, "mrc": 14.95, "variable": 0.00, "once_off": 0.00},
    {"name": "Yallungah Boutique Hotel", "endpoints": 2, "mrc": 36.40, "variable": 16.56, "once_off": 0.00},
    {"name": "Zambrero Sites", "endpoints": 94, "mrc": 88.46, "variable": 13.71, "once_off": 51.42},
]

# Load all customers
cur.execute("SELECT id, name, xeroContactName FROM customers")
db_customers = cur.fetchall()
print(f"Total DB customers: {len(db_customers)}")

def fuzzy_score(a, b):
    a, b = a.lower().strip(), b.lower().strip()
    if a == b: return 1.0
    if a in b or b in a: return 0.92
    return SequenceMatcher(None, a, b).ratio()

def find_best_match(ent_name, customers, threshold=0.72):
    best_score = 0
    best_customer = None
    for cid, cname, xero in customers:
        for name in [n for n in [cname, xero] if n]:
            score = fuzzy_score(ent_name, name)
            if score > best_score:
                best_score = score
                best_customer = (cid, cname)
    if best_score >= threshold:
        return best_customer, best_score
    return None, best_score

matched = []
unmatched = []
for ent in enterprises:
    customer, score = find_best_match(ent['name'], db_customers)
    total_cost = round(ent['mrc'] + ent['variable'] + ent['once_off'], 2)
    if customer:
        matched.append({**ent, 'customer_id': customer[0], 'customer_name': customer[1],
                       'match_score': round(score, 3), 'total_cost': total_cost,
                       'match_type': 'exact' if score >= 0.95 else 'fuzzy'})
    else:
        unmatched.append({**ent, 'total_cost': total_cost, 'best_score': round(score, 3)})

print(f"Matched: {len(matched)}, Unmatched: {len(unmatched)}")

# Clean up any previous import of this invoice
cur.execute("DELETE FROM supplier_invoice_uploads WHERE invoiceNumber = '85657' AND supplier = 'SasBoss'")

# Create invoice upload record
cur.execute("""INSERT INTO supplier_invoice_uploads 
    (supplier, invoiceNumber, accountNumber, billingPeriod, issueDate, billingMonth,
     totalExGst, totalIncGst, serviceCount, matchedCount, unmatchedCount, 
     autoMatchedCount, newMappingsCreated, importedBy, status, notes)
    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
    ('SasBoss', '85657', '2028159', 'March 2026', '2026-03-01', '2026-03',
     12513.32, 13764.65, len(enterprises), len(matched), len(unmatched),
     len([m for m in matched if m['match_type'] == 'exact']),
     len(matched), 'system', 'imported',
     f'Access4 Invoice #85657 March 2026. {len(matched)} matched, {len(unmatched)} unmatched.'))
invoice_id = cur.lastrowid
print(f"Invoice upload record id: {invoice_id}")

# Store/update mapping rules
for m in matched:
    cur.execute("""SELECT id FROM supplier_service_map 
                   WHERE supplierName = 'SasBoss' AND matchKeyType = 'enterprise_name' 
                   AND matchKeyValue = %s""", (m['name'],))
    existing = cur.fetchone()
    note = f"MRC: ${m['mrc']:.2f}, Variable: ${m['variable']:.2f}, Endpoints: {m['endpoints']}, Invoice: 85657"
    if existing:
        cur.execute("""UPDATE supplier_service_map SET 
            customerExternalId = %s, customerName = %s, confidence = %s,
            lastUsedAt = NOW(), useCount = useCount + 1, isActive = 1,
            notes = %s, updatedAt = NOW()
            WHERE id = %s""",
            (str(m['customer_id']), m['customer_name'], m['match_score'], note, existing[0]))
    else:
        cur.execute("""INSERT INTO supplier_service_map 
            (supplierName, matchKeyType, matchKeyValue, productType, description,
             customerExternalId, customerName, confirmedBy, confidence, lastUsedAt, useCount, isActive, notes)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,NOW(),1,1,%s)""",
            ('SasBoss', 'enterprise_name', m['name'], 'UCaaS',
             f"Access4 enterprise: {m['name']}",
             str(m['customer_id']), m['customer_name'],
             'auto' if m['match_type'] == 'exact' else 'fuzzy',
             m['match_score'], note))

# Store unmatched for review
for u in unmatched:
    cur.execute("""SELECT id FROM supplier_service_map 
                   WHERE supplierName = 'SasBoss' AND matchKeyType = 'enterprise_name' 
                   AND matchKeyValue = %s""", (u['name'],))
    if not cur.fetchone():
        cur.execute("""INSERT INTO supplier_service_map 
            (supplierName, matchKeyType, matchKeyValue, productType, description,
             customerExternalId, customerName, confirmedBy, confidence, lastUsedAt, useCount, isActive, notes)
            VALUES (%s,%s,%s,%s,%s,'','','unmatched',%s,NOW(),1,1,%s)""",
            ('SasBoss', 'enterprise_name', u['name'], 'UCaaS',
             f"UNMATCHED: {u['name']}",
             u['best_score'],
             f"MRC: ${u['mrc']:.2f}, Variable: ${u['variable']:.2f}, Endpoints: {u['endpoints']}"))

# Add/update SasBoss in supplier_registry
cur.execute("SELECT id FROM supplier_registry WHERE name = 'SasBoss'")
existing_reg = cur.fetchone()
if existing_reg:
    cur.execute("""UPDATE supplier_registry SET 
        totalMonthlyCost = %s, lastInvoiceDate = '2026-03-01', lastInvoiceNumber = '85657',
        totalServices = %s, updatedAt = NOW()
        WHERE name = 'SasBoss'""",
        (12513.32, len(enterprises)))
    print("Updated SasBoss in supplier_registry")
else:
    cur.execute("""INSERT INTO supplier_registry 
        (name, displayName, category, `rank`, abn, uploadFormats, uploadInstructions, isActive,
         totalServices, totalMonthlyCost, lastInvoiceDate, lastInvoiceNumber, notes)
        VALUES (%s,%s,%s,%s,%s,%s,%s,1,%s,%s,%s,%s,%s)""",
        ('SasBoss', 'Access4 / SasBoss', 'UCaaS', 3, '66 609 946 796',
         'pdf,xlsx',
         'Upload the Access4 invoice PDF or SasBoss Dispatch Charges XLSX. Enterprise names are matched to customers using fuzzy logic. Previous matches are auto-applied.',
         len(enterprises), 12513.32, '2026-03-01', '85657',
         'Access4 Pty Ltd (ABN 66 609 946 796) - UCaaS platform provider. SmileIT is Diamond tier reseller.'))
    print("Created SasBoss in supplier_registry")

conn.commit()

print(f"\n=== IMPORT COMPLETE ===")
print(f"Matched: {len(matched)}/{len(enterprises)} enterprises")
print(f"Unmatched: {len(unmatched)} enterprises")
print(f"\nMatched enterprises (by MRC desc):")
for m in sorted(matched, key=lambda x: x['mrc'], reverse=True)[:15]:
    print(f"  [{m['match_type'].upper():5}|{m['match_score']:.2f}] {m['name'][:40]:40} -> {m['customer_name'][:30]:30} MRC:${m['mrc']:.2f}")
print(f"\nUnmatched:")
for u in unmatched:
    print(f"  [score:{u['best_score']:.2f}] {u['name']} (MRC: ${u['mrc']:.2f})")

cur.execute("SELECT name, displayName, totalMonthlyCost, lastInvoiceNumber, totalServices FROM supplier_registry")
print(f"\nSupplier registry:")
for r in cur.fetchall():
    print(f"  {r}")

conn.close()
