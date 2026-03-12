import { parsePdfInvoice } from "./server/pdfInvoiceParser";
import * as fs from "fs";

const pdfs = [
  { name: "Vine Direct", path: "/home/ubuntu/upload/VineDirectFeb.pdf" },
  { name: "Infinet", path: "/home/ubuntu/upload/InfinetMar.pdf" },
  { name: "Blitznet", path: "/home/ubuntu/upload/BlitznetMar.pdf" },
  { name: "Exetel", path: "/home/ubuntu/upload/ExetelFeb.pdf" },
];

async function main() {
  for (const { name, path } of pdfs) {
    console.log(`\n=== ${name} ===`);
    try {
      const buffer = fs.readFileSync(path);
      const result = await parsePdfInvoice(buffer);
      console.log(`Invoice: ${result.invoiceNumber} | Date: ${result.invoiceDate} | Total: $${result.totalIncGst}`);
      console.log(`Services: ${result.services.length}`);
      for (const s of result.services) {
        console.log(`  ${s.serviceId?.substring(0,20).padEnd(20)} | ${s.friendlyName.substring(0,30).padEnd(30)} | $${s.amountExGst} ex GST`);
      }
      const sum = result.services.reduce((a, s) => a + s.amountExGst, 0);
      console.log(`Sum ex GST: $${sum.toFixed(2)} | Expected ex GST: $${(result.totalIncGst / 1.1).toFixed(2)}`);
    } catch (e: any) {
      console.error(`Error: ${e.message}`);
    }
  }
}

main();
