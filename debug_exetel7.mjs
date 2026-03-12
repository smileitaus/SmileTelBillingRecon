import { execSync } from 'child_process';

const text = execSync('pdftotext /home/ubuntu/upload/ExetelFeb.pdf -', {encoding:'utf8'});
const compact = t => t.split('\n').map(l=>l.trim()).filter(l=>l.length>0).join('\n');

const summaryStart = text.indexOf('Your Service Summary');
const summaryText = text.slice(summaryStart);
const compactLines = compact(summaryText).split('\n');

const isPageHeader = l => /^(Home:|Copyright|Level 9|Sydney NSW|ABN 35|Page \d+ of \d+|Powered by TCPDF)/.test(l);
const isServiceHeader = l => /^(Broadband|Corporate)\s+-\s+\d+$/.test(l);

// FINAL CORRECT ALGORITHM:
// Looking at the raw PDF lines, the pattern for EACH block is:
//
// [header N]
// [address]
// [friendly name]  <- may appear before OR after the Sub Total/amount for block N-1
// Recurring monthly charge:
// [plan]
// [date]
// [$charge]
// [optional more charges]
// Sub Total        <- block-level Sub Total marker
// [header N+1]     <- may appear here (page break)
// [$amount]        <- block-level Sub Total amount (for block N)
//
// The amount that appears IMMEDIATELY AFTER "Sub Total" (skipping page headers and service headers)
// is the Sub Total amount for the CURRENT block (the one that had the Sub Total marker).
//
// BUT: some blocks have MULTIPLE Sub Total markers (category sub-totals + block-level sub-total).
// The LAST Sub Total in a block is the block-level one.
//
// The key observation from the raw lines:
// - BCG backup (0755045023): has Sub Total at line 140 ($100 for Hosting) and Sub Total at line 152 ($374 for block)
//   The $374 appears at line 154 (after page header at 153 and 0403182994 header at 148)
//   Wait, line 148 is 0403182994 header, line 152 is Sub Total, line 154 is $374
//   So the Sub Total at line 152 is INSIDE the 0403182994 block range, but belongs to 0755045023
//
// The ONLY reliable way to get the correct amount:
// For each block, the Sub Total amount is the amount that appears after the LAST Sub Total marker
// that is associated with that block. The "last Sub Total" for a block is the one that appears
// BEFORE the next block's FIRST charge line (not just before the next header).
//
// SIMPLEST RELIABLE APPROACH: 
// Use the amount that appears AFTER each "Sub Total" marker, but only count Sub Totals
// that are followed by an amount that is NOT already inside the current block's charge list.
// 
// Actually, the simplest: look at the SEQUENCE of Sub Total amounts.
// From the trace: Sub Total amounts in order are: 109, 100, 374, 350, 800, 350, 825, 935, 387, 313.5, 805, 71.17
// Block headers in order: 0701561050, 0755045023, 0403182994, 0731731992, 0749850000, 0734334112, 0734334114, 0755045018, 0755045019, 0755045020, 0730541945, 0755045021, 0755045022
//
// Expected amounts: 109, 374, 374, 675, 1300, 350, 800, 350, 825, 935, 387, 313.5, 805
//
// The Sub Total amounts in order DON'T match the expected amounts because:
// - 100 is a category sub-total (not a block total)
// - 675 and 1300 are NOT in the Sub Total list (they appear as regular amounts, not after Sub Total)
//
// Wait - let me check: are 675 and 1300 preceded by "Sub Total"?
// From raw lines 170-184:
// 170: Sub Total
// 171: Corporate - 0749850000
// 172: $675.00
// 182: Sub Total
// 183: Corporate - 0734334112
// 184: $1,300.00
// YES! 675 and 1300 ARE Sub Total amounts, they just appear after the next service header.
// So the Sub Total amounts in order ARE: 109, 100, 374, 675, 1300, 350, 800, 350, 825, 935, 387, 313.5, 805, 71.17
// But I only found 12 in my earlier trace. Let me recount.

// Step 1: Find ALL Sub Total amounts (amount after "Sub Total" line)
const subTotalAmounts = [];
for (let i = 0; i < compactLines.length - 1; i++) {
  const line = compactLines[i];
  if (isPageHeader(line)) continue;
  if (line === 'Sub Total') {
    // Find the next non-header dollar amount
    for (let j = i + 1; j < compactLines.length; j++) {
      if (isPageHeader(compactLines[j])) continue;
      if (isServiceHeader(compactLines[j])) continue; // skip service headers
      const m = compactLines[j].match(/^\$([\d,]+\.\d{2})$/);
      if (m) {
        const val = parseFloat(m[1].replace(/,/g, ''));
        subTotalAmounts.push({ subTotalLine: i, amountLine: j, amount: val });
        break;
      }
      break;
    }
  }
}

console.log('All Sub Total amounts:', subTotalAmounts.map(s => `$${s.amount}@line${s.subTotalLine}`).join(', '));

// Step 2: Find all service block headers
const headers = [];
for (let i = 0; i < compactLines.length; i++) {
  const line = compactLines[i];
  if (isPageHeader(line)) continue;
  const m = line.match(/^(Broadband|Corporate)\s+-\s+(\d+)$/);
  if (m) headers.push({ lineIdx: i, category: m[1], serviceNumber: m[2] });
  if (/^Others\s+-\s+\d+$/.test(line)) { headers.push({ lineIdx: i, category: 'Others', serviceNumber: 'END' }); break; }
}

console.log('Headers:', headers.map(h => `${h.serviceNumber}@${h.lineIdx}`).join(', '));

// Step 3: For each block, find the Sub Total amounts that belong to it.
// A Sub Total belongs to block N if it appears AFTER block N's header AND
// it is the LAST Sub Total before block N+1's Sub Total.
// 
// Actually: assign Sub Totals to blocks in sequence.
// Each block gets the Sub Totals that appear between its header and the next block's header.
// The LAST Sub Total in that range is the block-level total.
// EXCEPT: if the last Sub Total in the range appears AFTER the next block's header,
// then it's the block-level total for the PREVIOUS block.
//
// This is getting complex. Let me try a different approach:
// Count Sub Totals per block range, and use the LAST one.
// But also handle the "overflow" case where the Sub Total appears after the next header.

// For each block, find all Sub Total amounts where the Sub Total line is in [headerLine, nextHeaderLine)
// OR where the Sub Total line is in [nextHeaderLine, nextNextHeaderLine) but the Sub Total
// is the FIRST one after nextHeaderLine (meaning it belongs to the current block).

// SIMPLEST WORKING APPROACH:
// Process Sub Totals in order. Assign each to the "current block" (the block that hasn't gotten its total yet).
// Skip Sub Totals that are category sub-totals (identified by being followed by more charges in the same block).
// A Sub Total is a BLOCK-LEVEL total if it's the LAST Sub Total before the next block's charges begin.

// Let me just use the sequence approach with deduplication:
// The expected sequence of block totals is: 109, 374, 374, 675, 1300, 350, 800, 350, 825, 935, 387, 313.5, 805
// The Sub Total amounts in order are: 109, 100, 374, 675, 1300, 350, 800, 350, 825, 935, 387, 313.5, 805, 71.17
// The 100 is a category sub-total (appears INSIDE a block, followed by more charges in the same block)
// The 71.17 is for Others
// So I need to filter out Sub Totals that are followed by more charges in the SAME block.

// A Sub Total is a CATEGORY sub-total if, after its amount, there are more charge lines
// before the next block header.

const blockTotals = [];
for (const st of subTotalAmounts) {
  // Check if there are more charge lines after this Sub Total's amount, before the next block header
  let hasMoreCharges = false;
  for (let i = st.amountLine + 1; i < compactLines.length; i++) {
    const line = compactLines[i];
    if (isPageHeader(line)) continue;
    if (isServiceHeader(line)) break; // next block header - stop
    if (/^Others\s+-\s+\d+$/.test(line)) break;
    // Check for charge lines (plan name + date + amount pattern)
    if (/^\d{1,2}\s+\w+\s+\d{4}/.test(line)) { hasMoreCharges = true; break; }
    if (/^Monthly Charge/.test(line)) { hasMoreCharges = true; break; }
    if (/^Anniversary billing/.test(line)) { hasMoreCharges = true; break; }
  }
  
  if (!hasMoreCharges) {
    blockTotals.push(st);
  } else {
    console.log(`  SKIP category sub-total $${st.amount} at line ${st.subTotalLine} (more charges follow)`);
  }
}

console.log('\nBlock-level Sub Totals:', blockTotals.map(s => `$${s.amount}`).join(', '));
console.log('Block headers (excl END):', headers.filter(h => h.category !== 'Others').map(h => h.serviceNumber).join(', '));

// Assign block totals to headers in sequence
const blocks = [];
for (let hi = 0; hi < headers.length - 1; hi++) {
  const h = headers[hi];
  if (h.category === 'Others') break;
  const nextH = headers[hi + 1];
  
  const amount = hi < blockTotals.length ? blockTotals[hi].amount : 0;
  
  const block = {
    serviceNumber: h.serviceNumber,
    category: h.category,
    address: '',
    friendlyName: '',
    avcId: undefined,
    plan: '',
    amount
  };
  
  let inRecurring = false;
  for (let i = h.lineIdx + 1; i < nextH.lineIdx; i++) {
    const line = compactLines[i];
    if (isPageHeader(line)) continue;
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
  console.log(b.serviceNumber, '|', (b.friendlyName || b.address || '').substring(0,25).padEnd(25), '| $' + b.amount + ' inc | $' + amtExGst + ' ex');
}

const total = blocks.reduce((s,b) => s + b.amount, 0);
console.log('\nBlocks found:', blocks.length);
console.log('Sum (inc GST):', total.toFixed(2));
console.log('Expected: 109+374+374+675+1300+800+350+825+935+387+313.50+805 = 7247.50');
