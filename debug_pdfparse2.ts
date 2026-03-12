import { PDFParse } from "pdf-parse";
import * as fs from "fs";

async function main() {
  // Vine Direct
  {
    const buffer = fs.readFileSync("/home/ubuntu/upload/VineDirectFeb.pdf");
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    const text = result.text;
    const compact = (t: string) => t.split('\n').map(l=>l.trim()).filter(l=>l.length>0).join('\n');
    const ct = compact(text);
    const lines = ct.split('\n');
    console.log("=== VINE DIRECT - ALL LINES ===");
    lines.forEach((l, i) => console.log(`${i}: "${l}"`));
  }
  
  // Infinet
  {
    const buffer = fs.readFileSync("/home/ubuntu/upload/InfinetMar.pdf");
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    const text = result.text;
    const compact = (t: string) => t.split('\n').map(l=>l.trim()).filter(l=>l.length>0).join('\n');
    const ct = compact(text);
    const lines = ct.split('\n');
    console.log("\n=== INFINET - LINES 45-75 ===");
    for (let i = 45; i <= 75 && i < lines.length; i++) {
      console.log(`${i}: "${lines[i]}"`);
    }
  }
  
  // Exetel
  {
    const buffer = fs.readFileSync("/home/ubuntu/upload/ExetelFeb.pdf");
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    const text = result.text;
    const compact = (t: string) => t.split('\n').map(l=>l.trim()).filter(l=>l.length>0).join('\n');
    const ct = compact(text);
    const lines = ct.split('\n');
    console.log("\n=== EXETEL - FIRST 20 LINES ===");
    for (let i = 0; i < 20; i++) console.log(`${i}: "${lines[i]}"`);
    
    // Test Total Owing regex
    const totalStr1 = ct.match(/Total Owing:\n\$([\d,]+\.\d{2})/);
    const totalStr2 = ct.match(/Total Amount Due \$([\d,]+\.\d{2})/);
    const totalStr3 = text.match(/Total Owing[:\s]+\$([\d,]+\.\d{2})/);
    console.log("\nTotal Owing match1:", totalStr1?.[1]);
    console.log("Total Amount Due match2:", totalStr2?.[1]);
    console.log("Total Owing match3:", totalStr3?.[1]);
    
    // Test invoice number
    const invMatch1 = ct.match(/Invoice Number:\n(?:[^\n]*\n){0,5}(E\d{8,})/);
    const invMatch2 = ct.slice(0, 2000).match(/\b(E\d{8,})\b/);
    const invMatch3 = ct.match(/Invoice ID[^\n]*\n([^\n]+)/);
    const invMatch4 = ct.match(/Invoice ID[^\s]+\s+(\d+)\s+/);
    console.log("\nInvoice Number match1:", invMatch1?.[1]);
    console.log("Invoice Number match2:", invMatch2?.[1]);
    console.log("Invoice ID match3:", invMatch3?.[1]);
    console.log("Invoice ID match4:", invMatch4?.[1]);
    
    // Show lines around "Invoice ID"
    const idxInv = lines.findIndex(l => l.includes('Invoice ID'));
    console.log(`\nInvoice ID at line ${idxInv}: "${lines[idxInv]}"`);
    if (idxInv >= 0) {
      for (let i = Math.max(0, idxInv-2); i <= Math.min(idxInv+5, lines.length-1); i++) {
        console.log(`  ${i}: "${lines[i]}"`);
      }
    }
  }
}

main();
