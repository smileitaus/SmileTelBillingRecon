import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, decimal } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Customers - the primary entity. Each customer represents a business location
 * that consumes one or more services.
 */
export const customers = mysqlTable("customers", {
  id: int("id").autoincrement().primaryKey(),
  externalId: varchar("externalId", { length: 32 }).notNull().unique(),
  name: varchar("name", { length: 512 }).notNull(),
  billingPlatforms: text("billingPlatforms"),
  serviceCount: int("serviceCount").default(0).notNull(),
  monthlyCost: decimal("monthlyCost", { precision: 10, scale: 2 }).default("0.00").notNull(),
  unmatchedCount: int("unmatchedCount").default(0).notNull(),
  matchedCount: int("matchedCount").default(0).notNull(),
  status: varchar("status", { length: 32 }).default("active").notNull(),
  // Franchise/business info from Zambrero sites list
  businessName: varchar("businessName", { length: 512 }).default(""),
  contactName: varchar("contactName", { length: 256 }).default(""),
  contactEmail: varchar("contactEmail", { length: 320 }).default(""),
  contactPhone: varchar("contactPhone", { length: 64 }).default(""),
  ownershipType: varchar("ownershipType", { length: 16 }).default(""),
  siteAddress: varchar("siteAddress", { length: 1024 }).default(""),
  notes: text("notes"),
  // Xero integration
  xeroContactName: varchar("xeroContactName", { length: 512 }).default(""),
  xeroAccountNumber: varchar("xeroAccountNumber", { length: 64 }).default(""),
  // Revenue tracking
  monthlyRevenue: decimal("monthlyRevenue", { precision: 10, scale: 2 }).default("0.00").notNull(),
  marginPercent: decimal("marginPercent", { precision: 5, scale: 2 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Customer = typeof customers.$inferSelect;
export type InsertCustomer = typeof customers.$inferInsert;

/**
 * Locations - physical addresses where services are delivered.
 * Each location belongs to one customer.
 */
export const locations = mysqlTable("locations", {
  id: int("id").autoincrement().primaryKey(),
  externalId: varchar("externalId", { length: 32 }).notNull().unique(),
  address: varchar("address", { length: 1024 }).notNull(),
  customerExternalId: varchar("customerExternalId", { length: 32 }).notNull(),
  customerName: varchar("customerName", { length: 512 }).notNull(),
  serviceCount: int("serviceCount").default(0).notNull(),
  serviceIds: text("serviceIds"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Location = typeof locations.$inferSelect;
export type InsertLocation = typeof locations.$inferInsert;

/**
 * Services - individual telecom services (internet, mobile, voice).
 * Each service belongs to a customer and a location.
 */
export const services = mysqlTable("services", {
  id: int("id").autoincrement().primaryKey(),
  externalId: varchar("externalId", { length: 32 }).notNull().unique(),
  serviceId: varchar("serviceId", { length: 256 }).default(""),
  serviceType: varchar("serviceType", { length: 64 }).notNull(),
  serviceTypeDetail: varchar("serviceTypeDetail", { length: 256 }).default(""),
  planName: varchar("planName", { length: 512 }).default(""),
  status: varchar("status", { length: 32 }).default("active").notNull(),
  locationExternalId: varchar("locationExternalId", { length: 32 }).default(""),
  locationAddress: varchar("locationAddress", { length: 1024 }).default(""),
  supplierAccount: varchar("supplierAccount", { length: 64 }).default(""),
  supplierName: varchar("supplierName", { length: 128 }).default("Telstra"),
  phoneNumber: varchar("phoneNumber", { length: 64 }).default(""),
  email: varchar("email", { length: 320 }).default(""),
  connectionId: varchar("connectionId", { length: 128 }).default(""),
  locId: varchar("locId", { length: 128 }).default(""),
  ipAddress: varchar("ipAddress", { length: 64 }).default(""),
  customerName: varchar("customerName", { length: 512 }).default(""),
  customerExternalId: varchar("customerExternalId", { length: 32 }).default(""),
  monthlyCost: decimal("monthlyCost", { precision: 10, scale: 2 }).default("0.00").notNull(),
  billingHistory: text("billingHistory"),
  discoveryNotes: text("discoveryNotes"),
  notesAuthor: varchar("notesAuthor", { length: 256 }),
  notesUpdatedAt: timestamp("notesUpdatedAt"),
  dismissedSuggestions: text("dismissedSuggestions"),
  simSerialNumber: varchar("simSerialNumber", { length: 64 }).default(""),
  hardwareType: varchar("hardwareType", { length: 256 }).default(""),
  macAddress: varchar("macAddress", { length: 64 }).default(""),
  modemSerialNumber: varchar("modemSerialNumber", { length: 128 }).default(""),
  wifiPassword: varchar("wifiPassword", { length: 128 }).default(""),
  lastWanIp: varchar("lastWanIp", { length: 64 }).default(""),
  simOwner: varchar("simOwner", { length: 256 }).default(""),
  dataPlanGb: varchar("dataPlanGb", { length: 32 }).default(""),
  purchaseDate: varchar("purchaseDate", { length: 64 }).default(""),
  dataSource: varchar("dataSource", { length: 256 }).default(""),
  // Provider identification
  provider: varchar("provider", { length: 64 }).default("Unknown"),
  // Carbon API fields (ABB)
  carbonServiceId: varchar("carbonServiceId", { length: 64 }).default(""),
  carbonServiceType: varchar("carbonServiceType", { length: 64 }).default(""),
  carbonStatus: varchar("carbonStatus", { length: 64 }).default(""),
  avcId: varchar("avcId", { length: 128 }).default(""),
  technology: varchar("technology", { length: 64 }).default(""),
  speedTier: varchar("speedTier", { length: 128 }).default(""),
  nbnSla: varchar("nbnSla", { length: 128 }).default(""),
  supportPack: varchar("supportPack", { length: 64 }).default(""),
  poiName: varchar("poiName", { length: 128 }).default(""),
  zone: varchar("zone", { length: 64 }).default(""),
  openDate: varchar("openDate", { length: 64 }).default(""),
  carbonMonthlyCost: decimal("carbonMonthlyCost", { precision: 10, scale: 2 }),
  carbonPlanName: varchar("carbonPlanName", { length: 256 }).default(""),
  carbonAlias: varchar("carbonAlias", { length: 512 }).default(""),
  // Blitz Report fields
  imei: varchar("imei", { length: 64 }).default(""),
  deviceName: varchar("deviceName", { length: 256 }).default(""),
  deviceType: varchar("deviceType", { length: 128 }).default(""),
  deviceCategory: varchar("deviceCategory", { length: 128 }).default(""),
  imsi: varchar("imsi", { length: 64 }).default(""),
  userName: varchar("userName", { length: 256 }).default(""),
  serviceActivationDate: varchar("serviceActivationDate", { length: 64 }).default(""),
  serviceEndDate: varchar("serviceEndDate", { length: 64 }).default(""),
  flexiplanCode: varchar("flexiplanCode", { length: 128 }).default(""),
  flexiplanName: varchar("flexiplanName", { length: 256 }).default(""),
  contractEndDate: varchar("contractEndDate", { length: 64 }).default(""),
  proposedPlan: varchar("proposedPlan", { length: 256 }).default(""),
  proposedCost: varchar("proposedCost", { length: 32 }).default(""),
  proposedDataGb: varchar("proposedDataGb", { length: 32 }).default(""),
  noDataUse: int("noDataUse").default(0).notNull(),
  // Revenue tracking
  monthlyRevenue: decimal("monthlyRevenue", { precision: 10, scale: 2 }).default("0.00").notNull(),
  marginPercent: decimal("marginPercent", { precision: 5, scale: 2 }),
  billingItemId: varchar("billingItemId", { length: 32 }).default(""),
  // Billing platform(s) - JSON array of: OneBill, SasBoss, ECN, Halo, DataGate
  billingPlatform: text("billingPlatform"),
  blitzCategory: varchar("blitzCategory", { length: 128 }).default(""),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Service = typeof services.$inferSelect;
export type InsertService = typeof services.$inferInsert;

/**
 * Supplier accounts - Telstra account numbers and their aggregate data.
 */
export const supplierAccounts = mysqlTable("supplier_accounts", {
  id: int("id").autoincrement().primaryKey(),
  accountNumber: varchar("accountNumber", { length: 64 }).notNull(),
  supplierName: varchar("supplierName", { length: 128 }).default("Telstra").notNull(),
  serviceCount: int("serviceCount").default(0).notNull(),
  monthlyCost: decimal("monthlyCost", { precision: 10, scale: 2 }).default("0.00").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SupplierAccount = typeof supplierAccounts.$inferSelect;
export type InsertSupplierAccount = typeof supplierAccounts.$inferInsert;

/**
 * Billing items - recurring revenue line items from Xero invoices.
 * Each billing item belongs to a customer and may be matched to a service.
 */
export const billingItems = mysqlTable("billing_items", {
  id: int("id").autoincrement().primaryKey(),
  externalId: varchar("externalId", { length: 32 }).notNull().unique(),
  invoiceDate: varchar("invoiceDate", { length: 32 }).notNull(),
  invoiceNumber: varchar("invoiceNumber", { length: 64 }).notNull(),
  contactName: varchar("contactName", { length: 512 }).notNull(),
  description: text("description").notNull(),
  quantity: decimal("quantity", { precision: 10, scale: 2 }).default("1.00").notNull(),
  unitAmount: decimal("unitAmount", { precision: 10, scale: 2 }).default("0.00").notNull(),
  discount: decimal("discount", { precision: 10, scale: 2 }).default("0.00"),
  lineAmount: decimal("lineAmount", { precision: 10, scale: 2 }).default("0.00").notNull(),
  taxAmount: decimal("taxAmount", { precision: 10, scale: 2 }).default("0.00"),
  accountCode: varchar("accountCode", { length: 16 }),
  category: varchar("category", { length: 64 }).default("recurring").notNull(),
  // Matching fields
  customerExternalId: varchar("customerExternalId", { length: 32 }).default(""),
  serviceExternalId: varchar("serviceExternalId", { length: 32 }).default(""),
  matchStatus: varchar("matchStatus", { length: 32 }).default("unmatched").notNull(),
  matchConfidence: varchar("matchConfidence", { length: 16 }).default(""),
  // Billing platform source: OneBill, SasBoss, ECN, Halo, DataGate
  billingPlatform: varchar("billingPlatform", { length: 64 }).default(""),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type BillingItem = typeof billingItems.$inferSelect;
export type InsertBillingItem = typeof billingItems.$inferInsert;

/**
 * Review Items - tracks user-submitted review items and ignored system-detected issues.
 * type: 'manual' = user submitted for review, 'ignored' = user dismissed a system issue
 */
export const reviewItems = mysqlTable("review_items", {
  id: int("id").autoincrement().primaryKey(),
  type: varchar("type", { length: 16 }).notNull(), // 'manual' | 'ignored'
  // What is being reviewed
  targetType: varchar("targetType", { length: 16 }).notNull(), // 'service' | 'customer' | 'billing-item'
  targetId: varchar("targetId", { length: 64 }).notNull(), // externalId of service/customer or id of billing item
  targetName: varchar("targetName", { length: 512 }).default(""),
  // For ignored items, which system issue type was ignored
  issueType: varchar("issueType", { length: 64 }).default(""),
  // User-provided note (required)
  note: text("note").notNull(),
  // Who submitted/ignored
  submittedBy: varchar("submittedBy", { length: 256 }).notNull(),
  status: varchar("status", { length: 16 }).default("open").notNull(), // 'open' | 'resolved'
  resolvedNote: text("resolvedNote"),
  resolvedBy: varchar("resolvedBy", { length: 256 }),
  resolvedAt: timestamp("resolvedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ReviewItem = typeof reviewItems.$inferSelect;
export type InsertReviewItem = typeof reviewItems.$inferInsert;

/**
 * Billing Platform Checks - action items automatically created when a review item is submitted.
 * Each check represents a manual verification task on a specific billing platform.
 * Users mark checks as 'actioned' once they have completed the manual verification.
 */
export const billingPlatformChecks = mysqlTable("billing_platform_checks", {
  id: int("id").autoincrement().primaryKey(),
  // Source review item
  reviewItemId: int("reviewItemId"),
  // The service or billing item being checked
  targetType: varchar("targetType", { length: 16 }).notNull(), // 'service' | 'billing-item'
  targetId: varchar("targetId", { length: 64 }).notNull(),
  targetName: varchar("targetName", { length: 512 }).default(""),
  // The billing platform that needs to be checked
  platform: varchar("platform", { length: 64 }).notNull(), // OneBill | SasBoss | ECN | Halo | DataGate | Manual
  // The issue type that triggered this check
  issueType: varchar("issueType", { length: 64 }).notNull(),
  issueDescription: text("issueDescription"),
  // Customer context
  customerName: varchar("customerName", { length: 512 }).default(""),
  customerExternalId: varchar("customerExternalId", { length: 32 }).default(""),
  // Financial context
  monthlyAmount: decimal("monthlyAmount", { precision: 10, scale: 2 }).default("0.00"),
  // Priority: critical | high | medium | low
  priority: varchar("priority", { length: 16 }).default("medium").notNull(),
  // Status: open | in-progress | actioned | dismissed
  status: varchar("status", { length: 16 }).default("open").notNull(),
  // Action tracking
  actionedBy: varchar("actionedBy", { length: 256 }),
  actionedNote: text("actionedNote"),
  actionedAt: timestamp("actionedAt"),
  // Who created this check
  createdBy: varchar("createdBy", { length: 256 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type BillingPlatformCheck = typeof billingPlatformChecks.$inferSelect;
export type InsertBillingPlatformCheck = typeof billingPlatformChecks.$inferInsert;

/**
 * Service Edit History - audit trail for all manual edits to service records.
 */
export const serviceEditHistory = mysqlTable("service_edit_history", {
  id: int("id").autoincrement().primaryKey(),
  serviceExternalId: varchar("serviceExternalId", { length: 32 }).notNull(),
  editedBy: varchar("editedBy", { length: 256 }).notNull(),
  // JSON object of changed fields: { fieldName: { from: old, to: new } }
  changes: text("changes").notNull(),
  reason: text("reason"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ServiceEditHistory = typeof serviceEditHistory.$inferSelect;
export type InsertServiceEditHistory = typeof serviceEditHistory.$inferInsert;
