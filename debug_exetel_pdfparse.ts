import { PDFParse } from "pdf-parse";
import * as fs from "fs";

const compact = (t: string) => t.split('\n').map(l=>l.trim()).filter(l=>l.length>0).join('\n');

async function main() {
  const buffer = fs.readFileSync("/home/ubuntu/upload/ExetelFeb.pdf");
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  const text = result.text;
  
  const summaryStart = text.indexOf("Your Service Summary");
  console.log("summaryStart:", summaryStart);
  
  if (summaryStart >= 0) {
    const summaryText = text.slice(summaryStart);
    const compactLines = compact(summaryText).split('\n');
    console.log("Total compact lines:", compactLines.length);
    
    // Show first 50 lines
    console.log("\nFirst 50 lines of service summary:");
    for (let i = 0; i < Math.min(50, compactLines.length); i++) {
      console.log(`${i}: "${compactLines[i]}"`);
    }
    
    // Check for service headers
    const isServiceHeader = (l: string) => /^(Broadband|Corporate)\s+-\s+\d+$/.test(l);
    const headers = compactLines.filter(isServiceHeader);
    console.log("\nService headers found:", headers.length);
    headers.forEach(h => console.log(`  "${h}"`));
  }
}

main();
