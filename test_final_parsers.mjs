import { execSync } from 'child_process';

const compact = t => t.split('\n').map(l=>l.trim()).filter(l=>l.length>0).join('\n');

// ── Vine Direct ──────────────────────────────────────────────────────────────
function parseVineDirect(text) {
  const invMatch = text.match(/Invoice\s*#\s*(\d+)/);
  const invoiceNumber = invMatch?.[1] ? `VD-${invMatch[1]}` : 'UNKNOWN';
  const dateMatch = text.match(/Invoice Date\s*\n\s*(\d{2}-\d{2}-\d{4})/);
  const invoiceDate = dateMatch?.[1] || '';
  const totalMatch = text.match(/Total due by[^\n]+\n\s*A\$([\d,]+\.\d{2})/) ||
                     text.match(/Total due by[^\n]+\s+A\$([\d,]+\.\d{2})/);
  const totalIncGst = parseFloat((totalMatch?.[1] || '0').replace(/,/g, ''));

  const compactText = compact(text);
  const lines = compactText.split('\n');
  const customerBlocks = [];
  const custRe = /^(.+?)\s+\((\d{7})\)\s+(.+)$/;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(custRe);
    if (m) {
      let address = m[3].trim();
      if (i + 1 < lines.length && /^(QLD|NSW|VIC|SA|WA|TAS|NT|ACT)\s+\d{4}$/.test(lines[i + 1])) address += ' ' + lines[i + 1];
      customerBlocks.push({ name: m[1].trim(), accountId: m[2], address, lineIdx: i });
    }
  }
  const serviceRe = /^(VW-[A-Z0-9-]+):\s*(.+?)\s+x\s+\d+$/;
  let productCode = '', serviceDescription = '', totalAmountIncGst = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(serviceRe);
    if (!m) continue;
    productCode = m[1]; serviceDescription = m[2].trim();
    for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
      const amtM = lines[j].match(/^A\$([\d,]+\.\d{2})$/);
      if (amtM) { totalAmountIncGst = parseFloat(amtM[1].replace(/,/g, '')); break; }
    }
    break;
  }
  if (totalAmountIncGst === 0) totalAmountIncGst = totalIncGst;
  const services = [];
  if (customerBlocks.length > 0) {
    const perCustomerAmount = Math.round((totalAmountIncGst / customerBlocks.length) * 100) / 100;
    for (const cb of customerBlocks) {
      const amountExGst = Math.round((perCustomerAmount / 1.1) * 100) / 100;
      services.push({ friendlyName: cb.name, serviceId: `vinedirect_${cb.accountId}`, amountExGst, description: productCode ? `${productCode}: ${serviceDescription}` : 'Vine Direct Internet', address: cb.address });
    }
  }
  return { supplier: 'VineDirect', invoiceNumber, invoiceDate, totalIncGst, services };
}

// ── Infinet ──────────────────────────────────────────────────────────────────
function parseInfinet(text) {
  const invMatch = text.match(/Tax Invoice No\.:\s*\n?\s*(\S+)/);
  const invoiceNumber = invMatch?.[1] || 'UNKNOWN';
  const dateMatch = text.match(/Date:\s*\n?\s*(\d{2}\/\d{2}\/\d{4})/);
  const invoiceDate = dateMatch?.[1] || '';
  const totalMatch = text.match(/Total due:\s*([\d,]+\.\d{2})\s*\$/) || text.match(/TOTAL:\s*\n?\s*([\d,]+\.\d{2})\s*\$/);
  const totalIncGst = parseFloat((totalMatch?.[1] || '0').replace(/,/g, ''));
  const services = [];
  const lines = compact(text).split('\n');
  const infinetPattern = /^In[fﬁ]i?NET\s+(.+)/;
  for (let i = 0; i < lines.length; i++) {
    const lineMatch = lines[i].match(infinetPattern);
    if (!lineMatch) continue;
    let description = lineMatch[1].trim();
    if (description.toLowerCase() === 'broadband') continue;
    if (description.toLowerCase().includes('accounts on 1300')) continue;
    description = description.replace(/\s*\([^)]+\)\s*$/, '').trim();
    let serviceType = 'Internet';
    if (description.toLowerCase().includes('voip') || description.toLowerCase().includes('voice')) serviceType = 'Voice';
    let address, avcId, amountIncGst = 0;
    for (let j = i + 1; j < Math.min(i + 15, lines.length); j++) {
      const l = lines[j];
      if (l.startsWith('Service address:')) { address = l.replace('Service address:', '').trim(); continue; }
      if (l.startsWith('AVC ID:')) { avcId = l.replace('AVC ID:', '').trim(); continue; }
      const amountMatch = l.match(/^([\d,]+\.\d{2})\s*\$$/) || l.match(/^\$\s*([\d,]+\.\d{2})$/);
      if (amountMatch) { const val = parseFloat(amountMatch[1].replace(/,/g, '')); if (val > amountIncGst) amountIncGst = val; continue; }
      if (l.match(/^In[fﬁ]i?NET\s/) || l.match(/^Total Exclusive:/) || l.match(/^INFINET BROADBAND/) || l.match(/^Voice categories/)) break;
    }
    if (amountIncGst === 0 && serviceType === 'Voice') continue;
    const amountExGst = Math.round((amountIncGst / 1.1) * 100) / 100;
    const friendlyName = address ? address.replace(/,\s*\d{4}$/, '').trim() : description;
    services.push({ friendlyName, serviceId: `infinet_${invoiceNumber}_${i}`, serviceType, amountExGst, description: `InfiNET ${description}`, avcId, address });
  }
  return { supplier: 'Infinet', invoiceNumber, invoiceDate, totalIncGst, services };
}

// ── Blitznet ──────────────────────────────────────────────────────────────────
function parseBlitznet(text) {
  const invMatch = text.match(/Invoice number:\s*\n?\s*(\S+)/);
  const invoiceNumber = invMatch?.[1] || 'UNKNOWN';
  const dateMatch = text.match(/Date:\s*\n?\s*(\d{2}\/\d{2}\/\d{4})/);
  const invoiceDate = dateMatch?.[1] || '';
  const totalMatch = text.match(/Total:\s*\n?\s*\$\s*([\d,]+\.\d{2})/);
  const totalIncGst = parseFloat((totalMatch?.[1] || '0').replace(/,/g, ''));
  const compactText = compact(text);
  const lines = compactText.split('\n');
  let customerAddress;
  const smileIdx = lines.findIndex(l => l.toLowerCase() === 'smileit');
  if (smileIdx >= 0) {
    const addrLines = [];
    for (let i = smileIdx + 1; i < Math.min(smileIdx + 6, lines.length); i++) {
      const l = lines[i];
      if (l.match(/^\d{4}$/) || l.match(/^Australia$/) || l.match(/^ABN/)) break;
      if (l.includes('Cornwallis') || l.includes('Marrickville')) continue;
      if (l.length > 2) addrLines.push(l);
    }
    if (addrLines.length > 0) customerAddress = addrLines.join(', ');
  }
  const services = [];
  const planLineIdx = lines.findIndex(l => l.toLowerCase().startsWith('blitznet') && l.toLowerCase().includes('mbps'));
  if (planLineIdx >= 0) {
    const planDesc = lines[planLineIdx].trim();
    let amountIncGst = 0;
    for (let i = planLineIdx + 1; i < Math.min(planLineIdx + 10, lines.length); i++) {
      const amtMatch = lines[i].match(/^\$\s*([\d,]+\.\d{2})$/);
      if (amtMatch) { const val = parseFloat(amtMatch[1].replace(/,/g, '')); if (val > amountIncGst) amountIncGst = val; }
    }
    if (amountIncGst === 0) amountIncGst = totalIncGst;
    const amountExGst = Math.round((amountIncGst / 1.1) * 100) / 100;
    services.push({ friendlyName: customerAddress ? customerAddress.replace(/,?\s*\d{4}$/, '').trim() : 'Blitznet Service', serviceId: `blitznet_${invoiceNumber}`, amountExGst, description: planDesc, address: customerAddress });
  }
  return { supplier: 'Blitznet', invoiceNumber, invoiceDate, totalIncGst, services };
}

// Run all tests
const pdfs = [
  { name: 'Vine Direct', path: '/home/ubuntu/upload/VineDirectFeb.pdf', parser: parseVineDirect },
  { name: 'Infinet', path: '/home/ubuntu/upload/InfinetMar.pdf', parser: parseInfinet },
  { name: 'Blitznet', path: '/home/ubuntu/upload/BlitznetMar.pdf', parser: parseBlitznet },
];

for (const { name, path, parser } of pdfs) {
  console.log(`\n=== ${name} ===`);
  try {
    const text = execSync(`pdftotext "${path}" -`, {encoding:'utf8'});
    const result = parser(text);
    console.log(`Invoice: ${result.invoiceNumber} | Date: ${result.invoiceDate} | Total: $${result.totalIncGst}`);
    console.log(`Services: ${result.services.length}`);
    for (const s of result.services) {
      console.log(`  ${s.serviceId} | ${s.friendlyName.substring(0,30).padEnd(30)} | $${s.amountExGst} ex GST | ${s.description?.substring(0,40)}`);
    }
    const sum = result.services.reduce((a,s) => a + s.amountExGst, 0);
    console.log(`Sum ex GST: $${sum.toFixed(2)} | Expected ex GST: $${(result.totalIncGst/1.1).toFixed(2)}`);
  } catch(e) { console.error(`Error: ${e.message}`); }
}
