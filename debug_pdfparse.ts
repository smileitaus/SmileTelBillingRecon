import { PDFParse } from "pdf-parse";
import * as fs from "fs";

const pdfs = [
  { name: "Vine Direct", path: "/home/ubuntu/upload/VineDirectFeb.pdf" },
  { name: "Infinet", path: "/home/ubuntu/upload/InfinetMar.pdf" },
  { name: "Exetel", path: "/home/ubuntu/upload/ExetelFeb.pdf" },
];

async function main() {
  for (const { name, path } of pdfs) {
    console.log(`\n=== ${name} ===`);
    const buffer = fs.readFileSync(path);
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    const text = result.text;
    
    // Show first 100 chars and key patterns
    console.log("First 200 chars:", JSON.stringify(text.substring(0, 200)));
    console.log("Has 'Exetel':", text.includes("Exetel"));
    console.log("Has 'exetel.com.au':", text.includes("exetel.com.au"));
    console.log("Has 'VINE DIRECT':", text.includes("VINE DIRECT"));
    console.log("Has 'INFINET BROADBAND':", text.includes("INFINET BROADBAND"));
    
    if (name === "Vine Direct") {
      // Check customer block pattern
      const compact = (t: string) => t.split('\n').map(l=>l.trim()).filter(l=>l.length>0).join('\n');
      const ct = compact(text);
      const lines = ct.split('\n');
      console.log("\nLines 55-70:");
      for (let i = 55; i <= 70 && i < lines.length; i++) {
        console.log(`  ${i}: "${lines[i]}"`);
      }
      // Test customer regex
      const custRe = /^(.+?)\s+\((\d{7})\)\s+(.+)$/;
      for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(custRe);
        if (m) console.log(`  Customer match at ${i}: name="${m[1]}", id="${m[2]}", addr="${m[3]}"`);
      }
    }
    
    if (name === "Infinet") {
      const compact = (t: string) => t.split('\n').map(l=>l.trim()).filter(l=>l.length>0).join('\n');
      const ct = compact(text);
      const lines = ct.split('\n');
      const infinetPattern = /^In[fﬁ]i?NET\s+(.+)/;
      for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(infinetPattern);
        if (!m) continue;
        console.log(`\nLine ${i}: "${lines[i]}"`);
        // Look ahead for amount
        for (let j = i + 1; j < Math.min(i + 15, lines.length); j++) {
          const l = lines[j];
          const amountMatch = l.match(/^([\d,]+\.\d{2})\s*\$$/) || l.match(/^\$\s*([\d,]+\.\d{2})$/);
          if (amountMatch) console.log(`  Amount at ${j}: ${amountMatch[1]}`);
          if (l.match(/^In[fﬁ]i?NET\s/) || l.match(/^Total Exclusive:/) || l.match(/^INFINET BROADBAND/) || l.match(/^Voice categories/)) { console.log(`  STOP at ${j}: "${l}"`); break; }
        }
      }
    }
    
    if (name === "Exetel") {
      console.log("\nLooking for 'Your Service Summary':", text.includes("Your Service Summary"));
      console.log("Looking for 'Total Owing':", text.includes("Total Owing"));
      const compact = (t: string) => t.split('\n').map(l=>l.trim()).filter(l=>l.length>0).join('\n');
      const ct = compact(text);
      const totalStr = ct.match(/Total Owing:\n\$([\d,]+\.\d{2})/);
      console.log("Total Owing match:", totalStr?.[1]);
      // Show first 500 chars of compact
      console.log("Compact first 500:", ct.substring(0, 500));
    }
  }
}

main();
