import mysql from 'mysql2/promise';
import 'dotenv/config';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

const updates = [
  { externalId: 'C0191', xeroContactName: 'Red Roo Australia' },
  { externalId: 'C0269', xeroContactName: 'Travellers Rockhampton Pty Ltd' },
  { externalId: 'C0028', xeroContactName: 'Autonomy and Asset Management Group (AAMG)' },
];

for (const u of updates) {
  const [existing] = await conn.execute('SELECT xeroContactName FROM customers WHERE externalId = ?', [u.externalId]);
  const current = existing[0]?.xeroContactName;
  if (!current) {
    await conn.execute('UPDATE customers SET xeroContactName = ? WHERE externalId = ?', [u.xeroContactName, u.externalId]);
    console.log('Updated', u.externalId, '→ xeroContactName =', u.xeroContactName);
  } else {
    console.log('Skipped', u.externalId, '- already has xeroContactName:', current);
  }
}

await conn.end();
console.log('Done.');
