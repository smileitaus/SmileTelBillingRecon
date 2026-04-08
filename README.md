# SmileTel Billing Reconciliation Platform — Lucid Portal

> **Comprehensive onboarding guide for new development environments (Replit, Manus, or self-hosted).**
> This document covers the full system architecture, database schema, API surface, supplier integrations, knowledge base, and operational context required to continue development or deploy the platform in a new environment.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Business Context and Purpose](#2-business-context-and-purpose)
3. [Technology Stack](#3-technology-stack)
4. [Repository Structure](#4-repository-structure)
5. [Architecture Overview](#5-architecture-overview)
6. [Database Schema](#6-database-schema)
7. [API Surface — tRPC Routers](#7-api-surface--trpc-routers)
8. [Application Pages and Navigation](#8-application-pages-and-navigation)
9. [Supplier Integrations](#9-supplier-integrations)
10. [Key Business Logic and Rules](#10-key-business-logic-and-rules)
11. [Current Data State — April 2026](#11-current-data-state--april-2026)
12. [Environment Variables and Secrets](#12-environment-variables-and-secrets)
13. [Getting Started on Replit](#13-getting-started-on-replit)
14. [Getting Started on a New Manus Account](#14-getting-started-on-a-new-manus-account)
15. [Monthly Reconciliation Workflow](#15-monthly-reconciliation-workflow)
16. [Known Issues and Pending Work](#16-known-issues-and-pending-work)

---

## 1. Project Overview

The **SmileTel Billing Reconciliation Platform** (internal name: **Lucid**) is a full-stack internal operations tool built for SmileIT Pty Ltd (ABN 51 123 952 232) to manage multi-supplier telecommunications billing reconciliation. It is a React 19 + Express 4 + tRPC 11 + MySQL application deployed on the Manus platform.

The platform ingests invoices from upstream wholesale telecommunications providers, matches those services to end customers across multiple billing platforms, and surfaces discrepancies between what SmileIT pays wholesale and what it charges retail. It also manages service lifecycle events (provisioning, termination, payment plans) and provides live API integrations with supplier portals.

**Current scale (April 2026):**

| Metric | Value |
|---|---|
| Total services tracked | 2,663 |
| Services matched to customers | ~2,155 (81%) |
| Monthly wholesale spend tracked | ~$97,688 |
| Active customers | 924 |
| Suppliers integrated | 10 |
| Database tables | 65+ |

---

## 2. Business Context and Purpose

SmileIT is a managed service provider (MSP) and telecommunications reseller operating across Queensland and New South Wales. It purchases wholesale telecommunications services from multiple upstream carriers and resells them to small-to-medium businesses, hospitality groups, mining operations, and franchise networks.

**The three core problems Lucid solves:**

**Cost Visibility.** SmileIT receives invoices from Telstra, AAPT, SasBoss/Access4, Vocus, ABB (Carbon API), Exetel, ChannelHaus, NetSIP, TIAB, and Starlink. Without this tool, there is no single consolidated view of total wholesale spend, making it impossible to identify cost anomalies, price increases, or services being charged that have already been terminated.

**Revenue Matching.** Xero billing line items (retail revenue) must be linked to supplier services (wholesale cost) to calculate per-service gross margin. This is done through a drag-and-drop matching workbench. The platform maintains a repeatable mapping engine so that once a service is matched, future invoice cycles auto-match without manual intervention.

**Termination Identification.** Services with no usage in 6 months are flagged for termination with full detail (phone number, SIM, IMEI, MRO contract, Early Termination Charge amounts) exported in a format ready for submission to Telstra. This directly reduces ongoing wholesale costs for services that are no longer generating revenue.

Secondary capabilities include: payment plan management for customers with outstanding balances, Omada network device monitoring, Starlink satellite broadband account management, TIAB (Telstra Indirect Access Billing) reconciliation, and Vocus mobile/NBN service tracking.

---

## 3. Technology Stack

| Layer | Technology | Version | Notes |
|---|---|---|---|
| Frontend | React | 19 | SPA served via Vite dev server |
| Language | TypeScript | 5.x | Strict mode throughout |
| Routing (client) | Wouter | 3 | Lightweight client-side routing |
| UI Components | shadcn/ui + Radix UI | Latest | Dark theme, OKLCH colour tokens |
| Styling | Tailwind CSS | 4 | CSS variables for theming |
| State / Data | tRPC + TanStack Query | 11 / 5 | End-to-end type-safe API |
| Backend | Express | 4 | Single server, no API gateway |
| Runtime | Node.js (tsx) | 22 | TypeScript executed directly |
| Database ORM | Drizzle ORM | 0.44 | Schema-first, camelCase columns |
| Database | MySQL / TiDB | 8.x | Manus-managed in production |
| File Storage | AWS S3 | — | Invoice PDFs, workbooks |
| Auth | Manus OAuth (JWT) | — | `protectedProcedure` gates mutations |
| PDF Parsing | pdf-parse | 2.4 | Custom parsers per supplier format |
| Excel Parsing | xlsx | 0.18 | SasBoss workbooks, Access4 pricebook |
| Drag-and-drop | @dnd-kit/core | 6 | Billing match workbench |
| Charts | Recharts | 2.15 | Dashboard cost/revenue bars |
| Email | SendGrid | — | Automated review and alert emails |
| Testing | Vitest | 2.1 | 20+ test files, all critical paths |

---

## 4. Repository Structure

```
SmileTelBillingRecon/
├── client/
│   ├── index.html                      ← Vite entry, Google Fonts loaded here
│   └── src/
│       ├── pages/                      ← 20+ page components (one per route)
│       │   ├── Home.tsx                ← Dashboard / landing
│       │   ├── Customers.tsx           ← Customer list with search/filter
│       │   ├── CustomerDetail.tsx      ← Per-customer service + billing detail
│       │   ├── Services.tsx            ← All services with provider filter
│       │   ├── ServiceDetail.tsx       ← Per-service detail + history
│       │   ├── BillingMatch.tsx        ← Drag-and-drop reconciliation workbench
│       │   ├── Suppliers.tsx           ← Supplier accounts overview
│       │   ├── Integrations.tsx        ← API sync status + manual triggers
│       │   ├── Termination.tsx         ← Blitz termination review
│       │   ├── Review.tsx              ← Manual QA review queue
│       │   ├── Numbers.tsx             ← DID / phone number inventory
│       │   ├── Pricebook.tsx           ← Supplier rate card browser
│       │   ├── RetailBundles.tsx       ← Retail bundle cost builder
│       │   ├── PaymentPlans.tsx        ← Customer payment plan tracker
│       │   ├── Starlink.tsx            ← Starlink account + invoice management
│       │   ├── TIAB.tsx                ← TIAB/Octane reconciliation
│       │   └── Vocus.tsx               ← Vocus mobile + NBN services
│       ├── components/                 ← Reusable UI components
│       │   ├── DashboardLayout.tsx     ← Sidebar nav + auth wrapper
│       │   ├── ReconciliationBoard.tsx ← Core matching workbench
│       │   ├── ServiceEditPanel.tsx    ← Inline service editor
│       │   ├── ProviderBadge.tsx       ← Colour-coded provider pill
│       │   ├── OmadaSitePanel.tsx      ← Omada network widget
│       │   ├── CarbonDiagnosticsPanel.tsx ← ABB diagnostic widget
│       │   └── WhyMatchedPopover.tsx   ← Match confidence explanation
│       ├── hooks/
│       │   └── useData.ts              ← Shared data-fetching hooks
│       ├── lib/
│       │   └── trpc.ts                 ← tRPC client binding
│       └── App.tsx                     ← Route definitions
├── server/
│   ├── index.ts                        ← Express entry point
│   ├── routers.ts                      ← Main tRPC router (imports sub-routers)
│   ├── db.ts                           ← Drizzle query helpers
│   ├── pdfInvoiceParser.ts             ← AAPT + Access4 PDF parsers
│   ├── billingItemParser.ts            ← Xero CSV line item parser
│   ├── vocusScraper.ts                 ← Vocus portal scraper
│   ├── vocusQuotaAlerts.ts             ← Vocus data pool alert logic
│   ├── routers/                        ← Feature sub-routers
│   │   ├── billingCycle.ts             ← Monthly billing period management
│   │   ├── internetPricebook.ts        ← NBN/internet pricebook CRUD
│   │   ├── numbers.ts                  ← DID number inventory
│   │   ├── paymentPlans.ts             ← Payment plan CRUD + tracking
│   │   ├── retailBundles.ts            ← Retail bundle builder
│   │   ├── starlink.ts                 ← Starlink accounts + invoices
│   │   ├── termination.ts              ← Termination batch management
│   │   ├── tiab.ts                     ← TIAB/Octane data sync
│   │   └── vocus.ts                    ← Vocus mobile + NBN sync
│   ├── suppliers/                      ← Supplier API clients
│   │   ├── sasboss-api.ts              ← SasBoss/Access4 REST API
│   │   ├── carbon-diagnostics.ts       ← ABB Carbon diagnostic API
│   │   ├── carbon-outage-usage.ts      ← ABB outage + usage data
│   │   ├── carbon-usage-alerts.ts      ← ABB quota threshold alerts
│   │   ├── commscode.ts                ← CommsCode number manager
│   │   ├── netsip.ts                   ← NetSIP (Aussie Broadband) SIP
│   │   ├── omada.ts                    ← TP-Link Omada SDN controller
│   │   ├── tiab.ts                     ← TIAB API client
│   │   └── vocus-api.ts                ← Vocus wholesale portal API
│   ├── starlink/
│   │   ├── apiClient.ts                ← Starlink portal API client
│   │   ├── parseInvoice.ts             ← Starlink AU invoice PDF parser
│   │   └── fuzzyMatch.ts               ← Starlink service-to-customer matcher
│   └── _core/                          ← Framework plumbing (do not edit)
│       ├── context.ts                  ← tRPC context builder
│       ├── trpc.ts                     ← publicProcedure / protectedProcedure
│       ├── oauth.ts                    ← Manus OAuth handler
│       ├── env.ts                      ← Environment variable registry
│       ├── llm.ts                      ← LLM helper (invokeLLM)
│       ├── email.ts                    ← SendGrid email helper
│       └── notification.ts             ← Owner notification helper
├── drizzle/
│   ├── schema.ts                       ← Single source of truth — all 65+ tables
│   ├── relations.ts                    ← Drizzle relation definitions
│   └── migrations/                     ← Auto-generated migration SQL
├── shared/
│   ├── const.ts                        ← Shared constants
│   ├── suppliers.ts                    ← Supplier registry constants
│   └── types.ts                        ← Shared TypeScript types
├── scripts/                            ← One-off data migration scripts
├── drizzle.config.ts
├── vite.config.ts
├── package.json
├── todo.md                             ← Live feature/bug tracking
├── ideas.md                            ← Design brainstorm archive
├── investigation_notes.txt             ← Debugging notes archive
└── recon-checklist-april-2026.md      ← Monthly reconciliation checklist
```

---

## 5. Architecture Overview

### Request Flow

```
Browser (React SPA)
    │
    │  HTTP POST /api/trpc/<procedure>
    ▼
Express Server  (server/index.ts)
    │
    │  tRPC middleware  →  context.ts (injects ctx.user from JWT cookie)
    ▼
Main Router  (server/routers.ts)
    │
    ├── Sub-routers (billing, starlink, tiab, vocus, termination, etc.)
    │
    │  Calls DB helpers
    ▼
Database Helpers  (server/db.ts)
    │
    │  Drizzle ORM queries
    ▼
MySQL / TiDB  (Manus-managed)
```

All API calls go through tRPC. There are no REST endpoints except `/api/oauth/callback` (Manus OAuth) and `/api/trpc` (tRPC batch endpoint). The frontend never queries the database directly. File uploads (invoice PDFs, XLSX workbooks) are handled via a dedicated `/api/upload` Express route that stores files in S3 and returns a URL for the tRPC layer to process.

### Authentication

Authentication is handled by Manus OAuth. The `protectedProcedure` helper in `server/_core/trpc.ts` validates the JWT session cookie on every request. The `ctx.user` object contains `openId`, `name`, `email`, and `role` (`user` | `admin`). All mutations are protected; read-only queries may be public or protected depending on sensitivity.

### Repeatable Mapping Engine

The most important architectural concept is the **repeatable mapping engine**. Every time a supplier service is matched to a customer (manually or via auto-match), the match key is stored in `supplierServiceMap`. On the next invoice upload, the system checks this table first before running fuzzy matching. This means the first import of any invoice requires manual review, but all subsequent months are largely automatic.

Match keys are stored in priority order: (1) `serviceId` — supplier-assigned service number; (2) `accessId` — NBN AVC ID or circuit ID; (3) `address` — normalised street address; (4) `yourId` — customer-assigned label.

### PDF Invoice Parsing

`server/pdfInvoiceParser.ts` contains custom parsers for each supplier's invoice format. The AAPT parser extracts service rows using regex patterns tuned to AAPT's PDF layout. The Access4 parser identifies enterprise blocks by header lines and extracts MRC, variable, and once-off charges. The Starlink parser (`server/starlink/parseInvoice.ts`) handles the Starlink AU invoice format with service line grouping.

### Auto-Match Pipeline

After every invoice import, the system runs a three-pass auto-match: (1) exact match against `supplierServiceMap`; (2) fuzzy address match with normalisation (strips "Shop", "Unit", "Level" prefixes); (3) account-based grouping for mobile SIM fleets. Matches above a 90% confidence threshold are applied automatically; matches between 70–90% are surfaced as suggestions in the Review queue.

---

## 6. Database Schema

The database contains **65+ tables** across several logical groups. All column names use camelCase. The Drizzle schema in `drizzle/schema.ts` is the single source of truth.

### Core Entities

| Table | Purpose |
|---|---|
| `users` | Manus OAuth users with `role` (user/admin) |
| `customers` | Primary entity — one per business/location consuming services |
| `locations` | Physical addresses; each belongs to one customer |
| `services` | Individual telecom services (internet, mobile, voice, UCaaS, satellite) |
| `billingItems` | Xero invoice line items representing retail revenue |
| `supplierAccounts` | Telstra account numbers and aggregate costs |

### Supplier Import Tables

| Table | Purpose |
|---|---|
| `supplierInvoiceUploads` | Tracks PDF invoice uploads with match summary |
| `supplierWorkbookUploads` | Tracks XLSX workbook uploads |
| `supplierWorkbookLineItems` | Individual line items from SasBoss workbooks |
| `carbonApiCache` | Cached ABB Carbon API responses |
| `supplierSyncLog` | Timestamped log of all API sync events |

### Mapping and Matching Tables

| Table | Purpose |
|---|---|
| `supplierServiceMap` | **Core repeatable mapping layer** — supplier service ID to customer |
| `supplierEnterpriseMap` | SasBoss enterprise name to customer |
| `supplierProductMap` | Supplier product name to internal service type |
| `supplierProductCostMap` | Access4 Diamond tier wholesale costs per product |
| `supplierRegistry` | Master list of active suppliers with metadata |
| `supplierRateCards` | Versioned rate card headers per supplier |
| `supplierRateCardItems` | Individual rate card line items |
| `serviceMatchEvents` | Audit log of every match/unmatch action |

### Billing Resolution Tables

| Table | Purpose |
|---|---|
| `serviceBillingAssignments` | Many-to-one junction: services to Xero billing items |
| `serviceBillingMatchLog` | Persistent log of service-to-billing-item resolutions |
| `unbillableServices` | Services explicitly marked as not requiring a billing item |
| `escalatedServices` | Services that could not be matched and need manual review |

### Supplier-Specific Tables

| Table | Purpose |
|---|---|
| `vocusMobileServices` | Vocus wholesale mobile SIM inventory |
| `vocusNbnServices` | Vocus wholesale NBN service inventory |
| `vocusBuckets` | Vocus shared data pool definitions |
| `vocusSyncLog` | Vocus API sync history |
| `tiabCustomers` | TIAB/Octane customer records |
| `tiabServices` | TIAB service lines |
| `tiabPlans` | TIAB rate plan definitions |
| `tiabTransactions` | TIAB transaction/charge records |
| `tiabDataPools` | TIAB shared data pool records |
| `tiabSyncLog` | TIAB sync history |
| `tiabReconIssues` | TIAB reconciliation discrepancies |
| `tiabSupplierInvoices` | TIAB supplier invoice headers |
| `tiabSupplierInvoiceLineItems` | TIAB invoice line items |
| `octaneCustomerLinks` | Octane portal customer ID mappings |
| `starlinkAccounts` | Starlink portal accounts (6 accounts) |
| `starlinkServiceLines` | Starlink service lines (15 active) |
| `starlinkTerminals` | Starlink hardware terminals |
| `starlinkUsage` | Starlink usage snapshots |
| `starlinkInvoices` | Starlink invoice headers (13 imported) |
| `starlinkInvoiceLines` | Starlink invoice line items (35 lines) |
| `omadaSites` | TP-Link Omada SDN site records |
| `omadaDeviceCache` | Cached Omada device inventory |
| `phoneNumbers` | DID / phone number inventory |

### Operational Tables

| Table | Purpose |
|---|---|
| `serviceOutages` | Carbon API outage records |
| `serviceUsageSnapshots` | Monthly usage snapshots for trend analysis |
| `carbonDiagnosticRuns` | ABB Carbon diagnostic run history |
| `usageThresholdAlerts` | Data quota alert records |
| `internetPricebookVersions` | Versioned NBN/internet pricebook headers |
| `internetPricebookItems` | Individual pricebook line items |
| `retailBundles` | Retail bundle definitions |
| `retailBundleCostInputs` | Cost inputs for retail bundle calculator |
| `terminationBatches` | Termination batch submissions |
| `paymentPlans` | Customer payment plan agreements |
| `paymentPlanInvoices` | Individual instalment records |
| `billingPeriods` | Monthly billing period definitions |
| `supplierMonthlySnapshots` | Monthly cost snapshots per supplier |
| `reconChecklistItems` | Monthly reconciliation checklist state |
| `discrepancyAlerts` | Cost discrepancy alerts (>10% month-on-month) |

---

## 7. API Surface — tRPC Routers

All procedures are defined in `server/routers.ts` and the sub-routers in `server/routers/`. The following is a summary of the available procedure namespaces.

| Namespace | Key Procedures |
|---|---|
| `auth` | `me`, `logout` |
| `system` | `notifyOwner`, `getOutboundIp` |
| `customers` | `getAll`, `getById`, `merge`, `search` |
| `services` | `getAll`, `getById`, `getByCustomer`, `updateFields`, `updateStatus`, `reassign`, `getEditHistory` |
| `billing` | `getItems`, `getByService`, `getByCustomer`, `getSummary`, `assignToCustomer`, `updateMatch`, `associateItem`, `review.*` |
| `suppliers` | `getAccounts`, `getSummary`, `uploadInvoice`, `uploadWorkbook`, `syncSasBoss`, `syncCarbon`, `syncOmada` |
| `matching` | `getUnmatched`, `getSuggested`, `assign`, `dismiss`, `previewAliasAutoMatch`, `commitAliasAutoMatch` |
| `pricebook` | `getVersions`, `getItems`, `createVersion`, `upsertItems`, `syncSasBoss` |
| `termination` | `getAll`, `createBatch`, `exportCsv`, `management.*` |
| `numbers` | `getAll`, `getByCustomer`, `import`, `assignToService` |
| `vocus` | `getMobileServices`, `getNbnServices`, `sync`, `getBuckets` |
| `tiab` | `getCustomers`, `getServices`, `getTransactions`, `sync`, `getReconIssues` |
| `starlink` | `getAccounts`, `getServiceLines`, `getInvoices`, `getInvoiceLines`, `parseInvoice`, `upsertInvoice` |
| `retailBundles` | `getAll`, `create`, `update`, `delete`, `getCostInputs` |
| `paymentPlans` | `getAll`, `create`, `update`, `recordPayment`, `getInvoices` |
| `billingCycle` | `getPeriods`, `createPeriod`, `closePeriod`, `getSnapshots` |
| `omada` | `getSites`, `getSiteDetail`, `getDevices`, `getClients`, `autoMatch`, `blockClient`, `unblockClient` |

---

## 8. Application Pages and Navigation

The application uses a persistent left sidebar (`DashboardLayout.tsx`) with the following navigation structure:

| Page | Route | Purpose |
|---|---|---|
| Dashboard | `/` | Summary stats, provider cost chart, recent activity |
| Customers | `/customers` | Searchable customer list with match status |
| Customer Detail | `/customers/:id` | Services, billing items, margin, Omada widget |
| Services | `/services` | All services with provider/status filter |
| Service Detail | `/services/:id` | Full service record, edit history, billing links |
| Billing Match | `/billing` | Drag-and-drop reconciliation workbench |
| Suppliers | `/suppliers` | Supplier account overview with cost totals |
| Integrations | `/integrations` | API sync status, manual triggers, last-synced timestamps |
| Termination | `/termination` | Blitz review — flagged services for termination |
| Review | `/review` | Manual QA queue — unresolved matching issues |
| Numbers | `/numbers` | DID/phone number inventory |
| Pricebook | `/pricebook` | Supplier rate card browser (all 6 SasBoss pricing tiers) |
| Retail Bundles | `/retail-bundles` | Bundle cost builder for franchise/retail customers |
| Payment Plans | `/payment-plans` | Outstanding balance tracker with instalment records |
| Starlink | `/starlink` | Starlink account management + invoice upload |
| TIAB | `/tiab` | TIAB/Octane reconciliation dashboard |
| Vocus | `/vocus` | Vocus mobile SIM + NBN service management |

---

## 9. Supplier Integrations

### ABB / Carbon API

The ABB (Aussie Broadband) integration uses the Carbon API to retrieve NBN service inventory, usage data, outage history, and diagnostic information. Services are identified by `carbonServiceId` and matched to the `services` table via AVC ID or address. Usage quota alerts are generated when a service exceeds a configurable threshold (default 80% of plan allowance). Source files: `server/suppliers/carbon-diagnostics.ts`, `carbon-outage-usage.ts`, `carbon-usage-alerts.ts`.

**Required secrets:** `CARBON_USERNAME`, `CARBON_PASSWORD`, `CARBON_API`, `CARBON_PASSWORD_PREFIX`, `CARBON_PASSWORD_SUFFIX`

### SasBoss / Access4

SasBoss is the UCaaS platform (hosted PBX, SIP trunks, Microsoft 365 licensing) used for the majority of SmileIT's voice customers. The integration uses the SasBoss REST API (reseller ID 2815) to sync enterprise records, service accounts, and the full product pricebook across six pricing tiers: PAYG, Bundled, and Unlimited (charge and RRP for each). Source file: `server/suppliers/sasboss-api.ts`.

**Required secrets:** `SasBoss_API_Host`, `SasBoss_Reseller_ID`, `SasBoss_User`, `SasBoss_Password`, `SasBoss_Webaddress`

### Vocus

Vocus provides wholesale mobile SIM services and NBN services. The integration authenticates against the Vocus SP portal API and syncs mobile service inventory, shared data bucket definitions, and NBN service records. Vocus is treated as the primary source of truth for mobile SIM data. Source files: `server/suppliers/vocus-api.ts`, `server/routers/vocus.ts`.

**Required secrets:** `Vocus_SP_Username`, `Vocus_SP_Password`, `Vocus_Mobile_Real_Name`

### TIAB / Octane

TIAB (Telstra Indirect Access Billing) is the mechanism by which SmileIT is billed for Telstra services via the Octane portal. The integration syncs customer records, service lines, rate plans, data pool usage, and transaction history. Reconciliation issues are surfaced in the TIAB Recon Issues table. Source files: `server/suppliers/tiab.ts`, `server/routers/tiab.ts`.

**Required secrets:** `TIAB_API_BASE_URL`, `TIAB_API_USERNAME`, `TIAB_API_PASSWORD`, `TIAB_Octane_WebAddress`, `Octane_TIAB_Angus_Username`, `Octane_TIAB_Angus_Password`

### Starlink

SmileIT manages six Starlink portal accounts covering 15 active satellite broadband service lines, primarily for remote mining and agricultural customers. The integration parses Starlink AU invoice PDFs and stores invoice headers and line items. Service lines are fuzzy-matched to customers using GPS coordinates and site nicknames. Source files: `server/starlink/`.

**Required secrets:** Six sets of `STARLINK_TOKEN_*_CLIENT_ID` and `STARLINK_TOKEN_*_SECRET` (one per portal account — see Section 12 for full list).

### Omada

TP-Link Omada SDN is used for network device management at customer sites. The integration connects to the Omada controller API to list sites, retrieve WAN status, enumerate devices and connected clients, and block/unblock clients. Omada sites are manually assigned to customers via the Integrations page UI. Source file: `server/suppliers/omada.ts`.

**Required secrets:** `OMADA_BASE_URL`, `OMADA_CLIENT_ID`, `OMADA_CLIENT_SECRET`, `OMADA_CONTROLLER_ID`

### NetSIP / Aussie Broadband SIP

NetSIP provides SIP trunking services resold under the Aussie Broadband brand. Seven SIP accounts are tracked with a combined monthly cost of approximately $1,557. DID numbers are stored in the `phoneNumbers` table and linked to services. Source file: `server/suppliers/netsip.ts`.

**Required secrets:** `NetSIP_SmileTelAPI_Login`, `NetSIP_SmileTelAPI_Password`

### CommsCode

CommsCode is the number management platform for DID inventory. The integration retrieves the full DID inventory and links numbers to services and customers. Source file: `server/suppliers/commscode.ts`.

**Required secrets:** `CommsCode_NumberManager_AccountCode`, `CommsCode_NumberManager_Login`, `CommsCode_NumberManager_Password`, `CommsCode_NumberManager_WebAddress`

### ChannelHaus / ECN

ChannelHaus provides SIP channel services (reselling ECN infrastructure). 67 services are tracked at approximately $7,387/month. Services are imported via PDF invoice parsing and matched using the repeatable mapping engine.

### DataGate

DataGate is a Telstra wholesale portal providing service inventory and billing data. The integration uses the DataGate API token for authentication.

**Required secrets:** `DataGate_API_Token`, `DataGate_Username`, `DataGate_Password`, `DataGate_Webaddress`

---

## 10. Key Business Logic and Rules

**Service Categories.** Every service is assigned a `serviceCategory` from a fixed enumeration: `voice-licensing`, `voice-usage`, `voice-numbers`, `voice-features`, `data-mobile`, `data-nbn`, `data-enterprise`, `data-usage`, `hardware`, `professional-services`, `internal`, `other`. This category drives filtering, grouping, and the billing match workbench tab layout.

**Margin Calculation.** Gross margin per service is calculated as `(billingItem.amount - service.monthlyCost) / billingItem.amount`. A service with no billing item assigned has undefined margin and appears in the "Unmatched Revenue" section of the dashboard. Negative margin (cost exceeds revenue) triggers a red indicator on the customer detail page.

**Retail Bundle Customers.** Customers billed via the Retail Bundle offering (NBN + 4G SIM + hardware + SIP + support as a single line item) are tagged with `billingPlatform = 'retail-bundle'`. Their costs are aggregated into a single bundle cost figure rather than broken out per service.

**Terminated Services.** A service is marked `status = 'terminated'` when it is actioned through the Termination page. Terminated services are excluded from margin calculations and the active service count, but remain in the database for historical reporting.

**Proportional Revenue Splitting.** When a single Xero line item (e.g., "Data — Internet $450") covers multiple services for the same customer, the revenue is split proportionally across all matched services based on their individual monthly wholesale costs.

**Stale Data Warnings.** The Integrations page displays a "last synced" timestamp for each API source. If any source has not been synced within 48 hours, a stale data banner is shown on the relevant pages (Vocus, Carbon, TIAB, Omada).

**Automated Discrepancy Alerts.** After each monthly import cycle, the system compares each supplier's invoiced total against the expected cost from service records. Any line item where the cost has moved by more than 10% month-on-month generates a `discrepancyAlert` record and triggers a summary email to `angusbs@smiletel.com.au`.

**Unmatched Service Triage.** Unmatched services are triaged using a three-pass algorithm: (1) exact service ID match against `supplierServiceMap`; (2) fuzzy address match with normalisation; (3) account-based grouping for mobile SIM fleets. Services on Telstra account 586992900 are flagged as "bulk mobile fleet — may belong to single customer" because no matched services exist on that account for reference.

**Data Source Indicators.** Each data field on the service detail page displays an information icon indicating whether the value was populated from an API sync, invoice upload, manual entry, or pricebook lookup. This helps operators understand the reliability of each data point.

---

## 11. Current Data State — April 2026

| Provider | Services | Monthly Wholesale Cost |
|---|---|---|
| ABB (Carbon API) | 274 | $24,622 |
| SasBoss / Access4 | 1,224 | $23,212 |
| Telstra (TIAB) | 626 | $20,754 |
| AAPT | 64 | $8,312 |
| ChannelHaus / ECN | 67 | $7,387 |
| Exetel | 13 | $6,658 |
| Starlink | 15 | $4,137 |
| NetSIP | 7 | $1,557 |
| Legion | 1 | $799 |
| Tech-e | 1 | $250 |
| Vocus / TIAB | 119 | Pending import |
| **Total** | **2,663** | **~$97,688/month** |

Match status: 2,155 services (81%) are matched to customers. 508 services remain unmatched, primarily mobile SIM fleets on Telstra account 586992900 that require bulk assignment.

Billing items: 1,323 Xero line items imported. Approximately 62 service-to-billing-item assignments confirmed.

---

## 12. Environment Variables and Secrets

The following environment variables are required. In Manus, these are managed via the Secrets panel. In Replit, add them to the Replit Secrets tab.

### Core Platform

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | MySQL/TiDB connection string |
| `JWT_SECRET` | Session cookie signing secret |
| `VITE_APP_ID` | Manus OAuth application ID |
| `OAUTH_SERVER_URL` | Manus OAuth backend base URL |
| `VITE_OAUTH_PORTAL_URL` | Manus login portal URL |
| `OWNER_OPEN_ID` | Owner's Manus OpenID |
| `OWNER_NAME` | Owner's display name |

### Supplier APIs

| Variable | Supplier |
|---|---|
| `CARBON_API` | ABB Carbon API base URL |
| `CARBON_USERNAME` | ABB Carbon API login |
| `CARBON_PASSWORD` | ABB Carbon API password |
| `CARBON_PASSWORD_PREFIX` | ABB password prefix |
| `CARBON_PASSWORD_SUFFIX` | ABB password suffix |
| `SasBoss_API_Host` | SasBoss API host URL |
| `SasBoss_Reseller_ID` | SasBoss reseller ID (2815) |
| `SasBoss_User` | SasBoss API username |
| `SasBoss_Password` | SasBoss API password |
| `SasBoss_Webaddress` | SasBoss portal URL |
| `Vocus_SP_Username` | Vocus SP portal username |
| `Vocus_SP_Password` | Vocus SP portal password |
| `Vocus_Mobile_Real_Name` | Vocus account real name |
| `TIAB_API_BASE_URL` | TIAB API base URL |
| `TIAB_API_USERNAME` | TIAB API username |
| `TIAB_API_PASSWORD` | TIAB API password |
| `TIAB_Octane_WebAddress` | Octane portal URL |
| `Octane_TIAB_Angus_Username` | Octane login username |
| `Octane_TIAB_Angus_Password` | Octane login password |
| `OMADA_BASE_URL` | Omada controller base URL |
| `OMADA_CLIENT_ID` | Omada OAuth client ID |
| `OMADA_CLIENT_SECRET` | Omada OAuth client secret |
| `OMADA_CONTROLLER_ID` | Omada controller ID |
| `NetSIP_SmileTelAPI_Login` | NetSIP API login |
| `NetSIP_SmileTelAPI_Password` | NetSIP API password |
| `CommsCode_NumberManager_AccountCode` | CommsCode account code |
| `CommsCode_NumberManager_Login` | CommsCode login |
| `CommsCode_NumberManager_Password` | CommsCode password |
| `CommsCode_NumberManager_WebAddress` | CommsCode portal URL |
| `DataGate_API_Token` | DataGate API token |
| `DataGate_Username` | DataGate username |
| `DataGate_Password` | DataGate password |
| `DataGate_Webaddress` | DataGate portal URL |
| `STARLINK_TOKEN_SMILEITSTARLINK_CLIENT_ID` | Starlink account 1 client ID |
| `STARLINK_TOKEN_SMILEITSTARLINK_SECRET` | Starlink account 1 secret |
| `STARLINK_TOKEN_SUPPORT_SMILEIT_CLIENT_ID` | Starlink account 2 client ID |
| `STARLINK_TOKEN_SUPPORT_SMILEIT_SECRET` | Starlink account 2 secret |
| `STARLINK_TOKEN_ORDERS_SMILEIT_CLIENT_ID` | Starlink account 3 client ID |
| `STARLINK_TOKEN_ORDERS_SMILEIT_SECRET` | Starlink account 3 secret |
| `STARLINK_TOKEN_ACCOUNTS_SMILEIT_CLIENT_ID` | Starlink account 4 client ID |
| `STARLINK_TOKEN_ACCOUNTS_SMILEIT_SECRET` | Starlink account 4 secret |
| `STARLINK_TOKEN_PJDRUMMOND_CLIENT_ID` | Starlink account 5 client ID |
| `STARLINK_TOKEN_PJDRUMMOND_SECRET` | Starlink account 5 secret |
| `STARLINK_TOKEN_PRODUCTADMIN_SMILEIT_CLIENT_ID` | Starlink account 6 client ID |
| `STARLINK_TOKEN_PRODUCTADMIN_SMILEIT_SECRET` | Starlink account 6 secret |

### Billing and Communication

| Variable | Purpose |
|---|---|
| `SendGrid_API` | SendGrid API key for automated emails |
| `SendGrid_Login` | SendGrid account login |
| `OneBill_Address` | OneBill billing platform URL |
| `OneBill_Login` | OneBill login |
| `OneBill_Password` | OneBill password |
| `MyTelstra_Login` | MyTelstra portal login |
| `MyTelstra_Password` | MyTelstra portal password |
| `MyTelstra_Webaddress` | MyTelstra portal URL |
| `TEAM_ACCESS_PASSWORD` | Internal team access password |
| `SmileTelCLIENTID` | SmileTel OAuth client ID |
| `CLIENTSECRET` | OAuth client secret |
| `InterfaceAccessAddress` | Interface access URL |
| `ChannelHaus_Username` | ChannelHaus portal username |
| `ChannelHaus_Password` | ChannelHaus portal password |
| `ChannelHaus_Address` | ChannelHaus portal URL |

---

## 13. Getting Started on Replit

### Prerequisites

Replit requires a Node.js 22 repl with a MySQL-compatible database. The recommended approach is to use an external TiDB Cloud Serverless instance (free tier available at tidbcloud.com) or a PlanetScale MySQL database.

### Step 1 — Import the Repository

Import `smileitaus/SmileTelBillingRecon` directly into Replit via **Create Repl > Import from GitHub**.

### Step 2 — Install Dependencies

```bash
npm install -g pnpm && pnpm install
```

### Step 3 — Configure Secrets

Add all environment variables from Section 12 to the Replit Secrets tab. The minimum required set to run the application is:

```
DATABASE_URL=mysql://user:password@host:3306/dbname
JWT_SECRET=<any-random-32-char-string>
VITE_APP_ID=dev
OAUTH_SERVER_URL=https://api.manus.im
VITE_OAUTH_PORTAL_URL=https://manus.im
OWNER_OPEN_ID=dev-user
OWNER_NAME=Developer
```

### Step 4 — Run Database Migrations

```bash
pnpm drizzle-kit push
```

This applies the full schema from `drizzle/schema.ts` to your database. For production migrations, generate SQL first with `pnpm drizzle-kit generate`, then review and apply the generated file.

### Step 5 — Seed Initial Data

```bash
node seed-db.mjs
```

This seeds the supplier registry, product cost maps, and initial pricebook data.

### Step 6 — Start the Development Server

```bash
pnpm dev
```

The application runs on port 3000. The Vite dev server proxies `/api` requests to the Express backend.

### Important Notes for Replit

The application was built on the Manus platform which provides managed MySQL (TiDB), S3 storage, and OAuth. On Replit, you will need to substitute the following:

**Database.** Use Replit's built-in PostgreSQL or an external MySQL/TiDB instance. If using PostgreSQL, the Drizzle schema uses MySQL-specific types (`varchar`, `decimal`, `mysqlTable`) that will need to be adapted to `pgTable` equivalents. TiDB Cloud Serverless is the recommended drop-in replacement as it is fully MySQL-compatible.

**File Storage.** Replace `server/storage.ts` S3 helpers with Replit's object storage or an external S3-compatible service (Cloudflare R2 is a cost-effective option).

**Authentication.** The Manus OAuth flow requires a valid Manus OAuth client. For Replit development, the simplest approach is to temporarily bypass authentication by hardcoding a development user in `server/_core/context.ts`, or to implement a simple username/password auth using the existing `users` table and `JWT_SECRET`.

**Email.** SendGrid integration is ready — just add the `SendGrid_API` secret.

**LLM.** The `invokeLLM` helper in `server/_core/llm.ts` uses Manus built-in API keys. On Replit, replace with a direct OpenAI or Anthropic API call using your own key.

---

## 14. Getting Started on a New Manus Account

1. Create a new Manus project and select the "Web App (tRPC + Auth + Database)" template.
2. Clone this repository into the project directory.
3. Add all secrets from Section 12 via the Manus Secrets panel.
4. Run `pnpm drizzle-kit push` to apply the schema.
5. Run `node seed-db.mjs` to seed initial data.
6. The application will be available at the Manus-assigned domain immediately.

The Manus platform automatically provides `DATABASE_URL`, `JWT_SECRET`, `VITE_APP_ID`, `OAUTH_SERVER_URL`, `VITE_OAUTH_PORTAL_URL`, `OWNER_OPEN_ID`, and `OWNER_NAME` — these do not need to be manually set.

---

## 15. Monthly Reconciliation Workflow

The following workflow is performed on the 1st–7th of each month. The full checklist is maintained in `recon-checklist-april-2026.md`.

**Days 1–3: Supplier Invoice Collection.** Collect and upload invoices from all suppliers. For API-connected suppliers (Carbon/ABB, SasBoss, TIAB, Omada), trigger a manual sync from the Integrations page. For portal-only suppliers (Telstra via MyTelstra, Vocus via SP Portal, TIAB via Octane), run the relevant scraper scripts. For invoice-only suppliers (AAPT, ChannelHaus, Starlink), upload the PDF invoices via the Suppliers page.

**Days 3–5: Revenue Import.** Export the monthly Xero invoice CSV and upload via the Billing Match page. The auto-match pipeline runs immediately after upload. Review the match summary and resolve any new unmatched items in the Review queue.

**Days 5–7: Reconciliation Review.** Open the Billing Match workbench and resolve any remaining unmatched services. Check the Discrepancy Alerts for any cost movements greater than 10%. Review the Termination page for any services flagged for termination and action them.

**Ongoing: Payment Plans.** Check the Payment Plans page for any instalments due in the current month. Mark as paid once confirmed in Xero.

---

## 16. Known Issues and Pending Work

The following items represent the current development backlog, tracked in full in `todo.md`.

**Pending supplier confirmations (SasBoss).** The per-enterprise pricing override endpoint has been noted (chargeOverriden flag) but confirmation from SasBoss TAC is pending. Historical transacted charges endpoint for closed billing periods is also pending. Webhook/event callback support for enterprise provisioning events has been raised with the SasBoss development team.

**Pending data imports.** Vocus mobile and NBN services (119 services, costs pending import), March 2026 Xero invoice CSV, and OneBill March 2026 export are all outstanding.

**Pending manual matches.** Six Starlink service lines are without confirmed customer assignments (Black Pearl x2, UQ Wildlife x2, Waratah Village x2). Approximately 508 unmatched services on Telstra account 586992900 (mobile SIM fleet) require bulk assignment to one or more customers.

**Pending SasBoss API live tests.** Pricebook sync validation (all 6 pricing tiers), pending charges export cross-reference, and enterprise list sync cross-reference are all scheduled for the next development sprint.

---

*Document maintained by the SmileIT development team. Last updated: April 2026.*
*For questions, contact angusbs@smiletel.com.au*
