import { execSync } from 'child_process';

const text = execSync('pdftotext /home/ubuntu/upload/ExetelFeb.pdf -', {encoding:'utf8'});
const compact = t => t.split('\n').map(l=>l.trim()).filter(l=>l.length>0).join('\n');
const summaryStart = text.indexOf('Your Service Summary');
const compactLines = compact(text.slice(summaryStart)).split('\n');
const isPageHeader = l => /^(Home:|Copyright|Level 9|Sydney NSW|ABN 35|Page \d+ of \d+|Powered by TCPDF)/.test(l);
const isServiceHeader = l => /^(Broadband|Corporate)\s+-\s+\d+$/.test(l);

// BCG backup: header at line 6
// 0403182994 header at line 34, firstPlanLine = 34+5=39 (no plan line found)
const startLine = 6, endLine = 39;
console.log('findLastSubTotalAmount(6, 39):');
let lastSubTotalLine = -1;
for (let i = startLine; i < endLine; i++) {
  if (isPageHeader(compactLines[i])) continue;
  if (compactLines[i] === 'Sub Total') { lastSubTotalLine = i; console.log('  Found Sub Total at line', i, ':', compactLines[i]); }
}
console.log('lastSubTotalLine:', lastSubTotalLine);
if (lastSubTotalLine >= 0) {
  for (let j = lastSubTotalLine + 1; j < Math.min(endLine + 10, compactLines.length); j++) {
    const line = compactLines[j];
    const isPage = isPageHeader(line);
    const isSvcHdr = isServiceHeader(line);
    const amtM = line.match(/^\$([\d,]+\.\d{2})$/);
    const isFriendly = /^\([^)]+\)$/.test(line);
    const isAddress = /^[A-Z0-9\/\s,.-]+(?:QLD|NSW|VIC|SA|WA|TAS|NT|ACT)\s+\d{4}$/.test(line);
    console.log(`  j=${j}: "${line}" | page=${isPage} | svcHdr=${isSvcHdr} | amt=${amtM?.[1]} | friendly=${isFriendly} | addr=${isAddress}`);
    if (isPage) continue;
    if (isSvcHdr) continue;
    if (amtM) { console.log('  FOUND AMOUNT:', amtM[1]); break; }
    if (!isFriendly && !isAddress) { console.log('  STOP'); break; }
  }
}

console.log('\nLines 26-45:');
for (let i = 26; i <= 45; i++) {
  console.log(i + ': "' + compactLines[i] + '"');
}
