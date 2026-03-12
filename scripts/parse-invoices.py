#!/usr/bin/env python3
"""Parse Channel Haus, Legion, and Tech-e invoices into structured JSON."""
import re, json

# ── Channel Haus ─────────────────────────────────────────────────────────────
with open('/tmp/channelhaus.txt', 'r') as f:
    ch_text = f.read()

ch_services = []

# Business Internet line
internet_match = re.search(r'Business Internet\s+\$([0-9,]+\.[0-9]+)', ch_text)
if internet_match:
    ch_services.append({
        "serviceId": "channelhaus_internet",
        "friendlyName": "Business Internet",
        "serviceType": "Internet",
        "amount": float(internet_match.group(1).replace(',', '')),
        "provider": "Channel Haus",
    })

# All bsip_ and pbx_ and named voice services
svc_pattern = re.compile(
    r'Service:\s+(\S+)\s+Friendly Name:\s+(.+?)\s+\$([0-9,]+\.[0-9]+)'
)
for m in svc_pattern.finditer(ch_text):
    svc_id, friendly, amount = m.group(1), m.group(2).strip(), m.group(3)
    # Clean up friendly name
    friendly = re.sub(r'^(bsip_|pbx_)', '', friendly).strip()
    ch_services.append({
        "serviceId": m.group(1),
        "friendlyName": friendly,
        "serviceType": "Voice",
        "amount": float(amount.replace(',', '')),
        "provider": "Channel Haus",
    })

# Also capture logan_medical and spmc_cornubia which matched the pattern above
print(f"Channel Haus: {len(ch_services)} services")
total_ch = sum(s['amount'] for s in ch_services)
print(f"  Total: ${total_ch:.2f} (invoice says $7,211.98 inc GST → ex GST ~$6,556.35)")

# ── Legion ───────────────────────────────────────────────────────────────────
with open('/tmp/legion.txt', 'r') as f:
    leg_text = f.read()

# Extract customer reference and amount
leg_ref = re.search(r'Reference\s*\n\s*([^\n]+)', leg_text)
leg_amount = re.search(r'LEGION Fibre Business Service Plan Access Fee\s+1\.00\s+([0-9,]+\.[0-9]+)', leg_text)
leg_customer_ref = re.search(r'4649352 - (.+)', leg_text)

legion_service = {
    "serviceId": "legion_4649352",
    "friendlyName": "Osprey Apartments - LEGION Fibre Business",
    "serviceType": "Internet",
    "amount": float(leg_amount.group(1).replace(',', '')) if leg_amount else 799.00,
    "provider": "Legion",
    "customerHint": "Osprey Apartments",
    "invoiceRef": "INV-4112",
}
print(f"\nLegion: 1 service")
print(f"  {legion_service['friendlyName']}: ${legion_service['amount']:.2f} ex GST")

# ── Tech-e ───────────────────────────────────────────────────────────────────
with open('/tmp/teche.txt', 'r') as f:
    te_text = f.read()

te_amount = re.search(r'\(1003\) Internet Connection 250Mbps.*?1\.00\s+([0-9,]+\.[0-9]+)', te_text, re.DOTALL)
te_location = re.search(r'5 Mill St \((.+?)\)', te_text)

teche_service = {
    "serviceId": "teche_1003_5millst",
    "friendlyName": "Internet 250Mbps/250Mbps - 5 Mill St Toowoomba",
    "serviceType": "Internet",
    "amount": float(te_amount.group(1).replace(',', '')) if te_amount else 250.00,
    "provider": "Tech-e",
    "customerHint": "GBA Toowoomba",
    "invoiceRef": "INV-23179",
}
print(f"\nTech-e: 1 service")
print(f"  {teche_service['friendlyName']}: ${teche_service['amount']:.2f} ex GST")

# ── Summary ──────────────────────────────────────────────────────────────────
all_services = ch_services + [legion_service, teche_service]
print(f"\n=== TOTAL: {len(all_services)} services across 3 invoices ===")

# Save to JSON for the import script
with open('/tmp/invoice-services.json', 'w') as f:
    json.dump(all_services, f, indent=2)
print("Saved to /tmp/invoice-services.json")

# Print Channel Haus services for review
print("\n=== Channel Haus Services ===")
for s in ch_services:
    print(f"  {s['serviceId']:35s} | {s['friendlyName']:45s} | ${s['amount']:8.2f}")
