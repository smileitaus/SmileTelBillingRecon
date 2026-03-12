// Test all four parsers using the same logic as the TypeScript files
import { execSync } from 'child_process';

const compact = t => t.split('\n').map(l=>l.trim()).filter(l=>l.length>0).join('\n');

// ── Exetel ──────────────────────────────────────────────────────────────────
function parseExetel(text) {
  const ct = compact(text);
  const invMatch = ct.match(/Invoice Number:\n(?:[^\n]*\n){0,5}(E\d{8,})/);
  const invoiceNumber = invMatch?.[1] || ct.slice(0, 2000).match(/\b(E\d{8,})\b/)?.[1] || 'UNKNOWN';
  const dateMatches = [];
  const directRe = /\b(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4})\b/g;
  let dm;
  while ((dm = directRe.exec(ct.slice(0, 3000))) !== null) dateMatches.push(dm[1]);
  const invoiceDate = dateMatches[0] || '';
  const totalStr = ct.match(/Total Owing:\n\$([\d,]+\.\d{2})/);
  const totalIncGst = totalStr ? parseFloat(totalStr[1].replace(/,/g, '')) : 0;

  const summaryStart = text.indexOf('Your Service Summary');
  if (summaryStart < 0) return { supplier: 'Exetel', invoiceNumber, invoiceDate, totalIncGst, services: [] };
  const compactLines = compact(text.slice(summaryStart)).split('\n');

  const isPageHeader = l => /^(Home:|Copyright|Level 9|Sydney NSW|ABN 35|Page \d+ of \d+|Powered by TCPDF)/.test(l);
  const isServiceHeader = l => /^(Broadband|Corporate)\s+-\s+\d+$/.test(l);

  const headers = [];
  for (let i = 0; i < compactLines.length; i++) {
    const line = compactLines[i];
    if (isPageHeader(line)) continue;
    const m = line.match(/^(Broadband|Corporate)\s+-\s+(\d+)$/);
    if (m) {
      let firstPlanLine = compactLines.length;
      for (let j = i + 1; j < compactLines.length; j++) {
        if (isPageHeader(compactLines[j])) continue;
        if (isServiceHeader(compactLines[j])) break;
        if (/^Others\s+-\s+\d+$/.test(compactLines[j])) break;
        if (/^(Monthly Charge|Anniversary billing|Monthly Internet Charge)/.test(compactLines[j])) { firstPlanLine = j; break; }
      }
      headers.push({ lineIdx: i, category: m[1], serviceNumber: m[2], firstPlanLine });
    }
    if (/^Others\s+-\s+\d+$/.test(line)) { headers.push({ lineIdx: i, category: 'Others', serviceNumber: 'END', firstPlanLine: i }); break; }
  }

  function findLastSubTotalAmount(startLine, endLine) {
    let lastSubTotalLine = -1;
    for (let i = startLine; i < endLine; i++) {
      if (isPageHeader(compactLines[i])) continue;
      if (compactLines[i] === 'Sub Total') lastSubTotalLine = i;
    }
    if (lastSubTotalLine < 0) return 0;
    for (let j = lastSubTotalLine + 1; j < Math.min(endLine + 10, compactLines.length); j++) {
      if (isPageHeader(compactLines[j])) continue;
      if (isServiceHeader(compactLines[j])) continue;
      const amtM = compactLines[j].match(/^\$([\d,]+\.\d{2})$/);
      if (amtM) return parseFloat(amtM[1].replace(/,/g, ''));
      if (!/^\([^)]+\)$/.test(compactLines[j]) && !/^[A-Z0-9\/\s,.-]+(?:QLD|NSW|VIC|SA|WA|TAS|NT|ACT)\s+\d{4}$/.test(compactLines[j])) break;
    }
    return 0;
  }

  const services = [];
  const serviceHeaders = headers.filter(h => h.category !== 'Others');
  for (let hi = 0; hi < serviceHeaders.length; hi++) {
    const h = serviceHeaders[hi];
    const nextH = serviceHeaders[hi + 1] || headers.find(h2 => h2.category === 'Others');
    const headerEndLine = nextH ? nextH.lineIdx : compactLines.length;
    const subTotalEndLine = nextH ? nextH.firstPlanLine : compactLines.length;
    const amount = findLastSubTotalAmount(h.lineIdx, subTotalEndLine);
    if (amount <= 0) continue;
    
    let address = '', friendlyName = '', plan = '', avcId = undefined;
    let inRecurring = false;
    for (let i = h.lineIdx + 1; i < headerEndLine; i++) {
      const line = compactLines[i];
      if (isPageHeader(line)) continue;
      if (!address && /^[A-Z0-9\/\s,.-]+(?:QLD|NSW|VIC|SA|WA|TAS|NT|ACT)\s+\d{4}$/.test(line)) { address = line; continue; }
      if (!friendlyName && /^\([^)]+\)$/.test(line)) { friendlyName = line.slice(1,-1).trim(); continue; }
      if (line.startsWith('AVC ID -')) { avcId = line.replace('AVC ID -', '').trim(); continue; }
      if (line === 'Recurring monthly charge:') { inRecurring = true; continue; }
      if (!inRecurring) continue;
      if (!plan && !/^\d{1,2}\s+\w+\s+\d{4}/.test(line) && !/^\$[\d,]+\.\d{2}$/.test(line) && !/^Sub Total/.test(line) && !/^Monthly Charge For Support/.test(line) && !/^Anniversary billing/.test(line) && line.length > 5) plan = line;
    }
    services.push({ serviceId: h.serviceNumber, friendlyName: friendlyName || address || h.serviceNumber, amountExGst: Math.round((amount/1.1)*100)/100, plan });
  }
  return { supplier: 'Exetel', invoiceNumber, invoiceDate, totalIncGst, services };
}

// ── Vine Direct ──────────────────────────────────────────────────────────────
function parseVineDirect(text) {
  const ct = compact(text);
  const invMatch = ct.match(/Invoice #:\n([A-Z0-9-]+)/);
  const invoiceNumber = invMatch?.[1] || 'UNKNOWN';
  const dateMatch = ct.match(/Invoice Date:\n(\d{2}\/\d{2}\/\d{4})/);
  const invoiceDate = dateMatch?.[1] || '';
  const totalMatch = ct.match(/Total:\n\$([\d,]+\.\d{2})/);
  const totalIncGst = totalMatch ? parseFloat(totalMatch[1].replace(/,/g,'')) : 0;
  
  const services = [];
  const lines = ct.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Service lines: "Vine Direct - [plan] - [address]" or similar
    // Look for lines with speed patterns like "250M/250M" or "100/100"
    const speedMatch = line.match(/(\d+[MG]\/\d+[MG]|\d+\/\d+\s*Mbps)/i);
    if (speedMatch) {
      // Find the amount - look ahead for a dollar amount
      let amount = 0;
      let description = line;
      for (let j = i + 1; j <= Math.min(i + 5, lines.length - 1); j++) {
        const amtM = lines[j].match(/\$([\d,]+\.\d{2})/);
        if (amtM) { amount = parseFloat(amtM[1].replace(/,/g,'')); break; }
      }
      if (amount > 0) {
        services.push({ serviceId: '', friendlyName: description.substring(0,50), amountExGst: Math.round((amount/1.1)*100)/100, plan: line });
      }
    }
  }
  return { supplier: 'Vine Direct', invoiceNumber, invoiceDate, totalIncGst, services };
}

// Run tests
console.log('=== EXETEL ===');
try {
  const text = execSync('pdftotext /home/ubuntu/upload/ExetelFeb.pdf -', {encoding:'utf8'});
  const result = parseExetel(text);
  console.log('Invoice:', result.invoiceNumber, '| Date:', result.invoiceDate, '| Total:', result.totalIncGst);
  console.log('Services:', result.services.length);
  for (const s of result.services) {
    console.log(' ', s.serviceId, '|', s.friendlyName.substring(0,25).padEnd(25), '| $' + s.amountExGst + ' ex GST');
  }
  const sum = result.services.reduce((a,s) => a + s.amountExGst, 0);
  console.log('Sum ex GST:', sum.toFixed(2));
} catch(e) { console.error('Exetel error:', e.message); }

console.log('\n=== VINE DIRECT ===');
try {
  const text = execSync('pdftotext /home/ubuntu/upload/VineDirectFeb.pdf -', {encoding:'utf8'});
  const ct = compact(text);
  // Debug: show relevant lines
  const lines = ct.split('\n');
  console.log('First 50 lines:');
  lines.slice(0,50).forEach((l,i) => console.log(i+':', l));
} catch(e) { console.error('Vine Direct error:', e.message); }
