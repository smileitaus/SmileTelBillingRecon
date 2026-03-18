# SmileTel Billing Reconciliation Platform

> **Comprehensive onboarding guide for new Manus accounts and development teams.**
> This document covers the full system architecture, database schema, API surface, supplier-specific logic, and operational context required to continue development or deploy the platform in a new environment.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Technology Stack](#2-technology-stack)
3. [Repository Structure](#3-repository-structure)
4. [Architecture Overview](#4-architecture-overview)
5. [Database Schema](#5-database-schema)
6. [API Surface (tRPC Routers)](#6-api-surface-trpc-routers)
7. [Application Pages & Navigation](#7-application-pages--navigation)
8. [Supplier-Specific Logic](#8-supplier-specific-logic)
9. [Key Business Concepts](#9-key-business-concepts)
10. [Current Data State](#10-current-data-state)
11. [Environment Variables & Secrets](#11-environment-variables--secrets)
12. [Getting Started on a New Manus Account](#12-getting-started-on-a-new-manus-account)
13. [Known Issues & Next Steps](#13-known-issues--next-steps)

---

## 1. Project Overview

The SmileTel Billing Reconciliation Platform is an internal operations tool built for SmileIT to manage multi-supplier telecommunications billing. Its core purpose is to ingest invoices from upstream wholesale providers, match those services to customers across multiple billing platforms, and surface discrepancies between what SmileIT pays wholesale and what it charges retail.

**The three core problems it solves:**

1. **Cost visibility** — SmileIT receives invoices from Telstra, AAPT, SasBoss/Access4, Vocus, ABB, Exetel, Channel Haus, and others. Without this tool, there is no single view of total wholesale spend.
2. **Revenue matching** — Xero billing line items (retail revenue) must be linked to supplier services (wholesale cost) to calculate per-service margin. This is done through a drag-and-drop matching workbench.
3. **Termination identification** — Services with no usage in 6 months are flagged for termination, with full detail (SIM, IMEI, MRO contract, ETC amounts) exported for submission to Telstra.

**Current scope (as of March 2026):**

| Provider | Services | Monthly Wholesale Cost |
|---|---|---|
| ABB | 274 | $24,622 |
| SasBoss / Access4 | 1,224 | $23,212 |
| Telstra | 626 | $20,754 |
| AAPT | 64 | $8,312 |
| Channel Haus | 67 | $7,387 |
| Exetel | 13 | $6,658 |
| Legion | 1 | $799 |
| Tech-e | 1 | $250 |
| Vocus / TIAB | 119 | $0 (pending import) |
| **Total** | **2,663** | **~$91,405/month** |

---

## 2. Technology Stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend | React 19, TypeScript, Vite 7 | SPA served via Vite dev server |
| Routing | Wouter 3 | Lightweight client-side routing |
| UI Components | shadcn/ui, Radix UI, Tailwind CSS 4 | Dark theme, OKLCH colour tokens |
| State / Data | tRPC 11, TanStack Query 5 | End-to-end type-safe API |
| Backend | Express 4, tsx (Node.js 22) | Single Express server, no separate API gateway |
| Database ORM | Drizzle ORM 0.44 | Schema-first, migrations via `pnpm db:push` |
| Database | MySQL / TiDB (Manus-managed) | camelCase column names throughout |
| File Storage | AWS S3 (Manus-managed) | Invoice PDFs and workbooks stored as S3 objects |
| Auth | Manus OAuth (JWT cookies) | `protectedProcedure` gates all mutations |
| PDF Parsing | pdf-parse 2.4 | Custom parser in `server/pdfInvoiceParser.ts` |
| Excel Parsing | xlsx 0.18 | Used for SasBoss Dispatch/Pivot workbooks and Access4 pricebook |
| Drag-and-drop | @dnd-kit/core 6 | Used on the Billing Match workbench |
| Charts | Recharts 2.15 | Dashboard provider cost bars |
| Testing | Vitest 2.1 | 15+ test files covering all critical paths |

---

## 3. Repository Structure

```
billing-tool/
├── client/
│   ├── src/
│   │   ├── pages/          ← All 20 page components (one per route)
│   │   ├── components/     ← Shared UI components (DashboardLayout, shadcn/ui)
│   │   ├── _core/hooks/    ← useAuth hook
│   │   ├── lib/trpc.ts     ← tRPC client binding
│   │   ├── App.tsx         ← Route definitions
│   │   └── index.css       ← Global Tailwind theme (dark mode, OKLCH tokens)
│   └── index.html
├── server/
│   ├── routers.ts          ← All tRPC procedures (~23 router namespaces)
│   ├── db.ts               ← All database query helpers (~8,000 lines)
│   ├── pdfInvoiceParser.ts ← AAPT and Access4 PDF parsing logic
│   ├── storage.ts          ← S3 upload/download helpers
│   ├── index.ts            ← Express server entry point
│   ├── _core/              ← Framework plumbing (OAuth, context, LLM, env)
│   └── *.test.ts           ← Vitest test files
├── drizzle/
│   ├── schema.ts           ← Single source of truth for all 23 DB tables
│   ├── migrations/         ← Auto-generated migration SQL files
│   └── relations.ts        ← Drizzle relation definitions
├── shared/
│   ├── const.ts            ← Shared constants (error messages, etc.)
│   └── types.ts            ← Shared TypeScript types
├── drizzle.config.ts       ← Drizzle Kit configuration
├── vite.config.ts          ← Vite build configuration
├── package.json
└── todo.md                 ← Live feature/bug tracking list
```

---

## 4. Architecture Overview

### Request Flow

```
Browser (React SPA)
    │
    │  HTTP POST /api/trpc/<procedure>
    ▼
Express Server (server/index.ts)
    │
    │  tRPC middleware
    ▼
Router (server/routers.ts)
    │
    │  Calls DB helpers
    ▼
Database Helpers (server/db.ts)
    │
    │  Drizzle ORM queries
    ▼
MySQL / TiDB (Manus-managed)
```

All API calls go through tRPC. There are no REST endpoints except `/api/oauth/callback` (Manus OAuth) and `/api/trpc` (tRPC batch endpoint). The frontend never calls the database directly.

### Authentication

Authentication is handled by Manus OAuth. The `protectedProcedure` helper in `server/_core/trpc.ts` validates the JWT session cookie on every mutation. The `ctx.user` object is available in all protected procedures and contains `openId`, `name`, `email`, and `role` (`user` | `admin`).

### PDF Invoice Parsing

`server/pdfInvoiceParser.ts` contains two parsers:

- **AAPT parser** — extracts service rows from AAPT itemised invoices. Each row contains a Service ID, Access ID, product type, address, and monthly charge. The parser uses regex patterns tuned to AAPT's PDF layout.
- **Access4 parser** — extracts enterprise-level MRC (Monthly Recurring Charge), variable charges, and once-off charges from Access4 consolidated invoices. Each enterprise block is identified by its header line and terminated by the next enterprise or page break.

### Repeatable Mapping Engine

The most important architectural concept is the **repeatable mapping engine**. Every time a supplier service is matched to a customer (manually or automatically), the match key is stored in `supplier_service_map`. On the next invoice upload, the system checks this table first before running fuzzy matching. This means the first import of any invoice requires manual review, but all subsequent months are largely automatic.

Match keys are stored in priority order:
1. `service_id` — AAPT service number (most reliable)
2. `access_id` — AAPT access circuit ID / NBN AVC ID
3. `address` — normalised street address (reliable for FAST Fibre)
4. `your_id` — customer-assigned label (useful hint only)

---

## 5. Database Schema

The database contains **23 tables**. All column names use camelCase (matching the Drizzle schema definition). Below is a description of each table, its purpose, and current record count.

### Core Entities

| Table | Records | Purpose |
|---|---|---|
| `users` | 5 | Manus OAuth users with `role` (user/admin) |
| `customers` | 924 | Primary entity — one per business/location consuming services |
| `locations` | 77 | Physical addresses; each belongs to one customer |
| `services` | 2,663 | Individual telecom services (internet, mobile, voice, UCaaS) |
| `billing_items` | 1,323 | Xero invoice line items representing retail revenue |
| `supplier_accounts` | 8 | Telstra account numbers and their aggregate costs |

### Supplier Import Tables

| Table | Records | Purpose |
|---|---|---|
| `supplier_invoice_uploads` | 2 | Tracks PDF invoice uploads (AAPT, Access4) with match summary |
| `supplier_workbook_uploads` | 2 | Tracks XLSX workbook uploads (SasBoss Dispatch/Pivot) |
| `supplier_workbook_line_items` | 911 | Individual line items from SasBoss workbooks |

### Mapping & Matching Tables

| Table | Records | Purpose |
|---|---|---|
| `supplier_service_map` | 118 | **Core repeatable mapping layer** — supplier service ID → customer |
| `supplier_enterprise_map` | 104 | SasBoss enterprise name → customer (for workbook imports) |
| `supplier_product_map` | 52 | Supplier product name → internal service type classification |
| `supplier_product_cost_map` | 204 | Access4 Diamond tier wholesale costs per product (108 products seeded) |
| `supplier_registry` | 3 | Master list of active suppliers with metadata and upload config |

### Billing Resolution Tables

| Table | Records | Purpose |
|---|---|---|
| `service_billing_assignments` | 62 | Many-to-one junction: services → Xero billing items (for margin calc) |
| `service_billing_match_log` | 62 | Persistent log of service-to-billing-item resolutions |
| `unbillable_services` | 0 | Services explicitly marked as not requiring a billing item |
| `escalated_services` | 1 | Services that could not be matched and need manual review |

### Audit & Review Tables

| Table | Records | Purpose |
|---|---|---|
| `review_items` | 99 | User-submitted review items and dismissed system issues |
| `billing_platform_checks` | 48 | Action items for manual verification on billing platforms |
| `service_edit_history` | 227 | Full audit trail of all manual edits to service records |
| `service_cost_history` | 134 | Snapshots of cost changes (before any override) |
| `customer_proposals` | 35 | New customer creation requests pending approval |

### Key Field Definitions

The following fields appear across multiple tables and carry specific business meaning:

| Field | Type | Meaning |
|---|---|---|
| `monthlyCost` | decimal(10,2) | **Wholesale cost to SmileIT** — what SmileIT pays the supplier |
| `monthlyRevenue` | decimal(10,2) | **Retail price charged to customers** — from Xero billing items |
| `marginPercent` | decimal(10,2) | `(monthlyRevenue - monthlyCost) / monthlyRevenue * 100` |
| `costSource` | varchar(32) | Where the cost figure came from (see values below) |
| `provider` | varchar(64) | Upstream supplier name (Telstra, AAPT, SasBoss, ABB, etc.) |
| `status` | varchar(32) | Service lifecycle: `active`, `unmatched`, `flagged`, `terminated` |
| `externalId` | varchar(32) | Stable unique identifier used across all cross-table references |

**`costSource` values:**

| Value | Meaning |
|---|---|
| `access4_diamond_pricebook_excel` | Cost set from Access4 Diamond Advantage Pricebook v3.4 |
| `access4_invoice_corrected` | Cost corrected after Access4 PDF invoice import |
| `supplier_invoice` | Cost extracted directly from supplier invoice |
| `retail_only_no_wholesale` | Retail revenue known but no wholesale cost determined |
| `carbon_api` | Cost from ABB Carbon API sync |
| `manual` | Cost set manually by a user |
| `unknown` | No cost source determined |

---

## 6. API Surface (tRPC Routers)

All procedures are defined in `server/routers.ts` and grouped into the following namespaces. All procedures except `auth.me` and `auth.logout` require authentication.

| Namespace | Key Procedures | Purpose |
|---|---|---|
| `auth` | `me`, `logout` | Session management |
| `billing` | `summary` | Dashboard totals (total cost, matched %, unmatched count) |
| `customers` | `list`, `byId`, `create`, `update`, `services`, `locations` | Customer CRUD and service lookups |
| `customers.proposals` | `submit`, `list`, `approve`, `reject`, `assignToExisting` | New customer creation workflow with approval gate |
| `customers.billingAssignments` | `billingItemsWithAssignments`, `assignServiceToBillingItem`, `removeAssignment` | Drag-and-drop billing match workbench |
| `services` | `list`, `byId`, `updateFields`, `flagForTermination`, `bulkFlag` | Service CRUD, termination flagging |
| `unmatched` | `list`, `assignToCustomer`, `createAndAssign` | Unmatched service triage and assignment |
| `billingItems` | `list`, `byCustomer`, `import` | Xero billing item management |
| `margin` | `getServicesWithMargin`, `getSummary` | Revenue & Margin page data |
| `review` | `list`, `submit`, `resolve`, `ignore` | Review queue management |
| `platformChecks` | `list`, `action`, `dismiss` | Billing platform action item tracking |
| `autoMatch` | `run`, `preview` | Fuzzy auto-match engine for services → customers |
| `addressMatch` | `run` | Address-based matching for AAPT/NBN services |
| `workbookMatching` | `getCustomerWorkbook`, `confirmMatch`, `skipMatch` | SasBoss workbook per-customer matching |
| `xeroContacts` | `import`, `list` | Xero contact name import for customer matching |
| `serviceBillingMatch` | `getUnmatched`, `link`, `markUnbillable`, `escalate` | Service-to-billing-item resolution workflow |
| `aapt` | `import`, `getStats`, `getUnmatched`, `assignToCustomer`, `getMappingRules` | AAPT invoice import and assignment |
| `supplierRegistry` | `list`, `upsert` | Supplier master list management |
| `productCosts` | `list`, `upsert`, `importPricebook` | Access4 Diamond pricebook management |
| `blitz` | `import`, `getTerminationList`, `exportCsv` | Telstra Blitz report import and termination export |
| `merge` | `preview`, `execute` | Customer merge (deduplication) workflow |

---

## 7. Application Pages & Navigation

The application uses a persistent sidebar layout (`DashboardLayout`) with the following pages:

| Route | Page Component | Purpose |
|---|---|---|
| `/` | `Dashboard` | Overview: total spend, matched %, provider breakdown chart, service type breakdown |
| `/customers` | `CustomerList` | Searchable/filterable customer list with unmatched billing indicators |
| `/customers/:id` | `CustomerDetail` | Customer profile with services, locations, billing items, and edit panel |
| `/customers/:id/billing-match` | `CustomerBillingMatch` | Drag-and-drop workbench to link services to Xero billing items |
| `/services/:id` | `ServiceDetail` | Full service record with edit panel and audit history |
| `/unmatched` | `UnmatchedServices` | Triage view for services not yet assigned to a customer |
| `/revenue` | `RevenueMargin` | Revenue & Margin analysis — cost vs revenue per service/provider |
| `/billing` | `BillingUnmatched` | Xero billing items with no linked service (revenue leakage detection) |
| `/billing-queue` | `UnmatchedBillingQueue` | Global queue of unmatched and escalated billing items |
| `/review` | `Review` | User-submitted review items and system-detected issues |
| `/platform-checks` | `BillingPlatformChecks` | Action items for manual verification on billing platforms |
| `/auto-match` | `AutoMatch` | Bulk fuzzy auto-match engine with preview and confirmation |
| `/service-billing-match` | `ServiceBillingMatch` | Global service-to-billing-item resolution workbench |
| `/supplier-invoices` | `SupplierInvoices` | Upload history for all supplier invoices |
| `/suppliers` | `Suppliers` | Supplier management: AAPT invoice uploader, Access4 pricebook, mapping rules |
| `/blitz-termination` | `BlitzTerminationReview` | Telstra Blitz termination candidates with CSV export |
| `/merge` | `CustomerMerge` | Customer deduplication tool |

---

## 8. Supplier-Specific Logic

### Telstra (Blitz Reports)

Telstra services are imported from the monthly **Blitz Summary XLSX report** via the `/blitz-termination` page. The import function (`importBlitzReport` in `server/db.ts`) processes the report and:

- Creates or updates service records with 20+ Blitz-specific fields (IMEI, device name, MRO contract, ETC amount, usage averages).
- Flags services with `blitzNoUse6m = 1` (no usage in 6 months) as termination candidates with a generated `terminationNote`.
- The termination note includes: customer name, phone number, SIM serial, IMEI, last used date, MRO contract flag, MRO end date, and ETC amount — sufficient for submission to Telstra.
- A CSV export is available at `/blitz-termination` for direct submission.

**Current state:** 221 services imported from March 2026 Blitz report; 147 flagged for termination.

### AAPT (PDF Itemised Invoices)

AAPT invoices are uploaded as PDFs via the Suppliers page. The parser (`parseAaptInvoice` in `server/pdfInvoiceParser.ts`) extracts:

- Service ID, Access ID, product type, "Your ID" label, address, and monthly charge per service row.
- Invoice header data: invoice number, account number, billing period, total amount.

After parsing, the import function (`importAaptInvoice` in `server/db.ts`):
1. Checks `supplier_service_map` for existing mapping rules (by service_id, access_id, or address).
2. Auto-applies matched rules without user intervention.
3. For unmatched services, creates records with `status = 'unmatched'` for manual assignment.
4. Every manual assignment saves a new mapping rule for future imports.

**Current state:** 64 services, 37 mapping rules, 14 matched to customers, 50 unmatched (IP-Line backbone services with no address identifier).

### SasBoss / Access4 (XLSX Workbooks + PDF Invoices)

SasBoss billing involves **two separate data sources** that must be combined:

**1. SasBoss Dispatch/Pivot XLSX workbooks** (uploaded via Suppliers page):
- Contain **retail revenue** — what SmileIT charges customers for UCaaS services.
- Stored in `monthlyRevenue` field on service records.
- Enterprise names are matched to customers via `supplier_enterprise_map` (persistent mapping).
- The Pivot sheet contains per-enterprise product totals; the Dispatch sheet contains individual service line items.

**2. Access4 PDF invoices** (uploaded via Suppliers page):
- Contain **wholesale costs** — what SmileIT pays Access4 for UCaaS services.
- Stored in `monthlyCost` field on service records.
- Parsed by `parseAccess4Invoice` in `server/pdfInvoiceParser.ts`.
- Enterprise-level MRC (ex-GST) is the wholesale cost figure used.

**3. Access4 Diamond Advantage Pricebook v3.4** (seeded once):
- 108 products with Diamond tier wholesale costs stored in `supplier_product_cost_map`.
- Used as a fallback when the Access4 invoice doesn't have a per-service cost breakdown.
- Products include UCaaS licensing (SmileTel Essential $9/mo, Executive User $15/mo), SIP trunks, call queues, etc.

**Important:** SasBoss Pivot/Dispatch data is **retail revenue** (not wholesale cost). This was a critical data model correction made in March 2026 — earlier imports incorrectly stored retail totals in `monthlyCost`. The `costSource` field tracks this: services with `retail_only_no_wholesale` have revenue but no confirmed wholesale cost.

**Current state:** 1,224 services, $23,212/month wholesale cost (Diamond tier), $110,687/month retail revenue.

### ABB (Carbon API)

ABB services are sourced from the **Carbon API** (SmileIT's ABB reseller portal). The Carbon API fields on the `services` table (`carbonServiceId`, `carbonServiceType`, `carbonStatus`, `avcId`, `technology`, `speedTier`, etc.) are populated from this API. Cost source is `carbon_api`. 274 services, $24,622/month.

### Other Providers

Channel Haus (67 services, $7,387/month), Exetel (13 services, $6,658/month), and Vocus/TIAB (119 services, $0 pending import) are present in the database but their invoice import workflows are not yet fully built. Services exist with cost data but may require manual cost assignment.

---

## 9. Key Business Concepts

### Cost vs Revenue Model

The platform distinguishes strictly between:

- **`monthlyCost`** — what SmileIT pays the upstream supplier (wholesale). This is the authoritative cost figure and must come from supplier invoices or the Access4 pricebook.
- **`monthlyRevenue`** — what SmileIT charges the customer (retail). This comes from Xero billing items linked via `service_billing_assignments`.
- **Margin** — calculated as `(monthlyRevenue - monthlyCost) / monthlyRevenue * 100`. Only meaningful when both fields are populated.

### Service-to-Billing-Item Assignment

The core matching workflow links supplier services (costs) to Xero billing items (revenue). This is a **many-to-one** relationship: multiple services can be bundled under a single Xero line item (e.g., a "Hosted Voice Bundle" billing item might cover 10 individual SIP extensions).

The assignment is stored in `service_billing_assignments`. Once assigned, the service's `monthlyRevenue` is set to the billing item's `lineAmount` divided by the number of assigned services (or the full amount if it's a 1:1 match).

Unresolved services appear in the Billing Queue (`/billing-queue`) and can be:
1. **Linked** to an existing Xero billing item (drag-and-drop on `/customers/:id/billing-match`)
2. **Marked as intentionally unbilled** (e.g., internal use, bundled into another item)
3. **Escalated** for manual review (stored in `escalated_services`)

### Repeatable Mapping

Every confirmed match — whether service-to-customer or service-to-billing-item — is stored as a mapping rule. Future invoice uploads consult these rules first, enabling largely automatic processing after the first manual import. This is the primary mechanism for reducing ongoing operational overhead.

### Termination Workflow

Telstra services flagged for termination (`status = 'flagged'`) appear on the Blitz Termination Review page. The page provides:
- Full service detail (phone, SIM, IMEI, device, MRO contract, ETC)
- Customer assignment (or "Unassigned" if not yet matched)
- Last used date and usage averages
- CSV export formatted for Telstra submission

---

## 10. Current Data State

As of the March 2026 import cycle, the database contains the following data:

| Metric | Value |
|---|---|
| Total services | 2,663 |
| Matched to customers | 2,155 (81%) |
| Unmatched (no customer) | 327 |
| Flagged for termination | 176 |
| Total monthly wholesale spend | ~$91,405 |
| Xero billing items loaded | 1,323 |
| Services linked to billing items | 62 |
| Mapping rules saved | 118 |
| Customers | 924 |

**Data quality notes:**

- **AAPT:** 50 services are unmatched because they are IP-Line backbone/link services with no address or customer-identifiable field. These require manual assignment via Suppliers → AAPT → Unmatched tab.
- **SasBoss:** 32 services have `costSource = 'retail_only_no_wholesale'` — retail revenue is known but no matching wholesale cost was found in the Access4 invoice. These need manual cost assignment from the pricebook.
- **Telstra:** 147 services are flagged for termination (no usage in 6 months). 140 of these are unassigned to a customer.
- **Revenue & Margin:** Only 62 services have been linked to Xero billing items. The remaining ~2,600 services have `monthlyRevenue = 0` and will show as "Revenue Unknown" on the Revenue & Margin page until linked.

---

## 11. Environment Variables & Secrets

The following environment variables are required. On Manus, these are injected automatically from the platform secrets store.

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes | MySQL/TiDB connection string |
| `JWT_SECRET` | Yes | Session cookie signing secret |
| `VITE_APP_ID` | Yes | Manus OAuth application ID |
| `OAUTH_SERVER_URL` | Yes | Manus OAuth backend base URL |
| `VITE_OAUTH_PORTAL_URL` | Yes | Manus login portal URL (frontend) |
| `OWNER_OPEN_ID` | Yes | Owner's Manus OpenID |
| `OWNER_NAME` | Yes | Owner's display name |
| `BUILT_IN_FORGE_API_URL` | Yes | Manus built-in API base URL |
| `BUILT_IN_FORGE_API_KEY` | Yes | Bearer token for server-side Manus APIs |
| `VITE_FRONTEND_FORGE_API_KEY` | Yes | Bearer token for frontend Manus APIs |
| `VITE_FRONTEND_FORGE_API_URL` | Yes | Frontend Manus API base URL |
| `CARBON_USERNAME` | Optional | ABB Carbon API username (for ABB service sync) |
| `CARBON_PASSWORD` | Optional | ABB Carbon API password |
| `Carbon_SmiletelAPI` | Optional | ABB Carbon API endpoint |
| `VITE_APP_TITLE` | Optional | App title shown in browser tab |
| `VITE_APP_LOGO` | Optional | App logo URL |

---

## 12. Getting Started on a New Manus Account

### Step 1: Import from GitHub

In the new Manus account, create a new project and import from:
```
https://github.com/smileitaus/SmileTelBillingRecon
```

### Step 2: Initialise the Database

After the project is created, run the database migration to create all 23 tables:

```bash
pnpm db:push
```

This runs `drizzle-kit generate && drizzle-kit migrate` and creates the full schema from `drizzle/schema.ts`.

### Step 3: Seed the Access4 Pricebook

The Access4 Diamond Advantage Pricebook (108 products) needs to be re-seeded. Upload the pricebook XLSX via:

**Suppliers page → Access4 Diamond Pricebook panel → Upload Pricebook**

The file is: `Access4AdvantagePricebookAUDv3.4.xlsx`

### Step 4: Re-import Supplier Invoices

Re-import the supplier invoices in this order (each builds on the previous):

1. **SasBoss Dispatch/Pivot XLSX** — via Suppliers page → SasBoss panel
2. **Access4 PDF invoice** — via Suppliers page → Access4 panel (sets wholesale costs)
3. **AAPT PDF invoice** — via Suppliers page → AAPT panel
4. **Telstra Blitz XLSX** — via Blitz Termination Review page → Import Blitz Report

### Step 5: Re-import Xero Billing Items

Upload the Xero invoice export CSV via the Billing Items import. This populates `billing_items` with retail revenue data.

### Step 6: Run Auto-Match

Navigate to `/auto-match` and run the fuzzy auto-match engine. This will attempt to match unmatched services to customers based on name similarity, address, and phone number.

### Step 7: Manual Assignment

For remaining unmatched services, use:
- **Unmatched Services** (`/unmatched`) — assign services to customers
- **Suppliers → AAPT → Unmatched tab** — assign AAPT backbone services

---

## 13. Known Issues & Next Steps

### Active Issues

| Issue | Status | Location |
|---|---|---|
| 50 AAPT services unmatched (IP-Line backbone) | Open | Suppliers → AAPT → Unmatched |
| 32 SasBoss services with no wholesale cost | Open | Revenue & Margin → filter by `retail_only_no_wholesale` |
| 147 Telstra services flagged for termination | Pending submission | Blitz Termination Review → Export CSV |
| ~2,600 services with no Xero billing item linked | Ongoing | Billing Match workbench |

### Planned Enhancements

1. **Xero API integration** — direct OAuth connection to Xero to auto-import billing items monthly, eliminating the manual CSV export/import step.
2. **Vocus invoice import** — build PDF parser for Vocus invoices (119 services currently have $0 wholesale cost).
3. **Monthly reconciliation workflow** — a guided wizard that walks through each supplier's invoice upload, auto-applies mapping rules, and surfaces only the exceptions requiring manual review.
4. **Margin alerts** — automated notifications when a service's margin drops below a threshold (e.g., below 10% or negative).
5. **Carbon API sync** — scheduled sync of ABB service costs from the Carbon API to keep wholesale costs current.

### Data Transfer Note

When transferring to a new Manus account, the **database is not included in the GitHub repository**. All data must be re-imported from the original supplier invoice files. The mapping rules stored in `supplier_service_map` and `supplier_enterprise_map` are the most valuable operational data — once re-imported, subsequent monthly invoice uploads will be largely automatic.

---

*Document prepared March 2026. For questions about the platform, contact the SmileIT operations team.*
