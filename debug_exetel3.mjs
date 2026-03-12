import { execSync } from 'child_process';

const text = execSync('pdftotext /home/ubuntu/upload/ExetelFeb.pdf -', {encoding:'utf8'});
const compact = t => t.split('\n').map(l=>l.trim()).filter(l=>l.length>0).join('\n');

const summaryStart = text.indexOf('Your Service Summary');
const summaryText = text.slice(summaryStart);
const compactLines = compact(summaryText).split('\n');

const isPageHeader = l => /^(Home:|Copyright|Level 9|Sydney NSW|ABN 35|Page \d+ of \d+|Powered by TCPDF)/.test(l);

// Print all service headers and amounts with context
console.log('=== FULL TRACE ===');
let inService = false;
for (let i = 0; i < compactLines.length; i++) {
  const line = compactLines[i];
  if (isPageHeader(line)) continue;
  
  const isService = /^(Broadband|Corporate)\s+-\s+(\d+)$/.test(line);
  const isAmt = /^\$([\d,]+\.\d{2})$/.test(line);
  const isOthers = /^Others\s+-\s+\d+$/.test(line);
  const isFriendly = /^\([^)]+\)$/.test(line);
  const isSubTotal = line === 'Sub Total';
  
  if (isService || isAmt || isOthers || isFriendly || isSubTotal) {
    console.log(`${i.toString().padStart(3)}: ${line}`);
  }
  if (isOthers) break;
}

// Now the correct algorithm:
// Key insight from the PDF structure:
// Pattern A (most blocks): amount appears BEFORE next header (inside the block), then AGAIN after next header (Sub Total)
// Pattern B (some blocks): amount ONLY appears after next header (Sub Total only)
//
// The Sub Total (first amount after a new header) is always the definitive amount for the PREVIOUS block.
// So: when we see a new header, the FIRST non-zero amount we see belongs to the PREVIOUS block.
// After that, amounts belong to the CURRENT block.

console.log('\n=== NEW ALGORITHM SIMULATION ===');
const blocks = [];
let currentBlock = null;
let waitingForSubTotal = false; // true when we need the next amount for previousBlock
let previousBlock = null;

for (let i = 0; i < compactLines.length; i++) {
  const line = compactLines[i];
  if (isPageHeader(line)) continue;
  
  const serviceMatch = line.match(/^(Broadband|Corporate)\s+-\s+(\d+)$/);
  if (serviceMatch) {
    // When we see a new header, the NEXT amount is the Sub Total for the current block
    previousBlock = currentBlock;
    waitingForSubTotal = true; // next amount belongs to previousBlock
    
    currentBlock = {
      category: serviceMatch[1],
      serviceNumber: serviceMatch[2],
      address: '', friendlyName: '', plan: '', amount: 0
    };
    continue;
  }
  
  if (/^Others\s+-\s+\d+$/.test(line)) {
    // Flush current block (it already has its amount from before this line)
    if (currentBlock?.serviceNumber && currentBlock.amount > 0) {
      blocks.push({...currentBlock});
    }
    break;
  }
  
  const amtMatch = line.match(/^\$([\d,]+\.\d{2})$/);
  if (amtMatch) {
    const val = parseFloat(amtMatch[1].replace(/,/g, ''));
    if (val > 0) {
      if (waitingForSubTotal && previousBlock) {
        // This is the Sub Total for the previous block
        previousBlock.amount = val;
        blocks.push({...previousBlock});
        previousBlock = null;
        waitingForSubTotal = false;
      } else if (currentBlock) {
        // This amount belongs to the current block
        if (currentBlock.amount === 0) currentBlock.amount = val;
      }
    }
    continue;
  }
  
  if (!currentBlock) continue;
  if (!currentBlock.address && /^[A-Z0-9\/\s,.-]+(?:QLD|NSW|VIC|SA|WA|TAS|NT|ACT)\s+\d{4}$/.test(line)) { currentBlock.address = line; continue; }
  if (!currentBlock.friendlyName && /^\([^)]+\)$/.test(line)) { currentBlock.friendlyName = line.slice(1,-1).trim(); continue; }
  if (line.startsWith('AVC ID -')) { currentBlock.avcId = line.replace('AVC ID -', '').trim(); continue; }
}

// Flush last block
if (currentBlock?.serviceNumber && currentBlock.amount > 0) blocks.push({...currentBlock});

console.log('Blocks found:', blocks.length);
for (const b of blocks) {
  const amtExGst = Math.round((b.amount / 1.1) * 100) / 100;
  console.log(b.serviceNumber, '|', (b.friendlyName || b.address || '').substring(0,25).padEnd(25), '| $' + b.amount + ' inc | $' + amtExGst + ' ex');
}

const total = blocks.reduce((s,b) => s + b.amount, 0);
console.log('\nSum (inc GST):', total.toFixed(2), '| Expected: 7394.67 (minus Others $71.17 = $7323.50 for services)');
