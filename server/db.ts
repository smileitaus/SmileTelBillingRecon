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

export async function getAllCustomers(search?: string, statusFilter?: string, platformFilter?: string) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];

  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    conditions.push(like(customers.name, term));
  }

  if (statusFilter && statusFilter !== 'all') {
    conditions.push(eq(customers.status, statusFilter));
  }

  if (platformFilter && platformFilter !== 'all') {
    conditions.push(like(customers.billingPlatforms, `%${platformFilter}%`));
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

  return {
    totalCustomers: custCount.count,
    totalLocations: locCount.count,
    totalServices: svcCount.count,
    matchedServices: matchedCount.count,
    unmatchedServices: unmatchedCount.count,
    totalMonthlyCost: parseFloat(totalCost.total),
    servicesByType: Object.fromEntries(typeBreakdown.map(t => [t.serviceType, t.count])),
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
