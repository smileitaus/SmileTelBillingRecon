"""
Analyse the SasBoss Dispatch Charges (March) workbook.
Prints structure, column names, sample rows and summaries for both tabs.
"""
import pandas as pd
import json

XLSX = "/home/ubuntu/billing-tool/scripts/sasboss-march.xlsx"

xl = pd.ExcelFile(XLSX)
print("=== SHEET NAMES ===")
print(xl.sheet_names)
print()

for sheet in xl.sheet_names:
    print(f"\n{'='*60}")
    print(f"SHEET: {sheet}")
    print(f"{'='*60}")
    df = pd.read_excel(XLSX, sheet_name=sheet, header=None)
    print(f"Shape (raw, no header): {df.shape}")
    print("\n--- First 10 rows (raw) ---")
    print(df.head(10).to_string())
    print()

# Now try to read Pivot tab with proper header detection
print("\n\n=== PIVOT TAB - DETAILED ANALYSIS ===")
# Try different header rows
for hdr in [0, 1, 2, 3, 4, 5]:
    df = pd.read_excel(XLSX, sheet_name=xl.sheet_names[-1], header=hdr)
    cols = [str(c) for c in df.columns.tolist()]
    # Look for Enterprise or Product columns
    if any('enterprise' in c.lower() or 'product' in c.lower() or 'name' in c.lower() for c in cols):
        print(f"Header row {hdr} looks good!")
        print(f"Columns: {cols}")
        print(f"\nShape: {df.shape}")
        print(f"\nFirst 5 data rows:")
        print(df.head(5).to_string())
        print(f"\nLast 5 data rows:")
        print(df.tail(5).to_string())
        
        # Show unique values in key columns
        for col in df.columns:
            if 'enterprise' in str(col).lower() or 'product' in str(col).lower() or 'type' in str(col).lower():
                unique_vals = df[col].dropna().unique()
                print(f"\nUnique values in '{col}' ({len(unique_vals)} total):")
                print(unique_vals[:50])
        break

print("\n\n=== CALL USAGE TAB - DETAILED ANALYSIS ===")
# Try to read the first sheet (Call Usage)
for hdr in [0, 1, 2, 3, 4, 5]:
    df = pd.read_excel(XLSX, sheet_name=xl.sheet_names[0], header=hdr)
    cols = [str(c) for c in df.columns.tolist()]
    if any(c not in ['Unnamed: 0', 'Unnamed: 1'] for c in cols[:5]):
        print(f"Header row {hdr} looks good!")
        print(f"Columns: {cols}")
        print(f"\nShape: {df.shape}")
        print(f"\nFirst 10 data rows:")
        print(df.head(10).to_string())
        break
