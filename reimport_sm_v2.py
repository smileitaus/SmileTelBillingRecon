"""
SM.xlsx Full Re-import v2 — Chain-aware customer name matching
==============================================================
Improvements over v1:
- For chain brands (Zambrero, Nodo, The Yiros Shop, Little Cha), the LOCATION word
  must appear in the DB customer name — prevents "Zambrero Marrickville → Zambrero Yarraville"
- Correct borderline handling:
  - "Nodo Elizabeth St" → skip (Zambrero Elizabeth St is a different brand)
  - "Zambrero Echuca/Townsville/Morley/Willetton/Waterloo/Marrickville/Parkville/Belmont/Franskton/Inglewood"
    → these are new customers not in DB, leave unmatched with SM name in notes
  - "Zambrero Beldon 4G" → Zambrero Beldon (correct, same location)
  - "Zambrero Casey Central" → Zambrero Casey Central (AAKVH Pty Ltd) (correct)
  - "Zambrero Cranbourne North" → RSSGM Pty Ltd for Zambrero Cranbourne North (correct)
  - "Zambrero Darwin" → Zambrero - Darwin CBD (correct)
  - "Zambrero Everton Park" → Zambrero Everton Park Pty Ltd (correct)
  - "Zambrero Mooloolaba" → Zambrero Mooloolaba Pty Ltd (correct)
  - "Zambrero Torquay Loan" → skip (different from Zambrero Torquay)
  - "Zambrero Albion Replacement" → Zambrero Albion (correct, same location)
  - "Strata Dynamics" → Strata Dynamics Pty Ltd (correct)
  - "KHM Group Investments – Kebab HQ" → KHM Group Investments (correct)
  - "DJ Steel Monto" → skip (DJ Steel is different location)
  - "Poppy G's 2nd sim" → Poppy G's Midland (same customer, 2nd SIM)
  - "Little Cha Eastgardens" → skip (Little Cha St Ives is different location)
  - "The Yiros Shop Molendinar" → skip (different location)
  - "The Yiros Shop Southbank" → skip (different from Southport)
"""

import openpyxl, re, json, subprocess
from difflib import SequenceMatcher

# ── Chain brands that require location-word matching ─────────────────────────
CHAIN_BRANDS = ['zambrero', 'nodo', 'the yiros shop', 'yiros shop', 'little cha']

# ── Manual overrides for known correct matches ────────────────────────────────
# SM name → DB externalId (verified correct matches)
MANUAL_MATCHES = {
    "Zambrero Beldon 4G": "C0306",          # Zambrero Beldon
    "Zambrero Casey Central": "C0319",       # Zambrero Casey Central (AAKVH Pty Ltd)
    "Zambrero Cranbourne North": "C0205",    # RSSGM Pty Ltd for Zambrero Cranbourne North
    "Zambrero Darwin": "C2756",              # Zambrero - Darwin CBD
    "Zambrero Everton Park": "C0337",        # Zambrero Everton Park Pty Ltd
    "Zambrero Mooloolaba": "C0363",          # Zambrero Mooloolaba Pty Ltd
    "Zambrero Albion Replacement": "C0296",  # Zambrero Albion
    "Strata Dynamics": "C0231",             # Strata Dynamics Pty Ltd
    "KHM Group Investments – Kebab HQ": "C0133",  # KHM Group Investments
    "Poppy G's 2nd sim": "C0186",           # Poppy G's Midland
    "Zambrero Malvern 2": "C2805",          # Zambrero - Malvern (2nd SIM)
    "Zambrero Marrickville": None,           # NOT in DB yet — leave unmatched
    "Zambrero Parkville": None,             # NOT in DB yet
    "Zambrero Belmont": None,               # NOT in DB yet (different from Beldon)
    "Zambrero Echuca": None,                # NOT in DB yet
    "Zambrero Townsville": None,            # NOT in DB yet
    "Zambrero Morley": None,                # NOT in DB yet
    "Zambrero Willetton": None,             # NOT in DB yet
    "Zambrero Waterloo": None,              # NOT in DB yet
    "Zambrero Franskton": None,             # NOT in DB yet (Frankston?)
    "Zambrero Inglewood": None,             # NOT in DB yet (different from Innaloo)
    "Zambrero Torquay Loan": None,          # Different from Zambrero Torquay
    "Nodo Elizabeth St": None,              # Different brand from Zambrero Elizabeth St
    "DJ Steel Monto": None,                 # Different location from DJ Steel
    "Little Cha Eastgardens": None,         # Different location from Little Cha St Ives
    "The Yiros Shop Molendinar": None,      # Different location
    "The Yiros Shop Southbank": None,       # Different from Southport
}

# ── Load data ─────────────────────────────────────────────────────────────────
wb = openpyxl.load_workbook('/home/ubuntu/billing-tool/SM.xlsx', data_only=True)
ws = wb['Sheet1']
rows = list(ws.iter_rows(values_only=True))
data_rows = [r for r in rows[1:] if any(c is not None and str(c).strip() not in ('', 'None') for c in r)]

with open('/tmp/customers.json') as f:
    customers = json.load(f)
cust_by_id = {c['externalId']: c for c in customers}

with open('/tmp/sm_services.json') as f:
    sm_services = json.load(f)

# ── Helpers ───────────────────────────────────────────────────────────────────
def normalise_phone(raw):
    if not raw: return ''
    s = re.sub(r'[^0-9]', '', str(raw))
    if s.startswith('61') and len(s) == 11: s = '0' + s[2:]
    return s

def normalise_sim(raw):
    if not raw: return ''
    return re.sub(r'[^0-9]', '', str(raw)).strip()

def normalise_name(name):
    if not name: return ''
    n = name.lower().strip()
    n = re.sub(r'[^a-z0-9\s]', ' ', n)
    return re.sub(r'\s+', ' ', n).strip()

def get_chain_brand(name):
    nn = normalise_name(name)
    for brand in CHAIN_BRANDS:
        if nn.startswith(brand) or brand in nn:
            return brand
    return None

def get_location_word(name, brand):
    """Extract location word(s) after the brand prefix"""
    nn = normalise_name(name)
    # Remove brand prefix
    loc = nn.replace(brand, '').strip()
    # Remove common suffixes
    loc = re.sub(r'\b(pty|ltd|replacement|4g|2nd|sim|loan)\b', '', loc).strip()
    return loc

def name_similarity(a, b):
    na, nb = normalise_name(a), normalise_name(b)
    if not na or not nb: return 0.0
    if na == nb: return 1.0
    ratio = SequenceMatcher(None, na, nb).ratio()
    ta, tb = set(na.split()), set(nb.split())
    overlap = len(ta & tb) / max(len(ta), len(tb)) if ta and tb else 0.0
    return max(ratio, overlap)

def find_best_customer(sm_name, customers, threshold=0.95):
    """
    Chain-aware matching:
    - For chain brands, location word must appear in DB name
    - For non-chain, use standard fuzzy match with threshold
    """
    if not sm_name or sm_name.strip() in ('', '??', 'None', 'with KIM'):
        return None, 0.0
    
    # Check manual overrides first
    if sm_name in MANUAL_MATCHES:
        override_id = MANUAL_MATCHES[sm_name]
        if override_id is None:
            return None, 0.0  # Explicitly not in DB
        if override_id in cust_by_id:
            return cust_by_id[override_id], 1.0
    
    brand = get_chain_brand(sm_name)
    
    best, best_score = None, 0.0
    for c in customers:
        score = name_similarity(sm_name, c['name'])
        
        # For chain brands: require location word to appear in DB name
        if brand and score >= 0.70:
            loc = get_location_word(sm_name, brand)
            db_normalised = normalise_name(c['name'])
            if loc and loc not in db_normalised:
                # Location doesn't match — skip this candidate
                score = 0.0
        
        if score > best_score:
            best_score = score
            best = c
    
    return (best, best_score) if best_score >= threshold else (None, best_score)

# ── Build service lookup maps ─────────────────────────────────────────────────
by_sim = {}
by_phone = {}
for svc in sm_services:
    if svc.get('simSerialNumber'):
        key = normalise_sim(svc['simSerialNumber'])
        if key: by_sim[key] = svc
    if svc.get('phoneNumber'):
        key = normalise_phone(svc['phoneNumber'])
        if key and len(key) >= 8: by_phone[key] = svc

PROVIDER_MAP = {
    'ABB': 'ABB', 'TIAB': 'TIAB',
    'Vocus (Optus)': 'Vocus', 'Vocus': 'Vocus', 'Optus': 'Vocus',
    'Telstra': 'Telstra',
}

# ── Process rows ──────────────────────────────────────────────────────────────
updates = []
stats = {'total': 0, 'matched_service': 0, 'customer_assigned': 0, 
         'customer_not_found': 0, 'no_service_match': 0, 'notes_added': 0}
match_log = []

for row in data_rows:
    stats['total'] += 1
    
    sm_customer = str(row[0]).strip() if row[0] else ''
    sm_service  = str(row[1]).strip() if row[1] else ''
    sm_prov_raw = str(row[2]).strip() if row[2] else ''
    sm_sim      = normalise_sim(row[3])
    sm_phone    = normalise_phone(row[4])
    sm_activation = str(row[5]).strip() if row[5] else ''
    sm_port_cid = str(row[6]).strip() if row[6] else ''
    sm_notes    = str(row[7]).strip() if row[7] else ''
    sm_provider = PROVIDER_MAP.get(sm_prov_raw, sm_prov_raw)
    
    # Build notes from extra fields
    notes_parts = []
    if sm_port_cid and sm_port_cid not in ('None', ''):
        notes_parts.append(f"Port Out CID: {sm_port_cid}")
    if sm_notes and sm_notes not in ('None', ''):
        notes_parts.append(f"Note: {sm_notes}")
    if sm_customer and sm_customer not in ('', '??', 'None'):
        notes_parts.append(f"SM Customer: {sm_customer}")
    sm_extra_notes = ' | '.join(notes_parts)
    
    # Find service in DB
    svc = None
    match_method = 'none'
    if sm_sim and len(sm_sim) >= 10:
        svc = by_sim.get(sm_sim)
        if svc: match_method = 'SIM'
    if not svc and sm_phone and len(sm_phone) >= 8:
        svc = by_phone.get(sm_phone)
        if svc: match_method = 'phone'
    
    if not svc:
        stats['no_service_match'] += 1
        continue
    
    stats['matched_service'] += 1
    
    # Find customer
    db_customer, db_score = find_best_customer(sm_customer, customers, threshold=0.95)
    
    # Build update
    update = {
        'externalId': svc['externalId'],
        'provider': sm_provider,
        'supplierName': sm_provider,
        'dataSource': 'SM Import (Ella)',
    }
    if sm_activation and sm_activation not in ('None', ''):
        update['serviceActivationDate'] = sm_activation
    if sm_service:
        update['planName'] = sm_service
        sl = sm_service.lower()
        if 'mobile' in sl or 'voice' in sl:
            update['serviceType'] = 'Mobile'
        elif 'data' in sl or 'broadband' in sl or 'backup' in sl or '4g' in sl:
            update['serviceType'] = 'Data'
    
    # Build discovery notes (clean up old SM notes first)
    existing_notes = svc.get('discoveryNotes') or ''
    existing_notes = re.sub(r'\[SM Import[^\]]*\][^\n]*\n?', '', existing_notes).strip()
    existing_notes = re.sub(r'\[Auto-matched\][^\n]*\n?', '', existing_notes).strip()
    existing_notes = re.sub(r'\[Unmatched\][^\n]*\n?', '', existing_notes).strip()
    
    new_note_parts = []
    if sm_extra_notes:
        new_note_parts.append(f"[SM Import (Ella)] {sm_extra_notes}")
    if db_customer:
        new_note_parts.append(f"[Auto-matched] Customer: {db_customer['name']} (confidence: {db_score:.0%})")
    elif sm_customer and sm_customer not in ('', '??', 'None', 'with KIM'):
        new_note_parts.append(f"[Pending] SM customer name: \"{sm_customer}\" — not yet in DB, needs manual assignment")
    
    if new_note_parts:
        stats['notes_added'] += 1
        combined = '\n'.join(filter(None, [existing_notes] + new_note_parts))
        update['discoveryNotes'] = combined
    
    # Assign customer
    if db_customer:
        update['customerExternalId'] = db_customer['externalId']
        update['customerName'] = db_customer['name']
        update['status'] = 'active'
        stats['customer_assigned'] += 1
        match_log.append({'action': 'ASSIGNED', 'sm': sm_customer, 'db': db_customer['name'],
                          'score': f"{db_score:.0%}", 'id': svc['externalId'], 'method': match_method})
    else:
        stats['customer_not_found'] += 1
        match_log.append({'action': 'UNMATCHED', 'sm': sm_customer or '(blank)',
                          'score': f"{db_score:.0%}", 'id': svc['externalId'], 'method': match_method})
    
    updates.append(update)

# ── Save updates ──────────────────────────────────────────────────────────────
with open('/tmp/sm_updates_v2.json', 'w') as f:
    json.dump(updates, f)

# ── Report ────────────────────────────────────────────────────────────────────
print(f"\n=== MATCH STATS ===")
for k, v in stats.items():
    print(f"  {k}: {v}")

assigned = [m for m in match_log if m['action'] == 'ASSIGNED']
print(f"\n=== ASSIGNED ({len(assigned)}) ===")
for m in assigned:
    print(f"  [{m['method']}] {m['sm']!r:45s} → {m['db']!r} ({m['score']})")

unmatched_named = [m for m in match_log if m['action'] == 'UNMATCHED' and m['sm'] != '(blank)']
print(f"\n=== UNMATCHED WITH NAME ({len(unmatched_named)}) — need manual assignment ===")
for m in unmatched_named:
    print(f"  [{m['method']}] SM={m['sm']!r}")

print(f"\nUpdates saved to /tmp/sm_updates_v2.json ({len(updates)} records)")
