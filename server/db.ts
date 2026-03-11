import { eq, like, or, sql, desc, asc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, customers, locations, services, supplierAccounts, billingItems, reviewItems, billingPlatformChecks, serviceEditHistory } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ==================== Billing Data Queries ====================

export async function getAllCustomers(search?: string, statusFilter?: string, platformFilter?: string, supplierFilter?: string) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];

  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    conditions.push(like(customers.name, term));
  }

  if (statusFilter && statusFilter !== 'all') {
    if (statusFilter === 'flagged') {
      // Filter customers that have at least one service flagged for termination
      conditions.push(
        sql`${customers.externalId} IN (SELECT DISTINCT customerExternalId FROM services WHERE status = 'flagged_for_termination' AND customerExternalId IS NOT NULL)`
      );
      // Still exclude inactive unless explicitly requested
      conditions.push(sql`${customers.status} != 'inactive'`);
    } else if (statusFilter === 'terminated') {
      // Filter customers that have at least one terminated service
      conditions.push(
        sql`${customers.externalId} IN (SELECT DISTINCT customerExternalId FROM services WHERE status = 'terminated' AND customerExternalId IS NOT NULL)`
      );
      // Still exclude inactive unless explicitly requested
      conditions.push(sql`${customers.status} != 'inactive'`);
    } else if (statusFilter === 'inactive') {
      // Explicitly show only inactive customers
      conditions.push(eq(customers.status, 'inactive'));
    } else {
      conditions.push(eq(customers.status, statusFilter));
    }
  } else {
    // Default: hide inactive customers unless explicitly requested
    conditions.push(sql`${customers.status} != 'inactive'`);
  }

  if (platformFilter && platformFilter !== 'all') {
    if (platformFilter === 'none') {
      conditions.push(
        sql`(${customers.billingPlatforms} IS NULL OR ${customers.billingPlatforms} = '' OR ${customers.billingPlatforms} = '[]')`
      );
    } else {
      conditions.push(like(customers.billingPlatforms, `%${platformFilter}%`));
    }
  }

  // Filter by supplier: find customers that have at least one service from the specified provider
  if (supplierFilter && supplierFilter !== 'all') {
    conditions.push(
      sql`${customers.externalId} IN (SELECT DISTINCT customerExternalId FROM services WHERE provider = ${supplierFilter} AND customerExternalId IS NOT NULL)`
    );
  }

  const whereClause = conditions.length > 0
    ? conditions.reduce((acc, c) => sql`${acc} AND ${c}`)
    : undefined;

  const result = await db.select().from(customers)
    .where(whereClause)
    .orderBy(asc(customers.name));
  return result.map(c => ({
    ...c,
    billingPlatforms: c.billingPlatforms ? JSON.parse(c.billingPlatforms) : [],
    monthlyCost: parseFloat(c.monthlyCost),
  }));
}

export async function getCustomerById(externalId: string) {
  const db = await getDb();
  if (!db) return null;

  const result = await db.select().from(customers).where(eq(customers.externalId, externalId)).limit(1);
  if (result.length === 0) return null;

  const c = result[0];
  return {
    ...c,
    billingPlatforms: c.billingPlatforms ? JSON.parse(c.billingPlatforms) : [],
    monthlyCost: parseFloat(c.monthlyCost),
  };
}

export async function getLocationById(externalId: string) {
  const db = await getDb();
  if (!db) return null;

  const result = await db.select().from(locations).where(eq(locations.externalId, externalId)).limit(1);
  if (result.length === 0) return null;

  const l = result[0];
  return {
    ...l,
    serviceIds: l.serviceIds ? JSON.parse(l.serviceIds) : [],
  };
}

export async function getLocationsByCustomer(customerExternalId: string) {
  const db = await getDb();
  if (!db) return [];

  const result = await db.select().from(locations).where(eq(locations.customerExternalId, customerExternalId));
  return result.map(l => ({
    ...l,
    serviceIds: l.serviceIds ? JSON.parse(l.serviceIds) : [],
  }));
}

export async function getServicesByCustomer(customerExternalId: string) {
  const db = await getDb();
  if (!db) return [];

  const result = await db.select().from(services).where(eq(services.customerExternalId, customerExternalId));
  return result.map(s => ({
    ...s,
    monthlyCost: parseFloat(s.monthlyCost),
    billingHistory: s.billingHistory ? JSON.parse(s.billingHistory) : [],
  }));
}

export async function getServiceById(externalId: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(services).where(eq(services.externalId, externalId)).limit(1);
  if (result.length === 0) return null;
  const s = result[0];
  const cost = parseFloat(String(s.monthlyCost));
  const revenue = parseFloat(String(s.monthlyRevenue));
  const computedMargin = revenue > 0 ? ((revenue - cost) / revenue * 100) : null;
  return {
    ...s,
    monthlyCost: cost,
    monthlyRevenue: revenue,
    // Always return freshly computed margin so the UI reflects current cost/revenue
    marginPercent: computedMargin !== null ? computedMargin.toFixed(2) : s.marginPercent,
    billingHistory: s.billingHistory ? JSON.parse(s.billingHistory) : [],
  };
}

export async function getAllServices() {
  const db = await getDb();
  if (!db) return [];

  const result = await db.select().from(services);
  return result.map(s => ({
    ...s,
    monthlyCost: parseFloat(s.monthlyCost),
    billingHistory: s.billingHistory ? JSON.parse(s.billingHistory) : [],
  }));
}

export async function getSupplierAccounts() {
  const db = await getDb();
  if (!db) return [];

  const result = await db.select().from(supplierAccounts);
  return result.map(sa => ({
    ...sa,
    monthlyCost: parseFloat(sa.monthlyCost),
  }));
}

export async function getSummary() {
  const db = await getDb();
  if (!db) return null;

  const [custCount] = await db.select({ count: sql<number>`count(*)` }).from(customers);
  const [locCount] = await db.select({ count: sql<number>`count(*)` }).from(locations);
  const [svcCount] = await db.select({ count: sql<number>`count(*)` }).from(services);

  const [matchedCount] = await db.select({ count: sql<number>`count(*)` }).from(services).where(eq(services.status, 'active'));
  const [unmatchedCount] = await db.select({ count: sql<number>`count(*)` }).from(services).where(eq(services.status, 'unmatched'));

  const [totalCost] = await db.select({ total: sql<string>`COALESCE(SUM(monthlyCost), 0)` }).from(services).where(sql`status != 'terminated'`);

  const typeBreakdown = await db.select({
    serviceType: services.serviceType,
    count: sql<number>`count(*)`,
  }).from(services).groupBy(services.serviceType);

  const accts = await db.select().from(supplierAccounts);

  // Count services with non-empty billing history
  const [withHistory] = await db.select({ count: sql<number>`count(*)` }).from(services).where(sql`billingHistory IS NOT NULL AND billingHistory != '[]' AND billingHistory != ''`);

  // Count active customers (those with at least 1 service)
  const [activeCusts] = await db.select({ count: sql<number>`count(*)` }).from(customers).where(sql`serviceCount > 0`);

  // AVC coverage
  const [withAvc] = await db.select({ count: sql<number>`count(*)` }).from(services).where(sql`connectionId IS NOT NULL AND connectionId != ''`);
  const [withoutAvc] = await db.select({ count: sql<number>`count(*)` }).from(services).where(sql`connectionId IS NULL OR connectionId = ''`);

  // Flagged and terminated counts
  const [flaggedCount2] = await db.select({ count: sql<number>`count(*)` }).from(services).where(eq(services.status, 'flagged_for_termination'));
  const [terminatedCount] = await db.select({ count: sql<number>`count(*)` }).from(services).where(eq(services.status, 'terminated'));

  // No data use count
  const [noDataUseCount] = await db.select({ count: sql<number>`count(*)` }).from(services).where(eq(services.noDataUse, 1));

  // Provider breakdown
  const providerBreakdown = await db.select({
    provider: services.provider,
    count: sql<number>`count(*)`,
    cost: sql<string>`COALESCE(SUM(monthlyCost), 0)`,
  }).from(services).groupBy(services.provider);

  return {
    totalCustomers: custCount.count,
    totalLocations: locCount.count,
    totalServices: svcCount.count,
    matchedServices: matchedCount.count,
    unmatchedServices: unmatchedCount.count,
    totalMonthlyCost: parseFloat(totalCost.total),
    servicesByType: Object.fromEntries(typeBreakdown.map(t => [t.serviceType, t.count])),
    servicesByProvider: Object.fromEntries(providerBreakdown.map(p => [p.provider || 'Unknown', { count: p.count, cost: parseFloat(p.cost) }])),
    supplierAccounts: accts.map(sa => ({
      ...sa,
      monthlyCost: parseFloat(sa.monthlyCost),
    })),
    invoiceItemsProcessed: 1773,
    invoiceItemsMatched: 1479,
    activeCustomers: activeCusts.count,
    servicesWithHistory: withHistory.count,
    servicesWithAvc: withAvc.count,
    servicesMissingAvc: withoutAvc.count,
    flaggedServices: flaggedCount2.count,
    terminatedServices: terminatedCount.count,
    noDataUseServices: noDataUseCount.count,
  };
}

export async function getUnmatchedServices() {
  const db = await getDb();
  if (!db) return [];

  // Return all non-active services: unmatched, flagged_for_termination, and terminated
  // This includes both unassigned services AND assigned services that have been flagged/terminated
  const result = await db.select().from(services).where(
    or(
      eq(services.status, 'unmatched'),
      eq(services.status, 'flagged_for_termination'),
      eq(services.status, 'terminated')
    )
  ).orderBy(desc(services.monthlyCost));
  return result.map(s => ({
    ...s,
    monthlyCost: parseFloat(s.monthlyCost),
    billingHistory: s.billingHistory ? JSON.parse(s.billingHistory) : [],
  }));
}

// Helper: extract meaningful address parts, skipping generic prefixes
function extractStreetName(address: string): string | null {
  if (!address || address === 'Unknown Location') return null;
  const genericPrefixes = /^(shop|unit|suite|level|lot|floor|apt|apartment|office|bldg|building|bg|l|g|t)\b/i;
  const parts = address.split(',').map(p => p.trim()).filter(Boolean);
  // Walk through comma-separated parts and find one that looks like a street
  for (const part of parts) {
    // Remove leading numbers/unit identifiers
    const cleaned = part.replace(/^[\d\s\/\-]+/, '').trim();
    if (cleaned.length < 4) continue;
    if (genericPrefixes.test(cleaned)) continue;
    // Look for street-type keywords
    if (/\b(st|street|rd|road|ave|avenue|dr|drive|pl|place|tce|terrace|ct|court|way|blvd|boulevard|cres|crescent|ln|lane|hwy|highway|pde|parade|cir|circuit)\b/i.test(cleaned)) {
      return cleaned;
    }
  }
  // Fallback: try the second part (often the street after unit number)
  if (parts.length >= 2) {
    const second = parts[1].replace(/^[\d\s\/\-]+/, '').trim();
    if (second.length > 5 && !genericPrefixes.test(second)) return second;
  }
  return null;
}

// Helper: normalize phone number for comparison (strip spaces, dashes)
function normalizePhone(phone: string): string {
  return phone.replace(/[\s\-\(\)]/g, '').trim();
}

export async function getSuggestedMatches(serviceExternalId: string) {
  const db = await getDb();
  if (!db) return [];

  const [svc] = await db.select().from(services).where(eq(services.externalId, serviceExternalId)).limit(1);
  if (!svc) return [];

  // Parse dismissed suggestions
  const dismissed: string[] = svc.dismissedSuggestions ? JSON.parse(svc.dismissedSuggestions) : [];

  type SuggestionType = {
    customer: { id: number; externalId: string; name: string; billingPlatforms: string[]; serviceCount: number; monthlyCost: number; unmatchedCount: number; matchedCount: number; status: string };
    confidence: 'high' | 'medium' | 'low';
    reason: string;
    missingInfo: string[];
  };
  const suggestions: SuggestionType[] = [];
  const seenCustIds = new Set<string>();

  function formatCustomer(cust: typeof customers.$inferSelect) {
    return { ...cust, billingPlatforms: cust.billingPlatforms ? JSON.parse(cust.billingPlatforms) : [], monthlyCost: parseFloat(cust.monthlyCost) };
  }

  function buildMissingInfo(): string[] {
    const missing: string[] = [];
    if (!svc.connectionId || svc.connectionId.trim() === '') missing.push('AVC/Connection ID');
    if (!svc.locationAddress || svc.locationAddress === 'Unknown Location') missing.push('Service address');
    return missing;
  }

  async function addSuggestion(custId: string, confidence: 'high' | 'medium' | 'low', reason: string) {
    if (seenCustIds.has(custId)) return;
    if (dismissed.includes(custId)) return;
    seenCustIds.add(custId);
    const [cust] = await db!.select().from(customers).where(eq(customers.externalId, custId)).limit(1);
    if (cust) {
      suggestions.push({
        customer: formatCustomer(cust),
        confidence,
        reason,
        missingInfo: buildMissingInfo(),
      });
    }
  }

  // 1. EXACT phone number match (highest confidence)
  const phone = svc.phoneNumber ? normalizePhone(svc.phoneNumber) : '';
  if (phone.length >= 8) {
    const exactPhoneMatches = await db.select().from(services)
      .where(sql`REPLACE(REPLACE(REPLACE(REPLACE(phoneNumber, ' ', ''), '-', ''), '(', ''), ')', '') = ${phone} AND status = 'active' AND customerExternalId != '' AND externalId != ${svc.externalId}`)
      .limit(5);
    for (const match of exactPhoneMatches) {
      if (match.customerExternalId) {
        await addSuggestion(match.customerExternalId, 'high', `Exact phone number match (${svc.phoneNumber})`);
      }
    }
  }

  // 2. Connection ID prefix match (high confidence)
  if (svc.connectionId && svc.connectionId.trim().length > 5) {
    const connPrefix = svc.connectionId.trim().substring(0, 10);
    const connMatches = await db.select().from(services)
      .where(sql`connectionId LIKE ${connPrefix + '%'} AND status = 'active' AND customerExternalId != ''`)
      .limit(10);
    const custIds = Array.from(new Set(connMatches.map(s => s.customerExternalId).filter((x): x is string => !!x)));
    for (const custId of custIds.slice(0, 3)) {
      await addSuggestion(custId, 'high', `Connection ID prefix match (${connPrefix})`);
    }
  }

  // 3. Supplier account match (medium confidence - same Telstra account)
  if (svc.supplierAccount && svc.supplierAccount.trim() !== '') {
    const acctMatches = await db.select({
      customerExternalId: services.customerExternalId,
      cnt: sql<number>`COUNT(*)`,
    }).from(services)
      .where(sql`supplierAccount = ${svc.supplierAccount} AND status = 'active' AND customerExternalId != ''`)
      .groupBy(services.customerExternalId)
      .orderBy(sql`COUNT(*) DESC`)
      .limit(5);
    for (const match of acctMatches) {
      if (match.customerExternalId) {
        await addSuggestion(
          match.customerExternalId,
          'medium',
          `Same supplier account (${svc.supplierAccount}) — ${match.cnt} matched services`
        );
      }
    }
  }

  // 4. Address street name match (medium confidence, with improved parsing)
  const streetName = extractStreetName(svc.locationAddress || '');
  if (streetName && streetName.length > 5) {
    const addrMatches = await db.select().from(services)
      .where(sql`locationAddress LIKE ${'%' + streetName + '%'} AND status = 'active' AND customerExternalId != ''`)
      .limit(10);
    const custIds = Array.from(new Set(addrMatches.map(s => s.customerExternalId).filter((x): x is string => !!x)));
    for (const custId of custIds.slice(0, 3)) {
      await addSuggestion(custId, 'medium', `Address match: ${streetName}`);
    }
  }

  // 5. Phone area code match for landlines (low confidence, only for 0X XXXX pattern)
  if (phone.length >= 10 && phone.startsWith('0') && !phone.startsWith('04')) {
    // Landline: area code + exchange (first 6 digits meaningful)
    const landlinePrefix = phone.substring(0, 6);
    const landlineMatches = await db.select().from(services)
      .where(sql`REPLACE(REPLACE(REPLACE(REPLACE(phoneNumber, ' ', ''), '-', ''), '(', ''), ')', '') LIKE ${landlinePrefix + '%'} AND status = 'active' AND customerExternalId != ''`)
      .limit(10);
    const custIds = Array.from(new Set(landlineMatches.map(s => s.customerExternalId).filter((x): x is string => !!x)));
    for (const custId of custIds.slice(0, 3)) {
      await addSuggestion(custId, 'low', `Landline area code match (${landlinePrefix.substring(0,2)} ${landlinePrefix.substring(2)})`);
    }
  }

  // Sort: high > medium > low
  const confidenceOrder = { high: 0, medium: 1, low: 2 };
  suggestions.sort((a, b) => confidenceOrder[a.confidence] - confidenceOrder[b.confidence]);

  return suggestions.slice(0, 8);
}

export async function dismissSuggestion(serviceExternalId: string, customerExternalId: string) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  // Get current dismissed list
  const [svc] = await db.select({ dismissedSuggestions: services.dismissedSuggestions }).from(services).where(eq(services.externalId, serviceExternalId)).limit(1);
  const current: string[] = svc?.dismissedSuggestions ? JSON.parse(svc.dismissedSuggestions) : [];
  if (!current.includes(customerExternalId)) {
    current.push(customerExternalId);
  }

  await db.update(services).set({
    dismissedSuggestions: JSON.stringify(current),
  }).where(eq(services.externalId, serviceExternalId));

  return { success: true };
}

export async function assignServiceToCustomer(
  serviceExternalId: string,
  customerExternalId: string,
  locationExternalId?: string
) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  // Get the customer
  const [cust] = await db.select().from(customers).where(eq(customers.externalId, customerExternalId)).limit(1);
  if (!cust) throw new Error('Customer not found');

  // Update the service
  await db.update(services).set({
    customerExternalId: customerExternalId,
    customerName: cust.name,
    status: 'active',
    locationExternalId: locationExternalId || '',
  }).where(eq(services.externalId, serviceExternalId));

  // Update customer counts
  const [svcCount] = await db.select({ count: sql<number>`count(*)` }).from(services).where(eq(services.customerExternalId, customerExternalId));
  const [matchedCount] = await db.select({ count: sql<number>`count(*)` }).from(services).where(sql`customerExternalId = ${customerExternalId} AND status = 'active'`);
  const [unmatchedCount] = await db.select({ count: sql<number>`count(*)` }).from(services).where(sql`customerExternalId = ${customerExternalId} AND status = 'unmatched'`);
  const [costSum] = await db.select({ total: sql<string>`COALESCE(SUM(monthlyCost), 0)` }).from(services).where(sql`customerExternalId = ${customerExternalId} AND status != 'terminated'`);

  await db.update(customers).set({
    serviceCount: svcCount.count,
    matchedCount: matchedCount.count,
    unmatchedCount: unmatchedCount.count,
    monthlyCost: costSum.total,
  }).where(eq(customers.externalId, customerExternalId));

  return { success: true };
}

export async function updateServiceAvc(serviceExternalId: string, connectionId: string) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  await db.update(services).set({
    connectionId: connectionId,
  }).where(eq(services.externalId, serviceExternalId));

  return { success: true };
}

export async function updateServiceNotes(serviceExternalId: string, notes: string, author: string) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  await db.update(services).set({
    discoveryNotes: notes || null,
    notesAuthor: author || null,
    notesUpdatedAt: new Date(),
  }).where(eq(services.externalId, serviceExternalId));

  return { success: true };
}

export async function updateServiceStatus(serviceExternalId: string, status: string) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  await db.update(services).set({
    status: status,
  }).where(eq(services.externalId, serviceExternalId));

  return { success: true };
}

export async function updateServiceCustomerName(serviceExternalId: string, customerName: string) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  await db.update(services).set({
    customerName: customerName,
  }).where(eq(services.externalId, serviceExternalId));

  return { success: true };
}

export async function searchAll(query: string) {
  const db = await getDb();
  if (!db) return { customers: [], services: [] };

  const rawQuery = query.trim();
  const term = `%${rawQuery}%`;
  // Normalize: strip spaces, dashes, parens for phone/number matching
  const digitsOnly = rawQuery.replace(/[\s\-\(\)\.]/g, '');
  const digitsTerm = digitsOnly.length >= 3 ? `%${digitsOnly}%` : null;

  // Search customers by name
  const custResults = await db.select().from(customers).where(
    like(customers.name, term)
  ).limit(10);

  // Build service search conditions across ALL fields
  const svcConditions = [
    like(services.customerName, term),
    like(services.connectionId, term),
    like(services.serviceId, term),
    like(services.locationAddress, term),
    like(services.planName, term),
    like(services.supplierAccount, term),
    like(services.serviceType, term),
    like(services.serviceTypeDetail, term),
    like(services.email, term),
    like(services.ipAddress, term),
    like(services.locId, term),
    like(services.simSerialNumber, term),
    like(services.macAddress, term),
    like(services.modemSerialNumber, term),
    like(services.hardwareType, term),
    like(services.simOwner, term),
    like(services.discoveryNotes, term),
    like(services.imei, term),
    like(services.imsi, term),
    like(services.deviceName, term),
    like(services.deviceType, term),
    like(services.userName, term),
    like(services.flexiplanName, term),
    like(services.provider, term),
    like(services.carbonAlias, term),
    like(services.avcId, term),
    like(services.technology, term),
    like(services.speedTier, term),
    like(services.carbonPlanName, term),
    like(services.carbonServiceId, term),
  ];

  // For phone numbers, also search with digits-only normalization
  // This matches "0436097699" against stored "0436 097 699" and vice versa
  if (digitsTerm) {
    svcConditions.push(
      sql`REPLACE(REPLACE(REPLACE(REPLACE(${services.phoneNumber}, ' ', ''), '-', ''), '(', ''), ')', '') LIKE ${digitsTerm}`
    );
    svcConditions.push(
      sql`REPLACE(REPLACE(REPLACE(REPLACE(${services.serviceId}, ' ', ''), '-', ''), '(', ''), ')', '') LIKE ${digitsTerm}`
    );
  } else {
    svcConditions.push(like(services.phoneNumber, term));
  }

  const svcResults = await db.select().from(services).where(
    or(...svcConditions)
  ).limit(30);

  // Determine which field matched for each service result
  const lowerQuery = rawQuery.toLowerCase();
  const servicesWithMatchField = svcResults.map(s => {
    let matchedField = 'service';
    let matchedValue = '';

    const checkField = (value: string | null, fieldName: string, displayName: string) => {
      if (!value) return false;
      // Check both regular and digits-only match
      if (value.toLowerCase().includes(lowerQuery)) {
        matchedField = displayName;
        matchedValue = value;
        return true;
      }
      if (digitsTerm && fieldName === 'phoneNumber') {
        const normalizedVal = value.replace(/[\s\-\(\)\.]/g, '');
        if (normalizedVal.includes(digitsOnly)) {
          matchedField = displayName;
          matchedValue = value;
          return true;
        }
      }
      return false;
    };

    // Check fields in priority order
    checkField(s.phoneNumber, 'phoneNumber', 'Phone') ||
    checkField(s.serviceId, 'serviceId', 'Service ID') ||
    checkField(s.connectionId, 'connectionId', 'AVC/Connection') ||
    checkField(s.supplierAccount, 'supplierAccount', 'Account') ||
    checkField(s.planName, 'planName', 'Plan') ||
    checkField(s.locationAddress, 'locationAddress', 'Address') ||
    checkField(s.customerName, 'customerName', 'Customer') ||
    checkField(s.serviceType, 'serviceType', 'Type') ||
    checkField(s.serviceTypeDetail, 'serviceTypeDetail', 'Type') ||
    checkField(s.email, 'email', 'Email') ||
    checkField(s.ipAddress, 'ipAddress', 'IP Address') ||
    checkField(s.locId, 'locId', 'Location ID') ||
    checkField(s.simSerialNumber, 'simSerialNumber', 'SIM S/N') ||
    checkField(s.macAddress, 'macAddress', 'MAC Address') ||
    checkField(s.modemSerialNumber, 'modemSerialNumber', 'Modem S/N') ||
    checkField(s.hardwareType, 'hardwareType', 'Hardware') ||
    checkField(s.simOwner, 'simOwner', 'SIM Owner') ||
    checkField(s.imei, 'imei', 'IMEI') ||
    checkField(s.imsi, 'imsi', 'IMSI') ||
    checkField(s.deviceName, 'deviceName', 'Device') ||
    checkField(s.deviceType, 'deviceType', 'Device Type') ||
    checkField(s.userName, 'userName', 'User Name') ||
    checkField(s.flexiplanName, 'flexiplanName', 'Flexiplan') ||
    checkField(s.provider, 'provider', 'Provider') ||
    checkField(s.carbonAlias, 'carbonAlias', 'Carbon Alias') ||
    checkField(s.avcId, 'avcId', 'AVC ID') ||
    checkField(s.technology, 'technology', 'Technology') ||
    checkField(s.speedTier, 'speedTier', 'Speed Tier') ||
    checkField(s.carbonPlanName, 'carbonPlanName', 'Carbon Plan') ||
    checkField(s.carbonServiceId, 'carbonServiceId', 'Carbon ID') ||
    checkField(s.discoveryNotes, 'discoveryNotes', 'Notes');

    return {
      ...s,
      monthlyCost: parseFloat(s.monthlyCost),
      billingHistory: s.billingHistory ? JSON.parse(s.billingHistory) : [],
      matchedField,
      matchedValue,
    };
  });

  return {
    customers: custResults.map(c => ({
      ...c,
      billingPlatforms: c.billingPlatforms ? JSON.parse(c.billingPlatforms) : [],
      monthlyCost: parseFloat(c.monthlyCost),
    })),
    services: servicesWithMatchField,
  };
}

/// ==================== Billing Items Queries ====================

export async function getBillingItems(filters?: {
  matchStatus?: string;
  customerExternalId?: string;
  category?: string;
  billingPlatform?: string;
}) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];
  if (filters?.matchStatus && filters.matchStatus !== 'all') {
    conditions.push(eq(billingItems.matchStatus, filters.matchStatus));
  }
  if (filters?.customerExternalId) {
    conditions.push(eq(billingItems.customerExternalId, filters.customerExternalId));
  }
  if (filters?.category && filters.category !== 'all') {
    conditions.push(eq(billingItems.category, filters.category));
  }
  if (filters?.billingPlatform && filters.billingPlatform !== 'all') {
    conditions.push(eq(billingItems.billingPlatform, filters.billingPlatform));
  }

  const whereClause = conditions.length > 0
    ? conditions.reduce((acc, c) => sql`${acc} AND ${c}`)
    : undefined;

  const result = await db.select().from(billingItems)
    .where(whereClause)
    .orderBy(desc(billingItems.lineAmount));

  return result.map(bi => ({
    ...bi,
    lineAmount: parseFloat(bi.lineAmount),
    unitAmount: parseFloat(bi.unitAmount),
    taxAmount: bi.taxAmount ? parseFloat(bi.taxAmount) : 0,
    quantity: parseFloat(bi.quantity),
    discount: bi.discount ? parseFloat(bi.discount) : 0,
  }));
}

export async function getBillingItemsByService(serviceExternalId: string) {
  const db = await getDb();
  if (!db) return [];

  const result = await db.select().from(billingItems)
    .where(eq(billingItems.serviceExternalId, serviceExternalId));

  return result.map(bi => ({
    ...bi,
    lineAmount: parseFloat(bi.lineAmount),
    unitAmount: parseFloat(bi.unitAmount),
    taxAmount: bi.taxAmount ? parseFloat(bi.taxAmount) : 0,
    quantity: parseFloat(bi.quantity),
    discount: bi.discount ? parseFloat(bi.discount) : 0,
  }));
}

export async function getBillingItemsByCustomer(customerExternalId: string) {
  const db = await getDb();
  if (!db) return [];

  const result = await db.select().from(billingItems)
    .where(eq(billingItems.customerExternalId, customerExternalId))
    .orderBy(desc(billingItems.lineAmount));

  return result.map(bi => ({
    ...bi,
    lineAmount: parseFloat(bi.lineAmount),
    unitAmount: parseFloat(bi.unitAmount),
    taxAmount: bi.taxAmount ? parseFloat(bi.taxAmount) : 0,
    quantity: parseFloat(bi.quantity),
    discount: bi.discount ? parseFloat(bi.discount) : 0,
  }));
}

export async function getBillingSummary() {
  const db = await getDb();
  if (!db) return null;

  const [totals] = await db.select({
    totalItems: sql<number>`count(*)`,
    totalRevenue: sql<string>`COALESCE(SUM(lineAmount), 0)`,
    totalTax: sql<string>`COALESCE(SUM(taxAmount), 0)`,
  }).from(billingItems);

  const statusBreakdown = await db.select({
    matchStatus: billingItems.matchStatus,
    count: sql<number>`count(*)`,
    revenue: sql<string>`COALESCE(SUM(lineAmount), 0)`,
  }).from(billingItems).groupBy(billingItems.matchStatus);

  const categoryBreakdown = await db.select({
    category: billingItems.category,
    count: sql<number>`count(*)`,
    revenue: sql<string>`COALESCE(SUM(lineAmount), 0)`,
  }).from(billingItems).groupBy(billingItems.category).orderBy(sql`SUM(lineAmount) DESC`);

  // Margin stats from services with revenue — compute on-the-fly so they reflect current cost/revenue
  const [marginStats] = await db.select({
    servicesWithRevenue: sql<number>`count(*)`,
    avgMargin: sql<string>`COALESCE(AVG(CASE WHEN monthlyRevenue > 0 THEN (monthlyRevenue - monthlyCost) / monthlyRevenue * 100 ELSE 0 END), 0)`,
    negativeMarginCount: sql<number>`SUM(CASE WHEN (monthlyRevenue - monthlyCost) / monthlyRevenue * 100 < 0 THEN 1 ELSE 0 END)`,
    lowMarginCount: sql<number>`SUM(CASE WHEN (monthlyRevenue - monthlyCost) / monthlyRevenue * 100 >= 0 AND (monthlyRevenue - monthlyCost) / monthlyRevenue * 100 < 20 THEN 1 ELSE 0 END)`,
    totalCost: sql<string>`COALESCE(SUM(monthlyCost), 0)`,
    totalRevenue: sql<string>`COALESCE(SUM(monthlyRevenue), 0)`,
  }).from(services).where(sql`monthlyRevenue > 0`);

  // Unmatched billing contacts (distinct)
  const unmatchedContacts = await db.select({
    contactName: billingItems.contactName,
    count: sql<number>`count(*)`,
    revenue: sql<string>`COALESCE(SUM(lineAmount), 0)`,
  }).from(billingItems)
    .where(eq(billingItems.matchStatus, 'unmatched'))
    .groupBy(billingItems.contactName)
    .orderBy(sql`SUM(lineAmount) DESC`);

  return {
    totalItems: totals.totalItems,
    totalRevenue: parseFloat(totals.totalRevenue),
    totalTax: parseFloat(totals.totalTax),
    statusBreakdown: statusBreakdown.map(s => ({
      ...s,
      revenue: parseFloat(s.revenue),
    })),
    categoryBreakdown: categoryBreakdown.map(c => ({
      ...c,
      revenue: parseFloat(c.revenue),
    })),
    marginStats: {
      servicesWithRevenue: marginStats.servicesWithRevenue,
      avgMargin: parseFloat(marginStats.avgMargin),
      negativeMarginCount: marginStats.negativeMarginCount,
      lowMarginCount: marginStats.lowMarginCount,
      totalCost: parseFloat(marginStats.totalCost),
      totalRevenue: parseFloat(marginStats.totalRevenue),
    },
    unmatchedContacts: unmatchedContacts.map(c => ({
      ...c,
      revenue: parseFloat(c.revenue),
    })),
  };
}

// ==================== Margin Queries ====================

export async function getServicesWithMargin(filters?: {
  marginFilter?: string; // 'all', 'negative', 'low', 'healthy', 'high'
  customerExternalId?: string;
  serviceType?: string;
  provider?: string;
  costReviewNeeded?: boolean;
}) {
  const db = await getDb();
  if (!db) return [];

  // Compute margin on-the-fly from current monthlyCost and monthlyRevenue so it is always fresh
  // even if the stored marginPercent column is stale.
  const computedMargin = sql<string>`CASE WHEN monthlyRevenue > 0 THEN ROUND((monthlyRevenue - monthlyCost) / monthlyRevenue * 100, 2) ELSE 0 END`;
  // For cost review mode, include services regardless of revenue (they may have $0 cost needing review)
  const conditions: ReturnType<typeof sql>[] = filters?.costReviewNeeded ? [] : [sql`monthlyRevenue > 0`];

  if (filters?.marginFilter && filters.marginFilter !== 'all') {
    switch (filters.marginFilter) {
      case 'negative':
        conditions.push(sql`(monthlyRevenue - monthlyCost) / monthlyRevenue * 100 < 0`);
        break;
      case 'low':
        conditions.push(sql`(monthlyRevenue - monthlyCost) / monthlyRevenue * 100 >= 0 AND (monthlyRevenue - monthlyCost) / monthlyRevenue * 100 < 20`);
        break;
      case 'healthy':
        conditions.push(sql`(monthlyRevenue - monthlyCost) / monthlyRevenue * 100 >= 20 AND (monthlyRevenue - monthlyCost) / monthlyRevenue * 100 < 50`);
        break;
      case 'high':
        conditions.push(sql`(monthlyRevenue - monthlyCost) / monthlyRevenue * 100 >= 50`);
        break;
    }
  }

  if (filters?.customerExternalId) {
    conditions.push(eq(services.customerExternalId, filters.customerExternalId));
  }
  if (filters?.serviceType && filters.serviceType !== 'all') {
    conditions.push(eq(services.serviceType, filters.serviceType));
  }
  if (filters?.provider && filters.provider !== 'all') {
    conditions.push(eq(services.provider, filters.provider));
  }

  // Filter to only services flagged for cost review
  if (filters?.costReviewNeeded) {
    conditions.push(like(services.discoveryNotes, '%COST REVIEW NEEDED%'));
  }

  const whereClause = conditions.length > 0 ? conditions.reduce((acc, c) => sql`${acc} AND ${c}`) : sql`1=1`;
  const result = await db.select({
    id: services.id,
    externalId: services.externalId,
    serviceType: services.serviceType,
    serviceTypeDetail: services.serviceTypeDetail,
    planName: services.planName,
    phoneNumber: services.phoneNumber,
    connectionId: services.connectionId,
    customerExternalId: services.customerExternalId,
    customerName: services.customerName,
    locationExternalId: services.locationExternalId,
    locationAddress: services.locationAddress,
    provider: services.provider,
    status: services.status,
    monthlyCost: services.monthlyCost,
    monthlyRevenue: services.monthlyRevenue,
    // Always compute fresh margin from current cost and revenue
    computedMarginPercent: computedMargin,
    billingHistory: services.billingHistory,
    billingPlatform: services.billingPlatform,
    technology: services.technology,
    speedTier: services.speedTier,
    discoveryNotes: services.discoveryNotes,
    createdAt: services.createdAt,
    updatedAt: services.updatedAt,
  }).from(services)
    .where(whereClause)
    .orderBy(asc(computedMargin));

  return result.map(s => ({
    ...s,
    monthlyCost: parseFloat(String(s.monthlyCost)),
    monthlyRevenue: parseFloat(String(s.monthlyRevenue)),
    marginPercent: s.computedMarginPercent ? parseFloat(String(s.computedMarginPercent)) : null,
    billingHistory: s.billingHistory ? JSON.parse(s.billingHistory) : [],
  }));
}

// ==================== Customer Merge ====================

export async function mergeCustomers(primaryExternalId: string, secondaryExternalId: string) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  // Get both customers
  const [primary] = await db.select().from(customers).where(eq(customers.externalId, primaryExternalId)).limit(1);
  const [secondary] = await db.select().from(customers).where(eq(customers.externalId, secondaryExternalId)).limit(1);

  if (!primary || !secondary) throw new Error('Customer not found');

  // Reassign all services from secondary to primary
  await db.update(services).set({
    customerExternalId: primaryExternalId,
    customerName: primary.name,
  }).where(eq(services.customerExternalId, secondaryExternalId));

  // Reassign all locations from secondary to primary
  await db.update(locations).set({
    customerExternalId: primaryExternalId,
    customerName: primary.name,
  }).where(eq(locations.customerExternalId, secondaryExternalId));

  // Reassign billing items
  await db.update(billingItems).set({
    customerExternalId: primaryExternalId,
  }).where(eq(billingItems.customerExternalId, secondaryExternalId));

  // Merge billing platforms
  const primaryPlatforms = primary.billingPlatforms ? JSON.parse(primary.billingPlatforms) : [];
  const secondaryPlatforms = secondary.billingPlatforms ? JSON.parse(secondary.billingPlatforms) : [];
  const mergedPlatforms = Array.from(new Set([...primaryPlatforms, ...secondaryPlatforms]));

  // Merge contact info (prefer non-empty from secondary if primary is empty)
  const mergedContact = {
    contactName: primary.contactName || secondary.contactName || '',
    contactEmail: primary.contactEmail || secondary.contactEmail || '',
    contactPhone: primary.contactPhone || secondary.contactPhone || '',
    siteAddress: primary.siteAddress || secondary.siteAddress || '',
    xeroContactName: primary.xeroContactName || secondary.xeroContactName || '',
    xeroAccountNumber: primary.xeroAccountNumber || secondary.xeroAccountNumber || '',
    notes: [primary.notes, secondary.notes].filter(Boolean).join('\n---\nMerged from ' + secondary.name + ':\n'),
  };

  // Recount services (exclude terminated)
  const [svcCount] = await db.select({ count: sql<number>`count(*)` }).from(services).where(sql`customerExternalId = ${primaryExternalId} AND status != 'terminated'`);
  const [costSum] = await db.select({ total: sql<string>`COALESCE(SUM(monthlyCost), 0)` }).from(services).where(sql`customerExternalId = ${primaryExternalId} AND status != 'terminated'`);
  const [revenueSum] = await db.select({ total: sql<string>`COALESCE(SUM(monthlyRevenue), 0)` }).from(services).where(sql`customerExternalId = ${primaryExternalId} AND status != 'terminated'`);

  // Update primary customer
  await db.update(customers).set({
    billingPlatforms: JSON.stringify(mergedPlatforms),
    serviceCount: svcCount.count,
    monthlyCost: costSum.total,
    monthlyRevenue: revenueSum.total,
    ...mergedContact,
  }).where(eq(customers.externalId, primaryExternalId));

  // Delete secondary customer
  await db.delete(customers).where(eq(customers.externalId, secondaryExternalId));

  return { success: true, mergedInto: primaryExternalId, deleted: secondaryExternalId };
}

// ==================== Billing Platform Management ====================

export async function updateServiceBillingPlatform(serviceExternalId: string, platforms: string[]) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  await db.update(services).set({
    billingPlatform: JSON.stringify(platforms),
  }).where(eq(services.externalId, serviceExternalId));

  return { success: true };
}

export async function updateBillingItemMatch(billingItemId: number, serviceExternalId: string) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  await db.update(billingItems).set({
    serviceExternalId: serviceExternalId,
    matchStatus: 'service-matched',
    matchConfidence: 'manual',
  }).where(eq(billingItems.id, billingItemId));

  // Recalculate service revenue
  const [revSum] = await db.select({
    total: sql<string>`COALESCE(SUM(lineAmount), 0)`,
  }).from(billingItems).where(eq(billingItems.serviceExternalId, serviceExternalId));

  const [svc] = await db.select({ monthlyCost: services.monthlyCost }).from(services).where(eq(services.externalId, serviceExternalId)).limit(1);
  const revenue = parseFloat(revSum.total);
  const cost = svc ? parseFloat(svc.monthlyCost) : 0;
  const margin = revenue > 0 ? ((revenue - cost) / revenue * 100) : 0;

  await db.update(services).set({
    monthlyRevenue: revSum.total,
    marginPercent: margin.toFixed(2),
  }).where(eq(services.externalId, serviceExternalId));

  return { success: true };
}

export async function assignBillingItemToCustomer(billingItemId: number, customerExternalId: string) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  await db.update(billingItems).set({
    customerExternalId: customerExternalId,
    matchStatus: 'customer-matched',
  }).where(eq(billingItems.id, billingItemId));

  return { success: true };
}

export async function getCustomersForMerge(search: string) {
  const db = await getDb();
  if (!db) return [];

  const term = `%${search.trim()}%`;

  // Search customers table (name, xeroContactName, contactName)
  const result = await db.select().from(customers)
    .where(or(
      like(customers.name, term),
      like(customers.xeroContactName, term),
      like(customers.contactName, term),
    ))
    .orderBy(asc(customers.name))
    .limit(20);

  const customerResults = result.map(c => ({
    ...c,
    billingPlatforms: c.billingPlatforms ? JSON.parse(c.billingPlatforms) : [],
    monthlyCost: parseFloat(c.monthlyCost as unknown as string),
    monthlyRevenue: parseFloat(c.monthlyRevenue as unknown as string),
  }));

  // Also search billing_items.contactName for names not yet in customers table
  // This covers cases where a billing contact exists but no customer record has been created
  const billingContacts = await db
    .selectDistinct({ contactName: billingItems.contactName })
    .from(billingItems)
    .where(like(billingItems.contactName, term))
    .limit(10);

  // Find contactNames from billing that are NOT already in the customer results
  const existingNames = new Set([
    ...customerResults.map(c => c.name?.toLowerCase()),
    ...customerResults.map(c => c.xeroContactName?.toLowerCase()),
    ...customerResults.map(c => c.contactName?.toLowerCase()),
  ]);

  for (const bc of billingContacts) {
    if (!bc.contactName) continue;
    const lcName = bc.contactName.toLowerCase();
    if (existingNames.has(lcName)) continue;

    // Check if there's a customer whose xeroContactName matches this billing contactName
    const [matchedCust] = await db.select().from(customers)
      .where(or(
        like(customers.xeroContactName, `%${bc.contactName}%`),
        like(customers.name, `%${bc.contactName}%`),
      ))
      .limit(1);

    if (matchedCust) {
      // Already covered by the main search or a close match exists — skip duplicate
      continue;
    }

    // Return a stub entry so the user can see this billing contact name
    // The externalId will be empty string to signal "no customer record yet"
    customerResults.push({
      id: -1,
      externalId: '',
      name: bc.contactName,
      billingPlatforms: [],
      serviceCount: 0,
      monthlyCost: 0,
      unmatchedCount: 0,
      matchedCount: 0,
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
      businessName: null,
      contactName: bc.contactName,
      contactEmail: null,
      contactPhone: null,
      ownershipType: null,
      siteAddress: null,
      notes: null,
      xeroContactName: bc.contactName,
      xeroAccountNumber: null,
      monthlyRevenue: 0,
      marginPercent: 0,
    } as any);
    existingNames.add(lcName);
  }

  return customerResults;
}

// ==================== Review Page Queries ====================

export interface ReviewIssue {
  id: string;
  type: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  count: number;
  financialImpact?: number;
  items: any[];
}

// Add a review_dismissed table tracking for dismissed issues
// For now we'll use a simple in-memory set (will persist via DB later)

export async function getReviewIssues() {
  const db = await getDb();
  if (!db) return { billingReview: [], accountManagement: [] };

  const billingReview: ReviewIssue[] = [];
  const accountManagement: ReviewIssue[] = [];

  // ============ BILLING REVIEW ============

  // 1. Services Billed in Duplicate — same individual service appears more than once on the SAME invoice.
  //    A customer having multiple different services on one invoice is normal and NOT flagged here.
  const doubleBilledPerInvoice = await db.select({
    serviceExternalId: billingItems.serviceExternalId,
    invoiceNumber: billingItems.invoiceNumber,
    count: sql<number>`count(*)`,
    totalBilled: sql<string>`COALESCE(SUM(lineAmount), 0)`,
  }).from(billingItems)
    .where(sql`serviceExternalId IS NOT NULL AND serviceExternalId != ''`)
    .groupBy(billingItems.serviceExternalId, billingItems.invoiceNumber)
    .having(sql`count(*) > 1`)
    .orderBy(sql`count(*) DESC`);

  // Collapse per-invoice rows to unique services (one service may be duplicated across several invoices)
  const doubleBilledMap = new Map<string, { totalCount: number; totalBilled: number; invoices: string[] }>();
  for (const row of doubleBilledPerInvoice) {
    const key = row.serviceExternalId!;
    if (!doubleBilledMap.has(key)) {
      doubleBilledMap.set(key, { totalCount: 0, totalBilled: 0, invoices: [] });
    }
    const entry = doubleBilledMap.get(key)!;
    entry.totalCount += Number(row.count);
    entry.totalBilled += parseFloat(String(row.totalBilled));
    entry.invoices.push(row.invoiceNumber);
  }

  if (doubleBilledMap.size > 0) {
    const doubleBilledDetails = [];
    for (const [svcId, meta] of Array.from(doubleBilledMap.entries()).slice(0, 50)) {
      // Fetch only the billing items on the affected invoices for this service
      const invoicePlaceholders = meta.invoices.map(inv => sql`${inv}`);
      const items = await db.select({
        id: billingItems.id,
        description: billingItems.description,
        lineAmount: billingItems.lineAmount,
        contactName: billingItems.contactName,
        category: billingItems.category,
        invoiceNumber: billingItems.invoiceNumber,
        invoiceDate: billingItems.invoiceDate,
      }).from(billingItems)
        .where(sql`${billingItems.serviceExternalId} = ${svcId} AND ${billingItems.invoiceNumber} IN (${sql.join(invoicePlaceholders, sql`, `)})`);

      const svc = await db.select({
        planName: services.planName,
        serviceType: services.serviceType,
        phoneNumber: services.phoneNumber,
        connectionId: services.connectionId,
        customerExternalId: services.customerExternalId,
        customerName: services.customerName,
        monthlyCost: services.monthlyCost,
      }).from(services)
        .where(eq(services.externalId, svcId))
        .limit(1);

      doubleBilledDetails.push({
        serviceExternalId: svcId,
        billingItemCount: meta.totalCount,
        totalBilled: meta.totalBilled,
        affectedInvoices: meta.invoices,
        service: svc[0] || null,
        billingItems: items.map(i => ({
          id: i.id,
          description: i.description,
          lineAmount: parseFloat(String(i.lineAmount)),
          contactName: i.contactName,
          category: i.category,
          invoiceNumber: i.invoiceNumber,
          invoiceDate: i.invoiceDate,
        })),
      });
    }

    billingReview.push({
      id: 'double-billed',
      type: 'double-billed',
      severity: 'critical',
      title: 'Services Billed in Duplicate',
      description: 'These individual services appear more than once on the same invoice. This likely indicates a duplicate charge — review and correct in the billing platform.',
      count: doubleBilledMap.size,
      financialImpact: Array.from(doubleBilledMap.values()).reduce((s, d) => s + d.totalBilled, 0),
      items: doubleBilledDetails,
    });
  }

  // 2. Services Not Being Billed (active service with supplier cost but no billing item)
  const unbilledServices = await db.select({
    externalId: services.externalId,
    serviceType: services.serviceType,
    planName: services.planName,
    phoneNumber: services.phoneNumber,
    connectionId: services.connectionId,
    customerExternalId: services.customerExternalId,
    customerName: services.customerName,
    monthlyCost: services.monthlyCost,
    provider: services.provider,
    status: services.status,
  }).from(services)
    .leftJoin(billingItems, sql`${billingItems.serviceExternalId} = ${services.externalId}`)
    .where(sql`${billingItems.id} IS NULL AND ${services.status} != 'terminated' AND ${services.monthlyCost} > 0`)
    .orderBy(desc(services.monthlyCost))
    .limit(100);

  const [unbilledTotals] = await db.select({
    count: sql<number>`count(*)`,
    totalCost: sql<string>`COALESCE(SUM(${services.monthlyCost}), 0)`,
  }).from(services)
    .leftJoin(billingItems, sql`${billingItems.serviceExternalId} = ${services.externalId}`)
    .where(sql`${billingItems.id} IS NULL AND ${services.status} != 'terminated' AND ${services.monthlyCost} > 0`);

  if (unbilledTotals.count > 0) {
    billingReview.push({
      id: 'unbilled-services',
      type: 'unbilled-services',
      severity: 'critical',
      title: 'Services Not Being Billed',
      description: 'Active services with supplier costs but no matching Xero billing item. These represent revenue leakage.',
      count: Number(unbilledTotals.count),
      financialImpact: parseFloat(String(unbilledTotals.totalCost)),
      items: unbilledServices.map(s => ({
        ...s,
        monthlyCost: parseFloat(String(s.monthlyCost)),
      })),
    });
  }

  // 3. Billing With No Matching Service
  const billingNoService = await db.select({
    id: billingItems.id,
    contactName: billingItems.contactName,
    description: billingItems.description,
    lineAmount: billingItems.lineAmount,
    taxAmount: billingItems.taxAmount,
    category: billingItems.category,
    matchStatus: billingItems.matchStatus,
    customerExternalId: billingItems.customerExternalId,
  }).from(billingItems)
    .where(sql`(serviceExternalId IS NULL OR serviceExternalId = '') AND matchStatus = 'unmatched'`)
    .orderBy(desc(billingItems.lineAmount))
    .limit(100);

  const [billingNoServiceTotals] = await db.select({
    count: sql<number>`count(*)`,
    totalRevenue: sql<string>`COALESCE(SUM(lineAmount), 0)`,
  }).from(billingItems)
    .where(sql`(serviceExternalId IS NULL OR serviceExternalId = '') AND matchStatus = 'unmatched'`);

  if (billingNoServiceTotals.count > 0) {
    billingReview.push({
      id: 'billing-no-service',
      type: 'billing-no-service',
      severity: 'critical',
      title: 'Billing With No Matching Service',
      description: 'Xero billing items that cannot be matched to any customer or service. These may be orphaned billing or require new service records.',
      count: Number(billingNoServiceTotals.count),
      financialImpact: parseFloat(String(billingNoServiceTotals.totalRevenue)),
      items: billingNoService.map(b => ({
        ...b,
        lineAmount: parseFloat(String(b.lineAmount)),
        taxAmount: parseFloat(String(b.taxAmount)),
      })),
    });
  }

  // 4. Multiple Services to Same Site
  const multiSiteServices = await db.select({
    customerExternalId: services.customerExternalId,
    customerName: services.customerName,
    count: sql<number>`count(*)`,
    totalCost: sql<string>`COALESCE(SUM(${services.monthlyCost}), 0)`,
  }).from(services)
    .where(sql`${services.customerExternalId} IS NOT NULL AND ${services.customerExternalId} != '' AND ${services.status} != 'terminated'`)
    .groupBy(services.customerExternalId, services.customerName)
    .having(sql`count(*) > 3`)
    .orderBy(sql`count(*) DESC`);

  if (multiSiteServices.length > 0) {
    // Get customer details with address
    const multiSiteDetails = [];
    for (const ms of multiSiteServices.slice(0, 30)) {
      const [cust] = await db.select({
        name: customers.name,
        siteAddress: customers.siteAddress,
      }).from(customers).where(eq(customers.externalId, ms.customerExternalId!));

      const svcList = await db.select({
        externalId: services.externalId,
        serviceType: services.serviceType,
        planName: services.planName,
        phoneNumber: services.phoneNumber,
        connectionId: services.connectionId,
        monthlyCost: services.monthlyCost,
        provider: services.provider,
      }).from(services)
        .where(eq(services.customerExternalId, ms.customerExternalId!))
        .orderBy(desc(services.monthlyCost));

      multiSiteDetails.push({
        customerExternalId: ms.customerExternalId,
        customerName: cust?.name || ms.customerName,
        siteAddress: cust?.siteAddress || '',
        serviceCount: ms.count,
        totalCost: parseFloat(ms.totalCost),
        services: svcList.map(s => ({
          ...s,
          monthlyCost: parseFloat(String(s.monthlyCost)),
        })),
      });
    }

    billingReview.push({
      id: 'multi-service-site',
      type: 'multi-service-site',
      severity: 'info',
      title: 'Multiple Services at Same Site',
      description: 'Customers with more than 3 services. This may be acceptable for large sites but could indicate duplicate or unnecessary services.',
      count: Number(multiSiteServices.length),
      financialImpact: multiSiteServices.reduce((s, m) => s + parseFloat(String(m.totalCost)), 0),
      items: multiSiteDetails,
    });
  }

  // 5. Information Discrepancies (name mismatches between billing and customer)
  const nameMismatches = await db.select({
    billingContactName: billingItems.contactName,
    customerName: customers.name,
    xeroContactName: customers.xeroContactName,
    customerExternalId: customers.externalId,
    count: sql<number>`count(*)`,
    totalRevenue: sql<string>`COALESCE(SUM(${billingItems.lineAmount}), 0)`,
  }).from(billingItems)
    .innerJoin(customers, eq(billingItems.customerExternalId, customers.externalId))
    .where(sql`${billingItems.contactName} != ${customers.name} AND ${billingItems.contactName} != COALESCE(${customers.xeroContactName}, '')`)
    .groupBy(billingItems.contactName, customers.name, customers.xeroContactName, customers.externalId)
    .orderBy(sql`count(*) DESC`);

  if (nameMismatches.length > 0) {
    billingReview.push({
      id: 'name-discrepancy',
      type: 'name-discrepancy',
      severity: 'warning',
      title: 'Name Discrepancies',
      description: 'Billing contact names that differ from customer records. These may indicate incorrect matching or outdated records.',
      count: Number(nameMismatches.length),
      financialImpact: nameMismatches.reduce((s, n) => s + parseFloat(String(n.totalRevenue)), 0),
      items: nameMismatches.map(n => ({
        billingContactName: n.billingContactName,
        customerName: n.customerName,
        xeroContactName: n.xeroContactName,
        customerExternalId: n.customerExternalId,
        billingItemCount: n.count,
        totalRevenue: parseFloat(n.totalRevenue),
      })),
    });
  }

  // 6. Missing Information
  const [missingInfo] = await db.select({
    noPlatform: sql<number>`SUM(CASE WHEN ${services.billingPlatform} IS NULL OR ${services.billingPlatform} = '' OR ${services.billingPlatform} = '[]' THEN 1 ELSE 0 END)`,
    noAvc: sql<number>`SUM(CASE WHEN ${services.connectionId} IS NULL OR ${services.connectionId} = '' THEN 1 ELSE 0 END)`,
    noCustomer: sql<number>`SUM(CASE WHEN ${services.customerExternalId} IS NULL OR ${services.customerExternalId} = '' THEN 1 ELSE 0 END)`,
    noCost: sql<number>`SUM(CASE WHEN ${services.monthlyCost} = 0 OR ${services.monthlyCost} IS NULL THEN 1 ELSE 0 END)`,
    total: sql<number>`count(*)`,
  }).from(services).where(sql`${services.status} != 'terminated'`);

  const missingItems = [];
  if (Number(missingInfo.noCustomer) > 0) {
    missingItems.push({ field: 'Customer Assignment', count: Number(missingInfo.noCustomer), severity: 'critical', description: 'Services not assigned to any customer — cannot be billed or tracked' });
  }
  if (Number(missingInfo.noAvc) > 0) {
    missingItems.push({ field: 'AVC / Connection ID', count: Number(missingInfo.noAvc), severity: 'warning', description: 'Services missing AVC or connection ID — harder to match with supplier invoices' });
  }
  if (Number(missingInfo.noPlatform) > 0) {
    missingItems.push({ field: 'Billing Platform', count: Number(missingInfo.noPlatform), severity: 'warning', description: 'Services without an assigned billing platform (OneBill, SasBoss, ECN, Halo, DataGate)' });
  }
  if (Number(missingInfo.noCost) > 0) {
    missingItems.push({ field: 'Supplier Cost', count: Number(missingInfo.noCost), severity: 'info', description: 'Services with $0 or unknown supplier cost — margin cannot be calculated' });
  }

  if (missingItems.length > 0) {
    billingReview.push({
      id: 'missing-info',
      type: 'missing-info',
      severity: 'warning',
      title: 'Missing Information',
      description: 'Services with incomplete data that prevents full billing assessment.',
      count: missingItems.reduce((s, m) => s + Number(m.count), 0),
      items: missingItems,
    });
  }

  // ============ ACCOUNT MANAGEMENT ============

  // 7. Negative/Low Margin Services — compute margin on-the-fly so stale stored values don't hide real issues
  const negativeMarginServices = await db.select({
    externalId: services.externalId,
    serviceType: services.serviceType,
    planName: services.planName,
    phoneNumber: services.phoneNumber,
    connectionId: services.connectionId,
    customerExternalId: services.customerExternalId,
    customerName: services.customerName,
    monthlyCost: services.monthlyCost,
    monthlyRevenue: services.monthlyRevenue,
    marginPercent: sql<string>`CASE WHEN monthlyRevenue > 0 THEN ROUND((monthlyRevenue - monthlyCost) / monthlyRevenue * 100, 2) ELSE 0 END`,
    provider: services.provider,
  }).from(services)
    .where(sql`${services.monthlyRevenue} > 0 AND (${services.monthlyRevenue} - ${services.monthlyCost}) / ${services.monthlyRevenue} * 100 < 0`)
    .orderBy(asc(sql`(monthlyRevenue - monthlyCost) / monthlyRevenue * 100`))
    .limit(50);

  if (negativeMarginServices.length > 0) {
    const totalLoss = negativeMarginServices.reduce((s, svc) => {
      const cost = parseFloat(String(svc.monthlyCost));
      const rev = parseFloat(String(svc.monthlyRevenue));
      return s + (cost - rev);
    }, 0);

    accountManagement.push({
      id: 'negative-margin',
      type: 'negative-margin',
      severity: 'critical',
      title: 'Negative Margin Services',
      description: 'Services where supplier cost exceeds billing revenue. These are losing money every month and need price adjustment or renegotiation.',
      count: Number(negativeMarginServices.length),
      financialImpact: totalLoss,
      items: negativeMarginServices.map(s => ({
        ...s,
        monthlyCost: parseFloat(String(s.monthlyCost)),
        monthlyRevenue: parseFloat(String(s.monthlyRevenue)),
        marginPercent: parseFloat(String(s.marginPercent)),
        monthlyLoss: parseFloat(String(s.monthlyCost)) - parseFloat(String(s.monthlyRevenue)),
      })),
    });
  }

  // 8. Low Margin Services (0-20%) — compute on-the-fly
  const lowMarginServices = await db.select({
    externalId: services.externalId,
    serviceType: services.serviceType,
    planName: services.planName,
    phoneNumber: services.phoneNumber,
    connectionId: services.connectionId,
    customerExternalId: services.customerExternalId,
    customerName: services.customerName,
    monthlyCost: services.monthlyCost,
    monthlyRevenue: services.monthlyRevenue,
    marginPercent: sql<string>`CASE WHEN monthlyRevenue > 0 THEN ROUND((monthlyRevenue - monthlyCost) / monthlyRevenue * 100, 2) ELSE 0 END`,
    provider: services.provider,
  }).from(services)
    .where(sql`${services.monthlyRevenue} > 0 AND (${services.monthlyRevenue} - ${services.monthlyCost}) / ${services.monthlyRevenue} * 100 >= 0 AND (${services.monthlyRevenue} - ${services.monthlyCost}) / ${services.monthlyRevenue} * 100 < 20`)
    .orderBy(asc(sql`(monthlyRevenue - monthlyCost) / monthlyRevenue * 100`))
    .limit(50);

  if (lowMarginServices.length > 0) {
    accountManagement.push({
      id: 'low-margin',
      type: 'low-margin',
      severity: 'warning',
      title: 'Low Margin Services (<20%)',
      description: 'Services with margins below 20%. Consider price increases at next contract renewal or supplier cost renegotiation.',
      count: Number(lowMarginServices.length),
      items: lowMarginServices.map(s => ({
        ...s,
        monthlyCost: parseFloat(String(s.monthlyCost)),
        monthlyRevenue: parseFloat(String(s.monthlyRevenue)),
        marginPercent: parseFloat(String(s.marginPercent)),
      })),
    });
  }

  // 9. High Margin Services (>50%) — compute on-the-fly
  const highMarginServices = await db.select({
    externalId: services.externalId,
    serviceType: services.serviceType,
    planName: services.planName,
    phoneNumber: services.phoneNumber,
    connectionId: services.connectionId,
    customerExternalId: services.customerExternalId,
    customerName: services.customerName,
    monthlyCost: services.monthlyCost,
    monthlyRevenue: services.monthlyRevenue,
    marginPercent: sql<string>`CASE WHEN monthlyRevenue > 0 THEN ROUND((monthlyRevenue - monthlyCost) / monthlyRevenue * 100, 2) ELSE 0 END`,
    provider: services.provider,
  }).from(services)
    .where(sql`${services.monthlyRevenue} > 0 AND (${services.monthlyRevenue} - ${services.monthlyCost}) / ${services.monthlyRevenue} * 100 >= 50`)
    .orderBy(desc(sql`(monthlyRevenue - monthlyCost) / monthlyRevenue * 100`))
    .limit(50);

  if (highMarginServices.length > 0) {
    accountManagement.push({
      id: 'high-margin',
      type: 'high-margin',
      severity: 'info',
      title: 'High Margin Services (>50%)',
      description: 'Services with healthy margins above 50%. These are your most profitable services — protect these relationships.',
      count: Number(highMarginServices.length),
      items: highMarginServices.map(s => ({
        ...s,
        monthlyCost: parseFloat(String(s.monthlyCost)),
        monthlyRevenue: parseFloat(String(s.monthlyRevenue)),
        marginPercent: parseFloat(String(s.marginPercent)),
      })),
    });
  }

  // 10. Contract Expiry
  const contractServices = await db.select({
    externalId: services.externalId,
    serviceType: services.serviceType,
    planName: services.planName,
    phoneNumber: services.phoneNumber,
    connectionId: services.connectionId,
    customerExternalId: services.customerExternalId,
    customerName: services.customerName,
    monthlyCost: services.monthlyCost,
    monthlyRevenue: services.monthlyRevenue,
    contractEndDate: services.contractEndDate,
    provider: services.provider,
  }).from(services)
    .where(sql`${services.contractEndDate} IS NOT NULL AND ${services.contractEndDate} != ''`)
    .orderBy(asc(services.contractEndDate));

  if (contractServices.length > 0) {
    // Convert Excel serial dates to real dates
    const now = new Date();
    const excelEpoch = new Date(1899, 11, 30); // Excel epoch
    const contractItems = contractServices.map(s => {
      const serialNum = parseInt(String(s.contractEndDate));
      let endDate: Date | null = null;
      let status = 'unknown';
      if (!isNaN(serialNum) && serialNum > 40000 && serialNum < 60000) {
        endDate = new Date(excelEpoch.getTime() + serialNum * 86400000);
        const daysUntil = Math.floor((endDate.getTime() - now.getTime()) / 86400000);
        if (daysUntil < 0) status = 'expired';
        else if (daysUntil < 90) status = 'expiring-soon';
        else status = 'active';
      }
      return {
        ...s,
        monthlyCost: parseFloat(String(s.monthlyCost)),
        monthlyRevenue: parseFloat(String(s.monthlyRevenue)),
        contractEndDateFormatted: endDate ? endDate.toISOString().split('T')[0] : s.contractEndDate,
        contractStatus: status,
        daysUntilExpiry: endDate ? Math.floor((endDate.getTime() - now.getTime()) / 86400000) : null,
      };
    });

    const expired = contractItems.filter(c => c.contractStatus === 'expired');
    const expiringSoon = contractItems.filter(c => c.contractStatus === 'expiring-soon');

    if (expired.length > 0) {
      accountManagement.push({
        id: 'expired-contracts',
        type: 'expired-contracts',
        severity: 'critical',
        title: 'Expired Contracts',
        description: 'Services with contracts that have already expired. These should be renewed or renegotiated immediately.',
        count: Number(expired.length),
        items: expired,
      });
    }

    if (expiringSoon.length > 0) {
      accountManagement.push({
        id: 'expiring-contracts',
        type: 'expiring-contracts',
        severity: 'warning',
        title: 'Contracts Expiring Within 90 Days',
        description: 'Services with contracts expiring soon. Plan renewals or renegotiations proactively.',
        count: Number(expiringSoon.length),
        items: expiringSoon,
      });
    }
  }

  // 11. No Data Use services still costing money
  const noDataCostServices = await db.select({
    externalId: services.externalId,
    serviceType: services.serviceType,
    planName: services.planName,
    phoneNumber: services.phoneNumber,
    simSerialNumber: services.simSerialNumber,
    customerExternalId: services.customerExternalId,
    customerName: services.customerName,
    monthlyCost: services.monthlyCost,
    provider: services.provider,
  }).from(services)
    .where(sql`${services.noDataUse} = 1 AND ${services.monthlyCost} > 0 AND ${services.status} != 'terminated'`)
    .orderBy(desc(services.monthlyCost))
    .limit(50);

  if (noDataCostServices.length > 0) {
    const totalWaste = noDataCostServices.reduce((s, svc) => s + parseFloat(String(svc.monthlyCost)), 0);
    accountManagement.push({
      id: 'no-data-cost',
      type: 'no-data-cost',
      severity: 'warning',
      title: 'No Data Use Services Still Costing Money',
      description: 'Services flagged as having zero data usage across all billing periods but still incurring supplier costs. Consider termination.',
      count: Number(noDataCostServices.length),
      financialImpact: totalWaste,
      items: noDataCostServices.map(s => ({
        ...s,
        monthlyCost: parseFloat(String(s.monthlyCost)),
      })),
    });
  }

  // 12. Services with billing but customer-only match (need service-level match)
  const [customerOnlyCount] = await db.select({
    count: sql<number>`count(*)`,
    totalRevenue: sql<string>`COALESCE(SUM(lineAmount), 0)`,
  }).from(billingItems)
    .where(eq(billingItems.matchStatus, 'customer-matched'));

  if (customerOnlyCount.count > 0) {
    accountManagement.push({
      id: 'customer-only-billing',
      type: 'customer-only-billing',
      severity: 'info',
      title: 'Billing Matched to Customer Only',
      description: 'Billing items matched to a customer but not to a specific service. Service-level matching enables accurate margin calculation.',
      count: Number(customerOnlyCount.count),
      financialImpact: parseFloat(String(customerOnlyCount.totalRevenue)),
      items: [],
    });
  }

  return { billingReview, accountManagement };
}

// Internal helper: insert an 'ignored' record only if one doesn't already exist for this issue+item
async function _persistIgnored(db: ReturnType<typeof drizzle>, issueType: string, targetId: string, targetName: string, note: string, submittedBy: string) {
  const existing = await db.select({ id: reviewItems.id }).from(reviewItems)
    .where(sql`${reviewItems.type} = 'ignored' AND ${reviewItems.issueType} = ${issueType} AND ${reviewItems.targetId} = ${targetId}`)
    .limit(1);
  if (existing.length === 0) {
    await db.insert(reviewItems).values({
      type: 'ignored',
      targetType: 'service',
      targetId,
      targetName,
      issueType,
      note,
      submittedBy,
      status: 'open',
    });
  }
}

// Mark a review issue item as resolved/ignored — always persists to DB so the item is filtered from the list
export async function resolveReviewIssue(issueType: string, itemId: string, action: 'resolve' | 'ignore' | 'flag', notes?: string, submittedBy = 'system') {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  // For flag action: update service status then persist
  if (action === 'flag') {
    await db.update(services).set({
      status: 'flagged_for_termination',
    }).where(eq(services.externalId, itemId));
    await _persistIgnored(db, issueType, itemId, itemId, notes || 'Flagged for termination', submittedBy);
    return { success: true };
  }

  // For resolve/ignore actions: optionally update service notes for specific issue types
  if (issueType === 'multi-service-site') {
    const existing = await db.select({ discoveryNotes: services.discoveryNotes }).from(services)
      .where(eq(services.customerExternalId, itemId)).limit(1);
    const currentNotes = existing[0]?.discoveryNotes || '';
    const newNote = `[REVIEWED] Multiple services at this site reviewed and accepted. ${notes || ''}`;
    if (!currentNotes.includes('[REVIEWED]')) {
      await db.update(services).set({
        discoveryNotes: currentNotes ? `${currentNotes}\n${newNote}` : newNote,
      }).where(eq(services.customerExternalId, itemId));
    }
  } else if (issueType === 'double-billed') {
    const svc = await db.select({ discoveryNotes: services.discoveryNotes }).from(services)
      .where(eq(services.externalId, itemId)).limit(1);
    const currentNotes = svc[0]?.discoveryNotes || '';
    const newNote = `[BILLING REVIEWED] Duplicate billing items confirmed correct. ${notes || ''}`;
    if (!currentNotes.includes('[BILLING REVIEWED]')) {
      await db.update(services).set({
        discoveryNotes: currentNotes ? `${currentNotes}\n${newNote}` : newNote,
      }).where(eq(services.externalId, itemId));
    }
  }

  // Always persist as 'ignored' so the item disappears from the review list
  await _persistIgnored(db, issueType, itemId, itemId, notes || 'Marked as reviewed', submittedBy);
  return { success: true };
}

// ==================== Review Items (Manual Submissions & Ignored) ====================;

export async function submitForReview(input: {
  targetType: 'service' | 'customer' | 'billing-item';
  targetId: string;
  targetName: string;
  note: string;
  submittedBy: string;
}) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  await db.insert(reviewItems).values({
    type: 'manual',
    targetType: input.targetType,
    targetId: input.targetId,
    targetName: input.targetName,
    note: input.note,
    submittedBy: input.submittedBy,
    status: 'open',
  });

  return { success: true };
}

export async function ignoreReviewIssue(input: {
  issueType: string;
  targetType: 'service' | 'customer' | 'billing-item';
  targetId: string;
  targetName: string;
  note: string;
  submittedBy: string;
}) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  await db.insert(reviewItems).values({
    type: 'ignored',
    targetType: input.targetType,
    targetId: input.targetId,
    targetName: input.targetName,
    issueType: input.issueType,
    note: input.note,
    submittedBy: input.submittedBy,
    status: 'open',
  });

  return { success: true };
}

export async function getManualReviewItems() {
  const db = await getDb();
  if (!db) return [];

  const result = await db.select().from(reviewItems)
    .where(eq(reviewItems.type, 'manual'))
    .orderBy(desc(reviewItems.createdAt));

  return result;
}

export async function getIgnoredIssues() {
  const db = await getDb();
  if (!db) return [];

  const result = await db.select().from(reviewItems)
    .where(eq(reviewItems.type, 'ignored'))
    .orderBy(desc(reviewItems.createdAt));

  return result;
}

export async function resolveManualReview(id: number, resolvedBy: string, resolvedNote: string) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  await db.update(reviewItems).set({
    status: 'resolved',
    resolvedBy,
    resolvedNote,
    resolvedAt: new Date(),
  }).where(eq(reviewItems.id, id));

  return { success: true };
}

export async function isIssueIgnored(issueType: string, targetId: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const result = await db.select({ id: reviewItems.id }).from(reviewItems)
    .where(sql`${reviewItems.type} = 'ignored' AND ${reviewItems.issueType} = ${issueType} AND ${reviewItems.targetId} = ${targetId}`)
    .limit(1);

  return result.length > 0;
}

// ─── Service Reassignment ────────────────────────────────────────────────────

export async function reassignService(
  serviceExternalId: string,
  newCustomerExternalId: string | null,
  newCustomerName: string | null,
  reassignedBy: string,
  reason: string
) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  const current = await db.select().from(services).where(eq(services.externalId, serviceExternalId)).limit(1);
  if (!current.length) throw new Error('Service not found');

  const oldCustomerId = current[0].customerExternalId;
  const oldCustomerName = current[0].customerName;
  const existingNotes = current[0].discoveryNotes || '';
  const logEntry = `[Reassigned by ${reassignedBy} on ${new Date().toLocaleDateString()}: ${reason}]`;

  await db.update(services).set({
    customerExternalId: newCustomerExternalId,
    customerName: newCustomerName,
    status: newCustomerExternalId ? 'active' : 'unmatched',
    discoveryNotes: existingNotes ? `${logEntry} ${existingNotes}` : logEntry,
  }).where(eq(services.externalId, serviceExternalId));

  return { success: true, serviceExternalId, oldCustomerId, oldCustomerName, newCustomerExternalId, newCustomerName };
}

// ─── Billing Item Association ─────────────────────────────────────────────────

export async function associateBillingItem(
  billingItemId: number,
  customerExternalId: string | null,
  customerName: string | null,
  serviceExternalId: string | null,
  associatedBy: string
) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  let matchStatus = 'unmatched';
  if (customerExternalId && serviceExternalId) matchStatus = 'service-matched';
  else if (customerExternalId) matchStatus = 'customer-matched';

  await db.update(billingItems).set({
    customerExternalId,
    serviceExternalId,
    matchStatus,
  }).where(eq(billingItems.id, billingItemId));

  return { success: true, billingItemId, matchStatus };
}

// ─── Get services for a customer (for reassignment target lookup) ─────────────

export async function getServicesByCustomerForReassign(customerExternalId: string) {
  const db = await getDb();
  if (!db) return [];
  return await db.select({
    externalId: services.externalId,
    serviceType: services.serviceType,
    planName: services.planName,
    avcId: services.avcId,
    monthlyCost: services.monthlyCost,
  }).from(services)
    .where(eq(services.customerExternalId, customerExternalId))
    .orderBy(services.serviceType)
    .limit(50);
}

// ─── Service Full Edit ────────────────────────────────────────────────────────

export async function updateServiceFields(
  serviceExternalId: string,
  updates: {
    serviceTypeDetail?: string;
    planName?: string;
    status?: string;
    locationAddress?: string;
    phoneNumber?: string;
    email?: string;
    connectionId?: string;
    avcId?: string;
    ipAddress?: string;
    technology?: string;
    speedTier?: string;
    billingPlatform?: string[] | null;
    simSerialNumber?: string;
    hardwareType?: string;
    macAddress?: string;
    modemSerialNumber?: string;
    wifiPassword?: string;
    simOwner?: string;
    dataPlanGb?: string;
    userName?: string;
    contractEndDate?: string;
    serviceActivationDate?: string;
    serviceEndDate?: string;
    proposedPlan?: string;
    proposedCost?: string;
    discoveryNotes?: string;
    // Reassign
    customerExternalId?: string | null;
    customerName?: string | null;
  },
  editedBy: string,
  reason?: string
) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  const current = await db.select().from(services).where(eq(services.externalId, serviceExternalId)).limit(1);
  if (!current.length) throw new Error('Service not found');
  const old = current[0];

  // Track changes for audit log
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  const setValues: Record<string, unknown> = {};

  const trackField = (field: string, newVal: unknown, oldVal: unknown) => {
    const newStr = newVal === null || newVal === undefined ? '' : String(newVal);
    const oldStr = oldVal === null || oldVal === undefined ? '' : String(oldVal);
    if (newStr !== oldStr) {
      changes[field] = { from: oldVal, to: newVal };
      setValues[field] = newVal;
    }
  };

  if (updates.serviceTypeDetail !== undefined) trackField('serviceTypeDetail', updates.serviceTypeDetail, old.serviceTypeDetail);
  if (updates.planName !== undefined) trackField('planName', updates.planName, old.planName);
  if (updates.status !== undefined) trackField('status', updates.status, old.status);
  if (updates.locationAddress !== undefined) trackField('locationAddress', updates.locationAddress, old.locationAddress);
  if (updates.phoneNumber !== undefined) trackField('phoneNumber', updates.phoneNumber, old.phoneNumber);
  if (updates.email !== undefined) trackField('email', updates.email, old.email);
  if (updates.connectionId !== undefined) trackField('connectionId', updates.connectionId, old.connectionId);
  if (updates.avcId !== undefined) trackField('avcId', updates.avcId, old.avcId);
  if (updates.ipAddress !== undefined) trackField('ipAddress', updates.ipAddress, old.ipAddress);
  if (updates.technology !== undefined) trackField('technology', updates.technology, old.technology);
  if (updates.speedTier !== undefined) trackField('speedTier', updates.speedTier, old.speedTier);
  if (updates.simSerialNumber !== undefined) trackField('simSerialNumber', updates.simSerialNumber, old.simSerialNumber);
  if (updates.hardwareType !== undefined) trackField('hardwareType', updates.hardwareType, old.hardwareType);
  if (updates.macAddress !== undefined) trackField('macAddress', updates.macAddress, old.macAddress);
  if (updates.modemSerialNumber !== undefined) trackField('modemSerialNumber', updates.modemSerialNumber, old.modemSerialNumber);
  if (updates.wifiPassword !== undefined) trackField('wifiPassword', updates.wifiPassword, old.wifiPassword);
  if (updates.simOwner !== undefined) trackField('simOwner', updates.simOwner, old.simOwner);
  if (updates.dataPlanGb !== undefined) trackField('dataPlanGb', updates.dataPlanGb, old.dataPlanGb);
  if (updates.userName !== undefined) trackField('userName', updates.userName, old.userName);
  if (updates.contractEndDate !== undefined) trackField('contractEndDate', updates.contractEndDate, old.contractEndDate);
  if (updates.serviceActivationDate !== undefined) trackField('serviceActivationDate', updates.serviceActivationDate, old.serviceActivationDate);
  if (updates.serviceEndDate !== undefined) trackField('serviceEndDate', updates.serviceEndDate, old.serviceEndDate);
  if (updates.proposedPlan !== undefined) trackField('proposedPlan', updates.proposedPlan, old.proposedPlan);
  if (updates.proposedCost !== undefined) trackField('proposedCost', updates.proposedCost, old.proposedCost);
  if (updates.discoveryNotes !== undefined) trackField('discoveryNotes', updates.discoveryNotes, old.discoveryNotes);

  if (updates.billingPlatform !== undefined) {
    const newPlatform = updates.billingPlatform ? JSON.stringify(updates.billingPlatform) : null;
    const oldPlatform = old.billingPlatform;
    if (newPlatform !== oldPlatform) {
      changes['billingPlatform'] = { from: oldPlatform, to: newPlatform };
      setValues['billingPlatform'] = newPlatform;
    }
  }

  // Handle customer reassignment
  if (updates.customerExternalId !== undefined) {
    trackField('customerExternalId', updates.customerExternalId, old.customerExternalId);
    trackField('customerName', updates.customerName ?? '', old.customerName);
    if (updates.customerExternalId !== old.customerExternalId) {
      setValues['status'] = updates.customerExternalId ? 'active' : 'unmatched';
      changes['status'] = { from: old.status, to: setValues['status'] };
    }
  }

  if (Object.keys(setValues).length === 0) {
    return { success: true, serviceExternalId, changes: {} };
  }

  await db.update(services).set(setValues).where(eq(services.externalId, serviceExternalId));

  // Write audit log
  if (Object.keys(changes).length > 0) {
    await db.insert(serviceEditHistory).values({
      serviceExternalId,
      editedBy,
      changes: JSON.stringify(changes),
      reason: reason || null,
    });
  }

  return { success: true, serviceExternalId, changes };
}

export async function getServiceEditHistory(serviceExternalId: string) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(serviceEditHistory)
    .where(eq(serviceEditHistory.serviceExternalId, serviceExternalId))
    .orderBy(desc(serviceEditHistory.createdAt))
    .limit(50);
}

// ─── Billing Platform Checks ──────────────────────────────────────────────────

export async function createBillingPlatformCheck(input: {
  reviewItemId?: number;
  targetType: 'service' | 'billing-item';
  targetId: string;
  targetName: string;
  platform: string;
  issueType: string;
  issueDescription: string;
  customerName: string;
  customerExternalId: string;
  monthlyAmount: number;
  priority: 'critical' | 'high' | 'medium' | 'low';
  createdBy: string;
}) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const result = await db.insert(billingPlatformChecks).values({
    reviewItemId: input.reviewItemId ?? null,
    targetType: input.targetType,
    targetId: input.targetId,
    targetName: input.targetName,
    platform: input.platform,
    issueType: input.issueType,
    issueDescription: input.issueDescription,
    customerName: input.customerName,
    customerExternalId: input.customerExternalId,
    monthlyAmount: String(input.monthlyAmount),
    priority: input.priority,
    status: 'open',
    createdBy: input.createdBy,
  });
  return { id: Number((result as any).insertId), ...input };
}

export async function getBillingPlatformChecks(filters?: {
  status?: string;
  platform?: string;
  priority?: string;
  search?: string;
}) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];
  if (filters?.status && filters.status !== 'all') {
    conditions.push(eq(billingPlatformChecks.status, filters.status));
  }
  if (filters?.platform && filters.platform !== 'all') {
    conditions.push(eq(billingPlatformChecks.platform, filters.platform));
  }
  if (filters?.priority && filters.priority !== 'all') {
    conditions.push(eq(billingPlatformChecks.priority, filters.priority));
  }
  if (filters?.search && filters.search.trim()) {
    const term = `%${filters.search.trim()}%`;
    conditions.push(
      or(
        like(billingPlatformChecks.targetName, term),
        like(billingPlatformChecks.customerName, term),
        like(billingPlatformChecks.issueType, term),
        like(billingPlatformChecks.platform, term)
      )
    );
  }

  const whereClause = conditions.length > 0
    ? conditions.reduce((acc, c) => sql`${acc} AND ${c}`)
    : undefined;

  const result = await db.select().from(billingPlatformChecks)
    .where(whereClause)
    .orderBy(
      sql`FIELD(${billingPlatformChecks.priority}, 'critical', 'high', 'medium', 'low')`,
      desc(billingPlatformChecks.createdAt)
    );

  return result.map(c => ({
    ...c,
    monthlyAmount: parseFloat(String(c.monthlyAmount ?? '0')),
  }));
}

export async function actionBillingPlatformCheck(
  id: number,
  actionedBy: string,
  actionedNote: string,
  newStatus: 'actioned' | 'dismissed' | 'in-progress'
) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  await db.update(billingPlatformChecks).set({
    status: newStatus,
    actionedBy,
    actionedNote,
    actionedAt: newStatus === 'actioned' || newStatus === 'dismissed' ? new Date() : null,
  }).where(eq(billingPlatformChecks.id, id));
  return { success: true, id, status: newStatus };
}

export async function getBillingPlatformCheckSummary() {
  const db = await getDb();
  if (!db) return { total: 0, open: 0, inProgress: 0, actioned: 0, dismissed: 0, byPlatform: {} };

  const counts = await db.select({
    status: billingPlatformChecks.status,
    count: sql<number>`count(*)`,
  }).from(billingPlatformChecks).groupBy(billingPlatformChecks.status);

  const byPlatform = await db.select({
    platform: billingPlatformChecks.platform,
    count: sql<number>`count(*)`,
    open: sql<number>`SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END)`,
  }).from(billingPlatformChecks).groupBy(billingPlatformChecks.platform);

  const statusMap: Record<string, number> = {};
  let total = 0;
  for (const c of counts) {
    statusMap[c.status] = Number(c.count);
    total += Number(c.count);
  }

  return {
    total,
    open: statusMap['open'] || 0,
    inProgress: statusMap['in-progress'] || 0,
    actioned: statusMap['actioned'] || 0,
    dismissed: statusMap['dismissed'] || 0,
    byPlatform: Object.fromEntries(byPlatform.map(p => [p.platform, { total: Number(p.count), open: Number(p.open) }])),
  };
}

// ─── Auto-Match: Alias → Customer ────────────────────────────────────────────

/**
 * Levenshtein distance for fuzzy string comparison.
 */
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/**
 * Normalise a string for comparison: lowercase, remove punctuation/extra spaces.
 */
function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(pty|ltd|pty ltd|limited|the|and|&|of|for|at|in|on)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Token overlap score (Jaccard similarity on word sets).
 */
function tokenOverlap(a: string, b: string): number {
  const setA = new Set(normalise(a).split(' ').filter(Boolean));
  const setB = new Set(normalise(b).split(' ').filter(Boolean));
  if (setA.size === 0 || setB.size === 0) return 0;
  const arrA = Array.from(setA);
  const arrB = Array.from(setB);
  const intersection = arrA.filter(t => setB.has(t)).length;
  const union = new Set(arrA.concat(arrB)).size;
  return intersection / union;
}

/**
 * Score an alias against a customer name.
 * Returns 0–100 confidence score and a match tier label.
 */
function scoreMatch(alias: string, customerName: string): { score: number; tier: string } {
  const aliasN = normalise(alias);
  const custN = normalise(customerName);

  // Skip address-style aliases (NBN/NBNEE prefix) — they shouldn't match customer names
  if (/^nbn(ee)?:/i.test(alias.trim())) {
    return { score: 0, tier: 'skip' };
  }

  // Exact normalised match
  if (aliasN === custN) return { score: 100, tier: 'exact' };

  // One contains the other
  if (aliasN.includes(custN) || custN.includes(aliasN)) {
    const shorter = Math.min(aliasN.length, custN.length);
    const longer = Math.max(aliasN.length, custN.length);
    const ratio = shorter / longer;
    return { score: Math.round(85 * ratio + 10), tier: 'contains' };
  }

  // Token overlap (Jaccard)
  const jaccard = tokenOverlap(alias, customerName);
  if (jaccard >= 0.7) return { score: Math.round(jaccard * 80), tier: 'token-high' };
  if (jaccard >= 0.4) return { score: Math.round(jaccard * 65), tier: 'token-medium' };

  // Levenshtein on normalised strings (only if short enough to be meaningful)
  if (aliasN.length < 60 && custN.length < 60) {
    const dist = levenshtein(aliasN, custN);
    const maxLen = Math.max(aliasN.length, custN.length);
    const similarity = 1 - dist / maxLen;
    if (similarity >= 0.85) return { score: Math.round(similarity * 75), tier: 'fuzzy-high' };
    if (similarity >= 0.65) return { score: Math.round(similarity * 55), tier: 'fuzzy-medium' };
  }

  return { score: 0, tier: 'no-match' };
}

export interface AliasMatchCandidate {
  serviceExternalId: string;
  serviceType: string;
  provider: string;
  carbonAlias: string;
  currentCustomerExternalId: string | null;
  currentCustomerName: string;
  suggestedCustomerExternalId: string;
  suggestedCustomerName: string;
  confidence: number;
  tier: string;
  isReassignment: boolean; // true = changing from one customer to another; false = new assignment
}

export async function previewAliasAutoMatch(minConfidence = 60): Promise<{
  candidates: AliasMatchCandidate[];
  stats: { total: number; exact: number; high: number; medium: number; skipped: number };
}> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  // Fetch all ABB/Carbon services with a non-empty alias
  const allServices = await db.select({
    externalId: services.externalId,
    serviceType: services.serviceType,
    provider: services.provider,
    carbonAlias: services.carbonAlias,
    customerExternalId: services.customerExternalId,
    customerName: services.customerName,
    status: services.status,
  }).from(services)
    .where(
      sql`${services.carbonAlias} IS NOT NULL AND ${services.carbonAlias} != '' AND ${services.provider} IN ('ABB', 'Carbon')`
    );

  // Fetch all customers
  const allCustomers = await db.select({
    externalId: customers.externalId,
    name: customers.name,
  }).from(customers);

  const candidates: AliasMatchCandidate[] = [];
  let skipped = 0;

  for (const svc of allServices) {
    if (!svc.carbonAlias) continue;

    // Skip address-style aliases
    if (/^nbn(ee)?:/i.test(svc.carbonAlias.trim())) {
      skipped++;
      continue;
    }

    let bestScore = 0;
    let bestCustomer: { externalId: string; name: string } | null = null;
    let bestTier = 'no-match';

    for (const cust of allCustomers) {
      // Skip if already assigned to this customer and alias matches
      if (cust.externalId === svc.customerExternalId && normalise(svc.carbonAlias) === normalise(cust.name)) {
        continue;
      }

      const { score, tier } = scoreMatch(svc.carbonAlias, cust.name);
      if (score > bestScore) {
        bestScore = score;
        bestCustomer = cust;
        bestTier = tier;
      }
    }

    if (!bestCustomer || bestScore < minConfidence) continue;

    // Skip if the best match IS the current customer (already correct)
    if (bestCustomer.externalId === svc.customerExternalId) continue;

    candidates.push({
      serviceExternalId: svc.externalId,
      serviceType: svc.serviceType,
      provider: svc.provider || 'ABB',
      carbonAlias: svc.carbonAlias,
      currentCustomerExternalId: svc.customerExternalId || null,
      currentCustomerName: svc.customerName || '',
      suggestedCustomerExternalId: bestCustomer.externalId,
      suggestedCustomerName: bestCustomer.name,
      confidence: bestScore,
      tier: bestTier,
      isReassignment: !!(svc.customerExternalId && svc.customerExternalId.trim()),
    });
  }

  // Sort by confidence desc
  candidates.sort((a, b) => b.confidence - a.confidence);

  const stats = {
    total: candidates.length,
    exact: candidates.filter(c => c.tier === 'exact').length,
    high: candidates.filter(c => c.confidence >= 80 && c.tier !== 'exact').length,
    medium: candidates.filter(c => c.confidence >= 60 && c.confidence < 80).length,
    skipped,
  };

  return { candidates, stats };
}

export async function commitAliasAutoMatch(
  approvedMatches: Array<{ serviceExternalId: string; customerExternalId: string; customerName: string }>,
  committedBy: string
): Promise<{ applied: number; errors: string[] }> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  let applied = 0;
  const errors: string[] = [];

  for (const match of approvedMatches) {
    try {
      const current = await db.select({
        customerExternalId: services.customerExternalId,
        customerName: services.customerName,
        discoveryNotes: services.discoveryNotes,
      }).from(services)
        .where(eq(services.externalId, match.serviceExternalId))
        .limit(1);

      if (!current.length) {
        errors.push(`Service ${match.serviceExternalId} not found`);
        continue;
      }

      const old = current[0];
      const logEntry = `[Auto-matched by alias by ${committedBy} on ${new Date().toLocaleDateString('en-AU')}: "${old.customerName}" → "${match.customerName}"]`;
      const newNotes = old.discoveryNotes
        ? `${logEntry}\n${old.discoveryNotes}`
        : logEntry;

      await db.update(services).set({
        customerExternalId: match.customerExternalId,
        customerName: match.customerName,
        status: 'active',
        discoveryNotes: newNotes,
      }).where(eq(services.externalId, match.serviceExternalId));

      // Audit log
      await db.insert(serviceEditHistory).values({
        serviceExternalId: match.serviceExternalId,
        editedBy: committedBy,
        changes: JSON.stringify({
          customerExternalId: { from: old.customerExternalId, to: match.customerExternalId },
          customerName: { from: old.customerName, to: match.customerName },
          status: { from: 'unmatched', to: 'active' },
        }),
        reason: 'Auto-matched via Carbon alias field',
      });

      applied++;
    } catch (err: any) {
      errors.push(`${match.serviceExternalId}: ${err.message}`);
    }
  }

  return { applied, errors };
}

// ─── Terminate Service ────────────────────────────────────────────────────────

/**
 * Marks a service as terminated with the carrier:
 * - Sets status = 'terminated'
 * - Zeroes out monthlyCost and monthlySell so it no longer contributes to costs
 * - Records the original cost in discoveryNotes for audit trail
 * - Recalculates the parent customer's serviceCount, matchedCount, unmatchedCount, monthlyCost
 *   excluding terminated services
 */
export async function terminateService(
  serviceExternalId: string,
  terminatedBy: string,
  reason?: string
) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  // Fetch current service state
  const [svc] = await db.select().from(services).where(eq(services.externalId, serviceExternalId)).limit(1);
  if (!svc) throw new Error('Service not found');

  if (svc.status === 'terminated') {
    return { success: true, alreadyTerminated: true };
  }

  const originalCost = svc.monthlyCost ?? 0;
  const originalSell = (svc as any).monthlySell ?? 0;

  // Build audit note
  const auditNote = `[TERMINATED ${new Date().toISOString().split('T')[0]} by ${terminatedBy}]${reason ? ` Reason: ${reason}.` : ''} Original cost: $${parseFloat(String(originalCost)).toFixed(2)}/mo.`;
  const existingNotes = svc.discoveryNotes ? svc.discoveryNotes + '\n' : '';

  // Update the service
  await db.update(services).set({
    status: 'terminated',
    monthlyCost: '0',
    discoveryNotes: existingNotes + auditNote,
  }).where(eq(services.externalId, serviceExternalId));

  // Log to edit history
  await db.insert(serviceEditHistory).values({
    serviceExternalId,
    editedBy: terminatedBy,
    changes: JSON.stringify({
      status: { from: svc.status, to: 'terminated' },
      monthlyCost: { from: originalCost, to: 0 },
    }),
    reason: reason || 'Terminated with carrier',
  });

  // Recalculate customer totals if service was assigned to a customer
  if (svc.customerExternalId) {
    const custId = svc.customerExternalId;
    // Count all non-terminated services for this customer
    const [svcCount] = await db.select({ count: sql<number>`count(*)` })
      .from(services)
      .where(sql`customerExternalId = ${custId} AND status != 'terminated'`);
    const [matchedCount] = await db.select({ count: sql<number>`count(*)` })
      .from(services)
      .where(sql`customerExternalId = ${custId} AND status = 'active'`);
    const [unmatchedCount] = await db.select({ count: sql<number>`count(*)` })
      .from(services)
      .where(sql`customerExternalId = ${custId} AND status = 'unmatched'`);
    const [costSum] = await db.select({ total: sql<string>`COALESCE(SUM(monthlyCost), 0)` })
      .from(services)
      .where(sql`customerExternalId = ${custId} AND status != 'terminated'`);

    await db.update(customers).set({
      serviceCount: svcCount.count,
      matchedCount: matchedCount.count,
      unmatchedCount: unmatchedCount.count,
      monthlyCost: costSum.total,
    }).where(eq(customers.externalId, custId));

    // If customer now has no active services and no cost, mark as inactive
    if (svcCount.count === 0) {
      await db.update(customers).set({ status: 'inactive' }).where(eq(customers.externalId, custId));
    }
  }

  return { success: true, originalCost: parseFloat(String(originalCost)) };
}

/**
 * Restores a terminated service back to active/unmatched status
 */
export async function restoreTerminatedService(
  serviceExternalId: string,
  restoredBy: string
) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  const [svc] = await db.select().from(services).where(eq(services.externalId, serviceExternalId)).limit(1);
  if (!svc) throw new Error('Service not found');

  const newStatus = svc.customerExternalId ? 'active' : 'unmatched';

  await db.update(services).set({
    status: newStatus,
  }).where(eq(services.externalId, serviceExternalId));

  await db.insert(serviceEditHistory).values({
    serviceExternalId,
    editedBy: restoredBy,
    changes: JSON.stringify({ status: { from: 'terminated', to: newStatus } }),
    reason: 'Service restored from terminated',
  });

  // Recalculate customer totals
  if (svc.customerExternalId) {
    const custId = svc.customerExternalId;
    const [svcCount] = await db.select({ count: sql<number>`count(*)` })
      .from(services)
      .where(sql`customerExternalId = ${custId} AND status != 'terminated'`);
    const [matchedCount] = await db.select({ count: sql<number>`count(*)` })
      .from(services)
      .where(sql`customerExternalId = ${custId} AND status = 'active'`);
    const [unmatchedCount] = await db.select({ count: sql<number>`count(*)` })
      .from(services)
      .where(sql`customerExternalId = ${custId} AND status = 'unmatched'`);
    const [costSum] = await db.select({ total: sql<string>`COALESCE(SUM(monthlyCost), 0)` })
      .from(services)
      .where(sql`customerExternalId = ${custId} AND status != 'terminated'`);

    await db.update(customers).set({
      serviceCount: svcCount.count,
      matchedCount: matchedCount.count,
      unmatchedCount: unmatchedCount.count,
      monthlyCost: costSum.total,
      status: svcCount.count > 0 ? 'active' : 'inactive',
    }).where(eq(customers.externalId, custId));
  }

  return { success: true };
}
