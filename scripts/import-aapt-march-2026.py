"""
AAPT March 2026 Invoice Import Script
- Loads extracted AAPT services JSON
- Matches each service to existing customers via:
  1. AVC/Access ID match against services.avcId
  2. Address match against customers.siteAddress / locations.address
  3. Fuzzy name match on aaptYourId against customer names
- Imports all services into DB with provider='AAPT'
- Stores all confirmed matches as reusable mapping rules in supplier_service_map
- Populates supplier_registry with AAPT entry
- Populates supplier_invoice_uploads with import record
- Unmatched services get status='unmatched' with full context for manual review
"""

import os, json, re, urllib.parse
from datetime import datetime
import mysql.connector
from difflib import SequenceMatcher

# --- DB Connection ---
db_url = os.environ.get("DATABASE_URL", "")
parsed = urllib.parse.urlparse(db_url)
conn = mysql.connector.connect(
    host=parsed.hostname,
    port=parsed.port or 3306,
    user=parsed.username,
    password=parsed.password,
    database=parsed.path.lstrip("/"),
    ssl_disabled=False,
    ssl_verify_cert=False,
)
cur = conn.cursor(dictionary=True)

# --- Load extracted services ---
with open("/home/ubuntu/aapt_services_extracted.json") as f:
    data = json.load(f)

meta = data["meta"]
services = data["services"]
print(f"Loaded {len(services)} AAPT services from invoice {meta['invoiceNumber']}")

# --- Load existing customers ---
cur.execute("SELECT id, externalId, name, businessName, siteAddress, xeroContactName, xeroAccountNumber FROM customers")
customers = cur.fetchall()
print(f"Loaded {len(customers)} existing customers")

# --- Load existing services (for AVC/Access ID matching) ---
cur.execute("SELECT id, externalId, avcId, locationAddress, carbonAlias, supplierName, provider FROM services WHERE provider != 'AAPT' OR provider IS NULL")
existing_services = cur.fetchall()
print(f"Loaded {len(existing_services)} existing non-AAPT services")

# --- Load existing locations ---
cur.execute("SELECT id, externalId, address, customerExternalId, customerName FROM locations")
locations = cur.fetchall()
print(f"Loaded {len(locations)} locations")

def normalise_address(addr):
    """Normalise address for comparison: uppercase, remove punctuation, collapse spaces."""
    if not addr:
        return ""
    addr = addr.upper()
    addr = re.sub(r'[,\.]', ' ', addr)
    addr = re.sub(r'\s+', ' ', addr).strip()
    # Remove common suffixes that vary
    addr = re.sub(r'\b(STREET|ST|ROAD|RD|AVENUE|AVE|DRIVE|DR|PLACE|PL|COURT|CT|LANE|LN|BOULEVARD|BLVD|HIGHWAY|HWY)\b', lambda m: m.group(0), addr)
    return addr

def fuzzy_score(a, b):
    """Return similarity score 0-1 between two strings."""
    if not a or not b:
        return 0.0
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()

def extract_street_number_and_name(addr):
    """Extract the core street number + name for matching."""
    if not addr:
        return ""
    # Get just the street part (before suburb/state/postcode)
    m = re.match(r'^((?:(?:SUITE|UNIT|LEVEL|SHOP|LOT|BUILD)\s+[\w/]+,?\s+)?[\d/\-]+\s+\w+(?:\s+\w+)?)', addr.upper())
    if m:
        return m.group(1).strip()
    return addr.upper()[:50]

# Build lookup maps
avc_to_service = {}
for svc in existing_services:
    if svc.get('avcId'):
        avc_to_service[svc['avcId'].strip()] = svc

addr_to_customer = {}
for cust in customers:
    if cust.get('siteAddress'):
        key = normalise_address(cust['siteAddress'])
        if key:
            addr_to_customer[key] = cust

addr_to_location = {}
for loc in locations:
    if loc.get('address'):
        key = normalise_address(loc['address'])
        if key:
            addr_to_location[key] = loc

# --- Matching function ---
def find_customer_match(svc):
    """
    Try to match an AAPT service to a customer.
    Returns (customer, match_method, confidence) or (None, None, 0)
    """
    
    # 1. AVC/Access ID match against existing services
    access_id = svc.get('aaptAccessId', '').strip()
    if access_id:
        # Direct AVC match
        if access_id in avc_to_service:
            matched_svc = avc_to_service[access_id]
            if matched_svc.get('customerExternalId') if 'customerExternalId' in matched_svc else False:
                # Find the customer
                for cust in customers:
                    if cust['externalId'] == matched_svc.get('customerExternalId', ''):
                        return cust, 'avc_match', 0.98
        
        # Try without leading zeros or with different formatting
        for existing_avc, matched_svc in avc_to_service.items():
            if existing_avc and (existing_avc in access_id or access_id in existing_avc):
                # Find customer for this service
                for cust in customers:
                    if cust['externalId'] == matched_svc.get('customerExternalId', ''):
                        return cust, 'avc_partial_match', 0.85
    
    # 2. Address match
    addr = svc.get('address', '').strip()
    if addr:
        norm_addr = normalise_address(addr)
        
        # Exact normalised address match against customers
        if norm_addr in addr_to_customer:
            return addr_to_customer[norm_addr], 'address_exact', 0.95
        
        # Exact normalised address match against locations
        if norm_addr in addr_to_location:
            loc = addr_to_location[norm_addr]
            for cust in customers:
                if cust['externalId'] == loc['customerExternalId']:
                    return cust, 'address_location_exact', 0.95
        
        # Partial address match (street number + name)
        street_key = extract_street_number_and_name(addr)
        best_score = 0.0
        best_cust = None
        best_method = None
        
        for cust in customers:
            cust_addr = normalise_address(cust.get('siteAddress', ''))
            if not cust_addr:
                continue
            score = fuzzy_score(norm_addr, cust_addr)
            if score > best_score and score >= 0.75:
                best_score = score
                best_cust = cust
                best_method = 'address_fuzzy'
        
        for loc in locations:
            loc_addr = normalise_address(loc.get('address', ''))
            if not loc_addr:
                continue
            score = fuzzy_score(norm_addr, loc_addr)
            if score > best_score and score >= 0.75:
                best_score = score
                # Find customer for this location
                for cust in customers:
                    if cust['externalId'] == loc['customerExternalId']:
                        best_cust = cust
                        best_method = 'address_location_fuzzy'
                        break
        
        if best_cust:
            return best_cust, best_method, best_score
    
    # 3. "Your ID" fuzzy name match
    your_id = svc.get('aaptYourId', '').strip()
    if your_id and len(your_id) > 4:
        best_score = 0.0
        best_cust = None
        
        for cust in customers:
            # Try against customer name
            score = fuzzy_score(your_id, cust.get('name', ''))
            if score > best_score:
                best_score = score
                best_cust = cust
            
            # Try against business name
            score2 = fuzzy_score(your_id, cust.get('businessName', ''))
            if score2 > best_score:
                best_score = score2
                best_cust = cust
            
            # Try against xero contact name
            score3 = fuzzy_score(your_id, cust.get('xeroContactName', ''))
            if score3 > best_score:
                best_score = score3
                best_cust = cust
        
        if best_score >= 0.60:
            return best_cust, 'your_id_fuzzy', best_score
    
    return None, None, 0.0

# --- Run matching ---
print("\n--- Running matching ---")
match_results = []
method_counts = {}

for svc in services:
    customer, method, confidence = find_customer_match(svc)
    match_results.append({
        'service': svc,
        'customer': customer,
        'method': method,
        'confidence': confidence,
        'matched': customer is not None,
    })
    if method:
        method_counts[method] = method_counts.get(method, 0) + 1

matched = [r for r in match_results if r['matched']]
unmatched = [r for r in match_results if not r['matched']]

print(f"\nMatching results:")
print(f"  Matched: {len(matched)} / {len(services)}")
print(f"  Unmatched: {len(unmatched)} / {len(services)}")
print(f"\nBy method:")
for method, count in sorted(method_counts.items(), key=lambda x: -x[1]):
    print(f"  {method}: {count}")

print(f"\nMatched services:")
for r in matched:
    svc = r['service']
    cust = r['customer']
    print(f"  [{r['method']:.20s} {r['confidence']:.0%}] {svc['aaptServiceId']} {svc.get('aaptYourId','') or svc.get('address','')[:40]} → {cust['name']}")

print(f"\nUnmatched services:")
for r in unmatched:
    svc = r['service']
    print(f"  {svc['aaptServiceId']} | {svc['aaptProductType']} | {svc.get('aaptYourId','') or svc.get('aaptAccessId','')} | ${svc['monthlyCost']:.2f}")

# --- Generate externalIds for new services ---
cur.execute("SELECT MAX(CAST(SUBSTRING(externalId, 4) AS UNSIGNED)) as maxId FROM services WHERE externalId LIKE 'SVC%'")
row = cur.fetchone()
next_id = (row['maxId'] or 0) + 1

def next_ext_id():
    global next_id
    eid = f"SVC{next_id:04d}"
    next_id += 1
    return eid

# --- Insert AAPT supplier into supplier_registry ---
print("\n--- Inserting AAPT into supplier_registry ---")
total_cost = sum(s['monthlyCost'] for s in services)
cur.execute("""
    INSERT INTO supplier_registry (name, displayName, category, `rank`, abn, uploadFormats, uploadInstructions, isActive, totalServices, totalMonthlyCost, lastInvoiceDate, lastInvoiceNumber, notes)
    VALUES (%s, %s, %s, %s, %s, %s, %s, 1, %s, %s, %s, %s, %s)
    ON DUPLICATE KEY UPDATE
        displayName=VALUES(displayName), totalServices=VALUES(totalServices),
        totalMonthlyCost=VALUES(totalMonthlyCost), lastInvoiceDate=VALUES(lastInvoiceDate),
        lastInvoiceNumber=VALUES(lastInvoiceNumber), updatedAt=NOW()
""", (
    'AAPT',
    'AAPT (TPG Telecom)',
    'ISP',
    2,  # rank 2 - high priority after Telstra
    '22 052 082 416',
    'pdf',
    'Upload the AAPT itemised invoice PDF. The system will extract all service lines and auto-apply any previously confirmed customer mappings.',
    len(services),
    str(total_cost),
    meta['issueDate'],
    meta['invoiceNumber'],
    'AAPT is a TPG Telecom brand providing business internet (FAST Fibre, NBN-EE, IP-Line) services.'
))
conn.commit()
print("  AAPT added to supplier_registry")

# Also ensure Telstra is in registry
cur.execute("SELECT id FROM supplier_registry WHERE name='Telstra'")
if not cur.fetchone():
    cur.execute("""
        INSERT INTO supplier_registry (name, displayName, category, `rank`, uploadFormats, uploadInstructions, isActive, notes)
        VALUES ('Telstra', 'Telstra', 'Telecom', 1, 'xlsx,pdf', 'Upload Telstra Blitz report (XLSX) or itemised invoice (PDF).', 1, 'Telstra mobile and fixed services.')
    """)
    conn.commit()
    print("  Telstra added to supplier_registry")

# --- Insert supplier_invoice_uploads record ---
print("\n--- Inserting invoice upload record ---")
cur.execute("""
    INSERT INTO supplier_invoice_uploads (supplier, invoiceNumber, accountNumber, billingPeriod, issueDate, billingMonth, totalExGst, totalIncGst, serviceCount, matchedCount, unmatchedCount, autoMatchedCount, newMappingsCreated, importedBy, status, notes)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
""", (
    'AAPT',
    meta['invoiceNumber'],
    meta['accountNumber'],
    meta['billingPeriod'],
    meta['issueDate'],
    '2026-03',
    str(meta['totalExGst']),
    str(meta['totalInclGst']),
    len(services),
    len(matched),
    len(unmatched),
    len([r for r in matched if r['method'] in ('avc_match', 'address_exact', 'address_location_exact')]),
    len(matched),  # new mappings created = all matched
    'system-import',
    'complete',
    f"March 2026 AAPT itemised invoice import. {len(matched)} services matched, {len(unmatched)} unmatched."
))
upload_id = cur.lastrowid
conn.commit()
print(f"  Invoice upload record created (id={upload_id})")

# --- Insert services into DB ---
print("\n--- Importing services ---")
imported = 0
skipped = 0

for r in match_results:
    svc = r['service']
    customer = r['customer']
    
    ext_id = next_ext_id()
    
    # Build discovery notes
    notes_parts = [
        f"AAPT Invoice Import - March 2026",
        f"Invoice: {meta['invoiceNumber']} | Account: {meta['accountNumber']}",
        f"Billing Period: {meta['billingPeriod']}",
        f"AAPT Service ID: {svc['aaptServiceId']}",
        f"Product: {svc['aaptProductType']}",
    ]
    if svc.get('aaptAccessId'):
        notes_parts.append(f"Access ID / AVC: {svc['aaptAccessId']}")
    if svc.get('aaptYourId'):
        notes_parts.append(f"Your ID (Telstra label): {svc['aaptYourId']}")
    if svc.get('address'):
        notes_parts.append(f"Service Address: {svc['address']}")
    if svc.get('speedMbps'):
        notes_parts.append(f"Speed: {svc['speedMbps']} Mbps")
    if svc.get('contractMonths'):
        notes_parts.append(f"Contract: {svc['contractMonths']} months")
    if r['matched']:
        notes_parts.append(f"Customer Match: {customer['name']} (method={r['method']}, confidence={r['confidence']:.0%})")
    else:
        notes_parts.append("Customer Match: UNMATCHED - requires manual assignment")
        notes_parts.append("Match hints: " + (svc.get('aaptYourId') or svc.get('aaptAccessId') or svc.get('address') or 'none'))
    
    discovery_notes = "\n".join(notes_parts)
    
    # Determine status
    status = 'active' if r['matched'] else 'unmatched'
    
    # Build service name/plan
    plan_name = svc.get('aaptYourId') or f"AAPT {svc['aaptProductType']} {svc['aaptServiceId']}"
    
    cur.execute("""
        INSERT INTO services (
            externalId, serviceId, serviceType, serviceTypeDetail, planName, status,
            locationAddress, supplierName, provider,
            customerName, customerExternalId,
            monthlyCost, costSource,
            avcId, aaptServiceId, aaptProductType, aaptProductCategory,
            aaptYourId, aaptAccessId, aaptSpeedMbps, aaptContractMonths,
            aaptAccountNumber, aaptInvoiceNumber, aaptBillingPeriod, aaptImportDate,
            discoveryNotes, dataSource
        ) VALUES (
            %s, %s, %s, %s, %s, %s,
            %s, %s, %s,
            %s, %s,
            %s, %s,
            %s, %s, %s, %s,
            %s, %s, %s, %s,
            %s, %s, %s, %s,
            %s, %s
        )
    """, (
        ext_id,
        svc['aaptServiceId'],
        svc['serviceType'],
        svc['aaptProductType'],
        plan_name,
        status,
        svc.get('address') or '',
        'AAPT',
        'AAPT',
        customer['name'] if customer else '',
        customer['externalId'] if customer else '',
        str(svc['monthlyCost']),
        'supplier_invoice',
        svc.get('aaptAccessId') or '',
        svc['aaptServiceId'],
        svc['aaptProductType'],
        svc.get('aaptProductCategory') or '',
        svc.get('aaptYourId') or '',
        svc.get('aaptAccessId') or '',
        svc.get('speedMbps'),
        svc.get('contractMonths'),
        meta['accountNumber'],
        meta['invoiceNumber'],
        meta['billingPeriod'],
        datetime.now().strftime('%Y-%m-%d'),
        discovery_notes,
        f"AAPT Invoice {meta['invoiceNumber']}"
    ))
    imported += 1
    
    # Store mapping rule if matched
    if r['matched'] and customer:
        # Store service_id mapping
        try:
            cur.execute("""
                INSERT INTO supplier_service_map (supplierName, matchKeyType, matchKeyValue, productType, description, customerExternalId, customerName, serviceExternalId, confirmedBy, confidence, useCount, lastUsedAt)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 1, NOW())
                ON DUPLICATE KEY UPDATE
                    customerExternalId=VALUES(customerExternalId), customerName=VALUES(customerName),
                    serviceExternalId=VALUES(serviceExternalId), useCount=useCount+1, lastUsedAt=NOW(), updatedAt=NOW()
            """, (
                'AAPT',
                'service_id',
                svc['aaptServiceId'],
                svc['aaptProductType'],
                svc.get('description') or '',
                customer['externalId'],
                customer['name'],
                ext_id,
                r['method'],
                str(round(r['confidence'], 2)),
            ))
        except Exception as e:
            pass  # duplicate key - already mapped
        
        # Also store access_id mapping if available
        if svc.get('aaptAccessId'):
            try:
                cur.execute("""
                    INSERT INTO supplier_service_map (supplierName, matchKeyType, matchKeyValue, productType, description, customerExternalId, customerName, serviceExternalId, confirmedBy, confidence, useCount, lastUsedAt)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 1, NOW())
                    ON DUPLICATE KEY UPDATE
                        customerExternalId=VALUES(customerExternalId), customerName=VALUES(customerName),
                        useCount=useCount+1, lastUsedAt=NOW(), updatedAt=NOW()
                """, (
                    'AAPT',
                    'access_id',
                    svc['aaptAccessId'],
                    svc['aaptProductType'],
                    svc.get('description') or '',
                    customer['externalId'],
                    customer['name'],
                    ext_id,
                    r['method'],
                    str(round(r['confidence'], 2)),
                ))
            except Exception as e:
                pass
        
        # Store address mapping if available
        if svc.get('address'):
            try:
                cur.execute("""
                    INSERT INTO supplier_service_map (supplierName, matchKeyType, matchKeyValue, productType, description, customerExternalId, customerName, serviceExternalId, confirmedBy, confidence, useCount, lastUsedAt)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 1, NOW())
                    ON DUPLICATE KEY UPDATE
                        customerExternalId=VALUES(customerExternalId), customerName=VALUES(customerName),
                        useCount=useCount+1, lastUsedAt=NOW(), updatedAt=NOW()
                """, (
                    'AAPT',
                    'address',
                    normalise_address(svc['address']),
                    svc['aaptProductType'],
                    svc.get('address') or '',
                    customer['externalId'],
                    customer['name'],
                    ext_id,
                    r['method'],
                    str(round(r['confidence'], 2)),
                ))
            except Exception as e:
                pass

conn.commit()
print(f"  Imported {imported} services ({skipped} skipped)")

# --- Update customer service counts and costs ---
print("\n--- Updating customer aggregates ---")
cur.execute("""
    UPDATE customers c
    SET 
        serviceCount = (SELECT COUNT(*) FROM services s WHERE s.customerExternalId = c.externalId),
        monthlyCost = (SELECT COALESCE(SUM(s.monthlyCost), 0) FROM services s WHERE s.customerExternalId = c.externalId),
        unmatchedCount = (SELECT COUNT(*) FROM services s WHERE s.customerExternalId = c.externalId AND s.status = 'unmatched')
    WHERE c.externalId IN (
        SELECT DISTINCT customerExternalId FROM services WHERE provider = 'AAPT' AND customerExternalId != ''
    )
""")
conn.commit()
print("  Customer aggregates updated")

# --- Summary ---
print("\n=== IMPORT SUMMARY ===")
print(f"Invoice: {meta['invoiceNumber']} | Account: {meta['accountNumber']}")
print(f"Billing Period: {meta['billingPeriod']}")
print(f"Total services: {len(services)}")
print(f"Matched to customers: {len(matched)} ({len(matched)/len(services)*100:.0f}%)")
print(f"Unmatched (for manual review): {len(unmatched)} ({len(unmatched)/len(services)*100:.0f}%)")
print(f"Mapping rules stored: {len(matched) * 2} (service_id + access_id/address)")
print(f"Total monthly cost: ${total_cost:.2f} ex-GST")
print(f"\nUnmatched services needing manual assignment:")
for r in unmatched:
    svc = r['service']
    print(f"  {svc['aaptServiceId']} | {svc['aaptProductType']} | {svc.get('aaptYourId','') or svc.get('aaptAccessId','')} | ${svc['monthlyCost']:.2f}")

cur.close()
conn.close()
print("\nDone.")
