import { int, boolean, mysqlEnum, mysqlTable, text, mediumtext, timestamp, varchar, decimal, uniqueIndex, tinyint } from "drizzle-orm/mysql-core";

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
  marginPercent: decimal("marginPercent", { precision: 10, scale: 2 }),
  // Billing completeness: services assigned to this customer with no billing item linked
  unmatchedBillingCount: int("unmatchedBillingCount").default(0).notNull(),
  // Customer type classification
  // 'standard' = regular wholesale/enterprise customer
  // 'retail_offering' = billed via SmileTel retail bundle (NBN + 4G SIM + Hardware + SIP + Support)
  customerType: varchar("customerType", { length: 32 }).default("standard").notNull(),
  // Aggregated retail bundle monthly cost (sum of all bundle components, ex GST)
  retailBundleMonthlyCost: decimal("retailBundleMonthlyCost", { precision: 10, scale: 2 }).default("0.00"),
  // Parent customer for franchise/group relationships (e.g. Infinitea Trading → Little Cha sites)
  parentCustomerExternalId: varchar("parentCustomerExternalId", { length: 32 }).default(""),
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
  // Service category for grouping and matching
  // voice-licensing | voice-usage | voice-numbers | voice-features |
  // data-mobile | data-nbn | data-enterprise | data-usage |
  // hardware | professional-services | internal | other
  serviceCategory: varchar("serviceCategory", { length: 64 }).default("other").notNull(),
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
  // Cost source tracking: 'carbon_api' | 'supplier_invoice' | 'manual' | 'unknown'
  costSource: varchar("costSource", { length: 32 }).default("unknown"),
  // Revenue tracking
  monthlyRevenue: decimal("monthlyRevenue", { precision: 10, scale: 2 }).default("0.00").notNull(),
  marginPercent: decimal("marginPercent", { precision: 10, scale: 2 }),
  billingItemId: varchar("billingItemId", { length: 32 }).default(""),
  // Billing platform(s) - JSON array of: OneBill, SasBoss, ECN, Halo, DataGate
  billingPlatform: text("billingPlatform"),
  blitzCategory: varchar("blitzCategory", { length: 128 }).default(""),
  // March 2026 Blitz import fields
  blitzImportDate: varchar("blitzImportDate", { length: 32 }).default(""),
  blitzReportName: varchar("blitzReportName", { length: 128 }).default(""),
  blitzAccountNumber: varchar("blitzAccountNumber", { length: 64 }).default(""),
  blitzNoUse3m: int("blitzNoUse3m").default(0).notNull(),
  blitzNoUse6m: int("blitzNoUse6m").default(0).notNull(),
  blitzNoNetActivity6m: int("blitzNoNetActivity6m").default(0).notNull(),
  blitzLastUsedDate: varchar("blitzLastUsedDate", { length: 64 }).default(""),
  blitzPostcode: varchar("blitzPostcode", { length: 16 }).default(""),
  blitzDeviceAgeMths: int("blitzDeviceAgeMths"),
  blitzMroContract: varchar("blitzMroContract", { length: 128 }).default(""),
  blitzMroEndDate: varchar("blitzMroEndDate", { length: 64 }).default(""),
  blitzMroEtc: decimal("blitzMroEtc", { precision: 10, scale: 2 }),
  blitzMroDeviceName: varchar("blitzMroDeviceName", { length: 256 }).default(""),
  blitzAvg3mDataMb: decimal("blitzAvg3mDataMb", { precision: 12, scale: 2 }),
  blitzAvg6mDataMb: decimal("blitzAvg6mDataMb", { precision: 12, scale: 2 }),
  blitzAvg3mVoiceMins: decimal("blitzAvg3mVoiceMins", { precision: 10, scale: 2 }),
  blitzAvg6mVoiceMins: decimal("blitzAvg6mVoiceMins", { precision: 10, scale: 2 }),
  blitzAvg3mBill: decimal("blitzAvg3mBill", { precision: 10, scale: 2 }),
  blitzBillMar26: decimal("blitzBillMar26", { precision: 10, scale: 2 }),
  blitzBillFeb26: decimal("blitzBillFeb26", { precision: 10, scale: 2 }),
  blitzBillJan26: decimal("blitzBillJan26", { precision: 10, scale: 2 }),
  blitzUsageHistory: text("blitzUsageHistory"),
  terminationNote: text("terminationNote"),
  // Termination workflow tracking
  terminationRequestedAt: timestamp("terminationRequestedAt"),
  terminationRequestedBy: varchar("terminationRequestedBy", { length: 256 }).default(""),
  // Archive workflow: set when a service is confirmed terminated and archived
  archivedAt: timestamp("archivedAt"),
  terminationBatchId: varchar("terminationBatchId", { length: 64 }).default(""),
  terminationListSource: varchar("terminationListSource", { length: 256 }).default(""),
  terminationConfirmedDate: varchar("terminationConfirmedDate", { length: 32 }).default(""),
  // AAPT invoice fields
  aaptServiceId: varchar("aaptServiceId", { length: 64 }).default(""),
  aaptProductType: varchar("aaptProductType", { length: 128 }).default(""),
  aaptProductCategory: varchar("aaptProductCategory", { length: 64 }).default(""),
  aaptYourId: varchar("aaptYourId", { length: 256 }).default(""),
  aaptAccessId: varchar("aaptAccessId", { length: 128 }).default(""),
  aaptSpeedMbps: int("aaptSpeedMbps"),
  aaptContractMonths: int("aaptContractMonths"),
  aaptAccountNumber: varchar("aaptAccountNumber", { length: 64 }).default(""),
  aaptInvoiceNumber: varchar("aaptInvoiceNumber", { length: 64 }).default(""),
  aaptBillingPeriod: varchar("aaptBillingPeriod", { length: 64 }).default(""),
  aaptImportDate: varchar("aaptImportDate", { length: 32 }).default(""),
  // Billing period management: 'current' | 'previous' | 'advance' | 'archived'
  // archived = historical data, hidden from all service lists and dashboards
  billingPeriod: varchar("billingPeriod", { length: 32 }).default("current"),
  // The invoice month this service was sourced from (e.g. '2026-02')
  invoiceMonth: varchar("invoiceMonth", { length: 7 }).default(""),
  // Revenue group: links this service to a voice pack, retail bundle, or data bundle
  // revenueGroupId references revenue_groups.groupId (string key, not FK to keep it flexible)
  revenueGroupId: varchar("revenueGroupId", { length: 64 }).default(""),
  revenueGroupLabel: varchar("revenueGroupLabel", { length: 255 }).default(""),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Service = typeof services.$inferSelect;
export type InsertService = typeof services.$inferInsert;

/**
 * Revenue Groups — voice packs, retail bundles, data bundles.
 * A group links multiple services under a single billed revenue line.
 * type: 'voice_pack' | 'retail_bundle' | 'data_bundle' | 'custom'
 */
export const revenueGroups = mysqlTable("revenue_groups", {
  id: int("id").autoincrement().primaryKey(),
  groupId: varchar("groupId", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  type: varchar("type", { length: 32 }).notNull().default("voice_pack"),
  customerExternalId: varchar("customerExternalId", { length: 64 }).notNull(),
  customerName: varchar("customerName", { length: 255 }).default(""),
  totalRevenue: decimal("totalRevenue", { precision: 10, scale: 2 }).default("0.00").notNull(),
  totalCost: decimal("totalCost", { precision: 10, scale: 2 }).default("0.00").notNull(),
  notes: text("notes"),
  autoDetected: int("autoDetected").default(0).notNull(), // 1 = auto-detected from shared Xero line
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type RevenueGroup = typeof revenueGroups.$inferSelect;
export type InsertRevenueGroup = typeof revenueGroups.$inferInsert;

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
  // Retail bundle classification
  // Identifies which component of the retail bundle this line item represents:
  // 'nbn' | '4g_sim' | 'hardware' | 'sip_channels' | 'support' | 'installation' | 'voice_usage' | null
  retailBundleComponent: varchar("retailBundleComponent", { length: 32 }).default(""),
  // ── Parsed attributes extracted from description via fuzzy/regex logic ──
  // Speed tier e.g. '50/20', '100/40', '25/10', '250/250'
  parsedSpeedTier: varchar("parsedSpeedTier", { length: 16 }).default(""),
  // Contract length in months: 12, 24, 36, 48, 0 = month-to-month
  parsedContractMonths: int("parsedContractMonths"),
  // Service billing period start date extracted from description (ISO string)
  parsedServiceStartDate: varchar("parsedServiceStartDate", { length: 32 }).default(""),
  // Service billing period end date extracted from description (ISO string)
  parsedServiceEndDate: varchar("parsedServiceEndDate", { length: 32 }).default(""),
  // AVC ID embedded in description e.g. 'AVC000146482523'
  parsedAvcId: varchar("parsedAvcId", { length: 32 }).default(""),
  // Hardware status: 'included' | 'byod' | 'rental' | 'one_time' | ''
  parsedHardwareStatus: varchar("parsedHardwareStatus", { length: 16 }).default(""),
  // Number of SIP channels extracted e.g. 4
  parsedSipChannels: int("parsedSipChannels"),
  // Data allowance: 'unlimited' | 'NNgb' e.g. '10gb', '1000gb'
  parsedDataAllowance: varchar("parsedDataAllowance", { length: 32 }).default(""),
  // Whether 4G backup is included in this line item (1 = yes, 0 = no)
  parsedHas4gBackup: boolean("parsedHas4gBackup").default(false),
  // Raw JSON blob of all extracted attributes for forward compatibility
  parsedAttributes: text("parsedAttributes"),
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

/**
 * Customer Proposals - new customer creation requests that require approval
 * before the customer record is created and services are assigned.
 */
export const customerProposals = mysqlTable("customer_proposals", {
  id: int("id").autoincrement().primaryKey(),
  // The proposed customer name
  proposedName: varchar("proposedName", { length: 512 }).notNull(),
  // Optional notes about why this customer is being proposed
  notes: text("notes"),
  // JSON array of service externalIds to assign upon approval e.g. ["SVC001","SVC002"]
  serviceExternalIds: text("serviceExternalIds").notNull(),
  // Source context: e.g. "SM Import", "Manual", "Unmatched Review"
  source: varchar("source", { length: 128 }),
  // Status lifecycle: pending → approved | rejected
  status: mysqlEnum("status", ["pending", "approved", "rejected"]).default("pending").notNull(),
  // Who submitted the proposal
  proposedBy: varchar("proposedBy", { length: 256 }).notNull(),
  // Review tracking
  reviewedBy: varchar("reviewedBy", { length: 256 }),
  reviewedAt: timestamp("reviewedAt"),
  rejectionReason: text("rejectionReason"),
  // If approved, the resulting customer externalId
  createdCustomerExternalId: varchar("createdCustomerExternalId", { length: 32 }),
  // Whether to create a Platform Check record on approval
  createPlatformCheck: int("createPlatformCheck").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type CustomerProposal = typeof customerProposals.$inferSelect;
export type InsertCustomerProposal = typeof customerProposals.$inferInsert;

/**
 * Service Cost History - audit trail for all cost changes to services.
 * Snapshots are taken before any cost override (e.g. Carbon API sync, invoice import).
 */
export const serviceCostHistory = mysqlTable("service_cost_history", {
  id: int("id").autoincrement().primaryKey(),
  serviceExternalId: varchar("serviceExternalId", { length: 32 }).notNull(),
  // The cost value at the time of snapshot
  monthlyCost: decimal("monthlyCost", { precision: 10, scale: 2 }).notNull(),
  // Where this cost came from: 'carbon_api' | 'supplier_invoice' | 'manual' | 'unknown'
  costSource: varchar("costSource", { length: 32 }).notNull(),
  // Why the snapshot was taken: 'carbon_sync' | 'invoice_import' | 'manual_edit'
  snapshotReason: varchar("snapshotReason", { length: 64 }).notNull(),
  // Who triggered the snapshot
  snapshotBy: varchar("snapshotBy", { length: 256 }).notNull(),
  // Optional notes
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type ServiceCostHistory = typeof serviceCostHistory.$inferSelect;
export type InsertServiceCostHistory = typeof serviceCostHistory.$inferInsert;

/**
 * Supplier Workbook Uploads - tracks XLSX workbook uploads from suppliers like SasBoss.
 * Each upload represents one month's dispatch charges workbook.
 */
export const supplierWorkbookUploads = mysqlTable("supplier_workbook_uploads", {
  id: int("id").autoincrement().primaryKey(),
  supplier: varchar("supplier", { length: 128 }).notNull(), // e.g. 'SasBoss'
  workbookName: varchar("workbookName", { length: 256 }).notNull(), // e.g. 'SasBoss Dispatch Charges (March)'
  billingMonth: varchar("billingMonth", { length: 16 }).notNull(), // e.g. '2026-03'
  invoiceReference: varchar("invoiceReference", { length: 128 }).default(""),
  totalExGst: decimal("totalExGst", { precision: 10, scale: 2 }).default("0.00").notNull(),
  totalIncGst: decimal("totalIncGst", { precision: 10, scale: 2 }).default("0.00").notNull(),
  lineItemCount: int("lineItemCount").default(0).notNull(),
  matchedCount: int("matchedCount").default(0).notNull(),
  unmatchedCount: int("unmatchedCount").default(0).notNull(),
  importedBy: varchar("importedBy", { length: 256 }).notNull(),
  importedAt: timestamp("importedAt").defaultNow().notNull(),
  status: varchar("status", { length: 32 }).default("complete").notNull(), // 'complete' | 'partial'
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type SupplierWorkbookUpload = typeof supplierWorkbookUploads.$inferSelect;
export type InsertSupplierWorkbookUpload = typeof supplierWorkbookUploads.$inferInsert;

/**
 * Supplier Workbook Line Items - individual line items from a supplier workbook upload.
 * Each row represents one product/service charge for one enterprise in the workbook.
 */
export const supplierWorkbookLineItems = mysqlTable("supplier_workbook_line_items", {
  id: int("id").autoincrement().primaryKey(),
  uploadId: int("uploadId").notNull(), // FK to supplierWorkbookUploads
  enterpriseName: varchar("enterpriseName", { length: 512 }).notNull(),
  productName: varchar("productName", { length: 512 }).notNull(),
  productType: varchar("productType", { length: 64 }).default(""),
  serviceRefId: varchar("serviceRefId", { length: 256 }).default(""),
  amountExGst: decimal("amountExGst", { precision: 10, scale: 2 }).default("0.00").notNull(),
  amountIncGst: decimal("amountIncGst", { precision: 10, scale: 2 }).default("0.00").notNull(),
  // Match results
  matchStatus: varchar("matchStatus", { length: 32 }).default("unmatched").notNull(), // 'matched' | 'unmatched' | 'partial'
  matchedCustomerExternalId: varchar("matchedCustomerExternalId", { length: 32 }).default(""),
  matchedCustomerName: varchar("matchedCustomerName", { length: 512 }).default(""),
  matchedServiceExternalId: varchar("matchedServiceExternalId", { length: 32 }).default(""),
  matchConfidence: decimal("matchConfidence", { precision: 4, scale: 2 }).default("0.00"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type SupplierWorkbookLineItem = typeof supplierWorkbookLineItems.$inferSelect;
export type InsertSupplierWorkbookLineItem = typeof supplierWorkbookLineItems.$inferInsert;

/**
 * Customer Usage Summaries - aggregated call/data usage per customer per month.
 * Populated from supplier workbook imports (e.g. SasBoss call usage from Sheet1).
 */
export const customerUsageSummaries = mysqlTable("customer_usage_summaries", {
  id: int("id").autoincrement().primaryKey(),
  uploadId: int("uploadId"), // FK to supplierWorkbookUploads (nullable for manual entries)
  customerExternalId: varchar("customerExternalId", { length: 32 }).notNull(),
  customerName: varchar("customerName", { length: 512 }).notNull(),
  usageMonth: varchar("usageMonth", { length: 16 }).notNull(), // e.g. '2026-02' (February usage)
  usageType: varchar("usageType", { length: 64 }).default("call-usage").notNull(), // 'call-usage' | 'data-usage'
  supplier: varchar("supplier", { length: 128 }).notNull(), // e.g. 'SasBoss'
  totalExGst: decimal("totalExGst", { precision: 10, scale: 2 }).default("0.00").notNull(),
  totalIncGst: decimal("totalIncGst", { precision: 10, scale: 2 }).default("0.00").notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type CustomerUsageSummary = typeof customerUsageSummaries.$inferSelect;
export type InsertCustomerUsageSummary = typeof customerUsageSummaries.$inferInsert;

/**
 * Supplier Enterprise Map - persistent mapping of supplier enterprise names to customers.
 * Once a match is confirmed (manually or auto), it is stored here so future uploads
 * skip fuzzy matching and auto-accept the match with 'mapped' confidence.
 */
export const supplierEnterpriseMap = mysqlTable("supplier_enterprise_map", {
  id: int("id").autoincrement().primaryKey(),
  supplierName: varchar("supplierName", { length: 128 }).notNull(), // e.g. 'SasBoss'
  enterpriseName: varchar("enterpriseName", { length: 512 }).notNull(), // exact string from workbook
  customerId: int("customerId").notNull(),
  customerExternalId: varchar("customerExternalId", { length: 32 }).notNull(),
  customerName: varchar("customerName", { length: 512 }).notNull(),
  confirmedBy: varchar("confirmedBy", { length: 64 }).default("auto").notNull(), // 'auto' | 'manual' | 'backfill'
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  uniqSupplierEnterprise: uniqueIndex("uniq_supplier_enterprise").on(table.supplierName, table.enterpriseName),
}));
export type SupplierEnterpriseMap = typeof supplierEnterpriseMap.$inferSelect;
export type InsertSupplierEnterpriseMap = typeof supplierEnterpriseMap.$inferInsert;

/**
 * Supplier Product Map - persistent mapping of supplier product names to internal service types.
 * Stores how each product name/type from a supplier workbook maps to our taxonomy.
 * Used to auto-classify products in future uploads without re-running fuzzy matching.
 */
export const supplierProductMap = mysqlTable("supplier_product_map", {
  id: int("id").autoincrement().primaryKey(),
  supplierName: varchar("supplierName", { length: 128 }).notNull(), // e.g. 'SasBoss'
  productName: varchar("productName", { length: 512 }).notNull(), // exact product name from workbook
  productType: varchar("productType", { length: 64 }).default("").notNull(), // product type from workbook
  internalServiceType: varchar("internalServiceType", { length: 64 }).default("Voice").notNull(), // 'Voice' | 'Data' | 'DID' | 'Other'
  billingLabel: varchar("billingLabel", { length: 256 }).default("").notNull(), // friendly label for UI
  notes: text("notes"), // any additional context
  confirmedBy: varchar("confirmedBy", { length: 64 }).default("auto").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type SupplierProductMap = typeof supplierProductMap.$inferSelect;
export type InsertSupplierProductMap = typeof supplierProductMap.$inferInsert;

/**
 * Service Billing Match Log - persistent log of service-to-billing-item resolutions.
 * When a user links a service to a billing item (or marks it as intentionally unbilled),
 * the resolution is stored here so future imports can auto-apply the same match.
 */
export const serviceBillingMatchLog = mysqlTable("service_billing_match_log", {
  id: int("id").autoincrement().primaryKey(),
  serviceExternalId: varchar("serviceExternalId", { length: 32 }).notNull(),
  serviceType: varchar("serviceType", { length: 64 }).notNull(),
  planName: varchar("planName", { length: 512 }).default(""),
  customerExternalId: varchar("customerExternalId", { length: 32 }).notNull(),
  customerName: varchar("customerName", { length: 512 }).notNull(),
  // Resolution outcome
  resolution: varchar("resolution", { length: 32 }).notNull(), // 'linked' | 'intentionally-unbilled' | 'new-billing-item'
  billingItemId: varchar("billingItemId", { length: 32 }).default(""), // the billing item linked (if resolution='linked')
  billingPlatform: varchar("billingPlatform", { length: 64 }).default(""), // which platform the billing item is on
  notes: text("notes"), // optional user note about the resolution
  resolvedBy: varchar("resolvedBy", { length: 256 }).notNull(),
  resolvedAt: timestamp("resolvedAt").defaultNow().notNull(),
  // For future auto-matching: key fields to identify the same service in future months
  matchKey: varchar("matchKey", { length: 512 }).default(""), // e.g. serviceExternalId or planName+customerExternalId
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ServiceBillingMatchLog = typeof serviceBillingMatchLog.$inferSelect;
export type InsertServiceBillingMatchLog = typeof serviceBillingMatchLog.$inferInsert;

/**
 * Service Billing Assignments - many-to-one junction between services and billing items.
 * Allows multiple supplier services to be grouped under a single Xero billing line item.
 * Revenue = billingItem.lineAmount; Cost = SUM(assigned services' monthlyCost).
 * Margin = Revenue - Cost.
 */
export const serviceBillingAssignments = mysqlTable("service_billing_assignments", {
  id: int("id").autoincrement().primaryKey(),
  billingItemExternalId: varchar("billingItemExternalId", { length: 32 }).notNull(),
  serviceExternalId: varchar("serviceExternalId", { length: 32 }).notNull(),
  customerExternalId: varchar("customerExternalId", { length: 32 }).notNull(),
  assignedBy: varchar("assignedBy", { length: 256 }).notNull(),
  assignmentMethod: varchar("assignmentMethod", { length: 32 }).default("manual").notNull(), // 'manual' | 'auto' | 'drag-drop'
  // Assignment bucket: standard | usage-holding | professional-services | hardware-sales | internal-cost
  assignmentBucket: varchar("assignmentBucket", { length: 64 }).default("standard").notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ServiceBillingAssignment = typeof serviceBillingAssignments.$inferSelect;
export type InsertServiceBillingAssignment = typeof serviceBillingAssignments.$inferInsert;

/**
 * Unbillable Services - services explicitly marked as not requiring a billing item.
 */
export const unbillableServices = mysqlTable("unbillable_services", {
  id: int("id").autoincrement().primaryKey(),
  serviceExternalId: varchar("serviceExternalId", { length: 32 }).notNull().unique(),
  customerExternalId: varchar("customerExternalId", { length: 32 }).notNull(),
  reason: varchar("reason", { length: 64 }).notNull(), // 'intentionally-unbilled' | 'internal-use' | 'bundled' | 'other'
  notes: text("notes"),
  markedBy: varchar("markedBy", { length: 256 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type UnbillableService = typeof unbillableServices.$inferSelect;
export type InsertUnbillableService = typeof unbillableServices.$inferInsert;

/**
 * Escalated Services - services that could not be matched to any Xero billing item
 * and have been escalated for manual review. Shown on the dashboard as a customer-level alert.
 */
export const escalatedServices = mysqlTable("escalated_services", {
  id: int("id").autoincrement().primaryKey(),
  serviceExternalId: varchar("serviceExternalId", { length: 32 }).notNull().unique(),
  customerExternalId: varchar("customerExternalId", { length: 32 }).notNull(),
  reason: varchar("reason", { length: 256 }).default("No matching Xero billing item found").notNull(),
  notes: text("notes"),
  escalatedBy: varchar("escalatedBy", { length: 256 }).notNull(),
  resolvedAt: timestamp("resolvedAt"),
  resolvedBy: varchar("resolvedBy", { length: 256 }),
  resolutionNotes: text("resolutionNotes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type EscalatedService = typeof escalatedServices.$inferSelect;
export type InsertEscalatedService = typeof escalatedServices.$inferInsert;

/**
 * Supplier Invoice Uploads - tracks PDF/file invoice uploads from suppliers like AAPT.
 * Each upload represents one month's invoice. Stores import metadata and match summary.
 */
export const supplierInvoiceUploads = mysqlTable("supplier_invoice_uploads", {
  id: int("id").autoincrement().primaryKey(),
  supplier: varchar("supplier", { length: 128 }).notNull(), // e.g. 'AAPT'
  invoiceNumber: varchar("invoiceNumber", { length: 128 }).notNull(),
  accountNumber: varchar("accountNumber", { length: 64 }).default(""),
  billingPeriod: varchar("billingPeriod", { length: 64 }).default(""),
  issueDate: varchar("issueDate", { length: 32 }).default(""),
  billingMonth: varchar("billingMonth", { length: 16 }).notNull(), // e.g. '2026-03'
  totalExGst: decimal("totalExGst", { precision: 10, scale: 2 }).default("0.00").notNull(),
  totalIncGst: decimal("totalIncGst", { precision: 10, scale: 2 }).default("0.00").notNull(),
  serviceCount: int("serviceCount").default(0).notNull(),
  matchedCount: int("matchedCount").default(0).notNull(),
  unmatchedCount: int("unmatchedCount").default(0).notNull(),
  autoMatchedCount: int("autoMatchedCount").default(0).notNull(), // matched via saved mapping rules
  newMappingsCreated: int("newMappingsCreated").default(0).notNull(),
  importedBy: varchar("importedBy", { length: 256 }).notNull(),
  importedAt: timestamp("importedAt").defaultNow().notNull(),
  status: varchar("status", { length: 32 }).default("complete").notNull(), // 'complete' | 'partial' | 'pending_review'
  notes: text("notes"),
  // S3 file storage for the original uploaded PDF/CSV
  fileUrl: text("fileUrl"),           // public S3 URL for download
  fileKey: varchar("fileKey", { length: 512 }), // S3 object key (for deletion)
  fileName: varchar("fileName", { length: 256 }), // original filename
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type SupplierInvoiceUpload = typeof supplierInvoiceUploads.$inferSelect;
export type InsertSupplierInvoiceUpload = typeof supplierInvoiceUploads.$inferInsert;

/**
 * Supplier Service Map - persistent mapping of supplier service identifiers to customers/services.
 * The core repeatable mapping layer: once a supplier service ID or address is matched,
 * future invoice uploads auto-apply the same mapping without requiring manual review.
 *
 * Match keys (in priority order):
 *   1. aaptServiceId (exact) - most reliable, service-level
 *   2. aaptAccessId / avcId (exact) - reliable for AAPT/NBN
 *   3. address (normalised) - reliable for FAST Fibre services
 *   4. yourId label (fuzzy) - useful hint but not definitive
 */
export const supplierServiceMap = mysqlTable("supplier_service_map", {
  id: int("id").autoincrement().primaryKey(),
  supplierName: varchar("supplierName", { length: 128 }).notNull(), // e.g. 'AAPT'
  // The supplier-side identifier (the match key)
  matchKeyType: varchar("matchKeyType", { length: 32 }).notNull(), // 'service_id' | 'access_id' | 'address' | 'your_id'
  matchKeyValue: varchar("matchKeyValue", { length: 512 }).notNull(), // the actual key value
  // Optional secondary context stored for display/debugging
  productType: varchar("productType", { length: 128 }).default(""),
  description: text("description"),
  // The customer this maps to
  customerExternalId: varchar("customerExternalId", { length: 32 }).notNull(),
  customerName: varchar("customerName", { length: 512 }).notNull(),
  // Optionally, the specific service record this maps to
  serviceExternalId: varchar("serviceExternalId", { length: 32 }).default(""),
  // How this mapping was established
  confirmedBy: varchar("confirmedBy", { length: 64 }).default("manual").notNull(), // 'manual' | 'auto' | 'address_match' | 'avc_match' | 'fuzzy'
  confidence: decimal("confidence", { precision: 4, scale: 2 }).default("1.00").notNull(), // 0.00-1.00
  // Usage tracking
  lastUsedAt: timestamp("lastUsedAt"),
  useCount: int("useCount").default(0).notNull(),
  // Lifecycle
  isActive: int("isActive").default(1).notNull(), // 1=active, 0=disabled
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  uniqSupplierMatchKey: uniqueIndex("uniq_supplier_match_key").on(table.supplierName, table.matchKeyType, table.matchKeyValue),
}));
export type SupplierServiceMap = typeof supplierServiceMap.$inferSelect;
export type InsertSupplierServiceMap = typeof supplierServiceMap.$inferInsert;

/**
 * Supplier Registry - master list of all suppliers with ranking, metadata, and upload config.
 * Controls how each supplier appears in the UI and what upload formats are supported.
 */
export const supplierRegistry = mysqlTable("supplier_registry", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull().unique(), // e.g. 'AAPT'
  displayName: varchar("displayName", { length: 256 }).notNull(), // e.g. 'AAPT (TPG Telecom)'
  category: varchar("category", { length: 64 }).default("Telecom").notNull(), // 'Telecom' | 'ISP' | 'Cloud' | 'Other'
  rank: int("rank").default(99).notNull(), // lower = higher priority in UI
  logoUrl: varchar("logoUrl", { length: 512 }).default(""),
  abn: varchar("abn", { length: 32 }).default(""),
  supportPhone: varchar("supportPhone", { length: 64 }).default(""),
  supportEmail: varchar("supportEmail", { length: 320 }).default(""),
  uploadFormats: varchar("uploadFormats", { length: 256 }).default(""), // e.g. 'pdf,xlsx'
  uploadInstructions: text("uploadInstructions"),
  isActive: int("isActive").default(1).notNull(),
  totalServices: int("totalServices").default(0).notNull(),
  totalMonthlyCost: decimal("totalMonthlyCost", { precision: 12, scale: 2 }).default("0.00").notNull(),
  lastInvoiceDate: varchar("lastInvoiceDate", { length: 32 }).default(""),
  lastInvoiceNumber: varchar("lastInvoiceNumber", { length: 128 }).default(""),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type SupplierRegistry = typeof supplierRegistry.$inferSelect;
export type InsertSupplierRegistry = typeof supplierRegistry.$inferInsert;

/**
 * Supplier Product Cost Map - stores the wholesale cost for each supplier product.
 * Used to correctly set monthlyCost on services when importing supplier invoices.
 * Diamond tier pricing from Access4 pricebook is the default for SasBoss products.
 * Xero per-customer overrides take precedence when available.
 */
export const supplierProductCostMap = mysqlTable("supplier_product_cost_map", {
  id: int("id").autoincrement().primaryKey(),
  supplier: varchar("supplier", { length: 128 }).notNull(), // e.g. 'SasBoss'
  productName: varchar("productName", { length: 512 }).notNull(), // exact product name from invoice
  productCategory: varchar("productCategory", { length: 128 }).default(""), // e.g. 'UCaaS Licensing'
  unit: varchar("unit", { length: 64 }).default("Per Month"), // e.g. 'Per Month', 'Per Minute'
  rrp: decimal("rrp", { precision: 10, scale: 5 }).default("0.00000"), // RRP from pricebook
  wholesaleCost: decimal("wholesaleCost", { precision: 10, scale: 5 }).notNull(), // Diamond tier cost
  defaultRetailPrice: decimal("defaultRetailPrice", { precision: 10, scale: 5 }).default("0.00000"), // suggested retail
  notes: text("notes"), // e.g. 'Free when attached to Executive User'
  isActive: int("isActive").default(1).notNull(),
  source: varchar("source", { length: 128 }).default("Access4 Diamond Pricebook v3.4"), // where this came from
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type SupplierProductCostMap = typeof supplierProductCostMap.$inferSelect;
export type InsertSupplierProductCostMap = typeof supplierProductCostMap.$inferInsert;

/**
 * Carbon API Cache - stores the last successful full fetch from the ABB Carbon API.
 * A single row per fetch run (keyed by cacheKey = 'all_services') holds the raw JSON
 * payload and metadata so the live API is only called when the cache is stale.
 * Default TTL is 6 hours. The sync procedure checks fetchedAt + ttlHours before
 * deciding whether to call the live API or return cached data.
 */
export const carbonApiCache = mysqlTable("carbon_api_cache", {
  id: int("id").autoincrement().primaryKey(),
  cacheKey: varchar("cacheKey", { length: 64 }).notNull().unique(), // e.g. 'all_services'
  totalServices: int("totalServices").default(0).notNull(),
  rawJson: mediumtext("rawJson").notNull(), // full JSON array of all Carbon service objects
  fetchedAt: timestamp("fetchedAt").defaultNow().notNull(),
  ttlHours: int("ttlHours").default(6).notNull(), // cache lifetime in hours
  lastSyncedServicesCount: int("lastSyncedServicesCount").default(0).notNull(), // how many DB rows were updated
  lastSyncedAt: timestamp("lastSyncedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type CarbonApiCache = typeof carbonApiCache.$inferSelect;
export type InsertCarbonApiCache = typeof carbonApiCache.$inferInsert;

/**
 * Supplier Sync Log - audit trail for all automated supplier API/FTP sync runs.
 * One row per sync attempt, recording outcome, counts, and any error messages.
 * Used by the Supplier Integrations UI to show last-run status and history.
 */
export const supplierSyncLog = mysqlTable("supplier_sync_log", {
  id: int("id").autoincrement().primaryKey(),
  // Which integration: 'vocus_api' | 'aapt_cdr_ftp' | 'aapt_frontier_api' | 'carbon_api'
  integration: varchar("integration", { length: 64 }).notNull(),
  // 'success' | 'error' | 'partial' | 'running'
  status: varchar("status", { length: 32 }).notNull().default("running"),
  // Human-readable summary
  summary: text("summary"),
  // Counts
  servicesFound: int("servicesFound").default(0).notNull(),
  servicesCreated: int("servicesCreated").default(0).notNull(),
  servicesUpdated: int("servicesUpdated").default(0).notNull(),
  recordsProcessed: int("recordsProcessed").default(0).notNull(),
  // Error details
  errorMessage: text("errorMessage"),
  // Duration in milliseconds
  durationMs: int("durationMs"),
  // Triggered by: 'scheduled' | 'manual' | 'system'
  triggeredBy: varchar("triggeredBy", { length: 64 }).default("scheduled").notNull(),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type SupplierSyncLog = typeof supplierSyncLog.$inferSelect;
export type InsertSupplierSyncLog = typeof supplierSyncLog.$inferInsert;

/**
 * Service Outages - stores outage events fetched from the ABB Carbon API.
 * Polled every 15 minutes for all ABB services. One row per unique outage event
 * per service. Resolved outages are kept for historical reporting.
 */
export const serviceOutages = mysqlTable("service_outages", {
  id: int("id").autoincrement().primaryKey(),
  serviceExternalId: varchar("serviceExternalId", { length: 64 }).notNull(),
  carbonServiceId: varchar("carbonServiceId", { length: 64 }),
  customerExternalId: varchar("customerExternalId", { length: 64 }),
  outageType: varchar("outageType", { length: 64 }).notNull(),
  outageId: varchar("outageId", { length: 128 }),
  title: varchar("title", { length: 512 }),
  description: text("description"),
  status: varchar("status", { length: 64 }).default("active").notNull(),
  severity: varchar("severity", { length: 32 }),
  startTime: timestamp("startTime"),
  endTime: timestamp("endTime"),
  estimatedResolution: timestamp("estimatedResolution"),
  rawJson: text("rawJson"),
  firstSeenAt: timestamp("firstSeenAt").defaultNow().notNull(),
  lastSeenAt: timestamp("lastSeenAt").defaultNow().notNull(),
  resolvedAt: timestamp("resolvedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ServiceOutage = typeof serviceOutages.$inferSelect;
export type InsertServiceOutage = typeof serviceOutages.$inferInsert;

/**
 * Service Usage Snapshots - daily data usage records from the ABB Carbon API.
 * One row per service per billing period. Updated nightly.
 */
export const serviceUsageSnapshots = mysqlTable("service_usage_snapshots", {
  id: int("id").autoincrement().primaryKey(),
  serviceExternalId: varchar("serviceExternalId", { length: 64 }).notNull(),
  carbonServiceId: varchar("carbonServiceId", { length: 64 }),
  customerExternalId: varchar("customerExternalId", { length: 64 }),
  billingPeriod: varchar("billingPeriod", { length: 16 }).notNull(),
  downloadGb: decimal("downloadGb", { precision: 10, scale: 3 }).default("0"),
  uploadGb: decimal("uploadGb", { precision: 10, scale: 3 }).default("0"),
  totalGb: decimal("totalGb", { precision: 10, scale: 3 }).default("0"),
  daysTotal: int("daysTotal"),
  daysRemaining: int("daysRemaining"),
  nationalMinutes: decimal("nationalMinutes", { precision: 10, scale: 2 }),
  mobileMinutes: decimal("mobileMinutes", { precision: 10, scale: 2 }),
  internationalMinutes: decimal("internationalMinutes", { precision: 10, scale: 2 }),
  smsCount: int("smsCount"),
  rawJson: text("rawJson"),
  fetchedAt: timestamp("fetchedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ServiceUsageSnapshot = typeof serviceUsageSnapshots.$inferSelect;
export type InsertServiceUsageSnapshot = typeof serviceUsageSnapshots.$inferInsert;

/**
 * Carbon Diagnostic Runs - logs each remote diagnostic job triggered from the UI.
 * Supports port reset, loopback test, and stability profile change operations.
 * One row per diagnostic run. Status transitions: queued → running → completed | failed.
 */
export const carbonDiagnosticRuns = mysqlTable("carbon_diagnostic_runs", {
  id: int("id").autoincrement().primaryKey(),
  serviceExternalId: varchar("serviceExternalId", { length: 64 }).notNull(),
  carbonServiceId: varchar("carbonServiceId", { length: 64 }).notNull(),
  customerExternalId: varchar("customerExternalId", { length: 64 }),
  // Diagnostic type: 'port_reset' | 'loopback_test' | 'stability_profile'
  diagnosticType: varchar("diagnosticType", { length: 64 }).notNull(),
  // For stability_profile: the profile name being applied
  profileName: varchar("profileName", { length: 128 }),
  // 'queued' | 'running' | 'completed' | 'failed'
  status: varchar("status", { length: 32 }).default("queued").notNull(),
  // Raw JSON response from Carbon API
  resultJson: mediumtext("resultJson"),
  // Human-readable summary of the result
  resultSummary: text("resultSummary"),
  // Error message if failed
  errorMessage: text("errorMessage"),
  // Who triggered the diagnostic
  triggeredBy: varchar("triggeredBy", { length: 256 }).notNull(),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
  durationMs: int("durationMs"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type CarbonDiagnosticRun = typeof carbonDiagnosticRuns.$inferSelect;
export type InsertCarbonDiagnosticRun = typeof carbonDiagnosticRuns.$inferInsert;

/**
 * Usage Threshold Alerts - tracks when a service's data usage exceeds a threshold
 * (default 80% of plan allowance). One row per service per billing period per threshold level.
 * Prevents duplicate notifications for the same period.
 */
export const usageThresholdAlerts = mysqlTable("usage_threshold_alerts", {
  id: int("id").autoincrement().primaryKey(),
  serviceExternalId: varchar("serviceExternalId", { length: 64 }).notNull(),
  carbonServiceId: varchar("carbonServiceId", { length: 64 }),
  customerExternalId: varchar("customerExternalId", { length: 64 }),
  billingPeriod: varchar("billingPeriod", { length: 16 }).notNull(), // e.g. '2026-03'
  // Threshold percentage that was breached (e.g. 80, 90, 100)
  thresholdPercent: int("thresholdPercent").notNull(),
  // Usage at time of alert
  usedGb: decimal("usedGb", { precision: 10, scale: 3 }).notNull(),
  planGb: decimal("planGb", { precision: 10, scale: 3 }),
  usagePercent: decimal("usagePercent", { precision: 6, scale: 2 }).notNull(),
  // 'active' | 'acknowledged' | 'resolved'
  status: varchar("status", { length: 32 }).default("active").notNull(),
  // Whether an owner notification was sent
  notificationSent: int("notificationSent").default(0).notNull(),
  notificationSentAt: timestamp("notificationSentAt"),
  acknowledgedBy: varchar("acknowledgedBy", { length: 256 }),
  acknowledgedAt: timestamp("acknowledgedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type UsageThresholdAlert = typeof usageThresholdAlerts.$inferSelect;
export type InsertUsageThresholdAlert = typeof usageThresholdAlerts.$inferInsert;


/**
 * Omada Sites - maps TP-Link Omada Cloud-Based Controller sites to SmileTel customers.
 * One row per Omada site. Auto-matched by site name similarity to customer name.
 * Stores cached site status data (WAN, health, device/client counts) refreshed on demand.
 */
export const omadaSites = mysqlTable("omada_sites", {
  id: int("id").autoincrement().primaryKey(),
  // Omada controller site ID (from the CBC API)
  omadaSiteId: varchar("omadaSiteId", { length: 128 }).notNull().unique(),
  omadaSiteName: varchar("omadaSiteName", { length: 512 }).notNull(),
  // Linked SmileTel customer
  customerExternalId: varchar("customerExternalId", { length: 64 }),
  // Match confidence: 'auto' (name-matched) | 'manual' (support team assigned) | 'unmatched'
  matchType: varchar("matchType", { length: 32 }).default("unmatched").notNull(),
  matchConfidence: decimal("matchConfidence", { precision: 5, scale: 2 }),
  // Cached site status (refreshed on demand)
  siteRegion: varchar("siteRegion", { length: 128 }),
  siteScenario: varchar("siteScenario", { length: 64 }), // 'office' | 'hotel' | 'mall' etc
  // WAN status
  wanIp: varchar("wanIp", { length: 64 }),
  wanStatus: varchar("wanStatus", { length: 32 }), // 'connected' | 'disconnected'
  wanUptimeSeconds: int("wanUptimeSeconds"),
  // Counts
  deviceCount: int("deviceCount").default(0),
  apCount: int("apCount").default(0),
  switchCount: int("switchCount").default(0),
  gatewayCount: int("gatewayCount").default(0),
  clientCount: int("clientCount").default(0),
  // Health score 0-100
  healthScore: int("healthScore"),
  healthStatus: varchar("healthStatus", { length: 32 }), // 'good' | 'warning' | 'bad'
  // Alert counts
  alertCount: int("alertCount").default(0),
  // Raw JSON snapshot from last sync
  rawJson: mediumtext("rawJson"),
  lastSyncedAt: timestamp("lastSyncedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type OmadaSite = typeof omadaSites.$inferSelect;
export type InsertOmadaSite = typeof omadaSites.$inferInsert;

/**
 * Omada Device Cache - stores per-device status snapshots for Omada-managed devices.
 * Linked to SmileTel services where applicable (e.g. gateway = NBN service, AP = WiFi service).
 */
export const omadaDeviceCache = mysqlTable("omada_device_cache", {
  id: int("id").autoincrement().primaryKey(),
  // Omada identifiers
  omadaSiteId: varchar("omadaSiteId", { length: 128 }).notNull(),
  omadaDeviceId: varchar("omadaDeviceId", { length: 128 }).notNull(),
  macAddress: varchar("macAddress", { length: 32 }).notNull(),
  // Device info
  deviceName: varchar("deviceName", { length: 256 }),
  deviceType: varchar("deviceType", { length: 64 }), // 'gateway' | 'ap' | 'switch'
  deviceModel: varchar("deviceModel", { length: 128 }),
  firmwareVersion: varchar("firmwareVersion", { length: 64 }),
  // Status
  status: varchar("status", { length: 32 }), // 'connected' | 'disconnected' | 'isolated'
  uptimeSeconds: int("uptimeSeconds"),
  cpuPercent: int("cpuPercent"),
  memPercent: int("memPercent"),
  // WAN info (gateways only)
  wanIp: varchar("wanIp", { length: 64 }),
  wanStatus: varchar("wanStatus", { length: 32 }),
  // Linked SmileTel service
  serviceExternalId: varchar("serviceExternalId", { length: 64 }),
  // Raw JSON snapshot
  rawJson: mediumtext("rawJson"),
  lastSyncedAt: timestamp("lastSyncedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  uniqueDevice: uniqueIndex("omada_device_unique").on(t.omadaSiteId, t.omadaDeviceId),
}));
export type OmadaDeviceCache = typeof omadaDeviceCache.$inferSelect;
export type InsertOmadaDeviceCache = typeof omadaDeviceCache.$inferInsert;

/**
 * Supplier Rate Cards - stores wholesale rate cards from suppliers (e.g. Vocus Mobile).
 * One record per rate card version per supplier.
 */
export const supplierRateCards = mysqlTable("supplierRateCards", {
  id: int("id").autoincrement().primaryKey(),
  supplier: varchar("supplier", { length: 64 }).notNull(), // e.g. 'vocus'
  rateCardName: varchar("rateCardName", { length: 256 }).notNull(),
  effectiveDate: varchar("effectiveDate", { length: 16 }).notNull(), // ISO date string YYYY-MM-DD
  currency: varchar("currency", { length: 8 }).default("AUD").notNull(),
  taxStatus: varchar("taxStatus", { length: 16 }).default("excl_gst").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type SupplierRateCard = typeof supplierRateCards.$inferSelect;
export type InsertSupplierRateCard = typeof supplierRateCards.$inferInsert;

/**
 * Supplier Rate Card Items - individual rate line items within a rate card.
 * Covers both bucket plans and per-unit rates.
 */
export const supplierRateCardItems = mysqlTable("supplierRateCardItems", {
  id: int("id").autoincrement().primaryKey(),
  rateCardId: int("rateCardId").notNull(),
  category: varchar("category", { length: 64 }).notNull(), // e.g. 'mobile_data_paygd', 'mobile_voice_bucket'
  categoryLabel: varchar("categoryLabel", { length: 256 }),
  planName: varchar("planName", { length: 256 }),           // e.g. 'Mobile Data 100'
  itemType: varchar("itemType", { length: 32 }).notNull(),  // 'bucket' | 'per_unit' | 'misc' | 'roaming'
  // Pricing
  priceExGst: decimal("priceExGst", { precision: 12, scale: 4 }),
  unit: varchar("unit", { length: 64 }),                    // 'per_gb' | 'per_minute' | 'per_sms' | 'per_sim_per_month'
  // Bucket inclusions
  inclusionGB: decimal("inclusionGB", { precision: 12, scale: 3 }),
  inclusionMinutes: int("inclusionMinutes"),
  inclusionSMS: int("inclusionSMS"),
  // Overage rates
  overageRatePerGB: decimal("overageRatePerGB", { precision: 10, scale: 6 }),
  overageRatePerMinute: decimal("overageRatePerMinute", { precision: 10, scale: 6 }),
  overageRatePerSMS: decimal("overageRatePerSMS", { precision: 10, scale: 6 }),
  // Monthly access fee (e.g. $12.50/SIM for PAYGD)
  monthlyAccessFee: decimal("monthlyAccessFee", { precision: 10, scale: 4 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type SupplierRateCardItem = typeof supplierRateCardItems.$inferSelect;
export type InsertSupplierRateCardItem = typeof supplierRateCardItems.$inferInsert;

// =============================================================================
// TIAB / Octane (Inabox) API Integration Tables
// =============================================================================

/**
 * TIAB Customers - mirror of Octane customer records.
 * Linked to internal customers via tiabCustomerId on the customers table or via
 * the tiabCustomerLinks join table.
 */
export const tiabCustomers = mysqlTable("tiab_customers", {
  id: int("id").autoincrement().primaryKey(),
  tiabCustomerId: varchar("tiabCustomerId", { length: 64 }).notNull().unique(),
  companyName: varchar("companyName", { length: 512 }),
  firstName: varchar("firstName", { length: 256 }),
  lastName: varchar("lastName", { length: 256 }),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 64 }),
  mobile: varchar("mobile", { length: 64 }),
  abn: varchar("abn", { length: 32 }),
  address: varchar("address", { length: 512 }),
  suburb: varchar("suburb", { length: 128 }),
  state: varchar("state", { length: 16 }),
  postcode: varchar("postcode", { length: 16 }),
  status: varchar("status", { length: 32 }),
  // Link to internal customer
  internalCustomerExternalId: varchar("internalCustomerExternalId", { length: 32 }),
  matchConfidence: decimal("matchConfidence", { precision: 4, scale: 2 }),
  matchType: varchar("matchType", { length: 64 }), // 'exact_name' | 'fuzzy_name' | 'abn' | 'manual'
  rawJson: mediumtext("rawJson"),
  lastSyncedAt: timestamp("lastSyncedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type TiabCustomerRecord = typeof tiabCustomers.$inferSelect;
export type InsertTiabCustomerRecord = typeof tiabCustomers.$inferInsert;

/**
 * TIAB Services - mirror of Octane service instances.
 * Each row represents one mobile/4G/5G service in Octane.
 */
export const tiabServices = mysqlTable("tiab_services", {
  id: int("id").autoincrement().primaryKey(),
  tiabServiceId: varchar("tiabServiceId", { length: 64 }).notNull().unique(),
  tiabCustomerId: varchar("tiabCustomerId", { length: 64 }).notNull(),
  planId: varchar("planId", { length: 64 }),
  planName: varchar("planName", { length: 256 }),
  status: varchar("status", { length: 32 }), // Active | Suspended | Ceased
  serviceType: varchar("serviceType", { length: 64 }), // mobile | 4g_fixed | data_only | m2m
  msisdn: varchar("msisdn", { length: 32 }),
  simSerial: varchar("simSerial", { length: 64 }),
  imei: varchar("imei", { length: 32 }),
  activationDate: varchar("activationDate", { length: 32 }),
  suspensionDate: varchar("suspensionDate", { length: 32 }),
  cessationDate: varchar("cessationDate", { length: 32 }),
  dataPoolId: varchar("dataPoolId", { length: 64 }),
  // Link to internal service
  internalServiceExternalId: varchar("internalServiceExternalId", { length: 32 }),
  // Reconciliation fields
  reconStatus: varchar("reconStatus", { length: 32 }).default("pending"), // pending | matched | variance | auto_remediated | manual_review
  reconNotes: text("reconNotes"),
  rawJson: mediumtext("rawJson"),
  lastSyncedAt: timestamp("lastSyncedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type TiabServiceRecord = typeof tiabServices.$inferSelect;
export type InsertTiabServiceRecord = typeof tiabServices.$inferInsert;

/**
 * TIAB Plans - mirror of Octane plan definitions.
 */
export const tiabPlans = mysqlTable("tiab_plans", {
  id: int("id").autoincrement().primaryKey(),
  tiabPlanId: varchar("tiabPlanId", { length: 64 }).notNull().unique(),
  planName: varchar("planName", { length: 256 }).notNull(),
  planType: varchar("planType", { length: 64 }), // mobile_voice | data_only | m2m | 4g_fixed | bundle
  description: text("description"),
  baseCharge: decimal("baseCharge", { precision: 10, scale: 4 }),
  dataAllowanceGb: decimal("dataAllowanceGb", { precision: 10, scale: 3 }),
  voiceAllowanceMinutes: int("voiceAllowanceMinutes"),
  smsAllowance: int("smsAllowance"),
  contractTermMonths: int("contractTermMonths"),
  status: varchar("status", { length: 32 }),
  rawJson: mediumtext("rawJson"),
  lastSyncedAt: timestamp("lastSyncedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type TiabPlanRecord = typeof tiabPlans.$inferSelect;
export type InsertTiabPlanRecord = typeof tiabPlans.$inferInsert;

/**
 * TIAB Transactions - mirror of Octane billing transactions.
 * Bills, adjustments, payments, credits per service per billing cycle.
 */
export const tiabTransactions = mysqlTable("tiab_transactions", {
  id: int("id").autoincrement().primaryKey(),
  tiabTransactionId: varchar("tiabTransactionId", { length: 64 }).notNull().unique(),
  tiabCustomerId: varchar("tiabCustomerId", { length: 64 }).notNull(),
  tiabServiceId: varchar("tiabServiceId", { length: 64 }),
  transactionType: varchar("transactionType", { length: 64 }), // bill | payment | adjustment | credit
  amount: decimal("amount", { precision: 12, scale: 4 }),
  gst: decimal("gst", { precision: 12, scale: 4 }),
  description: text("description"),
  transactionDate: varchar("transactionDate", { length: 32 }),
  billingPeriodStart: varchar("billingPeriodStart", { length: 32 }),
  billingPeriodEnd: varchar("billingPeriodEnd", { length: 32 }),
  status: varchar("status", { length: 32 }),
  rawJson: mediumtext("rawJson"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type TiabTransactionRecord = typeof tiabTransactions.$inferSelect;
export type InsertTiabTransactionRecord = typeof tiabTransactions.$inferInsert;

/**
 * TIAB Data Pools - snapshots of Octane data pool states.
 * Snapshotted daily for reconciliation history.
 */
export const tiabDataPools = mysqlTable("tiab_data_pools", {
  id: int("id").autoincrement().primaryKey(),
  tiabPoolId: varchar("tiabPoolId", { length: 64 }).notNull(),
  tiabCustomerId: varchar("tiabCustomerId", { length: 64 }),
  poolName: varchar("poolName", { length: 256 }),
  totalCapacityGb: decimal("totalCapacityGb", { precision: 10, scale: 3 }),
  usedGb: decimal("usedGb", { precision: 10, scale: 3 }),
  remainingGb: decimal("remainingGb", { precision: 10, scale: 3 }),
  memberCount: int("memberCount"),
  membersJson: text("membersJson"), // JSON array of { serviceId, msisdn }
  snapshotDate: varchar("snapshotDate", { length: 16 }).notNull(), // YYYY-MM-DD
  rawJson: mediumtext("rawJson"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type TiabDataPoolRecord = typeof tiabDataPools.$inferSelect;
export type InsertTiabDataPoolRecord = typeof tiabDataPools.$inferInsert;

/**
 * TIAB Sync Log - records each sync run with status and stats.
 */
export const tiabSyncLog = mysqlTable("tiab_sync_log", {
  id: int("id").autoincrement().primaryKey(),
  syncType: varchar("syncType", { length: 64 }).notNull(), // customers | services | plans | transactions | data_pools | full
  status: varchar("status", { length: 32 }).default("running").notNull(), // running | completed | failed
  recordsFetched: int("recordsFetched").default(0),
  recordsCreated: int("recordsCreated").default(0),
  recordsUpdated: int("recordsUpdated").default(0),
  recordsErrored: int("recordsErrored").default(0),
  errorMessage: text("errorMessage"),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
  durationMs: int("durationMs"),
  triggeredBy: varchar("triggeredBy", { length: 64 }).default("system"), // system | manual | cron
});
export type TiabSyncLogRecord = typeof tiabSyncLog.$inferSelect;
export type InsertTiabSyncLogRecord = typeof tiabSyncLog.$inferInsert;

/**
 * TIAB Reconciliation Issues - exceptions found during reconciliation runs.
 * One row per issue per service per billing cycle.
 */
export const tiabReconIssues = mysqlTable("tiab_recon_issues", {
  id: int("id").autoincrement().primaryKey(),
  tiabServiceId: varchar("tiabServiceId", { length: 64 }),
  tiabCustomerId: varchar("tiabCustomerId", { length: 64 }),
  internalServiceExternalId: varchar("internalServiceExternalId", { length: 32 }),
  internalCustomerExternalId: varchar("internalCustomerExternalId", { length: 32 }),
  billingPeriod: varchar("billingPeriod", { length: 16 }), // YYYY-MM
  issueType: varchar("issueType", { length: 64 }).notNull(),
  // Types: missing_service | wrong_pool | incorrect_data_limit | sim_state_mismatch |
  //        charge_variance | missing_transaction | esim_mismatch | notification_gap
  severity: varchar("severity", { length: 16 }).default("medium"), // low | medium | high | critical
  description: text("description"),
  expectedValue: varchar("expectedValue", { length: 256 }),
  actualValue: varchar("actualValue", { length: 256 }),
  varianceAmount: decimal("varianceAmount", { precision: 12, scale: 4 }),
  // Resolution
  status: varchar("status", { length: 32 }).default("open"), // open | auto_remediated | manually_resolved | dismissed
  resolutionNotes: text("resolutionNotes"),
  resolvedAt: timestamp("resolvedAt"),
  resolvedBy: varchar("resolvedBy", { length: 256 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type TiabReconIssueRecord = typeof tiabReconIssues.$inferSelect;
export type InsertTiabReconIssueRecord = typeof tiabReconIssues.$inferInsert;

// =============================================================================
// Vocus Wholesale Portal — Mobile SIM & NBN Service Tables
// =============================================================================

/**
 * Vocus Mobile Services — mirror of all Standard Mobile and 4G Backup SIM records
 * extracted from the Vocus Wholesale Members Portal.
 * serviceScope: 'STANDARD-POSTPAID' | 'DATA-HOSTED' (4G Backup)
 */
export const vocusMobileServices = mysqlTable("vocus_mobile_services", {
  id: int("id").autoincrement().primaryKey(),
  // Vocus identifiers
  vocusServiceId: varchar("vocusServiceId", { length: 128 }).notNull().unique(),
  serviceScope: varchar("serviceScope", { length: 32 }).notNull(), // STANDARD-POSTPAID | DATA-HOSTED
  serviceStatus: varchar("serviceStatus", { length: 32 }), // active | inactive | suspended
  planId: varchar("planId", { length: 128 }),
  realm: varchar("realm", { length: 128 }), // e.g. mobile.smileit.com | data.smileit.com
  // SIM details
  sim: varchar("sim", { length: 64 }), // SIM serial number (ICCID)
  simType: varchar("simType", { length: 16 }), // PHYSICAL | ESIM
  msn: varchar("msn", { length: 32 }), // Mobile Service Number (phone number)
  puk: varchar("puk", { length: 16 }), // Personal Unlock Code
  // Customer / service details
  customerName: varchar("customerName", { length: 512 }),
  anniversaryDay: int("anniversaryDay"),
  bucketId: varchar("bucketId", { length: 128 }), // quota bucket this SIM belongs to
  label: varchar("label", { length: 256 }), // custom label / description
  locationReference: varchar("locationReference", { length: 128 }), // postcode or state
  // Features (STANDARD-POSTPAID only)
  voiceBarring: varchar("voiceBarring", { length: 32 }),
  roaming: varchar("roaming", { length: 32 }),
  gprs: boolean("gprs"),
  smsIn: boolean("smsIn"),
  smsOut: boolean("smsOut"),
  voiceDivertAlways: varchar("voiceDivertAlways", { length: 32 }),
  voiceDivertBusy: varchar("voiceDivertBusy", { length: 32 }),
  voiceDivertNoAnswer: varchar("voiceDivertNoAnswer", { length: 32 }),
  voiceDivertUnreachable: varchar("voiceDivertUnreachable", { length: 32 }),
  // Port-in details
  orderType: varchar("orderType", { length: 32 }), // NEW | PORTIN-PREPAID | PORTIN-POSTPAID
  portOutReference: varchar("portOutReference", { length: 128 }),
  // Billing
  billingProviderId: varchar("billingProviderId", { length: 128 }),
  // Activation date extracted from portal
  activationDate: varchar("activationDate", { length: 32 }),
  // Link to internal services table
  internalServiceExternalId: varchar("internalServiceExternalId", { length: 32 }),
  internalCustomerExternalId: varchar("internalCustomerExternalId", { length: 32 }),
  matchType: varchar("matchType", { length: 32 }), // 'msn' | 'sim' | 'manual' | 'unmatched'
  matchConfidence: decimal("matchConfidence", { precision: 4, scale: 2 }),
  // Wholesale monthly cost for this plan (ex GST) — set manually from pricebook or portal
  planCost: decimal("planCost", { precision: 10, scale: 2 }),
  // Raw JSON from portal page
  rawJson: mediumtext("rawJson"),
  lastSyncedAt: timestamp("lastSyncedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type VocusMobileService = typeof vocusMobileServices.$inferSelect;
export type InsertVocusMobileService = typeof vocusMobileServices.$inferInsert;

/**
 * Vocus NBN Services — mirror of all NBN service records from the Vocus portal.
 * Covers wba.rvcict.com.au realm (Wholesale Broadband Agreement).
 */
export const vocusNbnServices = mysqlTable("vocus_nbn_services", {
  id: int("id").autoincrement().primaryKey(),
  // Vocus identifiers
  vocusServiceId: varchar("vocusServiceId", { length: 128 }).notNull().unique(),
  serviceStatus: varchar("serviceStatus", { length: 32 }), // active | inactive | suspended
  planId: varchar("planId", { length: 128 }),
  realm: varchar("realm", { length: 128 }), // e.g. wba.rvcict.com.au
  // Service details
  username: varchar("username", { length: 256 }), // NBN username / service identifier
  avcId: varchar("avcId", { length: 128 }), // Access Virtual Circuit ID
  locId: varchar("locId", { length: 128 }), // NBN Location ID
  technology: varchar("technology", { length: 64 }), // FTTP | FTTN | FTTC | HFC | FTTB | FW
  speedTier: varchar("speedTier", { length: 64 }), // e.g. 100/20 | 50/20 | 25/5
  // Address
  address: varchar("address", { length: 1024 }),
  suburb: varchar("suburb", { length: 128 }),
  state: varchar("state", { length: 16 }),
  postcode: varchar("postcode", { length: 16 }),
  // Customer details
  customerName: varchar("customerName", { length: 512 }),
  contactPhone: varchar("contactPhone", { length: 64 }),
  contactEmail: varchar("contactEmail", { length: 320 }),
  label: varchar("label", { length: 256 }),
  anniversaryDay: int("anniversaryDay"),
  // Network details
  ipAddress: varchar("ipAddress", { length: 64 }),
  poiName: varchar("poiName", { length: 128 }),
  // Activation / contract
  activationDate: varchar("activationDate", { length: 32 }),
  // Link to internal services table
  internalServiceExternalId: varchar("internalServiceExternalId", { length: 32 }),
  internalCustomerExternalId: varchar("internalCustomerExternalId", { length: 32 }),
  matchType: varchar("matchType", { length: 32 }), // 'avc' | 'address' | 'username' | 'manual' | 'unmatched'
  matchConfidence: decimal("matchConfidence", { precision: 4, scale: 2 }),
  // Raw JSON from portal page
  rawJson: mediumtext("rawJson"),
  lastSyncedAt: timestamp("lastSyncedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type VocusNbnService = typeof vocusNbnServices.$inferSelect;
export type InsertVocusNbnService = typeof vocusNbnServices.$inferInsert;

/**
 * Vocus Buckets — quota buckets for mobile services.
 * One row per bucket (e.g. mobile.smileit.com Standard Mobile, data.smileit.com 4G Backup).
 * Quota snapshots are taken each time data is synced from the portal.
 */
export const vocusBuckets = mysqlTable("vocus_buckets", {
  id: int("id").autoincrement().primaryKey(),
  bucketId: varchar("bucketId", { length: 128 }).notNull().unique(),
  bucketType: varchar("bucketType", { length: 32 }).notNull(), // DATA-HOSTED | STANDARD-POSTPAID
  realm: varchar("realm", { length: 128 }).notNull(), // e.g. mobile.smileit.com
  planId: varchar("planId", { length: 128 }),
  serviceStatus: varchar("serviceStatus", { length: 32 }),
  // Quota data (in MB for data, minutes for voice, count for SMS)
  dataQuotaMb: int("dataQuotaMb"),
  dataUsedMb: decimal("dataUsedMb", { precision: 12, scale: 2 }),
  voiceQuotaMin: int("voiceQuotaMin"),
  voiceUsedMin: decimal("voiceUsedMin", { precision: 10, scale: 2 }),
  smsQuota: int("smsQuota"),
  smsUsed: int("smsUsed"),
  // Overage flag
  isOverQuota: boolean("isOverQuota").default(false),
  overageDataMb: decimal("overageDataMb", { precision: 12, scale: 2 }),
  // Member SIM count
  simCount: int("simCount").default(0),
  // Snapshot timestamp
  snapshotDate: varchar("snapshotDate", { length: 16 }).notNull(), // YYYY-MM-DD
  rawJson: mediumtext("rawJson"),
  lastSyncedAt: timestamp("lastSyncedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type VocusBucket = typeof vocusBuckets.$inferSelect;
export type InsertVocusBucket = typeof vocusBuckets.$inferInsert;

/**
 * Vocus Sync Log — records each portal data extraction run.
 */
export const vocusSyncLog = mysqlTable("vocus_sync_log", {
  id: int("id").autoincrement().primaryKey(),
  syncType: varchar("syncType", { length: 64 }).notNull(), // mobile | nbn | buckets | full
  status: varchar("status", { length: 32 }).default("running").notNull(), // running | completed | failed
  recordsFetched: int("recordsFetched").default(0),
  recordsCreated: int("recordsCreated").default(0),
  recordsUpdated: int("recordsUpdated").default(0),
  recordsMatched: int("recordsMatched").default(0),
  errorMessage: text("errorMessage"),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
  durationMs: int("durationMs"),
  triggeredBy: varchar("triggeredBy", { length: 64 }).default("manual"),
});
export type VocusSyncLog = typeof vocusSyncLog.$inferSelect;
export type InsertVocusSyncLog = typeof vocusSyncLog.$inferInsert;

// =============================================================================
// TIAB Supplier Invoices — Telcoinabox invoices to SmileTel (Account 100998)
// =============================================================================

/**
 * TIAB Supplier Invoices — invoices from Telcoinabox Operations Pty Ltd to SmileTel.
 * These are the wholesale cost invoices (e.g. 100998-279, 100998-280, etc.)
 * that represent SmileTel's cost of goods for Octane/TIAB mobile services.
 */
export const tiabSupplierInvoices = mysqlTable("tiab_supplier_invoices", {
  id: int("id").autoincrement().primaryKey(),
  invoiceNumber: varchar("invoiceNumber", { length: 64 }).notNull().unique(), // e.g. '279'
  invoiceReference: varchar("invoiceReference", { length: 128 }).notNull(), // e.g. '100998-279'
  accountNumber: varchar("accountNumber", { length: 64 }).notNull(), // e.g. '100998'
  accountName: varchar("accountName", { length: 256 }).notNull(), // e.g. 'SmileTel'
  invoiceDate: varchar("invoiceDate", { length: 32 }).notNull(), // e.g. '30/11/2025'
  paymentDueDate: varchar("paymentDueDate", { length: 32 }).notNull(),
  billingMonth: varchar("billingMonth", { length: 7 }).notNull(), // e.g. '2025-11'
  // Supplier details
  supplierName: varchar("supplierName", { length: 256 }).notNull(), // Telcoinabox Operations Pty Ltd
  supplierAbn: varchar("supplierAbn", { length: 32 }).notNull(),
  // Billed-to details
  billedToName: varchar("billedToName", { length: 256 }).notNull(), // Smile IT PTY LTD
  billedToAbn: varchar("billedToAbn", { length: 32 }).notNull(),
  billedToAddress: varchar("billedToAddress", { length: 512 }).notNull(),
  // Totals (ex GST)
  totalExGst: decimal("totalExGst", { precision: 10, scale: 2 }).notNull(),
  totalGst: decimal("totalGst", { precision: 10, scale: 2 }).notNull(),
  totalIncGst: decimal("totalIncGst", { precision: 10, scale: 2 }).notNull(),
  // Payment
  paymentBsb: varchar("paymentBsb", { length: 16 }).default("032-002"),
  paymentAccount: varchar("paymentAccount", { length: 32 }).default("483217"),
  paymentEmail: varchar("paymentEmail", { length: 320 }).default("finance@telcoinabox.com"),
  // Import metadata
  importedBy: varchar("importedBy", { length: 256 }).default("system").notNull(),
  fileUrl: text("fileUrl"),
  fileName: varchar("fileName", { length: 256 }),
  status: varchar("status", { length: 32 }).default("imported").notNull(), // imported | reconciled | disputed
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type TiabSupplierInvoice = typeof tiabSupplierInvoices.$inferSelect;
export type InsertTiabSupplierInvoice = typeof tiabSupplierInvoices.$inferInsert;

/**
 * TIAB Supplier Invoice Line Items — individual line items from each invoice.
 */
export const tiabSupplierInvoiceLineItems = mysqlTable("tiab_supplier_invoice_line_items", {
  id: int("id").autoincrement().primaryKey(),
  invoiceId: int("invoiceId").notNull(), // FK to tiabSupplierInvoices
  invoiceNumber: varchar("invoiceNumber", { length: 64 }).notNull(),
  description: varchar("description", { length: 512 }).notNull(),
  gstExclusive: decimal("gstExclusive", { precision: 10, scale: 2 }).notNull(),
  gst: decimal("gst", { precision: 10, scale: 2 }).notNull(),
  amountGstIncl: decimal("amountGstIncl", { precision: 10, scale: 2 }).notNull(),
  taxId: varchar("taxId", { length: 16 }).default("GST"),
  // Category: 'mobile_service' | 'sim_card' | 'otp_sms' | 'other'
  lineCategory: varchar("lineCategory", { length: 64 }).default("mobile_service").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type TiabSupplierInvoiceLineItem = typeof tiabSupplierInvoiceLineItems.$inferSelect;
export type InsertTiabSupplierInvoiceLineItem = typeof tiabSupplierInvoiceLineItems.$inferInsert;

/**
 * Octane Customer Links — links Octane customer IDs to internal SmileTel customers.
 * Supports many-to-one (multiple Octane customers → one SmileTel customer).
 * Also supports Zambrero services being treated as individual customers.
 */
export const octaneCustomerLinks = mysqlTable("octane_customer_links", {
  id: int("id").autoincrement().primaryKey(),
  // Octane/TIAB customer ID (from tiabCustomers.tiabCustomerId)
  octaneCustomerId: varchar("octaneCustomerId", { length: 64 }).notNull(),
  octaneCustomerName: varchar("octaneCustomerName", { length: 512 }).notNull(),
  // For Zambrero: the specific service/location name (e.g. 'Zambrero Bundoora')
  octaneServiceName: varchar("octaneServiceName", { length: 512 }).default(""),
  // The internal SmileTel customer this maps to
  internalCustomerExternalId: varchar("internalCustomerExternalId", { length: 32 }),
  internalCustomerName: varchar("internalCustomerName", { length: 512 }),
  // Match metadata
  matchType: varchar("matchType", { length: 64 }).default("unmatched"),
  // 'exact_name' | 'fuzzy_name' | 'abn' | 'manual' | 'service_name' | 'unmatched'
  matchConfidence: decimal("matchConfidence", { precision: 5, scale: 2 }).default("0.00"),
  matchNotes: text("matchNotes"),
  confirmedBy: varchar("confirmedBy", { length: 256 }),
  confirmedAt: timestamp("confirmedAt"),
  // Whether this is a Zambrero service-level link (each service = its own customer)
  isZambreroService: int("isZambreroService").default(0).notNull(),
  // The MSISDN/phone number for Zambrero service links
  msisdn: varchar("msisdn", { length: 32 }).default(""),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  uniqOctaneLink: uniqueIndex("uniq_octane_link").on(t.octaneCustomerId, t.octaneServiceName),
}));
export type OctaneCustomerLink = typeof octaneCustomerLinks.$inferSelect;
export type InsertOctaneCustomerLink = typeof octaneCustomerLinks.$inferInsert;

/**
 * Phone Numbers — all phone numbers owned or controlled by SmileTel/SmileIT
 * across all suppliers (Channel Haus, SasBoss, NetSip, Comms Code, etc.)
 */
export const phoneNumbers = mysqlTable("phone_numbers", {
  id: int("id").autoincrement().primaryKey(),
  // The phone number itself — normalised to digits only (no spaces/dashes)
  number: varchar("number", { length: 32 }).notNull(),
  // Human-readable display format e.g. "07 3xxx xxxx" or "1300 xxx xxx"
  numberDisplay: varchar("numberDisplay", { length: 32 }).default(""),
  // Number type: 'geographic' (07/02/03 etc) | 'tollfree' (1800) | 'local' (1300) | 'mobile' | 'international' | 'other'
  numberType: varchar("numberType", { length: 32 }).default("geographic").notNull(),
  // Provider / supplier who holds this number
  provider: varchar("provider", { length: 128 }).notNull(),
  // Status: 'active' | 'ported_out' | 'terminated' | 'reserved' | 'unknown'
  status: varchar("status", { length: 32 }).default("active").notNull(),
  // Customer this number is assigned to (may be null if unassigned)
  customerExternalId: varchar("customerExternalId", { length: 32 }).default(""),
  customerName: varchar("customerName", { length: 512 }).default(""),
  // Service this number belongs to (optional — links to services table)
  serviceExternalId: varchar("serviceExternalId", { length: 32 }).default(""),
  servicePlanName: varchar("servicePlanName", { length: 512 }).default(""),
  // Monthly rental cost (ex GST)
  monthlyCost: decimal("monthlyCost", { precision: 10, scale: 2 }).default("0.00").notNull(),
  // Monthly retail price charged to customer (ex GST)
  monthlyRevenue: decimal("monthlyRevenue", { precision: 10, scale: 2 }).default("0.00").notNull(),
  // Provider-specific service code (e.g. Channel Haus service code like 'bsip_albyfdocsout')
  providerServiceCode: varchar("providerServiceCode", { length: 256 }).default(""),
  // Notes / description
  notes: text("notes"),
  // Source of this record: 'channelhaus_invoice' | 'channelhaus_api' | 'sasboss' | 'netsip' | 'comms_code' | 'manual'
  dataSource: varchar("dataSource", { length: 64 }).default("manual").notNull(),
  // Last synced from provider
  lastSyncedAt: timestamp("lastSyncedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type PhoneNumber = typeof phoneNumbers.$inferSelect;
export type InsertPhoneNumber = typeof phoneNumbers.$inferInsert;

/**
 * Internet Pricebook Versions — one row per imported version of the SmileTel
 * Internet Services price schedule (ABB TC4, EE, FW, etc.).
 */
export const internetPricebookVersions = mysqlTable("internet_pricebook_versions", {
  id: int("id").autoincrement().primaryKey(),
  label: varchar("label", { length: 256 }).notNull(),          // e.g. "May 2025"
  sourceFile: varchar("sourceFile", { length: 512 }).default(""),
  effectiveDate: varchar("effectiveDate", { length: 32 }).notNull(), // ISO date string
  importedAt: timestamp("importedAt").defaultNow().notNull(),
  importedBy: varchar("importedBy", { length: 256 }).default(""),
  notes: text("notes"),
});
export type InternetPricebookVersion = typeof internetPricebookVersions.$inferSelect;

/**
 * Internet Pricebook Items — one row per speed tier × support tier × contract term.
 * Covers TC4 Standard, TC4 Gold (bundled support), Premium support, EE, FW, etc.
 */
export const internetPricebookItems = mysqlTable("internet_pricebook_items", {
  id: int("id").autoincrement().primaryKey(),
  versionId: int("versionId").notNull(),

  // Product identification
  productCode: varchar("productCode", { length: 64 }).default(""),    // e.g. "ST-NBN100-40"
  speedTier: varchar("speedTier", { length: 64 }).notNull(),           // e.g. "100/40", "250/100 Gold"
  // Service type: tc4 = ABB TC4 NBN, ee = Enterprise Ethernet, fw = Fixed Wireless
  serviceType: varchar("serviceType", { length: 32 }).notNull(),
  // Support tier: standard | premium
  supportTier: varchar("supportTier", { length: 32 }).notNull(),
  // Contract term: m2m | 12m | 24m | 36m
  contractTerm: varchar("contractTerm", { length: 8 }).notNull(),
  // Zone (for EE products): all | cbd | z1 | z2 | z3
  zone: varchar("zone", { length: 16 }).default("all"),
  // Gold/Bronze support note (e.g. "Incl Gold Support", "Bronze Bundled")
  supportNote: varchar("supportNote", { length: 128 }).default(""),
  // Datto/SasBoss product name for cross-referencing
  dattoProductName: varchar("dattoProductName", { length: 512 }).default(""),

  // Pricing (all ex GST)
  wholesaleCost: decimal("wholesaleCost", { precision: 10, scale: 4 }).notNull(),
  sellPrice: decimal("sellPrice", { precision: 10, scale: 4 }).notNull(),
  grossProfit: decimal("grossProfit", { precision: 10, scale: 4 }).notNull(),
  marginPercent: decimal("marginPercent", { precision: 8, scale: 6 }).notNull(),

  // Carbon API live cost validation
  carbonPlanName: varchar("carbonPlanName", { length: 256 }).default(""),
  carbonValidatedCost: decimal("carbonValidatedCost", { precision: 10, scale: 4 }),
  carbonValidatedAt: timestamp("carbonValidatedAt"),
  // Difference between spreadsheet wholesale cost and Carbon live cost
  costVariance: decimal("costVariance", { precision: 10, scale: 4 }),

  // Low-margin flag
  lowMarginFlag: int("lowMarginFlag").default(0).notNull(),   // 0=ok, 1=warning (<20%), 2=critical (<10%)
  lowMarginThreshold: decimal("lowMarginThreshold", { precision: 5, scale: 2 }).default("20.00"),

  // Manual sell price override
  sellPriceOverride: decimal("sellPriceOverride", { precision: 10, scale: 4 }),
  overrideNote: text("overrideNote"),
  overriddenBy: varchar("overriddenBy", { length: 256 }).default(""),
  overriddenAt: timestamp("overriddenAt"),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type InternetPricebookItem = typeof internetPricebookItems.$inferSelect;
export type InsertInternetPricebookItem = typeof internetPricebookItems.$inferInsert;

// ─── Retail Internet Bundles ──────────────────────────────────────────────────
// One row per unique OneBill account / bundle offering.
// Duplicate Zam25M2M rows are resolved at import time (kept only the higher-priced / newer product).

export const retailBundles = mysqlTable("retail_bundles", {
  id: int("id").primaryKey().autoincrement(),

  // OneBill account identifier (numeric or STL-prefixed)
  oneBillAccountNumber: varchar("oneBillAccountNumber", { length: 64 }).notNull(),

  // Matched customer in this DB (nullable — unmatched if null)
  customerExternalId: varchar("customerExternalId", { length: 128 }),

  // Raw subscriber name from spreadsheet (preserved for reference / future re-matching)
  subscriberName: varchar("subscriberName", { length: 512 }).notNull(),

  // Raw bundle component list from spreadsheet e.g. "internet, sim, voip, hardware, support"
  rawBundleComponents: text("rawBundleComponents").notNull(),

  // Parsed boolean flags for each component
  hasInternet: tinyint("hasInternet").default(0).notNull(),
  hasSim: tinyint("hasSim").default(0).notNull(),
  hasVoip: tinyint("hasVoip").default(0).notNull(),
  hasHardware: tinyint("hasHardware").default(0).notNull(),
  hasSupport: tinyint("hasSupport").default(0).notNull(),
  isByod: tinyint("isByod").default(0).notNull(),

  // Legacy product name (preserved verbatim)
  legacyProductName: varchar("legacyProductName", { length: 512 }).notNull(),

  // Standardised product name (editable, populated at import with best-guess mapping)
  standardProductName: varchar("standardProductName", { length: 256 }).default(""),

  // Retail price ex GST from spreadsheet
  retailPriceExGst: decimal("retailPriceExGst", { precision: 10, scale: 4 }).notNull(),

  // Match metadata
  matchConfidence: varchar("matchConfidence", { length: 32 }).default("none"),
  matchMethod: varchar("matchMethod", { length: 64 }).default(""),

  // Status
  isActive: tinyint("isActive").default(1).notNull(),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type RetailBundle = typeof retailBundles.$inferSelect;
export type InsertRetailBundle = typeof retailBundles.$inferInsert;

// ─── Retail Bundle Cost Inputs ────────────────────────────────────────────────
// Each row is one cost line item for a retail bundle.
// Slot types: internet | sim_4g | hardware | sip_channel | support | other

export const retailBundleCostInputs = mysqlTable("retail_bundle_cost_inputs", {
  id: int("id").primaryKey().autoincrement(),
  bundleId: int("bundleId").notNull(),

  // Slot classification
  slotType: varchar("slotType", { length: 64 }).notNull(),

  // Label shown in UI (editable)
  label: varchar("label", { length: 256 }).notNull(),

  // Monthly cost ex GST
  monthlyCostExGst: decimal("monthlyCostExGst", { precision: 10, scale: 4 }).notNull(),

  // Source of this cost: default|manual|service_link|carbon|pricebook
  costSource: varchar("costSource", { length: 64 }).default("default").notNull(),

  // Optional link to a specific service record (for drag-drop assignment)
  linkedServiceId: int("linkedServiceId"),
  linkedServiceExternalId: varchar("linkedServiceExternalId", { length: 128 }),

  // Notes / override reason
  notes: text("notes"),

  // Whether this input is active (soft-delete for removed inputs)
  isActive: tinyint("isActive").default(1).notNull(),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type RetailBundleCostInput = typeof retailBundleCostInputs.$inferSelect;
export type InsertRetailBundleCostInput = typeof retailBundleCostInputs.$inferInsert;

/**
 * Service Match Provenance — records the why/how/who of every service-to-customer match.
 * Written at each match point (import, manual, workbook, auto-match) so reviewers can
 * audit and validate matches without guessing.
 */
export const serviceMatchEvents = mysqlTable("service_match_events", {
  id: int("id").autoincrement().primaryKey(),
  serviceExternalId: varchar("serviceExternalId", { length: 64 }).notNull(),
  customerExternalId: varchar("customerExternalId", { length: 32 }).notNull(),
  /** How the match was made */
  matchMethod: mysqlEnum("matchMethod", [
    "manual",          // user dragged / assigned via UI
    "auto_avc",        // AVC ID exact match
    "auto_phone",      // phone number exact match
    "auto_name",       // customer name fuzzy match
    "workbook_import", // matched during spreadsheet upload
    "api_import",      // matched during API import (ABB/TIAB/Vocus)
    "system",          // system-level assignment (e.g. location inherit)
  ]).notNull(),
  /** Which data source triggered the match */
  matchSource: mysqlEnum("matchSource", [
    "carbon_api",
    "tiab_spreadsheet",
    "tiab_api",
    "vocus_api",
    "sasboss_api",
    "datagate_api",
    "workbook_upload",
    "manual_ui",
    "system",
  ]).notNull(),
  /** Name / email of user or system that performed the match */
  matchedBy: varchar("matchedBy", { length: 256 }).notNull(),
  matchedAt: timestamp("matchedAt").defaultNow().notNull(),
  /**
   * JSON object describing the criteria used, e.g.:
   * { "avcId": "AVC000239799549" }
   * { "phoneNumber": "0484601782", "score": 1.0 }
   * { "customerName": "Nodo Pty Ltd", "fuzzyScore": 0.87, "spreadsheetRow": 14 }
   */
  matchCriteria: text("matchCriteria"),
  /** Confidence level derived from the match method and criteria */
  confidence: mysqlEnum("confidence", ["high", "medium", "low"]).notNull().default("medium"),
  /** Optional free-text note (e.g. "Matched via ABB import — AVC confirmed") */
  notes: text("notes"),
  /** Set to true if a reviewer has flagged this match as potentially incorrect */
  flaggedForReview: boolean("flaggedForReview").default(false).notNull(),
  flaggedBy: varchar("flaggedBy", { length: 256 }),
  flaggedAt: timestamp("flaggedAt"),
  flagReason: text("flagReason"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ServiceMatchEvent = typeof serviceMatchEvents.$inferSelect;
export type InsertServiceMatchEvent = typeof serviceMatchEvents.$inferInsert;

/**
 * Termination Batches - records each bulk archive run from a supplier termination list.
 * One row per uploaded termination list. Services reference this via terminationBatchId.
 */
export const terminationBatches = mysqlTable("termination_batches", {
  id: int("id").autoincrement().primaryKey(),
  batchId: varchar("batchId", { length: 64 }).notNull().unique(),
  sourceFile: varchar("sourceFile", { length: 256 }).notNull().default(""),
  supplierName: varchar("supplierName", { length: 128 }).notNull().default(""),
  totalServices: int("totalServices").notNull().default(0),
  archivedCount: int("archivedCount").notNull().default(0),
  notFoundCount: int("notFoundCount").notNull().default(0),
  discrepancyNotes: text("discrepancyNotes"),
  processedBy: varchar("processedBy", { length: 256 }).default(""),
  processedAt: timestamp("processedAt").defaultNow(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type TerminationBatch = typeof terminationBatches.$inferSelect;
export type InsertTerminationBatch = typeof terminationBatches.$inferInsert;

/**
 * Payment Plans - tracks overdue debt arrangements with customers.
 * A payment plan captures the total overdue amount, the agreed repayment
 * schedule, and links to the invoices covered by the arrangement.
 */
export const paymentPlans = mysqlTable("payment_plans", {
  id: int("id").autoincrement().primaryKey(),
  planId: varchar("planId", { length: 64 }).notNull().unique(),
  // The primary customer (or group owner) responsible for the plan
  customerExternalId: varchar("customerExternalId", { length: 32 }).notNull(),
  customerName: varchar("customerName", { length: 512 }).notNull(),
  // Contact details captured from correspondence
  contactName: varchar("contactName", { length: 256 }).default(""),
  contactEmail: varchar("contactEmail", { length: 320 }).default(""),
  contactPhone: varchar("contactPhone", { length: 64 }).default(""),
  // Financial summary (all amounts ex GST)
  totalOverdueIncGst: decimal("totalOverdueIncGst", { precision: 10, scale: 2 }).notNull(),
  totalOverdueExGst: decimal("totalOverdueExGst", { precision: 10, scale: 2 }).notNull(),
  // Plan terms
  status: mysqlEnum("status", ["active", "completed", "defaulted", "cancelled"]).default("active").notNull(),
  // Agreed repayment terms (free text, e.g. "March invoices by 31 Mar, Feb invoices within 2 weeks, April by end of April")
  agreedTerms: text("agreedTerms"),
  // Source of the arrangement (email thread reference, meeting date, etc.)
  sourceReference: varchar("sourceReference", { length: 512 }).default(""),
  // Internal notes
  notes: text("notes"),
  // Who created/last updated this plan
  createdBy: varchar("createdBy", { length: 256 }).default(""),
  updatedBy: varchar("updatedBy", { length: 256 }).default(""),
  // Key dates
  arrangementDate: timestamp("arrangementDate"),
  targetClearDate: timestamp("targetClearDate"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type PaymentPlan = typeof paymentPlans.$inferSelect;
export type InsertPaymentPlan = typeof paymentPlans.$inferInsert;

/**
 * Payment Plan Invoices - individual invoices covered by a payment plan.
 * Each row represents one invoice line from the overdue statement.
 */
export const paymentPlanInvoices = mysqlTable("payment_plan_invoices", {
  id: int("id").autoincrement().primaryKey(),
  planId: varchar("planId", { length: 64 }).notNull(),
  // The specific site customer this invoice belongs to
  customerExternalId: varchar("customerExternalId", { length: 32 }).notNull(),
  customerName: varchar("customerName", { length: 512 }).notNull(),
  invoiceNumber: varchar("invoiceNumber", { length: 64 }).notNull(),
  invoiceDate: timestamp("invoiceDate"),
  // Amount inc GST as stated in the overdue statement
  amountIncGst: decimal("amountIncGst", { precision: 10, scale: 2 }).notNull(),
  amountExGst: decimal("amountExGst", { precision: 10, scale: 2 }).notNull(),
  description: varchar("description", { length: 512 }).default(""),
  // Whether this is a final invoice for a closed site
  isFinalInvoice: boolean("isFinalInvoice").default(false).notNull(),
  // Payment status
  paymentStatus: mysqlEnum("paymentStatus", ["outstanding", "promised", "paid", "disputed", "waived"]).default("outstanding").notNull(),
  // When the customer committed to paying (from email)
  promisedPaymentDate: timestamp("promisedPaymentDate"),
  paidDate: timestamp("paidDate"),
  // Link to billing_items if the invoice exists in Xero
  billingItemExternalId: varchar("billingItemExternalId", { length: 64 }).default(""),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type PaymentPlanInvoice = typeof paymentPlanInvoices.$inferSelect;
export type InsertPaymentPlanInvoice = typeof paymentPlanInvoices.$inferInsert;

// ── Monthly Billing Cycle ────────────────────────────────────────────────────

/**
 * billing_periods — one row per calendar month being reconciled.
 * The active period is the one currently being worked on.
 */
export const billingPeriods = mysqlTable("billing_periods", {
  id: int("id").autoincrement().primaryKey(),
  periodKey: varchar("periodKey", { length: 7 }).notNull().unique(), // e.g. "2026-04"
  label: varchar("label", { length: 64 }).notNull(),                 // e.g. "April 2026"
  status: mysqlEnum("status", ["pending", "in_progress", "complete"]).default("pending").notNull(),
  // Snapshot totals (populated when period is finalised)
  totalSupplierCostExGst: decimal("totalSupplierCostExGst", { precision: 12, scale: 2 }),
  totalSupplierInvoicedExGst: decimal("totalSupplierInvoicedExGst", { precision: 12, scale: 2 }),
  totalRevenueExGst: decimal("totalRevenueExGst", { precision: 12, scale: 2 }),
  totalMarginExGst: decimal("totalMarginExGst", { precision: 12, scale: 2 }),
  checklistCompletedAt: timestamp("checklistCompletedAt"),
  reconRunAt: timestamp("reconRunAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type BillingPeriod = typeof billingPeriods.$inferSelect;
export type InsertBillingPeriod = typeof billingPeriods.$inferInsert;

/**
 * supplier_monthly_snapshots — one row per supplier per billing period.
 * Captures both the expected cost (from service records) and the actual
 * invoiced amount, enabling the cost-vs-invoiced trend graph.
 */
export const supplierMonthlySnapshots = mysqlTable("supplier_monthly_snapshots", {
  id: int("id").autoincrement().primaryKey(),
  periodKey: varchar("periodKey", { length: 7 }).notNull(),  // FK → billing_periods.periodKey
  supplierName: varchar("supplierName", { length: 128 }).notNull(),
  supplierDisplayName: varchar("supplierDisplayName", { length: 128 }),
  // Expected cost = sum of monthlyCost on active services for this supplier
  expectedCostExGst: decimal("expectedCostExGst", { precision: 12, scale: 2 }).default("0.00").notNull(),
  expectedCostIncGst: decimal("expectedCostIncGst", { precision: 12, scale: 2 }).default("0.00").notNull(),
  serviceCount: int("serviceCount").default(0).notNull(),
  // Actual invoiced = from uploaded invoice
  invoicedExGst: decimal("invoicedExGst", { precision: 12, scale: 2 }),
  invoicedIncGst: decimal("invoicedIncGst", { precision: 12, scale: 2 }),
  invoiceNumber: varchar("invoiceNumber", { length: 128 }),
  invoiceDate: varchar("invoiceDate", { length: 32 }),
  // Variance
  varianceExGst: decimal("varianceExGst", { precision: 12, scale: 2 }),
  variancePct: decimal("variancePct", { precision: 6, scale: 2 }),
  // Revenue (outgoing to customers) for this supplier's services
  revenueExGst: decimal("revenueExGst", { precision: 12, scale: 2 }),
  // Delta vs previous month (populated on snapshot)
  prevPeriodKey: varchar("prevPeriodKey", { length: 7 }),
  prevInvoicedExGst: decimal("prevInvoicedExGst", { precision: 12, scale: 2 }),
  deltaExGst: decimal("deltaExGst", { precision: 12, scale: 2 }),
  deltaPct: decimal("deltaPct", { precision: 6, scale: 2 }),
  deltaDirection: mysqlEnum("deltaDirection", ["up", "down", "flat", "new"]),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type SupplierMonthlySnapshot = typeof supplierMonthlySnapshots.$inferSelect;
export type InsertSupplierMonthlySnapshot = typeof supplierMonthlySnapshots.$inferInsert;

/**
 * recon_checklist_items — one row per required input per billing period.
 * Drives the in-platform checklist UI. Resets (new rows) on 1st of each month.
 */
export const reconChecklistItems = mysqlTable("recon_checklist_items", {
  id: int("id").autoincrement().primaryKey(),
  periodKey: varchar("periodKey", { length: 7 }).notNull(),
  itemKey: varchar("itemKey", { length: 64 }).notNull(),   // e.g. "aapt_invoice"
  category: mysqlEnum("category", ["supplier_invoice", "revenue", "portal_scrape", "api_sync"]).notNull(),
  supplierName: varchar("supplierName", { length: 128 }).notNull(),
  displayName: varchar("displayName", { length: 256 }).notNull(),
  description: text("description"),
  acceptedFormats: varchar("acceptedFormats", { length: 128 }), // e.g. "pdf,xlsx"
  isRequired: tinyint("isRequired").default(1).notNull(),
  isAutomatic: tinyint("isAutomatic").default(0).notNull(), // true = API sync, no upload needed
  status: mysqlEnum("status", ["pending", "uploaded", "synced", "skipped"]).default("pending").notNull(),
  uploadedAt: timestamp("uploadedAt"),
  uploadedBy: varchar("uploadedBy", { length: 256 }),
  uploadRef: varchar("uploadRef", { length: 512 }), // reference to upload record
  notes: text("notes"),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ReconChecklistItem = typeof reconChecklistItems.$inferSelect;
export type InsertReconChecklistItem = typeof reconChecklistItems.$inferInsert;

/**
 * discrepancy_alerts — flags cost changes >10% vs previous month.
 * One row per flagged line item per period.
 */
export const discrepancyAlerts = mysqlTable("discrepancy_alerts", {
  id: int("id").autoincrement().primaryKey(),
  periodKey: varchar("periodKey", { length: 7 }).notNull(),
  supplierName: varchar("supplierName", { length: 128 }).notNull(),
  alertType: mysqlEnum("alertType", [
    "cost_increase",      // line item cost went up >10%
    "cost_decrease",      // line item cost went down >10%
    "service_dropped",    // service present last month, missing this month
    "service_added",      // new service not seen last month
    "invoice_missing",    // no invoice received for this supplier
  ]).notNull(),
  severity: mysqlEnum("severity", ["info", "warning", "critical"]).default("warning").notNull(),
  serviceExternalId: varchar("serviceExternalId", { length: 32 }),
  serviceName: varchar("serviceName", { length: 512 }),
  customerExternalId: varchar("customerExternalId", { length: 32 }),
  customerName: varchar("customerName", { length: 512 }),
  prevAmountExGst: decimal("prevAmountExGst", { precision: 10, scale: 2 }),
  currAmountExGst: decimal("currAmountExGst", { precision: 10, scale: 2 }),
  changeAmountExGst: decimal("changeAmountExGst", { precision: 10, scale: 2 }),
  changePct: decimal("changePct", { precision: 6, scale: 2 }),
  reason: text("reason"),       // auto-generated explanation
  resolution: text("resolution"), // user-entered resolution note
  status: mysqlEnum("status", ["open", "acknowledged", "resolved"]).default("open").notNull(),
  acknowledgedBy: varchar("acknowledgedBy", { length: 256 }),
  acknowledgedAt: timestamp("acknowledgedAt"),
  emailedAt: timestamp("emailedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type DiscrepancyAlert = typeof discrepancyAlerts.$inferSelect;
export type InsertDiscrepancyAlert = typeof discrepancyAlerts.$inferInsert;


// ─────────────────────────────────────────────────────────────────────────────
// STARLINK ENTERPRISE INTEGRATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One row per Starlink account (maps to an accountNumber in the Starlink API).
 * A single reseller/enterprise umbrella may have many accounts (one per site).
 */
export const starlinkAccounts = mysqlTable("starlink_accounts", {
  id: int("id").autoincrement().primaryKey(),
  accountNumber: varchar("accountNumber", { length: 64 }).notNull().unique(),
  nickname: varchar("nickname", { length: 255 }),
  /** Matched SmileTel customer */
  customerExternalId: varchar("customerExternalId", { length: 64 }),
  customerName: varchar("customerName", { length: 255 }),
  /** Fuzzy match confidence 0-100 */
  matchConfidence: int("matchConfidence"),
  matchMethod: varchar("matchMethod", { length: 64 }),
  matchedAt: timestamp("matchedAt"),
  /** Raw address from Starlink API */
  serviceAddress: text("serviceAddress"),
  status: varchar("status", { length: 32 }).default("active"),
  /** Monthly plan cost ex GST */
  monthlyCostExGst: decimal("monthlyCostExGst", { precision: 10, scale: 2 }),
  planName: varchar("planName", { length: 255 }),
  lastSyncedAt: timestamp("lastSyncedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type StarlinkAccount = typeof starlinkAccounts.$inferSelect;
export type InsertStarlinkAccount = typeof starlinkAccounts.$inferInsert;

/**
 * One row per service line (logical grouping of terminals under an account).
 */
export const starlinkServiceLines = mysqlTable("starlink_service_lines", {
  id: int("id").autoincrement().primaryKey(),
  serviceLineNumber: varchar("serviceLineNumber", { length: 64 }).notNull().unique(),
  accountNumber: varchar("accountNumber", { length: 64 }).notNull(),
  nickname: varchar("nickname", { length: 255 }),
  status: varchar("status", { length: 32 }).default("active"),
  productReferenceId: varchar("productReferenceId", { length: 128 }),
  dataAllowanceGb: decimal("dataAllowanceGb", { precision: 10, scale: 2 }),
  overagePolicy: varchar("overagePolicy", { length: 64 }),
  lastSyncedAt: timestamp("lastSyncedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type StarlinkServiceLine = typeof starlinkServiceLines.$inferSelect;
export type InsertStarlinkServiceLine = typeof starlinkServiceLines.$inferInsert;

/**
 * One row per physical Starlink terminal (dish/router).
 */
export const starlinkTerminals = mysqlTable("starlink_terminals", {
  id: int("id").autoincrement().primaryKey(),
  deviceId: varchar("deviceId", { length: 128 }).notNull().unique(),
  userTerminalId: varchar("userTerminalId", { length: 128 }),
  accountNumber: varchar("accountNumber", { length: 64 }).notNull(),
  serviceLineNumber: varchar("serviceLineNumber", { length: 64 }),
  kitSerialNumber: varchar("kitSerialNumber", { length: 128 }),
  dishSerialNumber: varchar("dishSerialNumber", { length: 128 }),
  online: tinyint("online").default(0),
  signalQuality: int("signalQuality"),
  downlinkThroughputMbps: decimal("downlinkThroughputMbps", { precision: 8, scale: 2 }),
  uplinkThroughputMbps: decimal("uplinkThroughputMbps", { precision: 8, scale: 2 }),
  lastSeenAt: timestamp("lastSeenAt"),
  lastSyncedAt: timestamp("lastSyncedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type StarlinkTerminal = typeof starlinkTerminals.$inferSelect;
export type InsertStarlinkTerminal = typeof starlinkTerminals.$inferInsert;

/**
 * Monthly data usage snapshot per service line per billing cycle.
 */
export const starlinkUsage = mysqlTable("starlink_usage", {
  id: int("id").autoincrement().primaryKey(),
  serviceLineNumber: varchar("serviceLineNumber", { length: 64 }).notNull(),
  accountNumber: varchar("accountNumber", { length: 64 }).notNull(),
  billingPeriod: varchar("billingPeriod", { length: 7 }).notNull(),
  priorityGbUsed: decimal("priorityGbUsed", { precision: 10, scale: 3 }),
  standardGbUsed: decimal("standardGbUsed", { precision: 10, scale: 3 }),
  mobileGbUsed: decimal("mobileGbUsed", { precision: 10, scale: 3 }),
  totalGbUsed: decimal("totalGbUsed", { precision: 10, scale: 3 }),
  overageGbUsed: decimal("overageGbUsed", { precision: 10, scale: 3 }),
  overageCostExGst: decimal("overageCostExGst", { precision: 10, scale: 2 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type StarlinkUsage = typeof starlinkUsage.$inferSelect;
export type InsertStarlinkUsage = typeof starlinkUsage.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────────
// STARLINK INVOICES
// ─────────────────────────────────────────────────────────────────────────────
export const starlinkInvoices = mysqlTable("starlink_invoices", {
  id: int("id").autoincrement().primaryKey(),
  invoiceNumber: varchar("invoiceNumber", { length: 128 }).notNull().unique(),
  accountNumber: varchar("accountNumber", { length: 64 }).notNull(),
  invoiceDate: varchar("invoiceDate", { length: 32 }).notNull(),
  billingPeriodStart: varchar("billingPeriodStart", { length: 32 }).notNull(),
  billingPeriodEnd: varchar("billingPeriodEnd", { length: 32 }).notNull(),
  subtotalExGst: decimal("subtotalExGst", { precision: 10, scale: 2 }).notNull(),
  totalGst: decimal("totalGst", { precision: 10, scale: 2 }).notNull(),
  totalIncGst: decimal("totalIncGst", { precision: 10, scale: 2 }).notNull(),
  paymentReceived: decimal("paymentReceived", { precision: 10, scale: 2 }).default("0"),
  totalDue: decimal("totalDue", { precision: 10, scale: 2 }).default("0"),
  status: varchar("status", { length: 32 }).default("paid"),
  pdfFilename: varchar("pdfFilename", { length: 255 }),
  pdfUrl: text("pdfUrl"),
  rawText: text("rawText"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type StarlinkInvoice = typeof starlinkInvoices.$inferSelect;
export type InsertStarlinkInvoice = typeof starlinkInvoices.$inferInsert;

export const starlinkInvoiceLines = mysqlTable("starlink_invoice_lines", {
  id: int("id").autoincrement().primaryKey(),
  invoiceNumber: varchar("invoiceNumber", { length: 128 }).notNull(),
  accountNumber: varchar("accountNumber", { length: 64 }).notNull(),
  serviceLineNumber: varchar("serviceLineNumber", { length: 64 }),
  serviceNickname: varchar("serviceNickname", { length: 255 }),
  kitSerial: varchar("kitSerial", { length: 128 }),
  productDescription: text("productDescription").notNull(),
  qty: int("qty").default(1),
  unitPriceExGst: decimal("unitPriceExGst", { precision: 10, scale: 2 }),
  totalGst: decimal("totalGst", { precision: 10, scale: 2 }),
  totalIncGst: decimal("totalIncGst", { precision: 10, scale: 2 }).notNull(),
  billingPeriodStart: varchar("billingPeriodStart", { length: 32 }),
  billingPeriodEnd: varchar("billingPeriodEnd", { length: 32 }),
  lineType: varchar("lineType", { length: 32 }).default("service"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type StarlinkInvoiceLine = typeof starlinkInvoiceLines.$inferSelect;
export type InsertStarlinkInvoiceLine = typeof starlinkInvoiceLines.$inferInsert;
