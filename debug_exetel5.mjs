import { execSync } from 'child_process';

const text = execSync('pdftotext /home/ubuntu/upload/ExetelFeb.pdf -', {encoding:'utf8'});
const compact = t => t.split('\n').map(l=>l.trim()).filter(l=>l.length>0).join('\n');

const summaryStart = text.indexOf('Your Service Summary');
const summaryText = text.slice(summaryStart);
const compactLines = compact(summaryText).split('\n');

const isPageHeader = l => /^(Home:|Copyright|Level 9|Sydney NSW|ABN 35|Page \d+ of \d+|Powered by TCPDF)/.test(l);

// CORRECT ALGORITHM:
// 1. Find all service block headers and their line positions
// 2. Find all "Sub Total\n$amount" pairs and their positions
// 3. For each service block, find the LAST Sub Total pair that appears BEFORE the next block's header
//    OR the FIRST Sub Total pair that appears AFTER this block's header but before the one after next
//
// Actually, the simplest correct approach:
// Each service block's definitive amount is the LAST "Sub Total" amount that appears
// between this block's header and the NEXT block's header (inclusive of amounts after next header
// up to the second Sub Total after the next header).
//
// Even simpler: collect all (headerLine, subTotalLine, amount) tuples.
// The Sub Total for block N is the Sub Total that appears AFTER block N's header
// and BEFORE the Sub Total for block N+1.
// 
// SIMPLEST APPROACH: 
// - Find all service headers with their line numbers
// - Find all Sub Total amounts with their line numbers  
// - Assign each Sub Total to the most recent service header before it
// - For each service, use the LAST Sub Total assigned to it

// Step 1: Find all service headers
const headers = [];
for (let i = 0; i < compactLines.length; i++) {
  const line = compactLines[i];
  if (isPageHeader(line)) continue;
  const m = line.match(/^(Broadband|Corporate)\s+-\s+(\d+)$/);
  if (m) headers.push({ lineIdx: i, category: m[1], serviceNumber: m[2] });
  if (/^Others\s+-\s+\d+$/.test(line)) break;
}

// Step 2: Find all Sub Total amounts (line after "Sub Total")
const subTotals = [];
for (let i = 0; i < compactLines.length - 1; i++) {
  const line = compactLines[i];
  if (isPageHeader(line)) continue;
  if (line === 'Sub Total') {
    // Find the next non-header, non-empty line
    for (let j = i + 1; j < compactLines.length; j++) {
      if (isPageHeader(compactLines[j])) continue;
      const amtM = compactLines[j].match(/^\$([\d,]+\.\d{2})$/);
      if (amtM) {
        subTotals.push({ lineIdx: i, amountLine: j, amount: parseFloat(amtM[1].replace(/,/g, '')) });
        break;
      }
      break; // if next non-header line is not an amount, stop
    }
  }
}

console.log('Headers:', headers.map(h => `${h.serviceNumber}@${h.lineIdx}`).join(', '));
console.log('SubTotals:', subTotals.map(s => `$${s.amount}@${s.lineIdx}`).join(', '));

// Step 3: Assign Sub Totals to headers
// For each header, find the Sub Total that "belongs" to it.
// The Sub Total for header N is the one that appears AFTER header N's line
// but is the LAST one before the Sub Total for header N+1.
// 
// Actually: assign each Sub Total to the most recent header before it.
// Then for each header, use the LAST assigned Sub Total.
const headerSubTotals = new Map(); // serviceNumber -> last sub total amount

for (const st of subTotals) {
  // Find the most recent header before this Sub Total
  let assignedHeader = null;
  for (const h of headers) {
    if (h.lineIdx <= st.lineIdx) assignedHeader = h;
    else break;
  }
  if (assignedHeader) {
    headerSubTotals.set(assignedHeader.serviceNumber, st.amount);
    console.log(`  SubTotal $${st.amount} at line ${st.lineIdx} -> ${assignedHeader.serviceNumber}`);
  }
}

// Step 4: Build service blocks with metadata
const blocks = [];
for (let hi = 0; hi < headers.length; hi++) {
  const h = headers[hi];
  const nextH = headers[hi + 1];
  const endLine = nextH ? nextH.lineIdx : compactLines.length;
  
  const block = {
    serviceNumber: h.serviceNumber,
    category: h.category,
    address: '',
    friendlyName: '',
    avcId: undefined,
    plan: '',
    amount: headerSubTotals.get(h.serviceNumber) || 0
  };
  
  // Collect metadata from lines between this header and next header
  let inRecurring = false;
  for (let i = h.lineIdx + 1; i < endLine; i++) {
    const line = compactLines[i];
    if (isPageHeader(line)) continue;
    if (/^(Broadband|Corporate|Others)\s+-\s+\d+$/.test(line)) break;
    
    if (!block.address && /^[A-Z0-9\/\s,.-]+(?:QLD|NSW|VIC|SA|WA|TAS|NT|ACT)\s+\d{4}$/.test(line)) { block.address = line; continue; }
    if (!block.friendlyName && /^\([^)]+\)$/.test(line)) { block.friendlyName = line.slice(1,-1).trim(); continue; }
    if (line.startsWith('AVC ID -')) { block.avcId = line.replace('AVC ID -', '').trim(); continue; }
    if (line === 'Recurring monthly charge:') { inRecurring = true; continue; }
    if (!inRecurring) continue;
    if (!block.plan && !/^\d{1,2}\s+\w+\s+\d{4}/.test(line) && !/^\$[\d,]+\.\d{2}$/.test(line) && !/^Sub Total/.test(line) && !/^Monthly Charge For Support/.test(line) && !/^Anniversary billing/.test(line) && line.length > 5) {
      block.plan = line;
    }
  }
  
  if (block.amount > 0) blocks.push(block);
}

console.log('\n=== FINAL BLOCKS ===');
for (const b of blocks) {
  const amtExGst = Math.round((b.amount / 1.1) * 100) / 100;
  console.log(b.serviceNumber, '|', (b.friendlyName || b.address || '').substring(0,25).padEnd(25), '| $' + b.amount + ' inc | $' + amtExGst + ' ex | plan:', (b.plan||'').substring(0,35));
}

const total = blocks.reduce((s,b) => s + b.amount, 0);
console.log('\nSum (inc GST):', total.toFixed(2));
console.log('Expected: 109+374+374+675+1300+800+350+825+935+387+313.50+805 = 7247.50');
