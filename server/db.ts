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
  };
}

export async function searchAll(query: string) {
  const db = await getDb();
  if (!db) return { customers: [], services: [] };

  const term = `%${query}%`;

  const custResults = await db.select().from(customers).where(
    like(customers.name, term)
  ).limit(10);

  const svcResults = await db.select().from(services).where(
    or(
      like(services.customerName, term),
      like(services.phoneNumber, term),
      like(services.connectionId, term),
      like(services.serviceId, term),
      like(services.locationAddress, term)
    )
  ).limit(20);

  return {
    customers: custResults.map(c => ({
      ...c,
      billingPlatforms: c.billingPlatforms ? JSON.parse(c.billingPlatforms) : [],
      monthlyCost: parseFloat(c.monthlyCost),
    })),
    services: svcResults.map(s => ({
      ...s,
      monthlyCost: parseFloat(s.monthlyCost),
      billingHistory: s.billingHistory ? JSON.parse(s.billingHistory) : [],
    })),
  };
}
