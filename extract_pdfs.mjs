import pdfParse from 'pdf-parse';
import { readFileSync } from 'fs';

const files = ['ExetelFeb.pdf','VineDirectFeb.pdf','InfinetMar.pdf','BlitznetMar.pdf'];
for (const f of files) {
  const buf = readFileSync('/home/ubuntu/upload/' + f);
  const data = await pdfParse(buf);
  console.log('=== ' + f + ' (' + data.numpages + ' pages) ===');
  console.log(data.text);
  console.log('---END---\n');
}
