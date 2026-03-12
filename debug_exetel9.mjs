import { execSync } from 'child_process';

const text = execSync('pdftotext /home/ubuntu/upload/ExetelFeb.pdf -', {encoding:'utf8'});
const compact = t => t.split('\n').map(l=>l.trim()).filter(l=>l.length>0).join('\n');

const summaryStart = text.indexOf('Your Service Summary');
const summaryText = text.slice(summaryStart);
const compactLines = compact(summaryText).split('\n');

const isPageHeader = l => /^(Home:|Copyright|Level 9|Sydney NSW|ABN 35|Page \d+ of \d+|Powered by TCPDF)/.test(l);
const isServiceHeader = l => /^(Broadband|Corporate)\s+-\s+\d+$/.test(l);

// APPROACH: For each block, find the LAST dollar amount that appears in the block's "section".
// The "section" of block N is from block N's header to block N+1's header.
// BUT: some amounts appear AFTER block N+1's header (the Sub Total pattern).
// So the section is from block N's header to the FIRST non-amount, non-header line after block N+1's header.
//
// Actually, looking at the raw lines:
// The pattern for each block is:
//   [header N]
//   [address, name, charges...]
//   Sub Total
//   [header N+1]  <- may appear here
//   [$amount]     <- this is the Sub Total amount for block N
//   [address, name, charges for block N+1...]
//   Sub Total
//   [header N+2]
//   [$amount]     <- Sub Total for block N+1
//
// So the amount for block N appears AFTER header N+1 but BEFORE the first non-header, non-amount line of block N+1.
// The first non-header, non-amount line of block N+1 is the address line.
//
// ALGORITHM: For each block N, find the amount that appears between:
//   - The "Sub Total" line for block N (the last Sub Total before block N+1's address line)
//   - And the address line of block N+1
//
// The address line of block N+1 is the first ALL-CAPS line after block N+1's header.

// Step 1: Find all service block headers
const headers = [];
for (let i = 0; i < compactLines.length; i++) {
  const line = compactLines[i];
  if (isPageHeader(line)) continue;
  const m = line.match(/^(Broadband|Corporate)\s+-\s+(\d+)$/);
  if (m) headers.push({ lineIdx: i, category: m[1], serviceNumber: m[2] });
  if (/^Others\s+-\s+\d+$/.test(line)) { headers.push({ lineIdx: i, category: 'Others', serviceNumber: 'END' }); break; }
}

// Step 2: For each block, find the address line of the NEXT block
function findAddressLine(startLine) {
  for (let i = startLine; i < compactLines.length; i++) {
    const line = compactLines[i];
    if (isPageHeader(line)) continue;
    if (/^[A-Z0-9\/\s,.-]+(?:QLD|NSW|VIC|SA|WA|TAS|NT|ACT)\s+\d{4}$/.test(line)) return i;
    if (/^Others\s+-\s+\d+$/.test(line)) return i;
  }
  return compactLines.length;
}

// Step 3: For each block, find the last Sub Total amount before the next block's address line
function findBlockTotal(headerLine, nextHeaderLine) {
  // Find the address line of the next block (first ALL-CAPS line after nextHeaderLine)
  const nextAddressLine = findAddressLine(nextHeaderLine + 1);
  
  // Find the last "Sub Total\n$amount" pair where the Sub Total appears before nextAddressLine
  let lastSubTotalAmount = 0;
  for (let i = headerLine; i < nextAddressLine; i++) {
    const line = compactLines[i];
    if (isPageHeader(line)) continue;
    if (line === 'Sub Total') {
      // Find the next non-header dollar amount
      for (let j = i + 1; j < nextAddressLine + 5; j++) { // allow a few lines past nextAddressLine
        if (j >= compactLines.length) break;
        if (isPageHeader(compactLines[j])) continue;
        if (isServiceHeader(compactLines[j])) continue;
        const m = compactLines[j].match(/^\$([\d,]+\.\d{2})$/);
        if (m) {
          lastSubTotalAmount = parseFloat(m[1].replace(/,/g, ''));
          break;
        }
        break;
      }
    }
  }
  return lastSubTotalAmount;
}

// Build blocks
const blocks = [];
const serviceHeaders = headers.filter(h => h.category !== 'Others');
for (let hi = 0; hi < serviceHeaders.length; hi++) {
  const h = serviceHeaders[hi];
  const nextH = serviceHeaders[hi + 1] || headers.find(h => h.category === 'Others');
  const endLine = nextH ? nextH.lineIdx : compactLines.length;
  
  const amount = findBlockTotal(h.lineIdx, nextH ? nextH.lineIdx : compactLines.length - 1);
  
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
  for (let i = h.lineIdx + 1; i < endLine; i++) {
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
  
  console.log(`Block ${h.serviceNumber}: amount=$${amount}, nextHeaderLine=${nextH?.lineIdx}, nextAddressLine=${findAddressLine((nextH?.lineIdx || 0) + 1)}`);
  
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
