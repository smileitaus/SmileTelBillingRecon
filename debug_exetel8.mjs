import { execSync } from 'child_process';

const text = execSync('pdftotext /home/ubuntu/upload/ExetelFeb.pdf -', {encoding:'utf8'});
const compact = t => t.split('\n').map(l=>l.trim()).filter(l=>l.length>0).join('\n');

const summaryStart = text.indexOf('Your Service Summary');
const summaryText = text.slice(summaryStart);
const compactLines = compact(summaryText).split('\n');

const isPageHeader = l => /^(Home:|Copyright|Level 9|Sydney NSW|ABN 35|Page \d+ of \d+|Powered by TCPDF)/.test(l);
const isServiceHeader = l => /^(Broadband|Corporate)\s+-\s+\d+$/.test(l);
const isChargeDate = l => /^\d{1,2}\s+\w+\s+\d{4}\s+-\s+\d{1,2}\s+\w+\s+\d{4}$/.test(l);
const isPlanLine = l => /^(Monthly Charge|Anniversary billing|Monthly Internet Charge)/.test(l);

// CORRECT ALGORITHM:
// A Sub Total is a BLOCK-LEVEL total if there are NO more charge lines (plan lines or date ranges)
// between the Sub Total line and the next block header (or end of section).
// 
// A Sub Total is a CATEGORY sub-total if there ARE more charge lines after it (before the next block header).

// Step 1: Find all Sub Total amounts
const subTotals = [];
for (let i = 0; i < compactLines.length - 1; i++) {
  const line = compactLines[i];
  if (isPageHeader(line)) continue;
  if (line === 'Sub Total') {
    // Find the next non-header dollar amount
    let amount = 0;
    for (let j = i + 1; j < compactLines.length; j++) {
      if (isPageHeader(compactLines[j])) continue;
      if (isServiceHeader(compactLines[j])) continue;
      const m = compactLines[j].match(/^\$([\d,]+\.\d{2})$/);
      if (m) { amount = parseFloat(m[1].replace(/,/g, '')); break; }
      break;
    }
    
    // Check if this is a block-level Sub Total:
    // No charge lines (plan or date range) between this Sub Total and the next block header
    let isBlockLevel = true;
    for (let j = i + 1; j < compactLines.length; j++) {
      const nextLine = compactLines[j];
      if (isPageHeader(nextLine)) continue;
      if (isServiceHeader(nextLine)) break; // reached next block header
      if (/^Others\s+-\s+\d+$/.test(nextLine)) break;
      if (isPlanLine(nextLine) || isChargeDate(nextLine)) {
        isBlockLevel = false;
        break;
      }
    }
    
    subTotals.push({ lineIdx: i, amount, isBlockLevel });
  }
}

console.log('All Sub Totals:');
for (const st of subTotals) {
  console.log(`  line ${st.lineIdx}: $${st.amount} ${st.isBlockLevel ? '[BLOCK-LEVEL]' : '[category]'}`);
}

const blockLevelSubTotals = subTotals.filter(s => s.isBlockLevel && s.amount > 0);
console.log('\nBlock-level Sub Totals:', blockLevelSubTotals.map(s => `$${s.amount}@line${s.lineIdx}`).join(', '));

// Step 2: Find all service block headers
const headers = [];
for (let i = 0; i < compactLines.length; i++) {
  const line = compactLines[i];
  if (isPageHeader(line)) continue;
  const m = line.match(/^(Broadband|Corporate)\s+-\s+(\d+)$/);
  if (m) headers.push({ lineIdx: i, category: m[1], serviceNumber: m[2] });
  if (/^Others\s+-\s+\d+$/.test(line)) { headers.push({ lineIdx: i, category: 'Others', serviceNumber: 'END' }); break; }
}

// Step 3: Assign block-level Sub Totals to headers in sequence
// Each block gets the block-level Sub Total that appears AFTER its header
// and BEFORE the next block's block-level Sub Total.
// But since Sub Totals appear in order, we just assign them 1:1 to headers.

console.log('\nHeaders:', headers.filter(h => h.category !== 'Others').map(h => `${h.serviceNumber}@${h.lineIdx}`).join(', '));
console.log('Expected 13 headers, got:', headers.filter(h => h.category !== 'Others').length);
console.log('Block-level Sub Totals count:', blockLevelSubTotals.length);

// Assign: header[i] gets blockLevelSubTotals[i]
const blocks = [];
const serviceHeaders = headers.filter(h => h.category !== 'Others');
for (let hi = 0; hi < serviceHeaders.length; hi++) {
  const h = serviceHeaders[hi];
  const nextH = serviceHeaders[hi + 1] || headers.find(h => h.category === 'Others');
  const amount = hi < blockLevelSubTotals.length ? blockLevelSubTotals[hi].amount : 0;
  
  const block = {
    serviceNumber: h.serviceNumber,
    category: h.category,
    address: '',
    friendlyName: '',
    avcId: undefined,
    plan: '',
    amount
  };
  
  const endLine = nextH ? nextH.lineIdx : compactLines.length;
  let inRecurring = false;
  for (let i = h.lineIdx + 1; i < endLine; i++) {
    const line = compactLines[i];
    if (isPageHeader(line)) continue;
    if (!block.address && /^[A-Z0-9\/\s,.-]+(?:QLD|NSW|VIC|SA|WA|TAS|NT|ACT)\s+\d{4}$/.test(line)) { block.address = line; continue; }
    if (!block.friendlyName && /^\([^)]+\)$/.test(line)) { block.friendlyName = line.slice(1,-1).trim(); continue; }
    if (line.startsWith('AVC ID -')) { block.avcId = line.replace('AVC ID -', '').trim(); continue; }
    if (line === 'Recurring monthly charge:') { inRecurring = true; continue; }
    if (!inRecurring) continue;
    if (!block.plan && !isChargeDate(line) && !/^\$[\d,]+\.\d{2}$/.test(line) && !/^Sub Total/.test(line) && !/^Monthly Charge For Support/.test(line) && !/^Anniversary billing/.test(line) && line.length > 5) {
      block.plan = line;
    }
  }
  
  if (block.amount > 0) blocks.push(block);
}

console.log('\n=== FINAL BLOCKS ===');
for (const b of blocks) {
  const amtExGst = Math.round((b.amount / 1.1) * 100) / 100;
  console.log(b.serviceNumber, '|', (b.friendlyName || b.address || '').substring(0,25).padEnd(25), '| $' + b.amount + ' inc | $' + amtExGst + ' ex');
}

const total = blocks.reduce((s,b) => s + b.amount, 0);
console.log('\nBlocks found:', blocks.length);
console.log('Sum (inc GST):', total.toFixed(2));
console.log('Expected: 109+374+374+675+1300+800+350+825+935+387+313.50+805 = 7247.50');
