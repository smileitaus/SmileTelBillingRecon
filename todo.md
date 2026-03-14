# Billing Tool - Auth Upgrade

- [x] Upgrade project with web-db-user feature
- [x] Read upgrade README and understand new file structure
- [x] Create database schema for customers, services, locations, invoices, summary
- [x] Migrate JSON data into database via seed script
- [x] Build authenticated API endpoints (GET /api/customers, /api/services, /api/summary, etc.)
- [x] Update frontend to fetch from API instead of static JSON imports
- [x] Add auth guards so all routes require login
- [x] Test full auth flow end-to-end
- [x] Save checkpoint and deliver

# Shared Password Authentication
- [x] Add shared access password system (bypass Manus OAuth for team members)
- [x] Create password login page with clean UX
- [x] Store hashed password in environment/config
- [x] Issue session cookie on successful password login
- [x] Allow both Manus OAuth and password login to coexist

# Unmatched Services Workflow
- [x] Create Unmatched Services page listing all 217 unmatched services
- [x] Add confidence rating system (High/Medium/Low/None) for each service match
- [x] Build suggested match engine using fuzzy matching on phone, address, AVC ID
- [x] Display prompts for missing information to increase match confidence
- [x] Build drag-and-drop interface to assign unmatched services to customers
- [x] Allow manual customer search and assignment from the unmatched services view
- [x] Persist match assignments to database when user confirms
- [x] Add sidebar navigation entry for Unmatched Services page

# AVC Tracking & Assignment
- [x] Display AVC ID prominently on all service cards and detail views
- [x] Add warning icon on services/customers missing AVC IDs
- [x] Add AVC summary count on Customer Detail page (X of Y services have AVCs)
- [x] Build drag-and-drop AVC assignment interface
- [x] Allow inline AVC editing on Service Detail page
- [x] Add AVC column to Customer List table with missing indicator

# Bug Fixes
- [x] Fix: Published site redirects to Manus OAuth instead of showing team password login form
- [x] Fix: Remove misleading drag-drop zone from Unmatched Services page
- [x] Fix: Replace with inline customer search-and-assign workflow

# Discovery Notes on Unmatched Services
- [x] Add discoveryNotes column to services table in database
- [x] Create API endpoint to save/update discovery notes on a service
- [x] Add notes editor UI in expanded unmatched service card
- [x] Show note icon on collapsed service card when notes exist
- [x] Display note author and timestamp

# Termination Status Workflow
- [x] Add termination status to services (active / flagged_for_termination / terminated)
- [x] Add Flag for Termination button on service cards and detail pages
- [x] Add Terminated button to mark services as terminated
- [x] Add status filter on Customer List page (Active / Flagged / Terminated)
- [x] Add status filter on Unmatched Services page
- [x] Show termination status badges on service cards across all views
- [x] Update Customer Detail to show flagged/terminated services with visual indicators
- [x] Update Service Detail page with termination action buttons

# Suggestion Dismiss/Assign & Discovery Improvements
- [x] Add Dismiss action to unmatched service suggestion cards
- [x] Add Assign action to unmatched service suggestion cards
- [x] Fix The Yiros Marketplace over-suggestion bug in matching algorithm
- [x] Improve matching: better phone number matching (area code + exchange)
- [x] Improve matching: better address matching (street name normalization)
- [x] Improve matching: supplier account-based matching
- [x] Improve matching: service type + plan similarity matching
- [x] Add automated discovery scoring / confidence improvements

# Global Search Improvements
- [x] Fix search to find SIM numbers / phone numbers
- [x] Add search across AVC/connection IDs
- [x] Add search across supplier account numbers
- [x] Add search across service descriptions / plan names
- [x] Add search across service addresses
- [x] Display matched field type in search results for clarity

# Bug Fixes & UI Improvements
- [x] Fix: Flagged for termination filter not correctly populating the list
- [x] Add count numbers to status filter tabs (Unmatched, Flagged, Terminated)
- [x] Fix: Flagged filter on Unmatched page shows 0 results despite flagged services existing
- [x] Add dedicated Flagged/Terminated services section to Customer Detail page

# RVC Customer List Import (TelstraSIM's)
- [x] Add new schema fields: simSerialNumber, hardwareType, macAddress, modemSerialNumber, wifiPassword, lastWanIp, simOwner, dataPlanGb, purchaseDate, dataSource
- [x] Create import script to match by phone number and enrich existing services
- [x] Create new service records for unmatched SIMs
- [x] Make customer names editable on service records
- [x] Update frontend to display new fields (SIM, hardware, modem, MAC, etc.)
- [x] Store uncategorized data in searchable notes
- [x] Import LOG sheet entries as activity notes
- [x] Update search to include new fields (SIM number, MAC address, modem S/N)

# SmileTel Internet Services Import
- [x] Analyze SmileTel spreadsheet structure and data quality
- [x] Match SmileTel records to existing services by address and phone number
- [x] Enrich matched services with AVC, address, and additional data
- [x] Add unmatched/uncategorized data to notes
- [x] Process all matched services

# 2025 Blitz Report Import (SMILEIT-FULLBLITZ.xlsx)
- [x] Add new schema fields: imei, deviceName, deviceType, deviceCategory, serviceActivationDate, flexiplanCode, flexiplanName, contractEndDate, userName, proposedPlan, proposedCost, noDataUse flag
- [x] Match Blitz Report services by SIM serial number and phone number against existing DB records
- [x] Enrich matched records with device info, IMEI, user names, plan details, contract dates
- [x] Create new service records for unmatched SIMs
- [x] Flag 162 No Data Usage SIMs with prominent 'No Data Use' indicator
- [x] Import proposed plan/cost data from Blitz Report section
- [x] Import non-chargeable/backup SIM categorization
- [x] Import unused-last-month status
- [x] Update frontend to display No Data Use flag prominently on service cards
- [x] Update frontend to show device info, IMEI, contract dates on service detail
- [x] Make No Data Use services searchable and filterable

# ABB Carbon API Integration & Provider Identification
- [x] Review Carbon API documentation and understand available endpoints
- [x] Configure Carbon API key from secrets (Carbon_SmiletelAPI)
- [x] Add provider field to services schema (ABB, Telstra, Exetel, AAPT, Vocus, Optus, Unknown)
- [x] Implement provider detection logic for all existing services based on data source, notes, account numbers
- [x] Build ABB Carbon API integration to fetch services
- [x] Match ABB API services against existing records by AVC, phone, address
- [x] Enrich matched records with ABB-specific data (service IDs, speeds, technology, status)
- [x] Create new records for unmatched ABB services
- [x] Add provider filter to Unmatched Services page
- [x] Add provider filter to Customer List/Detail pages
- [x] Add provider badges on service cards across all views
- [x] Update Dashboard with provider breakdown
- [x] Update search to include provider field

# Status Indicators & Supplier Logos
- [x] Fix missing flagged for termination / terminated / no data use status indicators on service cards
- [x] Add supplier logos (Telstra, ABB/Aussie Broadband) on service cards and customer tabs
- [x] Add supplier filter to Customer List page
- [x] Add supplier search functionality (search by supplier name)
- [x] Ensure status badges are visible across all views (Unmatched, Customer Detail, Service Detail)

# Bug Fixes - Manually Matched Customers & Search Assign
- [x] Fix manually matched customers showing no service details in Customer Detail page (e.g. Body Corporate for Osprey Mooloolaba CTS4773)
- [x] Fix search assign-all button showing spinning wheels that never complete (tracked per-customer ID now)

# Bug Fixes - Assign & Filters (Round 2)
- [x] Fix assign button spinning wheels that never complete on Unmatched Services page (spinner now only shows on the specific clicked button)
- [x] Restore missing status filters (Flagged, Terminated, etc.) on Customer List page
- [x] Add provider filter (Telstra, ABB) — supplier filter dropdown added to Customer List page

# Zambrero Sites Import & Matching
- [x] Clean and parse AllZambreroSitesSummaryList.xlsx (292 sites)
- [x] Build fuzzy name matching (handle reversed names like Perth Zambrero > Zambrero Perth)
- [x] Match sites to existing customers by normalized name
- [x] Match sites to existing customers by address/suburb
- [x] Apply business names (franchisee names) to matched customers
- [x] Store remaining data (phone, email, contact, hardware, etc.) in customer fields + notes
- [x] Create new customer records for unmatched sites if needed (181 unmatched sites)
- [x] Update customer schema with businessName, contactName, contactEmail, contactPhone, ownershipType, siteAddress, notes
- [x] Display business info on Customer Detail page (contact card)
- [x] Display business name subtitle on Customer List table
- [x] Generate unmatched sites report (Zambrero_Unmatched_Sites_Report.xlsx)

# Bug Fix - Matched Count
- [x] Fix Dashboard matched service count showing 98 instead of correct number (confirmed accurate — 99 services assigned out of 743)

# Auto-Match Unmatched Services to Customers
- [x] Analyze unmatched service addresses vs customer/site addresses
- [x] Build address-based fuzzy matching script for 644 unmatched services
- [x] Apply matches and update service customerExternalId + customer service counts
- [x] Verify matched count increase on Dashboard (98 → 233, 13% → 31%)

# DataGate Customers Import
- [x] Analyze DatagateCustomers_03-10-2026.xlsx structure and data quality (122 customers)
- [x] Match DataGate customers to existing DB customers by name and address (77 matched)
- [x] Update matched customers with DataGate billing platform
- [x] Extract and apply useful info (contact email, phone, DataGate code, legacy code, address)
- [x] Create 34 new customer records for unmatched DataGate customers (Spicers, Swains, etc.)
- [x] Auto-match unmatched services to DataGate customers by address
- [x] Matched services increased from 233 → 531 (71% match rate), 706 total customers in DB

# Second-Pass Address Matching
- [x] Analyzed remaining 210 unmatched services — all have no address data (mobile SIMs, unassigned services)
- [x] Confirmed address-based matching already exhausted — no further address matches possible
- [x] Remaining 210 unmatched: ~166 Unassigned SIMs, ~7 personal mobiles, ~37 misc services

# Import Unmatched Zambrero Sites
- [x] Import 181 unmatched Zambrero sites as new placeholder customer records
- [x] Apply business names, contacts, addresses, emails, ownership from spreadsheet data
- [x] Total customers now 887 (303 Zambrero customers total)

# Billing Platform Filter
- [x] Add billing platform filter dropdown to Customer List page (DATAGATE, Onebill, ECN, Sasboss, No Platform)
- [x] Wire filter to server-side query with 'none' option for customers without billing platform
- [x] Clean up billing platform data — normalized all values to consistent JSON array format
- [x] Updated Customer List to show all 887 customers (not just those with services)
- [x] Added 3 new tests for platform filter and Zambrero import verification

# Customer Deduplication
- [x] Analyze duplicate customer records (32 groups, 68 records, 36 duplicates)
- [x] Build dedup script to merge duplicates (consolidate services, billing platforms, contacts)
- [x] Reassign services from duplicate records to primary record (Mischief Travel 295 svcs preserved)
- [x] Delete 36 duplicate customer records (887 → 851 customers)
- [x] Verify no orphaned services after dedup (0 orphans)

# Phone-Based Matching for Remaining Unmatched Services
- [x] Identify 44 unmatched services with phone numbers
- [x] Built phone lookup from 524 entries (221 customer contacts + 303 matched service phones)
- [x] Result: 0 phone matches — all 44 phones are unique/unregistered numbers
- [x] Remaining 210 unmatched: 199 unassigned SIMs, 5 personal mobiles, 6 generic labels
- [x] Confirmed: remaining services need manual review or additional data to match

# No Data Use Flag Verification
- [x] Investigated noDataUse flag origin: all 162 from Blitz Report "No Data Usage" sheet, applied without checking monthly data
- [x] Cross-referenced 162 flagged services against 12 months of data (May 2024 - Apr 2025)
- [x] Found 17 services with data usage in at least 1 month — removed their No Data Use flag
- [x] Corrected count: 145 true No Data Use services (was 162)
- [x] Dashboard/UI counts auto-update from database query (no code change needed)

# Xero Contacts Import (Source of Truth)
- [x] Analyze Contacts_Extracted spreadsheet structure (1,164 contacts with names, addresses, account numbers)
- [x] Match Xero contacts to existing customer records by name/address (462 matched)
- [x] Update 400 existing records with Xero naming, addresses, account numbers
- [x] 680 unmatched Xero contacts identified (new customers not yet in system)
- [x] Build customer merge UI for differing entity names (Merge Customers page)

# Feb Billing Items Import
- [x] Analyze SmileTelFeb26 spreadsheet structure (1,389 items, 405 customers)
- [x] Clean data: excluded 66 one-off hardware items, identified 1,323 recurring
- [x] Import 1,323 recurring billing items into database
- [x] Match billing items to customers (1,270 matched, 53 unmatched)
- [x] Match billing items to specific services (214 service-matched, 25 service-unmatched)

# Revenue & Margin Tracking
- [x] Calculate cost (from services), revenue (from billing), and margin % per matched record
- [x] Build Revenue & Margin Analysis page with filtering by margin percentage
- [x] Highlight negative margins in red, low margins in amber
- [x] Show cost, revenue, margin on matched service records
- [x] Summary cards: Total Cost $15,032, Total Revenue $23,074, Overall Margin 34.9%
- [x] Filter by: Negative (37), Low <20% (17), Healthy 20-50%, High >50% (26)

# Billable/Service Unmatched Workflow
- [x] Build Billing / Service Matching page with status filters
- [x] Show 53 unmatched items ($14,284 at risk) across 21 contact groups
- [x] Add workflow to match billing items to customers and services
- [x] Status breakdown: Unmatched (53), Customer Only (1,031), Needs Service Match (25), Fully Matched (214)
- [x] Category filter (internet, voice, nbn-bundle, sip)

# Billing Platform Association Per Service
- [x] Add billingPlatform field to billing_items table (OneBill, SasBoss, ECN, Halo, DataGate)
- [x] Add billingPlatform field to services table for per-service platform tracking
- [x] Build UI prompt on each service to assign/edit billing platform(s) (Service Detail page)
- [x] Xero is the data accumulator, NOT a billing platform — excluded from platform options
- [x] Allow multiple platforms per service (JSON array)
- [x] Show billing platform badges on service cards and detail pages
- [x] 16 new tests for billing items, margin analysis, customer merge, and platform management

# Review Page - Billing Review
- [x] Detect services double billed — 26 services, $9,835.72 at risk
- [x] Detect services not yet being billed — 100 services, $36,271.77 in supplier costs with no billing
- [x] Detect billing occurring with no matching service — 53 items, $14,284.09 at risk
- [x] Detect multiple services to same site — 3 customers, $15,761 (can be marked as acceptable)
- [x] Detect name discrepancies (billing contact vs customer record) — 3 mismatches, $272.72
- [x] Detect missing information — 4 categories (no AVC, no customer, no cost, no billing platform)
- [x] Build resolution workflows: mark reviewed, ignore with note, flag for termination

# Review Page - Account Management
- [x] Highlight negative margin services — 37 services, $827.32/month impact (CRITICAL, red)
- [x] Highlight low margin services (<20%) — 17 services (WARNING, amber)
- [x] Highlight high margin services (>50%) — 26 services (INFO)
- [x] Detect expired contracts — 3 services with expired contract dates
- [x] Surface billing matched to customer only — 1,031 items, $100,999 needing service-level matching
- [x] Build resolution workflows for account management issues

# Manual Review & Ignore Workflow
- [x] Added review_items DB table for user-submitted review items and ignored items
- [x] Added 'Submit for Review' button with Service/Customer toggle, search, and required note
- [x] Added 'Ignore' action on all review items with required note prompt
- [x] Tracks who submitted/ignored items and when
- [x] Summary cards show IGNORED count on Review page header

# UI & Branding
- [x] Updated sidebar subtitle from 'Telstra Service Audit' to 'SmileTel Service Audit'
- [x] Team access: TEAM_ACCESS_PASSWORD configured, Peter and Tony can log in with email + team password

# Service Reassignment & Billing Association Workflows
- [ ] Add backend: reassign service to different customer (or mark as unknown/unassigned)
- [ ] Add backend: associate unmatched billing item to a customer and/or service
- [ ] Add Reassign Service dialog on Review page service rows (search customer, or mark unknown)
- [ ] Build billing item association workflow for 53 unmatched billing items
- [ ] Allow searching customers by name when associating billing items
- [ ] Allow linking billing item to existing service after customer is selected
- [ ] Show updated match status after association

# Service Edit / Reassign Panel
- [x] Build ServiceEditPanel slide-out component for editing service details
- [x] Read-only fields: Name (service type), Cost Price (monthlyCost)
- [x] Editable fields: Plan, AVC/Connection ID, Phone, Address, Billing Platform, Notes, Status
- [x] Reassign to different customer via search (or mark as unassigned)
- [x] Edit button added to ServiceDetail page header
- [x] Service edit history tracked in serviceEditHistory table

# Billing Platform Checks
- [x] Add billingPlatformChecks table to schema (linked to reviewItems)
- [x] Auto-create platform check when a review item is submitted
- [x] Build Platform Checks page with filter by status (pending/actioned) and platform
- [x] Mark checks as Actioned by user with timestamp
- [x] CSV export on Platform Checks page
- [x] Platform Checks added to sidebar nav

# Auto-Match (Alias-Based Customer Reassignment)
- [x] Build fuzzy-match engine: exact, normalised, token-overlap, Levenshtein tiers
- [x] Preview mode: show matches with confidence scores before committing
- [x] Commit mode: bulk reassign services to matched customers
- [x] Reject individual matches before committing
- [x] Auto-Match page added to sidebar nav

# CSV Export Across All Pages
- [x] Create shared exportToCSV utility (client/src/lib/exportCsv.ts)
- [x] Export button on Customers page
- [x] Export button on Billing / Service Matching page
- [x] Export button on Unmatched Services page
- [x] Export button on Revenue & Margin page
- [x] Export button on Billing Platform Checks page
- [x] Export button on Auto-Match page

# Review Page Fixes
- [x] Fix double-billing detection: only flag individual services billed in duplicate (not customers with multiple services)
- [x] Fix Review page: Reviewed/Ignored items not removed from list after actioning
- [x] Add ex GST labels to all pricing columns across all pages
- [x] Add Cost Review Needed filter for 135 flagged services
- [x] Fix margin auto-recalculation: margins should refresh automatically when costs or revenue change

# Additional Fixes (Mar 11 session 2)
- [x] No Data Use count: investigated — 145 is correct (all-time zero-usage SIMs, 17 with usage already excluded)
- [x] Fix Review page: financial totals now refresh dynamically as items are reviewed/actioned
- [x] Add Flag for Review button to Services page (UnmatchedServices)

# Service Count Fix
- [x] Fix customer service count not updating when services are removed or reassigned

# Customer Edit Feature
- [x] Add updateCustomer server function (name, address, contact details, billing platform, notes)
- [x] Add updateCustomer tRPC procedure to routers.ts
- [x] Build customer edit dialog on CustomerDetail page (all fields: name, business name, contact, email, phone, address, notes, Xero details)
- [x] Contact & Site Info section always visible with empty-state placeholders

# Billing Match - Unmatched Customer Workflow
- [ ] Investigate why valid Xero customers appear as Unmatched (matching logic gap)
- [ ] Build Match to Existing Customer workflow on Billing Match screen
- [ ] Add Import as New Customer option for genuinely new Xero contacts

# Service-to-Billing Matching Improvements
- [x] Auto-match: link Xero billing items to supplier services for same-customer same-type 1:1 cases
- [x] Manual match UI: allow user to manually link a billing item to a supplier service on CustomerDetail page
- [x] mergeBillingServiceToSupplierService: db function to transfer billing items from Xero stub to supplier service and retire the stub
- [x] Service Linking page: review auto-match candidates and run bulk or individual merges

# Revenue & Margin Page Improvements
- [x] Add debounced search bar to Revenue & Margin page
- [x] Fix 120-service limit - show all services (confirmed: 120 is the actual count, not a limit)
- [x] Add Group by Customer toggle on Revenue & Margin page
- [x] Apply debounced search to all search inputs across the app

# New Supplier PDF Invoice Parsers (Mar 12)
- [x] Extract and analyse Exetel Feb, Vine Direct Feb, Infinet Mar, Blitznet Mar invoices
- [x] Write Vine Direct PDF parser (2 services: Smile IT, Suncoast Building Approvals)
- [x] Write Infinet PDF parser (NBN SkyMuster + VOIP services)
- [x] Write Blitznet PDF parser (Internet + Static IP services)
- [x] Fix Exetel PDF parser to use PDFParse inline Sub Total format (13 services)
- [x] Add VineDirect, Infinet, Blitznet to ProviderBadge component with colour-coded badges
- [x] Add all three new suppliers to Supplier Invoices upload page (supported formats section)
- [x] Update supplier label mapping in PDF invoice preview component
- [x] Update all descriptive text in upload UI to include new suppliers
- [x] Write and pass vitest tests for all four parsers

# Provider Filter Touch Points (Mar 12)
- [x] Audit all pages/components for provider filter lists
- [x] Update every provider filter/dropdown to include VineDirect, Infinet, Blitznet, ChannelHaus, Legion, Tech-e
- [x] Verify supplier field values stored in DB match the filter keys

# Address-Based Fuzzy Auto-Match (Mar 12)
- [x] Analyse Xero contacts extract address fields
- [x] Import/update Xero customer addresses into DB from contacts extract
- [x] Build server-side fuzzy address matching logic (normalise + token overlap + Levenshtein)
- [x] Add tRPC procedures: previewAddressAutoMatch + commitAddressAutoMatch
- [x] Build Address & Name Match tab in AutoMatch page (alongside existing Alias Match tab)
- [x] Write vitest tests for address match procedures

# ABBREV_MAP Improvements (Mar 12)
- [x] Add warwk→warwick, cottn→cotton, mcin/mcout→medical centre to ABBREV_MAP
- [x] WarwkMCIn/Out now correctly matches Warwick Medical Centre at 100%
- [x] MtCottnMCIN/OUT now correctly matches Mount Cotton Medical Centre at 100%
- [x] Added geographic abbreviations: mchy, enogg, bellb, etc.
- [x] Added business type abbreviations: compl, firstc, waterfrd, etc.
- [x] All 7 addressMatch.test.ts tests still passing

# Billing Item Fuzzy Match (Mar 12 - 1080 unmatched)
- [ ] Diagnose 1,080 unmatched billing items - what fields are available (contactName, description, address)
- [ ] Build server-side fuzzy match: billingItem.contactName → customer.name (Levenshtein + token overlap)
- [ ] Add tRPC procedures: previewBillingItemMatch + commitBillingItemMatch
- [ ] Build Billing Match fuzzy preview UI with confidence scores and bulk apply
- [ ] Write vitest tests for billing item match logic

# Batch Address Auto-Match (Mar 13 - 900+ unmatched services)
- [x] Analysed 981 unmatched services: 748 had valid customerExternalId but wrong status, 233 had no customerExternalId
- [x] Built bulkActivateLinkedServices() in server/db.ts (preview + commit)
- [x] Added tRPC procedures: billing.bulkActivate.preview and billing.bulkActivate.commit
- [x] Built Bulk Activate tab in AutoMatch.tsx with preview table (first 50 of 748) and activate button
- [x] Replaced recalculateCustomerCounts() N×4 loop with single bulk SQL UPDATE (correlated subqueries)
- [x] Activated 748 services across 230 customers in one operation
- [x] All customer stats recalculated: serviceCount, matchedCount, unmatchedCount, monthlyCost
- [x] Remaining 233 unmatched: 199 Telstra Unassigned SIMs (no matching signals), 22 ChannelHaus (Address & Name Match tab), 7 Telstra named mobiles, 4 ABB, 1 Tech-e
- [ ] Manual review needed for 199 Telstra Unassigned SIMs (no address, no name, no alias)
- [ ] Manual review needed for 7 named Telstra mobiles (personal names like 'Ian Mobile', 'Cindy Mobile')
- [ ] ChannelHaus 22 services: use Address & Name Match tab to assign (34 candidates shown)

# Data Integrity Fixes (Mar 13) — COMPLETED
- [x] Fix customer monthlyCost showing $0.00 despite having matched services (stale stats after bulk activation)
- [x] Fix Revenue & Margin capped at 120 services — promoted 1,109 customer-matched billing items to service-matched
- [x] Propagated monthlyRevenue to 968 services (up from 115)
- [x] Fixed DECIMAL(5,2) overflow on marginPercent — widened to DECIMAL(10,2) in schema + db:push
- [x] Added recalculateAll() tRPC procedure + Recalculate All button in Auto-Match Bulk Activate tab
- [x] Full recalculation run: 860 customers updated, $144,182/mo total revenue across 960 services
- [x] Revenue & Margin page now shows 960 services (up from 120)
- [x] Customer list: Affinage Professional $239.67, Accountant Ready Services $189.00 (both were $0.00)

# Revenue & Margin Cost Field Fix (Mar 13)
- [x] Diagnose: monthlyCost was incorrectly set to Xero lineAmount for 840 services imported from Xero Feb 2026 Invoice
- [x] Fix: Reset monthlyCost to $0 for all 840 Xero-sourced services (cost unknown until supplier invoice matched)
- [x] Fix getServicesWithMargin: computedMargin returns NULL when monthlyCost = 0 (shows 'Unknown' not 100%)
- [x] Fix margin filter conditions: all margin filters now require monthlyCost > 0 guard
- [x] Fix getServicesGroupedByCustomer: group margin only computed when both totalCost and totalRevenue > 0
- [x] Fix overall margin stat: computed from services where BOTH cost and revenue are known (not all services)
- [x] Recalculate all customer stats after cost reset
- [x] Revenue & Margin page: Cost column shows 'Unknown' (with ? icon) for services without supplier invoice
- [x] Revenue & Margin page: Margin column shows 'Unknown' badge for services without supplier cost
- [x] Revenue & Margin page: Services with unknown cost sorted to end of list
- [x] Summary cards: Known Cost ($5,170 / 78 services), Total Revenue ($144,182 / 960 services), Overall Margin 63.8% (from 78 known-cost services)
- [x] Write 6 vitest tests for cost integrity invariants (all passing)
- [x] recalculateAll() confirmed safe: never modifies monthlyCost, only monthlyRevenue and marginPercent

# Supplier Invoice Cost Audit (Mar 13)
- [x] Audit all supplier invoice items in DB: count by provider, total cost, matched vs unmatched
- [x] Fix provider field mismatches: ChannelHaus (67), Legion (1), Tech-e (1) had provider='Unknown' — fixed to match supplierName
- [x] Fix 89 ABB-Carbon API services that had supplierName='Telstra' — reverted to provider='ABB', supplierName='ABB'
- [x] Fix SmileTel goodwill adjustment credit — now shows under SmileTel not Unknown
- [x] Run recalculateAll after all provider fixes
- [x] Dashboard now shows correct provider breakdown: Telstra/ABB/ChannelHaus/SmileTel/Exetel/Legion/Tech-e
- [x] Telstra: 466 services, $19,497/mo cost (268 with cost, 197 no cost — need invoice matching for account 192549800)
- [x] ABB: 273 services, $9,150/mo cost (140 with cost, 134 no cost — need ABB API cost refresh)
- [x] ChannelHaus: 67 services, $7,387/mo cost, revenue=$0 (billing items customer-matched but not service-linked)
- [x] Exetel: 12 services, $6,340/mo cost (11 with cost, 1 no cost)
- [x] Legion: 1 service, $799/mo cost
- [x] Tech-e: 1 service, $250/mo cost
- [x] SmileTel: 65 services, -$18.18 cost (goodwill credit), $9,833/mo revenue — awaiting SmileTel supplier invoice
- [x] Blitznet: 199 services in '2025 Blitz Report' dataSource — all provider=Telstra (correct, Blitz IS Telstra portal)
- [ ] ChannelHaus: 67 services need Service Linking step to connect billing items → service revenue
- [ ] Telstra account 192549800: 64 services with $0 cost — need Telstra invoice matching
- [ ] ABB: 134 services with $0 cost — need ABB API cost refresh
- [ ] SmileTel: 63 services with revenue but no cost — awaiting SmileTel supplier invoice
- [ ] VineDirect, Infinet: no services found in DB — invoices not yet imported
- [ ] Pending suppliers: SasBoss (Voice), AAPT (Data), Vocus (Voice and Data) — not yet imported

# SM.xlsx SIM Import — Ella's Upload (Mar 13)
- [x] Analyse SM.xlsx: 428 rows, 4 providers (Telstra 200, TIAB 119, Vocus/Optus 92, ABB 17)
- [x] Match against existing DB by SIM serial (164 matches) and phone number (53 matches)
- [x] Apply correct provider per SM row (Telstra, TIAB, Vocus, ABB)
- [x] Update serviceActivationDate, planName, serviceType from SM data
- [x] Unassign all 165 RVC ICT Consulting SIM services → status='unmatched' (pending verification)
- [x] Add discovery notes to unmatched services with SM customer name suggestion
- [x] 17 ABB Zambrero 4G Backup SIMs correctly matched and remain assigned to Zambrero customers
- [x] 211 new unmatched services created for SIMs not in existing DB
- [x] Run recalculateAll after import
- [ ] 31 Telstra "Dot Voice and Broadband Backup" services still show customer=Unassigned — need customer matching
- [ ] 374 unmatched SM services (163 Telstra + 119 TIAB + 92 Vocus) need individual verification and customer assignment
- [ ] TIAB: 119 services — new provider not previously in DB, needs supplier account setup
- [ ] Vocus (Optus): 92 services — new provider, needs supplier account setup

# SM Import Re-analysis + Create New Customer (Mar 14)
- [x] Re-analyse SM.xlsx: all 8 columns including customer name (Col A), service type (B), provider (C), SIM serial (D), MSN/phone (E), activation date (F), port-out CID (G), notes (H)
- [x] Build fuzzy customer name matching with chain-aware logic (Zambrero/Nodo/Yiros location word must match)
- [x] Apply 188 high-confidence customer assignments from SM import
- [x] Store port-out CID, activation date, and notes (e.g. "Transferred to Yiros Beenleigh") in discoveryNotes
- [x] 51 named-but-unmatched services left pending (new locations not yet in DB)
- [x] Add createCustomer function to db.ts (with duplicate detection, Platform Check creation)
- [x] Add customers.create tRPC procedure
- [x] Add customers.suggestionsForService tRPC procedure (fuzzy match from discoveryNotes SM suggestion)
- [x] Build CreateCustomerDialog component (name, notes, platform check checkbox, auto-assign option)
- [x] Add SM Import Suggestion panel to UnmatchedServices ExpandedPanel (shows fuzzy matches, Create New Customer button)
- [x] Add "Create New Customer" button to "No customers found" state in UnmatchedServices manual search
- [x] Add "New Customer" button to CustomerList page header
- [x] Platform Check records auto-created when "Create Platform Check entry" is checked in CreateCustomerDialog
- [x] discoveryNotes already included in global search (confirmed at db.ts lines 782, 871)
- [x] 8 vitest tests for createCustomer and getSuggestedCustomersForService (all passing)
- [ ] Match 51 named-but-unmatched SM services (new Zambrero/Nodo/Yiros locations) — use Create New Customer flow
- [ ] Match 197 blank-name Telstra SIMs ("Dot Voice and Broadband Backup") — need manual review

# New Customer Proposals Approval Workflow (Mar 14)
- [x] Add customerProposals table to drizzle/schema.ts (id, proposedName, notes, serviceExternalIds, status: pending/approved/rejected, proposedBy, reviewedBy, reviewedAt, createdAt)
- [x] Run pnpm db:push to migrate schema
- [x] Add db helper functions: submitCustomerProposal, listCustomerProposals, approveCustomerProposal, rejectCustomerProposal, countPendingProposals
- [x] Add tRPC procedures: customers.proposals.submit, customers.proposals.list, customers.proposals.approve, customers.proposals.reject, customers.proposals.pendingCount
- [x] Build CustomerProposalsTab component with pending/approved/rejected views
- [x] Tab shows pending proposals as cards: proposed name, notes, linked services, proposed by/when
- [x] Each card has Approve (creates customer + assigns services) and Reject (with optional reason) actions
- [x] Approved proposals auto-create the customer record and assign the linked services
- [x] Approved proposals optionally create a Platform Check record
- [x] Rejected proposals show reason and remain visible (greyed out) for audit trail
- [x] Add Proposals tab to AutoMatch page with pending count badge
- [x] Update CreateCustomerDialog: proposal mode (Submit for Approval) vs immediate create mode
- [x] Update SM suggestion panel buttons to submit a proposal (amber styling) instead of immediate creation
- [x] Show pending proposal count badge on "New Customers" tab in Auto-Match screen
- [x] 11 vitest tests for proposal workflow (all passing)

# Unknown Customer Name Surfacing in Unmatched Services (Mar 14)
- [x] Surface suggested customer name prominently in unmatched service expanded panel (blue SM Import Suggestion section)
- [x] Pre-fill customer search box with suggested name when expanding a service that has an SM suggestion
- [x] Show "Suggested: [Name]" chip in collapsed service card when name is known but unmatched
- [x] "Propose as New Customer" button pre-fills proposal form with suggested name + service ID
- [x] Wire CreateCustomerDialog to submit proposal (not immediate creation) from unmatched panel
