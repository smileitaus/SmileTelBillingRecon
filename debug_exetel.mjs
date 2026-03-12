import { execSync } from 'child_process';

const text = execSync('pdftotext /home/ubuntu/upload/ExetelFeb.pdf -', {encoding:'utf8'});
const compact = t => t.split('\n').map(l=>l.trim()).filter(l=>l.length>0).join('\n');

const ct = compact(text);

// Test invoice number
const invMatch = ct.match(/Invoice Number:\n(?:[^\n]*\n){0,3}(E\d+)/);
console.log('Invoice number:', invMatch?.[1]);

// Test total
const totalStr = ct.match(/Total Owing:\n\$([\d,]+\.\d{2})/);
console.log('Total:', totalStr?.[1]);

// Test date
const dateMatches = [];
const dateRe = /Date of Issue:\n([^\n]+)/g;
let dateM;
while ((dateM = dateRe.exec(ct)) !== null) {
  const candidate = dateM[1].trim();
  if (/^\d{1,2}\s+\w+\s+\d{4}$/.test(candidate)) dateMatches.push(candidate);
}
console.log('Date:', dateMatches[0]);

// Test service blocks with new state machine
const summaryStart = text.indexOf('Your Service Summary');
const summaryText = text.slice(summaryStart);
const compactLines = compact(summaryText).split('\n');

const isPageHeader = l => /^(Home:|Copyright|Level 9|Sydney NSW|ABN 35|Page \d+ of \d+|Powered by TCPDF)/.test(l);

const blocks = [];
let currentBlock = null;
let previousBlock = null;
let inRecurring = false;
let amountsSinceHeader = [];

function finaliseBlock(block, amount) {
  if (!block?.serviceNumber || amount === 0) return;
  block.amount = amount;
  blocks.push({...block});
}

for (let i = 0; i < compactLines.length; i++) {
  const line = compactLines[i];
  if (isPageHeader(line)) continue;
  
  const serviceMatch = line.match(/^(Broadband|Corporate)\s+-\s+(\d+)$/);
  if (serviceMatch) {
    if (previousBlock) {
      const amt = amountsSinceHeader.find(v => v > 0) || 0;
      finaliseBlock(previousBlock, amt);
    }
    previousBlock = currentBlock;
    currentBlock = { category: serviceMatch[1], serviceNumber: serviceMatch[2], address: '', friendlyName: '', plan: '', amount: 0 };
    inRecurring = false;
    amountsSinceHeader = [];
    continue;
  }
  
  if (/^Others\s+-\s+\d+$/.test(line)) {
    if (previousBlock) {
      const amt = amountsSinceHeader.find(v => v > 0) || 0;
      finaliseBlock(previousBlock, amt);
    }
    if (currentBlock?.serviceNumber && (currentBlock.amount || 0) > 0) blocks.push({...currentBlock});
    currentBlock = null; previousBlock = null;
    break;
  }
  
  const amtMatch = line.match(/^\$([\d,]+\.\d{2})$/);
  if (amtMatch) {
    const val = parseFloat(amtMatch[1].replace(/,/g, ''));
    if (val > 0) {
      amountsSinceHeader.push(val);
      if (previousBlock && (previousBlock.amount || 0) === 0) {
        previousBlock.amount = val;
        finaliseBlock(previousBlock, val);
        previousBlock = null;
      } else if (currentBlock && (currentBlock.amount || 0) === 0) {
        currentBlock.amount = val;
      }
    }
    continue;
  }
  
  if (!currentBlock) continue;
  if (!currentBlock.address && /^[A-Z0-9\/\s,.-]+(?:QLD|NSW|VIC|SA|WA|TAS|NT|ACT)\s+\d{4}$/.test(line)) { currentBlock.address = line; continue; }
  if (!currentBlock.friendlyName && /^\([^)]+\)$/.test(line)) { currentBlock.friendlyName = line.slice(1,-1).trim(); continue; }
  if (line.startsWith('AVC ID -')) { currentBlock.avcId = line.replace('AVC ID -', '').trim(); continue; }
  if (line === 'Recurring monthly charge:') { inRecurring = true; continue; }
  if (!inRecurring) continue;
  if (!currentBlock.plan && !/^\d{1,2}\s+\w+\s+\d{4}/.test(line) && !/^\$[\d,]+\.\d{2}$/.test(line) && !/^Sub Total/.test(line) && !/^Monthly Charge For Support/.test(line) && !/^Anniversary billing/.test(line) && line.length > 5) {
    currentBlock.plan = line;
  }
}
if (previousBlock) {
  const amt = amountsSinceHeader.find(v => v > 0) || 0;
  finaliseBlock(previousBlock, amt);
}
if (currentBlock?.serviceNumber && (currentBlock.amount || 0) > 0) blocks.push({...currentBlock});

console.log('\nBlocks found:', blocks.length);
for (const b of blocks) {
  const amtExGst = Math.round((b.amount / 1.1) * 100) / 100;
  console.log(b.serviceNumber, '|', (b.friendlyName || b.address || '').substring(0,25).padEnd(25), '| $' + b.amount + ' inc | $' + amtExGst + ' ex | plan:', (b.plan||'').substring(0,35));
}

const total = blocks.reduce((s,b) => s + b.amount, 0);
console.log('\nSum of all service amounts (inc GST):', total.toFixed(2));
