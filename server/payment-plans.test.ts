import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createConnection } from "mysql2/promise";

let conn: Awaited<ReturnType<typeof createConnection>>;

beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!.replace("mysql://", "http://"));
  conn = await createConnection({
    host: url.hostname,
    port: parseInt(url.port) || 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1).split("?")[0],
    ssl: { rejectUnauthorized: false },
  });
});

afterAll(async () => {
  await conn.end();
});

describe("payment_plans table", () => {
  it("should have the payment_plans table with required columns", async () => {
    const [rows] = await conn.execute(`DESCRIBE payment_plans`);
    const cols = (rows as any[]).map((r) => r.Field);
    expect(cols).toContain("planId");
    expect(cols).toContain("customerExternalId");
    expect(cols).toContain("customerName");
    expect(cols).toContain("totalOverdueIncGst");
    expect(cols).toContain("totalOverdueExGst");
    expect(cols).toContain("status");
    expect(cols).toContain("agreedTerms");
    expect(cols).toContain("arrangementDate");
    expect(cols).toContain("targetClearDate");
  });

  it("should have the payment_plan_invoices table with required columns", async () => {
    const [rows] = await conn.execute(`DESCRIBE payment_plan_invoices`);
    const cols = (rows as any[]).map((r) => r.Field);
    expect(cols).toContain("planId");
    expect(cols).toContain("invoiceNumber");
    expect(cols).toContain("amountIncGst");
    expect(cols).toContain("amountExGst");
    expect(cols).toContain("paymentStatus");
    expect(cols).toContain("isFinalInvoice");
    expect(cols).toContain("promisedPaymentDate");
    expect(cols).toContain("paidDate");
  });
});

describe("Little Cha payment plan data", () => {
  const PLAN_ID = "PP-LITTLECHA-2026-001";

  it("should have the Hank Chu payment plan record", async () => {
    const [rows] = await conn.execute(
      `SELECT * FROM payment_plans WHERE planId = ?`,
      [PLAN_ID]
    );
    const plans = rows as any[];
    expect(plans).toHaveLength(1);
    const plan = plans[0];
    expect(plan.customerName).toBe("Little Cha Franchises (Hank Chu)");
    expect(plan.contactName).toBe("Hank Chu");
    expect(plan.contactEmail).toBe("hank.chu@littlechagroup.com");
    expect(plan.status).toBe("active");
    expect(parseFloat(plan.totalOverdueIncGst)).toBeCloseTo(1587.56, 1);
  });

  it("should have exactly 12 invoice lines for the plan", async () => {
    const [rows] = await conn.execute(
      `SELECT COUNT(*) as cnt FROM payment_plan_invoices WHERE planId = ?`,
      [PLAN_ID]
    );
    const cnt = (rows as any[])[0].cnt;
    expect(cnt).toBe(12);
  });

  it("should have invoice totals matching $1,587.56 inc GST", async () => {
    const [rows] = await conn.execute(
      `SELECT SUM(amountIncGst) as total FROM payment_plan_invoices WHERE planId = ?`,
      [PLAN_ID]
    );
    const total = parseFloat((rows as any[])[0].total);
    expect(total).toBeCloseTo(1587.56, 1);
  });

  it("should have 9 invoices with promised status and 3 outstanding", async () => {
    const [rows] = await conn.execute(
      `SELECT paymentStatus, COUNT(*) as cnt FROM payment_plan_invoices WHERE planId = ? GROUP BY paymentStatus`,
      [PLAN_ID]
    );
    const statusMap: Record<string, number> = {};
    for (const row of rows as any[]) {
      statusMap[row.paymentStatus] = row.cnt;
    }
    expect(statusMap["promised"]).toBe(9);
    expect(statusMap["outstanding"]).toBe(3);
  });

  it("should have 3 final invoices (Burwood, Forest Way Dec, Green Hills Mar)", async () => {
    const [rows] = await conn.execute(
      `SELECT COUNT(*) as cnt FROM payment_plan_invoices WHERE planId = ? AND isFinalInvoice = 1`,
      [PLAN_ID]
    );
    const cnt = (rows as any[])[0].cnt;
    expect(cnt).toBe(3);
  });

  it("should have the correct invoice numbers from the email", async () => {
    const [rows] = await conn.execute(
      `SELECT invoiceNumber FROM payment_plan_invoices WHERE planId = ? ORDER BY invoiceNumber`,
      [PLAN_ID]
    );
    const invNums = (rows as any[]).map((r) => r.invoiceNumber).sort();
    const expected = [
      "ST2996", "ST7006", "ST7205", "ST7812", "ST7813",
      "ST7814", "ST7874", "ST7875", "ST7876", // wait, ST7876 is not in the plan
      "ST8008", "ST8015", "ST8070", "ST8073",
    ].sort();
    // Check all expected invoices from Hank's email are present
    const planInvoices = ["ST8015", "ST7814", "ST7813", "ST8008", "ST7812",
      "ST8070", "ST7875", "ST8073", "ST7874", "ST7205", "ST7006", "ST2996"].sort();
    expect(invNums).toEqual(planInvoices);
  });

  it("should have target clear date of 30 April 2026", async () => {
    const [rows] = await conn.execute(
      `SELECT targetClearDate FROM payment_plans WHERE planId = ?`,
      [PLAN_ID]
    );
    const date = new Date((rows as any[])[0].targetClearDate);
    expect(date.getMonth()).toBe(3); // April = month index 3
    expect(date.getFullYear()).toBe(2026);
  });
});
