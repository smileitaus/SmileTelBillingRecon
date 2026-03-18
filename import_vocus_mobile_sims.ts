/**
 * import_vocus_mobile_sims.ts
 *
 * Imports Vocus Standard Mobile SIMs from the parsed CSV data into the services table.
 * - Creates one service record per SIM with status='unmatched'
 * - Populates address, phone number, postcode, city, state for auto-matching
 * - Flags the SmileIT internal SIM as status='active' with a known customerExternalId
 * - Upserts the Vocus entry in supplier_registry with current totals
 *
 * Run from the project root:
 *   npx tsx import_vocus_mobile_sims.ts
 */

import "dotenv/config";
import { drizzle } from "drizzle-orm/mysql2";
import { eq, sql, and } from "drizzle-orm";
import { services, supplierRegistry } from "./drizzle/schema";

// ---------------------------------------------------------------------------
// Cleaned SIM data extracted from vocusstandardmobilesims(1).csv
// Name field (Kim Walker / Peter Drummond) is the provisioning staff — ignored.
// The SmileIT Internal Use SIM (vocusId 13662287) is flagged separately.
// ---------------------------------------------------------------------------
const VOCUS_SIMS = [
  { vocusId: "13513923", phone: "0478492162", address: "1D 60 Enterprise", city: "Tingalpa", state: "QLD", postcode: "4173", subscriberId: "4622403610106" },
  { vocusId: "13528591", phone: "0478488950", address: "10 148 The Esplanade", city: "Scarborough", state: "WA", postcode: "6019", subscriberId: "4622403605155" },
  { vocusId: "13528594", phone: "0478488960", address: "154 High Street", city: "Wodonga", state: "VIC", postcode: "3690", subscriberId: "4622403605122" },
  { vocusId: "13528596", phone: "0478488995", address: "1 672 Glenferrie Road", city: "Hawthorn", state: "VIC", postcode: "3122", subscriberId: "4622403605148" },
  { vocusId: "13528598", phone: "0478488997", address: "3 4353 Anzac Parade", city: "Wodonga", state: "VIC", postcode: "3690", subscriberId: "4622403605130" },
  { vocusId: "13529385", phone: "0478489006", address: "1 6 Patricks Road", city: "Arana Hills", state: "QLD", postcode: "4054", subscriberId: "4622403605163" },
  { vocusId: "13529650", phone: "0478489011", address: "1 Ella Street", city: "Newstead", state: "QLD", postcode: "4006", subscriberId: "4622403605171" },
  { vocusId: "13530680", phone: "0478489019", address: "T103 115 Dunning Avenue", city: "Rosebery", state: "NSW", postcode: "2018", subscriberId: "4622403605114" },
  { vocusId: "13532686", phone: "0478489034", address: "85 Surf Coast Highway", city: "Torquay", state: "VIC", postcode: "3228", subscriberId: "4622403605189" },
  { vocusId: "13538420", phone: "0478493105", address: "12 Horizon Drive", city: "Beenleigh", state: "QLD", postcode: "4207", subscriberId: "4622403605205" },
  { vocusId: "13539733", phone: "0478489048", address: "11 13 Lake Street", city: "Caroline Springs", state: "VIC", postcode: "3023", subscriberId: "4622403605213" },
  { vocusId: "13541468", phone: "0478490541", address: "2 26 Wandoo Street", city: "Fortitude Valley", state: "QLD", postcode: "4006", subscriberId: "4622403605221" },
  { vocusId: "13544784", phone: "0478489053", address: "3 1 Hospital Boulevard", city: "Southport", state: "QLD", postcode: "4215", subscriberId: "4622403605239" },
  { vocusId: "13545006", phone: "0478489092", address: "39 300 Point Cook Road", city: "Point Cook", state: "VIC", postcode: "3030", subscriberId: "4622403605247" },
  { vocusId: "13545725", phone: "0478489100", address: "3 Connor Street", city: "Burleigh Heads", state: "QLD", postcode: "4220", subscriberId: "4622403605254" },
  { vocusId: "13547662", phone: "0478489102", address: "300 Elizabeth Street", city: "Brisbane", state: "QLD", postcode: "4000", subscriberId: "4622403605288" },
  { vocusId: "13548862", phone: "0478489112", address: "459 Pacific Highway", city: "Wyoming", state: "NSW", postcode: "2250", subscriberId: "4622403605262" },
  { vocusId: "13550793", phone: "0478489124", address: "T9A 129 Queen Street", city: "Southport", state: "QLD", postcode: "4215", subscriberId: "4622403605270" },
  { vocusId: "13562705", phone: "0478489137", address: "56 Griffith Street", city: "Coolangatta", state: "QLD", postcode: "4225", subscriberId: "4622403605296" },
  { vocusId: "13571827", phone: "0478489163", address: "65 114 Grey Street", city: "South Brisbane", state: "QLD", postcode: "4101", subscriberId: "4622403605312" },
  { vocusId: "13582756", phone: "0478489192", address: "1 369 Morayfield Road", city: "Morayfield", state: "QLD", postcode: "4506", subscriberId: "4622403605320" },
  { vocusId: "13586747", phone: "0478489211", address: "6 3 Archibald Avenue", city: "Waterloo", state: "NSW", postcode: "2017", subscriberId: "4622403605338" },
  { vocusId: "13586766", phone: "0478489213", address: "17 123 Eagle Street", city: "Brisbane", state: "QLD", postcode: "4000", subscriberId: "4622403605346" },
  { vocusId: "13587200", phone: "0478489215", address: "1 46 Matheson Street", city: "Virginia", state: "QLD", postcode: "4014", subscriberId: "4622403605353" },
  { vocusId: "13596446", phone: "0478489299", address: "206 Glenferrie Road", city: "Malvern", state: "VIC", postcode: "3144", subscriberId: "4622403605387" },
  { vocusId: "13596454", phone: "0478489235", address: "103 Elizabeth Street", city: "Melbourne", state: "VIC", postcode: "3000", subscriberId: "4622403605379" },
  { vocusId: "13596468", phone: "0478489314", address: "166 Swan Street", city: "Cremorne", state: "VIC", postcode: "3121", subscriberId: "4622403605361" },
  { vocusId: "13597441", phone: "0478489325", address: "476 Centre Road", city: "Bentleigh", state: "VIC", postcode: "3204", subscriberId: "4622403605395" },
  { vocusId: "13599000", phone: "0478489339", address: "038 80 Taylors Road", city: "Keilor Downs", state: "VIC", postcode: "3038", subscriberId: "4622403605411" },
  { vocusId: "13600115", phone: "0478489340", address: "60 Enterprise Place", city: "Tingalpa", state: "QLD", postcode: "4173", subscriberId: "4622403605429" },
  { vocusId: "13603700", phone: "0478489342", address: "5 87 Mooloolaba Esplanade", city: "Mooloolaba", state: "QLD", postcode: "4557", subscriberId: "4622403605437" },
  { vocusId: "13611790", phone: "0478489347", address: "165 Wellington Road", city: "East Brisbane", state: "QLD", postcode: "4169", subscriberId: "4622403605452" },
  { vocusId: "13615558", phone: "0478489359", address: "2 2 Manson Street", city: "North Lakes", state: "QLD", postcode: "4509", subscriberId: "4622403605445" },
  { vocusId: "13619752", phone: "0478489375", address: "03 186 Victoria Road", city: "Marrickville", state: "NSW", postcode: "2204", subscriberId: "4622403605460" },
  { vocusId: "13622390", phone: "0478489381", address: "254 Carlisle Street", city: "Balaclava", state: "VIC", postcode: "3183", subscriberId: "4622403605478" },
  { vocusId: "13629940", phone: "0478489382", address: "65 114 Grey Street", city: "South Brisbane", state: "QLD", postcode: "4101", subscriberId: "4622403605486" },
  { vocusId: "13630639", phone: "0478489384", address: "14 24 Chasely Street", city: "Auchenflower", state: "QLD", postcode: "4066", subscriberId: "4622403605494" },
  { vocusId: "13631263", phone: "0478489411", address: "15 300 Adelaide Street", city: "Brisbane", state: "QLD", postcode: "4000", subscriberId: "4622403605502" },
  { vocusId: "13632423", phone: "0478489448", address: "5 28 Metroplex Avenue", city: "Murarrie", state: "QLD", postcode: "4172", subscriberId: "4622403605510" },
  { vocusId: "13633217", phone: "0478489461", address: "Shop4 50 Subiaco Square Road", city: "Subiaco", state: "WA", postcode: "6008", subscriberId: "4622403605536" },
  { vocusId: "13633830", phone: "0478489481", address: "65 114 Grey Street", city: "South Brisbane", state: "QLD", postcode: "4101", subscriberId: "4622403605528" },
  { vocusId: "13635300", phone: "0478489482", address: "93 Cronulla Street", city: "Cronulla", state: "NSW", postcode: "2230", subscriberId: "4622403605551" },
  { vocusId: "13635366", phone: "0478489484", address: "G038 80 Taylors Road", city: "Keilor Downs", state: "VIC", postcode: "3038", subscriberId: "4622403605544" },
  { vocusId: "13636411", phone: "0478489486", address: "461 Dean Street", city: "Albury", state: "NSW", postcode: "2640", subscriberId: "4622403605569" },
  { vocusId: "13637789", phone: "0478489487", address: "24 1222 Coastal Boulevard", city: "Ocean Grove", state: "VIC", postcode: "3226", subscriberId: "4622403605577" },
  { vocusId: "13638779", phone: "0478489490", address: "53 Sunshine Avenue", city: "St Albans", state: "VIC", postcode: "3021", subscriberId: "4622403605585" },
  { vocusId: "13641540", phone: "0478489493", address: "T47 16 Amazons Place", city: "Jindalee", state: "QLD", postcode: "4074", subscriberId: "4622403605593" },
  { vocusId: "13642082", phone: "0478489498", address: "22 250 Ipswich Road", city: "Woolloongabba", state: "QLD", postcode: "4102", subscriberId: "4622403605601" },
  { vocusId: "13642698", phone: "0478489593", address: "1 60 Enterprise Place", city: "Tingalpa", state: "QLD", postcode: "4173", subscriberId: "4622403605627" },
  { vocusId: "13642701", phone: "0478489606", address: "1 60 Enterprise Place", city: "Tingalpa", state: "QLD", postcode: "4173", subscriberId: "4622403605619" },
  { vocusId: "13645217", phone: "0478489608", address: "R2A 395 Hamilton Road", city: "Chermside", state: "QLD", postcode: "4032", subscriberId: "4622403605635" },
  { vocusId: "13649289", phone: "0478489609", address: "8A 27 Southgate Avenue", city: "Cannon Hill", state: "QLD", postcode: "4170", subscriberId: "4622403605643" },
  { vocusId: "13650650", phone: "0478489630", address: "2 1585 Thompsons Road", city: "Cranbourne North", state: "VIC", postcode: "3977", subscriberId: "4622403605650" },
  { vocusId: "13660672", phone: "0478489643", address: "11 90 Surf Parade", city: "Broadbeach", state: "QLD", postcode: "4218", subscriberId: "4622403605700" },
  { vocusId: "13660676", phone: "0478489644", address: "116 300 Cranbourne Road", city: "Narre Warren South", state: "VIC", postcode: "3805", subscriberId: "4622403605718" },
  { vocusId: "13660683", phone: "0478489646", address: "8 56 Griffith Street", city: "Coolangatta", state: "QLD", postcode: "4225", subscriberId: "4622403605668" },
  { vocusId: "13660684", phone: "0478489660", address: "11 90 Surf Parade", city: "Broadbeach", state: "QLD", postcode: "4218", subscriberId: "4622403605676" },
  { vocusId: "13660685", phone: "0478489662", address: "378 Deception Bay Road", city: "Deception Bay", state: "QLD", postcode: "4508", subscriberId: "4622403605684" },
  { vocusId: "13660687", phone: "0478489656", address: "3 768 Stafford Road", city: "Everton Park", state: "QLD", postcode: "4053", subscriberId: "4622403605692" },
  { vocusId: "13662194", phone: "0478489672", address: "25 8 Metroplex Avenue", city: "Murarrie", state: "QLD", postcode: "4172", subscriberId: "4622403605726" },
  { vocusId: "13662287", phone: "0478489676", address: "1 60 Enterprise Place", city: "Tingalpa", state: "QLD", postcode: "4173", subscriberId: "4622403605734", isInternal: true },
  { vocusId: "13663774", phone: "0478489677", address: "18 25 Samuel Street", city: "Camp Hill", state: "QLD", postcode: "4152", subscriberId: "4622403605767" },
  { vocusId: "13663779", phone: "0478489678", address: "28 791 Stafford Road", city: "Everton Park", state: "QLD", postcode: "4053", subscriberId: "4622403605759" },
  { vocusId: "13663784", phone: "0478489682", address: "2 26 Wandoo Street", city: "Fortitude Valley", state: "QLD", postcode: "4006", subscriberId: "4622403605775" },
  { vocusId: "13663791", phone: "0478489683", address: "Kiosk 97 Boundary Street", city: "West End", state: "QLD", postcode: "4101", subscriberId: "4622403605742" },
  { vocusId: "13663796", phone: "0478489684", address: "65 114 Grey Street", city: "South Brisbane", state: "QLD", postcode: "4101", subscriberId: "4622403605783" },
  { vocusId: "13671201", phone: "0478489685", address: "4 36 Gwendoline Drive", city: "Beldon", state: "WA", postcode: "6027", subscriberId: "4622403605791" },
  { vocusId: "13671277", phone: "0478489687", address: "11 1001 Joondalup Drive", city: "Banksia Grove", state: "WA", postcode: "6031", subscriberId: "4622403605809" },
  { vocusId: "13672873", phone: "0478489690", address: "378 Deception Bay Road", city: "Deception Bay", state: "QLD", postcode: "4508", subscriberId: "4622403605817" },
  { vocusId: "13674103", phone: "0478489691", address: "4 166 Abbotsford Road", city: "Bowen Hills", state: "QLD", postcode: "4006", subscriberId: "4622403605833" },
  { vocusId: "13674110", phone: "0478489692", address: "3 108 Old Cleveland Road", city: "Capalaba", state: "QLD", postcode: "4157", subscriberId: "4622403605825" },
  { vocusId: "13676164", phone: "0478489693", address: "0 47 Burrendah Boulevard", city: "Willetton", state: "WA", postcode: "6155", subscriberId: "4622403605858" },
  { vocusId: "13679722", phone: "0478489694", address: "7 778 Old Princes Highway", city: "Sutherland", state: "NSW", postcode: "2232", subscriberId: "4622403605866" },
  { vocusId: "13679895", phone: "0478489697", address: "6 6 Crosby Road", city: "Albion", state: "QLD", postcode: "4010", subscriberId: "4622403605882" },
  { vocusId: "13687390", phone: "0478489699", address: "5 27 Connor Street", city: "Burleigh Heads", state: "QLD", postcode: "4220", subscriberId: "4622403605874" },
];

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("ERROR: DATABASE_URL environment variable is not set.");
    process.exit(1);
  }

  const db = drizzle(process.env.DATABASE_URL);
  console.log(`Starting Vocus Standard Mobile SIMs import — ${VOCUS_SIMS.length} SIMs`);

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const sim of VOCUS_SIMS) {
    const externalId = `VOCUS-MOB-${sim.vocusId}`;
    const fullAddress = `${sim.address}, ${sim.city} ${sim.state} ${sim.postcode}`;
    const isInternal = (sim as any).isInternal === true;

    const record = {
      externalId,
      serviceId: sim.vocusId,
      serviceType: "Mobile",
      serviceTypeDetail: "Standard Mobile SIM",
      planName: "Vocus Mobile Service",
      status: isInternal ? "active" : "unmatched",
      provider: "Vocus",
      supplierName: "Vocus",
      phoneNumber: sim.phone,
      locationAddress: fullAddress,
      // Store city, state, postcode in blitzPostcode and discoveryNotes for matching
      blitzPostcode: sim.postcode,
      discoveryNotes: `City: ${sim.city} | State: ${sim.state} | Postcode: ${sim.postcode} | Subscriber ID: ${sim.subscriberId}`,
      simSerialNumber: sim.subscriberId,
      costSource: "unknown",
      monthlyCost: "0.00",
      monthlyRevenue: "0.00",
      dataSource: "Vocus Standard Mobile SIMs CSV import",
      customerName: isInternal ? "SmileIT (Internal)" : "",
      customerExternalId: isInternal ? "SMILEIT-INTERNAL" : "",
    };

    try {
      // Check if already exists
      const [existing] = await db
        .select({ externalId: services.externalId })
        .from(services)
        .where(eq(services.externalId, externalId))
        .limit(1);

      if (existing) {
        // Update existing record — preserve customer assignment if already matched
        await db
          .update(services)
          .set({
            phoneNumber: record.phoneNumber,
            locationAddress: record.locationAddress,
            blitzPostcode: record.blitzPostcode,
            discoveryNotes: record.discoveryNotes,
            simSerialNumber: record.simSerialNumber,
            dataSource: record.dataSource,
            provider: "Vocus",
            supplierName: "Vocus",
            serviceTypeDetail: record.serviceTypeDetail,
            planName: record.planName,
          })
          .where(eq(services.externalId, externalId));
        updated++;
      } else {
        await db.insert(services).values(record as any);
        inserted++;
      }
    } catch (err: any) {
      console.error(`  ERROR on ${externalId}: ${err.message}`);
      skipped++;
    }
  }

  console.log(`\nServices import complete:`);
  console.log(`  Inserted: ${inserted}`);
  console.log(`  Updated:  ${updated}`);
  console.log(`  Errors:   ${skipped}`);

  // ---------------------------------------------------------------------------
  // Upsert Vocus entry in supplier_registry
  // ---------------------------------------------------------------------------
  console.log(`\nUpdating Vocus supplier registry entry...`);

  const [totalRow] = await db
    .select({ c: sql<number>`COUNT(*)`, cost: sql<number>`COALESCE(SUM(monthlyCost), 0)` })
    .from(services)
    .where(eq(services.provider, "Vocus"));

  const totalServices = Number(totalRow?.c || 0);
  const totalMonthlyCost = Number(totalRow?.cost || 0).toFixed(2);

  const [existingReg] = await db
    .select({ id: supplierRegistry.id })
    .from(supplierRegistry)
    .where(eq(supplierRegistry.name, "Vocus"))
    .limit(1);

  if (existingReg) {
    await db
      .update(supplierRegistry)
      .set({
        displayName: "Vocus (TIAB)",
        category: "Telecom",
        rank: 5,
        uploadFormats: "csv,xlsx,pdf",
        uploadInstructions: "Upload Vocus TIAB monthly reports (CSV or XLSX). Standard Mobile SIMs, Fixed Line, and Broadband services supported.",
        isActive: 1,
        totalServices,
        totalMonthlyCost: totalMonthlyCost as any,
        notes: "Vocus wholesale provider. Standard Mobile SIMs imported from CSV. Fixed/broadband invoice import pending.",
        updatedAt: new Date(),
      })
      .where(eq(supplierRegistry.name, "Vocus"));
    console.log(`  Supplier registry updated (existing entry).`);
  } else {
    await db.insert(supplierRegistry).values({
      name: "Vocus",
      displayName: "Vocus (TIAB)",
      category: "Telecom",
      rank: 5,
      uploadFormats: "csv,xlsx,pdf",
      uploadInstructions: "Upload Vocus TIAB monthly reports (CSV or XLSX). Standard Mobile SIMs, Fixed Line, and Broadband services supported.",
      isActive: 1,
      totalServices,
      totalMonthlyCost: totalMonthlyCost as any,
      notes: "Vocus wholesale provider. Standard Mobile SIMs imported from CSV. Fixed/broadband invoice import pending.",
    } as any);
    console.log(`  Supplier registry created (new entry).`);
  }

  console.log(`  Vocus registry: ${totalServices} services, $${totalMonthlyCost}/month`);
  console.log(`\nImport complete.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
