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
