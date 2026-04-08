# Architecture Deep Dive — SmileTel Billing Reconciliation Platform

> This document provides a detailed technical reference for developers working on the Lucid platform. It supplements the main README with implementation-level detail on the data model, matching algorithms, supplier integration patterns, and extension points.

---

## 1. Data Model Design Principles

The data model is built around a single central concept: **the service**. A service is any individual telecommunications product that SmileIT purchases wholesale and resells to a customer. Everything in the system either describes a service, links a service to a customer, or links a service to a billing item.

The `services` table is the largest and most important table in the system. It is intentionally wide — it carries fields from every supplier's data model (Carbon API fields, Blitz report fields, SasBoss fields, Starlink fields) in a single denormalised row. This design was chosen deliberately over a normalised EAV or polymorphic approach because:

1. It makes queries simple and fast — no joins required to get a complete service record.
2. It makes the tRPC API surface predictable — every service procedure returns the same shape.
3. It makes the UI consistent — every service detail page uses the same component regardless of provider.

The trade-off is that many columns are null or empty for any given service. The `provider` and `serviceCategory` fields are the primary discriminators used to decide which fields are relevant for display.

---

## 2. The Repeatable Mapping Engine — Implementation Detail

The mapping engine is implemented across three tables and two code paths.

### Tables

`supplierServiceMap` stores the confirmed mappings. Each row has:
- `matchKey` — the value used to identify the service (service ID, AVC ID, address, or customer label)
- `matchType` — which field the key came from (`service_id`, `access_id`, `address`, `your_id`)
- `customerId` — the customer this service maps to
- `supplierId` — which supplier this mapping applies to
- `confidence` — 0–100 score; 100 = manually confirmed

`serviceMatchEvents` is the audit log. Every match, unmatch, and reassignment writes a row here with the before/after state, the user who made the change, and the timestamp.

`supplierEnterpriseMap` is a parallel mapping table specifically for SasBoss enterprise names. SasBoss uses "enterprise" as its term for a customer account. This table maps enterprise names (which can change) to stable customer `externalId` values.

### Auto-Match Code Path

The auto-match function in `server/db.ts` (`runAutoMatch`) executes in three passes:

**Pass 1 — Exact map lookup.** For each unmatched service, query `supplierServiceMap` for an exact match on `matchKey`. If found and `confidence >= 90`, apply the match immediately. This handles all previously seen services.

**Pass 2 — Fuzzy address match.** For services with a known address, normalise the address (lowercase, strip "Shop/Unit/Level/Suite/Lot" prefixes, strip state and postcode, collapse whitespace) and compare against all customer addresses using a Levenshtein distance ratio. Matches above 85% are applied; matches between 70–85% are stored as suggestions in the review queue.

**Pass 3 — Account grouping.** For mobile SIM services with no address and no service ID match, group by supplier account number. If all matched services on that account belong to the same customer, apply that customer to the unmatched services on the same account. This handles mobile SIM fleets where individual SIMs have no identifying information beyond the account they belong to.

---

## 3. Billing Match Workbench — Implementation Detail

The billing match workbench (`client/src/components/ReconciliationBoard.tsx`) uses `@dnd-kit/core` for drag-and-drop. The data model for a match is a `serviceBillingAssignment` row — a junction table linking one service to one billing item.

The workbench displays two columns: unmatched services on the left, unmatched billing items on the right. Dragging a service onto a billing item creates a `serviceBillingAssignment` row via the `billing.associateItem` tRPC mutation. The mutation also writes a `serviceBillingMatchLog` row for audit purposes.

A single billing item can be linked to multiple services (one-to-many). When this happens, the revenue from the billing item is split proportionally across all linked services based on their `monthlyCost` values. The split is recalculated on every read — it is not stored as a separate field.

The workbench is filtered by service category (tabs across the top: Voice, Data, Hardware, etc.) to reduce cognitive load when working through a large invoice.

---

## 4. PDF Invoice Parsing — Implementation Detail

### AAPT Parser

The AAPT invoice format is a multi-page PDF with one service per row in a fixed-width table. The parser (`parseAaptInvoice` in `server/pdfInvoiceParser.ts`) uses `pdf-parse` to extract raw text, then applies a series of regex patterns to identify:

- Service ID (format: `SVC-XXXXXXXXX`)
- Access ID (format: `ACC-XXXXXXXXX` or NBN AVC ID `VIC-XX-XXXX-XXXX-X`)
- Product type (e.g., "FAST Fibre 100/20", "Business Broadband")
- Address (free-text, variable format)
- Monthly charge (decimal, may include GST indicator)

The parser is tolerant of line wrapping and page breaks. It accumulates partial rows across lines until it detects the start of the next service row.

### Access4 / SasBoss Parser

The Access4 invoice is a consolidated PDF with one section per enterprise (customer). The parser (`parseAccess4Invoice`) identifies enterprise sections by their header pattern (`Enterprise: <name>`) and extracts:

- MRC (Monthly Recurring Charge) — the fixed monthly cost
- Variable charges — usage-based charges for the period
- Once-off charges — provisioning, hardware, or cancellation fees

Each enterprise section is matched to a customer via `supplierEnterpriseMap`. If no mapping exists, the enterprise is added to the review queue.

### Starlink Parser

The Starlink AU invoice parser (`server/starlink/parseInvoice.ts`) handles the Starlink invoice format which groups charges by service line (identified by a `KIT-XXXXXXXXXX` kit number). The parser extracts:

- Account number (format: `ACC-XXXXXXXXX-XXXXX-X`)
- Service line kit number
- Service address or GPS coordinates
- Monthly service fee
- Hardware charges (if any)
- Tax amounts

---

## 5. Supplier API Integration Pattern

All supplier API integrations follow a consistent pattern:

1. **Authentication.** Each supplier has a dedicated authentication function that returns a session token or bearer token. Tokens are cached in memory for the duration of the server process (not persisted to the database) to avoid repeated login calls.

2. **Sync function.** Each supplier has a `sync*` function that fetches the full service inventory from the API and upserts it into the relevant database table. Upserts use the supplier's native service ID as the conflict key.

3. **Sync log.** Every sync writes a row to `supplierSyncLog` with the supplier name, sync timestamp, record count, and any error message. This powers the "last synced" display on the Integrations page.

4. **Error handling.** API errors are caught and logged to `supplierSyncLog` with `status = 'error'`. The sync function returns a result object with `success: boolean` and `message: string` so the tRPC procedure can surface the error to the UI without throwing.

5. **Stale data detection.** The Integrations page queries `supplierSyncLog` for the most recent successful sync per supplier. If the timestamp is older than 48 hours, a warning banner is displayed.

---

## 6. Authentication and Session Management

Authentication uses Manus OAuth, which is a standard OAuth 2.0 authorization code flow. The callback handler at `/api/oauth/callback` exchanges the code for a user profile, creates or updates the user record in the `users` table, and sets a signed JWT cookie.

The JWT payload contains `openId`, `name`, `email`, and `role`. The `role` field is read from the `users` table (not from the OAuth provider) so that roles can be managed independently of the OAuth identity.

The `protectedProcedure` helper reads the JWT cookie on every request, verifies the signature using `JWT_SECRET`, and injects the decoded user into `ctx.user`. If the cookie is missing or invalid, the procedure throws a `UNAUTHORIZED` tRPC error.

For admin-only operations, procedures use an inline role check:

```typescript
if (ctx.user.role !== 'admin') {
  throw new TRPCError({ code: 'FORBIDDEN' });
}
```

---

## 7. Email Notification System

Automated emails are sent via SendGrid using the helper in `server/_core/email.ts`. The following emails are sent automatically:

| Trigger | Recipients | Content |
|---|---|---|
| Monthly reconciliation complete | `angusbs@smiletel.com.au` | Discrepancy summary, unmatched count, cost movements >10% |
| New review item submitted | Owner | Service details and reason for review |
| Vocus quota alert | Owner | Service name, current usage %, plan limit |
| Payment plan instalment due | Owner | Customer name, amount due, due date |

The `send_smileit_review_email.mjs` and `send_vocus_review_email.mjs` scripts in the root directory are standalone Node.js scripts for sending ad-hoc review emails outside the application context.

---

## 8. Testing Strategy

The test suite uses Vitest and covers the following areas:

| Test File | Coverage Area |
|---|---|
| `server/auth.logout.test.ts` | Auth session invalidation |
| `server/billing-cycle.test.ts` | Billing period creation and closure |
| `server/carbon-api.test.ts` | ABB Carbon API authentication and sync |
| `server/internet-pricebook.test.ts` | Pricebook CRUD operations |
| `server/margin.zerocost.test.ts` | Zero-cost service margin edge cases |
| `server/netsip.sync.test.ts` | NetSIP service sync |
| `server/omada.credentials.test.ts` | Omada API credential validation |
| `server/payment-plans.test.ts` | Payment plan instalment logic |
| `server/phase2-features.test.ts` | Phase 2 feature integration tests |
| `server/pricebook.bundle.test.ts` | Bundle pricebook calculations |
| `server/pricebook.fuzzy.test.ts` | Fuzzy pricebook matching |
| `server/retail-bundles.test.ts` | Retail bundle cost builder |
| `server/retail-bundles-board.test.ts` | Retail bundle board UI data |
| `server/retail-bundles-live-cost.test.ts` | Live cost calculation for bundles |
| `server/revenue.group.test.ts` | Revenue grouping by customer |
| `server/sasboss-api.test.ts` | SasBoss API token and sync |
| `server/sasboss-unified-pricebook.test.ts` | Unified pricebook across all tiers |
| `server/starlink.test.ts` | Starlink account and invoice sync |
| `server/starlink/parseInvoice.test.ts` | Starlink PDF invoice parser (19 tests) |
| `server/termination.test.ts` | Termination batch creation and export |
| `server/tiab.test.ts` | TIAB sync and reconciliation |
| `server/tiab.supplier.test.ts` | TIAB supplier invoice matching |
| `server/routers/vocus.test.ts` | Vocus API sync |

Run all tests with `pnpm test`. Run a specific test file with `pnpm test <filename>`.

---

## 9. Extension Points

### Adding a New Supplier

To add a new supplier to the system:

1. Create a new API client in `server/suppliers/<supplier-name>.ts` following the existing pattern (auth function, sync function, error handling).
2. Add the supplier to `shared/suppliers.ts` — this drives the dropdown options throughout the UI.
3. Add the supplier to `supplierRegistry` via the Integrations page or directly in the database.
4. Add a sync procedure to `server/routers.ts` (or a new sub-router if the supplier has many procedures).
5. Add a sync button and last-synced display to the Integrations page.
6. If the supplier has supplier-specific fields, add them to the `services` table in `drizzle/schema.ts` and run a migration.
7. Update `ProviderBadge.tsx` and `KNOWN_SUPPLIERS` in the dashboard to include the new supplier's colour and display name.

### Adding a New Page

1. Create the page component in `client/src/pages/<PageName>.tsx`.
2. Add the route to `client/src/App.tsx`.
3. Add the navigation item to `client/src/components/DashboardLayout.tsx`.
4. Add any required tRPC procedures to `server/routers.ts` or a new sub-router.
5. Add database helpers to `server/db.ts` if needed.
6. Write a Vitest test for any new server-side logic.

---

*Last updated: April 2026*
