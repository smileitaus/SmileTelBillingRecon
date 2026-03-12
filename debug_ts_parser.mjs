import { execSync } from 'child_process';

const text = execSync('pdftotext /home/ubuntu/upload/ExetelFeb.pdf -', {encoding:'utf8'});
const compact = t => t.split('\n').map(l=>l.trim()).filter(l=>l.length>0).join('\n');
const summaryStart = text.indexOf('Your Service Summary');
const compactLines = compact(text.slice(summaryStart)).split('\n');

const isPageHeader = l => /^(Home:|Copyright|Level 9|Sydney NSW|ABN 35|Page \d+ of \d+|Powered by TCPDF)/.test(l);
const isServiceHeader = l => /^(Broadband|Corporate)\s+-\s+\d+$/.test(l);

// Pass 1: collect all service block headers with their firstPlanLine
const headers = [];
for (let i = 0; i < compactLines.length; i++) {
  const line = compactLines[i];
  if (isPageHeader(line)) continue;
  const m = line.match(/^(Broadband|Corporate)\s+-\s+(\d+)$/);
  if (m) {
    let firstPlanLine = -1;
    for (let j = i + 1; j < compactLines.length; j++) {
      if (isPageHeader(compactLines[j])) continue;
      if (isServiceHeader(compactLines[j])) break;
      if (/^Others\s+-\s+\d+$/.test(compactLines[j])) break;
      if (/^(Monthly Charge|Anniversary billing|Monthly Internet Charge)/.test(compactLines[j])) {
        firstPlanLine = j;
        break;
      }
    }
    const fpl = firstPlanLine >= 0 ? firstPlanLine : i + 5;
    headers.push({ lineIdx: i, category: m[1], serviceNumber: m[2], firstPlanLine: fpl });
    console.log(`Header ${m[2]} at line ${i}, firstPlanLine=${fpl} (raw=${firstPlanLine})`);
  }
  if (/^Others\s+-\s+\d+$/.test(line)) {
    headers.push({ lineIdx: i, category: 'Others', serviceNumber: 'END', firstPlanLine: i });
    console.log(`Others at line ${i}`);
    break;
  }
}

// Pass 2: find amounts
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

console.log('\n=== AMOUNTS ===');
const serviceHeaders = headers.filter(h => h.category !== 'Others');
for (let hi = 0; hi < serviceHeaders.length; hi++) {
  const h = serviceHeaders[hi];
  const nextH = serviceHeaders[hi + 1] || headers.find(h2 => h2.category === 'Others');
  const subTotalEndLine = nextH ? nextH.firstPlanLine : compactLines.length;
  const amount = findLastSubTotalAmount(h.lineIdx, subTotalEndLine);
  console.log(`${h.serviceNumber}: amount=$${amount}, range=[${h.lineIdx}, ${subTotalEndLine})`);
}
