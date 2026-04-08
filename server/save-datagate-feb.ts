import express from 'express';
import fs from 'fs';
import path from 'path';

// Temporary endpoint to receive Datagate Feb 2026 data from browser extraction
export function registerDatagateSaveEndpoint(app: express.Application) {
  app.post('/api/save-datagate-feb', express.json({ limit: '10mb' }), (req, res) => {
    try {
      const data = req.body;
      const filePath = path.join(process.cwd(), 'datagate_feb2026.json');
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      const totalTx = data.data?.reduce((s: number, c: any) => s + (c.transactions?.length || 0), 0) || 0;
      console.log(`[DataGate] Saved Feb 2026 data: ${data.data?.length || 0} customers, ${totalTx} transactions`);
      res.json({ ok: true, customers: data.data?.length, transactions: totalTx });
    } catch (e: any) {
      console.error('[DataGate] Save error:', e.message);
      res.status(500).json({ ok: false, error: e.message });
    }
  });
}
