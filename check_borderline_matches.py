import openpyxl, re, json
from difflib import SequenceMatcher

wb = openpyxl.load_workbook('/home/ubuntu/billing-tool/SM.xlsx', data_only=True)
ws = wb['Sheet1']
rows = list(ws.iter_rows(values_only=True))
data_rows = [r for r in rows[1:] if any(c is not None and str(c).strip() not in ('', 'None') for c in r)]

with open('/tmp/customers.json') as f:
    customers = json.load(f)

def normalise_name(name):
    if not name: return ''
    n = name.lower().strip()
    n = re.sub(r'[^a-z0-9\s]', ' ', n)
    n = re.sub(r'\s+', ' ', n).strip()
    return n

def name_similarity(a, b):
    na, nb = normalise_name(a), normalise_name(b)
    if not na or not nb: return 0.0
    if na == nb: return 1.0
    ratio = SequenceMatcher(None, na, nb).ratio()
    ta, tb = set(na.split()), set(nb.split())
    overlap = len(ta & tb) / max(len(ta), len(tb)) if ta and tb else 0.0
    return max(ratio, overlap)

def find_best_customer(sm_name, customers):
    if not sm_name or sm_name.strip() in ('', '??', 'with KIM'): return None, 0.0
    best, best_score = None, 0.0
    for c in customers:
        score = name_similarity(sm_name, c['name'])
        if score > best_score:
            best_score = score
            best = c
    return best, best_score

print('=== BORDERLINE MATCHES (70% <= score < 95%) ===')
borderline = []
for row in data_rows:
    sm_customer = str(row[0]).strip() if row[0] else ''
    if not sm_customer or sm_customer in ('', '??', 'None', 'with KIM'):
        continue
    db_customer, score = find_best_customer(sm_customer, customers)
    if db_customer and 0.70 <= score < 0.95:
        borderline.append((score, sm_customer, db_customer['name'], db_customer['externalId']))

borderline.sort(key=lambda x: x[0])
for score, sm, db, eid in borderline:
    print(f'  {score:.0%}  SM={sm!r:45s} → DB={db!r} [{eid}]')

print(f'\nTotal borderline: {len(borderline)}')

print('\n=== MATCHES THAT LOOK WRONG (flag for review) ===')
# Flag cases where the DB name is clearly different
for score, sm, db, eid in borderline:
    sm_words = set(normalise_name(sm).split())
    db_words = set(normalise_name(db).split())
    # If they share the main location word but differ on key word
    common = sm_words & db_words
    if 'zambrero' in sm_words and 'zambrero' in db_words:
        sm_loc = sm_words - {'zambrero'}
        db_loc = db_words - {'zambrero', 'pty', 'ltd', 'for', 'rssgm'}
        if not sm_loc & db_loc:
            print(f'  MISMATCH {score:.0%}: SM={sm!r} → DB={db!r}')
