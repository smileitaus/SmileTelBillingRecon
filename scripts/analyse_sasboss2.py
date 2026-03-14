"""
Deep analysis of the SasBoss Dispatch Charges (March) workbook.
"""
import pandas as pd
import json

XLSX = "/home/ubuntu/billing-tool/scripts/sasboss-march.xlsx"

xl = pd.ExcelFile(XLSX)
print("=== SHEET NAMES ===")
print(xl.sheet_names)

# Read all sheets
for sheet_name in xl.sheet_names:
    print(f"\n\n{'='*70}")
    print(f"SHEET: '{sheet_name}'")
    print(f"{'='*70}")
    
    # Try to find header row
    raw = pd.read_excel(XLSX, sheet_name=sheet_name, header=None, nrows=10)
    print("First 10 rows raw:")
    print(raw.to_string())

print("\n\n=== MAIN SHEET DEEP ANALYSIS ===")
# Read with detected header
df = pd.read_excel(XLSX, sheet_name=xl.sheet_names[0], header=0)
print(f"Total rows: {len(df)}")
print(f"Columns: {df.columns.tolist()}")

# Product Type breakdown
print("\n--- Product Type values ---")
pt = df['Product Type'].value_counts(dropna=False)
print(pt)

# Product Name breakdown  
print("\n--- Product Name unique values (non-call-usage) ---")
# Filter out call usage rows (those with NaN product name)
billable = df[df['Product Name'].notna()]
print(f"Billable rows (with Product Name): {len(billable)}")
print(f"Call usage rows (no Product Name): {len(df) - len(billable)}")

print("\nProduct Name unique values:")
pn = billable['Product Name'].value_counts()
print(pn.to_string())

# Enterprise breakdown
print("\n--- Enterprise Name unique values ---")
ent = df['Enterprise Name'].value_counts()
print(f"Total unique enterprises: {len(ent)}")
print(ent.to_string())

# Cost summary per enterprise (billable only)
print("\n--- Cost summary per Enterprise (billable, ex GST) ---")
cost_summary = billable.groupby('Enterprise Name')['Total (EX-GST)'].sum().sort_values(ascending=False)
print(cost_summary.to_string())

# Call usage summary per enterprise
call_usage = df[df['Product Name'].isna()]
print("\n--- Call Usage summary per Enterprise (ex GST) ---")
cu_summary = call_usage.groupby('Enterprise Name')['Total (EX-GST)'].sum().sort_values(ascending=False)
print(cu_summary.to_string())

# Overall totals
print(f"\n--- TOTALS ---")
print(f"Total ex-GST (all rows): ${df['Total (EX-GST)'].sum():.2f}")
print(f"Total ex-GST (billable only): ${billable['Total (EX-GST)'].sum():.2f}")
print(f"Total ex-GST (call usage only): ${call_usage['Total (EX-GST)'].sum():.2f}")

# Sample billable rows
print("\n--- Sample billable rows ---")
print(billable[['Enterprise Name', 'Product Name', 'Product Type', 'Service Ref Id', 'DID Number', 'Total (EX-GST)']].head(20).to_string())

# Check for DID numbers (phone numbers)
print("\n--- DID Number samples ---")
did_rows = df[df['DID Number'].notna()]
print(f"Rows with DID Number: {len(did_rows)}")
print(did_rows[['Enterprise Name', 'Product Name', 'DID Number', 'Total (EX-GST)']].head(20).to_string())
