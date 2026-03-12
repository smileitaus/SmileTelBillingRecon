/**
 * Test script to verify PDF parsers against actual invoice files.
 * Run: node test_parsers.mjs
 */
import { readFileSync } from 'fs';
import { execSync } from 'child_process';

function extractText(filePath) {
  try {
    return execSync(`pdftotext "${filePath}" -`, { encoding: 'utf8' });
  } catch {
    return '';
  }
}

function compact(text) {
  return text.split('\n').map(l => l.trim()).filter(l => l.length > 0).join('\n');
}

// ── Vine Direct ───────────────────────────────────────────────────────────────
function parseVineDirect(text) {
  const invMatch = text.match(/Invoice\s*#\s*(\d+)/);
  const invoiceNumber = invMatch?.[1] ? `VD-${invMatch[1]}` : "UNKNOWN";
  const dateMatch = text.match(/Invoice Date\s*\n\s*(\d{2}-\d{2}-\d{4})/);
  const invoiceDate = dateMatch?.[1] || "";
  const totalMatch = text.match(/Total due by[^\n]+\s+A\$([\d,]+\.\d{2})/);
  const totalIncGst = parseFloat((totalMatch?.[1] || "0").replace(/,/g, ""));

  const customerBlockRegex = /^([A-Za-z][^\n(]+)\s+\((\d+)\)\s+([^\n]+)/gm;
  const customerBlocks = [];
  let cbMatch;
  while ((cbMatch = customerBlockRegex.exec(text)) !== null) {
    customerBlocks.push({ name: cbMatch[1].trim(), accountId: cbMatch[2], address: cbMatch[3].trim(), offset: cbMatch.index });
  }

  function findCustomerForOffset(offset) {
    let best = { name: customerBlocks[0]?.name || "Unknown", address: customerBlocks[0]?.address || "" };
    for (const cb of customerBlocks) {
      if (cb.offset <= offset) best = { name: cb.name, address: cb.address };
    }
    return best;
  }

  const services = [];
  const compactText = compact(text);
  const serviceLineRegex = /(VW-[A-Z0-9-]+):\s*([^\n]+?)\s+x\s+\d+\nGST\nA\$([\d,]+\.\d{2})/g;
  let match;

  while ((match = serviceLineRegex.exec(compactText)) !== null) {
    const productCode = match[1];
    const description = match[2].trim();
    const amountIncGst = parseFloat(match[3].replace(/,/g, ""));
    const amountExGst = Math.round((amountIncGst / 1.1) * 100) / 100;
    const originalOffset = text.indexOf(productCode);
    const { name: customerName, address } = findCustomerForOffset(originalOffset >= 0 ? originalOffset : 0);
    services.push({ friendlyName: customerName, serviceId: `vinedirect_${productCode.toLowerCase()}`, serviceType: "Internet", amountExGst, description: `${productCode}: ${description}`, address });
  }

  if (services.length === 0) {
    const simpleRegex = /(VW-[A-Z0-9-]+):\s*([^\n]+)/g;
    while ((match = simpleRegex.exec(compactText)) !== null) {
      const productCode = match[1];
      const description = match[2].trim();
      const afterLine = compactText.slice(match.index + match[0].length);
      const amountMatch = afterLine.match(/A\$([\d,]+\.\d{2})/);
      if (!amountMatch) continue;
      const amountIncGst = parseFloat(amountMatch[1].replace(/,/g, ""));
      const amountExGst = Math.round((amountIncGst / 1.1) * 100) / 100;
      const originalOffset = text.indexOf(productCode);
      const { name: customerName, address } = findCustomerForOffset(originalOffset >= 0 ? originalOffset : 0);
      services.push({ friendlyName: customerName, serviceId: `vinedirect_${productCode.toLowerCase()}`, serviceType: "Internet", amountExGst, description: `${productCode}: ${description}`, address });
    }
  }

  return { supplier: "VineDirect", invoiceNumber, invoiceDate, totalIncGst, services };
}

// ── Infinet ───────────────────────────────────────────────────────────────────
function parseInfinet(text) {
  const invMatch = text.match(/Tax Invoice No\.:\s*\n?\s*(\S+)/);
  const invoiceNumber = invMatch?.[1] || "UNKNOWN";
  const dateMatch = text.match(/Date:\s*\n?\s*(\d{2}\/\d{2}\/\d{4})/);
  const invoiceDate = dateMatch?.[1] || "";
  const totalMatch = text.match(/Total due:\s*([\d,]+\.\d{2})\s*\$/) || text.match(/TOTAL:\s*\n?\s*([\d,]+\.\d{2})\s*\$/);
  const totalIncGst = parseFloat((totalMatch?.[1] || "0").replace(/,/g, ""));

  const services = [];
  const lines = compact(text).split('\n');
  const infinetPattern = /^In[fﬁ]i?NET\s+(.+)/;

  for (let i = 0; i < lines.length; i++) {
    const lineMatch = lines[i].match(infinetPattern);
    if (!lineMatch) continue;

    let description = lineMatch[1].trim().replace(/\s*\([^)]+\)\s*$/, "").trim();
    let serviceType = description.toLowerCase().includes("voip") ? "Voice" : "Internet";
    let address, avcId, amountIncGst = 0;

    for (let j = i + 1; j < Math.min(i + 15, lines.length); j++) {
      const l = lines[j];
      if (l.startsWith("Service address:")) {
        address = l.replace("Service address:", "").trim();
        if (j + 1 < lines.length && !lines[j + 1].match(/^(AVC ID:|Service address:|In[fﬁ]i?NET|#|\d+$|\d{2}\/\d{2}\/\d{4})/)) {
          address += " " + lines[j + 1].trim(); j++;
        }
        continue;
      }
      if (l.startsWith("AVC ID:")) { avcId = l.replace("AVC ID:", "").trim(); continue; }
      const amountMatch = l.match(/^([\d,]+\.\d{2})\s*\$$/) || l.match(/^\$\s*([\d,]+\.\d{2})$/);
      if (amountMatch) {
        const val = parseFloat(amountMatch[1].replace(/,/g, ""));
        if (val > amountIncGst) amountIncGst = val;
        continue;
      }
      if (l.match(/^In[fﬁ]i?NET\s/) || l.match(/^Total Exclusive:/) || l.match(/^INFINET BROADBAND/) || l.match(/^Voice categories/)) break;
    }

    if (amountIncGst === 0 && serviceType === "Voice") continue;
    const amountExGst = Math.round((amountIncGst / 1.1) * 100) / 100;
    const friendlyName = address ? address.replace(/,\s*\d{4}$/, "").trim() : description;
    services.push({ friendlyName, serviceId: `infinet_${invoiceNumber}_${i}`, serviceType, amountExGst, description: `InfiNET ${description}`, avcId, address });
  }

  return { supplier: "Infinet", invoiceNumber, invoiceDate, totalIncGst, services };
}

// ── Blitznet ──────────────────────────────────────────────────────────────────
function parseBlitznet(text) {
  const invMatch = text.match(/Invoice number:\s*\n?\s*(\S+)/);
  const invoiceNumber = invMatch?.[1] || "UNKNOWN";
  const dateMatch = text.match(/Date:\s*\n?\s*(\d{2}\/\d{2}\/\d{4})/);
  const invoiceDate = dateMatch?.[1] || "";
  const totalMatch = text.match(/Total:\s*\n?\s*\$\s*([\d,]+\.\d{2})/);
  const totalIncGst = parseFloat((totalMatch?.[1] || "0").replace(/,/g, ""));

  const compactText = compact(text);
  const lines = compactText.split('\n');

  let customerAddress;
  const smileIdx = lines.findIndex(l => l.toLowerCase() === "smileit");
  if (smileIdx >= 0) {
    const addrLines = [];
    for (let i = smileIdx + 1; i < Math.min(smileIdx + 5, lines.length); i++) {
      const l = lines[i];
      if (l.match(/^\d{4}/) || l.match(/Australia/) || l.match(/ABN/)) break;
      if (l.length > 3) addrLines.push(l);
    }
    customerAddress = addrLines.join(", ");
  }

  const services = [];
  const planLineIdx = lines.findIndex(l => l.toLowerCase().startsWith("blitznet") && l.toLowerCase().includes("mbps"));
  if (planLineIdx >= 0) {
    const planDesc = lines[planLineIdx].trim();
    let amountIncGst = 0;
    for (let i = planLineIdx + 1; i < Math.min(planLineIdx + 10, lines.length); i++) {
      const amtMatch = lines[i].match(/^\$\s*([\d,]+\.\d{2})$/);
      if (amtMatch) {
        const val = parseFloat(amtMatch[1].replace(/,/g, ""));
        if (val > amountIncGst) amountIncGst = val;
      }
    }
    if (amountIncGst === 0) amountIncGst = totalIncGst;
    const amountExGst = Math.round((amountIncGst / 1.1) * 100) / 100;
    services.push({ friendlyName: customerAddress ? customerAddress.replace(/,?\s*\d{4}$/, "").trim() : "Blitznet Service", serviceId: `blitznet_${invoiceNumber}`, serviceType: "Internet", amountExGst, description: planDesc, address: customerAddress });
  } else if (totalIncGst > 0) {
    const amountExGst = Math.round((totalIncGst / 1.1) * 100) / 100;
    services.push({ friendlyName: customerAddress ? customerAddress.replace(/,?\s*\d{4}$/, "").trim() : "Blitznet Service", serviceId: `blitznet_${invoiceNumber}`, serviceType: "Internet", amountExGst, description: "BlitzNet Internet Service", address: customerAddress });
  }

  return { supplier: "Blitznet", invoiceNumber, invoiceDate, totalIncGst, services };
}

// ── Exetel PDF ────────────────────────────────────────────────────────────────
function parseExetelPdf(text) {
  const invMatch = text.match(/Invoice Number:\s*\n\s*(E?\d+)/);
  const invoiceNumber = invMatch?.[1] || "UNKNOWN";

  const dateMatches = [];
  const dateRe = /Date of Issue:\s*\n[\s\S]*?(\d{1,2}\s+\w+\s+\d{4})/g;
  let dateM;
  while ((dateM = dateRe.exec(text)) !== null) dateMatches.push(dateM[1]);
  const invoiceDate = dateMatches[1] || dateMatches[0] || "";

  const totalMatch = text.match(/Total Amount Due\s*\n[^\n]*\n[^\n]*\n\s*\$?([\d,]+\.\d{2})/);
  const totalIncGst = parseFloat((totalMatch?.[1] || "0").replace(/,/g, ""));

  const services = [];
  const summaryStart = text.indexOf("Your Service Summary");
  if (summaryStart < 0) return { supplier: "Exetel", invoiceNumber, invoiceDate, totalIncGst, services };

  const summaryText = text.slice(summaryStart);
  const compactSummary = compact(summaryText);
  const lines = compactSummary.split('\n');

  let currentServiceNumber = null, currentCategory = null, currentAddress = null;
  let currentFriendlyName = null, currentAvcId = null, inRecurring = false;
  let currentPlan = null, currentAmount = 0;

  function flushService() {
    if (!currentServiceNumber || currentAmount === 0) return;
    const amountExGst = Math.round((currentAmount / 1.1) * 100) / 100;
    services.push({
      friendlyName: currentFriendlyName || currentAddress || currentServiceNumber,
      serviceId: currentServiceNumber,
      serviceType: "Internet",
      amountExGst,
      description: currentPlan || `${currentCategory} ${currentServiceNumber}`,
      avcId: currentAvcId || undefined,
      address: currentAddress || undefined,
    });
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.match(/^(Home:|Copyright|Level 9|Sydney NSW|ABN 35|Page \d+ of \d+)/) || line.match(/^Powered by TCPDF/)) continue;

    const serviceMatch = line.match(/^(Broadband|Corporate)\s+-\s+(\d+)$/);
    if (serviceMatch) {
      flushService();
      currentCategory = serviceMatch[1]; currentServiceNumber = serviceMatch[2];
      currentAddress = null; currentFriendlyName = null; currentAvcId = null;
      inRecurring = false; currentPlan = null; currentAmount = 0;
      continue;
    }

    if (line.match(/^Others\s+-\s+\d+$/)) { flushService(); currentServiceNumber = null; continue; }
    if (!currentServiceNumber) continue;

    if (!currentAddress && line.match(/^[A-Z0-9\/\s,.-]+(?:QLD|NSW|VIC|SA|WA|TAS|NT|ACT)\s+\d{4}$/)) { currentAddress = line; continue; }
    if (!currentFriendlyName && line.match(/^\([^)]+\)$/)) { currentFriendlyName = line.slice(1, -1).trim(); continue; }
    if (line.startsWith("AVC ID -")) { currentAvcId = line.replace("AVC ID -", "").trim(); continue; }
    if (line === "Recurring monthly charge:") { inRecurring = true; continue; }
    if (!inRecurring) continue;

    if (!currentPlan && !line.match(/^\d{1,2}\s+\w+\s+\d{4}/) && !line.match(/^\$[\d,]+\.\d{2}$/) && !line.match(/^Sub Total/) && !line.match(/^Monthly Charge For Support/) && line.length > 5) {
      currentPlan = line; continue;
    }

    const amtMatch = line.match(/^\$([\d,]+\.\d{2})$/);
    if (amtMatch) {
      const val = parseFloat(amtMatch[1].replace(/,/g, ""));
      if (val > 0 && val > currentAmount) currentAmount = val;
      continue;
    }
  }
  flushService();

  return { supplier: "Exetel", invoiceNumber, invoiceDate, totalIncGst, services };
}

// ── Run Tests ─────────────────────────────────────────────────────────────────
const files = [
  { path: '/home/ubuntu/upload/VineDirectFeb.pdf', parser: parseVineDirect },
  { path: '/home/ubuntu/upload/InfinetMar.pdf', parser: parseInfinet },
  { path: '/home/ubuntu/upload/BlitznetMar.pdf', parser: parseBlitznet },
  { path: '/home/ubuntu/upload/ExetelFeb.pdf', parser: parseExetelPdf },
];

for (const { path, parser } of files) {
  const text = extractText(path);
  console.log(`\n${'='.repeat(60)}`);
  console.log(`FILE: ${path.split('/').pop()}`);
  try {
    const result = parser(text);
    console.log(`Supplier: ${result.supplier} | Invoice: ${result.invoiceNumber} | Date: ${result.invoiceDate} | Total: $${result.totalIncGst}`);
    console.log(`Services (${result.services.length}):`);
    for (const s of result.services) {
      console.log(`  [${s.serviceType}] "${s.friendlyName}" | $${s.amountExGst} ex GST | ID: ${s.serviceId}`);
      if (s.address) console.log(`    Address: ${s.address}`);
      if (s.avcId) console.log(`    AVC: ${s.avcId}`);
      console.log(`    Desc: ${s.description.substring(0, 80)}`);
    }
  } catch (e) {
    console.log(`ERROR: ${e.message}`);
  }
}
