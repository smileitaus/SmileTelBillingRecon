import * as mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
dotenv.config();

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);
  const [rows] = await conn.execute(
    "SELECT externalId, name FROM customers WHERE status != 'inactive' ORDER BY name"
  ) as any[];
  fs.writeFileSync('/tmp/customers.json', JSON.stringify(rows));
  console.log(`Exported ${(rows as any[]).length} customers`);
  await conn.end();
}
main().catch(console.error);
