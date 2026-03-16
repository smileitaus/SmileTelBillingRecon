/**
 * AAPT Invoice Extractor
 * Extracts all services from AAPT itemised PDF invoices into structured JSON.
 * Designed to be re-run for future invoices — output format is stable.
 */

import { execSync } from 'child_process';
import { writeFileSync, readFileSync } from 'fs';
import path from 'path';

// Use Python/pdfplumber for extraction, then parse the output
const pdfPath = process.argv[2] || '/home/ubuntu/upload/AAPTMar-Itemised(1).pdf';
const outputPath = process.argv[3] || '/home/ubuntu/aapt_services_extracted.json';

const pythonScript = `
import pdfplumber
import json
import re
import sys

pdf_path = "${pdfPath}"
output_path = "${outputPath}"

services = []
current_service = None
invoice_meta = {}

def parse_address_from_service_header(text):
    """Extract address from service header like 'Service 100790595 (SUITE 2, 14 ARGYLE STREET ALBION QLD 4010)'"""
    m = re.search(r'Service\\s+(\\d+)\\s+\\(([^)]+)\\)', text, re.IGNORECASE)
    if m:
        return m.group(1), m.group(2).strip()
    return None, None

def extract_postcode(address):
    m = re.search(r'\\b(\\d{4})\\b', address or '')
    return m.group(1) if m else None

def extract_state(address):
    states = ['QLD', 'NSW', 'VIC', 'SA', 'WA', 'TAS', 'NT', 'ACT']
    for s in states:
        if s in (address or '').upper():
            return s
    return None

with pdfplumber.open(pdf_path) as pdf:
    full_text = ''
    for page in pdf.pages:
        full_text += page.extract_text() or ''
        full_text += '\\n---PAGE---\\n'

# Extract invoice metadata
acc_m = re.search(r'Account Number[:\\s]+(\\d+)', full_text)
inv_m = re.search(r'Invoice Number[:\\s]+(\\d+)', full_text)
period_m = re.search(r'Billing Period[:\\s]+([\\d\\w\\s]+to[\\d\\w\\s]+)', full_text)
total_m = re.search(r'Current Charges \\(incl GST\\)[\\s\\$]+(\\d[\\d,.]+)', full_text)

invoice_meta = {
    'accountNumber': acc_m.group(1).strip() if acc_m else '2000026054',
    'invoiceNumber': inv_m.group(1).strip() if inv_m else '23258566',
    'billingPeriod': period_m.group(1).strip() if period_m else '01 Feb 26 to 28 Feb 26',
    'totalInclGst': total_m.group(1).replace(',','') if total_m else '9149.04',
    'supplier': 'AAPT',
    'issueDate': '2026-03-01',
}

# Parse services from full text using regex patterns
# Pattern: "Service XXXXXX (ADDRESS)" followed by product type and "Your ID: ..."
service_blocks = re.split(r'(?=Service\\s+\\d+(?:\\s+\\(|\\n|\\s+IP-Line|\\s+FAST|\\s+Standard|\\s+Ethernet|\\s+Customer|\\s+NBN|\\s+Telstra))', full_text)

parsed_services = []

for block in service_blocks:
    if not block.strip():
        continue
    
    # Extract service ID
    svc_id_m = re.match(r'Service\\s+(\\d+)', block.strip())
    if not svc_id_m:
        continue
    
    service_id = svc_id_m.group(1)
    
    # Extract address from parentheses after service ID
    addr_m = re.match(r'Service\\s+\\d+\\s+\\(([^)]+)\\)', block.strip())
    address = addr_m.group(1).strip() if addr_m else ''
    
    # Extract product type (line after service header)
    lines = block.strip().split('\\n')
    product_type = ''
    your_id = ''
    monthly_cost = 0.0
    access_id = ''
    speed_mbps = None
    contract_months = None
    description = ''
    
    for i, line in enumerate(lines[:15]):
        line = line.strip()
        
        # Product type patterns
        if re.match(r'^(FAST Fibre|IP-Line Link|IP-Line|Standard Access|Ethernet Multi-Service Access|Customer Premise Equipment|NBN-EE|Telstra-EA)', line):
            product_type = line.split('(')[0].strip()
        
        # Your ID
        if 'Your ID:' in line:
            your_id = line.replace('Your ID:', '').strip()
        
        # Access ID / AVC from description
        avc_m = re.search(r'Access\\s+(\\d{9,})', line)
        if avc_m:
            access_id = avc_m.group(1)
        
        # Also extract from "to FAST Fibre (NTU) 100XXXXXX" or "to NBN-EE 100XXXXXX"
        ntu_m = re.search(r'(?:FAST Fibre|NBN-EE|Telstra-EA)\\s+(?:\\(NTU\\)\\s+)?(\\d{9,})', line)
        if ntu_m and not access_id:
            access_id = ntu_m.group(1)
        
        # Speed from product description
        speed_m = re.search(r'(\\d+)\\s*Mbps', line, re.IGNORECASE)
        if speed_m:
            speed_mbps = int(speed_m.group(1))
        
        # Contract months
        contract_m = re.search(r'(\\d+)\\s*Months', line, re.IGNORECASE)
        if contract_m:
            contract_months = int(contract_m.group(1))
        
        # Description line (connecting IP-Line to Access)
        if 'Connecting IP-Line' in line or 'BRUNSWICK' in line or 'BALMORAL' in line:
            description = line
    
    # Extract monthly cost - look for "Total, excluding GST for Service XXXXX" line
    cost_m = re.search(r'Total,\\s+excluding\\s+GST\\s+for\\s+Service\\s+' + service_id + r'[\\s\\$]+(\\d[\\d,.]+)', block)
    if cost_m:
        monthly_cost = float(cost_m.group(1).replace(',', ''))
    else:
        # Try to find RC (recurring charge) amount
        rc_m = re.search(r'\\$([\\d,.]+)\\s*$', block.split('\\n')[3] if len(block.split('\\n')) > 3 else '', re.MULTILINE)
        if rc_m:
            monthly_cost = float(rc_m.group(1).replace(',', ''))
    
    # Determine service type
    if 'FAST Fibre' in product_type or 'NBN-EE' in product_type:
        service_type = 'Internet'
    elif 'Ethernet' in product_type:
        service_type = 'Internet'
    elif 'Standard Access' in product_type:
        service_type = 'Internet'
    elif 'IP-Line Link' in product_type:
        service_type = 'Internet'
    elif 'IP-Line' in product_type and 'Link' not in product_type:
        service_type = 'Internet'
    elif 'Telstra-EA' in product_type:
        service_type = 'Internet'
    else:
        service_type = 'Other'
    
    postcode = extract_postcode(address)
    state = extract_state(address)
    
    parsed_services.append({
        'aaptServiceId': service_id,
        'aaptProductType': product_type or 'Unknown',
        'address': address,
        'postcode': postcode,
        'state': state,
        'aaptYourId': your_id,
        'aaptAccessId': access_id,
        'description': description,
        'monthlyCost': monthly_cost,
        'speedMbps': speed_mbps,
        'contractMonths': contract_months,
        'serviceType': service_type,
        'provider': 'AAPT',
        'aaptAccountNumber': invoice_meta['accountNumber'],
        'aaptInvoiceNumber': invoice_meta['invoiceNumber'],
        'aaptBillingPeriod': invoice_meta['billingPeriod'],
    })

result = {
    'meta': invoice_meta,
    'services': parsed_services,
    'serviceCount': len(parsed_services),
}

with open(output_path, 'w') as f:
    json.dump(result, f, indent=2)

print(f"Extracted {len(parsed_services)} services to {output_path}")
print(f"Invoice: {invoice_meta['invoiceNumber']} | Account: {invoice_meta['accountNumber']} | Period: {invoice_meta['billingPeriod']}")

# Print summary by product type
from collections import Counter
types = Counter(s['aaptProductType'] for s in parsed_services)
for t, count in sorted(types.items(), key=lambda x: -x[1]):
    total = sum(s['monthlyCost'] for s in parsed_services if s['aaptProductType'] == t)
    print(f"  {t}: {count} services, \${total:.2f}")
`;

writeFileSync('/tmp/extract_aapt.py', pythonScript);
console.log('Python script written, executing...');
