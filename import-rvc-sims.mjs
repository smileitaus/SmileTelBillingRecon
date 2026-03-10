/**
 * Import script: TelstraSIM's RVC Customer List
 * 
 * Reads the Excel file, matches services by phone number,
 * enriches matched records, and creates new ones for unmatched.
 */
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import { eq, sql } from 'drizzle-orm';
import * as schema from './drizzle/schema.ts';
import XLSX from 'xlsx';

// Read the file path from args or use default
const filePath = process.argv[2] || '/home/ubuntu/telstra_sims.xlsx';

// Normalize phone number: strip spaces, dashes, parentheses, leading +61 → 0
function normalizePhone(phone) {
  if (!phone) return '';
  let p = String(phone).replace(/[\s\-\(\)\.]/g, '');
  // Convert +61 prefix to 0
  if (p.startsWith('+61')) p = '0' + p.slice(3);
  if (p.startsWith('61') && p.length === 11) p = '0' + p.slice(2);
  // Ensure leading 0
  if (p.length === 9 && !p.startsWith('0')) p = '0' + p;
  return p;
}

// Format date from Excel serial or Date object
function formatDate(val) {
  if (!val) return '';
  if (val instanceof Date) {
    return val.toISOString().split('T')[0];
  }
  if (typeof val === 'number') {
    // Excel serial date
    const d = new Date((val - 25569) * 86400 * 1000);
    return d.toISOString().split('T')[0];
  }
  return String(val);
}

// Clean customer name: extract the core name from messy strings
function cleanCustomerName(raw) {
  if (!raw || raw === '?') return '';
  let name = String(raw).trim();
  // Remove date references like "24-Mar-22" or "28-Feb-22"
  // Keep the core name before the first dash that's followed by a date-like pattern
  return name;
}

// Determine hardware type from columns F and N
function getHardwareType(colF, colN) {
  const parts = [];
  if (colN && !['Data', 'Services', 'S/N'].includes(String(colN).trim())) {
    const n = String(colN).trim();
    if (!n.startsWith('$')) parts.push(n);
  }
  if (colF) {
    const f = String(colF).trim();
    // Only include if it looks like hardware, not a location name
    if (f.match(/teltonika|trb|rut|iphone|lenovo|nighthawk|mesh|router/i)) {
      if (!parts.some(p => p.toLowerCase().includes(f.toLowerCase()))) {
        parts.push(f);
      }
    }
  }
  return parts.join(' / ') || '';
}

// Check if a value is a formula or non-data
function isFormula(val) {
  if (!val) return false;
  const s = String(val).trim();
  return s.startsWith('=') || s === 'S/N' || s === 'Extranet Code';
}

async function main() {
  console.log('=== RVC Customer List Import ===');
  console.log(`Reading: ${filePath}`);
  
  // Read Excel
  const workbook = XLSX.readFile(filePath, { cellDates: true });
  const mainSheet = workbook.Sheets[workbook.SheetNames[0]];
  const logSheet = workbook.Sheets['LOG'];
  
  // Parse main sheet as array of arrays
  const rows = XLSX.utils.sheet_to_json(mainSheet, { header: 1, defval: null });
  console.log(`Total rows (including header): ${rows.length}`);
  
  // Parse LOG sheet
  const logRows = logSheet ? XLSX.utils.sheet_to_json(logSheet, { header: 1, defval: null }) : [];
  
  // Connect to database
  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  const db = drizzle(connection, { schema, mode: 'default' });
  
  // Get all existing services
  const existingServices = await db.select().from(schema.services);
  console.log(`Existing services in DB: ${existingServices.length}`);
  
  // Build phone number lookup map
  const phoneMap = new Map();
  for (const svc of existingServices) {
    if (svc.phoneNumber) {
      const norm = normalizePhone(svc.phoneNumber);
      if (norm) {
        if (!phoneMap.has(norm)) phoneMap.set(norm, []);
        phoneMap.get(norm).push(svc);
      }
    }
  }
  console.log(`Phone lookup entries: ${phoneMap.size}`);
  
  // Build SIM lookup map (for existing services that already have SIM numbers)
  const simMap = new Map();
  for (const svc of existingServices) {
    if (svc.simSerialNumber) {
      simMap.set(svc.simSerialNumber, svc);
    }
  }
  
  // Process each data row
  const results = {
    matched: [],
    newServices: [],
    skipped: [],
    errors: [],
  };
  
  // Find the max externalId for new services
  const maxExtId = existingServices.reduce((max, s) => {
    const num = parseInt(s.externalId.replace('S', ''), 10);
    return num > max ? num : max;
  }, 0);
  let nextExtId = maxExtId + 1;
  
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every(c => c === null || c === undefined || String(c).trim() === '')) continue;
    
    const colA = row[0]; // Notes/comments
    const colB = row[1]; // SIM S/N
    const colC = row[2]; // Phone #
    const colD = row[3]; // Data Plan (GB)
    const colE = row[4]; // Misc notes
    const colF = row[5]; // Hardware/device info
    const colG = row[6]; // SIM Owner
    const colH = row[7]; // Customer
    const colI = row[8]; // Misc (4GB or RVC)
    const colJ = row[9]; // Purchase date
    const colK = row[10]; // Client date
    const colL = row[11]; // Cost
    const colM = row[12]; // Gbits
    const colN = row[13]; // Modem
    const colO = row[14]; // S/N label
    const colP = row[15]; // S/N value (modem serial)
    const colQ = row[16]; // MAC
    const colR = row[17]; // WiFi password
    const colS = row[18]; // Last WAN IP
    
    // Skip formula rows, section headers, and empty data rows
    const simVal = colB ? String(colB).trim() : '';
    const phoneVal = colC ? String(colC).trim() : '';
    
    if (isFormula(colB) || isFormula(colC) || isFormula(colD) || isFormula(colL) || isFormula(colM)) {
      results.skipped.push({ row: i + 1, reason: 'Formula/summary row' });
      continue;
    }
    
    // Skip rows that are just section labels in column A with no SIM or phone
    if (colA && !simVal && !phoneVal && !colH) {
      results.skipped.push({ row: i + 1, reason: `Section label: ${colA}` });
      continue;
    }
    
    // Skip rows with no useful data
    if (!simVal && !phoneVal && !colH && !colL) {
      results.skipped.push({ row: i + 1, reason: 'No SIM, phone, customer, or cost data' });
      continue;
    }
    
    // Skip non-SIM hardware entries (Apple iPad, Apple pencil)
    if (simVal && simVal.match(/^Apple/i)) {
      results.skipped.push({ row: i + 1, reason: `Hardware entry: ${simVal}` });
      continue;
    }
    
    // Build the enrichment data
    const simSN = (simVal && simVal !== '??' && !simVal.match(/^[A-Z]/)) ? simVal : '';
    const phone = normalizePhone(phoneVal);
    const customerName = cleanCustomerName(colH);
    const simOwner = colG ? String(colG).trim() : '';
    const hardwareType = getHardwareType(colF, colN);
    const macAddress = colQ ? String(colQ).trim() : '';
    const modemSN = colP ? String(colP).trim() : '';
    const wifiPwd = colR ? String(colR).trim() : '';
    const lastWanIp = colS ? String(colS).trim() : '';
    const purchaseDate = formatDate(colJ);
    const cost = colL && !isFormula(colL) ? parseFloat(colL) : null;
    const dataPlanGb = colM && !isFormula(colM) ? String(colM) : (colD && !isFormula(colD) ? String(colD) : '');
    
    // Build notes from uncategorized data
    const notesParts = [];
    if (colA && typeof colA === 'string') notesParts.push(`Note: ${colA}`);
    if (colE && typeof colE === 'string') notesParts.push(`Source: ${colE}`);
    if (colI && typeof colI === 'string' && colI !== '4GB' && colI !== 'RVC') notesParts.push(`Info: ${colI}`);
    if (colK) notesParts.push(`Client date: ${formatDate(colK)}`);
    if (colF && !hardwareType.includes(String(colF).trim())) notesParts.push(`Device: ${colF}`);
    if (colN && !hardwareType.includes(String(colN).trim())) {
      const nVal = String(colN).trim();
      if (nVal.startsWith('$')) notesParts.push(`Pricing note: ${nVal}`);
    }
    if (modemSN && modemSN.startsWith('Cancelled')) notesParts.push(`Status: ${modemSN}`);
    if (modemSN && modemSN.startsWith('From AMA')) notesParts.push(`Transfer: ${modemSN}`);
    
    // Clean modem S/N - only keep actual serial numbers
    const cleanModemSN = modemSN && modemSN.match(/^\d+$/) ? modemSN : '';
    
    // Try to match by phone number
    const matchedServices = phone ? (phoneMap.get(phone) || []) : [];
    
    if (matchedServices.length > 0) {
      // Enrich matched service(s)
      for (const svc of matchedServices) {
        const updates = {};
        if (simSN && !svc.simSerialNumber) updates.simSerialNumber = simSN;
        if (hardwareType && !svc.hardwareType) updates.hardwareType = hardwareType;
        if (macAddress && macAddress.includes(':') && !svc.macAddress) updates.macAddress = macAddress;
        if (cleanModemSN && !svc.modemSerialNumber) updates.modemSerialNumber = cleanModemSN;
        if (wifiPwd && !wifiPwd.startsWith('Old') && !svc.wifiPassword) updates.wifiPassword = wifiPwd;
        if (lastWanIp && lastWanIp.includes('.') && !svc.lastWanIp) updates.lastWanIp = lastWanIp;
        if (simOwner && !svc.simOwner) updates.simOwner = simOwner;
        if (dataPlanGb && !svc.dataPlanGb) updates.dataPlanGb = dataPlanGb;
        if (purchaseDate && !svc.purchaseDate) updates.purchaseDate = purchaseDate;
        if (customerName && !svc.customerName) updates.customerName = customerName;
        
        // Always set dataSource
        updates.dataSource = (svc.dataSource || '') ? 
          (svc.dataSource + '; RVC Customer List').replace(/^; /, '') : 
          'RVC Customer List';
        
        // Append notes
        if (notesParts.length > 0) {
          const existingNotes = svc.discoveryNotes || '';
          const newNotes = notesParts.join(' | ');
          const rvcPrefix = `[RVC Import] ${newNotes}`;
          updates.discoveryNotes = existingNotes ? `${existingNotes}\n${rvcPrefix}` : rvcPrefix;
          updates.notesAuthor = 'RVC Import';
          updates.notesUpdatedAt = new Date();
        }
        
        if (Object.keys(updates).length > 0) {
          await db.update(schema.services)
            .set(updates)
            .where(eq(schema.services.id, svc.id));
          
          results.matched.push({
            row: i + 1,
            phone,
            simSN,
            serviceId: svc.externalId,
            customerName: svc.customerName || customerName,
            fieldsUpdated: Object.keys(updates),
          });
        }
      }
    } else if (phone || simSN) {
      // Create new service record
      const extId = `S${String(nextExtId).padStart(4, '0')}`;
      nextExtId++;
      
      const newService = {
        externalId: extId,
        serviceId: simSN || '',
        serviceType: 'Mobile',
        serviceTypeDetail: 'SIM Service',
        planName: dataPlanGb ? `Data Plan ${dataPlanGb}GB` : 'Mobile SIM',
        status: 'unmatched',
        locationExternalId: '',
        locationAddress: '',
        supplierAccount: '',
        supplierName: 'Telstra',
        phoneNumber: phoneVal || '',
        email: '',
        connectionId: '',
        locId: '',
        ipAddress: '',
        customerName: customerName || '',
        customerExternalId: '',
        monthlyCost: cost ? String(cost) : '0.00',
        simSerialNumber: simSN,
        hardwareType,
        macAddress: macAddress.includes(':') ? macAddress : '',
        modemSerialNumber: cleanModemSN,
        wifiPassword: wifiPwd && !wifiPwd.startsWith('Old') ? wifiPwd : '',
        lastWanIp: lastWanIp && lastWanIp.includes('.') ? lastWanIp : '',
        simOwner,
        dataPlanGb,
        purchaseDate,
        dataSource: 'RVC Customer List',
        discoveryNotes: notesParts.length > 0 ? `[RVC Import] ${notesParts.join(' | ')}` : '',
        notesAuthor: notesParts.length > 0 ? 'RVC Import' : null,
        notesUpdatedAt: notesParts.length > 0 ? new Date() : null,
      };
      
      await db.insert(schema.services).values(newService);
      
      results.newServices.push({
        row: i + 1,
        externalId: extId,
        phone: phoneVal,
        simSN,
        customerName,
        cost,
      });
    } else {
      results.skipped.push({ row: i + 1, reason: 'No phone or SIM to match/create' });
    }
  }
  
  // Process LOG sheet entries - add as notes to matched services
  if (logRows.length > 0) {
    console.log(`\nProcessing LOG sheet (${logRows.length} rows)...`);
    for (let i = 0; i < logRows.length; i++) {
      const row = logRows[i];
      if (!row || row.every(c => c === null)) continue;
      
      const date = row[1] ? formatDate(row[1]) : '';
      const action = row[2] ? String(row[2]).trim() : '';
      const simNum = row[3] ? String(row[3]).trim() : '';
      const phone = row[4] ? normalizePhone(row[4]) : '';
      const person = row[5] ? String(row[5]).trim() : '';
      const method = row[6] ? String(row[6]).trim() : '';
      
      if (!action) continue;
      
      const logNote = `[LOG ${date}] ${action} | SIM: ${simNum} | By: ${person} | Method: ${method}`;
      
      // Try to match by phone
      if (phone) {
        const matched = phoneMap.get(phone) || [];
        for (const svc of matched) {
          const existing = svc.discoveryNotes || '';
          await db.update(schema.services)
            .set({
              discoveryNotes: existing ? `${existing}\n${logNote}` : logNote,
              notesAuthor: 'RVC Import',
              notesUpdatedAt: new Date(),
            })
            .where(eq(schema.services.id, svc.id));
        }
      }
      
      console.log(`  LOG: ${action}`);
    }
  }
  
  // Print summary
  console.log('\n=== IMPORT SUMMARY ===');
  console.log(`Matched & enriched: ${results.matched.length} services`);
  console.log(`New services created: ${results.newServices.length}`);
  console.log(`Skipped rows: ${results.skipped.length}`);
  console.log(`Errors: ${results.errors.length}`);
  
  if (results.matched.length > 0) {
    console.log('\n--- Matched Services ---');
    for (const m of results.matched) {
      console.log(`  Row ${m.row}: ${m.phone} → ${m.serviceId} (${m.customerName}) [updated: ${m.fieldsUpdated.join(', ')}]`);
    }
  }
  
  if (results.newServices.length > 0) {
    console.log('\n--- New Services ---');
    for (const n of results.newServices) {
      console.log(`  Row ${n.row}: ${n.externalId} - ${n.phone || n.simSN} (${n.customerName || 'Unknown'}) $${n.cost || 0}/mo`);
    }
  }
  
  if (results.skipped.length > 0) {
    console.log('\n--- Skipped Rows ---');
    for (const s of results.skipped) {
      console.log(`  Row ${s.row}: ${s.reason}`);
    }
  }
  
  await connection.end();
  console.log('\nImport complete!');
}

main().catch(err => {
  console.error('Import failed:', err);
  process.exit(1);
});
