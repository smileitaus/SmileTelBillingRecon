import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Clean _x000D_ artifacts from all text fields in services table
const fields = ['phoneNumber', 'connectionId', 'serviceId', 'planName', 'locationAddress', 'customerName'];
for (const field of fields) {
  const [result] = await conn.execute(
    `UPDATE services SET ${field} = REPLACE(${field}, '_x000D_', '') WHERE ${field} LIKE '%_x000D_%'`
  );
  console.log(`Cleaned ${field}: ${result.affectedRows} rows`);
}

// Also clean from customers
const custFields = ['name'];
for (const field of custFields) {
  const [result] = await conn.execute(
    `UPDATE customers SET ${field} = REPLACE(${field}, '_x000D_', '') WHERE ${field} LIKE '%_x000D_%'`
  );
  console.log(`Cleaned customers.${field}: ${result.affectedRows} rows`);
}

// Trim whitespace from key fields
for (const field of fields) {
  const [result] = await conn.execute(
    `UPDATE services SET ${field} = TRIM(${field}) WHERE ${field} != TRIM(${field})`
  );
  console.log(`Trimmed ${field}: ${result.affectedRows} rows`);
}

await conn.end();
console.log('Done cleaning data');
