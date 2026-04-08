import { createConnection } from "mysql2/promise";
import * as dotenv from "dotenv";
dotenv.config();

const conn = await createConnection(process.env.DATABASE_URL);

// Insert the rate card header
const [rcResult] = await conn.execute(
  `INSERT INTO supplierRateCards (supplier, rateCardName, effectiveDate, currency, taxStatus, isActive, notes)
   VALUES (?, ?, ?, ?, ?, ?, ?)
   ON DUPLICATE KEY UPDATE updatedAt = NOW()`,
  [
    "vocus",
    "Vocus Wholesale Mobile Rate Card",
    "2025-02-03",
    "AUD",
    "excl_gst",
    true,
    "Effective 3 February 2025. All prices excl. GST. 1 GB = 1024 MB."
  ]
);

// Check if already exists
let rateCardId;
if (rcResult.insertId && rcResult.insertId > 0) {
  rateCardId = rcResult.insertId;
} else {
  const [rows] = await conn.execute(
    `SELECT id FROM supplierRateCards WHERE supplier = ? AND effectiveDate = ?`,
    ["vocus", "2025-02-03"]
  );
  rateCardId = rows[0].id;
}

console.log(`Rate card ID: ${rateCardId}`);

// Clear existing items for this rate card
await conn.execute(`DELETE FROM supplierRateCardItems WHERE rateCardId = ?`, [rateCardId]);

const items = [];

// ─── 1. PAYGD Mobile Data (Post 3 Feb 2025) ───────────────────────────────
items.push({
  category: "mobile_data_paygd",
  categoryLabel: "Wholesale Mobile Data (PAYGD - Post 3 Feb 2025)",
  planName: "4G Mobile Data PAYGD",
  itemType: "per_unit",
  priceExGst: 0.55,
  unit: "per_gb",
  monthlyAccessFee: 12.50,
  notes: "Pay as you go data. $12.50/month access fee per SIM applies separately. Cannot be linked to legacy data bucket."
});

// ─── 2. Legacy Mobile Data Buckets ───────────────────────────────────────
const legacyDataPlans = [
  [100, 150.00], [200, 300.00], [300, 447.00], [400, 592.00], [500, 735.00],
  [600, 876.00], [700, 1015.00], [800, 1152.00], [900, 1287.00], [1000, 1420.00],
  [2000, 2830.00], [3000, 4237.50], [4000, 5640.00], [5000, 7037.50],
  [6000, 8430.00], [7000, 9817.50], [8000, 11200.00], [9000, 12577.50],
  [10000, 13950.00], [11000, 15317.50], [12000, 16680.00], [13000, 18037.50],
  [14000, 19390.00], [15000, 20737.50], [16000, 22080.00], [17000, 23417.50],
  [18000, 24750.00], [19000, 26077.50], [20000, 27400.00], [25000, 33875.00],
  [30000, 40200.00], [35000, 46375.00], [40000, 52400.00], [45000, 58275.00],
  [50000, 64000.00], [55000, 69850.00], [60000, 75600.00], [65000, 81250.00],
  [70000, 86800.00], [75000, 92250.00], [80000, 97600.00], [85000, 102850.00],
  [90000, 108000.00], [95000, 113050.00], [100000, 118000.00], [110000, 128700.00],
  [120000, 139200.00], [130000, 149500.00], [140000, 159600.00], [150000, 169500.00],
  [160000, 179200.00], [170000, 188700.00], [180000, 198000.00], [190000, 207100.00],
  [200000, 216000.00]
];
for (const [gb, price] of legacyDataPlans) {
  items.push({
    category: "mobile_data_legacy_bucket",
    categoryLabel: "Mobile Data Bucket (Legacy - Prior to 3 Feb 2025)",
    planName: `Mobile Data ${gb.toLocaleString()}`,
    itemType: "bucket",
    priceExGst: price,
    unit: "per_month",
    inclusionGB: gb,
    overageRatePerGB: 1.6015,
    notes: "Applies only to legacy activated base provisioned up until 3rd Feb 2025."
  });
}

// ─── 3. Mobile Voice Buckets ──────────────────────────────────────────────
const voicePlans = [
  [10000, 127.00], [20000, 254.00], [30000, 381.00], [40000, 508.00],
  [50000, 605.00], [60000, 726.00], [70000, 847.00], [80000, 968.00],
  [90000, 1089.00], [100000, 1210.00], [200000, 2420.00], [500000, 6050.00],
  [1000000, 12100.00], [1200000, 14520.00], [1400000, 16940.00],
  [1600000, 19360.00], [1800000, 21780.00], [2000000, 24200.00],
  [2500000, 30250.00], [3000000, 36300.00], [3500000, 42350.00],
  [4000000, 48400.00], [4500000, 54450.00], [5000000, 60500.00],
  [6000000, 72600.00], [7000000, 84700.00], [8000000, 96800.00],
  [9000000, 108900.00], [10000000, 121000.00]
];
for (const [mins, price] of voicePlans) {
  items.push({
    category: "mobile_voice_bucket",
    categoryLabel: "Mobile Voice Bucket",
    planName: `Mobile Voice ${mins.toLocaleString()}`,
    itemType: "bucket",
    priceExGst: price,
    unit: "per_month",
    inclusionMinutes: mins,
    overageRatePerMinute: 0.0143,
    notes: "Calls to Mobile and Fixed Lines within Australia."
  });
}

// ─── 4. Mobile SMS Buckets ────────────────────────────────────────────────
const smsPlans = [
  [10000, 57.50], [20000, 115.00], [30000, 172.50], [40000, 230.00],
  [50000, 287.50], [100000, 575.00], [200000, 1150.00], [300000, 1725.00],
  [400000, 2300.00], [500000, 2875.00], [600000, 3450.00], [700000, 4025.00],
  [800000, 4600.00], [900000, 5175.00], [1000000, 5750.00], [2000000, 11500.00],
  [3000000, 17250.00], [4000000, 23000.00], [5000000, 28750.00], [10000000, 57500.00]
];
for (const [sms, price] of smsPlans) {
  items.push({
    category: "mobile_sms_bucket",
    categoryLabel: "Mobile SMS Bucket",
    planName: `Mobile SMS ${sms.toLocaleString()}`,
    itemType: "bucket",
    priceExGst: price,
    unit: "per_month",
    inclusionSMS: sms,
    overageRatePerSMS: 0.0065
  });
}

// ─── 5. 4G Backup Data Buckets ────────────────────────────────────────────
const backupDataPlans = [
  [100, 150.00], [200, 300.00], [300, 447.00], [400, 592.00], [500, 735.00],
  [600, 876.00], [700, 1015.00], [800, 1152.00], [900, 1287.00], [1000, 1420.00],
  [2000, 2830.00], [3000, 4237.50], [4000, 5640.00], [5000, 7037.50],
  [6000, 8430.00], [7000, 9817.50], [8000, 11200.00], [9000, 12577.50],
  [10000, 13950.00], [11000, 15317.50], [12000, 16680.00], [13000, 18037.50],
  [14000, 19390.00], [15000, 20737.50], [16000, 22080.00], [17000, 23417.50],
  [18000, 24750.00], [19000, 26077.50], [20000, 27400.00], [25000, 33875.00],
  [30000, 40200.00], [35000, 46375.00], [40000, 52400.00], [45000, 58275.00],
  [50000, 64000.00], [55000, 69850.00], [60000, 75600.00], [65000, 81250.00],
  [70000, 86800.00], [75000, 92250.00], [80000, 97600.00], [85000, 102850.00],
  [90000, 108000.00], [95000, 113050.00], [100000, 118000.00], [110000, 128700.00],
  [120000, 139200.00], [130000, 149500.00], [140000, 159600.00], [150000, 169500.00],
  [160000, 179200.00], [170000, 188700.00], [180000, 198000.00], [190000, 207100.00],
  [200000, 216000.00]
];
for (const [gb, price] of backupDataPlans) {
  items.push({
    category: "4g_backup_data_bucket",
    categoryLabel: "4G Backup Data Bucket",
    planName: `4G Backup Data ${gb.toLocaleString()}`,
    itemType: "bucket",
    priceExGst: price,
    unit: "per_month",
    inclusionGB: gb,
    overageRatePerGB: 1.6015,
    notes: "Standard 4G Backup service limited to 12/1 speed profile. Optional 25/5 boost available."
  });
}

// ─── 6. Miscellaneous Fees ────────────────────────────────────────────────
const miscItems = [
  { planName: "Active Mobile SIM (Legacy Pre-3 Feb 2025)", priceExGst: 0.50, unit: "per_sim_per_month", notes: "Legacy base provisioned up to 3rd Feb 2025" },
  { planName: "Active Mobile 4G Fee (Post 3 Feb 2025)", priceExGst: 12.50, unit: "per_sim_per_month", notes: "New monthly access fee replacing legacy $0.50 fee" },
  { planName: "Active 4G Backup SIM 12/1", priceExGst: 0.50, unit: "per_sim_per_month" },
  { planName: "Active 4G Backup SIM 25/5", priceExGst: 1.50, unit: "per_sim_per_month" },
  { planName: "MMS (Domestic)", priceExGst: 0.0920, unit: "per_mms" },
  { planName: "Voicemail Deposit", priceExGst: 0.0000, unit: "per_minute" },
  { planName: "Voicemail Retrieval", priceExGst: 0.0127, unit: "per_minute" },
  { planName: "International SMS", priceExGst: 0.1150, unit: "per_sms" },
  { planName: "International MMS", priceExGst: 0.7250, unit: "per_mms" },
  { planName: "124 YES Calls", priceExGst: 2.4480, unit: "per_minute" },
];
for (const item of miscItems) {
  items.push({ category: "miscellaneous", categoryLabel: "Miscellaneous Fees & Charges", itemType: "misc", ...item });
}

// ─── 7. International Roaming Zone 1 ─────────────────────────────────────
const roamingZone1 = [
  { planName: "Zone 1 - National Voice Calls (per minute)", priceExGst: 0.1111, unit: "per_minute" },
  { planName: "Zone 1 - International Voice Calls (per minute)", priceExGst: 0.1111, unit: "per_minute" },
  { planName: "Zone 1 - Receive Voice Calls (per minute)", priceExGst: 0.1111, unit: "per_minute" },
  { planName: "Zone 1 - National Video Calls (per minute)", priceExGst: 0.1111, unit: "per_minute" },
  { planName: "Zone 1 - International Video Calls (per minute)", priceExGst: 0.1111, unit: "per_minute" },
  { planName: "Zone 1 - Receive Video Calls (per minute)", priceExGst: 0.1111, unit: "per_minute" },
  { planName: "Zone 1 - Connection Charge (Flag Fall)", priceExGst: 0.0000, unit: "per_call" },
  { planName: "Zone 1 - SMS to Australian number", priceExGst: 0.0333, unit: "per_sms" },
  { planName: "Zone 1 - SMS to non-Australian number", priceExGst: 0.0333, unit: "per_sms" },
  { planName: "Zone 1 - Receive SMS", priceExGst: 0.0000, unit: "per_sms" },
  { planName: "Zone 1 - Receive MMS (per MB)", priceExGst: 0.0233, unit: "per_mb" },
  { planName: "Zone 1 - GPRS/3G/4G Data (per MB)", priceExGst: 0.0233, unit: "per_mb" },
];
for (const item of roamingZone1) {
  items.push({ category: "international_roaming_zone1", categoryLabel: "International Roaming - Zone 1", itemType: "roaming", ...item });
}

// ─── Insert all items ─────────────────────────────────────────────────────
let inserted = 0;
for (const item of items) {
  await conn.execute(
    `INSERT INTO supplierRateCardItems 
     (rateCardId, category, categoryLabel, planName, itemType, priceExGst, unit, 
      inclusionGB, inclusionMinutes, inclusionSMS, 
      overageRatePerGB, overageRatePerMinute, overageRatePerSMS, 
      monthlyAccessFee, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      rateCardId,
      item.category,
      item.categoryLabel ?? null,
      item.planName ?? null,
      item.itemType,
      item.priceExGst ?? null,
      item.unit ?? null,
      item.inclusionGB ?? null,
      item.inclusionMinutes ?? null,
      item.inclusionSMS ?? null,
      item.overageRatePerGB ?? null,
      item.overageRatePerMinute ?? null,
      item.overageRatePerSMS ?? null,
      item.monthlyAccessFee ?? null,
      item.notes ?? null,
    ]
  );
  inserted++;
}

console.log(`✅ Inserted ${inserted} rate card items for rate card ID ${rateCardId}`);
await conn.end();
