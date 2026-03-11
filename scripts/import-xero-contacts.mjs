import * as XLSX from '/home/ubuntu/billing-tool/node_modules/xlsx/xlsx.mjs';
import { readFileSync } from 'fs';
import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Read Xero Contacts
const buf = readFileSync('/home/ubuntu/upload/Contacts_Extractedasof110326.xlsx');
const wb = XLSX.read(buf);
const ws = wb.Sheets[wb.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(ws, { defval: null });

console.log(`Xero contacts loaded: ${data.length}\n`);

// Get existing customers
const [existingCustomers] = await conn.query('SELECT id, externalId, name, siteAddress, contactEmail, contactPhone, contactName, xeroContactName FROM customers');
console.log(`Existing customers: ${existingCustomers.length}\n`);

// Normalize name for matching
function normalizeName(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/[''`]/g, "'")
    .replace(/\u2019/g, "'")
    .replace(/pty\.?\s*ltd\.?/gi, '')
    .replace(/\(.*?\)/g, '')
    .replace(/\bfor\b/g, '')
    .replace(/\bzambrero\b/gi, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Build lookup from existing customers
const custByNormName = new Map();
const custByExact = new Map();
for (const c of existingCustomers) {
  const norm = normalizeName(c.name);
  if (norm) {
    if (!custByNormName.has(norm)) custByNormName.set(norm, []);
    custByNormName.get(norm).push(c);
  }
  custByExact.set(c.name.toLowerCase().trim(), c);
}

// Process Xero contacts
let matched = 0;
let updated = 0;
let newContacts = 0;
let skipped = 0;

// Track which existing customers got matched
const matchedCustIds = new Set();

for (const row of data) {
  const contactName = row['*ContactName'];
  if (!contactName) continue;
  
  const accountNumber = row['AccountNumber'] || '';
  const email = row['EmailAddress'] || '';
  const firstName = row['FirstName'] || '';
  const lastName = row['LastName'] || '';
  const phone = row['PhoneNumber'] || '';
  const mobile = row['MobileNumber'] || '';
  
  // Build address from SA (Street Address) fields
  const addrParts = [
    row['SAAddressLine1'],
    row['SAAddressLine2'],
    row['SAAddressLine3'],
    row['SAAddressLine4'],
    row['SACity'],
    row['SARegion'],
    row['SAPostalCode']
  ].filter(Boolean);
  const address = addrParts.join(', ');
  
  // Try to match to existing customer
  let match = null;
  
  // 1. Exact name match
  if (custByExact.has(contactName.toLowerCase().trim())) {
    match = custByExact.get(contactName.toLowerCase().trim());
  }
  
  // 2. Normalized name match
  if (!match) {
    const norm = normalizeName(contactName);
    if (norm && custByNormName.has(norm)) {
      const candidates = custByNormName.get(norm);
      match = candidates[0]; // Take first match
    }
  }
  
  // 3. Check if contact name contains a known customer name (for Zambrero pattern)
  // e.g., "A.M D'ARCY & J.E D'ARCY for Zambrero Bullsbrook" -> match "Zambrero - Bullsbrook"
  if (!match) {
    const lower = contactName.toLowerCase();
    const zamMatch = lower.match(/zambrero\s+(.+?)(?:\s*\(|$)/i);
    if (zamMatch) {
      const siteName = zamMatch[1].trim();
      // Look for "Zambrero - <siteName>" in existing customers
      for (const c of existingCustomers) {
        if (c.name.toLowerCase().includes('zambrero') && 
            c.name.toLowerCase().includes(siteName.toLowerCase())) {
          match = c;
          break;
        }
      }
    }
  }
  
  // 4. Check parenthetical name - e.g., "PhinaMoozy Oakleigh Pty Ltd (Zambrero Oakleigh)"
  if (!match) {
    const parenMatch = contactName.match(/\((.+?)\)/);
    if (parenMatch) {
      const parenName = parenMatch[1].trim();
      const parenNorm = normalizeName(parenName);
      if (parenNorm && custByNormName.has(parenNorm)) {
        match = custByNormName.get(parenNorm)[0];
      }
      // Also check for Zambrero pattern in parenthetical
      const zamMatch2 = parenName.match(/zambrero\s+(.+)/i);
      if (!match && zamMatch2) {
        const siteName = zamMatch2[1].trim();
        for (const c of existingCustomers) {
          if (c.name.toLowerCase().includes('zambrero') && 
              c.name.toLowerCase().includes(siteName.toLowerCase())) {
            match = c;
            break;
          }
        }
      }
    }
  }
  
  if (match && !matchedCustIds.has(match.id)) {
    matchedCustIds.add(match.id);
    matched++;
    
    // Update the existing customer with Xero data (source of truth)
    const updateFields = [];
    const updateValues = [];
    
    // Always set xeroContactName
    updateFields.push('xeroContactName = ?');
    updateValues.push(contactName);
    
    if (accountNumber) {
      updateFields.push('xeroAccountNumber = ?');
      updateValues.push(accountNumber);
    }
    
    // Update address if Xero has one and it's different
    if (address && address.length > 5) {
      updateFields.push('siteAddress = ?');
      updateValues.push(address);
      updated++;
    }
    
    // Update email if Xero has one
    if (email) {
      updateFields.push('contactEmail = ?');
      updateValues.push(email);
    }
    
    // Update phone
    if (phone || mobile) {
      updateFields.push('contactPhone = ?');
      updateValues.push(phone || mobile);
    }
    
    // Update contact name
    if (firstName || lastName) {
      updateFields.push('contactName = ?');
      updateValues.push(`${firstName} ${lastName}`.trim());
    }
    
    if (updateFields.length > 0) {
      updateValues.push(match.id);
      await conn.query(
        `UPDATE customers SET ${updateFields.join(', ')} WHERE id = ?`,
        updateValues
      );
    }
  } else if (!match) {
    // No match - this is a new Xero contact not in our system
    newContacts++;
  } else {
    skipped++; // Already matched to another Xero contact
  }
}

console.log(`=== XERO CONTACT MATCHING RESULTS ===`);
console.log(`Total Xero contacts: ${data.length}`);
console.log(`Matched to existing customers: ${matched}`);
console.log(`Updated with new address data: ${updated}`);
console.log(`New contacts (not in system): ${newContacts}`);
console.log(`Skipped (duplicate matches): ${skipped}`);

// Show some unmatched Xero contacts
console.log(`\n--- Sample unmatched Xero contacts ---`);
let unmatchedCount = 0;
for (const row of data) {
  const contactName = row['*ContactName'];
  if (!contactName) continue;
  
  let match = null;
  if (custByExact.has(contactName.toLowerCase().trim())) {
    match = custByExact.get(contactName.toLowerCase().trim());
  }
  if (!match) {
    const norm = normalizeName(contactName);
    if (norm && custByNormName.has(norm)) match = custByNormName.get(norm)[0];
  }
  if (!match) {
    const lower = contactName.toLowerCase();
    const zamMatch = lower.match(/zambrero\s+(.+?)(?:\s*\(|$)/i);
    if (zamMatch) {
      const siteName = zamMatch[1].trim();
      for (const c of existingCustomers) {
        if (c.name.toLowerCase().includes('zambrero') && c.name.toLowerCase().includes(siteName.toLowerCase())) {
          match = c;
          break;
        }
      }
    }
  }
  if (!match) {
    const parenMatch = contactName.match(/\((.+?)\)/);
    if (parenMatch) {
      const parenName = parenMatch[1].trim();
      const zamMatch2 = parenName.match(/zambrero\s+(.+)/i);
      if (zamMatch2) {
        const siteName = zamMatch2[1].trim();
        for (const c of existingCustomers) {
          if (c.name.toLowerCase().includes('zambrero') && c.name.toLowerCase().includes(siteName.toLowerCase())) {
            match = c;
            break;
          }
        }
      }
    }
  }
  
  if (!match && unmatchedCount < 20) {
    console.log(`  ${contactName}`);
    unmatchedCount++;
  }
}

// Count customers without xeroContactName
const [noXero] = await conn.query("SELECT COUNT(*) as cnt FROM customers WHERE xeroContactName = '' OR xeroContactName IS NULL");
console.log(`\nCustomers without Xero match: ${noXero[0].cnt}`);

await conn.end();
