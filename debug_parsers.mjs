import { execSync } from 'child_process';

const compact = t => t.split('\n').map(l=>l.trim()).filter(l=>l.length>0).join('\n');

// Debug Vine Direct
console.log('=== VINE DIRECT DEBUG ===');
const vdText = execSync('pdftotext /home/ubuntu/upload/VineDirectFeb.pdf -', {encoding:'utf8'});
const vdCompact = compact(vdText);
const vdLines = vdCompact.split('\n');

// Find Invoice Date
const idxInvoiceDate = vdLines.findIndex(l => l.includes('Invoice Date'));
console.log('Invoice Date line idx:', idxInvoiceDate, ':', vdLines[idxInvoiceDate]);
console.log('Next line:', vdLines[idxInvoiceDate + 1]);
console.log('Next 2 lines:', vdLines[idxInvoiceDate + 2]);

// Test date regex
const dateMatch1 = vdText.match(/Invoice Date\s*\n\s*(\d{2}-\d{2}-\d{4})/);
const dateMatch2 = vdCompact.match(/Invoice Date\n(\d{2}-\d{2}-\d{4})/);
console.log('dateMatch1:', dateMatch1?.[1]);
console.log('dateMatch2:', dateMatch2?.[1]);

// Find Charges
const idxCharges = vdLines.findIndex(l => l === 'Charges');
console.log('\nCharges line idx:', idxCharges, ':', vdLines[idxCharges]);
console.log('Next line:', vdLines[idxCharges + 1]);
console.log('Next 2 lines:', vdLines[idxCharges + 2]);

// Test charges regex
const chargesMatch1 = vdText.match(/Charges\s*\n\s*A\$([\d,]+\.\d{2})/);
const chargesMatch2 = vdCompact.match(/Charges\nA\$([\d,]+\.\d{2})/);
console.log('chargesMatch1:', chargesMatch1?.[1]);
console.log('chargesMatch2:', chargesMatch2?.[1]);

// Debug Infinet
console.log('\n=== INFINET DEBUG ===');
const infText = execSync('pdftotext /home/ubuntu/upload/InfinetMar.pdf -', {encoding:'utf8'});
const infLines = compact(infText).split('\n');
const infinetPattern = /^In[fﬁ]i?NET\s+(.+)/;
for (let i = 0; i < infLines.length; i++) {
  const m = infLines[i].match(infinetPattern);
  if (!m) continue;
  let description = m[1].trim().replace(/\s*\([^)]+\)\s*$/, '').trim();
  const isVoice = description.toLowerCase().includes('voip') || description.toLowerCase().includes('voice');
  console.log(`Line ${i}: "${infLines[i]}" | desc="${description}" | isVoice=${isVoice}`);
  // Look ahead for amount
  let amountIncGst = 0;
  for (let j = i + 1; j < Math.min(i + 15, infLines.length); j++) {
    const l = infLines[j];
    const amountMatch = l.match(/^([\d,]+\.\d{2})\s*\$$/) || l.match(/^\$\s*([\d,]+\.\d{2})$/);
    if (amountMatch) { const val = parseFloat(amountMatch[1].replace(/,/g, '')); if (val > amountIncGst) amountIncGst = val; }
    if (l.match(/^In[fﬁ]i?NET\s/) || l.match(/^Total Exclusive:/) || l.match(/^INFINET BROADBAND/) || l.match(/^Voice categories/)) break;
  }
  console.log(`  amountIncGst=${amountIncGst} | skip=${amountIncGst === 0 && isVoice && description.match(/^\d+$/) ? 'YES' : 'NO'}`);
}

// Debug Blitznet
console.log('\n=== BLITZNET DEBUG ===');
const blText = execSync('pdftotext /home/ubuntu/upload/BlitznetMar.pdf -', {encoding:'utf8'});
const blLines = compact(blText).split('\n');
const staticIpIdx = blLines.findIndex(l => l.toLowerCase().includes('manually assigned ip') || l.toLowerCase().includes('static ip'));
const planLineIdx = blLines.findIndex(l => l.toLowerCase().startsWith('blitznet') && l.toLowerCase().includes('mbps'));
console.log('planLineIdx:', planLineIdx, ':', blLines[planLineIdx]);
console.log('staticIpIdx:', staticIpIdx, ':', blLines[staticIpIdx]);
if (staticIpIdx >= 0) {
  console.log('Lines after staticIp:');
  for (let i = staticIpIdx; i < Math.min(staticIpIdx + 10, blLines.length); i++) {
    console.log(`  ${i}: "${blLines[i]}"`);
  }
}
