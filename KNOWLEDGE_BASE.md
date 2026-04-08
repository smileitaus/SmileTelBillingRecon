# Knowledge Base — SmileTel Billing Reconciliation Platform

> This document captures the accumulated business rules, operational context, and domain knowledge embedded in the Lucid platform. It is intended for developers who need to understand the "why" behind implementation decisions, and for operators who need a reference for edge cases and exceptions.

---

## 1. Company and Account Context

**SmileIT Pty Ltd** (ABN 51 123 952 232) is the legal entity that holds all supplier contracts and is the billing entity for all customer invoices. The trading name used with customers is **SmileTel**. The internal operations tool is named **Lucid**.

The primary operational contact for billing reconciliation is **Angus** (`angusbs@smiletel.com.au`). Automated alert emails and discrepancy summaries are sent to this address.

SmileIT operates as a reseller under multiple wholesale agreements. The key supplier relationships are:

- **Telstra (via TIAB/Octane)** — Mobile SIM, NBN, and enterprise data services. Billed monthly in arrears via the Octane portal.
- **ABB (Aussie Broadband, via Carbon API)** — NBN services. Billed monthly. Carbon API provides real-time service status and usage data.
- **SasBoss/Access4** — UCaaS (hosted PBX, SIP trunks, Microsoft 365). Billed monthly via the SasBoss portal. Reseller ID is 2815.
- **Vocus** — Wholesale mobile SIM and NBN. Billed monthly via the Vocus SP portal.
- **ChannelHaus/ECN** — SIP channels. ChannelHaus is the billing entity; ECN is the underlying infrastructure provider.
- **Starlink** — Satellite broadband for remote sites. Six portal accounts managed separately.
- **AAPT** — Legacy enterprise broadband and voice services. Invoice-only (no API).
- **Exetel** — NBN and business broadband. Invoice-only.
- **NetSIP** — SIP trunking (Aussie Broadband brand). Seven accounts.

---

## 2. Customer Data Rules

**One customer per ABN, not per site.** The `customers` table represents a business entity, not a physical location. A hospitality group with 10 restaurants is one customer with 10 services (or 10 locations). The `locations` table stores physical addresses; the `services` table stores individual services at those locations.

**Exception: Franchise networks.** For franchise networks (e.g., Zambrero, Little Cha), each franchisee is treated as a separate customer because they have separate billing relationships with SmileIT. The franchisor (head office) may appear as a separate customer for head-office services.

**Customer naming convention.** Customer names in the database should match the legal entity name as it appears on Xero invoices. Abbreviations and trading names are stored in the `tradingName` field. The `externalId` field is a stable, human-readable identifier in the format `C-XXXXXX` (e.g., `C-0057` for CDI Lawyers).

**Terminated customers.** When a customer churns, their services are marked `status = 'terminated'` but the customer record is retained. This preserves historical billing data and prevents orphaned service records.

**SmileIT as vendor.** In some cases, SmileIT appears as both vendor and customer in the data (e.g., for internal services or test accounts). When populating customer fields in these scenarios, use the actual end customer's information, not SmileIT's.

---

## 3. Service Data Rules

**Service categories.** The `serviceCategory` field uses a fixed enumeration. The mapping from supplier product names to categories is maintained in `supplierProductMap`. When a new product is encountered, it must be added to this table before it will be correctly categorised.

**Cost source hierarchy.** When multiple cost sources are available for a service, the following priority order applies:

1. `carbon_api` — ABB Carbon API is the most reliable source for ABB services.
2. `access4_invoice_corrected` — A cost corrected after reviewing the Access4 invoice.
3. `access4_diamond_pricebook_excel` — The Access4 Diamond Advantage Pricebook v3.4.
4. `supplier_invoice` — Cost extracted from any supplier invoice.
5. `manual` — Manually entered by a user.
6. `unknown` — No cost source determined; treat with caution.

**Zero-cost services.** Services with `monthlyCost = 0` are flagged with an amber warning indicator. They may represent: (a) services where the cost has not yet been determined; (b) services included in a bundle where the cost is allocated to the bundle; or (c) genuinely free services (e.g., internal test lines). Zero-cost services are excluded from margin calculations to avoid division-by-zero errors.

**Unmatched services.** A service is `status = 'unmatched'` when it has been imported from a supplier invoice but has not yet been assigned to a customer. Unmatched services appear in the Unmatched Services triage view and do not contribute to any customer's cost or margin figures.

**Service expansion.** Services can be expanded in the UI to show additional detail fields. Removing a service from a customer (reassigning it) unlinks it from the customer and returns it to the unmatched pool, where it can be assigned to a different customer.

---

## 4. Billing and Revenue Rules

**Xero is the source of truth for revenue.** All retail revenue figures come from Xero invoice exports. The Xero CSV import maps line item descriptions to services using the repeatable mapping engine. Xero contact names are imported to assist with customer matching.

**Billing platform field.** The `billingPlatform` field on the `services` table indicates which platform generates the retail invoice for this service. Known values are: `xero`, `onebill`, `retail-bundle`, `internal`, `unknown`. This field is used to determine which revenue source to look in when calculating margin.

**Retail bundle customers.** Customers on the Retail Bundle offering are billed a single monthly fee that covers NBN, 4G SIM, hardware, SIP channels, and support. The bundle cost is calculated using the Retail Bundles page, which takes individual component costs and adds a margin. These customers are tagged `billingPlatform = 'retail-bundle'` and their services are grouped under a single billing item.

**Proportional revenue splitting.** When a single Xero line item covers multiple services (e.g., "Data — Internet $450" covering three NBN services for the same customer), the revenue is split proportionally based on each service's `monthlyCost`. This split is recalculated on every read and is not stored in the database.

**Automated matching after Xero import.** Every Xero CSV import triggers an immediate auto-match run. This ensures that previously confirmed matches are applied to new invoice lines without manual intervention.

---

## 5. Termination Rules

**Termination criteria.** A service is flagged as a termination candidate when the Blitz report indicates `blitzNoUse6m = 1` (no usage in the past 6 months). Additional criteria may include: `blitzNoUse3m = 1` (no usage in 3 months) for higher-cost services, or manual flagging by an operator.

**Termination workflow.** The termination workflow has three stages: (1) **Flagged** — the service is identified as a candidate; (2) **Reviewed** — an operator has confirmed the termination is appropriate; (3) **Submitted** — the termination request has been submitted to Telstra. Each stage is tracked in the `terminationBatches` table.

**ETC (Early Termination Charge).** The Blitz report includes the ETC amount for each service still under an MRO (Minimum Retention Obligation) contract. Services with a non-zero ETC are highlighted in the termination review to ensure operators consider the cost before proceeding.

**Termination CSV format.** The CSV export from the Termination page is formatted for direct submission to Telstra. It includes: service number, SIM serial, IMEI, device name, MRO flag, MRO end date, ETC amount, last used date, and customer name.

---

## 6. Supplier-Specific Rules

### ABB / Carbon API

The Carbon API uses a session-based authentication that expires after a period of inactivity. The API client (`server/suppliers/carbon-diagnostics.ts`) re-authenticates automatically when a 401 response is received. The password for the Carbon API is assembled from three parts: `CARBON_PASSWORD_PREFIX` + `CARBON_PASSWORD` + `CARBON_PASSWORD_SUFFIX`. This split is intentional for security reasons.

ABB NBN services are identified by their AVC ID (format: `VIC-XX-XXXX-XXXX-X` or similar). The AVC ID is stored in the `avcId` field on the `services` table and is the primary match key for ABB services.

### SasBoss / Access4

SasBoss uses the term "enterprise" for what Lucid calls a "customer". The `supplierEnterpriseMap` table maps SasBoss enterprise names to Lucid customer `externalId` values. Enterprise names in SasBoss can change (e.g., when a customer rebrands), so this mapping must be updated when name changes are detected.

The SasBoss pricebook has six pricing tiers per product: PAYG charge, PAYG RRP, Bundled charge, Bundled RRP, Unlimited charge, Unlimited RRP. The "charge" tiers are what SmileIT pays; the "RRP" tiers are the recommended retail price. The difference between charge and RRP is SmileIT's gross margin on that product.

The SasBoss reseller ID is **2815**. This must be included in all API calls to the SasBoss API.

### Vocus

The Vocus Wholesale Portal API is the primary source of truth for mobile SIM and NBN data. Data from this API overrides any manually entered data for the same service. Vocus mobile services are tracked in `vocusMobileServices`; Vocus NBN services are tracked in `vocusNbnServices`. Both tables sync from the Vocus API and feed into the main `services` table via the matching engine.

Vocus shared data pools (buckets) are tracked in `vocusBuckets`. When a SIM's usage exceeds its pool allocation, a `usageThresholdAlert` is generated. Pool usage notifications should be sent to the customer before they incur overage charges.

### TIAB / Octane

TIAB (Telstra Indirect Access Billing) is the billing mechanism for Telstra services. SmileIT receives a consolidated TIAB invoice each month covering all Telstra services. The TIAB API provides access to the underlying service and transaction data.

TIAB reconciliation issues arise when the TIAB-invoiced amount for a service differs from the expected cost in the `services` table. These issues are surfaced in the TIAB Recon Issues table and require manual investigation to determine whether the discrepancy is due to a price change, a new service, or a billing error.

### Starlink

SmileIT manages six Starlink portal accounts. The accounts and their associated service lines are:

| Account | Email | ACC Number | Services |
|---|---|---|---|
| SmileTel Starlink | smileitstarlink@smileit.com.au | ACC-2165425-22536-8 | Multiple |
| Support | support@smileit.com.au | ACC-2165425-22536-8 | Shared with above |
| Orders | orders@smileit.com.au | Separate ACC | Multiple |
| Accounts | accounts@smileit.com.au | Separate ACC | Multiple |
| PJ Drummond | pjdrummond@... | Separate ACC | Multiple |
| Product Admin | productadmin@smileit.com.au | Separate ACC | Multiple |

Starlink service lines are identified by a `KIT-XXXXXXXXXX` kit number. Service lines are fuzzy-matched to customers using the site nickname and GPS coordinates from the Starlink portal.

Six service lines currently have no confirmed customer assignment: Black Pearl (2 services), UQ Wildlife (2 services), and Waratah Village (2 services). These require manual investigation.

### ChannelHaus / ECN

ChannelHaus is the billing entity for SIP channel services. ECN is the underlying infrastructure provider. When ChannelHaus invoices are imported, the services are tagged `provider = 'ChannelHaus'` and `supplierNotes` includes a reference to the ECN relationship. The March 2026 invoice (C0280943) imported 44 services with correct wholesale costs.

---

## 7. Known Edge Cases and Exceptions

**Yiros Marketplace address matching bug.** Yiros has the address "Shop T47 G, BG 1 DFO Jindalee, 16 Amazons Place, Jindalee QLD 4074". The address normalisation algorithm strips the "Shop" prefix, leaving "T47 G, BG 1 DFO Jindalee" which is too generic to match reliably. This customer should be matched manually and added to `supplierServiceMap` to prevent future mismatches.

**Telstra account 586992900.** This account contains 170 unmatched mobile SIM services. No matched services exist on this account, making account-based grouping impossible. These are likely a fleet of mobile data SIMs belonging to one or more customers. Manual investigation is required to identify the customer(s) and bulk-assign the SIMs.

**Forest Way / Burwood (Little Cha).** Two closed sites (ST7205, ST7006, ST2996) have outstanding invoices totalling $269 + $140. Hank Chu has committed to paying these in the 1st–2nd week of April 2026. Mark as paid in the Payment Plans screen once confirmed.

**Eastgardens (Little Cha).** New site ST8572 ($153.23/month) has a placeholder customer ID `C-LITTLECHA-EASTGARDENS`. This needs to be linked to the correct customer record once the franchisee details are confirmed.

**Chapman Telstra Arrears.** A 6-month payment plan (April–September 2026) was established for Chapman's Telstra arrears. The first instalment of $128.33 ex GST is due in April 2026. This is tracked in the Payment Plans page.

**SmileIT as customer in SasBoss.** SmileIT appears as an enterprise in SasBoss for internal services (e.g., staff phone systems). These services should be tagged `serviceCategory = 'internal'` and excluded from customer-facing margin reports.

---

## 8. Dashboard and Reporting Rules

**Dashboard auto-refresh.** The dashboard should automatically refresh data to ensure figures are current. A "Data as of" footer on each stat card indicates the billing period represented by the figures, for audit purposes.

**Data source indicators.** Each data field on the service detail page displays an information icon indicating whether the value was populated from an API sync, invoice upload, manual entry, or pricebook lookup. This helps operators understand the reliability of each data point.

**Stale data banners.** If any API source has not been synced within 48 hours, a stale data banner is displayed on the relevant page. The threshold is configurable per supplier.

**Provider cost chart.** The dashboard provider cost chart uses the following colour scheme: ABB (teal), SasBoss (purple), Telstra (blue), AAPT (orange), ChannelHaus (red), Exetel (green), Starlink (dark blue), NetSIP (cyan), others (grey).

---

## 9. Development Conventions

**External IDs.** All primary entities use a stable `externalId` field in addition to the auto-increment `id`. External IDs are human-readable (e.g., `C-0057`, `SVC-00123`) and are used in all cross-table references, URLs, and exports. This makes it possible to reference records in external systems (Xero, SasBoss) without exposing internal database IDs.

**Timestamps.** All timestamps are stored as UTC Unix milliseconds (bigint). Frontend components convert to local time using `new Date(timestamp).toLocaleString()`. Never store timezone-dependent string timestamps in the database.

**Soft deletes.** Records are never hard-deleted. Services use `status = 'terminated'`; customers use `status = 'inactive'`. This preserves historical data and prevents orphaned foreign key references.

**Audit trails.** All manual edits to service records write a row to `serviceEditHistory` with the field name, old value, new value, user, and timestamp. This audit trail is displayed on the Service Detail page.

---

*Last updated: April 2026*
*For questions, contact angusbs@smiletel.com.au*
