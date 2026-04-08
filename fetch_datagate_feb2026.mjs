/**
 * Fetch Feb 2026 Datagate transactions
 * Uses the same API endpoint pattern discovered during Jan 2026 extraction.
 * The Datagate portal API is at /api/v1 (relative to app.dgportal.net).
 * Auth: Bearer token from DataGate_API_Token env var.
 * 
 * Strategy: For each customer from Jan 2026 data, get their agreement's periods list,
 * find Feb 2026 period, then fetch transactions for that period.
 */

import fs from 'fs';
import https from 'https';

const API_TOKEN = process.env.DataGate_API_Token;
const BASE_URL = 'https://app.dgportal.net';

if (!API_TOKEN) {
  console.error('ERROR: DataGate_API_Token env var not set');
  process.exit(1);
}

const headers = {
  'Authorization': `Bearer ${API_TOKEN}`,
  'Content-Type': 'application/json',
  'Accept': 'application/json'
};

async function apiGet(path) {
  return new Promise((resolve, reject) => {
    const url = `${BASE_URL}${path}`;
    const req = https.get(url, { headers }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch(e) {
          resolve({ status: res.statusCode, data: data, raw: true });
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

async function main() {
  // Load Jan 2026 data to get customer/agreement IDs
  const jan2026 = JSON.parse(fs.readFileSync('/home/ubuntu/datagate_jan2026.json', 'utf8'));
  
  console.log(`Processing ${jan2026.length} customers from Jan 2026 data...`);
  
  const feb2026Results = [];
  let successCount = 0;
  let noDataCount = 0;
  let errorCount = 0;
  
  for (const customer of jan2026) {
    const { customerId, customerCode, customerName, agreementId } = customer;
    
    try {
      // Get billing periods for this agreement
      const periodsResp = await apiGet(`/api/v1/customers/${customerId}/agreements/${agreementId}/periods`);
      
      if (periodsResp.status !== 200 || !Array.isArray(periodsResp.data)) {
        console.log(`  SKIP ${customerName}: periods API returned ${periodsResp.status}`);
        errorCount++;
        continue;
      }
      
      const periods = periodsResp.data;
      
      // Find Feb 2026 period
      const feb2026Period = periods.find(p => {
        const label = (p.label || p.name || p.periodName || '').toLowerCase();
        return label.includes('february 2026') || label.includes('feb 2026');
      });
      
      if (!feb2026Period) {
        console.log(`  NO_PERIOD ${customerName}: no Feb 2026 period found (${periods.length} periods available: ${periods.slice(0,3).map(p => p.label || p.name).join(', ')})`);
        noDataCount++;
        continue;
      }
      
      // Fetch transactions for Feb 2026
      const txResp = await apiGet(`/api/v1/customers/${customerId}/agreements/${agreementId}/periods/${feb2026Period.id}/transactions?pageSize=500`);
      
      if (txResp.status !== 200) {
        console.log(`  ERROR ${customerName}: transactions API returned ${txResp.status}`);
        errorCount++;
        continue;
      }
      
      const transactions = Array.isArray(txResp.data) ? txResp.data : (txResp.data.items || []);
      
      if (transactions.length === 0) {
        console.log(`  EMPTY ${customerName}: no transactions in Feb 2026`);
        noDataCount++;
        continue;
      }
      
      // Validate all prices are ex-GST (taxInclusive should be false)
      const taxInclusiveCount = transactions.filter(t => t.taxInclusive === true).length;
      if (taxInclusiveCount > 0) {
        console.log(`  WARNING ${customerName}: ${taxInclusiveCount} tax-inclusive transactions found!`);
      }
      
      feb2026Results.push({
        customerId,
        customerCode,
        customerName,
        agreementId,
        periodId: feb2026Period.id,
        periodLabel: feb2026Period.label || feb2026Period.name,
        transactions: transactions.map(t => ({
          id: t.id,
          productLabel: t.productLabel || t.description || t.product?.label,
          productName: t.productName || t.product?.name,
          cost: t.cost || 0,
          sell: t.sell || 0,
          qty: t.qty || t.quantity || 1,
          lineTotal: t.lineTotal || (t.sell * (t.qty || 1)),
          serviceItemId: t.serviceItemId || t.serviceItem?.id,
          serviceItem: t.serviceItem,
          serviceItemDescription: t.serviceItemDescription || t.serviceItem?.description,
          serviceName: t.serviceName || t.service?.name,
          invoiceNumber: t.invoiceNumber,
          isOneOff: t.isOneOff || false,
          taxInclusive: t.taxInclusive || false
        }))
      });
      
      const totalSell = transactions.reduce((s, t) => s + (t.sell * (t.qty || 1)), 0);
      console.log(`  OK ${customerName}: ${transactions.length} transactions, $${totalSell.toFixed(2)} total sell`);
      successCount++;
      
    } catch(e) {
      console.log(`  ERROR ${customerName}: ${e.message}`);
      errorCount++;
    }
    
    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 100));
  }
  
  // Save results
  fs.writeFileSync('/home/ubuntu/datagate_feb2026.json', JSON.stringify(feb2026Results, null, 2));
  
  const totalTx = feb2026Results.reduce((s, c) => s + c.transactions.length, 0);
  const totalSell = feb2026Results.reduce((s, c) => s + c.transactions.reduce((ss, t) => ss + (t.sell * t.qty), 0), 0);
  
  console.log('\n=== SUMMARY ===');
  console.log(`Customers with data: ${successCount}`);
  console.log(`Customers with no Feb 2026 data: ${noDataCount}`);
  console.log(`Errors: ${errorCount}`);
  console.log(`Total transactions: ${totalTx}`);
  console.log(`Total sell (ex-GST): $${totalSell.toFixed(2)}`);
  console.log(`Saved to: /home/ubuntu/datagate_feb2026.json`);
}

main().catch(console.error);
