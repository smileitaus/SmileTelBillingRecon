import openpyxl
from collections import Counter

wb = openpyxl.load_workbook('/home/ubuntu/billing-tool/SM.xlsx', data_only=True)
ws = wb['Sheet1']
rows = list(ws.iter_rows(values_only=True))

headers = rows[0]
print(f"Headers ({len(headers)} cols): {list(headers)}")

data = [r for r in rows[1:] if any(c is not None and str(c).strip() not in ('', 'None') for c in r)]
print(f"Total data rows: {len(data)}")

# Analyse each column
print("\n=== COLUMN ANALYSIS ===")
for i, h in enumerate(headers):
    vals = [r[i] for r in data if r[i] is not None and str(r[i]).strip() not in ('', 'None')]
    print(f"\nCol {i} '{h}': {len(vals)} non-empty values")
    # Show unique sample
    unique = list(dict.fromkeys(str(v).strip() for v in vals))
    print(f"  Sample (first 10): {unique[:10]}")
    if i in (5, 6):  # F and G - numeric codes
        print(f"  All unique values: {sorted(set(str(v).strip() for v in vals))[:30]}")

# Show rows where col A (customer name) is populated
named = [r for r in data if r[0] and str(r[0]).strip() not in ('', 'None', '??')]
unnamed = [r for r in data if not r[0] or str(r[0]).strip() in ('', 'None', '??')]
print(f"\n=== CUSTOMER NAME COVERAGE ===")
print(f"Rows WITH customer name: {len(named)}")
print(f"Rows WITHOUT customer name (blank or ??): {len(unnamed)}")

# Show rows with notes in col H
noted = [r for r in data if r[7] and str(r[7]).strip() not in ('', 'None')]
print(f"\n=== NOTES (Col H) ===")
print(f"Rows with notes: {len(noted)}")
for r in noted:
    print(f"  Customer={str(r[0] or '').strip()[:30]} | Note={r[7]}")

# Show F and G column meaning
print(f"\n=== COLUMNS F AND G (codes) ===")
f_vals = [(r[0], r[5]) for r in data if r[5] is not None]
g_vals = [(r[0], r[6]) for r in data if r[6] is not None]
print(f"Col F populated: {len(f_vals)} rows, sample: {[(str(c)[:20], str(v)) for c,v in f_vals[:5]]}")
print(f"Col G populated: {len(g_vals)} rows, sample: {[(str(c)[:20], str(v)) for c,v in g_vals[:5]]}")

# Show all unique customer names
print(f"\n=== ALL UNIQUE CUSTOMER NAMES ===")
cust_names = sorted(set(str(r[0]).strip() for r in data if r[0] and str(r[0]).strip() not in ('', 'None', '??')))
print(f"Total unique: {len(cust_names)}")
for n in cust_names:
    print(f"  {n}")

# Show rows with blank customer name but have phone/sim
print(f"\n=== UNNAMED ROWS (blank customer, but have phone/SIM) ===")
for r in unnamed[:20]:
    print(f"  service={str(r[1] or '').strip()[:30]} | provider={r[2]} | SIM={r[3]} | MSN={r[4]} | F={r[5]} | G={r[6]}")
