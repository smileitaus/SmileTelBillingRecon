"""
SM.xlsx Full Re-import with Customer Name Fuzzy Matching
=========================================================
Columns:
  A: Customer Name
  B: Service type (plan name)
  C: Service Provider
  D: SIM serial number ("  number")
  E: MSN/phone number
  F: Activation Date
  G: Port Out CID (carrier reference — goes to notes)
  H: Notes (free text)

Logic:
1. Parse all 428 rows, normalise phone/SIM
2. For each row, build a comprehensive notes string from Port Out CID + Notes col
3. Match existing services by SIM serial or phone number
4. For matched services: update provider, activation date, notes, and attempt customer name match
5. Customer name matching: exact → normalised → fuzzy (token overlap)
6. If customer name matches with confidence >= 70%: assign customer, set status='active'
7. If no customer match: leave unmatched but store SM customer name in discoveryNotes
8. Output detailed match report
"""

import openpyxl
import json
import re
import subprocess
import sys
from difflib import SequenceMatcher

# ── Load SM.xlsx ──────────────────────────────────────────────────────────────
wb = openpyxl.load_workbook('/home/ubuntu/billing-tool/SM.xlsx', data_only=True)
ws = wb['Sheet1']
rows = list(ws.iter_rows(values_only=True))
headers = rows[0]
data_rows = rows[1:]

# Filter empty rows
data_rows = [r for r in data_rows if any(c is not None and str(c).strip() not in ('', 'None') for c in r)]
print(f"SM rows: {len(data_rows)}")

# ── Load customers from DB ────────────────────────────────────────────────────
with open('/tmp/customers.json') as f:
    customers = json.load(f)
print(f"DB customers: {len(customers)}")

# ── Helper functions ──────────────────────────────────────────────────────────
def normalise_phone(raw):
    if not raw:
        return ''
    s = re.sub(r'[^0-9]', '', str(raw))
    if s.startswith('61') and len(s) == 11:
        s = '0' + s[2:]
    return s

def normalise_sim(raw):
    if not raw:
        return ''
    return re.sub(r'[^0-9]', '', str(raw)).strip()

def normalise_name(name):
    """Lowercase, strip punctuation, normalise spaces"""
    if not name:
        return ''
    n = name.lower().strip()
    n = re.sub(r'[^a-z0-9\s]', ' ', n)
    n = re.sub(r'\s+', ' ', n).strip()
    return n

def name_similarity(a, b):
    """Token-based similarity: what fraction of tokens in A appear in B"""
    na = normalise_name(a)
    nb = normalise_name(b)
    if not na or not nb:
        return 0.0
    # Exact match
    if na == nb:
        return 1.0
    # Sequence ratio
    ratio = SequenceMatcher(None, na, nb).ratio()
    # Token overlap
    ta = set(na.split())
    tb = set(nb.split())
    if ta and tb:
        overlap = len(ta & tb) / max(len(ta), len(tb))
    else:
        overlap = 0.0
    return max(ratio, overlap)

def find_best_customer(sm_name, customers, threshold=0.70):
    """Find best matching customer. Returns (customer, score) or (None, 0)"""
    if not sm_name or sm_name.strip() in ('', '??', 'with KIM'):
        return None, 0.0
    
    best = None
    best_score = 0.0
    
    for c in customers:
        score = name_similarity(sm_name, c['name'])
        if score > best_score:
            best_score = score
            best = c
    
    if best_score >= threshold:
        return best, best_score
    return None, best_score

# ── Build lookup maps from existing SM-imported services ─────────────────────
# We need to know which services are in the DB (by phone/SIM) to update them
# Load via subprocess
result = subprocess.run(
    ['npx', 'tsx', '-e', '''
import * as mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
dotenv.config();
async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);
  const [rows] = await conn.execute(`
    SELECT externalId, phoneNumber, simSerialNumber, customerExternalId, customerName,
           provider, status, dataSource, discoveryNotes, planName, serviceType
    FROM services
    WHERE dataSource = 'SM Import (Ella)' OR status = 'unmatched'
  `) as any[];
  fs.writeFileSync('/tmp/sm_services.json', JSON.stringify(rows));
  console.log('Exported ' + (rows as any[]).length + ' services');
  await conn.end();
}
main().catch(console.error);
'''],
    cwd='/home/ubuntu/billing-tool',
    capture_output=True, text=True
)
print(result.stdout.strip())
if result.returncode != 0:
    print("STDERR:", result.stderr[:500])

with open('/tmp/sm_services.json') as f:
    sm_services = json.load(f)

print(f"SM services in DB: {len(sm_services)}")

# Build lookup maps
by_sim = {}
by_phone = {}
for svc in sm_services:
    if svc.get('simSerialNumber'):
        key = normalise_sim(svc['simSerialNumber'])
        if key:
            by_sim[key] = svc
    if svc.get('phoneNumber'):
        key = normalise_phone(svc['phoneNumber'])
        if key and len(key) >= 8:
            by_phone[key] = svc

print(f"SIM lookup: {len(by_sim)}, Phone lookup: {len(by_phone)}")

# ── Process each SM row ───────────────────────────────────────────────────────
PROVIDER_MAP = {
    'ABB': 'ABB', 'TIAB': 'TIAB',
    'Vocus (Optus)': 'Vocus', 'Vocus': 'Vocus', 'Optus': 'Vocus',
    'Telstra': 'Telstra',
}

updates = []  # list of dicts with update instructions

stats = {
    'total': 0,
    'matched_service': 0,
    'customer_assigned': 0,
    'customer_not_found': 0,
    'no_service_match': 0,
    'notes_added': 0,
}

match_log = []

for row in data_rows:
    stats['total'] += 1
    
    sm_customer = str(row[0]).strip() if row[0] else ''
    sm_service = str(row[1]).strip() if row[1] else ''
    sm_provider_raw = str(row[2]).strip() if row[2] else ''
    sm_sim = normalise_sim(row[3])
    sm_phone = normalise_phone(row[4])
    sm_activation = str(row[5]).strip() if row[5] else ''
    sm_port_cid = str(row[6]).strip() if row[6] else ''
    sm_notes = str(row[7]).strip() if row[7] else ''
    sm_provider = PROVIDER_MAP.get(sm_provider_raw, sm_provider_raw)
    
    # Build notes string from extra fields
    notes_parts = []
    if sm_port_cid and sm_port_cid not in ('None', ''):
        notes_parts.append(f"Port Out CID: {sm_port_cid}")
    if sm_notes and sm_notes not in ('None', ''):
        notes_parts.append(f"Note: {sm_notes}")
    if sm_customer and sm_customer not in ('', '??', 'None'):
        notes_parts.append(f"SM Customer: {sm_customer}")
    sm_extra_notes = ' | '.join(notes_parts)
    
    # Find matching service in DB
    svc = None
    match_method = 'none'
    if sm_sim and len(sm_sim) >= 10:
        svc = by_sim.get(sm_sim)
        if svc:
            match_method = 'SIM'
    if not svc and sm_phone and len(sm_phone) >= 8:
        svc = by_phone.get(sm_phone)
        if svc:
            match_method = 'phone'
    
    if not svc:
        stats['no_service_match'] += 1
        match_log.append({
            'sm_customer': sm_customer,
            'sm_phone': sm_phone,
            'sm_sim': sm_sim,
            'action': 'NO_SERVICE_MATCH',
            'reason': 'No existing service found by SIM or phone',
        })
        continue
    
    stats['matched_service'] += 1
    
    # Find best customer match
    db_customer = None
    db_score = 0.0
    if sm_customer and sm_customer not in ('', '??', 'None', 'with KIM'):
        db_customer, db_score = find_best_customer(sm_customer, customers)
    
    # Build update
    update = {
        'externalId': svc['externalId'],
        'provider': sm_provider,
        'supplierName': sm_provider,
        'dataSource': 'SM Import (Ella)',
    }
    
    # Set activation date if not already set
    if sm_activation and sm_activation not in ('None', ''):
        update['serviceActivationDate'] = sm_activation
    
    # Set plan name from SM if not already meaningful
    if sm_service:
        update['planName'] = sm_service
        # Determine serviceType
        sl = sm_service.lower()
        if 'mobile' in sl or 'voice' in sl:
            update['serviceType'] = 'Mobile'
        elif 'data' in sl or 'broadband' in sl or 'backup' in sl or '4g' in sl:
            update['serviceType'] = 'Data'
    
    # Build discovery notes
    existing_notes = svc.get('discoveryNotes') or ''
    # Remove old SM Import note to avoid duplication
    existing_notes = re.sub(r'\[SM Import\][^\n]*\n?', '', existing_notes).strip()
    
    new_note_parts = []
    if sm_extra_notes:
        new_note_parts.append(f"[SM Import (Ella)] {sm_extra_notes}")
    if db_customer and db_score >= 0.70:
        new_note_parts.append(f"[Auto-matched] Customer: {db_customer['name']} (score: {db_score:.0%})")
    elif sm_customer and sm_customer not in ('', '??', 'None', 'with KIM'):
        new_note_parts.append(f"[Unmatched] SM customer name: {sm_customer} (best match score: {db_score:.0%})")
    
    if new_note_parts:
        stats['notes_added'] += 1
        combined = '\n'.join(filter(None, [existing_notes] + new_note_parts))
        update['discoveryNotes'] = combined
    
    # Assign customer if confident match found
    if db_customer and db_score >= 0.70:
        update['customerExternalId'] = db_customer['externalId']
        update['customerName'] = db_customer['name']
        update['status'] = 'active'
        stats['customer_assigned'] += 1
        match_log.append({
            'sm_customer': sm_customer,
            'db_customer': db_customer['name'],
            'score': f"{db_score:.0%}",
            'externalId': svc['externalId'],
            'action': 'ASSIGNED',
            'match_method': match_method,
        })
    else:
        # Leave unmatched but update notes
        stats['customer_not_found'] += 1
        match_log.append({
            'sm_customer': sm_customer or '(blank)',
            'db_customer': db_customer['name'] if db_customer else 'N/A',
            'score': f"{db_score:.0%}",
            'externalId': svc['externalId'],
            'action': 'UNMATCHED',
            'match_method': match_method,
        })
    
    updates.append(update)

# ── Write updates to JSON for TypeScript to apply ─────────────────────────────
with open('/tmp/sm_updates.json', 'w') as f:
    json.dump(updates, f)

print(f"\n=== MATCH STATS ===")
for k, v in stats.items():
    print(f"  {k}: {v}")

print(f"\n=== ASSIGNED (first 30) ===")
assigned = [m for m in match_log if m['action'] == 'ASSIGNED']
print(f"Total assigned: {len(assigned)}")
for m in assigned[:30]:
    print(f"  [{m['match_method']}] {m['sm_customer']!r:35s} → {m['db_customer']!r} ({m['score']})")

print(f"\n=== UNMATCHED CUSTOMER NAMES (first 30) ===")
unmatched = [m for m in match_log if m['action'] == 'UNMATCHED']
print(f"Total unmatched: {len(unmatched)}")
for m in unmatched[:30]:
    print(f"  [{m['match_method']}] SM={m['sm_customer']!r:35s} | best_db={m['db_customer']!r} ({m['score']})")

print(f"\n=== NO SERVICE MATCH ===")
no_svc = [m for m in match_log if m['action'] == 'NO_SERVICE_MATCH']
print(f"Total: {len(no_svc)}")
for m in no_svc[:10]:
    print(f"  SM={m['sm_customer']!r} | phone={m['sm_phone']} | sim={m['sm_sim']}")

print(f"\nUpdates to apply: {len(updates)}")
print("Updates saved to /tmp/sm_updates.json")
