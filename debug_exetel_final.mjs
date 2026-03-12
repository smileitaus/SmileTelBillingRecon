import { execSync } from 'child_process';

const text = execSync('pdftotext /home/ubuntu/upload/ExetelFeb.pdf -', {encoding:'utf8'});
const compact = t => t.split('\n').map(l=>l.trim()).filter(l=>l.length>0).join('\n');

const summaryStart = text.indexOf('Your Service Summary');
const summaryText = text.slice(summaryStart);
const compactLines = compact(summaryText).split('\n');

const isPageHeader = l => /^(Home:|Copyright|Level 9|Sydney NSW|ABN 35|Page \d+ of \d+|Powered by TCPDF)/.test(l);
const isServiceHeader = l => /^(Broadband|Corporate)\s+-\s+\d+$/.test(l);

// FINAL CORRECT ALGORITHM:
// The block-level Sub Total for block N is the LAST Sub Total that appears BEFORE
// the "Recurring monthly charge:" line of block N+1.
// This is because:
// - The "Recurring monthly charge:" line marks the start of actual charges for a block
// - Everything before it (address, friendly name, Sub Total from previous block) is metadata
//
// For the LAST block (BGC Engineering), the Sub Total appears before "Others" section.

// Step 1: Find all service block headers with their "Recurring monthly charge:" line
const headers = [];
for (let i = 0; i < compactLines.length; i++) {
  const line = compactLines[i];
  if (isPageHeader(line)) continue;
  const m = line.match(/^(Broadband|Corporate)\s+-\s+(\d+)$/);
  if (m) {
    // Find the first PLAN LINE for this block ("Monthly Charge...", "Anniversary billing...", etc.)
    // This is the boundary for the PREVIOUS block's Sub Total search.
    let firstPlanLine = -1;
    for (let j = i + 1; j < compactLines.length; j++) {
      if (isPageHeader(compactLines[j])) continue;
      if (isServiceHeader(compactLines[j])) break;
      if (/^Others\s+-\s+\d+$/.test(compactLines[j])) break;
      if (/^(Monthly Charge|Anniversary billing|Monthly Internet Charge)/.test(compactLines[j])) { firstPlanLine = j; break; }
    }
    headers.push({ lineIdx: i, category: m[1], serviceNumber: m[2], recurringLine: firstPlanLine >= 0 ? firstPlanLine : i + 5 });
  }
  if (/^Others\s+-\s+\d+$/.test(line)) { headers.push({ lineIdx: i, category: 'Others', serviceNumber: 'END', recurringLine: i }); break; }
}

// Step 2: For each block, find the block-level Sub Total amount.
// The block-level Sub Total is the LAST Sub Total that appears in the range
// [headerLine, nextBlock.recurringLine).
// The amount is the next non-header dollar amount after the Sub Total.

function findLastSubTotalAmount(startLine, endLine) {
  let lastSubTotalLine = -1;
  for (let i = startLine; i < endLine; i++) {
    const line = compactLines[i];
    if (isPageHeader(line)) continue;
    if (line === 'Sub Total') lastSubTotalLine = i;
  }
  if (lastSubTotalLine < 0) return 0;
  
  // Find the next non-header dollar amount after the Sub Total
  for (let j = lastSubTotalLine + 1; j < Math.min(endLine + 10, compactLines.length); j++) {
    if (isPageHeader(compactLines[j])) continue;
    if (isServiceHeader(compactLines[j])) continue;
    const m = compactLines[j].match(/^\$([\d,]+\.\d{2})$/);
    if (m) return parseFloat(m[1].replace(/,/g, ''));
    // Stop at non-amount, non-header lines (except if it's a friendly name or address)
    if (!/^\([^)]+\)$/.test(compactLines[j]) && !/^[A-Z0-9\/\s,.-]+(?:QLD|NSW|VIC|SA|WA|TAS|NT|ACT)\s+\d{4}$/.test(compactLines[j])) break;
  }
  return 0;
}

// Build blocks
const blocks = [];
const serviceHeaders = headers.filter(h => h.category !== 'Others');
for (let hi = 0; hi < serviceHeaders.length; hi++) {
  const h = serviceHeaders[hi];
  const nextH = serviceHeaders[hi + 1] || headers.find(h => h.category === 'Others');
  const endLine = nextH ? nextH.recurringLine : compactLines.length;
  const headerEndLine = nextH ? nextH.lineIdx : compactLines.length;
  
  const amount = findLastSubTotalAmount(h.lineIdx, endLine);
  
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
  for (let i = h.lineIdx + 1; i < headerEndLine; i++) {
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
  
  console.log(`Block ${h.serviceNumber} (${h.friendlyName || block.friendlyName || '?'}): amount=$${amount}, range=[${h.lineIdx},${endLine})`);
  
  if (block.amount > 0) blocks.push(block);
}

console.log('\n=== FINAL BLOCKS ===');
for (const b of blocks) {
  const amtExGst = Math.round((b.amount / 1.1) * 100) / 100;
  console.log(b.serviceNumber, '|', (b.friendlyName || b.address || '').substring(0,25).padEnd(25), '| $' + b.amount + ' inc | $' + amtExGst + ' ex | plan:', (b.plan||'').substring(0,35));
}

const total = blocks.reduce((s,b) => s + b.amount, 0);
console.log('\nBlocks found:', blocks.length);
console.log('Sum (inc GST):', total.toFixed(2));
console.log('Expected: 109+374+374+675+1300+800+350+825+935+387+313.50+805 = 7247.50');
