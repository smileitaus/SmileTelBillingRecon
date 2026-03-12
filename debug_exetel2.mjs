import { execSync } from 'child_process';

const text = execSync('pdftotext /home/ubuntu/upload/ExetelFeb.pdf -', {encoding:'utf8'});
const compact = t => t.split('\n').map(l=>l.trim()).filter(l=>l.length>0).join('\n');

const summaryStart = text.indexOf('Your Service Summary');
const summaryText = text.slice(summaryStart);
const compactLines = compact(summaryText).split('\n');

const isPageHeader = l => /^(Home:|Copyright|Level 9|Sydney NSW|ABN 35|Page \d+ of \d+|Powered by TCPDF)/.test(l);

// Print the compact lines with line numbers to trace the state machine
console.log('=== COMPACT SUMMARY LINES ===');
for (let i = 0; i < compactLines.length; i++) {
  const line = compactLines[i];
  const isHeader = isPageHeader(line);
  const isService = /^(Broadband|Corporate)\s+-\s+(\d+)$/.test(line);
  const isAmt = /^\$([\d,]+\.\d{2})$/.test(line);
  const isOthers = /^Others\s+-\s+\d+$/.test(line);
  
  let tag = '';
  if (isHeader) tag = '[SKIP]';
  else if (isService) tag = '[SERVICE]';
  else if (isAmt) tag = '[AMOUNT]';
  else if (isOthers) tag = '[OTHERS]';
  
  if (tag || i < 5 || isService || isAmt) {
    console.log(`${i.toString().padStart(3)}: ${tag.padEnd(10)} ${line.substring(0,60)}`);
  }
}
