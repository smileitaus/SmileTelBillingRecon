"""
Analyse BOTH tabs of the SasBoss Dispatch Charges (March) workbook.
Sheet1 = Call Usage (February usage charges)
Pivot  = Billable line items (recurring services)
"""
import pandas as pd

XLSX = "/home/ubuntu/billing-tool/scripts/sasboss-march.xlsx"

xl = pd.ExcelFile(XLSX)
print("=== SHEET NAMES ===")
print(xl.sheet_names)

# ── PIVOT TAB ──────────────────────────────────────────────────────────────────
print("\n\n" + "="*70)
print("PIVOT TAB")
print("="*70)

# Find header row
for hdr in range(0, 8):
    df = pd.read_excel(XLSX, sheet_name="Pivot", header=hdr)
    cols = [str(c) for c in df.columns.tolist()]
    if any('enterprise' in c.lower() or 'product' in c.lower() for c in cols):
        print(f"Header at row {hdr}")
        print(f"Columns: {cols}")
        print(f"Shape: {df.shape}")
        
        # Find the cost columns (last 3)
        print(f"\nLast 5 columns: {cols[-5:]}")
        
        # Sample data
        print("\nFirst 5 rows:")
        print(df.head(5).to_string())
        
        # Find enterprise name column
        ent_col = next((c for c in cols if 'enterprise' in c.lower()), None)
        prod_col = next((c for c in cols if 'product name' in c.lower()), None)
        type_col = next((c for c in cols if 'product type' in c.lower()), None)
        
        print(f"\nEnterprise col: {ent_col}")
        print(f"Product Name col: {prod_col}")
        print(f"Product Type col: {type_col}")
        
        if ent_col:
            print(f"\nUnique enterprises ({df[ent_col].dropna().nunique()}):")
            for e in sorted(df[ent_col].dropna().unique()):
                print(f"  {e}")
        
        if prod_col:
            print(f"\nUnique product names ({df[prod_col].dropna().nunique()}):")
            for p in sorted(df[prod_col].dropna().unique()):
                print(f"  {p}")
        
        if type_col:
            print(f"\nProduct types:")
            print(df[type_col].value_counts(dropna=False).to_string())
        
        # Cost columns - last 3
        cost_cols = cols[-3:]
        print(f"\nCost columns (last 3): {cost_cols}")
        for cc in cost_cols:
            try:
                total = pd.to_numeric(df[cc], errors='coerce').sum()
                print(f"  {cc}: total = ${total:.2f}")
            except:
                pass
        
        # Per-enterprise cost summary
        if ent_col and cost_cols:
            print(f"\nCost summary per enterprise (last cost col = {cost_cols[-1]}):")
            summary = df.groupby(ent_col)[cost_cols[-1]].apply(lambda x: pd.to_numeric(x, errors='coerce').sum()).sort_values(ascending=False)
            print(summary.to_string())
        
        break

# ── SHEET1 TAB ──────────────────────────────────────────────────────────────────
print("\n\n" + "="*70)
print("SHEET1 TAB (Call Usage)")
print("="*70)

for hdr in range(0, 8):
    df1 = pd.read_excel(XLSX, sheet_name="Sheet1", header=hdr)
    cols1 = [str(c) for c in df1.columns.tolist()]
    non_unnamed = [c for c in cols1 if 'unnamed' not in c.lower()]
    if len(non_unnamed) >= 3:
        print(f"Header at row {hdr}")
        print(f"Columns: {cols1}")
        print(f"Shape: {df1.shape}")
        print("\nFirst 10 rows:")
        print(df1.head(10).to_string())
        print("\nLast 5 rows:")
        print(df1.tail(5).to_string())
        
        # Find enterprise/customer column
        ent_col = next((c for c in cols1 if 'enterprise' in c.lower() or 'customer' in c.lower() or 'name' in c.lower()), None)
        print(f"\nEnterprise/Customer col: {ent_col}")
        if ent_col:
            print(f"Unique values ({df1[ent_col].dropna().nunique()}):")
            for e in sorted(df1[ent_col].dropna().unique())[:20]:
                print(f"  {e}")
        
        # Cost columns
        numeric_cols = [c for c in cols1 if pd.to_numeric(df1[c], errors='coerce').notna().sum() > df1.shape[0] * 0.3]
        print(f"\nNumeric-looking columns: {numeric_cols}")
        for nc in numeric_cols:
            total = pd.to_numeric(df1[nc], errors='coerce').sum()
            print(f"  {nc}: total = ${total:.2f}")
        break
