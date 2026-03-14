import * as mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
dotenv.config();
async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);
  const [rows] = await conn.execute('DESCRIBE customers') as any[];
  (rows as any[]).forEach((r: any) => console.log(r.Field, r.Type));
  await conn.end();
}
main().catch(console.error);
