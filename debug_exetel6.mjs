import { execSync } from 'child_process';

const text = execSync('pdftotext /home/ubuntu/upload/ExetelFeb.pdf -', {encoding:'utf8'});
const compact = t => t.split('\n').map(l=>l.trim()).filter(l=>l.length>0).join('\n');

const summaryStart = text.indexOf('Your Service Summary');
const summaryText = text.slice(summaryStart);
const compactLines = compact(summaryText).split('\n');

const isPageHeader = l => /^(Home:|Copyright|Level 9|Sydney NSW|ABN 35|Page \d+ of \d+|Powered by TCPDF)/.test(l);

// CORRECT ALGORITHM:
// The key insight: Sub Totals are assigned to blocks IN ORDER.
// Each block gets exactly ONE Sub Total (the block-level total, not sub-sub-totals).
// Sub Totals are assigned to blocks in sequence: first Sub Total -> first block, second -> second, etc.
// But we need to skip "sub-sub-totals" (like the Hosting $100 sub-total inside BCG backup).
//
// The "real" Sub Total for a block is the one that appears LAST in the block's section
// (either inside the block or just after the next header).
//
// SIMPLEST CORRECT APPROACH:
// Process lines in order. Track the current "active block" (the one whose Sub Total we haven't seen yet).
// When we see "Sub Total", the NEXT amount is the Sub Total for the active block.
// After assigning, the active block advances to the next block.
// Skip sub-sub-totals by only counting Sub Totals that appear AFTER the block's last charge line.
//
// Actually the simplest: collect Sub Total amounts in order, collect block headers in order.
// Assign Sub Total[i] to block[i] (one-to-one mapping).
// But we need to skip the Hosting sub-total ($100) inside BCG backup.
//
// The Hosting sub-total is NOT a block-level Sub Total - it's a category sub-total.
// How to distinguish? The block-level Sub Total is the LAST Sub Total before the next block header.
// OR: the block-level Sub Total is the one that appears AFTER all the block's charges.
//
// FINAL APPROACH: Find Sub Total amounts that appear in the "gap" between blocks
// (i.e., after a block's last charge but before the next block's first charge).
// These are the block-level Sub Totals.
//
// Actually, looking at the raw lines:
// The pattern for EACH block is:
//   [header]
//   [address]
//   [friendly name]
//   Recurring monthly charge:
//   [plan line]
//   [date range]
//   [$charge]
//   [optional: more plan/charge pairs]
//   Sub Total  <- this is the BLOCK-LEVEL Sub Total
//   [next header OR page header]
//   [$amount]  <- this is the block-level Sub Total amount
//
// The Hosting sub-total inside BCG backup is different - it's:
//   Monthly Charge On Plan TWBackup40 - $0.00 (x3)
//   $0.00 (x3)
//   $100.00
//   Sub Total  <- this is a CATEGORY sub-total (for Hosting)
//   $100.00
//   $374.00    <- this is the ACTUAL service charge
//   $0.00
//   Sub Total  <- this is the BLOCK-LEVEL Sub Total
//   [next header]
//   $374.00    <- block-level Sub Total amount
//
// So the block-level Sub Total is the LAST Sub Total before the next block header.
// The amount for it appears after the next block header.
//
// ALGORITHM:
// 1. Find all service block headers with line positions
// 2. For each block, find the LAST "Sub Total" line that appears before the next block header
// 3. The amount for that Sub Total is the NEXT non-header dollar amount after it

// Step 1: Find all service headers
const headers = [];
for (let i = 0; i < compactLines.length; i++) {
  const line = compactLines[i];
  if (isPageHeader(line)) continue;
  const m = line.match(/^(Broadband|Corporate)\s+-\s+(\d+)$/);
  if (m) headers.push({ lineIdx: i, category: m[1], serviceNumber: m[2] });
  if (/^Others\s+-\s+\d+$/.test(line)) { headers.push({ lineIdx: i, category: 'Others', serviceNumber: 'END' }); break; }
}

// Step 2: For each block, find the LAST Sub Total line before the next block header
function findLastSubTotalBefore(endLine) {
  let lastSubTotalLine = -1;
  for (let i = 0; i < endLine; i++) {
    if (isPageHeader(compactLines[i])) continue;
    if (compactLines[i] === 'Sub Total') lastSubTotalLine = i;
  }
  return lastSubTotalLine;
}

function findAmountAfter(startLine) {
  for (let i = startLine + 1; i < compactLines.length; i++) {
    if (isPageHeader(compactLines[i])) continue;
    const m = compactLines[i].match(/^\$([\d,]+\.\d{2})$/);
    if (m) return parseFloat(m[1].replace(/,/g, ''));
    // If we hit a non-amount, non-header line, stop (unless it's a service header which we skip)
    if (!/^(Broadband|Corporate)\s+-\s+\d+$/.test(compactLines[i])) {
      // Allow service headers to pass through (amount may be after them)
      if (compactLines[i].match(/^(Broadband|Corporate)\s+-\s+\d+$/)) continue;
      break;
    }
  }
  return 0;
}

// Better: find amount after startLine, skipping page headers AND service headers
function findAmountAfterSkippingHeaders(startLine) {
  for (let i = startLine + 1; i < compactLines.length; i++) {
    const line = compactLines[i];
    if (isPageHeader(line)) continue;
    if (/^(Broadband|Corporate)\s+-\s+\d+$/.test(line)) continue; // skip service headers
    const m = line.match(/^\$([\d,]+\.\d{2})$/);
    if (m) return parseFloat(m[1].replace(/,/g, ''));
    break; // stop at first non-header, non-amount line
  }
  return 0;
}

const blocks = [];
for (let hi = 0; hi < headers.length - 1; hi++) {
  const h = headers[hi];
  const nextH = headers[hi + 1];
  if (h.category === 'Others') break;
  
  // Find the last Sub Total line in this block's range
  const lastSubTotal = findLastSubTotalBefore(nextH.lineIdx);
  
  let amount = 0;
  if (lastSubTotal >= h.lineIdx) {
    // Found a Sub Total in this block's range - get the amount after it
    amount = findAmountAfterSkippingHeaders(lastSubTotal);
  }
  
  // Collect metadata
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

console.log('=== FINAL BLOCKS ===');
for (const b of blocks) {
  const amtExGst = Math.round((b.amount / 1.1) * 100) / 100;
  console.log(b.serviceNumber, '|', (b.friendlyName || b.address || '').substring(0,25).padEnd(25), '| $' + b.amount + ' inc | $' + amtExGst + ' ex | plan:', (b.plan||'').substring(0,35));
}

const total = blocks.reduce((s,b) => s + b.amount, 0);
console.log('\nBlocks found:', blocks.length);
console.log('Sum (inc GST):', total.toFixed(2));
console.log('Expected: 109+374+374+675+1300+800+350+825+935+387+313.50+805 = 7247.50');
