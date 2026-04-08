import { eq, like, or, and, sql, desc, asc, inArray, ne, isNull, count } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, customers, locations, services, supplierAccounts, billingItems, reviewItems, billingPlatformChecks, serviceEditHistory, customerProposals, serviceCostHistory, supplierWorkbookUploads, supplierWorkbookLineItems, customerUsageSummaries, supplierEnterpriseMap, supplierProductMap, serviceBillingMatchLog, serviceBillingAssignments, unbillableServices, escalatedServices, supplierRegistry, supplierInvoiceUploads, supplierServiceMap, supplierProductCostMap, carbonApiCache, serviceOutages, vocusNbnServices, vocusMobileServices, tiabSupplierInvoices, phoneNumbers, revenueGroups, serviceMatchEvents, serviceUsageSnapshots, usageThresholdAlerts, omadaSites, retailBundles } from "../drizzle/schema";
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

export async function getAllCustomers(search?: string, statusFilter?: string, platformFilter?: string, supplierFilter?: string, customerTypeFilter?: string) {
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
    // Default: hide customers with no active services (live count prevents stale serviceCount issues)
    // Exclude both terminated and archived services from the active count
    conditions.push(sql`(SELECT COUNT(*) FROM services WHERE customerExternalId = ${customers.externalId} AND status NOT IN ('terminated', 'archived', 'billing_platform_stub') AND (billingPeriod IS NULL OR billingPeriod != 'archived')) > 0`);
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

  // Filter by customer type (retail_offering vs standard)
  if (customerTypeFilter && customerTypeFilter !== 'all') {
    conditions.push(eq(customers.customerType, customerTypeFilter));
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
    billingPlatforms: c.billingPlatforms ? (() => { try { return JSON.parse(c.billingPlatforms!); } catch { return [c.billingPlatforms]; } })() : [],
    monthlyCost: parseFloat(c.monthlyCost),
    retailBundleMonthlyCost: c.retailBundleMonthlyCost ? parseFloat(c.retailBundleMonthlyCost) : null,
  }));
}
export async function getCustomerById(externalId: string) {
  const db = await getDb();
  if (!db) return null;

  const result = await db.select().from(customers).where(eq(customers.externalId, externalId)).limit(1);
  if (result.length === 0) return null;

  const c = result[0];

  // Resolve parent customer name if set
  let parentCustomerName: string | null = null;
  if (c.parentCustomerExternalId) {
    const parentResult = await db.select({ name: customers.name }).from(customers).where(eq(customers.externalId, c.parentCustomerExternalId)).limit(1);
    if (parentResult.length > 0) parentCustomerName = parentResult[0].name;
  }

  return {
    ...c,
    billingPlatforms: c.billingPlatforms ? (() => { try { return JSON.parse(c.billingPlatforms!); } catch { return [c.billingPlatforms]; } })() : [],
    monthlyCost: parseFloat(c.monthlyCost),
    parentCustomerName,
  };
}

export async function updateCustomer(
  externalId: string,
  updates: {
    name?: string;
    businessName?: string;
    contactName?: string;
    contactEmail?: string;
    contactPhone?: string;
    siteAddress?: string;
    notes?: string;
    xeroContactName?: string;
    xeroAccountNumber?: string;
    ownershipType?: string;
    billingPlatforms?: string[] | null;
  },
  updatedBy: string
) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  const [existing] = await db.select().from(customers).where(eq(customers.externalId, externalId)).limit(1);
  if (!existing) throw new Error('Customer not found');

  const setValues: Record<string, unknown> = {};

  if (updates.name !== undefined && updates.name.trim()) setValues.name = updates.name.trim();
  if (updates.businessName !== undefined) setValues.businessName = updates.businessName;
  if (updates.contactName !== undefined) setValues.contactName = updates.contactName;
  if (updates.contactEmail !== undefined) setValues.contactEmail = updates.contactEmail;
  if (updates.contactPhone !== undefined) setValues.contactPhone = updates.contactPhone;
  if (updates.siteAddress !== undefined) setValues.siteAddress = updates.siteAddress;
  if (updates.notes !== undefined) setValues.notes = updates.notes;
  if (updates.xeroContactName !== undefined) setValues.xeroContactName = updates.xeroContactName;
  if (updates.xeroAccountNumber !== undefined) setValues.xeroAccountNumber = updates.xeroAccountNumber;
  if (updates.ownershipType !== undefined) setValues.ownershipType = updates.ownershipType;
  if (updates.billingPlatforms !== undefined) {
    setValues.billingPlatforms = updates.billingPlatforms ? JSON.stringify(updates.billingPlatforms) : null;
  }

  if (Object.keys(setValues).length === 0) return { success: true };

  await db.update(customers).set(setValues).where(eq(customers.externalId, externalId));

  // If name changed, propagate to all services and locations for this customer
  if (updates.name && updates.name.trim() !== existing.name) {
    const newName = updates.name.trim();
    await db.update(services).set({ customerName: newName }).where(eq(services.customerExternalId, externalId));
    await db.update(locations).set({ customerName: newName }).where(eq(locations.customerExternalId, externalId));
  }

  return { success: true };
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

  const result = await db.select().from(services).where(
    and(
      eq(services.customerExternalId, customerExternalId),
      or(isNull(services.billingPeriod), sql`${services.billingPeriod} != 'archived'`)
    )
  );

  // Determine which services are truly linked to a billing item via service_billing_assignments
  const assignments = await db
    .select({ serviceExternalId: serviceBillingAssignments.serviceExternalId })
    .from(serviceBillingAssignments)
    .where(eq(serviceBillingAssignments.customerExternalId, customerExternalId));
  const linkedIds = new Set(assignments.map(a => a.serviceExternalId));

  // Also check unbillable_services — intentionally unbilled counts as "resolved"
  const unbillable = await db
    .select({ serviceExternalId: unbillableServices.serviceExternalId })
    .from(unbillableServices)
    .where(eq(unbillableServices.customerExternalId, customerExternalId));
  const unbillableIds = new Set(unbillable.map(u => u.serviceExternalId));

  return result.map(s => ({
    ...s,
    monthlyCost: parseFloat(s.monthlyCost),
    billingHistory: s.billingHistory ? JSON.parse(s.billingHistory) : [],
    // True only if service has an entry in service_billing_assignments OR is intentionally unbilled
    billingLinked: linkedIds.has(s.externalId) || unbillableIds.has(s.externalId),
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
  const [svcCount] = await db.select({ count: sql<number>`count(*)` }).from(services).where(sql`status != 'billing_platform_stub'`);

  const [matchedCount] = await db.select({ count: sql<number>`count(*)` }).from(services).where(eq(services.status, 'active'));
  const [unmatchedCount] = await db.select({ count: sql<number>`count(*)` }).from(services).where(eq(services.status, 'unmatched'));

  const [totalCost] = await db.select({ total: sql<string>`COALESCE(SUM(monthlyCost), 0)` }).from(services).where(sql`status NOT IN ('terminated', 'billing_platform_stub')`);

  const typeBreakdown = await db.select({
    serviceType: services.serviceType,
    count: sql<number>`count(*)`,
  }).from(services).where(sql`status != 'billing_platform_stub'`).groupBy(services.serviceType);

  const accts = await db.select().from(supplierAccounts);

  // Count services with non-empty billing history
  const [withHistory] = await db.select({ count: sql<number>`count(*)` }).from(services).where(sql`billingHistory IS NOT NULL AND billingHistory != '[]' AND billingHistory != ''`);

  // Count active customers (those with at least 1 service)
  const [activeCusts] = await db.select({ count: sql<number>`count(*)` }).from(customers).where(sql`serviceCount > 0`);

  // AVC coverage
  const [withAvc] = await db.select({ count: sql<number>`count(*)` }).from(services).where(sql`connectionId IS NOT NULL AND connectionId != '' AND status != 'billing_platform_stub'`);
  const [withoutAvc] = await db.select({ count: sql<number>`count(*)` }).from(services).where(sql`(connectionId IS NULL OR connectionId = '') AND status != 'billing_platform_stub'`);

  // Flagged and terminated counts
  const [flaggedCount2] = await db.select({ count: sql<number>`count(*)` }).from(services).where(eq(services.status, 'flagged_for_termination'));
  const [terminatedCount] = await db.select({ count: sql<number>`count(*)` }).from(services).where(eq(services.status, 'terminated'));

  // No data use count
  const [noDataUseCount] = await db.select({ count: sql<number>`count(*)` }).from(services).where(sql`noDataUse = 1 AND status != 'billing_platform_stub'`);

  // Provider breakdown
  const providerBreakdown = await db.select({
    provider: services.provider,
    count: sql<number>`count(*)`,
    cost: sql<string>`COALESCE(SUM(monthlyCost), 0)`,
  }).from(services).where(sql`status != 'billing_platform_stub'`).groupBy(services.provider);

  // Latest billing period from billing_items (most common valid invoice month)
  let latestBillingPeriod: string | null = null;
  try {
    const periodResult = await db.execute(
      sql`SELECT DATE_FORMAT(STR_TO_DATE(invoiceDate, '%Y-%m-%d'), '%b %Y') as period, COUNT(*) as cnt
          FROM billing_items
          WHERE invoiceDate REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
          GROUP BY period ORDER BY cnt DESC LIMIT 1`
    ) as any;
    // Drizzle db.execute returns [rows, fields] — rows is the first element
    const periodRows: any[] = Array.isArray(periodResult)
      ? (periodResult[0] as any[])
      : (periodResult.rows || []);
    if (periodRows[0]?.period) latestBillingPeriod = periodRows[0].period;
  } catch (_) { /* ignore */ }

  // TIAB cost override: use the most recent supplier invoice total (ex GST) since TIAB services
  // have monthlyCost=0 (costs depend on usage/CDR data not yet ingested).
  let tiabInvoiceCostExGst = 0;
  try {
    const [latestInvoice] = await db
      .select({ totalExGst: tiabSupplierInvoices.totalExGst })
      .from(tiabSupplierInvoices)
      .orderBy(desc(tiabSupplierInvoices.invoiceDate))
      .limit(1);
    if (latestInvoice) tiabInvoiceCostExGst = parseFloat(String(latestInvoice.totalExGst));
  } catch (_) { /* ignore if table missing */ }

  const providerMap = Object.fromEntries(providerBreakdown.map(p => [p.provider || 'Unknown', { count: p.count, cost: parseFloat(p.cost) }]));
  // Inject TIAB invoice cost if TIAB services exist but show $0
  if (providerMap['TIAB'] && tiabInvoiceCostExGst > 0) {
    providerMap['TIAB'] = { ...providerMap['TIAB'], cost: tiabInvoiceCostExGst };
  }

  return {
    totalCustomers: custCount.count,
    totalLocations: locCount.count,
    totalServices: svcCount.count,
    matchedServices: matchedCount.count,
    unmatchedServices: unmatchedCount.count,
    totalMonthlyCost: parseFloat(totalCost.total),
    servicesByType: Object.fromEntries(typeBreakdown.map(t => [t.serviceType, t.count])),
    servicesByProvider: providerMap,
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
    latestBillingPeriod,
  };
}

export async function getUnmatchedServices() {
  const db = await getDb();
  if (!db) return [];

  // Return all non-active services: unmatched, flagged_for_termination, and terminated
  // This includes both unassigned services AND assigned services that have been flagged/terminated
  // Exclude archived services — they are historical records hidden from all active views
  const result = await db.select().from(services).where(
    and(
      or(
        eq(services.status, 'unmatched'),
        eq(services.status, 'flagged_for_termination'),
        eq(services.status, 'terminated')
      ),
      or(
        isNull(services.billingPeriod),
        sql`${services.billingPeriod} != 'archived'`
      )
    )
  ).orderBy(desc(services.monthlyCost));
  return result.map(s => ({
    ...s,
    monthlyCost: parseFloat(s.monthlyCost),
    billingHistory: s.billingHistory ? JSON.parse(s.billingHistory) : [],
  }));
}

/**
 * Classifies unmatched services by data completeness for triage:
 * - 'has_identifiers': has phone, AVC/connectionId, or a real address — operator can look up the customer
 * - 'needs_investigation': missing all three identifiers — cannot be matched without more data
 * Returns counts per tier and the sorted service list with a tier field.
 */
export async function getUnmatchedServiceTriage() {
  const db = await getDb();
  if (!db) return { hasIdentifiers: 0, needsInvestigation: 0 };

  const unmatchedRows = await db.select({
    externalId: services.externalId,
    phoneNumber: services.phoneNumber,
    connectionId: services.connectionId,
    locationAddress: services.locationAddress,
  }).from(services).where(
    and(
      or(eq(services.status, 'unmatched'), eq(services.status, 'flagged_for_termination')),
      or(isNull(services.customerExternalId), eq(services.customerExternalId, '')),
      or(isNull(services.billingPeriod), sql`${services.billingPeriod} != 'archived'`)
    )
  );

  let hasIdentifiers = 0;
  let needsInvestigation = 0;

  for (const svc of unmatchedRows) {
    const hasPhone = !!(svc.phoneNumber && svc.phoneNumber.trim().length >= 6);
    const hasAvc = !!(svc.connectionId && svc.connectionId.trim().length > 3);
    const hasAddress = !!(svc.locationAddress && svc.locationAddress.trim().length > 5 && svc.locationAddress !== 'Unknown Location');
    if (hasPhone || hasAvc || hasAddress) {
      hasIdentifiers++;
    } else {
      needsInvestigation++;
    }
  }

  return { hasIdentifiers, needsInvestigation };
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

  // 6. Direct customer contactPhone match (high confidence — matches mobile SIMs to customer records)
  if (phone.length >= 8) {
    const custPhoneMatches = await db.select().from(customers)
      .where(sql`REPLACE(REPLACE(REPLACE(REPLACE(contactPhone, ' ', ''), '-', ''), '(', ''), ')', '') = ${phone} AND status = 'active'`)
      .limit(5);
    for (const cust of custPhoneMatches) {
      await addSuggestion(cust.externalId, 'high', `Exact customer contact phone match (${svc.phoneNumber})`);
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

// ─── Shared: Recalculate customer service counts ─────────────────────────────
/**
 * Recalculates serviceCount, matchedCount, unmatchedCount, and monthlyCost
 * for one or more customers. Pass multiple IDs when a service moves between customers.
 */
export async function recalculateCustomerCounts(...customerExternalIds: (string | null | undefined)[]) {
  const db = await getDb();
  if (!db) return;
  const uniqueIds = Array.from(new Set(customerExternalIds.filter(Boolean) as string[]));
  if (uniqueIds.length === 0) return;

  // Use a single bulk UPDATE with correlated subqueries — much faster than N×4 round-trips
  // Works for both small sets (single customer) and large sets (200+ customers)
  const idList = sql.join(uniqueIds.map(id => sql`${id}`), sql`, `);
  await db.execute(sql`
    UPDATE customers c
    SET
      serviceCount   = (SELECT COUNT(*)                              FROM services s WHERE s.customerExternalId = c.externalId AND s.status NOT IN ('terminated', 'billing_platform_stub')),
      matchedCount   = (SELECT COUNT(*)                              FROM services s WHERE s.customerExternalId = c.externalId AND s.status = 'active'),
      unmatchedCount = (SELECT COUNT(*)                              FROM services s WHERE s.customerExternalId = c.externalId AND s.status = 'unmatched'),
      monthlyCost    = (SELECT COALESCE(SUM(s.monthlyCost), 0)       FROM services s WHERE s.customerExternalId = c.externalId AND s.status NOT IN ('terminated', 'billing_platform_stub')),
       updatedAt      = NOW()
    WHERE c.externalId IN (${idList})
  `);
}

/**
 * Full database recalculation: promotes customer-matched billing items to service-matched,
 * recalculates monthlyRevenue + marginPercent on all services, then recalculates all customer stats.
 * Safe to run at any time — idempotent.
 */
export async function recalculateAll() {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  // Step 1: Promote customer-matched billing items that already have serviceExternalId → service-matched
  await db.execute(sql`
    UPDATE billing_items
    SET matchStatus = 'service-matched', matchConfidence = 'auto'
    WHERE matchStatus = 'customer-matched'
      AND serviceExternalId IS NOT NULL
      AND serviceExternalId != ''
  `);

  // Step 2: Recalculate monthlyRevenue + marginPercent on all services with billing items.
  // IMPORTANT: monthlyCost is NEVER touched here — it comes from supplier invoices only.
  // marginPercent is only set when BOTH cost and revenue are known (> 0).
  await db.execute(sql`
    UPDATE services s
    SET
      monthlyRevenue = (
        SELECT COALESCE(SUM(bi.lineAmount), 0)
        FROM billing_items bi
        WHERE bi.serviceExternalId = s.externalId
          AND bi.matchStatus = 'service-matched'
      ),
      marginPercent = CASE
        WHEN (
          SELECT COALESCE(SUM(bi.lineAmount), 0)
          FROM billing_items bi
          WHERE bi.serviceExternalId = s.externalId AND bi.matchStatus = 'service-matched'
        ) > 0
          AND CAST(s.monthlyCost AS DECIMAL(10,2)) > 0
        THEN ROUND(
          (
            (SELECT COALESCE(SUM(bi.lineAmount), 0) FROM billing_items bi WHERE bi.serviceExternalId = s.externalId AND bi.matchStatus = 'service-matched')
            - CAST(s.monthlyCost AS DECIMAL(10,2))
          ) /
          (SELECT COALESCE(SUM(bi.lineAmount), 0) FROM billing_items bi WHERE bi.serviceExternalId = s.externalId AND bi.matchStatus = 'service-matched')
          * 100, 2
        )
        ELSE NULL
      END,
      updatedAt = NOW()
    WHERE EXISTS (
      SELECT 1 FROM billing_items bi
      WHERE bi.serviceExternalId = s.externalId AND bi.matchStatus = 'service-matched'
    )
  `);

  // Step 3: Recalculate all customer stats
  await db.execute(sql`
    UPDATE customers c
    SET
      serviceCount   = (SELECT COUNT(*)                             FROM services s WHERE s.customerExternalId = c.externalId AND s.status NOT IN ('terminated', 'billing_platform_stub')),
      matchedCount   = (SELECT COUNT(*)                             FROM services s WHERE s.customerExternalId = c.externalId AND s.status = 'active'),
      unmatchedCount = (SELECT COUNT(*)                             FROM services s WHERE s.customerExternalId = c.externalId AND s.status = 'unmatched'),
      monthlyCost    = (SELECT COALESCE(SUM(s.monthlyCost), 0)      FROM services s WHERE s.customerExternalId = c.externalId AND s.status NOT IN ('terminated', 'billing_platform_stub')),
      monthlyRevenue = (SELECT COALESCE(SUM(s.monthlyRevenue), 0)   FROM services s WHERE s.customerExternalId = c.externalId AND s.status NOT IN ('terminated', 'billing_platform_stub')),
      marginPercent  = CASE
        WHEN (SELECT COALESCE(SUM(s.monthlyRevenue), 0) FROM services s WHERE s.customerExternalId = c.externalId AND s.status NOT IN ('terminated', 'billing_platform_stub')) > 0
          AND (SELECT COALESCE(SUM(s.monthlyCost), 0) FROM services s WHERE s.customerExternalId = c.externalId AND s.status NOT IN ('terminated', 'billing_platform_stub')) > 0
        THEN ROUND(
          (
            (SELECT COALESCE(SUM(s.monthlyRevenue), 0) FROM services s WHERE s.customerExternalId = c.externalId AND s.status NOT IN ('terminated', 'billing_platform_stub'))
            - (SELECT COALESCE(SUM(s.monthlyCost), 0) FROM services s WHERE s.customerExternalId = c.externalId AND s.status NOT IN ('terminated', 'billing_platform_stub'))
          ) /
          (SELECT COALESCE(SUM(s.monthlyRevenue), 0) FROM services s WHERE s.customerExternalId = c.externalId AND s.status NOT IN ('terminated', 'billing_platform_stub'))
          * 100, 2
        )
        ELSE NULL
      END,
      unmatchedBillingCount = (
        SELECT COUNT(*)
        FROM services s
        WHERE s.customerExternalId = c.externalId
          AND s.status NOT IN ('terminated', 'unmatched', 'flagged_for_termination', 'billing_platform_stub')
          AND s.externalId NOT IN (
            SELECT sba.serviceExternalId
            FROM service_billing_assignments sba
            WHERE sba.customerExternalId = c.externalId
          )
          AND s.externalId NOT IN (
            SELECT us.serviceExternalId
            FROM unbillable_services us
            WHERE us.customerExternalId = c.externalId
          )
          AND s.externalId NOT IN (
            SELECT sml.serviceExternalId
            FROM service_billing_match_log sml
            WHERE sml.customerExternalId = c.externalId
              AND sml.resolution = 'intentionally-unbilled'
          )
      ),
      updatedAt = NOW()
  `);

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
  // Recalculate customer counts using shared helper
  await recalculateCustomerCounts(customerExternalId);
  // Auto-inherit location from co-located ABB service if no location provided
  if (!locationExternalId) {
    try {
      await inheritLocationFromColocated(serviceExternalId, 'Auto-match');
    } catch {
      // Non-fatal: location inheritance failure should not block assignment
    }
  }
  // Write match provenance
  await writeMatchProvenance({
    serviceExternalId,
    customerExternalId,
    matchMethod: 'manual',
    matchSource: 'manual_ui',
    matchedBy: 'system',
    confidence: 'medium',
    notes: `Manually assigned to customer ${cust.name}`,
  });
  return { success: true };
}

export async function getServiceForPlatformCheck(serviceExternalId: string) {
  const db = await getDb();
  if (!db) return null;
  const [svc] = await db.select().from(services).where(eq(services.externalId, serviceExternalId)).limit(1);
  if (!svc) return null;
  return {
    planName: svc.planName || null,
    serviceType: svc.serviceType || null,
    billingPlatform: svc.billingPlatform || null,
    monthlyCost: svc.monthlyCost || 0,
    customerName: svc.customerName || null,
    phoneNumber: svc.phoneNumber || null,
  };
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

  // Search customers by name, business name, site address, and contact details
  const custResults = await db.select().from(customers).where(
    or(
      like(customers.name, term),
      like(customers.businessName, term),
      like(customers.siteAddress, term),
      like(customers.contactName, term),
      like(customers.contactEmail, term),
      like(customers.xeroContactName, term),
    )
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
    checkField(s.connectionId, 'connectionId', (s.supplierName === 'Vocus' || s.supplierName === 'Vocus Mobile' || (s.connectionId ?? '').toUpperCase().startsWith('VBU') || (s.connectionId ?? '').toUpperCase().startsWith('VIE')) ? 'VBU ID' : 'AVC/Connection') ||
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

  // Search Vocus NBN services by address, username, AVC ID, customer name
  const vocusNbnResults = await db.select().from(vocusNbnServices).where(
    or(
      like(vocusNbnServices.address, term),
      like(vocusNbnServices.username, term),
      like(vocusNbnServices.avcId, term),
      like(vocusNbnServices.customerName, term),
      like(vocusNbnServices.locId, term),
      like(vocusNbnServices.ipAddress, term),
      like(vocusNbnServices.suburb, term),
      like(vocusNbnServices.poiName, term),
    )
  ).limit(10);

  // Search Vocus Mobile services by MSN, customer name, SIM, location reference
  const vocusMobileResults = await db.select().from(vocusMobileServices).where(
    or(
      like(vocusMobileServices.msn, term),
      like(vocusMobileServices.customerName, term),
      like(vocusMobileServices.sim, term),
      like(vocusMobileServices.locationReference, term),
      like(vocusMobileServices.label, term),
    )
  ).limit(10);

  // Determine matched field for Vocus NBN results
  const vocusNbnWithMatch = vocusNbnResults.map(n => {
    const lq = rawQuery.toLowerCase();
    let matchedField = 'Vocus NBN';
    let matchedValue = '';
    const chk = (v: string | null, label: string) => {
      if (v && v.toLowerCase().includes(lq)) { matchedField = label; matchedValue = v; return true; }
      return false;
    };
    chk(n.address, 'NBN Address') ||
    chk(n.username, 'NBN Username') ||
    chk(n.avcId, 'AVC ID') ||
    chk(n.customerName, 'NBN Customer') ||
    chk(n.locId, 'Location ID') ||
    chk(n.ipAddress, 'IP Address') ||
    chk(n.suburb, 'Suburb') ||
    chk(n.poiName, 'POI');
    return { ...n, _type: 'vocus_nbn' as const, matchedField, matchedValue };
  });

  // Determine matched field for Vocus Mobile results
  const vocusMobileWithMatch = vocusMobileResults.map(m => {
    const lq = rawQuery.toLowerCase();
    let matchedField = 'Vocus Mobile';
    let matchedValue = '';
    const chk = (v: string | null, label: string) => {
      if (v && v.toLowerCase().includes(lq)) { matchedField = label; matchedValue = v; return true; }
      return false;
    };
    chk(m.msn, 'Mobile Number') ||
    chk(m.customerName, 'Mobile Customer') ||
    chk(m.sim, 'SIM Number') ||
    chk(m.locationReference, 'Mobile Address') ||
    chk(m.label, 'Label');
    return { ...m, _type: 'vocus_mobile' as const, matchedField, matchedValue };
  });

  // Search phone_numbers table — number, customer name, SIP/service code, notes
  const phoneNumResults = await db.select().from(phoneNumbers).where(
    or(
      like(phoneNumbers.number, term),
      like(phoneNumbers.numberDisplay, term),
      like(phoneNumbers.customerName, term),
      like(phoneNumbers.providerServiceCode, term),
      like(phoneNumbers.notes, term),
      like(phoneNumbers.servicePlanName, term),
      ...(digitsTerm ? [
        sql`REPLACE(REPLACE(${phoneNumbers.number}, ' ', ''), '-', '') LIKE ${digitsTerm}`,
      ] : []),
    )
  ).limit(15);
  const phoneNumWithMatch = phoneNumResults.map(n => {
    const lq = rawQuery.toLowerCase();
    let matchedField = 'Number';
    let matchedValue = n.numberDisplay ?? n.number;
    const chk = (v: string | null | undefined, label: string) => {
      if (v && v.toLowerCase().includes(lq)) { matchedField = label; matchedValue = v; return true; }
      return false;
    };
    const normalizedNum = (n.number ?? '').replace(/[\s\-]/g, '');
    if (digitsOnly.length >= 3 && normalizedNum.includes(digitsOnly)) {
      matchedField = 'Number'; matchedValue = n.numberDisplay ?? n.number;
    } else {
      chk(n.providerServiceCode, n.provider === 'NetSIP' ? 'SIP ID' : 'Service Code') ||
      chk(n.customerName, 'Customer') ||
      chk(n.notes, 'Notes') ||
      chk(n.servicePlanName, 'Plan');
    }
    return { ...n, _type: 'phone_number' as const, matchedField, matchedValue };
  });
  return {
    customers: custResults.map(c => ({
      ...c,
      billingPlatforms: c.billingPlatforms ? (() => { try { return JSON.parse(c.billingPlatforms!); } catch { return [c.billingPlatforms]; } })() : [],
      monthlyCost: parseFloat(c.monthlyCost),
    })),
    services: servicesWithMatchField,
    vocusNbn: vocusNbnWithMatch,
    vocusMobile: vocusMobileWithMatch,
    phoneNumbers: phoneNumWithMatch,
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
  search?: string;
  customerType?: string;
}) {
  const db = await getDb();
  if (!db) return [];

  // Compute margin on-the-fly from current monthlyCost and monthlyRevenue so it is always fresh
  // even if the stored marginPercent column is stale.
  // Three cases:
  //   1. cost > 0 AND revenue > 0 → normal margin formula
  //   2. cost = 0 AND costSource is a known pricebook/confirmed source AND revenue > 0 → 100% margin
  //   3. cost = 0 AND costSource = 'unknown' → NULL (cost not yet determined, show as unknown)
  // The confirmed zero-cost sources are pricebook imports and explicit retail-only flags.
  const confirmedZeroCostSources = `'sasboss_pricebook','access4_diamond_pricebook_excel','access4_diamond_pricebook','retail_only_no_wholesale','access4_invoice_corrected','pricebook-derived','product_map'`;
  const computedMargin = sql<string>`CASE
    WHEN monthlyRevenue > 0 AND monthlyCost > 0
      THEN ROUND((monthlyRevenue - monthlyCost) / monthlyRevenue * 100, 2)
    WHEN monthlyRevenue > 0 AND monthlyCost = 0
      AND costSource IN (${sql.raw(confirmedZeroCostSources)})
      THEN 100.00
    ELSE NULL
  END`;
  // For cost review mode, include services regardless of revenue (they may have $0 cost needing review)
  // Also include services that have a known cost (> 0) even if revenue is not yet set — these are
  // supplier-cost-only services (e.g. AAPT) that haven't been linked to a Xero billing item yet.
  // This allows them to appear in the Revenue & Margin page as "Revenue Unknown" rows.
  // Always exclude services with no customer association — they should only appear once linked to a customer
  // Always exclude archived services — they are historical records hidden from all active views
  // Always exclude terminated services — they are no longer active and should not appear in Revenue & Margin
  const conditions: ReturnType<typeof sql>[] = filters?.costReviewNeeded
    ? [
        sql`(${services.customerExternalId} IS NOT NULL AND ${services.customerExternalId} != '')`,
        sql`(${services.billingPeriod} IS NULL OR ${services.billingPeriod} != 'archived')`,
        sql`(${services.status} IS NULL OR ${services.status} != 'terminated')`,
      ]
    : [
        sql`(monthlyRevenue > 0 OR monthlyCost > 0)`,
        sql`(${services.customerExternalId} IS NOT NULL AND ${services.customerExternalId} != '')`,
        sql`(${services.billingPeriod} IS NULL OR ${services.billingPeriod} != 'archived')`,
        sql`(${services.status} IS NULL OR ${services.status} != 'terminated')`,
      ];

  // Confirmed zero-cost sources: these products have a known $0 wholesale cost from a pricebook
  const confirmedZeroSrcList = `'sasboss_pricebook','access4_diamond_pricebook_excel','access4_diamond_pricebook','retail_only_no_wholesale','access4_invoice_corrected','pricebook-derived','product_map'`;
  if (filters?.marginFilter && filters.marginFilter !== 'all') {
    switch (filters.marginFilter) {
      case 'negative':
        // Negative margin only possible when cost > 0
        conditions.push(sql`monthlyCost > 0 AND monthlyRevenue > 0 AND (monthlyRevenue - monthlyCost) / monthlyRevenue * 100 < 0`);
        break;
      case 'low':
        conditions.push(sql`monthlyCost > 0 AND monthlyRevenue > 0 AND (monthlyRevenue - monthlyCost) / monthlyRevenue * 100 >= 0 AND (monthlyRevenue - monthlyCost) / monthlyRevenue * 100 < 20`);
        break;
      case 'healthy':
        conditions.push(sql`monthlyCost > 0 AND monthlyRevenue > 0 AND (monthlyRevenue - monthlyCost) / monthlyRevenue * 100 >= 20 AND (monthlyRevenue - monthlyCost) / monthlyRevenue * 100 < 50`);
        break;
      case 'high':
        // High margin: either cost > 0 with >= 50% margin, OR confirmed zero-cost with revenue > 0 (= 100% margin)
        conditions.push(sql`monthlyRevenue > 0 AND (
          (monthlyCost > 0 AND (monthlyRevenue - monthlyCost) / monthlyRevenue * 100 >= 50)
          OR
          (monthlyCost = 0 AND costSource IN (${sql.raw(confirmedZeroSrcList)}))
        )`);
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

  if (filters?.search && filters.search.trim()) {
    const term = `%${filters.search.trim()}%`;
    conditions.push(sql`(${services.customerName} LIKE ${term} OR ${services.planName} LIKE ${term} OR ${services.phoneNumber} LIKE ${term} OR ${services.connectionId} LIKE ${term} OR ${services.locationAddress} LIKE ${term} OR ${services.serviceTypeDetail} LIKE ${term})`);
  }

  // Filter by customer type (retail_offering or standard) via JOIN to customers table
  if (filters?.customerType && filters.customerType !== 'all') {
    conditions.push(sql`${services.customerExternalId} IN (SELECT externalId FROM customers WHERE customerType = ${filters.customerType})`);
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
    costSource: services.costSource,
    revenueGroupId: services.revenueGroupId,
    revenueGroupLabel: services.revenueGroupLabel,
    // Revenue group metadata (null when not in a group)
    groupName: revenueGroups.name,
    groupType: revenueGroups.type,
    groupTotalRevenue: revenueGroups.totalRevenue,
    groupTotalCost: revenueGroups.totalCost,
    createdAt: services.createdAt,
    updatedAt: services.updatedAt,
  }).from(services)
    .leftJoin(revenueGroups, eq(services.revenueGroupId, revenueGroups.groupId))
    .where(whereClause)
    .orderBy(asc(computedMargin));

  return result.map(s => ({
    ...s,
    monthlyCost: parseFloat(String(s.monthlyCost)),
    monthlyRevenue: parseFloat(String(s.monthlyRevenue)),
    marginPercent: s.computedMarginPercent ? parseFloat(String(s.computedMarginPercent)) : null,
    billingHistory: s.billingHistory ? JSON.parse(s.billingHistory) : [],
    revenueGroupId: s.revenueGroupId ?? null,
    revenueGroupLabel: s.revenueGroupLabel ?? null,
  }));
}

/**
 * Aggregate services with revenue by customer for the Group by Customer view.
 */
export async function getServicesGroupedByCustomer(filters?: {
  marginFilter?: string;
  serviceType?: string;
  provider?: string;
  search?: string;
}) {
  const db = await getDb();
  if (!db) return [];

  // Get all services with revenue using the same filters
  const allServices = await getServicesWithMargin(filters);

  // Group by customerExternalId
  const grouped = new Map<string, {
    customerExternalId: string;
    customerName: string;
    serviceCount: number;
    totalCost: number;
    totalRevenue: number;
    marginPercent: number | null;
    services: typeof allServices;
    worstMargin: number | null;
  }>();

  // Track which revenueGroupIds have already been counted for revenue to avoid double-counting
  // bundled revenue groups (where multiple services share the same Xero billing line)
  const countedRevenueGroups = new Set<string>();

  for (const svc of allServices) {
    const key = svc.customerExternalId || '__unmatched__';
    const name = svc.customerName || 'Unmatched';
    if (!grouped.has(key)) {
      grouped.set(key, {
        customerExternalId: key,
        customerName: name,
        serviceCount: 0,
        totalCost: 0,
        totalRevenue: 0,
        marginPercent: null,
        services: [],
        worstMargin: null,
      });
    }
    const group = grouped.get(key)!;
    group.serviceCount++;
    group.totalCost += svc.monthlyCost;
    // Only count revenue once per bundle group — bundled services share the same revenue line
    if (svc.revenueGroupId) {
      const groupKey = `${key}::${svc.revenueGroupId}`;
      if (!countedRevenueGroups.has(groupKey)) {
        countedRevenueGroups.add(groupKey);
        group.totalRevenue += svc.monthlyRevenue;
      }
      // Individual bundled services contribute $0 revenue to the total (revenue counted at group level)
    } else {
      group.totalRevenue += svc.monthlyRevenue;
    }
    group.services.push(svc);
    const m = svc.marginPercent ?? 0;
    if (group.worstMargin === null || m < group.worstMargin) group.worstMargin = m;
  }

  // Compute group margin — only when both totalCost and totalRevenue are known (> 0)
  const result = Array.from(grouped.values()).map(g => ({
    ...g,
    marginPercent: g.totalRevenue > 0 && g.totalCost > 0
      ? ((g.totalRevenue - g.totalCost) / g.totalRevenue * 100)
      : null,
  }));

  // Sort by margin ascending (worst first), nulls last
  result.sort((a, b) => {
    if (a.marginPercent === null && b.marginPercent === null) return 0;
    if (a.marginPercent === null) return 1; // nulls go to end
    if (b.marginPercent === null) return -1;
    return a.marginPercent - b.marginPercent;
  });
  return result;
}

// ==================== Customer Merge ====================

export async function mergeCustomers(primaryExternalId: string, secondaryExternalId: string) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  // Get both customers
  const [primary] = await db.select().from(customers).where(eq(customers.externalId, primaryExternalId)).limit(1);
  const [secondary] = await db.select().from(customers).where(eq(customers.externalId, secondaryExternalId)).limit(1);

  if (!primary || !secondary) throw new Error('Customer not found');

  // ── Core records ──────────────────────────────────────────────────────────
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

  // ── Billing reconciliation records (drag-and-drop assignments) ────────────
  await db.update(serviceBillingAssignments).set({
    customerExternalId: primaryExternalId,
  }).where(eq(serviceBillingAssignments.customerExternalId, secondaryExternalId));

  await db.update(serviceBillingMatchLog).set({
    customerExternalId: primaryExternalId,
  }).where(eq(serviceBillingMatchLog.customerExternalId, secondaryExternalId));

  await db.update(revenueGroups).set({
    customerExternalId: primaryExternalId,
  }).where(eq(revenueGroups.customerExternalId, secondaryExternalId));

  // ── Usage & analytics records ─────────────────────────────────────────────
  await db.update(customerUsageSummaries).set({
    customerExternalId: primaryExternalId,
  }).where(eq(customerUsageSummaries.customerExternalId, secondaryExternalId));

  await db.update(serviceUsageSnapshots).set({
    customerExternalId: primaryExternalId,
  }).where(eq(serviceUsageSnapshots.customerExternalId, secondaryExternalId));

  await db.update(usageThresholdAlerts).set({
    customerExternalId: primaryExternalId,
  }).where(eq(usageThresholdAlerts.customerExternalId, secondaryExternalId));

  // ── Supplier mapping records ──────────────────────────────────────────────
  await db.update(supplierEnterpriseMap).set({
    customerExternalId: primaryExternalId,
  }).where(eq(supplierEnterpriseMap.customerExternalId, secondaryExternalId));

  await db.update(supplierServiceMap).set({
    customerExternalId: primaryExternalId,
  }).where(eq(supplierServiceMap.customerExternalId, secondaryExternalId));

  // ── Service workflow records ──────────────────────────────────────────────
  await db.update(unbillableServices).set({
    customerExternalId: primaryExternalId,
  }).where(eq(unbillableServices.customerExternalId, secondaryExternalId));

  await db.update(escalatedServices).set({
    customerExternalId: primaryExternalId,
  }).where(eq(escalatedServices.customerExternalId, secondaryExternalId));

  await db.update(billingPlatformChecks).set({
    customerExternalId: primaryExternalId,
  }).where(eq(billingPlatformChecks.customerExternalId, secondaryExternalId));

  await db.update(serviceOutages).set({
    customerExternalId: primaryExternalId,
  }).where(eq(serviceOutages.customerExternalId, secondaryExternalId));

  await db.update(serviceMatchEvents).set({
    customerExternalId: primaryExternalId,
  }).where(eq(serviceMatchEvents.customerExternalId, secondaryExternalId));

  // ── Phone numbers & retail bundles ────────────────────────────────────────
  await db.update(phoneNumbers).set({
    customerExternalId: primaryExternalId,
  }).where(eq(phoneNumbers.customerExternalId, secondaryExternalId));

  await db.update(retailBundles).set({
    customerExternalId: primaryExternalId,
  }).where(eq(retailBundles.customerExternalId, secondaryExternalId));

  // ── Omada sites ───────────────────────────────────────────────────────────
  await db.update(omadaSites).set({
    customerExternalId: primaryExternalId,
  }).where(eq(omadaSites.customerExternalId, secondaryExternalId));

  // ── Merge billing platforms ───────────────────────────────────────────────
  const primaryPlatforms = primary.billingPlatforms ? JSON.parse(primary.billingPlatforms) : [];
  const secondaryPlatforms = secondary.billingPlatforms ? JSON.parse(secondary.billingPlatforms) : [];
  const mergedPlatforms = Array.from(new Set([...primaryPlatforms, ...secondaryPlatforms]));

  // Merge contact info (prefer non-empty from primary, fall back to secondary)
  const mergedContact = {
    contactName: primary.contactName || secondary.contactName || '',
    contactEmail: primary.contactEmail || secondary.contactEmail || '',
    contactPhone: primary.contactPhone || secondary.contactPhone || '',
    siteAddress: primary.siteAddress || secondary.siteAddress || '',
    xeroContactName: primary.xeroContactName || secondary.xeroContactName || '',
    xeroAccountNumber: primary.xeroAccountNumber || secondary.xeroAccountNumber || '',
    notes: [primary.notes, secondary.notes].filter(Boolean).join('\n---\nMerged from ' + secondary.name + ':\n'),
  };

  // Recount services (exclude terminated/stubs)
  const [svcCount] = await db.select({ count: sql<number>`count(*)` }).from(services).where(sql`customerExternalId = ${primaryExternalId} AND status NOT IN ('terminated', 'billing_platform_stub', 'archived')`);
  const [costSum] = await db.select({ total: sql<string>`COALESCE(SUM(monthlyCost), 0)` }).from(services).where(sql`customerExternalId = ${primaryExternalId} AND status NOT IN ('terminated', 'billing_platform_stub', 'archived')`);
  const [revenueSum] = await db.select({ total: sql<string>`COALESCE(SUM(monthlyRevenue), 0)` }).from(services).where(sql`customerExternalId = ${primaryExternalId} AND status NOT IN ('terminated', 'billing_platform_stub', 'archived')`);

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
    billingPlatforms: c.billingPlatforms ? (() => { try { return JSON.parse(c.billingPlatforms!); } catch { return [c.billingPlatforms]; } })() : [],
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

  // Recalculate service counts for both old and new customer
  await recalculateCustomerCounts(oldCustomerId, newCustomerExternalId);

  // Write match provenance if reassigned to a new customer
  if (newCustomerExternalId) {
    await writeMatchProvenance({
      serviceExternalId,
      customerExternalId: newCustomerExternalId,
      matchMethod: 'manual',
      matchSource: 'manual_ui',
      matchedBy: reassignedBy,
      confidence: 'medium',
      notes: `Reassigned from "${oldCustomerName || oldCustomerId || 'unassigned'}" to "${newCustomerName}". Reason: ${reason}`,
    });
  }

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
    // Previously system-managed, now editable
    serviceId?: string;
    monthlyCost?: string;
    serviceType?: string;
    provider?: string;
    supplierName?: string;
    // Standard editable fields
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

  if (updates.serviceId !== undefined) trackField('serviceId', updates.serviceId, old.serviceId);
  if (updates.monthlyCost !== undefined) trackField('monthlyCost', updates.monthlyCost, old.monthlyCost);
  if (updates.serviceType !== undefined) trackField('serviceType', updates.serviceType, old.serviceType);
  if (updates.provider !== undefined) trackField('provider', updates.provider, old.provider);
  if (updates.supplierName !== undefined) trackField('supplierName', updates.supplierName, old.supplierName);
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

  // Recalculate customer service counts if customer assignment changed
  if (updates.customerExternalId !== undefined && updates.customerExternalId !== old.customerExternalId) {
    await recalculateCustomerCounts(old.customerExternalId, updates.customerExternalId);
  }

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
  const [result] = await db.insert(billingPlatformChecks).values({
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
  const rawId = (result as any).insertId;
  return { id: rawId ? Number(rawId) : 0, ...input };
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

  const result = await db
    .select({
      // All billing_platform_checks columns
      id: billingPlatformChecks.id,
      reviewItemId: billingPlatformChecks.reviewItemId,
      targetType: billingPlatformChecks.targetType,
      targetId: billingPlatformChecks.targetId,
      targetName: billingPlatformChecks.targetName,
      platform: billingPlatformChecks.platform,
      issueType: billingPlatformChecks.issueType,
      issueDescription: billingPlatformChecks.issueDescription,
      customerName: billingPlatformChecks.customerName,
      customerExternalId: billingPlatformChecks.customerExternalId,
      monthlyAmount: billingPlatformChecks.monthlyAmount,
      priority: billingPlatformChecks.priority,
      status: billingPlatformChecks.status,
      actionedBy: billingPlatformChecks.actionedBy,
      actionedNote: billingPlatformChecks.actionedNote,
      actionedAt: billingPlatformChecks.actionedAt,
      createdBy: billingPlatformChecks.createdBy,
      createdAt: billingPlatformChecks.createdAt,
      updatedAt: billingPlatformChecks.updatedAt,
      // Enriched service details from LEFT JOIN
      svcPhoneNumber: services.phoneNumber,
      svcServiceType: services.serviceType,
      svcPlanName: services.planName,
      svcConnectionId: services.connectionId,
      svcProvider: services.provider,
      svcAddress: services.locationAddress,
      svcStatus: services.status,
      svcMonthlyCost: services.monthlyCost,
      svcSimSerialNumber: services.simSerialNumber,
      svcImei: services.imei,
      svcDeviceName: services.deviceName,
      svcUserName: services.userName,
      svcContractEndDate: services.contractEndDate,
    })
    .from(billingPlatformChecks)
    .leftJoin(services, and(
      eq(billingPlatformChecks.targetId, services.externalId),
      eq(billingPlatformChecks.targetType, sql`'service'`)
    ))
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

export async function addNoteToBillingPlatformCheck(
  id: number,
  note: string,
  addedBy: string
) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  await db.update(billingPlatformChecks).set({
    actionedNote: note,
    actionedBy: addedBy,
    // status is intentionally NOT changed — record stays visible
  }).where(eq(billingPlatformChecks.id, id));
  return { success: true, id };
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
  aliasSource: 'carbon_alias' | 'sm_customer_name'; // where the alias came from
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
    // Skip if the service is already active and assigned to a customer (already matched)
    if (svc.status === 'active' && svc.customerExternalId) continue;

    candidates.push({
      serviceExternalId: svc.externalId,
      serviceType: svc.serviceType,
      provider: svc.provider || 'ABB',
      carbonAlias: svc.carbonAlias,
      aliasSource: 'carbon_alias',
      currentCustomerExternalId: svc.customerExternalId || null,
      currentCustomerName: svc.customerName || '',
      suggestedCustomerExternalId: bestCustomer.externalId,
      suggestedCustomerName: bestCustomer.name,
      confidence: bestScore,
      tier: bestTier,
      isReassignment: !!(svc.customerExternalId && svc.customerExternalId.trim()),
    });
  }

  // ── Second pass: unmatched services with SM Customer: names in discoveryNotes ──
  const seenServiceIds = new Set(candidates.map(c => c.serviceExternalId));

  const smServices = await db.select({
    externalId: services.externalId,
    serviceType: services.serviceType,
    provider: services.provider,
    discoveryNotes: services.discoveryNotes,
    customerExternalId: services.customerExternalId,
    customerName: services.customerName,
    status: services.status,
  }).from(services)
    .where(
      sql`${services.status} = 'unmatched' AND ${services.discoveryNotes} LIKE '%SM Customer:%'`
    );

  for (const svc of smServices) {
    if (seenServiceIds.has(svc.externalId)) continue;
    if (!svc.discoveryNotes) continue;

    // Extract the SM customer name
    const m = svc.discoveryNotes.match(/SM Customer:\s*([^\n\[|]+)/i);
    if (!m) continue;
    const smName = m[1].trim();
    if (!smName) continue;

    let bestScore = 0;
    let bestCustomer: { externalId: string; name: string } | null = null;
    let bestTier = 'no-match';

    for (const cust of allCustomers) {
      const { score, tier } = scoreMatch(smName, cust.name);
      if (score > bestScore) {
        bestScore = score;
        bestCustomer = cust;
        bestTier = tier;
      }
    }

    if (!bestCustomer || bestScore < minConfidence) continue;
    // Skip if already assigned to this customer
    if (bestCustomer.externalId === svc.customerExternalId) continue;

    seenServiceIds.add(svc.externalId);
    candidates.push({
      serviceExternalId: svc.externalId,
      serviceType: svc.serviceType || 'Unknown',
      provider: svc.provider || 'Unknown',
      carbonAlias: smName, // display the SM name as the alias
      aliasSource: 'sm_customer_name',
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
      // Update service counts on old and new customers
      if (old.customerExternalId && old.customerExternalId !== match.customerExternalId) {
        // Decrement old customer's unmatched count and service count
        await db.update(customers).set({
          serviceCount: sql`GREATEST(0, COALESCE(${customers.serviceCount}, 0) - 1)`,
          unmatchedCount: sql`GREATEST(0, COALESCE(${customers.unmatchedCount}, 0) - 1)`,
          updatedAt: new Date(),
        }).where(eq(customers.externalId, old.customerExternalId));
      }
      // Increment new customer's matched count and service count
      await db.update(customers).set({
        serviceCount: sql`COALESCE(${customers.serviceCount}, 0) + 1`,
        matchedCount: sql`COALESCE(${customers.matchedCount}, 0) + 1`,
        status: 'active',
        updatedAt: new Date(),
      }).where(eq(customers.externalId, match.customerExternalId));
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
      // Match provenance
      await writeMatchProvenance({
        serviceExternalId: match.serviceExternalId,
        customerExternalId: match.customerExternalId,
        matchMethod: 'auto_name',
        matchSource: 'carbon_api',
        matchedBy: committedBy,
        confidence: 'medium',
        matchCriteria: { carbonAlias: old.customerName, matchedCustomer: match.customerName },
        notes: 'Auto-matched via Carbon API alias field',
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
      .where(sql`customerExternalId = ${custId} AND status NOT IN ('terminated', 'billing_platform_stub')`);
    const [matchedCount] = await db.select({ count: sql<number>`count(*)` })
      .from(services)
      .where(sql`customerExternalId = ${custId} AND status = 'active'`);
    const [unmatchedCount] = await db.select({ count: sql<number>`count(*)` })
      .from(services)
      .where(sql`customerExternalId = ${custId} AND status = 'unmatched'`);
    const [costSum] = await db.select({ total: sql<string>`COALESCE(SUM(monthlyCost), 0)` })
      .from(services)
      .where(sql`customerExternalId = ${custId} AND status NOT IN ('terminated', 'billing_platform_stub')`);

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
      .where(sql`customerExternalId = ${custId} AND status NOT IN ('terminated', 'billing_platform_stub')`);
    const [matchedCount] = await db.select({ count: sql<number>`count(*)` })
      .from(services)
      .where(sql`customerExternalId = ${custId} AND status = 'active'`);
    const [unmatchedCount] = await db.select({ count: sql<number>`count(*)` })
      .from(services)
      .where(sql`customerExternalId = ${custId} AND status = 'unmatched'`);
    const [costSum] = await db.select({ total: sql<string>`COALESCE(SUM(monthlyCost), 0)` })
      .from(services)
      .where(sql`customerExternalId = ${custId} AND status NOT IN ('terminated', 'billing_platform_stub')`);

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

// ==================== Xero Contact Import Helpers ====================

/**
 * Given a Xero contact name (from billing_items.contactName), return the top
 * customer matches using a simple word-overlap scoring approach.
 * Returns up to 5 suggestions with a confidence score (0-100).
 */
export async function getFuzzyCustomerSuggestions(contactName: string): Promise<Array<{
  externalId: string;
  name: string;
  xeroContactName: string;
  serviceCount: number;
  confidence: number;
}>> {
  const db = await getDb();
  if (!db || !contactName?.trim()) return [];

  const needle = contactName.trim().toLowerCase();
  const needleWords = needle.split(/\s+/).filter(w => w.length > 2);

  // Fetch all active customers (name + xeroContactName)
  const allCustomers = await db.select({
    externalId: customers.externalId,
    name: customers.name,
    xeroContactName: customers.xeroContactName,
    serviceCount: customers.serviceCount,
  }).from(customers)
    .where(sql`${customers.status} != 'inactive'`)
    .orderBy(asc(customers.name));

  const scored = allCustomers.map(c => {
    const haystack = [c.name, c.xeroContactName].filter(Boolean).join(' ').toLowerCase();
    const haystackWords = haystack.split(/\s+/).filter(w => w.length > 2);

    // Exact substring match -> high confidence
    if (haystack.includes(needle) || needle.includes(haystack)) {
      return { ...c, confidence: 90 };
    }

    // Word overlap score
    const matchedWords = needleWords.filter(w => haystack.includes(w));
    const overlapScore = needleWords.length > 0
      ? Math.round((matchedWords.length / needleWords.length) * 80)
      : 0;

    // Also check reverse: haystack words in needle
    const reverseMatched = haystackWords.filter(w => needle.includes(w));
    const reverseScore = haystackWords.length > 0
      ? Math.round((reverseMatched.length / haystackWords.length) * 80)
      : 0;

    return { ...c, confidence: Math.max(overlapScore, reverseScore) };
  });

  return scored
    .filter(c => c.confidence >= 40)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5)
    .map(c => ({
      externalId: c.externalId,
      name: c.name || '',
      xeroContactName: c.xeroContactName || '',
      serviceCount: c.serviceCount,
      confidence: c.confidence,
    }));
}

/**
 * Import a Xero contact (billing_items.contactName) as a new customer record.
 * - Generates the next available externalId (C####)
 * - Creates the customer with xeroContactName set to the contact name
 * - Assigns all unmatched billing items for this contact to the new customer
 * Returns the new customer's externalId.
 */
export async function importXeroContactAsCustomer(contactName: string): Promise<{
  success: boolean;
  externalId: string;
  assignedItemCount: number;
}> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  const trimmedName = contactName.trim();
  if (!trimmedName) throw new Error('Contact name is required');

  // Check if a customer with this name already exists
  const existing = await db.select({ externalId: customers.externalId })
    .from(customers)
    .where(or(
      sql`LOWER(${customers.name}) = LOWER(${trimmedName})`,
      sql`LOWER(${customers.xeroContactName}) = LOWER(${trimmedName})`,
    ))
    .limit(1);
  if (existing.length > 0) {
    throw new Error(`A customer named "${trimmedName}" already exists (${existing[0].externalId}). Use the match workflow instead.`);
  }

  // Generate next externalId: find MAX(CAST(SUBSTRING(externalId, 2) AS UNSIGNED))
  const [maxRow] = await db.select({
    maxNum: sql<number>`MAX(CAST(SUBSTRING(externalId, 2) AS UNSIGNED))`,
  }).from(customers);
  const nextNum = (maxRow?.maxNum || 0) + 1;
  const newExternalId = `C${nextNum}`;

  // Insert the new customer
  await db.insert(customers).values({
    externalId: newExternalId,
    name: trimmedName,
    xeroContactName: trimmedName,
    billingPlatforms: null,
    serviceCount: 0,
    monthlyCost: '0.00' as any,
    unmatchedCount: 0,
    matchedCount: 0,
    status: 'active',
    businessName: '',
    contactName: '',
    contactEmail: '',
    contactPhone: '',
    ownershipType: '',
    siteAddress: '',
    notes: `Imported from Xero billing contact: ${trimmedName}`,
    xeroAccountNumber: '',
    monthlyRevenue: '0.00' as any,
  });

  // Assign all unmatched billing items for this contact to the new customer
  await db.update(billingItems).set({
    customerExternalId: newExternalId,
    matchStatus: 'customer-matched',
  }).where(sql`${billingItems.contactName} = ${trimmedName} AND (${billingItems.customerExternalId} = '' OR ${billingItems.customerExternalId} IS NULL)`);

  // Count how many were assigned
  const [countRow] = await db.select({ count: sql<number>`count(*)` })
    .from(billingItems)
    .where(sql`${billingItems.customerExternalId} = ${newExternalId}`);

  return {
    success: true,
    externalId: newExternalId,
    assignedItemCount: countRow?.count || 0,
  };
}

/**
 * Match all unmatched billing items for a given Xero contact name to an existing customer.
 * Used when the user selects a suggested customer match.
 */
export async function matchXeroContactToCustomer(contactName: string, customerExternalId: string): Promise<{
  success: boolean;
  assignedItemCount: number;
}> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  const trimmedName = contactName.trim();

  // Verify the customer exists
  const cust = await db.select({ externalId: customers.externalId })
    .from(customers)
    .where(eq(customers.externalId, customerExternalId))
    .limit(1);
  if (cust.length === 0) throw new Error(`Customer ${customerExternalId} not found`);

  // Assign all unmatched billing items for this contact to the customer
  await db.update(billingItems).set({
    customerExternalId: customerExternalId,
    matchStatus: 'customer-matched',
  }).where(sql`${billingItems.contactName} = ${trimmedName} AND (${billingItems.customerExternalId} = '' OR ${billingItems.customerExternalId} IS NULL)`);

  // Count how many were assigned
  const [countRow] = await db.select({ count: sql<number>`count(*)` })
    .from(billingItems)
    .where(sql`${billingItems.customerExternalId} = ${customerExternalId} AND ${billingItems.contactName} = ${trimmedName}`);

  return {
    success: true,
    assignedItemCount: countRow?.count || 0,
  };
}

// ==================== Service-to-Billing Matching ====================

/**
 * Merge a Xero stub service into a supplier service.
 * - Moves all billing items from xeroServiceId to supplierServiceId
 * - Recalculates revenue and margin on the supplier service
 * - Marks the Xero stub as terminated (it becomes redundant)
 * - Updates customer service counts
 */
export async function mergeBillingToSupplierService(
  xeroServiceExternalId: string,
  supplierServiceExternalId: string,
  mergedBy: string
): Promise<{ success: boolean; billingItemsMoved: number; newRevenue: number }> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  // Validate both services exist and belong to the same customer
  const [xeroSvc] = await db.select().from(services)
    .where(eq(services.externalId, xeroServiceExternalId)).limit(1);
  const [supplierSvc] = await db.select().from(services)
    .where(eq(services.externalId, supplierServiceExternalId)).limit(1);

  if (!xeroSvc) throw new Error(`Xero service ${xeroServiceExternalId} not found`);
  if (!supplierSvc) throw new Error(`Supplier service ${supplierServiceExternalId} not found`);
  if (xeroSvc.customerExternalId !== supplierSvc.customerExternalId) {
    throw new Error('Services must belong to the same customer');
  }

  // Move all billing items from xero stub to supplier service
  const updateResult = await db.update(billingItems).set({
    serviceExternalId: supplierServiceExternalId,
    matchStatus: 'service-matched',
    matchConfidence: 'manual',
  }).where(eq(billingItems.serviceExternalId, xeroServiceExternalId));

  // Count moved items
  const [countRow] = await db.select({ count: sql<number>`count(*)` })
    .from(billingItems)
    .where(eq(billingItems.serviceExternalId, supplierServiceExternalId));
  const billingItemsMoved = countRow?.count || 0;

  // Recalculate revenue on supplier service
  const [revSum] = await db.select({
    total: sql<string>`COALESCE(SUM(lineAmount), 0)`,
  }).from(billingItems).where(eq(billingItems.serviceExternalId, supplierServiceExternalId));
  const revenue = parseFloat(revSum.total);
  const cost = parseFloat(supplierSvc.monthlyCost);
  const margin = revenue > 0 ? ((revenue - cost) / revenue * 100) : 0;

  await db.update(services).set({
    monthlyRevenue: revSum.total,
    marginPercent: margin.toFixed(2),
    status: 'active',
    billingItemId: supplierServiceExternalId,
  }).where(eq(services.externalId, supplierServiceExternalId));

  // Terminate the Xero stub (it's now redundant)
  await db.update(services).set({
    status: 'terminated',
    monthlyCost: '0.00',
    monthlyRevenue: '0.00',
    discoveryNotes: (xeroSvc.discoveryNotes ? xeroSvc.discoveryNotes + '\n' : '') +
      `[MERGED] Billing items moved to supplier service ${supplierServiceExternalId} by ${mergedBy}`,
  }).where(eq(services.externalId, xeroServiceExternalId));

  // Recalculate customer service count
  const custId = supplierSvc.customerExternalId;
  if (custId) {
    const [svcCount] = await db.select({ count: sql<number>`count(*)` })
      .from(services)
      .where(sql`${services.customerExternalId} = ${custId} AND ${services.status} != 'terminated'`);
    const [revTotal] = await db.select({ total: sql<string>`COALESCE(SUM(monthlyCost), 0)` })
      .from(services)
      .where(sql`${services.customerExternalId} = ${custId} AND ${services.status} != 'terminated'`);
    await db.update(customers).set({
      serviceCount: svcCount.count,
      monthlyCost: revTotal.total,
    }).where(eq(customers.externalId, custId));
  }

  return { success: true, billingItemsMoved, newRevenue: revenue };
}

/**
 * Get auto-match candidates: customers with exactly 1 supplier service and 1 Xero stub
 * of the same type, where the Xero stub has billing items.
 */
export async function getAutoMatchCandidates(): Promise<Array<{
  customerExternalId: string;
  customerName: string;
  serviceType: string;
  xeroServiceId: string;
  xeroServiceDetail: string;
  xeroRevenue: number;
  supplierServiceId: string;
  supplierServiceDetail: string;
  supplierCost: number;
  supplierProvider: string;
  billingItemCount: number;
}>> {
  const db = await getDb();
  if (!db) return [];

  // Find Xero stub services (unmatched, Unknown provider) that have billing items
  const xeroStubs = await db.select({
    externalId: services.externalId,
    serviceType: services.serviceType,
    serviceTypeDetail: services.serviceTypeDetail,
    customerExternalId: services.customerExternalId,
    customerName: services.customerName,
    monthlyRevenue: services.monthlyRevenue,
  }).from(services)
    .where(sql`${services.status} = 'unmatched' AND ${services.provider} = 'Unknown' AND ${services.customerExternalId} != '' AND ${services.customerExternalId} IS NOT NULL`);

  const candidates = [];

  for (const stub of xeroStubs) {
    if (!stub.customerExternalId) continue;

    // Check this stub has billing items
    const [biCount] = await db.select({ count: sql<number>`count(*)` })
      .from(billingItems)
      .where(eq(billingItems.serviceExternalId, stub.externalId));
    if (!biCount || biCount.count === 0) continue;

    // Find supplier services of the same type for this customer
    const supplierSvcs = await db.select({
      externalId: services.externalId,
      serviceTypeDetail: services.serviceTypeDetail,
      monthlyCost: services.monthlyCost,
      provider: services.provider,
    }).from(services)
      .where(sql`${services.customerExternalId} = ${stub.customerExternalId} AND ${services.serviceType} = ${stub.serviceType} AND ${services.status} = 'active' AND ${services.provider} != 'Unknown'`);

    if (supplierSvcs.length === 1) {
      // Exactly one supplier service of this type — confident auto-match candidate
      candidates.push({
        customerExternalId: stub.customerExternalId,
        customerName: stub.customerName || '',
        serviceType: stub.serviceType,
        xeroServiceId: stub.externalId,
        xeroServiceDetail: stub.serviceTypeDetail || '',
        xeroRevenue: parseFloat(stub.monthlyRevenue),
        supplierServiceId: supplierSvcs[0].externalId,
        supplierServiceDetail: supplierSvcs[0].serviceTypeDetail || '',
        supplierCost: parseFloat(supplierSvcs[0].monthlyCost),
        supplierProvider: supplierSvcs[0].provider || 'Unknown',
        billingItemCount: biCount.count,
      });
    }
  }

  return candidates;
}

/**
 * Get supplier services for a customer that could accept billing items
 * (used for manual matching UI)
 */
export async function getSupplierServicesForCustomer(customerExternalId: string): Promise<Array<{
  externalId: string;
  serviceType: string;
  serviceTypeDetail: string;
  provider: string;
  monthlyCost: number;
  avcId: string;
  phoneNumber: string;
  locationAddress: string;
  monthlyRevenue: number;
}>> {
  const db = await getDb();
  if (!db) return [];

  const result = await db.select().from(services)
    .where(sql`${services.customerExternalId} = ${customerExternalId} AND ${services.status} = 'active' AND ${services.provider} != 'Unknown'`)
    .orderBy(asc(services.serviceType));

  return result.map(s => ({
    externalId: s.externalId,
    serviceType: s.serviceType,
    serviceTypeDetail: s.serviceTypeDetail || '',
    provider: s.provider || 'Unknown',
    monthlyCost: parseFloat(s.monthlyCost),
    avcId: s.avcId || '',
    phoneNumber: s.phoneNumber || '',
    locationAddress: s.locationAddress || '',
    monthlyRevenue: parseFloat(s.monthlyRevenue),
  }));
}

// ── Exetel Invoice Import ─────────────────────────────────────────────────────

export interface ExetelInvoiceRow {
  serviceNumber: string;
  idTag: string;
  category: string;
  description: string;
  totalIncGst: number;
  billStart: string;
  billEnd: string;
  chargeType: string;
  avcId: string;
}

export interface ExetelImportResult {
  invoiceNumber: string;
  supplier: string;
  created: number;
  updated: number;
  skipped: number;
  timestamp: string;
  details: Array<{
    serviceNum: string;
    idTag: string;
    customerExtId: string;
    cost: number;
    action: string;
  }>;
}

// Canonical Exetel service number → customer externalId mapping
const EXETEL_CUSTOMER_MAP: Record<string, string | null> = {
  '0701561050': null,
  '0403182994': 'C0015',
  '0731731992': 'C2661',
  '0749850000': 'C0157',
  '0734334112': null,
  '0734334114': 'C2659',
  '0755045018': null,
  '0755045019': 'C2664',
  '0755045020': 'C2486',
  '0730541945': 'C0168',
  '0755045021': null,
  '0755045022': 'C0037',
  '0755045023': 'C0037',
};

function nowIsoForDb(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

function exGstFromIncGst(incGst: number): number {
  return Math.round((incGst / 1.1) * 100) / 100;
}

function shortRandom(): string {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

export async function importExetelInvoice(
  invoiceNumber: string,
  rows: ExetelInvoiceRow[]
): Promise<ExetelImportResult> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  const details: ExetelImportResult['details'] = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;

  const serviceNums = rows.map(r => r.serviceNumber).filter(Boolean);
  const existingServices = serviceNums.length > 0
    ? await db.select({
        externalId: services.externalId,
        phoneNumber: services.phoneNumber,
        customerExternalId: services.customerExternalId,
      })
      .from(services)
      .where(inArray(services.phoneNumber, serviceNums))
    : [];

  const existingByPhone = new Map(existingServices.map(s => [s.phoneNumber, s]));

  const allCustomers = await db.select({ externalId: customers.externalId }).from(customers);
  const customerExtIds = new Set(allCustomers.map(c => c.externalId));

  for (const row of rows) {
    const costExGst = exGstFromIncGst(row.totalIncGst);
    const svcNum = row.serviceNumber;
    const existing = existingByPhone.get(svcNum);

    if (existing) {
      // Update cost and supplier info on existing service
      await db.update(services)
        .set({
          monthlyCost: String(costExGst),
          provider: 'Exetel',
          supplierName: 'Exetel',
          supplierAccount: invoiceNumber,
          ...(row.avcId && row.avcId !== '-' ? { avcId: row.avcId } : {}),
          ...(row.idTag ? { carbonAlias: row.idTag } : {}),
          updatedAt: new Date(),
        })
        .where(eq(services.externalId, existing.externalId));

      details.push({
        serviceNum: svcNum,
        idTag: row.idTag,
        customerExtId: existing.customerExternalId || '',
        cost: costExGst,
        action: 'updated',
      });
      updated++;
    } else {
      // Determine customer for new service
      let customerExtId: string | null = EXETEL_CUSTOMER_MAP[svcNum] ?? null;

      if (!customerExtId) {
        // Create a new customer for this unmapped service
        const newCustId = 'C' + shortRandom();
        const custName = row.idTag || `Exetel Service (${svcNum})`;
        await db.insert(customers).values({
          externalId: newCustId,
          name: custName,
          businessName: '',
          status: 'active',
          serviceCount: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        customerExtId = newCustId;
        customerExtIds.add(newCustId);
      }

      if (!customerExtIds.has(customerExtId)) {
        skipped++;
        continue;
      }

      const newSvcId = 'S' + shortRandom();
      const isCancelled = costExGst === 0 || row.chargeType?.toLowerCase().includes('cancel');
      const serviceType = row.category === 'Hosting' ? 'Other' : 'Internet';

      await db.insert(services).values({
        externalId: newSvcId,
        serviceType,
        serviceTypeDetail: row.category,
        planName: row.description.substring(0, 100),
        status: isCancelled ? 'terminated' : 'active',
        customerExternalId: customerExtId,
        customerName: row.idTag,
        phoneNumber: svcNum,
        provider: 'Exetel',
        supplierName: 'Exetel',
        supplierAccount: invoiceNumber,
        avcId: row.avcId && row.avcId !== '-' ? row.avcId : '',
        carbonAlias: row.idTag,
        monthlyCost: String(costExGst),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await db.update(customers)
        .set({
          serviceCount: sql`${customers.serviceCount} + 1`,
          status: 'active',
          updatedAt: new Date(),
        })
        .where(eq(customers.externalId, customerExtId));

      details.push({
        serviceNum: svcNum,
        idTag: row.idTag,
        customerExtId,
        cost: costExGst,
        action: 'created',
      });
      created++;
    }
  }

  return {
    invoiceNumber,
    supplier: 'Exetel',
    created,
    updated,
    skipped,
    timestamp: new Date().toLocaleString(),
    details,
  };
}

// ─── Address-Based Bulk Assign ────────────────────────────────────────────────
/**
 * Returns all unmatched services that share the same locationAddress as the
 * given service, excluding the service itself.
 */
export async function getUnmatchedServicesAtAddress(
  serviceExternalId: string,
  address: string
): Promise<Array<{
  externalId: string;
  serviceType: string;
  provider: string;
  planName: string;
  monthlyCost: number;
  phone: string | null;
  connectionId: string | null;
}>> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  if (!address || address.trim().length < 5) return [];
  const normalised = address.trim().toLowerCase();
  const rows = await db.select({
    externalId: services.externalId,
    serviceType: services.serviceType,
    provider: services.provider,
    planName: services.planName,
    monthlyCost: services.monthlyCost,
    phone: services.phoneNumber,
    connectionId: services.connectionId,
    locationAddress: services.locationAddress,
  }).from(services)
    .where(
      sql`${services.status} = 'unmatched'
        AND ${services.externalId} != ${serviceExternalId}
        AND LOWER(TRIM(${services.locationAddress})) = ${normalised}`
    );
  return rows.map(r => ({
    externalId: r.externalId,
    serviceType: r.serviceType || 'Unknown',
    provider: r.provider || 'Unknown',
    planName: r.planName || '',
    monthlyCost: Number(r.monthlyCost) || 0,
    phone: r.phone || null,
    connectionId: r.connectionId || null,
  }));
}

/**
 * Bulk-assigns a list of services to a customer, using the same logic as
 * assignServiceToCustomer. Returns counts of applied and failed.
 */
export async function bulkAssignByAddress(
  serviceExternalIds: string[],
  customerExternalId: string,
  assignedBy: string
): Promise<{ applied: number; errors: string[] }> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const [cust] = await db.select({ name: customers.name })
    .from(customers)
    .where(eq(customers.externalId, customerExternalId))
    .limit(1);
  if (!cust) throw new Error('Customer not found');
  let applied = 0;
  const errors: string[] = [];
  for (const svcId of serviceExternalIds) {
    try {
      await db.update(services).set({
        customerExternalId,
        customerName: cust.name,
        status: 'active',
        discoveryNotes: sql`CONCAT('[Address bulk-matched by ${assignedBy} on ${new Date().toLocaleDateString('en-AU')}]\n', COALESCE(${services.discoveryNotes}, ''))`,
      }).where(eq(services.externalId, svcId));
      applied++;
    } catch (err: any) {
      errors.push(`${svcId}: ${err.message}`);
    }
  }
  // Recalculate customer counts once after all updates
  if (applied > 0) {
    await recalculateCustomerCounts(customerExternalId);
  }
  return { applied, errors };
}

// ── Generic Supplier Invoice Import (Channel Haus, Legion, Tech-e) ─────────────

export interface GenericSupplierRow {
  friendlyName: string;
  serviceType: 'Internet' | 'Voice' | 'Other';
  amountExGst: number;
  serviceId?: string;
}

export interface GenericImportResult {
  invoiceNumber: string;
  supplier: string;
  timestamp: string;
  created: number;
  updated: number;
  skipped: number;
  details: Array<{
    friendlyName: string;
    action: 'created' | 'updated' | 'skipped';
    customerName?: string;
    cost: number;
  }>;
}

export async function importGenericSupplierInvoice(
  supplier: string,
  invoiceNumber: string,
  rows: GenericSupplierRow[],
  importedBy: string
): Promise<GenericImportResult> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  let created = 0, updated = 0, skipped = 0;
  const details: GenericImportResult['details'] = [];

  const allCustomers = await db
    .select({ externalId: customers.externalId, name: customers.name })
    .from(customers)
    .where(ne(customers.status, 'inactive'));

  function normalise(s: string) {
    return s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function tokenScore(a: string, b: string) {
    const ta = Array.from(new Set(normalise(a).split(' ').filter(t => t.length > 2)));
    const tb = Array.from(new Set(normalise(b).split(' ').filter(t => t.length > 2)));
    const tbSet = new Set(tb);
    if (ta.length === 0 || tb.length === 0) return 0;
    let matches = 0;
    for (const t of ta) {
      if (tbSet.has(t)) matches++;
      else for (const u of tb) { if (t.includes(u) || u.includes(t)) { matches += 0.5; break; } }
    }
    return matches / Math.max(ta.length, tb.length);
  }
  function findBestCustomer(name: string) {
    let best: (typeof allCustomers)[0] | null = null, bestScore = 0;
    for (const c of allCustomers) {
      const score = tokenScore(name, c.name);
      if (score > bestScore) { bestScore = score; best = c; }
    }
    return bestScore >= 0.35 ? { customer: best!, score: bestScore } : null;
  }

  const existingServices = await db
    .select({ externalId: services.externalId, planName: services.planName, customerExternalId: services.customerExternalId, customerName: services.customerName })
    .from(services)
    .where(eq(services.supplierName, supplier));
  const existingByName = new Map(existingServices.map(s => [s.planName?.toLowerCase() ?? '', s]));

  for (const row of rows) {
    const key = row.friendlyName.toLowerCase();
    const existing = existingByName.get(key);

    if (existing) {
      await db.update(services).set({
        monthlyCost: String(row.amountExGst),
        supplierAccount: invoiceNumber,
        updatedAt: new Date(),
      }).where(eq(services.externalId, existing.externalId));
      details.push({ friendlyName: row.friendlyName, action: 'updated', customerName: existing.customerName ?? undefined, cost: row.amountExGst });
      updated++;
      continue;
    }

    const match = findBestCustomer(row.friendlyName);
    const customerExtId = match ? match.customer.externalId : null;
    const customerName = match ? match.customer.name : null;
    const status = match && match.score >= 0.4 ? 'active' : 'unmatched';

    const newId = 'S' + Math.random().toString(36).slice(2, 8).toUpperCase();
    await db.insert(services).values({
      externalId: newId,
      customerExternalId: customerExtId,
      customerName: customerName,
      serviceType: row.serviceType,
      planName: row.friendlyName,
      supplierName: supplier,
      supplierAccount: invoiceNumber,
      monthlyCost: String(row.amountExGst),
      status,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    if (status === 'active' && customerExtId) {
      await db.update(customers).set({
        serviceCount: sql`COALESCE(${customers.serviceCount}, 0) + 1`,
        matchedCount: sql`COALESCE(${customers.matchedCount}, 0) + 1`,
        status: 'active',
        updatedAt: new Date(),
      }).where(eq(customers.externalId, customerExtId));
    }

    details.push({ friendlyName: row.friendlyName, action: 'created', customerName: customerName ?? undefined, cost: row.amountExGst });
    created++;
  }

  return { invoiceNumber, supplier, timestamp: new Date().toLocaleString(), created, updated, skipped, details };
}

// ─────────────────────────────────────────────────────────────────────────────
// ADDRESS-BASED FUZZY AUTO-MATCH
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalise an address string for comparison:
 * lowercase, expand abbreviations, strip punctuation/extra spaces.
 */
function normaliseAddress(s: string): string {
  return s
    .toLowerCase()
    // Expand common street type abbreviations
    .replace(/\bst\b/g, 'street')
    .replace(/\brd\b/g, 'road')
    .replace(/\bave?\b/g, 'avenue')
    .replace(/\bdr\b/g, 'drive')
    .replace(/\bct\b/g, 'court')
    .replace(/\bcl\b/g, 'close')
    .replace(/\bpl\b/g, 'place')
    .replace(/\bhwy\b/g, 'highway')
    .replace(/\bblvd\b/g, 'boulevard')
    .replace(/\bcres\b/g, 'crescent')
    .replace(/\bpde\b/g, 'parade')
    .replace(/\btce\b/g, 'terrace')
    .replace(/\blane\b/g, 'lane')
    // Expand state abbreviations
    .replace(/\bqld\b/g, 'queensland')
    .replace(/\bnsw\b/g, 'new south wales')
    .replace(/\bvic\b/g, 'victoria')
    .replace(/\bsa\b/g, 'south australia')
    .replace(/\bwa\b/g, 'western australia')
    .replace(/\bact\b/g, 'australian capital territory')
    .replace(/\bnt\b/g, 'northern territory')
    .replace(/\btas\b/g, 'tasmania')
    // Remove noise words
    .replace(/\b(unit|u|shop|level|l|floor|f|suite|ste|bg|bldg|building|ground|g|tenancy|tncy|lot)\b/g, ' ')
    .replace(/\b(australia|au)\b/g, ' ')
    // Remove punctuation
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Score an address match. Returns 0–100.
 * Strategy: extract street number + street name + suburb + postcode tokens,
 * then score by token overlap with bonus for postcode/street-number match.
 */
function scoreAddressMatch(serviceAddr: string, customerAddr: string): { score: number; tier: string } {
  const sN = normaliseAddress(serviceAddr);
  const cN = normaliseAddress(customerAddr);

  if (!sN || !cN) return { score: 0, tier: 'no-data' };

  // Exact normalised match
  if (sN === cN) return { score: 100, tier: 'exact' };

  const sTokens = new Set(sN.split(' ').filter(t => t.length > 1));
  const cTokens = new Set(cN.split(' ').filter(t => t.length > 1));

  if (sTokens.size === 0 || cTokens.size === 0) return { score: 0, tier: 'no-data' };

  // Extract postcode (4-digit number)
  const sPostcode = sN.match(/\b(\d{4})\b/)?.[1];
  const cPostcode = cN.match(/\b(\d{4})\b/)?.[1];

  // Extract street number (leading number)
  const sStreetNum = sN.match(/^\s*(\d+)/)?.[1];
  const cStreetNum = cN.match(/^\s*(\d+)/)?.[1];

  // Jaccard token overlap
  const sArr = Array.from(sTokens);
  const cArr = Array.from(cTokens);
  const intersection = sArr.filter(t => cTokens.has(t)).length;
  const union = new Set(sArr.concat(cArr)).size;
  const jaccard = intersection / union;

  // Postcode match is a strong signal
  const postcodeMatch = sPostcode && cPostcode && sPostcode === cPostcode;
  // Street number match is a strong signal
  const streetNumMatch = sStreetNum && cStreetNum && sStreetNum === cStreetNum;

  let score = Math.round(jaccard * 70);

  // Bonus for postcode match
  if (postcodeMatch) score = Math.min(100, score + 20);
  // Bonus for street number match
  if (streetNumMatch) score = Math.min(100, score + 15);
  // Penalty if postcodes exist but don't match
  if (sPostcode && cPostcode && sPostcode !== cPostcode) score = Math.max(0, score - 30);
  // Penalty if street numbers exist but don't match
  if (sStreetNum && cStreetNum && sStreetNum !== cStreetNum) score = Math.max(0, score - 20);

  let tier: string;
  if (score >= 90) tier = 'exact';
  else if (score >= 75) tier = 'high';
  else if (score >= 55) tier = 'medium';
  else tier = 'low';

  return { score, tier };
}

// Common abbreviation expansions for camelCase service names (e.g. ShailerPkMed)
const ABBREV_MAP: Record<string, string> = {
  'mc': 'medical centre',
  'med': 'medical',
  'pk': 'park',
  'mt': 'mount',
  'nth': 'north',
  'sth': 'south',
  'hb': 'hervey bay',
  'hbay': 'hervey bay',
  'br': 'broadbeach',
  'sc': 'specialist centre',
  'fc': 'family clinic',
  'cl': 'clinic',
  'hosp': 'hospital',
  'doc': 'doctor',
  'docs': 'doctors',
  'pharm': 'pharmacy',
  'chem': 'chemist',
  'ctr': 'centre',
  'out': '',
  'in': '',
  'outbound': '',
  'inbound': '',
  'admin': 'admin',
  // Geographic abbreviations
  'warwk': 'warwick',
  'mchy': 'maroochydore',
  'mchyd': 'maroochydore',
  'aspley': 'aspley',
  'geebung': 'geebung',
  'gumdale': 'gumdale',
  'kawana': 'kawana',
  'logan': 'logan',
  'shailer': 'shailer',
  'stafford': 'stafford',
  'beenleigh': 'beenleigh',
  'cottn': 'cotton',
  'cott': 'cotton',
  'enogg': 'enoggera',
  'eno': 'enoggera',
  'bellb': 'bellbowrie',
  'bellbow': 'bellbowrie',
  // Business type abbreviations
  'dent': 'dental',
  'surg': 'surgery',
  'prac': 'practice',
  'spec': 'specialist',
  'cent': 'centre',
  'cntr': 'centre',
  'grp': 'group',
  'pty': '',
  'ltd': '',
  'ata': '',
  'compl': 'complete',
  'compc': 'complete care',
  'firstc': 'firstcare',
  'waterfrd': 'waterford',
  'waterfd': 'waterford',
  'waterford': 'waterford',
  // Compound abbreviations (e.g. MCIN = MC + IN = medical centre inbound)
  'mcin': 'medical centre',
  'mcout': 'medical centre',
  'mcinbound': 'medical centre',
  'mcoutbound': 'medical centre',
  // Northwest abbreviation
  'nw': 'north west',
};

/** Split a camelCase/PascalCase abbreviated name into tokens. */
function splitCamelCase(s: string): string[] {
  return s
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/[_\-]+/g, ' ')
    .toLowerCase()
    .split(/\s+/)
    .filter(t => t.length > 0);
}

/** Expand abbreviated tokens using ABBREV_MAP. */
function expandTokens(tokens: string[]): string[] {
  const expanded: string[] = [];
  for (const t of tokens) {
    const exp = ABBREV_MAP[t];
    if (exp === '') continue; // skip noise tokens like 'out', 'in'
    if (exp !== undefined) {
      expanded.push(...exp.split(' ').filter(Boolean));
    } else {
      expanded.push(t);
    }
  }
  return expanded;
}

/** Score prefix token overlap between abbreviated planName and full customer name. Returns 0-100. */
function scorePrefixMatch(abbrev: string, fullName: string): number {
  const abbrevTokens = expandTokens(splitCamelCase(abbrev));
  const fullTokens = splitCamelCase(fullName);
  if (abbrevTokens.length === 0) return 0;
  let matchedCount = 0;
  for (const at of abbrevTokens) {
    if (at.length < 2) continue;
    const matched = fullTokens.some(ft =>
      ft.startsWith(at) || at.startsWith(ft.slice(0, Math.min(ft.length, at.length + 2)))
    );
    if (matched) matchedCount++;
  }
  const significant = abbrevTokens.filter(t => t.length >= 2).length;
  return significant > 0 ? Math.round((matchedCount / significant) * 100) : 0;
}

/**
 * Score a planName/customerName against a customer name.
 * Uses both the existing scoreMatch logic AND camelCase prefix matching.
 * Returns the higher of the two scores.
 */
function scoreNameMatch(alias: string, customerName: string): { score: number; tier: string } {
  const original = scoreMatch(alias, customerName);
  const prefixScore = scorePrefixMatch(alias, customerName);
  if (prefixScore > original.score) {
    const tier = prefixScore >= 80 ? 'prefix-high' : prefixScore >= 60 ? 'prefix-medium' : 'prefix-low';
    return { score: prefixScore, tier };
  }
  return original;
}

export interface AddressMatchCandidate {
  serviceExternalId: string;
  serviceId: string;
  serviceType: string;
  provider: string;
  planName: string;
  locationAddress: string;
  matchSource: 'address' | 'planName' | 'customerName';
  matchedText: string;
  currentCustomerExternalId: string | null;
  currentCustomerName: string;
  suggestedCustomerExternalId: string;
  suggestedCustomerName: string;
  suggestedCustomerAddress: string;
  confidence: number;
  tier: string;
  isReassignment: boolean;
}

/**
 * Preview address-based fuzzy auto-match for unmatched services.
 * Matches using three strategies:
 * 1. Service locationAddress → customer siteAddress
 * 2. Service planName → customer name (for ChannelHaus/voice services)
 * 3. Service customerName → customer name (for services with a non-generic customerName)
 */
export async function previewAddressAutoMatch(minConfidence = 55): Promise<{
  candidates: AddressMatchCandidate[];
  stats: { total: number; byAddress: number; byPlanName: number; byCustomerName: number; skipped: number };
}> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  // Fetch all unmatched services
  const unmatchedServices = await db.select({
    externalId: services.externalId,
    serviceId: services.serviceId,
    serviceType: services.serviceType,
    provider: services.provider,
    planName: services.planName,
    locationAddress: services.locationAddress,
    customerExternalId: services.customerExternalId,
    customerName: services.customerName,
    status: services.status,
    supplierName: services.supplierName,
  }).from(services)
    .where(
      and(
        sql`(${services.customerExternalId} IS NULL OR ${services.customerExternalId} = '')`,
        eq(services.status, 'unmatched')
      )
    );

  // Fetch all customers with address data
  const allCustomers = await db.select({
    externalId: customers.externalId,
    name: customers.name,
    siteAddress: customers.siteAddress,
    status: customers.status,
  }).from(customers)
    .where(sql`${customers.status} != 'inactive'`);

  const candidates: AddressMatchCandidate[] = [];
  let byAddress = 0, byPlanName = 0, byCustomerName = 0, skipped = 0;

  for (const svc of unmatchedServices) {
    let bestScore = 0;
    let bestCustomer: typeof allCustomers[0] | null = null;
    let bestTier = 'no-match';
    let bestMatchSource: 'address' | 'planName' | 'customerName' = 'address';
    let bestMatchedText = '';

    // Strategy 1: Address matching
    const hasRealAddress = svc.locationAddress &&
      svc.locationAddress !== '' &&
      svc.locationAddress !== 'Unknown Location';

    if (hasRealAddress) {
      for (const cust of allCustomers) {
        if (!cust.siteAddress || cust.siteAddress === '' || cust.siteAddress === '-, -, -, -, -') continue;
        const { score, tier } = scoreAddressMatch(svc.locationAddress!, cust.siteAddress);
        if (score > bestScore) {
          bestScore = score;
          bestCustomer = cust;
          bestTier = tier;
          bestMatchSource = 'address';
          bestMatchedText = svc.locationAddress!;
        }
      }
    }

    // Strategy 2: planName → customer name (for ChannelHaus voice/internet services)
    // Only try if address match didn't find a good result
    const planName = svc.planName || '';
    // Try planName matching for any service with an abbreviated/non-generic planName
    const isChannelHausOrVoice = planName.length > 3 &&
      !planName.match(/^\$|^SBDP|^DBHRO|^DVBB|^SBBUN|^TBDP|^DBB|^Business Internet$|^NBN|^ADSL|^Wholesale|^TBB_|^Unlimited|^Data -|^Internet$|^Voice$|^Mobile$/);

    if (bestScore < minConfidence && isChannelHausOrVoice) {
      for (const cust of allCustomers) {
        const { score, tier } = scoreNameMatch(planName, cust.name);
        if (score > bestScore) {
          bestScore = score;
          bestCustomer = cust;
          bestTier = tier;
          bestMatchSource = 'planName';
          bestMatchedText = planName;
        }
      }
    }

    // Strategy 3: customerName → customer name (for services with a meaningful customerName)
    const custNameField = svc.customerName || '';
    const hasMeaningfulCustName = custNameField &&
      custNameField !== 'Unassigned' &&
      custNameField !== '' &&
      custNameField.length > 3;

    if (bestScore < minConfidence && hasMeaningfulCustName) {
      for (const cust of allCustomers) {
        const { score, tier } = scoreNameMatch(custNameField, cust.name);
        if (score > bestScore) {
          bestScore = score;
          bestCustomer = cust;
          bestTier = tier;
          bestMatchSource = 'customerName';
          bestMatchedText = custNameField;
        }
      }
    }

    if (!bestCustomer || bestScore < minConfidence) {
      skipped++;
      continue;
    }

    // Track source stats
    if (bestMatchSource === 'address') byAddress++;
    else if (bestMatchSource === 'planName') byPlanName++;
    else byCustomerName++;

    candidates.push({
      serviceExternalId: svc.externalId,
      serviceId: svc.serviceId || '',
      serviceType: svc.serviceType,
      provider: svc.provider || 'Unknown',
      planName: svc.planName || '',
      locationAddress: svc.locationAddress || '',
      matchSource: bestMatchSource,
      matchedText: bestMatchedText,
      currentCustomerExternalId: svc.customerExternalId || null,
      currentCustomerName: svc.customerName || '',
      suggestedCustomerExternalId: bestCustomer.externalId,
      suggestedCustomerName: bestCustomer.name,
      suggestedCustomerAddress: bestCustomer.siteAddress || '',
      confidence: bestScore,
      tier: bestTier,
      isReassignment: false,
    });
  }

  // Sort by confidence desc
  candidates.sort((a, b) => b.confidence - a.confidence);

  return {
    candidates,
    stats: {
      total: candidates.length,
      byAddress,
      byPlanName,
      byCustomerName,
      skipped,
    },
  };
}

/**
 * Commit approved address-based auto-matches.
 */
export async function commitAddressAutoMatch(
  approvedMatches: Array<{ serviceExternalId: string; customerExternalId: string; customerName: string }>,
  committedBy: string
): Promise<{ applied: number; errors: string[] }> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  let applied = 0;
  const errors: string[] = [];

  for (const match of approvedMatches) {
    try {
      // Assign service to customer
      await db.update(services).set({
        customerExternalId: match.customerExternalId,
        customerName: match.customerName,
        status: 'active',
        updatedAt: new Date(),
      }).where(eq(services.externalId, match.serviceExternalId));

      // Write match provenance
      await writeMatchProvenance({
        serviceExternalId: match.serviceExternalId,
        customerExternalId: match.customerExternalId,
        matchMethod: 'auto_name',
        matchSource: 'manual_ui',
        matchedBy: committedBy,
        confidence: 'medium',
        matchCriteria: { matchedCustomer: match.customerName },
        notes: 'Auto-matched via address lookup',
      });

      applied++;
    } catch (err: any) {
      errors.push(`${match.serviceExternalId}: ${err.message}`);
    }
  }

  // Refresh customer stats for all affected customers
  const affectedCustomers = Array.from(new Set(approvedMatches.map(m => m.customerExternalId)));
  for (const custExtId of affectedCustomers) {
    try {
      const svcRows = await db.select({
        monthlyCost: services.monthlyCost,
        status: services.status,
      }).from(services)
        .where(sql`${services.customerExternalId} = ${custExtId} AND ${services.status} != 'terminated'`);

      const matchedCount = svcRows.length;
      const totalCost = svcRows.reduce((sum, s) => sum + parseFloat(String(s.monthlyCost) || '0'), 0);

      await db.update(customers).set({
        matchedCount,
        unmatchedCount: 0,
        monthlyCost: String(totalCost.toFixed(2)),
        updatedAt: new Date(),
      }).where(eq(customers.externalId, custExtId));
    } catch (_) {
      // Non-fatal
    }
  }

  return { applied, errors };
}

/**
 * Bulk-activates services that are stuck in 'unmatched' status but already have
 * a valid customerExternalId pointing to an existing customer.
 * Returns a preview (dry-run=true) or applies the changes (dry-run=false).
 */
export async function bulkActivateLinkedServices(dryRun = true): Promise<{
  count: number;
  affectedCustomers: number;
  preview: Array<{ serviceExternalId: string; customerExternalId: string; customerName: string; locationAddress: string; monthlyCost: number }>;
  errors: string[];
}> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  // Find all unmatched services that already have a valid customerExternalId
  const candidates = await db.select({
    externalId: services.externalId,
    customerExternalId: services.customerExternalId,
    customerName: services.customerName,
    locationAddress: services.locationAddress,
    monthlyCost: services.monthlyCost,
  }).from(services)
    .where(
      and(
        eq(services.status, 'unmatched'),
        sql`${services.customerExternalId} IS NOT NULL AND ${services.customerExternalId} != ''`
      )
    );

  // Verify each customerExternalId actually exists in the customers table
  const allCustomerIds = new Set(
    (await db.select({ externalId: customers.externalId }).from(customers)).map(c => c.externalId)
  );

  const valid = candidates.filter(c => allCustomerIds.has(c.customerExternalId!));
  const invalid = candidates.filter(c => !allCustomerIds.has(c.customerExternalId!));

  const preview = valid.map(s => ({
    serviceExternalId: s.externalId,
    customerExternalId: s.customerExternalId!,
    customerName: s.customerName || '',
    locationAddress: s.locationAddress || '',
    monthlyCost: parseFloat(String(s.monthlyCost) || '0'),
  }));

  if (dryRun) {
    const uniqueCustomers = new Set(valid.map(s => s.customerExternalId));
    return {
      count: valid.length,
      affectedCustomers: uniqueCustomers.size,
      preview: preview.slice(0, 50), // Return first 50 for preview
      errors: invalid.map(s => `${s.externalId}: customer ${s.customerExternalId} not found`),
    };
  }

  // Apply: bulk update status to 'active'
  const errors: string[] = [];
  let applied = 0;

  // Process in batches of 100
  const batchSize = 100;
  for (let i = 0; i < valid.length; i += batchSize) {
    const batch = valid.slice(i, i + batchSize);
    const ids = batch.map(s => s.externalId);
    try {
      await db.update(services)
        .set({ status: 'active', updatedAt: new Date() })
        .where(sql`externalId IN (${sql.join(ids.map(id => sql`${id}`), sql`, `)})`);
      applied += batch.length;
    } catch (err: any) {
      errors.push(`Batch ${i}-${i + batchSize}: ${err.message}`);
    }
  }

  // Recalculate stats for all affected customers
  const affectedCustomerIds = Array.from(new Set(valid.map(s => s.customerExternalId!)));
  await recalculateCustomerCounts(...affectedCustomerIds);

  return {
    count: applied,
    affectedCustomers: affectedCustomerIds.length,
    preview: preview.slice(0, 50),
    errors,
  };
}

/**
 * Create a new customer record manually.
 * Generates the next available externalId (C####).
 * Optionally creates a Platform Check entry for the new customer.
 * Returns the new customer's externalId.
 */
export async function createCustomer(input: {
  name: string;
  businessName?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  siteAddress?: string;
  notes?: string;
  billingPlatforms?: string[] | null;
  createdBy?: string;
}): Promise<{
  success: boolean;
  externalId: string;
  alreadyExists: boolean;
}> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const trimmedName = input.name.trim();
  if (!trimmedName) throw new Error('Customer name is required');

  // Check if a customer with this name already exists
  const existing = await db.select({ externalId: customers.externalId })
    .from(customers)
    .where(sql`LOWER(${customers.name}) = LOWER(${trimmedName})`)
    .limit(1);
  if (existing.length > 0) {
    return { success: false, externalId: existing[0].externalId, alreadyExists: true };
  }

  // Generate next externalId: find MAX(CAST(SUBSTRING(externalId, 2) AS UNSIGNED))
  const [maxRow] = await db.select({
    maxNum: sql<number>`MAX(CAST(SUBSTRING(externalId, 2) AS UNSIGNED))`,
  }).from(customers);
  const nextNum = (maxRow?.maxNum || 0) + 1;
  const newExternalId = `C${nextNum}`;

  const noteText = [
    input.notes,
    input.createdBy ? `Created manually by ${input.createdBy}` : null,
  ].filter(Boolean).join('\n');

  // Insert the new customer
  await db.insert(customers).values({
    externalId: newExternalId,
    name: trimmedName,
    businessName: input.businessName || '',
    contactName: input.contactName || '',
    contactEmail: input.contactEmail || '',
    contactPhone: input.contactPhone || '',
    siteAddress: input.siteAddress || '',
    notes: noteText,
    billingPlatforms: input.billingPlatforms ? JSON.stringify(input.billingPlatforms) : null,
    serviceCount: 0,
    monthlyCost: '0.00' as any,
    unmatchedCount: 0,
    matchedCount: 0,
    status: 'active',
    xeroContactName: '',
    xeroAccountNumber: '',
    monthlyRevenue: '0.00' as any,
  });

  return { success: true, externalId: newExternalId, alreadyExists: false };
}

/**
 * Get fuzzy customer suggestions for an unmatched service based on its discoveryNotes / customerName hint.
 * Returns top 5 candidates with confidence scores.
 */
export async function getSuggestedCustomersForService(serviceExternalId: string): Promise<Array<{
  externalId: string;
  name: string;
  businessName: string;
  siteAddress: string;
  serviceCount: number;
  confidence: number;
  matchReason: string;
}>> {
  const db = await getDb();
  if (!db) return [];

  // Get the service's discovery notes and customer name hint
  const [svc] = await db.select({
    discoveryNotes: services.discoveryNotes,
    customerName: services.customerName,
    locationAddress: services.locationAddress,
    serviceType: services.serviceType,
  }).from(services)
    .where(eq(services.externalId, serviceExternalId))
    .limit(1);

  if (!svc) return [];

  // Extract the suggested customer name from discoveryNotes
  // Format: "[SM Import (Ella)] Port Out CID: 123 | SM Customer: Zambrero Albury"
  let hintName = '';
  if (svc.discoveryNotes) {
    // Look specifically for "SM Customer: <name>" pattern
    const smCustomer = svc.discoveryNotes.match(/SM Customer:\s*([^\n\[|]+)/i);
    if (smCustomer) hintName = smCustomer[1].trim();
    // Fall back to [Pending] SM customer name: "..."
    if (!hintName) {
      const pending = svc.discoveryNotes.match(/SM customer name:\s*"?([^"\n\[]+)"?/i);
      if (pending) hintName = pending[1].trim();
    }
  }
  if (!hintName && svc.customerName && svc.customerName !== 'Unassigned') {
    hintName = svc.customerName;
  }

  if (!hintName) return [];

  // Use the existing fuzzy suggestions function
  const suggestions = await getFuzzyCustomerSuggestions(hintName);
  return suggestions.map(s => ({
    externalId: s.externalId,
    name: s.name,
    businessName: '',
    siteAddress: '',
    serviceCount: s.serviceCount,
    confidence: s.confidence,
    matchReason: `Name match: "${hintName}" → "${s.name}"`,
  }));
}

// ==================== Customer Proposals ====================

export async function submitCustomerProposal(input: {
  proposedName: string;
  notes?: string;
  serviceExternalIds: string[];
  source?: string;
  proposedBy: string;
  createPlatformCheck?: boolean;
}) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  // Check if an identical pending proposal already exists
  const existing = await db.select().from(customerProposals)
    .where(and(
      eq(customerProposals.proposedName, input.proposedName.trim()),
      eq(customerProposals.status, 'pending')
    ))
    .limit(1);

  if (existing.length > 0) {
    return { id: existing[0].id, alreadyExists: true };
  }

  const [result] = await db.insert(customerProposals).values({
    proposedName: input.proposedName.trim(),
    notes: input.notes || null,
    serviceExternalIds: JSON.stringify(input.serviceExternalIds),
    source: input.source || 'Manual',
    status: 'pending',
    proposedBy: input.proposedBy,
    createPlatformCheck: input.createPlatformCheck ? 1 : 0,
  });

  return { id: (result as any).insertId, alreadyExists: false };
}

export async function listCustomerProposals(statusFilter?: 'pending' | 'approved' | 'rejected') {
  const db = await getDb();
  if (!db) return [];

  const conditions = statusFilter ? [eq(customerProposals.status, statusFilter)] : [];
  const whereClause = conditions.length > 0 ? conditions[0] : undefined;

  const rows = await db.select().from(customerProposals)
    .where(whereClause)
    .orderBy(desc(customerProposals.createdAt));

  return rows.map(r => ({
    ...r,
    serviceExternalIds: r.serviceExternalIds ? JSON.parse(r.serviceExternalIds) : [],
    createPlatformCheck: r.createPlatformCheck === 1,
  }));
}

export async function approveCustomerProposal(
  proposalId: number,
  reviewedBy: string
): Promise<{ success: boolean; customerExternalId?: string; error?: string }> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  const [proposal] = await db.select().from(customerProposals)
    .where(eq(customerProposals.id, proposalId))
    .limit(1);

  if (!proposal) return { success: false, error: 'Proposal not found' };
  if (proposal.status !== 'pending') return { success: false, error: `Proposal is already ${proposal.status}` };

  // Create the customer using the existing createCustomer function
  const serviceIds: string[] = proposal.serviceExternalIds ? JSON.parse(proposal.serviceExternalIds) : [];
  const createResult = await createCustomer({
    name: proposal.proposedName,
    notes: proposal.notes || undefined,
    createdBy: reviewedBy,
  });

  if (createResult.alreadyExists) {
    // Customer already exists — still mark proposal as approved and link it
    await db.update(customerProposals).set({
      status: 'approved',
      reviewedBy,
      reviewedAt: new Date(),
      createdCustomerExternalId: createResult.externalId,
    }).where(eq(customerProposals.id, proposalId));
    return { success: true, customerExternalId: createResult.externalId };
  }

  // Assign linked services to the new customer
  if (serviceIds.length > 0) {
    const newName = proposal.proposedName.trim();
    // Use raw SQL update to avoid ORM type issues with large services table
    for (const svcId of serviceIds) {
      await db.update(services).set({
        customerExternalId: createResult.externalId,
        customerName: newName,
      } as any).where(eq(services.externalId, svcId));
    }
  }

  // Always create a Platform Check for each assigned service so billing can be verified
  const customerName = proposal.proposedName.trim();
  if (serviceIds.length > 0) {
    for (const svcId of serviceIds) {
      const svcDetails = await getServiceForPlatformCheck(svcId);
      const platform = svcDetails?.billingPlatform || 'Manual';
      const monthlyCost = Number(svcDetails?.monthlyCost ?? 0);
      const targetName = svcDetails?.planName || svcDetails?.serviceType || svcId;
      await createBillingPlatformCheck({
        customerExternalId: createResult.externalId,
        customerName,
        issueType: 'new-customer-assignment',
        issueDescription: `New customer "${customerName}" created from proposal (approved by ${reviewedBy}). Verify service is correctly set up in billing platform.`,
        createdBy: reviewedBy,
        targetType: 'service',
        targetId: svcId,
        targetName,
        platform,
        monthlyAmount: monthlyCost,
        priority: 'medium',
      });
    }
  } else {
    // No services linked — create a single check for the customer
    await createBillingPlatformCheck({
      customerExternalId: createResult.externalId,
      customerName,
      issueType: 'new-customer-assignment',
      issueDescription: `New customer "${customerName}" created from proposal (approved by ${reviewedBy}). No services assigned yet — verify billing platform setup.`,
      createdBy: reviewedBy,
      targetType: 'service',
      targetId: createResult.externalId,
      targetName: customerName,
      platform: 'Manual',
      monthlyAmount: 0,
      priority: 'medium',
    });
  }

  // Mark proposal as approved
  await db.update(customerProposals).set({
    status: 'approved',
    reviewedBy,
    reviewedAt: new Date(),
    createdCustomerExternalId: createResult.externalId,
  }).where(eq(customerProposals.id, proposalId));

  return { success: true, customerExternalId: createResult.externalId };
}

export async function rejectCustomerProposal(
  proposalId: number,
  reviewedBy: string,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  const [proposal] = await db.select().from(customerProposals)
    .where(eq(customerProposals.id, proposalId))
    .limit(1);

  if (!proposal) return { success: false, error: 'Proposal not found' };
  if (proposal.status !== 'pending') return { success: false, error: `Proposal is already ${proposal.status}` };

  await db.update(customerProposals).set({
    status: 'rejected',
    reviewedBy,
    reviewedAt: new Date(),
    rejectionReason: reason || null,
  }).where(eq(customerProposals.id, proposalId));

  // Create a Platform Check so the billing team knows the proposal was rejected
  // and can verify no billing was set up for the rejected customer
  const customerName = proposal.proposedName.trim();
  const serviceIds: string[] = proposal.serviceExternalIds ? JSON.parse(proposal.serviceExternalIds) : [];
  const reasonNote = reason ? ` Reason: ${reason}` : '';
  if (serviceIds.length > 0) {
    for (const svcId of serviceIds) {
      const svcDetails = await getServiceForPlatformCheck(svcId);
      const platform = svcDetails?.billingPlatform || 'Manual';
      const monthlyCost = Number(svcDetails?.monthlyCost ?? 0);
      const targetName = svcDetails?.planName || svcDetails?.serviceType || svcId;
      await createBillingPlatformCheck({
        customerExternalId: '',
        customerName,
        issueType: 'rejected-proposal',
        issueDescription: `Proposal for new customer "${customerName}" was REJECTED by ${reviewedBy}.${reasonNote} Confirm no billing was set up in the platform for this service.`,
        createdBy: reviewedBy,
        targetType: 'service',
        targetId: svcId,
        targetName,
        platform,
        monthlyAmount: monthlyCost,
        priority: 'medium',
      });
    }
  } else {
    await createBillingPlatformCheck({
      customerExternalId: '',
      customerName,
      issueType: 'rejected-proposal',
      issueDescription: `Proposal for new customer "${customerName}" was REJECTED by ${reviewedBy}.${reasonNote} Confirm no billing was set up in the platform.`,
      createdBy: reviewedBy,
      targetType: 'service',
      targetId: `proposal-${proposalId}`,
      targetName: customerName,
      platform: 'Manual',
      monthlyAmount: 0,
      priority: 'medium',
    });
  }

  return { success: true };
}

export async function countPendingProposals(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const [row] = await db.select({ count: sql<number>`COUNT(*)` })
    .from(customerProposals)
    .where(eq(customerProposals.status, 'pending'));
  return Number(row?.count ?? 0);
}

/**
 * Assign the services from a pending proposal to an existing customer (instead of creating a new one).
 * Marks the proposal as approved, assigns all services, and creates a Platform Check for each service.
 */
export async function assignProposalToExistingCustomer(
  proposalId: number,
  existingCustomerExternalId: string,
  reviewedBy: string
): Promise<{ success: boolean; error?: string; customerExternalId?: string }> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  const [proposal] = await db.select().from(customerProposals)
    .where(eq(customerProposals.id, proposalId))
    .limit(1);

  if (!proposal) return { success: false, error: 'Proposal not found' };
  if (proposal.status !== 'pending') return { success: false, error: `Proposal is already ${proposal.status}` };

  // Look up the existing customer
  const [cust] = await db.select().from(customers)
    .where(eq(customers.externalId, existingCustomerExternalId))
    .limit(1);
  if (!cust) return { success: false, error: 'Customer not found' };

  const serviceIds: string[] = proposal.serviceExternalIds ? JSON.parse(proposal.serviceExternalIds) : [];

  // Assign all services to the existing customer
  for (const svcId of serviceIds) {
    await db.update(services).set({
      customerExternalId: existingCustomerExternalId,
      customerName: cust.name,
      status: 'active',
    } as any).where(eq(services.externalId, svcId));
  }

  // Recalculate customer counts
  await recalculateCustomerCounts(existingCustomerExternalId);

  // Mark proposal as approved (assigned to existing customer)
  await db.update(customerProposals).set({
    status: 'approved',
    reviewedBy,
    reviewedAt: new Date(),
    createdCustomerExternalId: existingCustomerExternalId,
    rejectionReason: `Assigned to existing customer: ${cust.name} (${existingCustomerExternalId})`,
  }).where(eq(customerProposals.id, proposalId));

  // Create a Platform Check for each assigned service
  const proposedName = proposal.proposedName.trim();
  if (serviceIds.length > 0) {
    for (const svcId of serviceIds) {
      const svcDetails = await getServiceForPlatformCheck(svcId);
      const platform = svcDetails?.billingPlatform || 'Manual';
      const monthlyCost = Number(svcDetails?.monthlyCost ?? 0);
      const targetName = svcDetails?.planName || svcDetails?.serviceType || svcId;
      await createBillingPlatformCheck({
        customerExternalId: existingCustomerExternalId,
        customerName: cust.name,
        issueType: 'new-customer-assignment',
        issueDescription: `Proposal for "${proposedName}" was assigned to existing customer "${cust.name}" by ${reviewedBy}. Verify service is correctly set up in billing platform.`,
        createdBy: reviewedBy,
        targetType: 'service',
        targetId: svcId,
        targetName,
        platform,
        monthlyAmount: monthlyCost,
        priority: 'medium',
      });
    }
  } else {
    await createBillingPlatformCheck({
      customerExternalId: existingCustomerExternalId,
      customerName: cust.name,
      issueType: 'new-customer-assignment',
      issueDescription: `Proposal for "${proposedName}" was assigned to existing customer "${cust.name}" by ${reviewedBy}. No services linked — verify billing platform setup.`,
      createdBy: reviewedBy,
      targetType: 'service',
      targetId: existingCustomerExternalId,
      targetName: cust.name,
      platform: 'Manual',
      monthlyAmount: 0,
      priority: 'medium',
    });
  }

  return { success: true, customerExternalId: existingCustomerExternalId };
}

// ==================== Carbon API Cost Sync ====================

/**
 * Snapshot the current monthlyCost of a service to service_cost_history before overwriting.
 * Only snapshots if the current cost is non-zero (nothing to snapshot for unknown costs).
 */
export async function snapshotServiceCost(
  db: ReturnType<typeof drizzle>,
  serviceExternalId: string,
  currentCost: number,
  currentCostSource: string,
  snapshotReason: string,
  snapshotBy: string,
  notes?: string
): Promise<void> {
  if (currentCost <= 0) return; // Nothing meaningful to snapshot
  await db.insert(serviceCostHistory).values({
    serviceExternalId,
    monthlyCost: currentCost.toFixed(2),
    costSource: currentCostSource || 'unknown',
    snapshotReason,
    snapshotBy,
    notes: notes || null,
  });
}

/**
 * Get cost history for a service (most recent first).
 */
export async function getServiceCostHistory(serviceExternalId: string) {
  const db = await getDb();
  if (!db) return [];
  return await db.select()
    .from(serviceCostHistory)
    .where(eq(serviceCostHistory.serviceExternalId, serviceExternalId))
    .orderBy(desc(serviceCostHistory.createdAt));
}

// ==================== Carbon API Live Fetch + Cache ====================

const CARBON_BASE_URL = 'https://api.carbon.aussiebroadband.com.au';
const CARBON_CACHE_KEY = 'all_services';
const CARBON_DEFAULT_TTL_HOURS = 6;

/** Shape of a single service record returned by the Carbon API. */
export interface CarbonService {
  id: number;
  type: string;
  address: string;
  alias: string | null;
  status: string;
  monthly_cost_cents: number;
  plan: { name: string } | null;
  service_identifier: string | null;
  circuit_id: string | null;
  network_type: string | null;
  location_id: number | null;
  open_date: string | null;
  [key: string]: unknown;
}

/**
 * Assemble the Carbon API password from the two split secrets.
 * The platform strips '$' from secret values, so the password is stored as:
 *   CARBON_PASSWORD_PREFIX + "$X" + CARBON_PASSWORD_SUFFIX
 */
function getCarbonPassword(): string {
  const prefix = process.env.CARBON_PASSWORD_PREFIX;
  const suffix = process.env.CARBON_PASSWORD_SUFFIX;
  if (!prefix || !suffix) {
    throw new Error('[CarbonAPI] CARBON_PASSWORD_PREFIX or CARBON_PASSWORD_SUFFIX env vars are not set');
  }
  return `${prefix}$X${suffix}`;
}

/**
 * Authenticate with the Carbon API and return a session cookie string.
 * Throws if login fails.
 */
async function carbonLogin(): Promise<string> {
  const username = process.env.CARBON_USERNAME;
  if (!username) throw new Error('[CarbonAPI] CARBON_USERNAME env var is not set');
  const password = getCarbonPassword();

  const res = await fetch(`${CARBON_BASE_URL}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`[CarbonAPI] Login failed (${res.status}): ${body.substring(0, 200)}`);
  }

  const rawCookies = res.headers.get('set-cookie') || '';
  const cookieStr = rawCookies.split(',').map((c: string) => c.trim().split(';')[0]).join('; ');
  if (!cookieStr) throw new Error('[CarbonAPI] Login succeeded but no session cookie returned');
  return cookieStr;
}

/**
 * Fetch all services from the Carbon API using pagination.
 * Uses 100 per page (maximum observed) and follows meta.last_page.
 */
async function fetchAllCarbonServices(existingCookie?: string): Promise<CarbonService[]> {
  const cookieStr = existingCookie || await carbonLogin();
  const allServices: CarbonService[] = [];
  let page = 1;
  let lastPage = 1;

  do {
    const res = await fetch(`${CARBON_BASE_URL}/carbon/services?page=${page}&per_page=100`, {
      headers: { 'Accept': 'application/json', 'cookie': cookieStr },
    });
    if (!res.ok) {
      throw new Error(`[CarbonAPI] Services fetch failed on page ${page} (${res.status})`);
    }
    const data = await res.json() as { data: CarbonService[]; meta: { last_page: number; total: number } };
    const pageServices = data.data || [];
    allServices.push(...pageServices);
    lastPage = data.meta?.last_page ?? page;
    console.log(`[CarbonAPI] Fetched page ${page}/${lastPage}: ${pageServices.length} services (running total: ${allServices.length})`);
    page++;
  } while (page <= lastPage);

  return allServices;
}

/**
 * Return all Carbon services, using the database cache when fresh.
 * If the cache is stale (older than ttlHours) or missing, calls the live API,
 * stores the result, and returns the fresh data.
 *
 * @param forceRefresh - bypass cache and always call the live API
 */
export async function getCarbonServicesCached(
  forceRefresh = false,
  existingCookie?: string
): Promise<{ services: CarbonService[]; fromCache: boolean; fetchedAt: Date }> {
  const db = await getDb();
  if (!db) throw new Error('[CarbonAPI] Database not available');

  // Check for a fresh cache entry
  if (!forceRefresh) {
    const rows = await db.select().from(carbonApiCache)
      .where(eq(carbonApiCache.cacheKey, CARBON_CACHE_KEY))
      .limit(1);
    if (rows.length > 0) {
      const row = rows[0];
      const ageMs = Date.now() - row.fetchedAt.getTime();
      const ttlMs = row.ttlHours * 60 * 60 * 1000;
      if (ageMs < ttlMs) {
        console.log(`[CarbonAPI] Cache hit — age ${Math.round(ageMs / 60000)}min, TTL ${row.ttlHours}h`);
        return {
          services: JSON.parse(row.rawJson) as CarbonService[],
          fromCache: true,
          fetchedAt: row.fetchedAt,
        };
      }
      console.log(`[CarbonAPI] Cache stale — age ${Math.round(ageMs / 60000)}min, TTL ${row.ttlHours}h. Refreshing...`);
    } else {
      console.log('[CarbonAPI] No cache entry found. Fetching from live API...');
    }
  } else {
    console.log('[CarbonAPI] Force refresh requested. Fetching from live API...');
  }

  // Fetch fresh data from the live API
  const liveServices = await fetchAllCarbonServices(existingCookie);
  const fetchedAt = new Date();
  const rawJson = JSON.stringify(liveServices);

  // Upsert the cache row
  await db.insert(carbonApiCache).values({
    cacheKey: CARBON_CACHE_KEY,
    totalServices: liveServices.length,
    rawJson,
    fetchedAt,
    ttlHours: CARBON_DEFAULT_TTL_HOURS,
    lastSyncedServicesCount: 0,
  }).onDuplicateKeyUpdate({
    set: {
      totalServices: liveServices.length,
      rawJson,
      fetchedAt,
      ttlHours: CARBON_DEFAULT_TTL_HOURS,
    },
  });

  console.log(`[CarbonAPI] Cached ${liveServices.length} services (TTL ${CARBON_DEFAULT_TTL_HOURS}h)`);
  return { services: liveServices, fromCache: false, fetchedAt };
}

/**
 * Get the current Carbon API cache status (age, TTL, total services, last sync).
 * Returns null if no cache entry exists yet.
 */
export async function getCarbonCacheStatus(): Promise<{
  cacheKey: string;
  totalServices: number;
  fetchedAt: Date;
  ttlHours: number;
  ageMinutes: number;
  isStale: boolean;
  lastSyncedServicesCount: number;
  lastSyncedAt: Date | null;
} | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(carbonApiCache)
    .where(eq(carbonApiCache.cacheKey, CARBON_CACHE_KEY))
    .limit(1);
  if (rows.length === 0) return null;
  const row = rows[0];
  const ageMs = Date.now() - row.fetchedAt.getTime();
  const ttlMs = row.ttlHours * 60 * 60 * 1000;
  return {
    cacheKey: row.cacheKey,
    totalServices: row.totalServices,
    fetchedAt: row.fetchedAt,
    ttlHours: row.ttlHours,
    ageMinutes: Math.round(ageMs / 60000),
    isStale: ageMs >= ttlMs,
    lastSyncedServicesCount: row.lastSyncedServicesCount,
    lastSyncedAt: row.lastSyncedAt ?? null,
  };
}

/**
 * Sync live Carbon API data into the services table.
 *
 * Matching strategy (in priority order):
 *   1. service_identifier exact match on services.externalId
 *   2. circuit_id exact match on services.externalId
 *   3. Carbon service id match on services.carbonServiceId
 *
 * For each matched service:
 *   - Updates carbonMonthlyCost, carbonPlanName, carbonServiceId, carbonAlias, carbonServiceType
 *   - Sets monthlyCost = carbonMonthlyCost and costSource = 'carbon_api'
 *   - Snapshots the old cost to service_cost_history if it was from a different source
 *
 * Carbon API is the authoritative source of truth for ABB service costs.
 */
export async function syncCarbonCostsToServices(syncedBy: string, forceRefresh = false): Promise<{
  updated: number;
  skipped: number;
  errors: number;
  notMatched: number;
  totalCarbonCost: number;
  fromCache: boolean;
  fetchedAt: Date;
  details: Array<{ externalId: string; oldCost: number; newCost: number; planName: string }>;
}> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  // 1. Get Carbon services (from cache or live API)
  const { services: carbonServices, fromCache, fetchedAt } = await getCarbonServicesCached(forceRefresh);

  // 2. Build lookup maps for matching
  const byServiceIdentifier = new Map<string, CarbonService>();
  const byCircuitId = new Map<string, CarbonService>();
  const byCarbonId = new Map<string, CarbonService>();

  for (const cs of carbonServices) {
    if (cs.service_identifier) byServiceIdentifier.set(cs.service_identifier.trim().toUpperCase(), cs);
    if (cs.circuit_id) byCircuitId.set(cs.circuit_id.trim().toUpperCase(), cs);
    byCarbonId.set(String(cs.id), cs);
  }

  // 3. Fetch all ABB services from DB
  const abbServices = await db.select({
    externalId: services.externalId,
    planName: services.planName,
    monthlyCost: services.monthlyCost,
    costSource: services.costSource,
    carbonMonthlyCost: services.carbonMonthlyCost,
    carbonPlanName: services.carbonPlanName,
    carbonServiceId: services.carbonServiceId,
    carbonAlias: services.carbonAlias,
    carbonServiceType: services.carbonServiceType,
  }).from(services).where(
    sql`${services.provider} = 'ABB'`
  );

  let updated = 0;
  let skipped = 0;
  let errors = 0;
  let notMatched = 0;
  let totalCarbonCost = 0;
  const details: Array<{ externalId: string; oldCost: number; newCost: number; planName: string }> = [];

  for (const svc of abbServices) {
    try {
      const extId = svc.externalId.trim().toUpperCase();

      // Match Carbon service to DB service
      const cs = byServiceIdentifier.get(extId)
        ?? byCircuitId.get(extId)
        ?? (svc.carbonServiceId ? byCarbonId.get(svc.carbonServiceId) : undefined);

      if (!cs) {
        notMatched++;
        continue;
      }

      // Carbon API returns prices Inc GST — convert to Ex GST (÷ 1.1), rounded to 2 decimal places
      const carbonCost = Math.round((cs.monthly_cost_cents / 100 / 1.1) * 100) / 100;
      const currentCost = parseFloat(String(svc.monthlyCost ?? 0));
      totalCarbonCost += carbonCost;

      // Determine new field values from Carbon API
      const newCarbonServiceId = String(cs.id);
      const newCarbonPlanName = cs.plan?.name ?? svc.carbonPlanName ?? '';
      const newCarbonAlias = cs.alias ?? svc.carbonAlias ?? '';
      const newCarbonServiceType = cs.type ?? svc.carbonServiceType ?? '';

      // Skip if everything is already up to date
      const costAlreadyCurrent = Math.abs(currentCost - carbonCost) < 0.005 && svc.costSource === 'carbon_api';
      const metaAlreadyCurrent =
        svc.carbonServiceId === newCarbonServiceId &&
        svc.carbonPlanName === newCarbonPlanName &&
        svc.carbonAlias === newCarbonAlias &&
        svc.carbonServiceType === newCarbonServiceType;

      if (costAlreadyCurrent && metaAlreadyCurrent) {
        skipped++;
        continue;
      }

      // Snapshot old cost before overwriting (only if it was non-zero and from a different source)
      if (currentCost > 0 && svc.costSource !== 'carbon_api') {
        await snapshotServiceCost(
          db,
          svc.externalId,
          currentCost,
          svc.costSource || 'unknown',
          'carbon_sync',
          syncedBy,
          `Overridden by live Carbon API cost $${carbonCost.toFixed(2)} (plan: ${newCarbonPlanName})`
        );
      }

      // Update the service with live Carbon data
      await db.update(services).set({
        carbonMonthlyCost: carbonCost.toFixed(2),
        carbonPlanName: newCarbonPlanName,
        carbonServiceId: newCarbonServiceId,
        carbonAlias: newCarbonAlias,
        carbonServiceType: newCarbonServiceType,
        monthlyCost: carbonCost.toFixed(2),
        costSource: 'carbon_api',
      }).where(eq(services.externalId, svc.externalId));

      details.push({
        externalId: svc.externalId,
        oldCost: currentCost,
        newCost: carbonCost,
        planName: newCarbonPlanName,
      });
      updated++;
    } catch (err) {
      console.error(`[CarbonSync] Error updating ${svc.externalId}:`, err);
      errors++;
    }
  }

  // 4. Update the cache row with sync stats
  try {
    await db.update(carbonApiCache).set({
      lastSyncedServicesCount: updated,
      lastSyncedAt: new Date(),
    }).where(eq(carbonApiCache.cacheKey, CARBON_CACHE_KEY));
  } catch (err) {
    console.error('[CarbonSync] Error updating cache stats:', err);
  }

  // 5. Recalculate customer aggregate costs
  if (updated > 0) {
    try {
      await db.execute(sql`
        UPDATE customers c
        SET monthlyCost = COALESCE((
          SELECT SUM(s.monthlyCost)
          FROM services s
          WHERE s.customerExternalId = c.externalId
            AND s.status NOT IN ('terminated', 'inactive')
        ), 0)
      `);
    } catch (err) {
      console.error('[CarbonSync] Error recalculating customer costs:', err);
    }
  }

  return { updated, skipped, errors, notMatched, totalCarbonCost, fromCache, fetchedAt, details };
}

/**
 * Also update costSource for services that have a known supplier invoice cost but no costSource set.
 * This is a one-time backfill for existing data.
 */
export async function backfillCostSources(): Promise<{ updated: number }> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  // ABB services with carbonMonthlyCost matching monthlyCost → carbon_api
  const r1 = await db.execute(sql`
    UPDATE services
    SET costSource = 'carbon_api'
    WHERE provider = 'ABB'
      AND carbonMonthlyCost IS NOT NULL
      AND carbonMonthlyCost > 0
      AND ABS(monthlyCost - carbonMonthlyCost) < 0.01
      AND (costSource IS NULL OR costSource = '' OR costSource = 'unknown')
  `);

  // Non-ABB services with monthlyCost > 0 and no costSource → supplier_invoice
  const r2 = await db.execute(sql`
    UPDATE services
    SET costSource = 'supplier_invoice'
    WHERE provider != 'ABB'
      AND provider != 'Unknown'
      AND monthlyCost > 0
      AND (costSource IS NULL OR costSource = '' OR costSource = 'unknown')
  `);

  const r1Rows = r1 as unknown as { affectedRows?: number }[];
  const r2Rows = r2 as unknown as { affectedRows?: number }[];
  const updated = (r1Rows[0]?.affectedRows ?? 0) + (r2Rows[0]?.affectedRows ?? 0);
  return { updated };
}

// ─────────────────────────────────────────────────────────────────────────────
// SASBOSS DISPATCH WORKBOOK IMPORT
// ─────────────────────────────────────────────────────────────────────────────

export interface SasBossPivotRow {
  enterprise_name: string;
  product_name: string;
  product_type: string;
  service_ref_id?: string;
  sum_ex_gst: number;
  sum_inc_gst: number;
}

export interface SasBossCallUsageRow {
  enterprise_name: string;
  call_usage_ex_gst: number;
}

export interface SasBossImportResult {
  uploadId: number;
  workbookName: string;
  billingMonth: string;
  totalExGst: number;
  lineItemCount: number;
  matchedCount: number;
  unmatchedCount: number;
  callUsageCount: number;
  callUsageMatchedCount: number;
  details: {
    enterpriseName: string;
    productName: string;
    productType: string;
    amountExGst: number;
    matchStatus: 'matched' | 'unmatched' | 'partial';
    matchedCustomerName?: string;
    matchedServiceExternalId?: string;
    matchConfidence?: number;
  }[];
  unmatchedItems: {
    enterpriseName: string;
    productName: string;
    productType: string;
    amountExGst: number;
    reason: string;
  }[];
}

/**
 * Normalise a string for fuzzy matching: lowercase, strip punctuation, collapse spaces.
 */
function normaliseName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Token overlap score between two strings (0–1).
 * Tokens shorter than 3 chars are ignored to reduce noise.
 */
function tokenMatchScore(a: string, b: string): number {
  const ta = Array.from(new Set(normaliseName(a).split(' ').filter(t => t.length > 2)));
  const tb = Array.from(new Set(normaliseName(b).split(' ').filter(t => t.length > 2)));
  const tbSet = new Set(tb);
  if (ta.length === 0 || tb.length === 0) return 0;
  let matches = 0;
  for (const t of ta) {
    if (tbSet.has(t)) { matches++; continue; }
    for (const u of tb) {
      if (t.includes(u) || u.includes(t)) { matches += 0.5; break; }
    }
  }
  return matches / Math.max(ta.length, tb.length);
}

/**
 * Map SasBoss product type to our service type enum.
 */
function mapProductTypeToServiceType(productType: string): string {
  const pt = productType.toLowerCase();
  if (pt === 'did-number') return 'Voice';
  if (pt === 'call-pack') return 'Voice';
  if (pt === 'service-pack') return 'Voice';
  return 'Voice'; // SasBoss is a voice/UCaaS platform
}

/**
 * Import a SasBoss Dispatch Charges workbook.
 * - Matches enterprises to customers by name (fuzzy)
 * - Matches products to existing voice services by customer + plan name (fuzzy)
 * - Creates new unmatched services for unresolved line items
 * - Records call usage summaries per customer
 * - Updates service costs and billing platform tags
 */
export async function importSasBossDispatch(
  workbookName: string,
  billingMonth: string,
  invoiceReference: string,
  pivotRows: SasBossPivotRow[],
  callUsageRows: SasBossCallUsageRow[],
  importedBy: string
): Promise<SasBossImportResult> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  // ── 1. Load all active customers for matching ──────────────────────────────
  const allCustomers = await db
    .select({ externalId: customers.externalId, name: customers.name })
    .from(customers)
    .where(ne(customers.status, 'inactive'));

  function findBestCustomer(enterpriseName: string) {
    let best: (typeof allCustomers)[0] | null = null;
    let bestScore = 0;
    for (const c of allCustomers) {
      const score = tokenMatchScore(enterpriseName, c.name);
      if (score > bestScore) { bestScore = score; best = c; }
    }
    return bestScore >= 0.35 ? { customer: best!, score: bestScore } : null;
  }

  // ── 2. Load all SasBoss voice services for matching ────────────────────────
  const existingVoiceServices = await db
    .select({
      externalId: services.externalId,
      planName: services.planName,
      customerExternalId: services.customerExternalId,
      customerName: services.customerName,
      serviceType: services.serviceType,
      supplierName: services.supplierName,
    })
    .from(services)
    .where(and(
      eq(services.supplierName, 'SasBoss'),
      ne(services.status, 'inactive')
    ));

  // ── 3. Create the workbook upload record ───────────────────────────────────
  const totalExGst = pivotRows.reduce((sum, r) => sum + (r.sum_ex_gst || 0), 0);
  const totalIncGst = pivotRows.reduce((sum, r) => sum + (r.sum_inc_gst || 0), 0);

  const [uploadResult] = await db.insert(supplierWorkbookUploads).values({
    supplier: 'SasBoss',
    workbookName,
    billingMonth,
    invoiceReference,
    totalExGst: String(totalExGst.toFixed(2)),
    totalIncGst: String(totalIncGst.toFixed(2)),
    lineItemCount: pivotRows.length,
    matchedCount: 0, // will update after matching
    unmatchedCount: 0,
    importedBy,
    status: 'complete',
  });
  const uploadId = Number((uploadResult as any).insertId ?? 0);

  // ── 4. Process all pivot rows in-memory, then batch insert ──────────────────
  const details: SasBossImportResult['details'] = [];
  const unmatchedItems: SasBossImportResult['unmatchedItems'] = [];
  let matchedCount = 0;
  let unmatchedCount = 0;

  // Collect batch operations
  const lineItemsToInsert: any[] = [];
  const newServicesToInsert: any[] = [];
  const serviceUpdates: Array<{ externalId: string; cost: string; account: string }> = [];

  // Group pivot rows by enterprise for efficiency
  const byEnterprise = new Map<string, SasBossPivotRow[]>();
  for (const row of pivotRows) {
    const key = row.enterprise_name;
    if (!byEnterprise.has(key)) byEnterprise.set(key, []);
    byEnterprise.get(key)!.push(row);
  }

  for (const [enterpriseName, rows] of Array.from(byEnterprise.entries())) {
    const customerMatch = findBestCustomer(enterpriseName);
    const customerExtId = customerMatch?.customer.externalId ?? null;
    const customerName = customerMatch?.customer.name ?? null;
    const customerScore = customerMatch?.score ?? 0;

    // Load this customer's existing SasBoss services for product matching
    const customerServices = customerExtId
      ? existingVoiceServices.filter(s => s.customerExternalId === customerExtId)
      : [];

    for (const row of rows) {
      const amountExGst = Number(row.sum_ex_gst) || 0;
      const amountIncGst = Number(row.sum_inc_gst) || 0;

      // Try to match to an existing service by plan name
      let matchedService: (typeof existingVoiceServices)[0] | null = null;
      let serviceScore = 0;
      for (const svc of customerServices) {
        const score = tokenMatchScore(row.product_name, svc.planName ?? '');
        if (score > serviceScore) { serviceScore = score; matchedService = svc; }
      }
      const serviceMatched = serviceScore >= 0.4;

      let matchStatus: 'matched' | 'unmatched' | 'partial' = 'unmatched';
      let matchedServiceExtId = '';

      if (customerExtId && serviceMatched && matchedService) {
        // Full match: customer + service
        matchStatus = 'matched';
        matchedServiceExtId = matchedService.externalId;
        matchedCount++;
        serviceUpdates.push({
          externalId: matchedService.externalId,
          cost: String(amountExGst.toFixed(2)),
          account: invoiceReference || billingMonth,
        });

      } else if (customerExtId && !serviceMatched) {
        // Partial match: customer found but no matching service
        matchStatus = 'partial';
        unmatchedCount++;
        const newServiceId = 'SS' + Math.random().toString(36).slice(2, 8).toUpperCase();
        matchedServiceExtId = newServiceId;
        newServicesToInsert.push({
          externalId: newServiceId,
          customerExternalId: customerExtId,
          customerName,
          serviceType: mapProductTypeToServiceType(row.product_type),
          planName: row.product_name,
          supplierName: 'SasBoss',
          supplierAccount: invoiceReference || billingMonth,
          monthlyCost: String(amountExGst.toFixed(2)),
          costSource: 'supplier_invoice',
          billingPlatform: JSON.stringify(['SasBoss']),
          status: 'active',
          provider: 'SasBoss',
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        unmatchedItems.push({
          enterpriseName,
          productName: row.product_name,
          productType: row.product_type,
          amountExGst,
          reason: `Customer matched to "${customerName}" but no existing service found for product "${row.product_name}". New service created.`,
        });

      } else {
        // No customer match at all
        matchStatus = 'unmatched';
        unmatchedCount++;
        const newServiceId = 'SS' + Math.random().toString(36).slice(2, 8).toUpperCase();
        matchedServiceExtId = newServiceId;
        newServicesToInsert.push({
          externalId: newServiceId,
          customerExternalId: null,
          customerName: enterpriseName,
          serviceType: mapProductTypeToServiceType(row.product_type),
          planName: row.product_name,
          supplierName: 'SasBoss',
          supplierAccount: invoiceReference || billingMonth,
          monthlyCost: String(amountExGst.toFixed(2)),
          costSource: 'supplier_invoice',
          billingPlatform: JSON.stringify(['SasBoss']),
          status: 'unmatched',
          provider: 'SasBoss',
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        unmatchedItems.push({
          enterpriseName,
          productName: row.product_name,
          productType: row.product_type,
          amountExGst,
          reason: `No customer found matching "${enterpriseName}" in the database.`,
        });
      }

      lineItemsToInsert.push({
        uploadId,
        enterpriseName,
        productName: row.product_name,
        productType: row.product_type,
        serviceRefId: row.service_ref_id ?? '',
        amountExGst: String(amountExGst.toFixed(2)),
        amountIncGst: String(amountIncGst.toFixed(2)),
        matchStatus,
        matchedCustomerExternalId: customerExtId ?? '',
        matchedCustomerName: customerName ?? '',
        matchedServiceExternalId: matchedServiceExtId,
        matchConfidence: String(Math.max(customerScore, serviceScore).toFixed(2)),
      });

      details.push({
        enterpriseName,
        productName: row.product_name,
        productType: row.product_type,
        amountExGst,
        matchStatus,
        matchedCustomerName: customerName ?? undefined,
        matchedServiceExternalId: matchedServiceExtId || undefined,
        matchConfidence: Math.max(customerScore, serviceScore),
      });
    }
  }

  // ── 5. Execute all DB writes in bulk ──────────────────────────────────────
  // Batch insert new services (unmatched + partial)
  const CHUNK = 50;
  if (newServicesToInsert.length > 0) {
    for (let i = 0; i < newServicesToInsert.length; i += CHUNK) {
      await db.insert(services).values(newServicesToInsert.slice(i, i + CHUNK) as any);
    }
  }

  // Batch update matched services (run in parallel, capped at 10 concurrent)
  for (let i = 0; i < serviceUpdates.length; i += 10) {
    await Promise.all(
      serviceUpdates.slice(i, i + 10).map(u =>
        db.update(services).set({
          monthlyCost: u.cost,
          costSource: 'supplier_invoice',
          billingPlatform: JSON.stringify(['SasBoss']),
          supplierAccount: u.account,
          updatedAt: new Date(),
        }).where(eq(services.externalId, u.externalId))
      )
    );
  }

  // Batch insert line items
  if (lineItemsToInsert.length > 0) {
    for (let i = 0; i < lineItemsToInsert.length; i += CHUNK) {
      await db.insert(supplierWorkbookLineItems).values(lineItemsToInsert.slice(i, i + CHUNK));
    }
  }

  // ── 5b. Write match provenance for all matched/partial services ─────────────
  const provenanceToWrite = details
    .filter(d => d.matchedServiceExternalId && d.matchedCustomerName)
    .map(d => ({
      serviceExternalId: d.matchedServiceExternalId!,
      customerExternalId: lineItemsToInsert.find(li => li.matchedServiceExternalId === d.matchedServiceExternalId)?.matchedCustomerExternalId || '',
      matchMethod: 'workbook_import' as const,
      matchSource: 'workbook_upload' as const,
      matchedBy: importedBy,
      confidence: (d.matchConfidence ?? 0) >= 0.7 ? 'high' as const : (d.matchConfidence ?? 0) >= 0.4 ? 'medium' as const : 'low' as const,
      matchCriteria: { enterpriseName: d.enterpriseName, productName: d.productName, score: d.matchConfidence, workbook: workbookName, billingMonth },
      notes: `Matched via SasBoss workbook import (${workbookName}, ${billingMonth})`,
    }))
    .filter(p => p.customerExternalId);
  for (const p of provenanceToWrite) {
    await writeMatchProvenance(p);
  }

  // ── 6. Update upload record with final counts ──────────────────────────────
  await db.update(supplierWorkbookUploads).set({
    matchedCount,
    unmatchedCount,
    updatedAt: new Date(),
  }).where(eq(supplierWorkbookUploads.id, uploadId));

  // ── 7. Process call usage summaries (batch) ────────────────────────────────
  let callUsageMatchedCount = 0;
  // usageMonth is the month BEFORE billingMonth (February usage in March workbook)
  const [billingYear, billingMonthNum] = billingMonth.split('-').map(Number);
  const usageMonthDate = new Date(billingYear, billingMonthNum - 2, 1); // one month back
  const usageMonth = `${usageMonthDate.getFullYear()}-${String(usageMonthDate.getMonth() + 1).padStart(2, '0')}`;

  const usageToInsert: any[] = [];
  for (const cu of callUsageRows) {
    if (!cu.enterprise_name || cu.call_usage_ex_gst === 0) continue;
    const customerMatch = findBestCustomer(cu.enterprise_name);
    if (!customerMatch) continue;
    callUsageMatchedCount++;
    const callUsageIncGst = cu.call_usage_ex_gst * 1.1;
    usageToInsert.push({
      uploadId,
      customerExternalId: customerMatch.customer.externalId,
      customerName: customerMatch.customer.name,
      usageMonth,
      usageType: 'call-usage',
      supplier: 'SasBoss',
      totalExGst: String(cu.call_usage_ex_gst.toFixed(2)),
      totalIncGst: String(callUsageIncGst.toFixed(2)),
      notes: `Imported from ${workbookName}`,
    });
  }

  // Delete existing usage for same month+supplier before bulk insert
  if (usageToInsert.length > 0) {
    await db.delete(customerUsageSummaries).where(
      and(
        eq(customerUsageSummaries.usageMonth, usageMonth),
        eq(customerUsageSummaries.supplier, 'SasBoss')
      )
    );
    for (let i = 0; i < usageToInsert.length; i += CHUNK) {
      await db.insert(customerUsageSummaries).values(usageToInsert.slice(i, i + CHUNK));
    }
  }

  return {
    uploadId,
    workbookName,
    billingMonth,
    totalExGst,
    lineItemCount: pivotRows.length,
    matchedCount,
    unmatchedCount,
    callUsageCount: callUsageRows.length,
    callUsageMatchedCount,
    details,
    unmatchedItems,
  };
}

/**
 * Get all supplier workbook uploads, most recent first.
 */
export async function getSupplierWorkbookUploads() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(supplierWorkbookUploads).orderBy(desc(supplierWorkbookUploads.importedAt));
}

/**
 * Get line items for a specific workbook upload.
 */
export async function getWorkbookLineItems(uploadId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(supplierWorkbookLineItems)
    .where(eq(supplierWorkbookLineItems.uploadId, uploadId))
    .orderBy(asc(supplierWorkbookLineItems.enterpriseName));
}

/**
 * Get call usage summaries for a customer.
 */
export async function getCustomerUsageSummaries(customerExternalId: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(customerUsageSummaries)
    .where(eq(customerUsageSummaries.customerExternalId, customerExternalId))
    .orderBy(desc(customerUsageSummaries.usageMonth));
}

// ── SasBoss Dry-Run & Confirm (Two-Phase Import) ──────────────────────────────

export interface SasBossMatchProposal {
  rowIndex: number;
  enterpriseName: string;
  productName: string;
  productType: string;
  serviceRefId: string;
  amountExGst: number;
  amountIncGst: number;
  // Customer match
  customerConfidence: 'mapped' | 'exact' | 'fuzzy' | 'none';
  customerScore: number;
  matchedCustomerExternalId: string | null;
  matchedCustomerName: string | null;
  // Service match
  serviceConfidence: 'exact' | 'fuzzy' | 'none';
  serviceScore: number;
  matchedServiceExternalId: string | null;
  matchedServicePlanName: string | null;
  // Overall
  overallConfidence: 'mapped' | 'exact' | 'fuzzy' | 'none';
  requiresReview: boolean;
  // Product mapping
  productInternalType?: string | null;
  productBillingLabel?: string | null;
  // User decision (filled in by frontend)
  approved?: boolean;
  overrideCustomerExternalId?: string | null;
}

export interface SasBossDryRunResult {
  workbookName: string;
  billingMonth: string;
  totalExGst: number;
  lineItemCount: number;
  exactCount: number;
  fuzzyCount: number;
  noneCount: number;
  proposals: SasBossMatchProposal[];
  callUsageProposals: Array<{
    enterpriseName: string;
    callUsageExGst: number;
    customerConfidence: 'mapped' | 'exact' | 'fuzzy' | 'none';
    customerScore: number;
    matchedCustomerExternalId: string | null;
    matchedCustomerName: string | null;
  }>;
}

/**
 * Dry-run: analyse the workbook and return match proposals with confidence scores.
 * No DB writes occur. The frontend shows this to the user for review.
 */
export async function dryRunSasBossDispatch(
  workbookName: string,
  billingMonth: string,
  pivotRows: SasBossPivotRow[],
  callUsageRows: SasBossCallUsageRow[]
): Promise<SasBossDryRunResult> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  // ── Load mapping tables (primary match source) ───────────────────────────
  const enterpriseMaps = await db
    .select()
    .from(supplierEnterpriseMap)
    .where(eq(supplierEnterpriseMap.supplierName, 'SasBoss'));
  const enterpriseMapByName = new Map(enterpriseMaps.map(m => [m.enterpriseName.toLowerCase().trim(), m]));

  const productMaps = await db
    .select()
    .from(supplierProductMap)
    .where(eq(supplierProductMap.supplierName, 'SasBoss'));
  const productMapByKey = new Map(productMaps.map(m => [`${m.productName.toLowerCase().trim()}|${m.productType.toLowerCase().trim()}`, m]));

  // ── Load all active customers (fallback for fuzzy matching) ───────────────
  const allCustomers = await db
    .select({ externalId: customers.externalId, name: customers.name })
    .from(customers)
    .where(ne(customers.status, 'inactive'));

  // Load all SasBoss voice services
  const existingVoiceServices = await db
    .select({
      externalId: services.externalId,
      planName: services.planName,
      customerExternalId: services.customerExternalId,
      customerName: services.customerName,
      serviceType: services.serviceType,
    })
    .from(services)
    .where(and(
      eq(services.supplierName, 'SasBoss'),
      ne(services.status, 'inactive')
    ));

  function findBestCustomer(name: string) {
    // 1. Check mapping table first (exact key match)
    const mapped = enterpriseMapByName.get(name.toLowerCase().trim());
    if (mapped) {
      return { customer: { externalId: mapped.customerExternalId, name: mapped.customerName }, score: 1.0, fromMap: true };
    }
    // 2. Fall back to fuzzy matching
    let best: (typeof allCustomers)[0] | null = null;
    let bestScore = 0;
    for (const c of allCustomers) {
      const score = tokenMatchScore(name, c.name);
      if (score > bestScore) { bestScore = score; best = c; }
    }
    return { customer: best, score: bestScore, fromMap: false };
  }

  function customerConfidenceTier(score: number, fromMap: boolean): 'mapped' | 'exact' | 'fuzzy' | 'none' {
    if (fromMap) return 'mapped'; // confirmed from mapping table → auto-accept
    if (score >= 0.9) return 'exact';
    if (score >= 0.5) return 'fuzzy';
    return 'none';
  }

  function serviceConfidenceTier(score: number): 'exact' | 'fuzzy' | 'none' {
    if (score >= 0.8) return 'exact';
    if (score >= 0.4) return 'fuzzy';
    return 'none';
  }

  const proposals: SasBossMatchProposal[] = [];
  let exactCount = 0, fuzzyCount = 0, noneCount = 0;

  for (let rowIndex = 0; rowIndex < pivotRows.length; rowIndex++) {
    const row = pivotRows[rowIndex];
    const { customer, score: custScore, fromMap } = findBestCustomer(row.enterprise_name);
    const custTier = customerConfidenceTier(custScore, fromMap);
    const custExtId = custTier !== 'none' && customer ? customer.externalId : null;
    const custName = custTier !== 'none' && customer ? customer.name : null;

    // Find best service match within this customer's SasBoss services
    const custServices = custExtId
      ? existingVoiceServices.filter(s => s.customerExternalId === custExtId)
      : [];
    let bestSvc: (typeof existingVoiceServices)[0] | null = null;
    let bestSvcScore = 0;
    for (const svc of custServices) {
      const score = tokenMatchScore(row.product_name, svc.planName ?? '');
      if (score > bestSvcScore) { bestSvcScore = score; bestSvc = svc; }
    }
    const svcTier = serviceConfidenceTier(bestSvcScore);

    // Check product map for service type classification
    const productKey = `${row.product_name.toLowerCase().trim()}|${(row.product_type || '').toLowerCase().trim()}`;
    const productMapping = productMapByKey.get(productKey);

    // Overall confidence: 'mapped' > 'exact' > 'fuzzy' > 'none'
    // A mapped customer with any service tier is auto-acceptable
    const tierOrder = { mapped: 3, exact: 2, fuzzy: 1, none: 0 } as const;
    type ConfidenceTier = 'mapped' | 'exact' | 'fuzzy' | 'none';
    const overallTier: ConfidenceTier = tierOrder[custTier] <= tierOrder[svcTier as ConfidenceTier]
      ? custTier
      : (svcTier as ConfidenceTier);

    // Requires review if customer is fuzzy/none (mapped and exact are auto-accepted)
    const requiresReview = custTier === 'fuzzy' || custTier === 'none';

    if (overallTier === 'mapped' || overallTier === 'exact') exactCount++;
    else if (overallTier === 'fuzzy') fuzzyCount++;
    else noneCount++;

    proposals.push({
      rowIndex,
      enterpriseName: row.enterprise_name,
      productName: row.product_name,
      productType: row.product_type,
      serviceRefId: row.service_ref_id ?? '',
      amountExGst: Number(row.sum_ex_gst) || 0,
      amountIncGst: Number(row.sum_inc_gst) || 0,
      customerConfidence: custTier,
      customerScore: custScore,
      matchedCustomerExternalId: custExtId,
      matchedCustomerName: custName,
      serviceConfidence: svcTier,
      serviceScore: bestSvcScore,
      matchedServiceExternalId: bestSvc?.externalId ?? null,
      matchedServicePlanName: bestSvc?.planName ?? null,
      overallConfidence: overallTier,
      requiresReview,
      productInternalType: productMapping?.internalServiceType ?? null,
      productBillingLabel: productMapping?.billingLabel ?? null,
    });
  }

  // Call usage proposals — also check mapping table
  const callUsageProposals = callUsageRows.map(cu => {
    const { customer, score, fromMap } = findBestCustomer(cu.enterprise_name);
    const tier = customerConfidenceTier(score, fromMap);
    return {
      enterpriseName: cu.enterprise_name,
      callUsageExGst: cu.call_usage_ex_gst,
      customerConfidence: tier,
      customerScore: score,
      matchedCustomerExternalId: tier !== 'none' && customer ? customer.externalId : null,
      matchedCustomerName: tier !== 'none' && customer ? customer.name : null,
    };
  });

  return {
    workbookName,
    billingMonth,
    totalExGst: pivotRows.reduce((s, r) => s + (Number(r.sum_ex_gst) || 0), 0),
    lineItemCount: pivotRows.length,
    exactCount,
    fuzzyCount,
    noneCount,
    proposals,
    callUsageProposals,
  };
}

export interface SasBossConfirmInput {
  workbookName: string;
  billingMonth: string;
  invoiceReference: string;
  importedBy: string;
  // Each proposal with user decisions applied
  approvedProposals: Array<{
    rowIndex: number;
    enterpriseName: string;
    productName: string;
    productType: string;
    serviceRefId: string;
    amountExGst: number;
    amountIncGst: number;
    // User-confirmed customer (may differ from original match)
    confirmedCustomerExternalId: string | null;
    confirmedCustomerName: string | null;
    // User-confirmed service (may differ from original match)
    confirmedServiceExternalId: string | null;
    // Original confidence tier from dry-run (used to decide whether to persist mapping)
    originalConfidence: 'mapped' | 'exact' | 'fuzzy' | 'none';
    // Whether this row was approved or skipped
    action: 'approve' | 'skip';
  }>;
  callUsageProposals: Array<{
    enterpriseName: string;
    callUsageExGst: number;
    confirmedCustomerExternalId: string | null;
    confirmedCustomerName: string | null;
    originalConfidence: 'mapped' | 'exact' | 'fuzzy' | 'none';
    action: 'approve' | 'skip';
  }>;
}

/**
 * Confirm: commit only the user-approved proposals to the database.
 */
export async function confirmSasBossDispatch(input: SasBossConfirmInput): Promise<SasBossImportResult> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  const { workbookName, billingMonth, invoiceReference, importedBy, approvedProposals, callUsageProposals } = input;
  const approvedRows = approvedProposals.filter(p => p.action === 'approve');
  const totalExGst = approvedRows.reduce((s, r) => s + r.amountExGst, 0);
  const totalIncGst = approvedRows.reduce((s, r) => s + r.amountIncGst, 0);

  // Create workbook upload record
  const [uploadResult] = await db.insert(supplierWorkbookUploads).values({
    supplier: 'SasBoss',
    workbookName,
    billingMonth,
    invoiceReference,
    totalExGst: String(totalExGst.toFixed(2)),
    totalIncGst: String(totalIncGst.toFixed(2)),
    lineItemCount: approvedProposals.length,
    matchedCount: 0,
    unmatchedCount: 0,
    importedBy,
    status: 'complete',
  });
  const uploadId = Number((uploadResult as any).insertId ?? 0);

  const lineItemsToInsert: any[] = [];
  const newServicesToInsert: any[] = [];
  const serviceUpdates: Array<{ externalId: string; cost: string; account: string }> = [];
  const unmatchedItems: SasBossImportResult['unmatchedItems'] = [];
  const details: SasBossImportResult['details'] = [];
  let matchedCount = 0, unmatchedCount = 0;

  const CHUNK = 50;

  for (const p of approvedRows) {
    const { confirmedCustomerExternalId: custExtId, confirmedCustomerName: custName,
      confirmedServiceExternalId: svcExtId } = p;

    let matchStatus: 'matched' | 'unmatched' | 'partial' = 'unmatched';
    let finalSvcExtId = svcExtId ?? '';

    if (custExtId && svcExtId) {
      // Full match — update existing service cost
      matchStatus = 'matched';
      matchedCount++;
      serviceUpdates.push({
        externalId: svcExtId,
        cost: String(p.amountExGst.toFixed(2)),
        account: invoiceReference || billingMonth,
      });
    } else if (custExtId && !svcExtId) {
      // Partial match — create new service
      matchStatus = 'partial';
      unmatchedCount++;
      const newId = 'SS' + Math.random().toString(36).slice(2, 8).toUpperCase();
      finalSvcExtId = newId;
      newServicesToInsert.push({
        externalId: newId,
        customerExternalId: custExtId,
        customerName: custName,
        serviceType: mapProductTypeToServiceType(p.productType),
        planName: p.productName,
        supplierName: 'SasBoss',
        supplierAccount: invoiceReference || billingMonth,
        monthlyCost: String(p.amountExGst.toFixed(2)),
        costSource: 'supplier_invoice',
        billingPlatform: JSON.stringify(['SasBoss']),
        status: 'active',
        provider: 'SasBoss',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      unmatchedItems.push({
        enterpriseName: p.enterpriseName,
        productName: p.productName,
        productType: p.productType,
        amountExGst: p.amountExGst,
        reason: `Customer matched to "${custName}" but no existing service — new service created.`,
      });
    } else {
      // No customer — create unmatched service
      matchStatus = 'unmatched';
      unmatchedCount++;
      const newId = 'SS' + Math.random().toString(36).slice(2, 8).toUpperCase();
      finalSvcExtId = newId;
      newServicesToInsert.push({
        externalId: newId,
        customerExternalId: null,
        customerName: p.enterpriseName,
        serviceType: mapProductTypeToServiceType(p.productType),
        planName: p.productName,
        supplierName: 'SasBoss',
        supplierAccount: invoiceReference || billingMonth,
        monthlyCost: String(p.amountExGst.toFixed(2)),
        costSource: 'supplier_invoice',
        billingPlatform: JSON.stringify(['SasBoss']),
        status: 'unmatched',
        provider: 'SasBoss',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      unmatchedItems.push({
        enterpriseName: p.enterpriseName,
        productName: p.productName,
        productType: p.productType,
        amountExGst: p.amountExGst,
        reason: `No customer confirmed for "${p.enterpriseName}".`,
      });
    }

    lineItemsToInsert.push({
      uploadId,
      enterpriseName: p.enterpriseName,
      productName: p.productName,
      productType: p.productType,
      serviceRefId: p.serviceRefId,
      amountExGst: String(p.amountExGst.toFixed(2)),
      amountIncGst: String(p.amountIncGst.toFixed(2)),
      matchStatus,
      matchedCustomerExternalId: custExtId ?? '',
      matchedCustomerName: custName ?? '',
      matchedServiceExternalId: finalSvcExtId,
      matchConfidence: '1.00',
    });

    details.push({
      enterpriseName: p.enterpriseName,
      productName: p.productName,
      productType: p.productType,
      amountExGst: p.amountExGst,
      matchStatus,
      matchedCustomerName: custName ?? undefined,
      matchedServiceExternalId: finalSvcExtId || undefined,
      matchConfidence: 1,
    });
  }

  // ── Persist new enterprise mappings for fuzzy/none matches that were approved ──
  // Only persist when user has confirmed a customer (i.e., action='approve' and confirmedCustomerExternalId set)
  // Mappings from 'mapped' tier already exist; 'exact' tier is high-confidence auto-match, persist too.
  const enterpriseMappingsToUpsert = new Map<string, { customerExternalId: string; customerName: string }>();
  for (const p of approvedRows) {
    if (p.confirmedCustomerExternalId && p.confirmedCustomerName) {
      // Always upsert — ensures mapping is current even if customer was reassigned
      const key = p.enterpriseName.toLowerCase().trim();
      if (!enterpriseMappingsToUpsert.has(key)) {
        enterpriseMappingsToUpsert.set(key, {
          customerExternalId: p.confirmedCustomerExternalId,
          customerName: p.confirmedCustomerName,
        });
      }
    }
  }
  // Also persist call usage enterprise mappings
  for (const cu of callUsageProposals.filter(c => c.action === 'approve' && c.confirmedCustomerExternalId)) {
    const key = cu.enterpriseName.toLowerCase().trim();
    if (!enterpriseMappingsToUpsert.has(key) && cu.confirmedCustomerExternalId && cu.confirmedCustomerName) {
      enterpriseMappingsToUpsert.set(key, {
        customerExternalId: cu.confirmedCustomerExternalId,
        customerName: cu.confirmedCustomerName,
      });
    }
  }
  // Build a map of customerExternalId -> customerId (DB int id) for mapping inserts
  const uniqueCustomerExtIds = Array.from(new Set(
    Array.from(enterpriseMappingsToUpsert.values()).map(m => m.customerExternalId)
  ));
  const customerIdMap = new Map<string, number>();
  if (uniqueCustomerExtIds.length > 0) {
    const customerRows = await db
      .select({ externalId: customers.externalId, id: customers.id })
      .from(customers)
      .where(inArray(customers.externalId, uniqueCustomerExtIds));
    for (const row of customerRows) {
      customerIdMap.set(row.externalId, row.id);
    }
  }

  for (const [enterpriseKey, mapping] of Array.from(enterpriseMappingsToUpsert.entries())) {
    // Find the original enterprise name from the proposals (preserve original casing)
    const originalEnterpriseName = approvedRows.find(
      p => p.confirmedCustomerExternalId === mapping.customerExternalId
    )?.enterpriseName ?? callUsageProposals.find(
      c => c.confirmedCustomerExternalId === mapping.customerExternalId
    )?.enterpriseName ?? '';
    if (!originalEnterpriseName) continue;
    const customerId = customerIdMap.get(mapping.customerExternalId) ?? 0;
    await db.insert(supplierEnterpriseMap).values({
      supplierName: 'SasBoss',
      enterpriseName: originalEnterpriseName,
      customerId,
      customerExternalId: mapping.customerExternalId,
      customerName: mapping.customerName,
      confirmedBy: 'manual',
      createdAt: new Date(),
      updatedAt: new Date(),
    }).onDuplicateKeyUpdate({
      set: {
        customerExternalId: mapping.customerExternalId,
        customerName: mapping.customerName,
        customerId,
        confirmedBy: 'manual',
        updatedAt: new Date(),
      },
    });
  }

  // Execute DB writes
  if (newServicesToInsert.length > 0) {
    for (let i = 0; i < newServicesToInsert.length; i += CHUNK) {
      await db.insert(services).values(newServicesToInsert.slice(i, i + CHUNK) as any);
    }
  }
  for (let i = 0; i < serviceUpdates.length; i += 10) {
    await Promise.all(
      serviceUpdates.slice(i, i + 10).map(u =>
        db.update(services).set({
          monthlyCost: u.cost,
          costSource: 'supplier_invoice',
          billingPlatform: JSON.stringify(['SasBoss']),
          supplierAccount: u.account,
          updatedAt: new Date(),
        }).where(eq(services.externalId, u.externalId))
      )
    );
  }
  if (lineItemsToInsert.length > 0) {
    for (let i = 0; i < lineItemsToInsert.length; i += CHUNK) {
      await db.insert(supplierWorkbookLineItems).values(lineItemsToInsert.slice(i, i + CHUNK));
    }
  }

  // Update upload record
  await db.update(supplierWorkbookUploads).set({
    matchedCount,
    unmatchedCount,
    updatedAt: new Date(),
  }).where(eq(supplierWorkbookUploads.id, uploadId));

  // Process call usage
  let callUsageMatchedCount = 0;
  const [billingYear, billingMonthNum] = billingMonth.split('-').map(Number);
  const usageMonthDate = new Date(billingYear, billingMonthNum - 2, 1);
  const usageMonth = `${usageMonthDate.getFullYear()}-${String(usageMonthDate.getMonth() + 1).padStart(2, '0')}`;

  const usageToInsert: any[] = [];
  for (const cu of callUsageProposals.filter(c => c.action === 'approve' && c.confirmedCustomerExternalId)) {
    callUsageMatchedCount++;
    const callUsageIncGst = cu.callUsageExGst * 1.1;
    usageToInsert.push({
      uploadId,
      customerExternalId: cu.confirmedCustomerExternalId,
      customerName: cu.confirmedCustomerName,
      usageMonth,
      usageType: 'call-usage',
      supplier: 'SasBoss',
      totalExGst: String(cu.callUsageExGst.toFixed(2)),
      totalIncGst: String(callUsageIncGst.toFixed(2)),
      notes: `Imported from ${workbookName}`,
    });
  }

  if (usageToInsert.length > 0) {
    await db.delete(customerUsageSummaries).where(
      and(
        eq(customerUsageSummaries.usageMonth, usageMonth),
        eq(customerUsageSummaries.supplier, 'SasBoss')
      )
    );
    for (let i = 0; i < usageToInsert.length; i += CHUNK) {
      await db.insert(customerUsageSummaries).values(usageToInsert.slice(i, i + CHUNK));
    }
  }

  return {
    uploadId,
    workbookName,
    billingMonth,
    totalExGst,
    lineItemCount: approvedProposals.length,
    matchedCount,
    unmatchedCount,
    callUsageCount: callUsageProposals.length,
    callUsageMatchedCount,
    details,
    unmatchedItems,
  };
}

// ── Unmatched Billing Services ────────────────────────────────────────────────

/**
 * Returns active services for a customer that have no billing item linked.
 * "No billing outcome" = no billing_items row with serviceExternalId = this service's externalId.
 * Excludes terminated and unmatched services (those are handled elsewhere).
 */
export async function getServicesWithoutBilling(customerExternalId: string) {
  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .select({
      externalId: services.externalId,
      serviceType: services.serviceType,
      serviceTypeDetail: services.serviceTypeDetail,
      planName: services.planName,
      phoneNumber: services.phoneNumber,
      connectionId: services.connectionId,
      locationAddress: services.locationAddress,
      supplierName: services.supplierName,
      provider: services.provider,
      monthlyCost: services.monthlyCost,
      monthlyRevenue: services.monthlyRevenue,
      costSource: services.costSource,
      billingPlatform: services.billingPlatform,
      status: services.status,
      createdAt: services.createdAt,
    })
    .from(services)
    .leftJoin(
      billingItems,
      sql`${billingItems.serviceExternalId} = ${services.externalId} AND ${billingItems.matchStatus} = 'service-matched'`
    )
    .where(
      and(
        eq(services.customerExternalId, customerExternalId),
        sql`${services.status} NOT IN ('terminated', 'unmatched', 'billing_platform_stub')`,
        sql`${billingItems.id} IS NULL`,
        // Exclude services that have been explicitly marked as intentionally-unbilled in the log
        sql`${services.externalId} NOT IN (
          SELECT serviceExternalId FROM service_billing_match_log
          WHERE customerExternalId = ${customerExternalId}
            AND resolution = 'intentionally-unbilled'
        )`,
        // Outage suppression: exclude services that currently have an active Carbon outage
        // (reduces false positives during fault periods — service is unbilled because it is down)
        sql`${services.externalId} NOT IN (
          SELECT DISTINCT serviceExternalId FROM service_outages
          WHERE status = 'active'
        )`
      )
    )
    .orderBy(desc(services.monthlyCost));

  return rows.map(s => ({
    ...s,
    monthlyCost: parseFloat(String(s.monthlyCost)),
    monthlyRevenue: parseFloat(String(s.monthlyRevenue)),
  }));
}

/**
 * Returns services without billing that are currently suppressed due to an active outage.
 * Used to show a "suppressed" badge on the billing alerts page.
 */
export async function getSuppressedUnbilledServices(customerExternalId: string) {
  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .select({
      externalId: services.externalId,
      serviceType: services.serviceType,
      planName: services.planName,
      locationAddress: services.locationAddress,
      supplierName: services.supplierName,
      provider: services.provider,
      monthlyCost: services.monthlyCost,
      status: services.status,
      // Outage info
      outageTitle: serviceOutages.title,
      outageType: serviceOutages.outageType,
      outageFirstSeen: serviceOutages.firstSeenAt,
    })
    .from(services)
    .innerJoin(
      serviceOutages,
      and(
        eq(serviceOutages.serviceExternalId, services.externalId),
        eq(serviceOutages.status, 'active')
      )
    )
    .leftJoin(
      billingItems,
      sql`${billingItems.serviceExternalId} = ${services.externalId} AND ${billingItems.matchStatus} = 'service-matched'`
    )
    .where(
      and(
        eq(services.customerExternalId, customerExternalId),
        sql`${services.status} NOT IN ('terminated', 'unmatched', 'billing_platform_stub')`,
        sql`${billingItems.id} IS NULL`,
        sql`${services.externalId} NOT IN (
          SELECT serviceExternalId FROM service_billing_match_log
          WHERE customerExternalId = ${customerExternalId}
            AND resolution = 'intentionally-unbilled'
        )`
      )
    )
    .orderBy(desc(services.monthlyCost));

  return rows.map(s => ({
    ...s,
    monthlyCost: parseFloat(String(s.monthlyCost)),
  }));
}

/**
 * Returns the count of services without billing for a customer.
 * Used for the warning badge on the customer list.
 */
export async function getUnmatchedBillingCount(customerExternalId: string): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  // A service is considered "matched" if:
  //   (a) it has an entry in service_billing_assignments (new many-to-one system), OR
  //   (b) it is marked as intentionally unbilled in unbillable_services, OR
  //   (c) it is marked as intentionally-unbilled in service_billing_match_log (legacy)
  // Services with status 'terminated' or 'unmatched' are excluded.
  const [row] = await db.execute<{ cnt: number }>(sql`
    SELECT COUNT(*) AS cnt
    FROM services s
    WHERE s.customerExternalId = ${customerExternalId}
      AND s.status NOT IN ('terminated', 'unmatched', 'flagged_for_termination', 'billing_platform_stub')
      AND s.externalId NOT IN (
        SELECT sba.serviceExternalId
        FROM service_billing_assignments sba
        WHERE sba.customerExternalId = ${customerExternalId}
      )
      AND s.externalId NOT IN (
        SELECT us.serviceExternalId
        FROM unbillable_services us
        WHERE us.customerExternalId = ${customerExternalId}
      )
      AND s.externalId NOT IN (
        SELECT sml.serviceExternalId
        FROM service_billing_match_log sml
        WHERE sml.customerExternalId = ${customerExternalId}
          AND sml.resolution = 'intentionally-unbilled'
      )
  `);

  const rows = row as unknown as Array<{ cnt: number }>;
  return Number(rows[0]?.cnt ?? 0);
}

/**
 * Returns available (unmatched or customer-matched) billing items for a customer
 * that can be linked to a service. Used in the resolution picker.
 */
export async function getAvailableBillingItemsForCustomer(customerExternalId: string) {
  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .select({
      id: billingItems.id,
      externalId: billingItems.externalId,
      description: billingItems.description,
      lineAmount: billingItems.lineAmount,
      invoiceDate: billingItems.invoiceDate,
      invoiceNumber: billingItems.invoiceNumber,
      matchStatus: billingItems.matchStatus,
      billingPlatform: billingItems.billingPlatform,
      contactName: billingItems.contactName,
    })
    .from(billingItems)
    .where(
      // Return ALL billing items for this customer — multiple services can link to one billing item,
      // so we never filter by matchStatus here. The UI uses drag-and-drop as the primary workflow.
      eq(billingItems.customerExternalId, customerExternalId)
    )
    .orderBy(desc(billingItems.lineAmount));

  return rows.map(b => ({
    ...b,
    lineAmount: parseFloat(String(b.lineAmount)),
  }));
}

/**
 * Links a service to a billing item, updates match statuses, and logs the resolution
 * so future imports can auto-apply the same match.
 */
export async function resolveServiceBillingMatch(
  serviceExternalId: string,
  billingItemExternalId: string | null,
  resolution: 'linked' | 'intentionally-unbilled',
  resolvedBy: string,
  notes?: string
) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  // Load the service
  const [svc] = await db
    .select({
      externalId: services.externalId,
      serviceType: services.serviceType,
      planName: services.planName,
      customerExternalId: services.customerExternalId,
      customerName: services.customerName,
    })
    .from(services)
    .where(eq(services.externalId, serviceExternalId))
    .limit(1);

  if (!svc) throw new Error(`Service ${serviceExternalId} not found`);

  let billingItemDbId: number | null = null;
  let billingPlatform = '';

  if (resolution === 'linked' && billingItemExternalId) {
    // Load the billing item
    const [bi] = await db
      .select({ id: billingItems.id, billingPlatform: billingItems.billingPlatform })
      .from(billingItems)
      .where(eq(billingItems.externalId, billingItemExternalId))
      .limit(1);

    if (!bi) throw new Error(`Billing item ${billingItemExternalId} not found`);
    billingItemDbId = bi.id;
    billingPlatform = bi.billingPlatform || '';

    // Update billing item: mark as service-matched
    await db.update(billingItems).set({
      serviceExternalId,
      matchStatus: 'service-matched',
      matchConfidence: 'manual',
      updatedAt: new Date(),
    }).where(eq(billingItems.id, billingItemDbId));

    // Update service: set billingItemId and recalculate revenue from billing item
    const [biAmount] = await db
      .select({ lineAmount: billingItems.lineAmount })
      .from(billingItems)
      .where(eq(billingItems.id, billingItemDbId));

    const revenue = biAmount ? parseFloat(String(biAmount.lineAmount)) : 0;
    const cost = parseFloat(String(svc.planName)); // will be recalculated below
    await db.update(services).set({
      billingItemId: billingItemExternalId,
      monthlyRevenue: String(revenue.toFixed(2)),
      updatedAt: new Date(),
    }).where(eq(services.externalId, serviceExternalId));
  }

  // Log the resolution
  const matchKey = `${serviceExternalId}|${svc.customerExternalId}`;
  await db.insert(serviceBillingMatchLog).values({
    serviceExternalId,
    serviceType: svc.serviceType,
    planName: svc.planName || '',
    customerExternalId: svc.customerExternalId || '',
    customerName: svc.customerName || '',
    resolution,
    billingItemId: billingItemExternalId || '',
    billingPlatform,
    notes: notes || null,
    resolvedBy,
    resolvedAt: new Date(),
    matchKey,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // Recalculate unmatchedBillingCount for this customer
  await recalculateCustomerUnmatchedBilling(svc.customerExternalId || '');

  return { success: true, serviceExternalId, resolution };
}

/**
 * Recalculates unmatchedBillingCount for a single customer.
 */
export async function recalculateCustomerUnmatchedBilling(customerExternalId: string) {
  const db = await getDb();
  if (!db) return;

  const count = await getUnmatchedBillingCount(customerExternalId);
  await db.update(customers).set({
    unmatchedBillingCount: count,
    updatedAt: new Date(),
  }).where(eq(customers.externalId, customerExternalId));
}

/**
 * Bulk recalculates unmatchedBillingCount for ALL customers.
 * Run after any bulk billing import or match change.
 */
export async function recalculateAllUnmatchedBilling() {
  const db = await getDb();
  if (!db) return { updated: 0 };

  await db.execute(sql`
    UPDATE customers c
    SET unmatchedBillingCount = (
      SELECT COUNT(*)
      FROM services s
      WHERE s.customerExternalId = c.externalId
        AND s.status NOT IN ('terminated', 'unmatched', 'flagged_for_termination', 'billing_platform_stub')
        AND s.externalId NOT IN (
          SELECT sba.serviceExternalId
          FROM service_billing_assignments sba
          WHERE sba.customerExternalId = c.externalId
        )
        AND s.externalId NOT IN (
          SELECT us.serviceExternalId
          FROM unbillable_services us
          WHERE us.customerExternalId = c.externalId
        )
        AND s.externalId NOT IN (
          SELECT sml.serviceExternalId
          FROM service_billing_match_log sml
          WHERE sml.customerExternalId = c.externalId
            AND sml.resolution = 'intentionally-unbilled'
        )
    ),
    updatedAt = NOW()
  `);

  const [result] = await db.select({ count: sql<number>`count(*)` }).from(customers);
  return { updated: Number(result.count) };
}

/**
 * Returns the resolution log for a service (history of billing match decisions).
 */
export async function getServiceBillingMatchLog(serviceExternalId: string) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(serviceBillingMatchLog)
    .where(eq(serviceBillingMatchLog.serviceExternalId, serviceExternalId))
    .orderBy(desc(serviceBillingMatchLog.resolvedAt));
}


// ─── Service ↔ Workbook Matching Helpers ─────────────────────────────────────

/**
 * Returns services for a customer that have no "matched" workbook line item
 * in the latest SasBoss upload. These are candidates for the matching UI.
 */
export async function getUnmatchedServicesForMatching(customerExternalId: string) {
  const db = await getDb();
  if (!db) return [];
  const [latestUpload] = await db
    .select({ id: supplierWorkbookUploads.id })
    .from(supplierWorkbookUploads)
    .where(eq(supplierWorkbookUploads.supplier, 'SasBoss'))
    .orderBy(desc(supplierWorkbookUploads.id))
    .limit(1);
  if (!latestUpload) return [];
  const latestUploadId = latestUpload.id;

  const rows = await db.execute(sql`
    SELECT s.externalId, s.serviceType, s.serviceTypeDetail, s.planName,
           s.phoneNumber, s.connectionId, s.locationAddress, s.provider,
           s.monthlyCost, s.monthlyRevenue, s.status
    FROM services s
    WHERE s.customerExternalId = ${customerExternalId}
      AND s.status NOT IN ('terminated', 'flagged')
      AND s.externalId NOT IN (
        SELECT matchedServiceExternalId
        FROM supplier_workbook_line_items
        WHERE uploadId = ${latestUploadId}
          AND matchStatus = 'matched'
          AND matchedServiceExternalId != ''
      )
    ORDER BY s.monthlyCost DESC, s.planName
  `);
   return (rows[0] as unknown as any[]).map((s: any) => ({
    externalId: s.externalId,
    serviceType: s.serviceType,
    serviceTypeDetail: s.serviceTypeDetail,
    planName: s.planName,
    phoneNumber: s.phoneNumber,
    connectionId: s.connectionId,
    locationAddress: s.locationAddress,
    provider: s.provider,
    monthlyCost: parseFloat(String(s.monthlyCost ?? 0)),
    monthlyRevenue: parseFloat(String(s.monthlyRevenue ?? 0)),
    status: s.status,
  }));
}
/**
 * Returns all workbook line items for a customer from the latest SasBoss upload.
 */
export async function getWorkbookItemsForCustomer(customerExternalId: string) {
  const db = await getDb();
  if (!db) return [];
  const [latestUpload] = await db
    .select({ id: supplierWorkbookUploads.id })
    .from(supplierWorkbookUploads)
    .where(eq(supplierWorkbookUploads.supplier, 'SasBoss'))
    .orderBy(desc(supplierWorkbookUploads.id))
    .limit(1);
  if (!latestUpload) return [];
  const latestUploadId = latestUpload.id;

  const rows = await db.execute(sql`
    SELECT id, productName, productType, amountExGst, amountIncGst,
           matchStatus, matchedServiceExternalId, serviceRefId
    FROM supplier_workbook_line_items
    WHERE uploadId = ${latestUploadId}
      AND matchedCustomerExternalId = ${customerExternalId}
    ORDER BY amountExGst DESC, productName
  `);
  return (rows[0] as unknown as any[]).map((item: any) => ({
    id: Number(item.id),
    productName: item.productName,
    productType: item.productType,
    amountExGst: parseFloat(String(item.amountExGst ?? 0)),
    amountIncGst: parseFloat(String(item.amountIncGst ?? 0)),
    matchStatus: item.matchStatus,
    matchedServiceExternalId: item.matchedServiceExternalId || '',
    serviceRefId: item.serviceRefId || '',
  }));
}

/**
 * Fuzzy match: score each unmatched service against available workbook items
 * using Jaccard token-overlap similarity. Returns proposals sorted by score descending.
 */
export async function fuzzyMatchServicesToWorkbook(
  customerExternalId: string,
  minScore = 40
): Promise<Array<{
  serviceExternalId: string;
  servicePlanName: string;
  workbookItemId: number;
  workbookProductName: string;
  score: number;
  amountExGst: number;
}>> {
  const unmatchedServices = await getUnmatchedServicesForMatching(customerExternalId);
  const workbookItems = await getWorkbookItemsForCustomer(customerExternalId);
  const availableItems = workbookItems.filter(
    (w) => !w.matchedServiceExternalId || w.matchedServiceExternalId === ''
  );

  function tokenise(s: string): Set<string> {
    return new Set(
      s.toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((t) => t.length > 1)
    );
  }

  function jaccardScore(a: string, b: string): number {
    const ta = tokenise(a);
    const tb = tokenise(b);
    if (ta.size === 0 || tb.size === 0) return 0;
    const taArr = Array.from(ta);
    const tbArr = Array.from(tb);
    const intersection = taArr.filter((x) => tb.has(x));
    const unionSize = new Set([...taArr, ...tbArr]).size;
    return Math.round((intersection.length / unionSize) * 100);
  }

  const proposals: Array<{
    serviceExternalId: string;
    servicePlanName: string;
    workbookItemId: number;
    workbookProductName: string;
    score: number;
    amountExGst: number;
  }> = [];

  for (const svc of unmatchedServices) {
    let bestScore = 0;
    let bestItem: (typeof availableItems)[0] | null = null;
    for (const item of availableItems) {
      const score = jaccardScore(svc.planName, item.productName);
      if (score > bestScore) {
        bestScore = score;
        bestItem = item;
      }
    }
    if (bestItem && bestScore >= minScore) {
      proposals.push({
        serviceExternalId: svc.externalId,
        servicePlanName: svc.planName,
        workbookItemId: bestItem.id,
        workbookProductName: bestItem.productName,
        score: bestScore,
        amountExGst: bestItem.amountExGst,
      });
    }
  }

  return proposals.sort((a, b) => b.score - a.score);
}

/**
 * Links a service to a workbook line item (drag-and-drop or auto-match confirm).
 * Updates the workbook item's matchStatus to 'matched' and sets the service's
 * monthlyCost from the workbook item's amountExGst.
 */
export async function linkServiceToWorkbookItem(
  serviceExternalId: string,
  workbookItemId: number,
  linkedBy: string
): Promise<{ success: boolean; newCost: number }> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  const [item] = await db
    .select()
    .from(supplierWorkbookLineItems)
    .where(eq(supplierWorkbookLineItems.id, workbookItemId))
    .limit(1);
  if (!item) throw new Error(`Workbook item ${workbookItemId} not found`);

  const newCost = parseFloat(String(item.amountExGst ?? 0));

  await db
    .update(supplierWorkbookLineItems)
    .set({
      matchStatus: 'matched',
      matchedServiceExternalId: serviceExternalId,
    })
    .where(eq(supplierWorkbookLineItems.id, workbookItemId));

  await db
    .update(services)
    .set({
      monthlyCost: String(newCost),
      costSource: 'supplier_invoice',
      updatedAt: new Date(),
    })
    .where(eq(services.externalId, serviceExternalId));

   // Log the resolution for future auto-matching
  // Fetch the service to get serviceType and customerName for the log
  const [svc] = await db.select().from(services).where(eq(services.externalId, serviceExternalId)).limit(1);
  const [cust] = svc?.customerExternalId
    ? await db.select({ name: customers.name }).from(customers).where(eq(customers.externalId, svc.customerExternalId)).limit(1)
    : [null];
  await db.insert(serviceBillingMatchLog).values({
    serviceExternalId,
    serviceType: svc?.serviceType || 'Unknown',
    planName: svc?.planName || '',
    customerExternalId: item.matchedCustomerExternalId || '',
    customerName: cust?.name || '',
    resolution: 'linked',
    resolvedBy: linkedBy,
    notes: `Linked to workbook item ${workbookItemId} (${item.productName}) via matching UI`,
    resolvedAt: new Date(),
  });
  return { success: true, newCost };
}

// ==================== Service Billing Assignments (many-to-one) ====================

/**
 * Get all billing items for a customer with their assigned services and margin data.
 * Revenue = billingItem.lineAmount
 * Cost = SUM of assigned services' monthlyCost
 * Margin = Revenue - Cost
 */
export async function getBillingItemsWithAssignments(customerExternalId: string) {
  const db = await getDb();
  if (!db) return [];

  // Get all billing items for this customer
  const items = await db
    .select()
    .from(billingItems)
    .where(eq(billingItems.customerExternalId, customerExternalId))
    .orderBy(asc(billingItems.invoiceDate));

  // Get all existing assignments for this customer
  const assignments = await db
    .select({
      id: serviceBillingAssignments.id,
      billingItemExternalId: serviceBillingAssignments.billingItemExternalId,
      serviceExternalId: serviceBillingAssignments.serviceExternalId,
      assignedBy: serviceBillingAssignments.assignedBy,
      assignmentMethod: serviceBillingAssignments.assignmentMethod,
      notes: serviceBillingAssignments.notes,
    })
    .from(serviceBillingAssignments)
    .where(eq(serviceBillingAssignments.customerExternalId, customerExternalId));

  // Get all services for this customer
  const svcs = await db
    .select({
      externalId: services.externalId,
      serviceType: services.serviceType,
      serviceTypeDetail: services.serviceTypeDetail,
      planName: services.planName,
      monthlyCost: services.monthlyCost,
      provider: services.provider,
      locationAddress: services.locationAddress,
      phoneNumber: services.phoneNumber,
      avcId: services.avcId,
      serviceCategory: services.serviceCategory,
      status: services.status,
    })
    .from(services)
    .where(eq(services.customerExternalId, customerExternalId));

  const svcMap = new Map(svcs.map(s => [s.externalId, s]));

  // Fetch retail bundle fixed costs for this customer (Hardware, SIP, Support etc.)
  // These are not supplier services but are real costs that must be included in margin.
  let bundleFixedCostTotal = 0;
  let bundleFixedCostInputs: Array<{ slotType: string; monthlyCostExGst: number; costSource: string }> = [];
  try {
    // Primary lookup: by customerExternalId
    const [bundleRows] = await db.execute(sql.raw(
      `SELECT rb.id as bundleId FROM retail_bundles rb WHERE rb.customerExternalId = '${customerExternalId}' LIMIT 1`
    )) as any;
    let bundleRow = Array.isArray(bundleRows) ? bundleRows[0] : null;

    // Fallback: if no bundle found by ID, look up by customer name similarity.
    // This handles cases where the bundle was matched to a duplicate customer record
    // (e.g. trust entity name vs trading name for the same site).
    if (!bundleRow) {
      const custRows = await db.execute(sql.raw(
        `SELECT name FROM customers WHERE externalId = '${customerExternalId}' LIMIT 1`
      )) as any;
      const custName: string = (Array.isArray((custRows as any)[0]) ? (custRows as any)[0][0] : null)?.name || '';
      if (custName) {
        // Find bundles not yet linked to a customer with billing items
        const [candidateRows] = await db.execute(sql.raw(
          `SELECT rb.id as bundleId, rb.subscriberName
           FROM retail_bundles rb
           LEFT JOIN billing_items bi ON bi.customerExternalId = rb.customerExternalId
           WHERE bi.externalId IS NULL OR rb.customerExternalId IS NULL
           LIMIT 200`
        )) as any;
        const candidates = Array.isArray(candidateRows) ? candidateRows : [];
        // Simple token-overlap scoring
        const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
        const tokenScore = (a: string, b: string) => {
          const wa = new Set(normalize(a).split(' ').filter((w: string) => w.length > 2));
          const wb = new Set(normalize(b).split(' ').filter((w: string) => w.length > 2));
          let overlap = 0;
          Array.from(wa).forEach((w: string) => { if (wb.has(w)) overlap++; });
          return overlap / Math.max(wa.size, wb.size, 1);
        };
        let bestScore = 0;
        let bestCandidate: any = null;
        for (const c of candidates) {
          const s = tokenScore(custName, c.subscriberName);
          if (s > bestScore) { bestScore = s; bestCandidate = c; }
        }
        if (bestCandidate && bestScore >= 0.6) {
          bundleRow = bestCandidate;
        }
      }
    }

    if (bundleRow) {
      const bundleId = parseInt(String(bundleRow.bundleId), 10);
      const [inputRows] = await db.execute(sql.raw(
        `SELECT slotType, monthlyCostExGst, costSource FROM retail_bundle_cost_inputs WHERE bundleId = ${bundleId}`
      )) as any;
      const inputs = Array.isArray(inputRows) ? inputRows : [];
      bundleFixedCostInputs = inputs.map((r: any) => ({
        slotType: r.slotType,
        monthlyCostExGst: parseFloat(String(r.monthlyCostExGst || 0)),
        costSource: r.costSource,
      }));
      bundleFixedCostTotal = bundleFixedCostInputs.reduce((sum, r) => sum + r.monthlyCostExGst, 0);
    }
  } catch {
    // Non-retail customers — no bundle costs, silently ignore
  }

  // Build assignment map: billingItemExternalId -> assigned service details
  const assignmentMap = new Map<string, Array<{
    assignmentId: number;
    serviceExternalId: string;
    serviceType: string;
    serviceTypeDetail: string;
    planName: string;
    monthlyCost: number;
    provider: string;
    locationAddress: string;
    phoneNumber: string;
    avcId: string;
    serviceCategory: string;
    assignedBy: string;
    assignmentMethod: string;
  }>>();

  for (const a of assignments) {
    const svc = svcMap.get(a.serviceExternalId);
    if (!svc) continue;
    if (!assignmentMap.has(a.billingItemExternalId)) {
      assignmentMap.set(a.billingItemExternalId, []);
    }
    assignmentMap.get(a.billingItemExternalId)!.push({
      assignmentId: a.id,
      serviceExternalId: a.serviceExternalId,
      serviceType: svc.serviceType,
      serviceTypeDetail: svc.serviceTypeDetail || '',
      planName: svc.planName || '',
      monthlyCost: parseFloat(String(svc.monthlyCost)),
      provider: svc.provider || 'Unknown',
      locationAddress: svc.locationAddress || '',
      phoneNumber: svc.phoneNumber || '',
      avcId: svc.avcId || '',
      serviceCategory: svc.serviceCategory || 'other',
      assignedBy: a.assignedBy,
      assignmentMethod: a.assignmentMethod,
    });
  }

  return items.map(item => {
    const revenue = parseFloat(String(item.lineAmount));
    const assignedServices = assignmentMap.get(item.externalId) || [];
    const supplierServicesCost = assignedServices.reduce((sum, s) => sum + s.monthlyCost, 0);
    // For retail bundle customers, add fixed costs (Hardware, SIP, Support) to the total cost
    const totalCost = supplierServicesCost + bundleFixedCostTotal;
    const margin = revenue - totalCost;
    const marginPercent = revenue > 0 ? (margin / revenue) * 100 : null;

    return {
      externalId: item.externalId,
      invoiceDate: item.invoiceDate,
      invoiceNumber: item.invoiceNumber,
      description: String(item.description),
      lineAmount: revenue,
      quantity: parseFloat(String(item.quantity)),
      unitAmount: parseFloat(String(item.unitAmount)),
      category: item.category,
      matchStatus: item.matchStatus,
      billingPlatform: item.billingPlatform || '',
      matchConfidence: item.matchConfidence || '',
      // Legacy 1:1 service link (for backwards compat)
      legacyServiceExternalId: item.serviceExternalId,
      // New many-to-one assignments
      assignedServices,
      totalCost,
      supplierServicesCost,
      bundleFixedCostTotal,
      bundleFixedCostInputs,
      margin,
      marginPercent,
      // Retail bundle classification
      retailBundleComponent: item.retailBundleComponent || '',
      // Parsed attributes from description
      parsedSpeedTier: item.parsedSpeedTier || '',
      parsedContractMonths: item.parsedContractMonths ?? null,
      parsedHardwareStatus: item.parsedHardwareStatus || '',
      parsedHas4gBackup: !!item.parsedHas4gBackup,
      parsedDataAllowance: item.parsedDataAllowance || '',
      parsedSipChannels: item.parsedSipChannels ?? null,
      parsedAvcId: item.parsedAvcId || '',
      parsedServiceStartDate: item.parsedServiceStartDate || '',
      parsedServiceEndDate: item.parsedServiceEndDate || '',
    };
  });
}

/**
 * Get all unmatched services for a customer:
 * - Not in service_billing_assignments
 * - Not in unbillable_services
 * - Not terminated
 */

/**
 * Derive a detailed service category from serviceType and planName.
 * Used for grouping in the Billing Match UI and for auto-match scoring.
 *
 * Categories:
 *   voice-licensing  — UCaaS seats, user licenses, PBX plans
 *   voice-usage      — call charges, telephone usage (billed in arrears)
 *   voice-numbers    — DIDs, phone numbers, porting
 *   voice-features   — voicemail, call queues, hunt groups, IVR
 *   data-mobile      — SIM cards, mobile data plans
 *   data-nbn         — NBN, FTTN, FTTP, FTTC broadband
 *   data-enterprise  — Fast Fibre, EE, IPWAN, Ethernet
 *   data-usage       — excess data, usage charges (billed in arrears)
 *   hardware         — handsets, routers, accessories
 *   professional-services — setup, installation, consulting (non-recurring)
 *   internal         — SmileTel internal costs
 *   other            — everything else
 */
export function deriveServiceCategory(serviceType: string, planName: string, provider?: string): string {
  const t = `${serviceType} ${planName} ${provider || ''}`.toLowerCase();
  // Voice — licensing (seats, user plans, PBX)
  if (t.match(/ucxcel|ucaas|user.*licen|licen.*user|premium.*user|executive.*user|basic.*user|standard.*user|pbx|hosted.*voice|sip.*trunk|sip.*user|call.*centre.*queue|queue.*agent|ring.*group|hunt.*group|auto.*attendant|ivr|time.*of.*day|time.*routing/)) return 'voice-licensing';
  // Voice — numbers (DIDs, porting)
  if (t.match(/did|direct.*in.*dial|phone.*number|number.*port|porting|geographic.*number|1300|1800/)) return 'voice-numbers';
  // Voice — features (voicemail, call recording, etc)
  if (t.match(/voicemail|call.*record|call.*park|call.*forward|conferenc|fax.*to.*email|fax2email|music.*on.*hold|moh|busy.*lamp|blf/)) return 'voice-features';
  // Voice — usage (call charges, billed in arrears)
  if (t.match(/telephone.*usage|voice.*usage|call.*usage|local.*call|national.*call|mobile.*call|international.*call|call.*pack|me.*3.*included|included.*call|minute.*pack|usage.*charge|call.*charge/)) return 'voice-usage';
  // General voice catch-all (after specific voice sub-types)
  if (t.match(/\bvoice\b|\bphone\b|\bsip\b|\btelephone\b/)) return 'voice-licensing';
  // Data — mobile SIM
  if (t.match(/mobile|sim|4g|5g|lte|handset.*plan|smartphone.*plan|data.*mobile|mobile.*data/)) return 'data-mobile';
  // Data — NBN / broadband
  if (t.match(/nbn|fttn|fttp|fttc|ftth|hfc|broadband|adsl|vdsl|opticomm|skymesh|aussie.*broadband/)) return 'data-nbn';
  // Data — enterprise / fibre
  if (t.match(/fast.*fibre|enterprise.*ethernet|\bee\b|ipwan|ip.*wan|\bwan\b|dark.*fibre|dedicated.*internet|\bgia\b|leased.*line/)) return 'data-enterprise';
  // Data — usage (excess data, billed in arrears)
  if (t.match(/excess.*data|data.*usage|usage.*data|data.*charge|overage/)) return 'data-usage';
  // General internet/data catch-all
  if (t.match(/internet|\bdata\b|fibre|fiber|broadband/)) return 'data-nbn';
  // Hardware
  if (t.match(/handset|router|modem|\bswitch\b|access.*point|\bwifi\b|hardware|yealink|cisco|polycom|grandstream/)) return 'hardware';
  // Professional services
  if (t.match(/setup|install|config|migration|consult|professional.*service|project|onboard|training|labour|labor/)) return 'professional-services';
  // Internal
  if (t.match(/internal|smiltel|smiletel/)) return 'internal';
  return 'other';
}

export async function getUnassignedServicesForCustomer(customerExternalId: string) {
  const db = await getDb();
  if (!db) return [];

  // Get service IDs already assigned to a billing item
  const assigned = await db
    .select({ serviceExternalId: serviceBillingAssignments.serviceExternalId })
    .from(serviceBillingAssignments)
    .where(eq(serviceBillingAssignments.customerExternalId, customerExternalId));

  // Get service IDs marked as unbillable
  const unbillable = await db
    .select({ serviceExternalId: unbillableServices.serviceExternalId })
    .from(unbillableServices)
    .where(eq(unbillableServices.customerExternalId, customerExternalId));

  const excludedIds = new Set([
    ...assigned.map(a => a.serviceExternalId),
    ...unbillable.map(u => u.serviceExternalId),
  ]);

  const allServices = await db
    .select()
    .from(services)
    .where(
      and(
        eq(services.customerExternalId, customerExternalId),
        sql`${services.status} NOT IN ('terminated', 'flagged_for_termination')`
      )
    );

  // Fetch Vocus mobile service IDs for SIM cost editing
  const vocusSims = await db
    .select({
      internalServiceExternalId: vocusMobileServices.internalServiceExternalId,
      vocusServiceId: vocusMobileServices.vocusServiceId,
      planCost: vocusMobileServices.planCost,
    })
    .from(vocusMobileServices)
    .where(eq(vocusMobileServices.internalCustomerExternalId, customerExternalId));
  const vocusSimMap = new Map(vocusSims.map(v => [v.internalServiceExternalId, v]));

  return allServices
    .filter(s => !excludedIds.has(s.externalId))
    .map(s => ({
      externalId: s.externalId,
      serviceType: s.serviceType,
      serviceTypeDetail: s.serviceTypeDetail || '',
      planName: s.planName || '',
      monthlyCost: parseFloat(String(s.monthlyCost)),
      provider: s.provider || 'Unknown',
      locationAddress: s.locationAddress || '',
      phoneNumber: s.phoneNumber || '',
      status: s.status,
      // Derived service category for grouping in UI
      serviceCategory: deriveServiceCategory(s.serviceType, s.planName || '', s.provider || ''),
      // Extra context fields
      description: s.planName || '',  // use planName as description if no separate field
      avcId: s.avcId || '',
      contractTerm: s.contractEndDate ? `Contract ends ${s.contractEndDate}` : '',
      connectionId: s.connectionId || '',
      supplierAccount: s.supplierAccount || '',
      technology: (s as any).technology || '',
      speedTier: (s as any).speedTier || '',
      simSerialNumber: s.simSerialNumber || '',
      deviceName: s.deviceName || '',
      billingPlatform: s.billingPlatform || null,
      // Vocus SIM cost editing
      vocusServiceId: vocusSimMap.get(s.externalId)?.vocusServiceId || null,
      vocusPlanCost: vocusSimMap.get(s.externalId)?.planCost ? parseFloat(String(vocusSimMap.get(s.externalId)!.planCost)) : null,
    }));
}

/**
 * Assign a service to a billing item (many-to-one).
 * Idempotent: if the assignment already exists, it's a no-op.
 */
export async function assignServiceToBillingItem(
  billingItemExternalId: string,
  serviceExternalId: string,
  customerExternalId: string,
  assignedBy: string,
  assignmentMethod: 'manual' | 'auto' | 'drag-drop' = 'drag-drop',
  notes?: string,
  assignmentBucket: 'standard' | 'usage-holding' | 'professional-services' | 'hardware-sales' | 'internal-cost' = 'standard'
) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  // Check if already assigned
  const existing = await db
    .select({ id: serviceBillingAssignments.id })
    .from(serviceBillingAssignments)
    .where(
      and(
        eq(serviceBillingAssignments.billingItemExternalId, billingItemExternalId),
        eq(serviceBillingAssignments.serviceExternalId, serviceExternalId)
      )
    )
    .limit(1);

  if (existing.length > 0) return { success: true, alreadyAssigned: true };

  // Write the assignment record
  await db.insert(serviceBillingAssignments).values({
    billingItemExternalId,
    serviceExternalId,
    customerExternalId,
    assignedBy,
    assignmentMethod,
    assignmentBucket,
    notes: notes || null,
  });

  // ── Persist a reusable match rule to service_billing_match_log ──────────────
  // Fetch service details so the rule captures enough context for future
  // auto-matching (planName + customerExternalId uniquely identifies the
  // service type for this customer across billing periods).
  const svcRows = await db
    .select({ planName: services.planName, serviceType: services.serviceType })
    .from(services)
    .where(eq(services.externalId, serviceExternalId))
    .limit(1);

  const customerRows = await db
    .select({ name: customers.name })
    .from(customers)
    .where(eq(customers.externalId, customerExternalId))
    .limit(1);

  const planName = svcRows[0]?.planName ?? '';
  const serviceType = svcRows[0]?.serviceType ?? '';
  const customerName = customerRows[0]?.name ?? '';

  // matchKey = planName|customerExternalId — identifies this service type for
  // this customer so future monthly imports can auto-assign without review.
  const matchKey = `${planName}|${customerExternalId}`;

  // Upsert: update existing rule if present, otherwise insert a new one.
  const existingLog = await db
    .select({ id: serviceBillingMatchLog.id })
    .from(serviceBillingMatchLog)
    .where(
      and(
        eq(serviceBillingMatchLog.matchKey, matchKey),
        eq(serviceBillingMatchLog.resolution, 'linked')
      )
    )
    .limit(1);

  if (existingLog.length > 0) {
    await db
      .update(serviceBillingMatchLog)
      .set({
        billingItemId: billingItemExternalId,
        resolvedBy: assignedBy,
        notes: notes || null,
        updatedAt: new Date(),
      })
      .where(eq(serviceBillingMatchLog.id, existingLog[0].id));
  } else {
    await db.insert(serviceBillingMatchLog).values({
      serviceExternalId,
      serviceType,
      planName,
      customerExternalId,
      customerName,
      resolution: 'linked',
      billingItemId: billingItemExternalId,
      billingPlatform: 'Xero',
      notes: notes || null,
      resolvedBy: assignedBy,
      matchKey,
    });
  }

  return { success: true, alreadyAssigned: false };
}

/**
 * Remove a service assignment from a billing item.
 */
export async function removeServiceAssignment(
  billingItemExternalId: string,
  serviceExternalId: string
) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  await db
    .delete(serviceBillingAssignments)
    .where(
      and(
        eq(serviceBillingAssignments.billingItemExternalId, billingItemExternalId),
        eq(serviceBillingAssignments.serviceExternalId, serviceExternalId)
      )
    );

  return { success: true };
}

/**
 * Mark a service as unbillable (intentionally not assigned to any billing item).
 */
export async function markServiceUnbillable(
  serviceExternalId: string,
  customerExternalId: string,
  reason: string,
  markedBy: string,
  notes?: string
) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  await db
    .insert(unbillableServices)
    .values({
      serviceExternalId,
      customerExternalId,
      reason,
      markedBy,
      notes: notes || null,
    })
    .onDuplicateKeyUpdate({
      set: {
        reason,
        markedBy,
        notes: notes || null,
        updatedAt: new Date(),
      },
    });

  return { success: true };
}

/**
 * Remove a service from the unbillable list (re-enable for assignment).
 */
export async function unmarkServiceUnbillable(serviceExternalId: string) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  await db
    .delete(unbillableServices)
    .where(eq(unbillableServices.serviceExternalId, serviceExternalId));

  return { success: true };
}

/**
 * Get unbillable services for a customer.
 */
export async function getUnbillableServicesForCustomer(customerExternalId: string) {
  const db = await getDb();
  if (!db) return [];

  const unbillable = await db
    .select()
    .from(unbillableServices)
    .where(eq(unbillableServices.customerExternalId, customerExternalId));

  // Enrich with service details
  const svcIds = unbillable.map(u => u.serviceExternalId);
  if (svcIds.length === 0) return [];

  const svcs = await db
    .select()
    .from(services)
    .where(inArray(services.externalId, svcIds));

  const svcMap = new Map(svcs.map(s => [s.externalId, s]));

  return unbillable.map(u => {
    const svc = svcMap.get(u.serviceExternalId);
    return {
      id: u.id,
      serviceExternalId: u.serviceExternalId,
      reason: u.reason,
      notes: u.notes,
      markedBy: u.markedBy,
      createdAt: u.createdAt,
      serviceType: svc?.serviceType || 'Unknown',
      planName: svc?.planName || '',
      monthlyCost: parseFloat(String(svc?.monthlyCost || '0')),
      provider: svc?.provider || 'Unknown',
      locationAddress: svc?.locationAddress || '',
    };
  });
}

/**
 * Fuzzy auto-match: score unassigned services against billing items using token overlap.
 * Returns proposals sorted by score descending.
 */
export async function fuzzyMatchServicesAgainstBillingItems(customerExternalId: string) {
  const unassigned = await getUnassignedServicesForCustomer(customerExternalId);
  const billingItemsWithAssign = await getBillingItemsWithAssignments(customerExternalId);

  /**
   * Normalise a string into a set of lowercase tokens, stripping punctuation
   * and common stop-words that add noise to Jaccard scoring.
   */
  function tokenize(str: string): Set<string> {
    const STOP_WORDS = new Set(['the', 'and', 'for', 'with', 'from', 'this', 'that', 'per', 'inc', 'gst', 'month', 'monthly']);
    return new Set(
      str.toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(t => t.length > 2 && !STOP_WORDS.has(t))
    );
  }

  /**
   * Jaccard similarity between two token sets.
   */
  function jaccardScore(a: Set<string>, b: Set<string>): number {
    if (a.size === 0 || b.size === 0) return 0;
    const intersection = Array.from(a).filter(x => b.has(x)).length;
    const union = new Set([...Array.from(a), ...Array.from(b)]).size;
    return intersection / union;
  }

  /**
   * Map a service type string to a canonical category.
   * Services and billing items are matched first by category — dollar amounts
   * are NEVER used as a matching signal (they are the output, not the input).
   *
   * Categories: 'voice' | 'internet' | 'mobile' | 'other'
   */
  function serviceCategory(serviceType: string, planName: string): string {
    const t = (serviceType + ' ' + planName).toLowerCase();
    if (t.match(/voice|phone|sip|did|pbx|fax|voicemail|telephone|premium.*user|user.*license|license/)) return 'voice';
    if (t.match(/internet|nbn|broadband|data|fibre|fiber|adsl|vdsl|opticomm|ethernet|wan|ipwan/)) return 'internet';
    if (t.match(/mobile|sim|4g|5g|lte|handset|smartphone/)) return 'mobile';
    return 'other';
  }

  /**
   * Map a billing item description to a canonical category.
   */
  function billingCategory(description: string): string {
    const d = description.toLowerCase();
    if (d.match(/voice|phone|sip|did|pbx|fax|voicemail|telephone|call|user.*license|license.*user|premium.*user/)) return 'voice';
    // ChannelHaus-specific: "1# Rental", "4 Channels Business SIP", "Business SIP", "SIP Trunk"
    if (d.match(/rental|channels.*sip|business.*sip|sip.*channel|\d+.*channel|channel.*\d+|sip.*trunk|trunk/)) return 'voice';
    // Exetel CDR call-type billing items (usage charges billed against voice/internet services)
    if (/^(national|local|regional|standard|premium|international|13number|single number|fixed to ivr|mobile to ivr|international to fixed|call forward selective|collaboration|conference)$/.test(d.trim())) return 'voice';
    if (d.match(/internet|nbn|broadband|data|fibre|fiber|adsl|vdsl|opticomm|ethernet|wan/)) return 'internet';
    if (d.match(/mobile|sim|4g|5g|lte|handset/)) return 'mobile';
    return 'other';
  }

  /**
   * Score a service against a billing item.
   *
   * Scoring breakdown (max 1.0):
   *   0.50 — category match (voice→voice, internet→internet, etc.)
   *   0.30 — Jaccard token overlap between planName/serviceType and billing description
   *   0.20 — provider/platform alignment bonus (SasBoss services → Voice billing items, ABB → Internet)
   *
   * A score of 0 means the categories are incompatible — never propose cross-category matches.
   */
  function scoreServiceAgainstItem(
    svc: typeof unassigned[0],
    item: typeof billingItemsWithAssign[0]
  ): number {
    const svcCat = serviceCategory(svc.serviceType, svc.planName);
    const itemCat = billingCategory(item.description);

    // Hard block: never match across incompatible categories
    if (svcCat !== itemCat && !(svcCat === 'other' || itemCat === 'other')) return 0;

    let score = 0;

    // 1. Category match (50% of score)
    if (svcCat === itemCat) {
      score += 0.50;
    } else {
      // Partial credit if one side is 'other'
      score += 0.15;
    }

    // 2. Token overlap between service plan name and billing description (30%)
    const svcTokens = tokenize(`${svc.planName} ${svc.serviceType} ${svc.serviceTypeDetail}`);
    const itemTokens = tokenize(item.description);
    const jaccard = jaccardScore(svcTokens, itemTokens);
    score += jaccard * 0.30;

    // 2b. SIP direction alignment bonus (0.15) — inbound/outbound matching
    // When a service plan name contains 'in' or 'inbound' and the billing item
    // description contains 'inbound', or vice versa for 'out'/'outbound', award
    // a strong directional bonus. This prevents outbound SIP services from being
    // matched to inbound SIP billing items (and vice versa).
    const svcNameLower = (svc.planName || '').toLowerCase();
    const itemDescLower = item.description.toLowerCase();
    const svcIsInbound = /inbound|\bin\b|mcin$|scin$|in$/.test(svcNameLower);
    const svcIsOutbound = /outbound|\bout\b|mcout$|scout$|out$/.test(svcNameLower);
    const itemIsInbound = /inbound/.test(itemDescLower);
    const itemIsOutbound = /outbound/.test(itemDescLower);
    if (svcIsInbound && itemIsInbound) score += 0.15;  // direction match
    else if (svcIsOutbound && itemIsOutbound) score += 0.15;  // direction match
    else if (svcIsInbound && itemIsOutbound) score -= 0.20;  // direction mismatch penalty
    else if (svcIsOutbound && itemIsInbound) score -= 0.20;  // direction mismatch penalty

    // 3. Provider/platform alignment bonus (15%)
    // SasBoss services are billed via SasBoss → Xero as Voice/Data line items
    // ABB services are billed as Internet/Data line items
    // Telstra services are billed as Mobile/Voice line items
    // ChannelHaus services are billed as Voice line items (SIP Trunk, Rental)
    const provider = (svc.provider || '').toLowerCase();
    const descLower = item.description.toLowerCase();
    if (provider === 'sasboss' && itemCat === 'voice') score += 0.15;
    else if (provider === 'sasboss' && itemCat === 'internet') score += 0.08;
    else if ((provider === 'abb' || provider === 'aussie broadband') && itemCat === 'internet') score += 0.15;
    else if (provider === 'telstra' && itemCat === 'mobile') score += 0.15;
    else if (provider === 'telstra' && itemCat === 'voice') score += 0.12;
    else if (provider === 'exetel' && itemCat === 'internet') score += 0.12;
    else if (provider === 'exetel' && itemCat === 'voice') score += 0.12;
    else if (provider === 'channelhaus' && itemCat === 'voice') score += 0.15;
    else if (provider === 'channelhaus' && itemCat === 'internet') score += 0.08;
    else if (provider === 'vocus' && itemCat === 'voice') score += 0.12;
    else if (provider === 'aapt' && itemCat === 'voice') score += 0.12;

    // 4. Structured attribute matching (up to 0.35 bonus)
    // These signals come from parsed billing item attributes vs service fields
    // and provide high-confidence matching when structured data aligns.

    // 4a. Speed tier match (0.20 bonus) — strongest internet signal
    // Service has speedTier field (e.g. "50/20"), billing item has parsedSpeedTier
    if (svc.speedTier && (item as Record<string, unknown>).parsedSpeedTier) {
      const svcSpeed = String(svc.speedTier).trim().toLowerCase();
      const itemSpeed = String((item as Record<string, unknown>).parsedSpeedTier).trim().toLowerCase();
      if (svcSpeed === itemSpeed) score += 0.20;
      else if (svcSpeed.split('/')[0] === itemSpeed.split('/')[0]) score += 0.08; // download speed matches
    }

    // 4b. AVC ID match (0.25 bonus) — definitive NBN service identifier
    if (svc.avcId && (item as Record<string, unknown>).parsedAvcId) {
      const svcAvc = String(svc.avcId).trim().toLowerCase().replace(/^avc0*/i, '');
      const itemAvc = String((item as Record<string, unknown>).parsedAvcId).trim().toLowerCase().replace(/^avc0*/i, '');
      if (svcAvc === itemAvc && svcAvc.length > 3) score += 0.25;
    }

    // 4c. SIP channel count match (0.15 bonus) — voice services
    const svcAsAny = svc as Record<string, unknown>;
    if (svcAsAny.sipChannels && (item as Record<string, unknown>).parsedSipChannels) {
      const svcCh = Number(svcAsAny.sipChannels);
      const itemCh = Number((item as Record<string, unknown>).parsedSipChannels);
      if (!isNaN(svcCh) && !isNaN(itemCh) && svcCh === itemCh) score += 0.15;
    }

    // 4d. Contract term alignment (0.08 bonus) — mild signal
    if (svc.contractTerm && (item as Record<string, unknown>).parsedContractMonths !== null) {
      const termStr = String(svc.contractTerm).toLowerCase();
      const itemMonths = Number((item as Record<string, unknown>).parsedContractMonths);
      const svcMonths = termStr.includes('36') ? 36 : termStr.includes('24') ? 24 : termStr.includes('12') ? 12 : termStr.includes('month to month') || termStr.includes('m2m') ? 0 : null;
      if (svcMonths !== null && !isNaN(itemMonths) && svcMonths === itemMonths) score += 0.08;
    }

    return Math.min(score, 1.0);
  }

  const proposals: Array<{
    serviceExternalId: string;
    servicePlanName: string;
    serviceType: string;
    billingItemExternalId: string;
    billingDescription: string;
    score: number;
    scorePercent: number;
  }> = [];

  // Filter out credit notes and negative billing items — they should not receive service assignments
  const positiveItems = billingItemsWithAssign.filter(item => item.lineAmount > 0);

  for (const svc of unassigned) {
    let bestScore = 0;
    let bestItem: typeof billingItemsWithAssign[0] | null = null;
    for (const item of positiveItems) {
      const rawScore = scoreServiceAgainstItem(svc, item);
      if (rawScore < 0.50) continue; // skip below threshold early

      // Tie-breaker 1: prefer items with no existing service assignments.
      // Penalty of 0.03 per already-assigned service, capped at 0.12.
      // This prevents multiple services from piling onto the same billing item
      // when a better unassigned item of equal score exists.
      const assignedPenalty = Math.min((item.assignedServices?.length ?? 0) * 0.03, 0.12);

      // Tie-breaker 2: when scores are equal, prefer the highest-value billing item.
      // This resolves the common case where a customer has two items with the same
      // description (e.g. two "4 Channels Business SIP" items at $36 and $212) —
      // the primary/main item should win.
      // Encoded as a tiny fractional bonus (max 0.009) so it only acts as a
      // tie-breaker and never overrides a genuine score difference.
      const lineAmountBonus = Math.min((item.lineAmount ?? 0) / 100000, 0.009);

      const score = rawScore - assignedPenalty + lineAmountBonus;

      if (score > bestScore || (score === bestScore && (item.lineAmount ?? 0) > (bestItem?.lineAmount ?? 0))) {
        bestScore = score;
        bestItem = item;
      }
    }
    // Minimum threshold: must have at least a category match (score >= 0.50)
    // to avoid spurious cross-category proposals
    if (bestItem && bestScore >= 0.50) {
      proposals.push({
        serviceExternalId: svc.externalId,
        servicePlanName: svc.planName,
        serviceType: svc.serviceType,
        billingItemExternalId: bestItem.externalId,
        billingDescription: bestItem.description,
        score: bestScore,
        scorePercent: Math.round(bestScore * 100),
      });
    }
  }

  // Sort by score descending, then group by billing item so operators see
  // all services proposed for the same billing item together
  return proposals.sort((a, b) => b.score - a.score);
}

/**
 * Auto-apply saved match rules to newly imported services/billing items.
 *
 * After every monthly import (Xero, SasBoss, Exetel, Generic), call this
 * function to automatically create service_billing_assignments for any
 * service that matches a confirmed rule in service_billing_match_log.
 *
 * Match logic:
 *   matchKey = planName|customerExternalId
 *   If a service has the same planName AND belongs to the same customer as
 *   a previously confirmed 'linked' rule, it is auto-assigned to the same
 *   billing item without requiring manual review.
 *
 * Returns a summary of how many assignments were created.
 */
export async function autoApplyMatchRules(
  customerExternalId?: string // optional: scope to one customer
): Promise<{ applied: number; skipped: number }> {
  const db = await getDb();
  if (!db) return { applied: 0, skipped: 0 };

  // Fetch all 'linked' rules (or scoped to one customer)
  const ruleConditions = [eq(serviceBillingMatchLog.resolution, 'linked')];
  if (customerExternalId) {
    ruleConditions.push(eq(serviceBillingMatchLog.customerExternalId, customerExternalId));
  }
  const rules = await db
    .select()
    .from(serviceBillingMatchLog)
    .where(and(...ruleConditions));

  if (rules.length === 0) return { applied: 0, skipped: 0 };

  // Build a lookup: matchKey → billingItemId
  const ruleMap = new Map<string, string>();
  for (const rule of rules) {
    if (rule.matchKey && rule.billingItemId) {
      ruleMap.set(rule.matchKey, rule.billingItemId);
    }
  }

  // Fetch unassigned services (no entry in service_billing_assignments yet)
  const svcConditions = [];
  if (customerExternalId) {
    svcConditions.push(eq(services.customerExternalId, customerExternalId));
  }

  const allServices = await db
    .select({
      externalId: services.externalId,
      planName: services.planName,
      customerExternalId: services.customerExternalId,
    })
    .from(services)
    .where(svcConditions.length > 0 ? and(...svcConditions) : undefined);

  // Fetch already-assigned service IDs to avoid duplicates
  const assignedRows = await db
    .select({ serviceExternalId: serviceBillingAssignments.serviceExternalId })
    .from(serviceBillingAssignments);
  const assignedSet = new Set(assignedRows.map(r => r.serviceExternalId));

  // Also fetch unbillable services to skip them
  const unbillableRows = await db
    .select({ serviceExternalId: unbillableServices.serviceExternalId })
    .from(unbillableServices);
  const unbillableSet = new Set(unbillableRows.map(r => r.serviceExternalId));

  let applied = 0;
  let skipped = 0;

  for (const svc of allServices) {
    // Skip already-assigned or unbillable services
    if (assignedSet.has(svc.externalId) || unbillableSet.has(svc.externalId)) {
      skipped++;
      continue;
    }

    const matchKey = `${svc.planName}|${svc.customerExternalId}`;
    const billingItemId = ruleMap.get(matchKey);
    if (!billingItemId) {
      skipped++;
      continue;
    }

    // Verify the billing item still exists
    const biRows = await db
      .select({ externalId: billingItems.externalId })
      .from(billingItems)
      .where(eq(billingItems.externalId, billingItemId))
      .limit(1);
    if (biRows.length === 0) {
      skipped++;
      continue;
    }

    // Create the assignment
    await db.insert(serviceBillingAssignments).values({
      billingItemExternalId: billingItemId,
      serviceExternalId: svc.externalId,
      customerExternalId: svc.customerExternalId ?? '',
      assignedBy: 'auto-match-rules',
      assignmentMethod: 'auto',
      notes: 'Auto-applied from saved match rule',
    });

    applied++;
  }

  return { applied, skipped };
}

// ── Escalated Services ──────────────────────────────────────────────────────

/**
 * Escalate a service for manual review (no matching Xero billing item found).
 */
export async function escalateService(
  serviceExternalId: string,
  customerExternalId: string,
  escalatedBy: string,
  reason?: string,
  notes?: string
): Promise<{ success: boolean; message: string }> {
  const db = await getDb();
  if (!db) return { success: false, message: 'DB unavailable' };

  // Upsert: if already escalated, update notes/reason
  const existing = await db
    .select({ id: escalatedServices.id })
    .from(escalatedServices)
    .where(eq(escalatedServices.serviceExternalId, serviceExternalId))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(escalatedServices)
      .set({
        reason: reason || 'No matching Xero billing item found',
        notes: notes || null,
        escalatedBy,
        resolvedAt: null,
        resolvedBy: null,
        resolutionNotes: null,
      })
      .where(eq(escalatedServices.serviceExternalId, serviceExternalId));
    return { success: true, message: 'Escalation updated' };
  }

  await db.insert(escalatedServices).values({
    serviceExternalId,
    customerExternalId,
    reason: reason || 'No matching Xero billing item found',
    notes: notes || null,
    escalatedBy,
  });

  // Recalculate unmatchedBillingCount for the customer
  await recalculateCustomerUnmatchedBilling(customerExternalId);

  return { success: true, message: 'Service escalated for review' };
}

/**
 * Resolve an escalated service (mark as resolved).
 */
export async function resolveEscalatedService(
  serviceExternalId: string,
  resolvedBy: string,
  resolutionNotes?: string
): Promise<{ success: boolean; message: string }> {
  const db = await getDb();
  if (!db) return { success: false, message: 'DB unavailable' };

  await db
    .update(escalatedServices)
    .set({
      resolvedAt: new Date(),
      resolvedBy,
      resolutionNotes: resolutionNotes || null,
    })
    .where(eq(escalatedServices.serviceExternalId, serviceExternalId));

  // Get customer for recalculation
  const rows = await db
    .select({ customerExternalId: escalatedServices.customerExternalId })
    .from(escalatedServices)
    .where(eq(escalatedServices.serviceExternalId, serviceExternalId))
    .limit(1);

  if (rows.length > 0) {
    await recalculateCustomerUnmatchedBilling(rows[0].customerExternalId);
  }

  return { success: true, message: 'Escalation resolved' };
}

/**
 * Get all open (unresolved) escalated services, optionally filtered by customer.
 */
export async function getEscalatedServices(customerExternalId?: string): Promise<Array<{
  id: number;
  serviceExternalId: string;
  customerExternalId: string;
  reason: string;
  notes: string | null;
  escalatedBy: string;
  createdAt: Date;
  // Joined service fields
  serviceType: string;
  planName: string;
  monthlyCost: number;
  provider: string;
  locationAddress: string;
  phoneNumber: string;
  customerName: string;
}>> {
  const db = await getDb();
  if (!db) return [];

  const conditions = [isNull(escalatedServices.resolvedAt)];
  if (customerExternalId) {
    conditions.push(eq(escalatedServices.customerExternalId, customerExternalId));
  }

  const rows = await db
    .select({
      id: escalatedServices.id,
      serviceExternalId: escalatedServices.serviceExternalId,
      customerExternalId: escalatedServices.customerExternalId,
      reason: escalatedServices.reason,
      notes: escalatedServices.notes,
      escalatedBy: escalatedServices.escalatedBy,
      createdAt: escalatedServices.createdAt,
      serviceType: services.serviceType,
      planName: services.planName,
      monthlyCost: services.monthlyCost,
      provider: services.provider,
      locationAddress: services.locationAddress,
      phoneNumber: services.phoneNumber,
      customerName: services.customerName,
    })
    .from(escalatedServices)
    .leftJoin(services, eq(services.externalId, escalatedServices.serviceExternalId))
    .where(and(...conditions))
    .orderBy(desc(escalatedServices.createdAt));

  return rows.map(r => ({
    ...r,
    serviceType: r.serviceType || 'Unknown',
    planName: r.planName || '',
    monthlyCost: parseFloat(String(r.monthlyCost || '0')),
    provider: r.provider || 'Unknown',
    locationAddress: r.locationAddress || '',
    phoneNumber: r.phoneNumber || '',
    customerName: r.customerName || '',
  }));
}

/**
 * Get escalation count per customer (for dashboard badges).
 */
export async function getEscalationCountByCustomer(): Promise<Array<{
  customerExternalId: string;
  count: number;
}>> {
  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .select({
      customerExternalId: escalatedServices.customerExternalId,
      count: sql<number>`COUNT(*)`,
    })
    .from(escalatedServices)
    .where(isNull(escalatedServices.resolvedAt))
    .groupBy(escalatedServices.customerExternalId);

  return rows.map(r => ({
    customerExternalId: r.customerExternalId,
    count: Number(r.count),
  }));
}

/**
 * Get all customers that have open escalated services (for the Unmatched Queue page).
 */
export async function getCustomersWithEscalations(): Promise<Array<{
  customerExternalId: string;
  customerName: string;
  escalationCount: number;
  totalMonthlyCost: number;
  services: Array<{
    serviceExternalId: string;
    serviceType: string;
    planName: string;
    monthlyCost: number;
    provider: string;
    locationAddress: string;
    reason: string;
    escalatedBy: string;
    createdAt: Date;
  }>;
}>> {
  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .select({
      id: escalatedServices.id,
      serviceExternalId: escalatedServices.serviceExternalId,
      customerExternalId: escalatedServices.customerExternalId,
      reason: escalatedServices.reason,
      escalatedBy: escalatedServices.escalatedBy,
      createdAt: escalatedServices.createdAt,
      serviceType: services.serviceType,
      planName: services.planName,
      monthlyCost: services.monthlyCost,
      provider: services.provider,
      locationAddress: services.locationAddress,
      customerName: services.customerName,
    })
    .from(escalatedServices)
    .leftJoin(services, eq(services.externalId, escalatedServices.serviceExternalId))
    .where(isNull(escalatedServices.resolvedAt))
    .orderBy(escalatedServices.customerExternalId, desc(escalatedServices.createdAt));

  // Group by customer
  const customerMap = new Map<string, {
    customerExternalId: string;
    customerName: string;
    escalationCount: number;
    totalMonthlyCost: number;
    services: Array<{
      serviceExternalId: string;
      serviceType: string;
      planName: string;
      monthlyCost: number;
      provider: string;
      locationAddress: string;
      reason: string;
      escalatedBy: string;
      createdAt: Date;
    }>;
  }>();

  for (const r of rows) {
    const cost = parseFloat(String(r.monthlyCost || '0'));
    if (!customerMap.has(r.customerExternalId)) {
      customerMap.set(r.customerExternalId, {
        customerExternalId: r.customerExternalId,
        customerName: r.customerName || r.customerExternalId,
        escalationCount: 0,
        totalMonthlyCost: 0,
        services: [],
      });
    }
    const entry = customerMap.get(r.customerExternalId)!;
    entry.escalationCount++;
    entry.totalMonthlyCost += cost;
    entry.services.push({
      serviceExternalId: r.serviceExternalId,
      serviceType: r.serviceType || 'Unknown',
      planName: r.planName || '',
      monthlyCost: cost,
      provider: r.provider || 'Unknown',
      locationAddress: r.locationAddress || '',
      reason: r.reason,
      escalatedBy: r.escalatedBy,
      createdAt: r.createdAt,
    });
  }

  return Array.from(customerMap.values()).sort((a, b) => b.escalationCount - a.escalationCount);
}

// ─── Blitz Import Functions ───────────────────────────────────────────────────

/**
 * Get all services flagged for termination from the Blitz import.
 */
export async function getBlitzTerminationServices() {
  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .select()
    .from(services)
    .where(
      and(
        eq(services.provider, 'Telstra'),
        eq(services.serviceType, 'Mobile'),
        eq(services.blitzNoUse6m, 1),
        ne(services.status, 'terminated')
      )
    )
    .orderBy(services.monthlyCost);

  return rows.map(r => ({
    ...r,
    monthlyCost: Number(r.monthlyCost),
    blitzBillMar26: r.blitzBillMar26 !== null ? Number(r.blitzBillMar26) : null,
    blitzAvg3mBill: r.blitzAvg3mBill !== null ? Number(r.blitzAvg3mBill) : null,
    blitzMroEtc: r.blitzMroEtc !== null ? Number(r.blitzMroEtc) : null,
    blitzAvg3mDataMb: r.blitzAvg3mDataMb !== null ? Number(r.blitzAvg3mDataMb) : null,
    blitzAvg6mDataMb: r.blitzAvg6mDataMb !== null ? Number(r.blitzAvg6mDataMb) : null,
    blitzAvg3mVoiceMins: r.blitzAvg3mVoiceMins !== null ? Number(r.blitzAvg3mVoiceMins) : null,
    blitzAvg6mVoiceMins: r.blitzAvg6mVoiceMins !== null ? Number(r.blitzAvg6mVoiceMins) : null,
    isZeroCost: Number(r.monthlyCost) === 0,
    usageHistory: r.blitzUsageHistory ? (() => { try { return JSON.parse(r.blitzUsageHistory!); } catch { return null; } })() : null,
  }));
}

/**
 * Get Blitz import statistics.
 */
export async function getBlitzImportStats() {
  const db = await getDb();
  if (!db) return null;

  const [totalRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(services)
    .where(and(eq(services.provider, 'Telstra'), ne(services.blitzImportDate, '')));

  const [flaggedRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(services)
    .where(and(eq(services.provider, 'Telstra'), eq(services.blitzNoUse6m, 1), ne(services.status, 'terminated')));

  const [zeroCostRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(services)
    .where(and(eq(services.provider, 'Telstra'), eq(services.blitzNoUse6m, 1), eq(services.monthlyCost, '0.00'), ne(services.status, 'terminated')));

  const [mroRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(services)
    .where(and(eq(services.provider, 'Telstra'), eq(services.blitzNoUse6m, 1), ne(services.blitzMroContract, ''), ne(services.status, 'terminated')));

  const savingsRows = await db
    .select({ cost: services.monthlyCost })
    .from(services)
    .where(and(eq(services.provider, 'Telstra'), eq(services.blitzNoUse6m, 1), ne(services.status, 'terminated')));

  const totalSavings = savingsRows.reduce((sum, r) => sum + Number(r.cost), 0);
  const flaggedCount = Number(flaggedRow.count);
  const zeroCostCount = Number(zeroCostRow.count);

  const [lastImport] = await db
    .select({ blitzImportDate: services.blitzImportDate, blitzReportName: services.blitzReportName })
    .from(services)
    .where(and(eq(services.provider, 'Telstra'), ne(services.blitzImportDate, '')))
    .orderBy(desc(services.updatedAt))
    .limit(1);

  return {
    totalImported: Number(totalRow.count),
    lastImportDate: lastImport?.blitzImportDate || '',
    lastReportName: lastImport?.blitzReportName || '',
    flaggedForTermination: flaggedCount,
    zeroCostFlagged: zeroCostCount,
    paidFlagged: flaggedCount - zeroCostCount,
    mroContractFlagged: Number(mroRow.count),
    totalMonthlySavings: totalSavings,
  };
}

// ============================================================
// AAPT & Supplier Registry helpers
// ============================================================

/** Get all supplier registry entries, ordered by rank */
export async function getSupplierRegistry() {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select()
    .from(supplierRegistry)
    .where(eq(supplierRegistry.isActive, 1))
    .orderBy(asc(supplierRegistry.rank), asc(supplierRegistry.name));
}

/** Get all supplier invoice uploads, newest first */
export async function getSupplierInvoiceUploads(supplier?: string) {
  const db = await getDb();
  if (!db) return [];
  const conditions: any[] = supplier ? [eq(supplierInvoiceUploads.supplier, supplier)] : [];
  return await db
    .select()
    .from(supplierInvoiceUploads)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(supplierInvoiceUploads.importedAt));
}

/** Get all AAPT services */
export async function getAaptServices(status?: string) {
  const db = await getDb();
  if (!db) return [];
  const conditions: any[] = [eq(services.provider, 'AAPT')];
  if (status) conditions.push(eq(services.status, status));
  return await db
    .select()
    .from(services)
    .where(and(...conditions))
    .orderBy(asc(services.aaptProductCategory), asc(services.aaptServiceId));
}

/** Get unmatched AAPT services for the unmatched screen */
export async function getUnmatchedAaptServices() {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select()
    .from(services)
    .where(and(eq(services.provider, 'AAPT'), eq(services.status, 'unmatched')))
    .orderBy(asc(services.aaptProductType), desc(services.monthlyCost));
}

/** Get supplier service mapping rules */
export async function getSupplierServiceMappings(supplierName: string) {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select()
    .from(supplierServiceMap)
    .where(and(eq(supplierServiceMap.supplierName, supplierName), eq(supplierServiceMap.isActive, 1)))
    .orderBy(desc(supplierServiceMap.useCount), desc(supplierServiceMap.lastUsedAt));
}

/** Assign an unmatched AAPT service to a customer and save mapping rule */
export async function assignAaptServiceToCustomer(
  serviceExternalId: string,
  customerExternalId: string,
  customerName: string,
  confirmedBy: string,
  notes?: string
) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  await db
    .update(services)
    .set({
      customerExternalId,
      customerName,
      status: 'active',
      updatedAt: new Date(),
    })
    .where(eq(services.externalId, serviceExternalId));

  const [svc] = await db.select().from(services).where(eq(services.externalId, serviceExternalId)).limit(1);
  if (!svc) return { success: false };

  const mappingsToSave = [
    { type: 'service_id', value: svc.aaptServiceId || '' },
    { type: 'access_id', value: svc.aaptAccessId || '' },
    { type: 'address', value: svc.locationAddress || '' },
  ].filter(m => m.value && m.value.length > 2);

  for (const mapping of mappingsToSave) {
    await db
      .insert(supplierServiceMap)
      .values({
        supplierName: 'AAPT',
        matchKeyType: mapping.type,
        matchKeyValue: mapping.value,
        productType: svc.aaptProductType || '',
        description: svc.planName || '',
        customerExternalId,
        customerName,
        serviceExternalId,
        confirmedBy: 'manual',
        confidence: '1.00',
        useCount: 1,
        lastUsedAt: new Date(),
        notes: notes || '',
      })
      .onDuplicateKeyUpdate({
        set: {
          customerExternalId,
          customerName,
          serviceExternalId,
          confirmedBy: 'manual',
          useCount: sql`useCount + 1`,
          lastUsedAt: new Date(),
          updatedAt: new Date(),
        },
      });
  }

  await db
    .update(customers)
    .set({
      serviceCount: sql`(SELECT COUNT(*) FROM services WHERE customerExternalId = ${customerExternalId})`,
      monthlyCost: sql`(SELECT COALESCE(SUM(monthlyCost), 0) FROM services WHERE customerExternalId = ${customerExternalId})`,
      updatedAt: new Date(),
    })
    .where(eq(customers.externalId, customerExternalId));

  return { success: true };
}

/** Get AAPT import summary stats */
export async function getAaptImportStats() {
  const db = await getDb();
  if (!db) return null;
  const [totalRow] = await db.select({ c: count() }).from(services).where(eq(services.provider, 'AAPT'));
  const [matchedRow] = await db.select({ c: count() }).from(services).where(and(eq(services.provider, 'AAPT'), ne(services.status, 'unmatched')));
  const [unmatchedRow] = await db.select({ c: count() }).from(services).where(and(eq(services.provider, 'AAPT'), eq(services.status, 'unmatched')));
  const [costRow] = await db.select({ total: sql<number>`COALESCE(SUM(monthlyCost), 0)` }).from(services).where(eq(services.provider, 'AAPT'));
  const [mappingRow] = await db.select({ c: count() }).from(supplierServiceMap).where(eq(supplierServiceMap.supplierName, 'AAPT'));
  const [lastUpload] = await db.select().from(supplierInvoiceUploads).where(eq(supplierInvoiceUploads.supplier, 'AAPT')).orderBy(desc(supplierInvoiceUploads.importedAt)).limit(1);
  return {
    totalServices: Number(totalRow?.c || 0),
    matchedServices: Number(matchedRow?.c || 0),
    unmatchedServices: Number(unmatchedRow?.c || 0),
    totalMonthlyCost: Number(costRow?.total || 0),
    mappingRules: Number(mappingRow?.c || 0),
    lastInvoiceNumber: lastUpload?.invoiceNumber || '',
    lastBillingPeriod: lastUpload?.billingPeriod || '',
    lastImportDate: lastUpload?.importedAt ? lastUpload.importedAt.toISOString() : '',
  };
}

/** Get dashboard totals across all providers */
export async function getDashboardTotals() {
  const db = await getDb();
  if (!db) return null;
  const costByProvider = await db
    .select({
      provider: services.provider,
      totalCost: sql<number>`COALESCE(SUM(monthlyCost), 0)`,
      serviceCount: count(),
    })
    .from(services)
    .where(sql`${services.status} NOT IN ('terminated', 'archived', 'billing_platform_stub') AND (${services.billingPeriod} IS NULL OR ${services.billingPeriod} != 'archived')`)
    .groupBy(services.provider)
    .orderBy(desc(sql`COALESCE(SUM(monthlyCost), 0)`));
  const [revenueRow] = await db.select({ total: sql<number>`COALESCE(SUM(monthlyRevenue), 0)` }).from(customers).where(eq(customers.status, 'active'));
  const [costRow] = await db.select({ total: sql<number>`COALESCE(SUM(monthlyCost), 0)` }).from(services).where(sql`${services.status} NOT IN ('terminated', 'archived', 'billing_platform_stub') AND (${services.billingPeriod} IS NULL OR ${services.billingPeriod} != 'archived')`);
  const totalRevenue = Number(revenueRow?.total || 0);
  const totalCost = Number(costRow?.total || 0);
  const totalMargin = totalRevenue - totalCost;
  const marginPercent = totalRevenue > 0 ? (totalMargin / totalRevenue) * 100 : 0;
  return { totalRevenue, totalCost, totalMargin, marginPercent, costByProvider };
}

// ===== Supplier Product Cost Map =====
export async function getProductCostMappings(supplier?: string) {
  const db = await getDb();
  if (!db) return [];
  if (supplier) {
    return await db.select().from(supplierProductCostMap).where(eq(supplierProductCostMap.supplier, supplier)).orderBy(supplierProductCostMap.productCategory, supplierProductCostMap.productName);
  }
  return await db.select().from(supplierProductCostMap).orderBy(supplierProductCostMap.supplier, supplierProductCostMap.productCategory, supplierProductCostMap.productName);
}

export async function updateProductCostMapping(id: number, wholesaleCost: number, defaultRetailPrice: number, notes?: string) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  await db.update(supplierProductCostMap).set({
    wholesaleCost: wholesaleCost.toFixed(5) as any,
    defaultRetailPrice: defaultRetailPrice.toFixed(5) as any,
    notes: notes ?? null,
    updatedAt: new Date(),
  }).where(eq(supplierProductCostMap.id, id));
  return { success: true };
}

// ── Access4 Invoice Import ────────────────────────────────────────────────────

export interface Access4EnterpriseInput {
  name: string;
  endpoints: number;
  endpointDelta: number;
  mrc: number;
  variable: number;
  onceOff: number;
  total: number;
  isInternal: boolean;
}

export async function importAccess4Invoice(
  invoiceNumber: string,
  invoiceDate: string,
  totalIncGst: number,
  enterprises: Access4EnterpriseInput[],
  importedBy: string
): Promise<{
  invoiceNumber: string;
  totalEnterprises: number;
  matched: number;
  unmatched: number;
  internal: number;
  totalWholesaleExGst: number;
  timestamp: string;
}> {
  const db = await getDb();
  if (!db) throw new Error("[Database] Cannot import Access4 invoice: database not available");

  const customerRows = await db.execute(sql`SELECT external_id, name, business_name FROM customers`);
  const customers = (customerRows as any).rows || customerRows;

  function normName(s: string) {
    return s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function fuzzyMatch(entName: string): string | null {
    const norm = normName(entName);
    let best: { id: string; score: number } | null = null;
    for (const c of customers as any[]) {
      const cNorm = normName(c.name || '');
      const bNorm = normName(c.business_name || '');
      // Exact match
      if (cNorm === norm || bNorm === norm) return c.external_id;
      // Substring match
      const score = cNorm.includes(norm) || norm.includes(cNorm) ? 0.9
        : bNorm.includes(norm) || norm.includes(bNorm) ? 0.85 : 0;
      if (score > 0 && (!best || score > best.score)) {
        best = { id: c.external_id, score };
      }
    }
    return best && best.score >= 0.85 ? best.id : null;
  }

  let matched = 0;
  let unmatched = 0;
  let internal = 0;
  let totalWholesaleExGst = 0;

  // Record the invoice upload
  await db.execute(sql`
    INSERT INTO supplier_invoice_uploads
      (supplier_name, invoice_number, invoice_date, total_inc_gst, total_ex_gst, imported_by, file_name, status)
    VALUES
      ('Access4', ${invoiceNumber}, ${invoiceDate}, ${totalIncGst}, ${Math.round(totalIncGst / 1.1 * 100) / 100},
       ${importedBy}, ${'Access4-' + invoiceNumber + '.pdf'}, 'imported')
    ON DUPLICATE KEY UPDATE
      total_inc_gst = VALUES(total_inc_gst),
      imported_by = VALUES(imported_by),
      status = 'imported'
  `);

  for (const ent of enterprises) {
    if (ent.isInternal) {
      internal++;
      continue;
    }

    const wholesaleExGst = Math.round(ent.mrc / 1.1 * 100) / 100;
    totalWholesaleExGst += wholesaleExGst;

    // Try to match to existing customer
    const customerId = fuzzyMatch(ent.name);

    // Check if a mapping rule already exists for this enterprise
    const existingMap = await db.execute(sql`
      SELECT id, customer_external_id FROM supplier_service_map
      WHERE supplier_name = 'Access4' AND supplier_service_id = ${ent.name}
      LIMIT 1
    `);
    const existingRows = (existingMap as any).rows || existingMap;

    if (existingRows.length > 0) {
      // Update the existing mapping with latest invoice data
      await db.execute(sql`
        UPDATE supplier_service_map
        SET monthly_cost = ${wholesaleExGst},
            monthly_revenue = ${Math.round(ent.mrc * 100) / 100},
            last_invoice_date = ${invoiceDate},
            notes = ${`Endpoints: ${ent.endpoints}, MRC: $${ent.mrc.toFixed(2)}, Variable: $${ent.variable.toFixed(2)}, Once-Off: $${ent.onceOff.toFixed(2)}`},
            updated_at = NOW()
        WHERE supplier_name = 'Access4' AND supplier_service_id = ${ent.name}
      `);
      matched++;
    } else {
      // Insert new mapping
      await db.execute(sql`
        INSERT INTO supplier_service_map
          (supplier_name, supplier_service_id, supplier_service_name, customer_external_id,
           monthly_cost, monthly_revenue, last_invoice_date, match_confidence, notes)
        VALUES
          ('Access4', ${ent.name}, ${ent.name}, ${customerId || ''},
           ${wholesaleExGst}, ${Math.round(ent.mrc * 100) / 100},
           ${invoiceDate}, ${customerId ? 'fuzzy' : 'unmatched'},
           ${`Endpoints: ${ent.endpoints}, MRC: $${ent.mrc.toFixed(2)}, Variable: $${ent.variable.toFixed(2)}, Once-Off: $${ent.onceOff.toFixed(2)}`})
      `);
      if (customerId) matched++;
      else unmatched++;
    }
  }

  // Update supplier registry with latest invoice totals
  await db.execute(sql`
    INSERT INTO supplier_registry
      (supplier_name, display_name, \`rank\`, total_monthly_cost, last_invoice_date, last_invoice_number, is_active)
    VALUES
      ('Access4', 'Access4 (SasBoss UCaaS)', 2, ${totalWholesaleExGst}, ${invoiceDate}, ${invoiceNumber}, 1)
    ON DUPLICATE KEY UPDATE
      total_monthly_cost = VALUES(total_monthly_cost),
      last_invoice_date = VALUES(last_invoice_date),
      last_invoice_number = VALUES(last_invoice_number)
  `);

  return {
    invoiceNumber,
    totalEnterprises: enterprises.length,
    matched,
    unmatched,
    internal,
    totalWholesaleExGst: Math.round(totalWholesaleExGst * 100) / 100,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Global Auto-Match Billing Items
 *
 * Runs across ALL customers without requiring the Billing Match screen to be opened.
 * Applies 100%-confidence matches (exact planName + customerExternalId match) using
 * saved rules from service_billing_match_log. Also applies fuzzy matching for
 * high-confidence (>=70%) service-to-billing-item pairs.
 *
 * Threshold of 70% captures provider-aligned single-service matches:
 *   50% category match + 20% provider bonus = 70% for ChannelHaus, ABB, SasBoss, etc.
 * The UI can override this with a higher threshold for conservative manual runs.
 *
 * This ensures the Supplier Registry dashboard reflects accurate costs immediately
 * after any import, without manual per-customer review.
 */
export async function globalAutoMatchBillingItems(
  minConfidence: number = 70,
  triggeredBy: string = 'system'
): Promise<{
  applied: number;
  skipped: number;
  customersProcessed: number;
  errors: string[];
}> {
  const db = await getDb();
  if (!db) return { applied: 0, skipped: 0, customersProcessed: 0, errors: ['Database not available'] };

  let applied = 0;
  let skipped = 0;
  const errors: string[] = [];

  // ── Step 1: Apply saved match rules (100% confidence) ──────────────────────
  const ruleResult = await autoApplyMatchRules();
  applied += ruleResult.applied;
  skipped += ruleResult.skipped;

  // ── Step 2: Apply fuzzy matching for high-confidence pairs ─────────────────
  // Get all customers that have unassigned services AND billing items
  const customersWithUnassigned = await db.execute(sql`
    SELECT DISTINCT s.customerExternalId
    FROM services s
    WHERE s.status NOT IN ('terminated', 'flagged_for_termination')
      AND s.customerExternalId IS NOT NULL
      AND s.customerExternalId != ''
      AND s.externalId NOT IN (
        SELECT serviceExternalId FROM service_billing_assignments
      )
      AND s.externalId NOT IN (
        SELECT serviceExternalId FROM unbillable_services
      )
  `);

  // Drizzle db.execute returns [rows, fields] — rows is the first element
  const rawCustomerRows: any[] = Array.isArray(customersWithUnassigned)
    ? (customersWithUnassigned[0] as unknown as any[])
    : ((customersWithUnassigned as any).rows || []);
  const customerIds: string[] = rawCustomerRows
    .map((r: any) => r.customerExternalId || r[0])
    .filter((id: any): id is string => typeof id === 'string' && id.length > 0);

  for (const customerId of customerIds) {
    try {
      // Get fuzzy proposals for this customer
      const proposals = await fuzzyMatchServicesAgainstBillingItems(customerId);

      // Only auto-apply proposals at or above the confidence threshold
      const highConfidence = proposals.filter(p => p.scorePercent >= minConfidence);

      for (const proposal of highConfidence) {
        try {
          const result = await assignServiceToBillingItem(
            proposal.billingItemExternalId,
            proposal.serviceExternalId,
            customerId,
            triggeredBy,
            'auto',
            `Global auto-match (${proposal.scorePercent}% confidence)`,
            'standard'
          );
          if (result.alreadyAssigned) {
            skipped++;
          } else {
            applied++;
          }
        } catch (err) {
          errors.push(`Failed to assign ${proposal.serviceExternalId}: ${err}`);
        }
      }
    } catch (err) {
      errors.push(`Failed to process customer ${customerId}: ${err}`);
    }
  }

  return {
    applied,
    skipped,
    customersProcessed: customerIds.length,
    errors,
  };
}

/**
 * Re-apply costs from the most recent confirmed SasBoss workbook to services
 * for a specific customer (or all customers if customerExternalId is omitted).
 *
 * This is useful when services were created before costs were populated, or
 * when a workbook was re-uploaded with corrected amounts.
 */
export async function recalculateCostsFromWorkbook(
  customerExternalId?: string
): Promise<{ updated: number; skipped: number; errors: string[] }> {
  const db = await getDb();
  if (!db) return { updated: 0, skipped: 0, errors: ['Database not available'] };

  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  // Get the most recent workbook line items that have a matched service
  const lineItems = await db
    .select({
      matchedServiceExternalId: supplierWorkbookLineItems.matchedServiceExternalId,
      amountExGst: supplierWorkbookLineItems.amountExGst,
      matchedCustomerExternalId: supplierWorkbookLineItems.matchedCustomerExternalId,
      matchStatus: supplierWorkbookLineItems.matchStatus,
      uploadId: supplierWorkbookLineItems.uploadId,
    })
    .from(supplierWorkbookLineItems)
    .where(
      and(
        sql`${supplierWorkbookLineItems.matchStatus} IN ('matched', 'partial')`,
        sql`${supplierWorkbookLineItems.amountExGst} > 0`,
        sql`${supplierWorkbookLineItems.matchedServiceExternalId} != ''`,
        customerExternalId
          ? eq(supplierWorkbookLineItems.matchedCustomerExternalId, customerExternalId)
          : sql`1=1`
      )
    )
    .orderBy(desc(supplierWorkbookLineItems.uploadId));

  // Deduplicate: keep only the most recent entry per service
  const latestByService = new Map<string, typeof lineItems[0]>();
  for (const item of lineItems) {
    const svcId = item.matchedServiceExternalId || '';
    if (!svcId) continue;
    if (!latestByService.has(svcId)) {
      latestByService.set(svcId, item);
    }
  }

  // Apply costs in batches of 10
  const entries = Array.from(latestByService.values());
  for (let i = 0; i < entries.length; i += 10) {
    const batch = entries.slice(i, i + 10);
    await Promise.all(
      batch.map(async (item) => {
        try {
          const cost = parseFloat(String(item.amountExGst));
          if (cost <= 0) { skipped++; return; }
          await db
            .update(services)
            .set({
              monthlyCost: String(cost.toFixed(2)),
              costSource: 'supplier_invoice',
              updatedAt: new Date(),
            })
            .where(eq(services.externalId, item.matchedServiceExternalId!));
          updated++;
        } catch (err) {
          errors.push(`Failed to update service ${item.matchedServiceExternalId}: ${err}`);
        }
      })
    );
  }

  return { updated, skipped, errors };
}

/**
 * Proportional Revenue Split (Fix #3)
 * ─────────────────────────────────────────────────────────────────────────────
 * When a single billing item (e.g. Xero "Data - Internet: $500") is assigned
 * to multiple services (e.g. 4 × ABB NBN services for the same customer),
 * the full lineAmount would naively be counted against each service, inflating
 * total revenue. This function redistributes the billing item's lineAmount
 * proportionally across all assigned services, weighted by monthlyCost.
 *
 * The split is stored by updating billing_items.lineAmount for virtual
 * "split" copies — but since billing_items are immutable (they come from Xero),
 * we instead store the split factor in service_billing_assignments.allocationPct
 * and update services.monthlyRevenue accordingly.
 *
 * If allocationPct does not exist as a column yet, we fall back to updating
 * services.monthlyRevenue directly using the proportional share of lineAmount.
 *
 * Safe to run multiple times — idempotent.
 */
export async function redistributeProportionalRevenue(): Promise<{
  billingItemsProcessed: number;
  servicesUpdated: number;
  errors: string[];
}> {
  const db = await getDb();
  if (!db) return { billingItemsProcessed: 0, servicesUpdated: 0, errors: ['Database not available'] };

  let billingItemsProcessed = 0;
  let servicesUpdated = 0;
  const errors: string[] = [];

  // Find billing items that are assigned to more than one service
  const multiAssigned = await db.execute(sql`
    SELECT
      sba.billingItemExternalId,
      bi.lineAmount,
      COUNT(sba.id) AS assignmentCount,
      GROUP_CONCAT(sba.serviceExternalId ORDER BY sba.id SEPARATOR ',') AS serviceIds
    FROM service_billing_assignments sba
    JOIN billing_items bi ON bi.externalId = sba.billingItemExternalId
    WHERE bi.lineAmount > 0
    GROUP BY sba.billingItemExternalId, bi.lineAmount
    HAVING COUNT(sba.id) > 1
  `);

  // MySQL2 returns rows as an array of objects; handle both Drizzle and raw mysql2 formats
  const rawRows = (multiAssigned as any).rows || (Array.isArray(multiAssigned) ? multiAssigned : []);
  const rows = Array.isArray(rawRows) ? rawRows : [];
  for (const row of rows) {
    try {
      const billingItemId = String(row.billingItemExternalId || row[0] || '');
      const lineAmount = parseFloat(String(row.lineAmount || row[1] || '0'));
      // GROUP_CONCAT returns a Buffer in some MySQL2 configs — convert to string
      const rawServiceIds = row.serviceIds || row[3];
      const serviceIdStr = rawServiceIds instanceof Buffer
        ? rawServiceIds.toString('utf8')
        : String(rawServiceIds || '');
      const serviceIds: string[] = serviceIdStr.split(',').filter(Boolean);;

      if (!billingItemId || lineAmount <= 0 || serviceIds.length < 2) continue;

      // Get monthlyCost for each assigned service to use as weighting
      const svcRows = await db
        .select({
          externalId: services.externalId,
          monthlyCost: services.monthlyCost,
        })
        .from(services)
        .where(inArray(services.externalId, serviceIds));

      const totalCost = svcRows.reduce((sum, s) => sum + parseFloat(String(s.monthlyCost || '0')), 0);

      if (totalCost <= 0) {
        // Equal split if no cost data
        const share = lineAmount / serviceIds.length;
        for (const svcId of serviceIds) {
          await db.update(services)
            .set({ monthlyRevenue: String(share.toFixed(2)), updatedAt: new Date() })
            .where(eq(services.externalId, svcId));
          servicesUpdated++;
        }
      } else {
        // Proportional split by monthlyCost
        for (const svc of svcRows) {
          const cost = parseFloat(String(svc.monthlyCost || '0'));
          const share = totalCost > 0 ? (cost / totalCost) * lineAmount : lineAmount / svcRows.length;
          await db.update(services)
            .set({ monthlyRevenue: String(share.toFixed(2)), updatedAt: new Date() })
            .where(eq(services.externalId, svc.externalId));
          servicesUpdated++;
        }
      }

      billingItemsProcessed++;
    } catch (err) {
      errors.push(`Failed to split billing item ${row.billingItemExternalId || row[0]}: ${err}`);
    }
  }

  // Recalculate customer-level revenue after the split
  if (servicesUpdated > 0) {
    await db.execute(sql`
      UPDATE customers c
      SET monthlyRevenue = (
        SELECT COALESCE(SUM(s.monthlyRevenue), 0)
        FROM services s
        WHERE s.customerExternalId = c.externalId AND s.status NOT IN ('terminated', 'billing_platform_stub')
      ),
      updatedAt = NOW()
    `);
  }

  return { billingItemsProcessed, servicesUpdated, errors };
}

// ── Retail Offering helpers ──────────────────────────────────────────────────

/**
 * Billing item description phrases that identify a retail bundle customer.
 * Maintained here as the single source of truth — update this list when new
 * product naming conventions are introduced.
 */
export const RETAIL_BUNDLE_PHRASES = [
  'SmileTel supplied NBN voice and internet bundle',
  'Site Bundle',
  'SmileTel supplied mobile broadband',
  'ST- NBN',
  'ST-NBN',
] as const;

/**
 * Reclassify all customers as retail_offering or standard based on whether
 * they have at least one billing item matching a retail bundle phrase.
 * Safe to run at any time — idempotent.
 */
export async function reclassifyRetailOffering(): Promise<{ updated: number }> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  // Build OR conditions for each phrase
  const phraseConditions = RETAIL_BUNDLE_PHRASES.map(phrase =>
    sql`${billingItems.description} LIKE ${`%${phrase}%`}`
  );

  // Get all customers that qualify as retail_offering
  const qualifying = await db
    .selectDistinct({ externalId: billingItems.customerExternalId })
    .from(billingItems)
    .where(or(...phraseConditions));

  const qualifyingIds = qualifying
    .map(r => r.externalId)
    .filter((id): id is string => !!id);

  // Reset all to standard first, then set qualifying ones to retail_offering
  await db.update(customers).set({ customerType: 'standard' });
  if (qualifyingIds.length > 0) {
    await db.update(customers)
      .set({ customerType: 'retail_offering' })
      .where(inArray(customers.externalId, qualifyingIds));
  }

  return { updated: qualifyingIds.length };
}

/**
 * Set the customerType for a customer (e.g. 'standard' | 'retail_offering').
 */
export async function setCustomerType(
  externalId: string,
  customerType: 'standard' | 'retail_offering',
  _updatedBy: string
) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const [existing] = await db.select({ id: customers.id }).from(customers).where(eq(customers.externalId, externalId)).limit(1);
  if (!existing) throw new Error('Customer not found');
  await db.update(customers).set({ customerType }).where(eq(customers.externalId, externalId));
  return { success: true, customerType };
}

/**
 * Set the wholesale plan cost on a Vocus Mobile SIM record and propagate
 * to the linked internal service's monthlyCost.
 */
export async function setVocusSimPlanCost(
  vocusServiceId: string,
  planCost: number,
  updatedBy: string
) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  // Update the vocus_mobile_services record
  await db.update(vocusMobileServices)
    .set({ planCost: String(planCost) })
    .where(eq(vocusMobileServices.vocusServiceId, vocusServiceId));
  // Propagate to the linked internal service
  const [vms] = await db.select({
    internalServiceExternalId: vocusMobileServices.internalServiceExternalId,
  })
    .from(vocusMobileServices)
    .where(eq(vocusMobileServices.vocusServiceId, vocusServiceId))
    .limit(1);
  if (vms?.internalServiceExternalId) {
    await db.update(services)
      .set({ monthlyCost: String(planCost), costSource: 'manual' })
      .where(eq(services.externalId, vms.internalServiceExternalId));
  }
  return { success: true, vocusServiceId, planCost, updatedBy };
}

/**
 * Inherit location address from any co-located service at the same customer that has a
 * confirmed address. Prefers Internet services, then ABB provider.
 *
 * Returns:
 *   { updated: true, address }          — single address found and applied automatically
 *   { updated: false, needsPicker: true, candidates } — multiple distinct addresses found;
 *                                          caller should present a site-picker to the user
 *   { updated: false, reason }          — no address found or service already located
 */
export async function inheritLocationFromColocated(
  serviceExternalId: string,
  updatedBy: string,
  chosenAddress?: string   // set when user has already picked from candidates
): Promise<{
  updated: boolean;
  address?: string;
  reason?: string;
  needsPicker?: boolean;
  candidates?: Array<{ address: string; locationExternalId: string | null; serviceType: string; provider: string | null; serviceExternalId: string }>;
}> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  // Get the target service
  const [svc] = await db.select().from(services).where(eq(services.externalId, serviceExternalId)).limit(1);
  if (!svc) return { updated: false, reason: 'Service not found' };
  if (!svc.customerExternalId) return { updated: false, reason: 'Service not matched to a customer' };
  if (svc.locationAddress && svc.locationAddress !== 'Unknown Location' && svc.locationAddress.trim() !== '') {
    return { updated: false, reason: 'Service already has a location address' };
  }

  // Find ALL co-located services at this customer with a known address
  // (any service type, any provider — not just ABB)
  const siblings = await db.select({
    externalId: services.externalId,
    serviceType: services.serviceType,
    locationAddress: services.locationAddress,
    locationExternalId: services.locationExternalId,
    provider: services.provider,
  })
    .from(services)
    .where(
      and(
        eq(services.customerExternalId, svc.customerExternalId),
        sql`${services.externalId} != ${serviceExternalId}`,
        sql`${services.locationAddress} IS NOT NULL`,
        sql`TRIM(${services.locationAddress}) != ''`,
        sql`${services.locationAddress} != 'Unknown Location'`,
        sql`${services.status} NOT IN ('terminated', 'flagged_for_termination')`
      )
    )
    .orderBy(
      // Prefer Internet services, then ABB, then alphabetical address
      sql`CASE WHEN ${services.serviceType} = 'Internet' THEN 0 ELSE 1 END`,
      sql`CASE WHEN ${services.provider} = 'ABB' THEN 0 ELSE 1 END`,
      services.locationAddress
    );

  if (siblings.length === 0) {
    return { updated: false, reason: 'No co-located service with a known address found at this customer' };
  }

  // Deduplicate addresses (case-insensitive trim)
  const seen = new Set<string>();
  const uniqueCandidates: typeof siblings = [];
  for (const s of siblings) {
    const key = (s.locationAddress || '').trim().toUpperCase();
    if (!seen.has(key)) {
      seen.add(key);
      uniqueCandidates.push(s);
    }
  }

  // Determine which source to use
  let source: typeof siblings[0];
  if (chosenAddress) {
    // User explicitly picked an address — find the matching sibling
    const match = uniqueCandidates.find(
      (c) => (c.locationAddress || '').trim().toUpperCase() === chosenAddress.trim().toUpperCase()
    );
    if (!match) return { updated: false, reason: 'Chosen address not found among candidates' };
    source = match;
  } else if (uniqueCandidates.length === 1) {
    // Only one distinct address — apply automatically
    source = uniqueCandidates[0];
  } else {
    // Multiple distinct addresses — ask the user to pick
    return {
      updated: false,
      needsPicker: true,
      candidates: uniqueCandidates.map((c) => ({
        address: c.locationAddress!,
        locationExternalId: c.locationExternalId ?? null,
        serviceType: c.serviceType || '',
        provider: c.provider ?? null,
        serviceExternalId: c.externalId,
      })),
    };
  }

  const newAddress = source.locationAddress!;
  const newLocationId = source.locationExternalId || '';

  // Apply the inherited address
  await db.update(services).set({
    locationAddress: newAddress,
    locationExternalId: newLocationId,
  }).where(eq(services.externalId, serviceExternalId));

  // Append a discovery note
  const existingNotes = svc.discoveryNotes || '';
  const inheritNote = `[Location inherited from ${source.serviceType} (${source.provider || 'Unknown'}) service ${source.externalId} by ${updatedBy}]`;
  const newNotes = existingNotes ? `${existingNotes}\n${inheritNote}` : inheritNote;
  await db.update(services).set({
    discoveryNotes: newNotes,
    notesAuthor: updatedBy,
    notesUpdatedAt: new Date(),
  }).where(eq(services.externalId, serviceExternalId));

  return { updated: true, address: newAddress };
}

export async function bulkInheritLocationsForCustomer(
  customerExternalId: string,
  updatedBy: string
): Promise<{ updated: number; skipped: number; failed: number; details: Array<{ serviceExternalId: string; result: string }> }> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  // Get all unlocated services for this customer
  const unlocated = await db.select({
    externalId: services.externalId,
    serviceType: services.serviceType,
    planName: services.planName,
  })
    .from(services)
    .where(
      and(
        eq(services.customerExternalId, customerExternalId),
        sql`(${services.locationAddress} IS NULL OR ${services.locationAddress} = '' OR ${services.locationAddress} = 'Unknown Location')`,
        sql`${services.status} NOT IN ('terminated', 'flagged_for_termination')`
      )
    );

  if (unlocated.length === 0) {
    return { updated: 0, skipped: 0, failed: 0, details: [] };
  }

  let updated = 0;
  let skipped = 0;
  let failed = 0;
  const details: Array<{ serviceExternalId: string; result: string }> = [];

  for (const svc of unlocated) {
    try {
      const result = await inheritLocationFromColocated(svc.externalId, updatedBy);
      if (result.updated) {
        updated++;
        details.push({ serviceExternalId: svc.externalId, result: `Inherited: ${result.address}` });
      } else {
        skipped++;
        details.push({ serviceExternalId: svc.externalId, result: `Skipped: ${result.reason}` });
      }
    } catch (err) {
      failed++;
      details.push({ serviceExternalId: svc.externalId, result: `Failed: ${String(err)}` });
    }
  }

  return { updated, skipped, failed, details };
}

// ─── Match Provenance ─────────────────────────────────────────────────────────

export type MatchProvenanceInput = {
  serviceExternalId: string;
  customerExternalId: string;
  matchMethod: 'manual' | 'auto_avc' | 'auto_phone' | 'auto_name' | 'workbook_import' | 'api_import' | 'system';
  matchSource: 'carbon_api' | 'tiab_spreadsheet' | 'tiab_api' | 'vocus_api' | 'sasboss_api' | 'datagate_api' | 'workbook_upload' | 'manual_ui' | 'system';
  matchedBy: string;
  matchCriteria?: Record<string, unknown>;
  confidence: 'high' | 'medium' | 'low';
  notes?: string;
};

/**
 * Records a structured provenance event whenever a service is matched to a customer.
 * Non-fatal — failures are logged but never throw.
 */
export async function writeMatchProvenance(input: MatchProvenanceInput): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    await db.insert(serviceMatchEvents).values({
      serviceExternalId: input.serviceExternalId,
      customerExternalId: input.customerExternalId,
      matchMethod: input.matchMethod,
      matchSource: input.matchSource,
      matchedBy: input.matchedBy,
      matchedAt: new Date(),
      matchCriteria: input.matchCriteria ? JSON.stringify(input.matchCriteria) : null,
      confidence: input.confidence,
      notes: input.notes ?? null,
      flaggedForReview: false,
    });
  } catch (err) {
    console.warn('[MatchProvenance] Failed to write provenance event:', err);
  }
}

/**
 * Returns all match provenance events for a service, most recent first.
 * Also returns any flag status on each event.
 */
export async function getMatchProvenance(serviceExternalId: string) {
  const db = await getDb();
  if (!db) return [];

  // Fetch formal provenance events
  const events = await db
    .select()
    .from(serviceMatchEvents)
    .where(eq(serviceMatchEvents.serviceExternalId, serviceExternalId))
    .orderBy(desc(serviceMatchEvents.matchedAt));

  if (events.length > 0) return events;

  // ── Synthesised fallback for services matched before the provenance system ──
  // Build a best-effort record from existing service fields so reviewers
  // always see *something* rather than an empty panel.
  const svc = await db
    .select({
      externalId: services.externalId,
      customerExternalId: services.customerExternalId,
      dataSource: services.dataSource,
      discoveryNotes: services.discoveryNotes,
      carbonServiceId: services.carbonServiceId,
      avcId: services.avcId,
      phoneNumber: services.phoneNumber,
      locationAddress: services.locationAddress,
      supplierAccount: services.supplierAccount,
      provider: services.provider,
      supplierName: services.supplierName,
      carbonAlias: services.carbonAlias,
      blitzReportName: services.blitzReportName,
      blitzImportDate: services.blitzImportDate,
      aaptImportDate: services.aaptImportDate,
      createdAt: services.createdAt,
      updatedAt: services.updatedAt,
    })
    .from(services)
    .where(eq(services.externalId, serviceExternalId))
    .limit(1);

  if (!svc.length || !svc[0].customerExternalId) return [];

  const s = svc[0];

  // Determine method and source from dataSource / available fields
  let matchMethod = 'system';
  let matchSource = 'system';
  let confidence = 'low';
  const criteria: Record<string, string> = {};
  const notes: string[] = [];

  const ds = (s.dataSource || '').toLowerCase();

  if (ds.includes('carbon') || s.carbonServiceId) {
    matchMethod = 'api_import';
    matchSource = 'carbon_api';
    confidence = 'high';
    if (s.avcId) criteria['AVC ID'] = s.avcId;
    if (s.carbonServiceId) criteria['Carbon Service ID'] = s.carbonServiceId;
    if (s.carbonAlias) criteria['Carbon Alias'] = s.carbonAlias;
    notes.push('Imported from ABB Carbon API');
  } else if (ds.includes('sasboss') || ds.includes('workbook') || ds.includes('xlsx')) {
    matchMethod = 'workbook_import';
    matchSource = 'workbook_upload';
    confidence = 'medium';
    if (s.blitzReportName) criteria['Workbook'] = s.blitzReportName;
    if (s.supplierAccount) criteria['Supplier Account'] = s.supplierAccount;
    notes.push('Matched via supplier workbook upload');
  } else if (ds.includes('blitz')) {
    matchMethod = 'workbook_import';
    matchSource = 'workbook_upload';
    confidence = 'medium';
    if (s.blitzReportName) criteria['Blitz Report'] = s.blitzReportName;
    if (s.blitzImportDate) criteria['Import Date'] = s.blitzImportDate;
    notes.push('Matched via Blitz Report import');
  } else if (ds.includes('aapt')) {
    matchMethod = 'api_import';
    matchSource = 'workbook_upload';
    confidence = 'medium';
    if (s.aaptImportDate) criteria['AAPT Import Date'] = s.aaptImportDate;
    notes.push('Matched via AAPT invoice import');
  } else if (s.avcId) {
    matchMethod = 'auto_avc';
    matchSource = 'carbon_api';
    confidence = 'high';
    criteria['AVC ID'] = s.avcId;
    notes.push('Auto-matched by AVC ID');
  } else if (s.phoneNumber) {
    matchMethod = 'auto_phone';
    matchSource = 'manual_ui';
    confidence = 'medium';
    criteria['Phone'] = s.phoneNumber;
    notes.push('Auto-matched by phone number');
  } else if (s.locationAddress) {
    matchMethod = 'auto_name';
    matchSource = 'manual_ui';
    confidence = 'medium';
    criteria['Address'] = s.locationAddress;
    notes.push('Auto-matched by address');
  } else {
    matchMethod = 'manual';
    matchSource = 'manual_ui';
    confidence = 'low';
    notes.push('Matched manually (pre-provenance system)');
  }

  if (s.discoveryNotes) {
    // Include first 200 chars of discovery notes as context
    const snippet = s.discoveryNotes.slice(0, 200);
    notes.push(`Notes: ${snippet}${s.discoveryNotes.length > 200 ? '…' : ''}`);
  }

  // Return as a synthetic event (id = -1 signals it's synthesised, not flaggable)
  return [{
    id: -1,
    serviceExternalId,
    customerExternalId: s.customerExternalId,
    matchMethod,
    matchSource,
    matchedBy: 'System (pre-provenance)',
    matchedAt: s.createdAt,
    matchCriteria: Object.keys(criteria).length ? JSON.stringify(criteria) : null,
    confidence,
    notes: notes.join(' · ') || null,
    flaggedForReview: false,
    flaggedBy: null,
    flaggedAt: null,
    flagReason: null,
    _synthesised: true,
  }];
}

/**
 * Flags a match event as potentially incorrect.
 */
export async function flagMatchEvent(
  eventId: number,
  flaggedBy: string,
  flagReason: string
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(serviceMatchEvents).set({
    flaggedForReview: true,
    flaggedBy,
    flaggedAt: new Date(),
    flagReason,
  }).where(eq(serviceMatchEvents.id, eventId));
}

/**
 * Clears the flag on a match event (reviewer resolved it).
 */
export async function clearMatchEventFlag(eventId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(serviceMatchEvents).set({
    flaggedForReview: false,
    flaggedBy: null,
    flaggedAt: null,
    flagReason: null,
  }).where(eq(serviceMatchEvents.id, eventId));
}
