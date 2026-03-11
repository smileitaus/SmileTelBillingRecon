import { eq, like, or, sql, desc, asc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, customers, locations, services, supplierAccounts } from "../drizzle/schema";
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
    } else if (statusFilter === 'terminated') {
      // Filter customers that have at least one terminated service
      conditions.push(
        sql`${customers.externalId} IN (SELECT DISTINCT customerExternalId FROM services WHERE status = 'terminated' AND customerExternalId IS NOT NULL)`
      );
    } else {
      conditions.push(eq(customers.status, statusFilter));
    }
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
  return {
    ...s,
    monthlyCost: parseFloat(s.monthlyCost),
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

  const [totalCost] = await db.select({ total: sql<string>`COALESCE(SUM(monthlyCost), 0)` }).from(services);

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
  const [costSum] = await db.select({ total: sql<string>`COALESCE(SUM(monthlyCost), 0)` }).from(services).where(eq(services.customerExternalId, customerExternalId));

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

// ==================== Billing Items Queries ====================

import { billingItems } from "../drizzle/schema";

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

  // Margin stats from services with revenue
  const [marginStats] = await db.select({
    servicesWithRevenue: sql<number>`count(*)`,
    avgMargin: sql<string>`COALESCE(AVG(marginPercent), 0)`,
    negativeMarginCount: sql<number>`SUM(CASE WHEN marginPercent < 0 THEN 1 ELSE 0 END)`,
    lowMarginCount: sql<number>`SUM(CASE WHEN marginPercent >= 0 AND marginPercent < 20 THEN 1 ELSE 0 END)`,
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
}) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [sql`monthlyRevenue > 0`];

  if (filters?.marginFilter && filters.marginFilter !== 'all') {
    switch (filters.marginFilter) {
      case 'negative':
        conditions.push(sql`marginPercent < 0`);
        break;
      case 'low':
        conditions.push(sql`marginPercent >= 0 AND marginPercent < 20`);
        break;
      case 'healthy':
        conditions.push(sql`marginPercent >= 20 AND marginPercent < 50`);
        break;
      case 'high':
        conditions.push(sql`marginPercent >= 50`);
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

  const whereClause = conditions.reduce((acc, c) => sql`${acc} AND ${c}`);

  const result = await db.select().from(services)
    .where(whereClause)
    .orderBy(asc(sql`marginPercent`));

  return result.map(s => ({
    ...s,
    monthlyCost: parseFloat(s.monthlyCost),
    monthlyRevenue: parseFloat(s.monthlyRevenue),
    marginPercent: s.marginPercent ? parseFloat(s.marginPercent) : null,
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

  // Recount services
  const [svcCount] = await db.select({ count: sql<number>`count(*)` }).from(services).where(eq(services.customerExternalId, primaryExternalId));
  const [costSum] = await db.select({ total: sql<string>`COALESCE(SUM(monthlyCost), 0)` }).from(services).where(eq(services.customerExternalId, primaryExternalId));
  const [revenueSum] = await db.select({ total: sql<string>`COALESCE(SUM(monthlyRevenue), 0)` }).from(services).where(eq(services.customerExternalId, primaryExternalId));

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
  const result = await db.select().from(customers)
    .where(or(
      like(customers.name, term),
      like(customers.xeroContactName, term),
      like(customers.contactName, term),
    ))
    .orderBy(asc(customers.name))
    .limit(20);

  return result.map(c => ({
    ...c,
    billingPlatforms: c.billingPlatforms ? JSON.parse(c.billingPlatforms) : [],
    monthlyCost: parseFloat(c.monthlyCost),
    monthlyRevenue: parseFloat(c.monthlyRevenue),
  }));
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

  // 1. Services Double Billed (same service has multiple billing items)
  const doubleBilled = await db.select({
    serviceExternalId: billingItems.serviceExternalId,
    count: sql<number>`count(*)`,
    totalBilled: sql<string>`COALESCE(SUM(lineAmount), 0)`,
  }).from(billingItems)
    .where(sql`serviceExternalId IS NOT NULL AND serviceExternalId != ''`)
    .groupBy(billingItems.serviceExternalId)
    .having(sql`count(*) > 1`)
    .orderBy(sql`count(*) DESC`);

  if (doubleBilled.length > 0) {
    // Get details for each double-billed service
    const doubleBilledDetails = [];
    for (const db_item of doubleBilled.slice(0, 50)) {
      const items = await db.select({
        id: billingItems.id,
        description: billingItems.description,
        lineAmount: billingItems.lineAmount,
        contactName: billingItems.contactName,
        category: billingItems.category,
      }).from(billingItems)
        .where(eq(billingItems.serviceExternalId, db_item.serviceExternalId!));

      const svc = await db.select({
        planName: services.planName,
        serviceType: services.serviceType,
        phoneNumber: services.phoneNumber,
        connectionId: services.connectionId,
        customerExternalId: services.customerExternalId,
        customerName: services.customerName,
        monthlyCost: services.monthlyCost,
      }).from(services)
        .where(eq(services.externalId, db_item.serviceExternalId!))
        .limit(1);

      doubleBilledDetails.push({
        serviceExternalId: db_item.serviceExternalId,
        billingItemCount: db_item.count,
        totalBilled: parseFloat(db_item.totalBilled),
        service: svc[0] || null,
        billingItems: items.map(i => ({
          id: i.id,
          description: i.description,
          lineAmount: parseFloat(String(i.lineAmount)),
          contactName: i.contactName,
          category: i.category,
        })),
      });
    }

    billingReview.push({
      id: 'double-billed',
      type: 'double-billed',
      severity: 'critical',
      title: 'Services Double Billed',
      description: 'These services have multiple billing line items. Review to ensure charges are correct and not duplicated.',
      count: Number(doubleBilled.length),
      financialImpact: doubleBilled.reduce((s, d) => s + parseFloat(String(d.totalBilled)), 0),
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

  // 7. Negative/Low Margin Services
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
    marginPercent: services.marginPercent,
    provider: services.provider,
  }).from(services)
    .where(sql`${services.monthlyRevenue} > 0 AND ${services.marginPercent} < 0`)
    .orderBy(asc(services.marginPercent))
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

  // 8. Low Margin Services (0-20%)
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
    marginPercent: services.marginPercent,
    provider: services.provider,
  }).from(services)
    .where(sql`${services.monthlyRevenue} > 0 AND ${services.marginPercent} >= 0 AND ${services.marginPercent} < 20`)
    .orderBy(asc(services.marginPercent))
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

  // 9. High Margin Services (>50%)
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
    marginPercent: services.marginPercent,
    provider: services.provider,
  }).from(services)
    .where(sql`${services.monthlyRevenue} > 0 AND ${services.marginPercent} >= 50`)
    .orderBy(desc(services.marginPercent))
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

// Mark a review issue item as resolved/ignored
export async function resolveReviewIssue(issueType: string, itemId: string, action: 'resolve' | 'ignore' | 'flag', notes?: string) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  // For service-related issues, update the service notes
  if (issueType === 'multi-service-site' && action === 'ignore') {
    // Add a note that multiple services at this site have been reviewed and accepted
    const existing = await db.select({ discoveryNotes: services.discoveryNotes }).from(services)
      .where(eq(services.customerExternalId, itemId)).limit(1);
    const currentNotes = existing[0]?.discoveryNotes || '';
    const newNote = `[REVIEWED] Multiple services at this site reviewed and accepted. ${notes || ''}`;
    if (!currentNotes.includes('[REVIEWED]')) {
      await db.update(services).set({
        discoveryNotes: currentNotes ? `${currentNotes}\n${newNote}` : newNote,
      }).where(eq(services.customerExternalId, itemId));
    }
    return { success: true };
  }

  if (issueType === 'double-billed' && action === 'resolve') {
    // User confirms the billing is correct (e.g., bundled services)
    // Add note to the service
    const svc = await db.select({ discoveryNotes: services.discoveryNotes }).from(services)
      .where(eq(services.externalId, itemId)).limit(1);
    const currentNotes = svc[0]?.discoveryNotes || '';
    const newNote = `[BILLING REVIEWED] Multiple billing items confirmed correct. ${notes || ''}`;
    if (!currentNotes.includes('[BILLING REVIEWED]')) {
      await db.update(services).set({
        discoveryNotes: currentNotes ? `${currentNotes}\n${newNote}` : newNote,
      }).where(eq(services.externalId, itemId));
    }
    return { success: true };
  }

  if (action === 'flag') {
    // Flag the service for termination
    await db.update(services).set({
      status: 'flagged_for_termination',
    }).where(eq(services.externalId, itemId));
    return { success: true };
  }

  return { success: true };
}

// ==================== Review Items (Manual Submissions & Ignored) ====================

import { reviewItems } from "../drizzle/schema";

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
