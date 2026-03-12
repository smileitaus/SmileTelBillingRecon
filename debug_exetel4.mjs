import { execSync } from 'child_process';

const text = execSync('pdftotext /home/ubuntu/upload/ExetelFeb.pdf -', {encoding:'utf8'});
const compact = t => t.split('\n').map(l=>l.trim()).filter(l=>l.length>0).join('\n');

const summaryStart = text.indexOf('Your Service Summary');
const summaryText = text.slice(summaryStart);
const compactLines = compact(summaryText).split('\n');

const isPageHeader = l => /^(Home:|Copyright|Level 9|Sydney NSW|ABN 35|Page \d+ of \d+|Powered by TCPDF)/.test(l);

// CORRECT ALGORITHM:
// The "Sub Total" line is the key anchor.
// The amount AFTER "Sub Total" is the definitive total for the most recently completed service block.
// A service block is "completed" when "Sub Total" appears.
// The Sub Total can appear AFTER the next service header (page break pattern).
//
// State machine:
// - Track currentBlock (being built)
// - Track subTotalOwner (the block whose Sub Total we're waiting for)
// - When "Sub Total" is seen, the next amount belongs to subTotalOwner
// - When a new service header is seen, subTotalOwner = currentBlock (unless already set)

const blocks = [];
let currentBlock = null;
let subTotalOwner = null; // block waiting for its Sub Total amount
let waitingForSubTotalAmount = false; // true when "Sub Total" line was just seen

for (let i = 0; i < compactLines.length; i++) {
  const line = compactLines[i];
  if (isPageHeader(line)) continue;
  
  const serviceMatch = line.match(/^(Broadband|Corporate)\s+-\s+(\d+)$/);
  if (serviceMatch) {
    // If we haven't seen a Sub Total for the current block yet, it will come after this header
    if (currentBlock && !subTotalOwner) {
      subTotalOwner = currentBlock;
    }
    currentBlock = {
      category: serviceMatch[1],
      serviceNumber: serviceMatch[2],
      address: '', friendlyName: '', plan: '', amount: 0
    };
    continue;
  }
  
  if (/^Others\s+-\s+\d+$/.test(line)) {
    // Flush current block
    if (currentBlock?.serviceNumber && currentBlock.amount > 0) {
      blocks.push({...currentBlock});
    }
    break;
  }
  
  // "Sub Total" line - the NEXT amount belongs to subTotalOwner (or currentBlock if no subTotalOwner)
  if (line === 'Sub Total') {
    waitingForSubTotalAmount = true;
    if (!subTotalOwner) subTotalOwner = currentBlock;
    continue;
  }
  
  const amtMatch = line.match(/^\$([\d,]+\.\d{2})$/);
  if (amtMatch) {
    const val = parseFloat(amtMatch[1].replace(/,/g, ''));
    if (val > 0) {
      if (waitingForSubTotalAmount && subTotalOwner) {
        // This is the Sub Total amount for subTotalOwner
        subTotalOwner.amount = val;
        blocks.push({...subTotalOwner});
        subTotalOwner = null;
        waitingForSubTotalAmount = false;
      } else if (currentBlock && currentBlock.amount === 0) {
        // Intermediate amount - store in current block (may be overridden by Sub Total)
        currentBlock.amount = val;
      }
    }
    continue;
  }
  
  if (!currentBlock) continue;
  if (!currentBlock.address && /^[A-Z0-9\/\s,.-]+(?:QLD|NSW|VIC|SA|WA|TAS|NT|ACT)\s+\d{4}$/.test(line)) { currentBlock.address = line; continue; }
  if (!currentBlock.friendlyName && /^\([^)]+\)$/.test(line)) { currentBlock.friendlyName = line.slice(1,-1).trim(); continue; }
  if (line.startsWith('AVC ID -')) { currentBlock.avcId = line.replace('AVC ID -', '').trim(); continue; }
}

// Flush last block if it has an amount
if (currentBlock?.serviceNumber && currentBlock.amount > 0) blocks.push({...currentBlock});

console.log('Blocks found:', blocks.length);
for (const b of blocks) {
  const amtExGst = Math.round((b.amount / 1.1) * 100) / 100;
  console.log(b.serviceNumber, '|', (b.friendlyName || b.address || '').substring(0,25).padEnd(25), '| $' + b.amount + ' inc | $' + amtExGst + ' ex');
}

const total = blocks.reduce((s,b) => s + b.amount, 0);
console.log('\nSum (inc GST):', total.toFixed(2));
console.log('Expected service totals: 109+374+374+675+1300+800+350+825+935+387+313.50+805 = 7247.50');
