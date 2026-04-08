#!/usr/bin/env python3
"""
import-vocus-iptel.py

Imports Vocus IPTel usage data from VocusSmileITIPTel.xlsx.
- Aggregates charges by Contract ID → one service record per contract
- Fuzzy-matches Client Name to existing DB customers
- Creates/updates services with provider=Vocus, correct costs
- Logs unmatched clients for manual review
"""

import os
import re
import sys
from collections import defaultdict
from pathlib import Path

import openpyxl
import pymysql
import pymysql.cursors
from urllib.parse import urlparse

# ─── DB connection ────────────────────────────────────────────────────────────

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

# ─── Fuzzy matching ───────────────────────────────────────────────────────────

def normalise(s):
    if not s:
        return ''
    s = s.lower()
    s = re.sub(r'\bpty\b|\bltd\b|\bpty ltd\b|\binc\b|\bco\b|\bthe\b', '', s)
    s = re.sub(r'[^a-z0-9\s]', '', s)
    s = re.sub(r'\s+', ' ', s).strip()
    return s

def token_overlap(a, b):
    ta = set(normalise(a).split())
    tb = set(normalise(b).split())
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / max(len(ta), len(tb))

def levenshtein(a, b):
    m, n = len(a), len(b)
    dp = list(range(n + 1))
    for i in range(1, m + 1):
        prev = dp[:]
        dp[0] = i
        for j in range(1, n + 1):
            if a[i-1] == b[j-1]:
                dp[j] = prev[j-1]
            else:
                dp[j] = 1 + min(prev[j], dp[j-1], prev[j-1])
    return dp[n]

def fuzzy_score(vocus_name, db_name, db_business=''):
    vn = normalise(vocus_name)
    dn = normalise(db_name)
    db = normalise(db_business or '')
    
    score_n = token_overlap(vn, dn)
    score_b = token_overlap(vn, db) if db else 0
    token_score = max(score_n, score_b)
    
    max_len = max(len(vn), len(dn), 1)
    lev_score = 1 - levenshtein(vn, dn) / max_len
    
    return token_score * 0.7 + lev_score * 0.3

def find_best_match(vocus_client_name, customers):
    if not vocus_client_name:
        return None
    
    vn = normalise(vocus_client_name)
    
    # Exact normalised match
    for c in customers:
        if normalise(c['name']) == vn or normalise(c.get('businessName') or '') == vn:
            return {'customer': c, 'score': 1.0, 'method': 'exact'}
    
    # Fuzzy match
    best = None
    best_score = 0.0
    for c in customers:
        score = fuzzy_score(vocus_client_name, c['name'], c.get('businessName') or '')
        if score > best_score:
            best_score = score
            best = c
    
    if best_score >= 0.55:
        return {'customer': best, 'score': best_score, 'method': 'fuzzy'}
    
    # Containment check
    for c in customers:
        dn = normalise(c['name'])
        if len(dn) > 3 and (vn in dn or dn in vn):
            return {'customer': c, 'score': 0.6, 'method': 'contains'}
    
    return None

# ─── Service type mapping ─────────────────────────────────────────────────────

def map_service_type(charge_desc, product=''):
    if not charge_desc:
        return 'VoIP'
    d = charge_desc.lower()
    if 'sip trunk' in d or 'sip reseller' in d:
        return 'VoIP'
    if 'voice access' in d:
        return 'Voice'
    if 'number range' in d or 'single number' in d or 'number block' in d:
        return 'Voice'
    return 'VoIP'

# ─── Load spreadsheet ─────────────────────────────────────────────────────────

xlsx_path = Path(__file__).parent.parent / 'VocusSmileITIPTel.xlsx'
wb = openpyxl.load_workbook(str(xlsx_path), read_only=True, data_only=True)
ws = wb['Sheet1']
rows = list(ws.iter_rows(values_only=True))
wb.close()

headers = rows[0]
data = [dict(zip(headers, row)) for row in rows[1:] if any(row)]
print(f"Loaded {len(data)} rows from spreadsheet")

# Aggregate by Contract ID
contract_map = {}
for row in data:
    cid = row.get('Contract ID')
    if not cid:
        continue
    
    if cid not in contract_map:
        contract_map[cid] = {
            'contractId': cid,
            'clientName': row.get('Client Name') or '',
            'purchaseOrderRef': row.get('Purchase Order Reference') or '',
            'product': row.get('Product') or '',
            'serviceType': row.get('Service Type') or '',
            'siteA': row.get('Site A') or '',
            'invoiceDate': row.get('Invoice Date'),
            'periodFrom': row.get('Charge Period From Date'),
            'periodTo': row.get('Charge Period To Date'),
            'vocusRef': row.get('Vocus Internal Reference') or '',
            'chargeDescs': set(),
            'totalExTax': 0.0,
            'totalIncTax': 0.0,
            'recurringTotal': 0.0,
            'usageTotal': 0.0,
        }
    
    entry = contract_map[cid]
    ex_tax = float(row.get('Charge Ex-TaxAmount') or 0)
    inc_tax = float(row.get('Charge Inc-TaxAmount') or 0)
    entry['totalExTax'] += ex_tax
    entry['totalIncTax'] += inc_tax
    if row.get('Charge Type') == 'Recurring':
        entry['recurringTotal'] += ex_tax
    if row.get('Charge Type') == 'Usage':
        entry['usageTotal'] += ex_tax
    if row.get('Charge Description'):
        entry['chargeDescs'].add(row['Charge Description'])

print(f"Aggregated to {len(contract_map)} unique contracts")

# Load customers
cur.execute("SELECT id, externalId, name, businessName FROM customers")
customers = cur.fetchall()
print(f"Loaded {len(customers)} customers from DB")

# Get next service externalId
cur.execute("SELECT MAX(CAST(SUBSTRING(externalId, 2) AS UNSIGNED)) as maxId FROM services WHERE externalId LIKE 'S%'")
row = cur.fetchone()
next_svc_id = (row['maxId'] or 0) + 1

# Delete existing Vocus IPTel Import services (clean re-import)
cur.execute("DELETE FROM services WHERE dataSource = 'Vocus IPTel Import'")
print(f"Cleared existing Vocus IPTel Import services")

# Process each contract
results = {'created': 0, 'matched': [], 'unmatched': []}

for cid, entry in contract_map.items():
    match_result = find_best_match(entry['clientName'], customers)
    
    # Build notes
    charge_desc_list = ', '.join(sorted(entry['chargeDescs']))
    period_from = entry['periodFrom'].strftime('%d/%m/%Y') if entry['periodFrom'] else '?'
    period_to = entry['periodTo'].strftime('%d/%m/%Y') if entry['periodTo'] else '?'
    
    notes_parts = [
        f"Contract: {cid}",
        f"Vocus Ref: {entry['vocusRef']}",
        f"Client: {entry['clientName']}",
    ]
    if entry['purchaseOrderRef']:
        notes_parts.append(f"PO Ref: {entry['purchaseOrderRef']}")
    notes_parts += [
        f"Recurring: ${entry['recurringTotal']:.2f} | Usage: ${entry['usageTotal']:.2f}",
        f"Charges: {charge_desc_list}",
        f"Period: {period_from} – {period_to}",
    ]
    notes = '\n'.join(notes_parts)
    
    primary_desc = sorted(entry['chargeDescs'])[0] if entry['chargeDescs'] else 'IP Tel Service'
    svc_type = map_service_type(primary_desc, entry['product'])
    customer_ext_id = match_result['customer']['externalId'] if match_result else None
    
    svc_ext_id = f"S{str(next_svc_id).zfill(4)}"
    next_svc_id += 1
    
    cur.execute("""
        INSERT INTO services (
            externalId, serviceType, planName, provider, dataSource,
            monthlyCost, monthlyRevenue, customerExternalId,
            discoveryNotes, status, createdAt, updatedAt
        ) VALUES (%s, %s, %s, 'Vocus', 'Vocus IPTel Import', %s, 0, %s, %s, 'active', NOW(), NOW())
    """, (
        svc_ext_id,
        svc_type,
        primary_desc,
        round(entry['totalExTax'], 2),
        customer_ext_id,
        notes,
    ))
    results['created'] += 1
    
    if match_result:
        results['matched'].append({
            'contractId': cid,
            'clientName': entry['clientName'],
            'matchedTo': match_result['customer']['name'],
            'score': round(match_result['score'], 2),
            'method': match_result['method'],
            'total': round(entry['totalExTax'], 2),
        })
    else:
        results['unmatched'].append({
            'contractId': cid,
            'clientName': entry['clientName'],
            'total': round(entry['totalExTax'], 2),
        })

conn.close()

print(f"\n=== IMPORT RESULTS ===")
print(f"Created: {results['created']} new services")
print(f"Matched to customers: {len(results['matched'])}")
print(f"Unmatched (no customer found): {len(results['unmatched'])}")

print(f"\n=== MATCHED CONTRACTS ===")
print(f"{'Contract':<20} {'Vocus Client':<35} {'Matched To':<35} {'Score':>6} {'Method':<10} {'Total $':>10}")
print('-' * 120)
for m in sorted(results['matched'], key=lambda x: -x['total']):
    print(f"{m['contractId']:<20} {m['clientName'][:34]:<35} {m['matchedTo'][:34]:<35} {m['score']:>6.2f} {m['method']:<10} ${m['total']:>9.2f}")

if results['unmatched']:
    print(f"\n=== UNMATCHED CONTRACTS (need manual assignment) ===")
    print(f"{'Contract':<20} {'Vocus Client':<40} {'Total $':>10}")
    print('-' * 75)
    for u in sorted(results['unmatched'], key=lambda x: -x['total']):
        print(f"{u['contractId']:<20} {u['clientName'][:39]:<40} ${u['total']:>9.2f}")

grand_total = sum(e['totalExTax'] for e in contract_map.values())
print(f"\nGrand total imported: ${grand_total:.2f} ex-GST")
print("Done.")
