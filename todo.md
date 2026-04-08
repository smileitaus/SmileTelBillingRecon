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

# Carbon API Source of Truth + Real-time Refresh (Mar 14)
- [x] Add service_cost_history table (id, serviceExternalId, oldCost, newCost, oldSource, newSource, changedBy, reason, changedAt)
- [x] Add costSource field to services table (carbon_api / invoice / manual / unknown)
- [x] Run pnpm db:push to migrate schema
- [x] Build syncCarbonCostsToServices() helper: snapshots old cost to history, sets monthlyCost = carbonMonthlyCost, sets costSource = 'carbon_api'
- [x] Build getServiceCostHistory() helper: returns cost change history for a service
- [x] Add tRPC procedure: billing.syncCarbonCosts (protected, triggers full ABB cost sync)
- [x] Add tRPC procedure: billing.serviceCostHistory (returns cost history for a service)
- [x] Run Carbon cost sync on all 240 ABB services — 134 costs updated, $24,622/mo total ABB cost
- [x] Add ABB Carbon API Sync button to Supplier Invoices page with full query invalidation
- [x] Fix TIAB and SmileTel provider badges (were showing as Unknown in dashboard)
- [x] Fix React query invalidation: terminate/restore mutations now invalidate margin + customers list
- [x] Fix ServiceEditPanel: now invalidates margin + summary after service update
- [x] Fix SupplierInvoices import mutations: now invalidate summary + margin after import
- [x] Fix dashboard stats: useSummary now has staleTime: 0 + refetchOnWindowFocus: true
- [x] Revenue & Margin page already had staleTime: 0 + refetchOnWindowFocus: true (confirmed)
- [x] Customer Detail terminate/restore: now invalidates margin + customers list
- [x] Show cost history on Service Detail page (Cost History section with old/new cost + source badge)
- [x] Show costSource badge on Service Detail (Carbon API / Invoice / Manual)
- [ ] Write vitest tests for Carbon cost sync and history snapshot

# SM Pending Customer Names Workflow (Mar 14)
- [ ] Add getSMPendingCustomerNames() db helper: extracts SM customer names from discoveryNotes, groups by name, returns service IDs + existing customer fuzzy matches
- [ ] Add tRPC procedure: billing.smPendingNames (returns grouped pending names with fuzzy customer matches)
- [ ] Add "SM Pending Names" tab to Auto-Match page showing grouped names with service counts
- [ ] Each group shows: proposed name, number of services, fuzzy match suggestions to existing customers
- [ ] "Assign to Existing" button: assigns all services in group to a matched customer
- [ ] "Create Proposal" button: pre-fills proposal form with name + all service IDs
- [ ] Show count badge on SM Pending Names tab
- [ ] For 9 services where SM name fuzzy-matches existing customer: show as high-confidence suggestions

# SM Customer Name Regex Fix + SM Pending Filter (Mar 14)
- [x] Investigated root cause: regex /SM Import[^:]*:\s*([^|\n]+)/i was capturing Port Out CID instead of customer name
- [x] Fixed regex in UnmatchedServices.tsx (2 locations): now uses /SM Customer:\s*([^\n\[|]+)/i
- [x] Fixed regex in server/db.ts getSuggestedCustomersForService(): same fix applied server-side
- [x] Confirmed 161 Account 586992900 SIMs genuinely have no customer name in source spreadsheet (RVC pending)
- [x] Confirmed 30 Account 192549800 "Dot Voice And Broadband Backup" SIMs also have no customer name in source
- [x] 48 services with SM Customer: names now correctly show customer name badge in Unmatched Services
- [x] Added "SM Pending" filter tab to Unmatched Services page (violet badge, filters to services with SM Customer: in notes)
- [x] SM Pending filter count shows 48 services with known customer names pending assignment

# Margin Calculation Fix + Dashboard Bar Charts (Mar 14)
- [ ] Fix margin % formula: margin = (revenue - cost) / revenue * 100 (positive when revenue > cost)
- [ ] Fix margin badge colour: green when positive, red when negative/zero
- [ ] Fix dashboard provider bar chart: bars should be proportional to cost value (not count)
- [ ] Fix dashboard provider bar chart: sort by cost descending (ABB $24k should be top, not Unknown)
- [ ] Fix dashboard type bar chart: bars proportional to count, sorted by count descending
- [ ] Add refetchInterval to dashboard summary so it auto-refreshes every 60s

# Margin Badge + Dashboard Bar Chart Fixes (Mar 14)
- [x] Fix MarginBadge colour thresholds: positive margins (even if low) now show amber, only negative shows red
- [x] Fix CustomerGroupRow row background: amber tint for low-but-positive, red only for negative
- [x] Fix ProviderBar: bar width now proportional to cost (not service count)
- [x] Fix ProviderBar: sort order now by cost descending (ABB $24k first, not Unknown 782 services first)
- [x] Fix ProviderBar: negative costs shown in red text with minus sign
- [x] Add refetchInterval: 60_000 to useSummary hook for automatic dashboard refresh every 60 seconds

# Auto-Proposal Generation for SM Pending Customers (Mar 14)
- [ ] Understand new customer proposal schema (customer_proposals table or similar)
- [ ] Build autoGenerateSMProposals() in db.ts: extract SM Customer names, create pending proposals grouped by name
- [ ] Add tRPC procedure billing.autoGenerateSMProposals
- [ ] Auto-run on page load of New Customers tab OR add "Generate Proposals" button
- [ ] Verify proposals appear in the New Customers pending queue

# Alias Match: Surface SM Customer Names (Mar 14)
- [x] Read previewAliasAutoMatch in db.ts - confirmed it only used carbonAlias on ABB/Carbon services
- [x] Extended previewAliasAutoMatch with second pass: extracts SM Customer: names from unmatched service discoveryNotes
- [x] Fuzzy-matches extracted SM names against all existing customers (same scoreMatch logic)
- [x] Added aliasSource field to AliasMatchCandidate: 'carbon_alias' | 'sm_customer_name'
- [x] SM Name candidates show violet 'SM Name' badge in the Alias column
- [x] Updated Alias Match info banner to explain both sources
- [x] TypeScript: 0 errors

# Create New Customer + Platform Check Auto-Task (Mar 14)
- [x] Trace "Create as new customer" button code path in UnmatchedServices.tsx
- [x] Fix: button should immediately create customer + assign service (not just submit proposal)
- [x] Fix: after customer creation + service assignment, auto-create Platform Check task via unmatched.assign
- [x] Platform Check task includes: customer name, service type, provider, monthly cost, billing platform
- [x] Platform Check targetType='service', targetId=serviceExternalId (correct, not customer ID)
- [x] getServiceForPlatformCheck helper added to db.ts
- [x] deferPlatformCheckToAssign prop added to CreateCustomerDialog to avoid duplicate checks
- [x] 3 vitest tests added and passing for the full workflow

# Platform Check: Proposal Approve/Reject + Quick Actions (Mar 14)
- [ ] Fix: approveCustomerProposal should always create a Platform Check with correct service details
- [ ] Fix: rejectCustomerProposal should create a Platform Check noting the rejection
- [ ] Fix: Platform Check targetId should be serviceExternalId (not customerExternalId) when services are available
- [ ] Add quick "Actioned" and "Ignore" buttons directly on each Platform Check row (no dialog required)
- [ ] Keep full dialog for adding notes when needed
- [ ] Verify Angus Test (rejected) and Little Cha (accepted) appear in Platform Checks

# Platform Check Cleanup & UI Improvements (Mar 14)
- [x] Delete test Platform Check records (Workflow Test Customer 1773...) from DB
- [x] Delete test customer records created by vitest from DB
- [x] Fix vitest tests to clean up after themselves (delete Platform Check + customer + unassign service)
- [x] Expand Platform Check rows to show full service details (service ID, type, phone, address, AVC, provider, device, SIM, IMEI, user, contract end)
- [x] getBillingPlatformChecks LEFT JOINs services table for enriched detail
- [x] Add quick "Actioned" and "Ignore" buttons directly on each check row (no note required)
- [x] Keep full "+ Note" dialog for adding notes when needed
- [x] approveCustomerProposal always creates Platform Check per service with correct targetId=serviceExternalId
- [x] rejectCustomerProposal now creates Platform Check noting rejection for billing verification
- [x] actionedNote made optional in platformChecks.action procedure (was required)

# Proposals: Assign to Existing Customer (Mar 14)
- [x] Backend: proposals.assignToExisting procedure - assigns proposal services to existing customer + creates Platform Check
- [x] Backend: proposals.searchCustomers procedure - search customers by name for the picker dialog (reuses getCustomersForMerge)
- [x] Frontend: AssignToExistingCustomerDialog component with debounced search, customer list, selection preview
- [x] Frontend: Wire "Assign to Existing" button into CustomerProposalsTab alongside Approve/Reject
- [x] All three proposal actions (approve, reject, assign-to-existing) create Platform Check entries

# Platform Check Note Bug Fix (Mar 14)
- [x] Fix: adding a note via "+ Note" now calls addNote procedure — status stays Open, record stays visible
- [x] Fix: note icon (FileText) is highlighted amber with filled style when a note exists on a check
- [x] Fix: Cory Johnston Platform Check reinstated (ID 30007, service S6940)
- [x] Fix: expanded note section now shows notes on Open records (amber styling), not just actioned/dismissed
- [x] Verify: Actioned and Ignore correctly change status; Note does not

# Service S7141 Reassignment to Smile IT (Mar 14)
- [x] Found Smile IT customer: C2441
- [x] Assigned service S7141 (4G Data Back up, TIAB, 0493895348) to Smile IT (C2441)
- [x] Service status updated from unmatched to active
- [x] Platform Check created (ID 30010) for TIAB billing verification

# SasBoss Dispatch Charges (March) Import (Mar 14)
- [ ] Analyse workbook: Call Usage tab (February usage) and Pivot tab (billing line items)
- [ ] Create SasBoss Dispatch Workbook supplier upload record in DB
- [ ] Import all Pivot tab line items (Enterprise Name, Product Name, costs)
- [ ] Match Enterprise Name to customers, Product Name to services/voice lines
- [ ] Record matched services as billed from SasBoss with correct costs
- [ ] Populate unmatched screen for unresolved line items
- [ ] Add Call Usage summary as February usage under each customer
- [ ] Recalculate customer costs, revenue and dashboard totals

# SasBoss Import: Match Review Workflow (Mar 14)
- [ ] Define confidence tiers: exact (auto-accept), fuzzy (review-required), none (no-match)
- [ ] Backend: dry-run mode returns match proposals with confidence scores (no DB writes)
- [ ] Backend: confirm endpoint commits only user-approved matches
- [ ] Frontend: Match Review UI — show each proposed match with confidence badge, approve/reject/reassign per row
- [ ] Frontend: fuzzy matches shown in amber, exact matches in green, no-match in red
- [ ] Frontend: customer search picker for reassigning a no-match or wrong match
- [ ] Roll back the already-committed March import and re-run through review workflow
- [ ] Wire review workflow into SupplierInvoices upload flow (replaces direct confirm)

# SasBoss Persistent Match Mapping Layer (Mar 14)
- [ ] Schema: add supplier_enterprise_map table (supplierName, enterpriseName → customerId + customerExternalId)
- [ ] Schema: add supplier_product_map table (supplierName, productName, productType → serviceType, billingLabel)
- [ ] Push schema migration
- [ ] Backfill enterprise map from March import (all matched enterprises → customer IDs)
- [ ] Backfill product map from March import (all matched products → service types)
- [ ] Update importSasBossDispatch: consult map tables first before fuzzy matching
- [ ] Update dryRunSasBossDispatch: mark mapped matches as 'exact' confidence (auto-accept)
- [ ] Build Match Review UI: dry-run → review → confirm; save confirmed matches to map tables
- [ ] Wire review flow into SupplierInvoices upload (replace direct import with dry-run + review)
- [ ] Roll back March auto-import and re-run through review workflow

# Customer Unmatched Billing Tab (Mar 14)
- [ ] Define "unmatched billing" = service assigned to customer but no billing item linked (no revenue, no billingItemId)
- [ ] Add unmatchedBillingCount column to customers table; populate via recalculation
- [ ] DB helper: getServicesWithoutBilling(customerExternalId) — returns active services with no billing item
- [ ] DB helper: resolveServiceBillingMatch(serviceExternalId, billingItemId, resolvedBy) — links service to billing item + logs to service_billing_match_log
- [ ] Schema: add service_billing_match_log table to persist resolutions for future auto-matching
- [ ] tRPC: customers.unmatchedBillingServices query
- [ ] tRPC: customers.resolveServiceBilling mutation (links + logs)
- [ ] CustomerDetail: add "Unmatched Billing" tab showing services without billing outcomes
- [ ] CustomerDetail: tab shows service details, cost, type, and available billing items to link
- [ ] CustomerDetail: resolution action links service to billing item and logs the match
- [ ] CustomerList: show warning icon (amber AlertTriangle) next to customer name when unmatchedBillingCount > 0
- [ ] CustomerList: tooltip shows "X services need billing assignment"
- [ ] Recalculate unmatchedBillingCount for all customers after any billing match change

## Unmatched Billing Services Feature (Mar 2026)
- [x] Add service_billing_match_log table to schema (tracks resolution history)
- [x] Add unmatchedBillingCount column to customers table
- [x] Push schema migration to DB
- [x] Add getServicesWithoutBilling DB helper (excludes terminated, unmatched, intentionally-unbilled)
- [x] Add getUnmatchedBillingCount DB helper
- [x] Add getAvailableBillingItemsForCustomer DB helper
- [x] Add resolveServiceBillingMatch DB helper (logs resolution, updates billing item, recalculates count)
- [x] Add recalculateAllUnmatchedBilling DB helper (bulk update for monthly imports)
- [x] Add recalculateCustomerUnmatchedBilling DB helper (single customer)
- [x] Update recalculateAll to include unmatchedBillingCount in bulk recalculation
- [x] Add tRPC procedures: unmatchedBillingServices, availableBillingItems, resolveServiceBilling, billingMatchLog, recalculateUnmatchedBilling
- [x] Add orange Receipt badge to customer list rows for customers with unmatchedBillingCount > 0
- [x] Add UnmatchedBillingRow component to CustomerDetail page
- [x] Add Unmatched Billing section to CustomerDetail (collapsible, shows before Locations & Services)
- [x] Populate unmatchedBillingCount for all existing customers via SQL
- [x] Write and pass 14 vitest tests for all new DB helpers

# SasBoss Provider Integration
- [x] Add SasBoss to ProviderBadge component (indigo colour scheme)
- [x] Add SasBoss to PROVIDER_COLORS and ProviderDot
- [x] Tag 275 Unknown services for SasBoss customers as SasBoss provider
- [x] Tag 390 additional Unknown services with SasBoss plan name patterns as SasBoss provider
- [x] Add SasBoss to CustomerList supplier filter dropdown
- [x] Add SasBoss to RevenueMargin provider filter dropdown
- [x] Recalculate unmatchedBillingCount for all customers after provider changes

# Service/Billing Matching Refinement (Mar 14 2026)
- [x] Fix cost labels to show 'supplier cost' clarity in CustomerDetail service rows and Unmatched section
- [x] Build getUnmatchedServicesForMatching DB helper (services with no matched workbook item)
- [x] Build getWorkbookItemsForCustomer DB helper (latest SasBoss upload items for customer)
- [x] Build fuzzyMatchServicesToWorkbook DB helper (Jaccard token-overlap scoring)
- [x] Build linkServiceToWorkbookItem DB helper (updates matchStatus, monthlyCost, logs to service_billing_match_log)
- [x] Add workbookMatching tRPC procedures (unmatchedServices, workbookItems, fuzzyProposals, linkService)
- [x] Build CustomerWorkbookMatching page with drag-and-drop and fuzzy auto-match
- [x] Add route /customers/:customerId/match-workbook
- [x] Add "Match Workbook" button to CustomerDetail Unmatched Billing section header

# Billing Match Page (Drag-and-Drop)
- [x] Add service_billing_assignments junction table (many services → one billing item)
- [x] Add unbillable_services table for intentionally unbilled tracking
- [x] Push schema migration to DB
- [x] Add getBillingItemsWithAssignments, getUnassignedServicesForCustomer, assignServiceToBillingItem, removeServiceAssignment, markServiceUnbillable, unmarkServiceUnbillable, getUnbillableServicesForCustomer, fuzzyMatchServicesAgainstBillingItems helpers to db.ts
- [x] Add billingAssignments router procedures to routers.ts
- [x] Build CustomerBillingMatch page with dnd-kit drag-and-drop
- [x] Xero billing items on right (droppable, many services per item)
- [x] Unassigned services on left (draggable)
- [x] Live margin calculation per billing item (revenue - cost)
- [x] Auto-match dialog with fuzzy proposals
- [x] Unbillable workflow with reason/notes dialog
- [x] Restore unbillable services to unassigned
- [x] Add Billing Match button to CustomerDetail Unmatched Billing section
- [x] Register /customers/:id/billing-match route in App.tsx

# Billing Match Improvements (2026-03-14)
- [x] Fix drag-and-drop freeze: replace PointerSensor with MouseSensor+TouchSensor
- [x] Fix scroll container layout: fixed-height independent scroll columns
- [x] Clarify cost labels: show 'supplier cost' not just '/month'
- [x] Add service_billing_assignments junction table (many services → one billing item)
- [x] Add unbillable_services table for intentionally-unbilled services
- [x] Build CustomerBillingMatch page: Xero billing items on right, multi-service drop, live margin
- [x] Add autoApplyMatchRules function: auto-creates assignments from saved match rules on import
- [x] Wire autoApplyMatchRules into Exetel, Generic, and SasBoss import procedures
- [x] assignServiceToBillingItem now writes persistent match rule to service_billing_match_log
- [x] Enrich service cards with extra context (AVC ID, connection ID, technology, speed tier, device, SIM, contract term)
- [x] Widen auto-match modal to max-w-5xl with two-column grid layout and confidence bars
- [x] Remove line-clamp from billing item descriptions
- [x] Fix drag-and-drop freeze with MouseSensor+TouchSensor and fixed-height scroll columns
- [ ] Add 'Escalate for Review' button on Billing Match page for services that can't be matched to any Xero billing item
- [ ] Add escalated_services table to schema for tracking services escalated for manual review
- [ ] Dashboard alert: show customers with escalated unmatched services with count badge
- [ ] Unmatched page: show escalated services grouped by customer with action to resolve

# Escalation Workflow & Billing Queue (2026-03-14)
- [x] Add escalated_services table to schema for tracking services escalated for manual review
- [x] Push schema migration to DB (pnpm db:push)
- [x] Add escalateService, resolveEscalatedService, getEscalatedServices, getCustomersWithEscalations DB helpers to db.ts
- [x] Add billingAssignments.escalate, resolveEscalation, escalatedServices, customersWithEscalations tRPC procedures
- [x] Add 'Escalate for Review' button on Billing Match page (AlertCircle icon, amber styling)
- [x] Add Escalate dialog with notes field on CustomerBillingMatch page
- [x] Show escalated services section in left column of CustomerBillingMatch page (red styling)
- [x] Allow resolving escalations inline from CustomerBillingMatch page
- [x] Add search/filter bar for unassigned services (text search + service type dropdown)
- [x] Add search bar for billing items (text search)
- [x] Show assigned services always-visible when billing item is expanded (not just on hover)
- [x] Build UnmatchedBillingQueue page at /billing-queue with Unmatched + Escalated tabs
- [x] Show summary stats (customers affected, unmatched count, escalated count) on queue page
- [x] Add Billing Queue nav item to Layout.tsx sidebar
- [x] Register /billing-queue route in App.tsx
- [x] Write 12 vitest tests for escalation workflow (all passing)

# Cost/Revenue Model Fix & Matching Algorithm Overhaul (2026-03-14)
- [x] Audit Back2Health data: confirmed services = supplier COSTS, billing items = customer REVENUE
- [x] Rewrite fuzzyMatchServicesAgainstBillingItems: category-aware scoring (Voice/Internet/Mobile) with provider alignment bonus; dollar values never used as matching signal
- [x] Fix unmatchedBillingCount to use service_billing_assignments (new system) instead of legacy billing_items.serviceExternalId
- [x] Fix recalculateAllUnmatchedBilling bulk SQL to use service_billing_assignments + unbillable_services
- [x] Fix inline unmatchedBillingCount in full recalculation function
- [x] Run bulk recalculation: Back2Health now shows 0 unmatched (was 6); 461 customers with 1965 total unmatched
- [x] Improve CustomerBillingMatch header stats: show 'Xero Revenue', 'Supplier Cost', 'Net Margin' with correct total supplier cost (assigned + unassigned)
- [x] Add cost/revenue legend text under each column header
- [x] Improve auto-match dialog: explain category-based matching, show orange 'Supplier Cost' and green 'Xero Revenue' cards per proposal
- [x] Filter credit notes (negative lineAmount) from fuzzy match candidates

# Bug Fixes - Billing Match Page (2026-03-14 session 2)
- [x] Fix: legacy-matched services (in service_billing_match_log but not service_billing_assignments) show as "Matched" but are invisible in drag-drop left column
- [x] Fix: getUnassignedServicesForCustomer excludes services that are only in legacy match log — they should appear as unassigned if not in service_billing_assignments
- [x] Fix: billing item picker (expand-row dropdown) shows "No unmatched billing items" because matchStatus filter is too restrictive
- [x] Remove/replace broken expand-row dropdown picker with drag-and-drop only; all billing items should be droppable targets
- [x] Fix: getAvailableBillingItemsForCustomer should return ALL billing items for the customer, not just unmatched ones
- [x] Rule: a service is only "Matched" if it has BOTH a customer assignment AND a service_billing_assignments entry. Legacy match_log entries alone must NOT mark a service as matched.
- [x] Remove legacy match_log "linked" entries from the matched/unmatched display logic — only service_billing_assignments counts

# Unmatched Services - Customer Match Triage (2026-03-16)
- [ ] Add batch scoring: tRPC procedure to count unmatched services by confidence tier (high/medium/low/none)
- [ ] Add filter tabs to Unmatched Services page: All / Has Suggestions / No Customer Match
- [ ] Add top summary banner: "X services can be assigned to a customer — Y have no match"
- [ ] Auto-expand high-confidence cards on the Has Suggestions tab
- [ ] Add Bulk Auto-Assign button for unambiguous high-confidence single-customer matches
- [ ] Confirmation dialog showing list of services to be bulk-assigned before applying

# Unmatched Services Triage - Revised (2026-03-16)
- [x] Remove account-group approach (same account ≠ same customer)
- [x] Add data-completeness triage: classify services as Has Identifiers (phone/AVC/address) vs Needs Investigation
- [x] Add filter tabs: All / Has Identifiers / Needs Investigation
- [x] Add summary banner with counts per tier
- [x] Sort Has Identifiers tab: phone first, then AVC, then address only
- [x] Add per-row triage badge (Phone/AVC/Address/No ID) on each service card

# Unmatched Services - Enriched Matching Signals (2026-03-16)
- [ ] Audit all available fields in services table and related tables
- [ ] Enrich getUnmatchedServices query to return all available fields
- [ ] Add cross-reference lookups: phone→customer, AVC→location, address→location, supplierAccount→customers
- [ ] Redesign expanded panel to show all data points in structured layout
- [ ] Show "similar services" already assigned to customers (same plan/provider/account)
- [ ] Show location match candidates based on address
- [ ] Show billing item candidates based on service type

# Bug Fix - React Error #310 (Unmatched Screen)
- [x] Fix all React hooks order violations in UnmatchedServices.tsx (React error #310 persists after first fix attempt)
- [x] Root cause: triageCounts useMemo was placed after if (isLoading) return early return in main component
- [x] Fix: moved triageCounts useMemo before the isLoading early return (all hooks must be called unconditionally)

# System-Managed Fields - Make Editable
- [x] Remove read-only lock from Service Name/ID, Monthly Cost, Service Type, Provider fields
- [x] Add inline edit + save to those fields (amber section with note "editable until product mapping is complete")
- [x] Wire to tRPC updateService procedure - added serviceId, monthlyCost, serviceType, provider to Zod schema and DB trackField calls

# Blitz Report Import - March 2026
- [x] Add blitz import fields to DB schema (blitzImportDate, blitzDataUsage3m, blitzDataUsage6m, blitzVoiceUsage3m, blitzVoiceUsage6m, blitzLastUsedDate, blitzNoUse3m, blitzNoUse6m, blitzDeviceAgeMths, blitzPostcode, blitzMroContract, blitzMroEndDate, blitzMroEtc, blitzBillingHistory)
- [x] Write import script to match 161 existing services and update with Blitz data
- [x] Write import script to create 60 new Telstra Mobile services from Blitz
- [x] Flag 147 services (no usage 6 months) as flagged_for_termination with agent note
- [x] Add MRO contract warning note to 18 services under contract
- [x] Build Blitz Termination Review screen in app
- [x] Generate termination report CSV for Telstra submission
- [x] Add blitz import history table to track imports (tracked via blitzImportDate/blitzReportName fields)

# AAPT March 2026 Invoice Import

- [ ] Extract all AAPT services from PDF into structured dataset
- [ ] Add supplier_invoice_mappings table to DB schema (supplier, product_key, description_pattern, mapped_customer_id, mapped_service_id, confidence, created_by, last_used)
- [ ] Add AAPT-specific fields to services schema (aaptServiceId, aaptAccessId, aaptYourId, aaptProductType, aaptContractMonths, aaptSpeedMbps, aaptInvoiceNumber, aaptAccountNumber, aaptBillingPeriod)
- [ ] Add AAPT to suppliers table with proper ranking
- [ ] Run AVC/address/fuzzy matching script against existing customers and services
- [ ] Store all confirmed matches as reusable mapping rules in supplier_invoice_mappings
- [ ] Import all AAPT services into DB with provider = 'AAPT'
- [ ] Populate unmatched screen with unmatched AAPT services (full context: address, AVC, cost, Your ID)
- [ ] Build AAPT invoice uploader on suppliers screen with PDF parsing
- [ ] Build mapping review UI: show auto-applied mappings + new lines needing review
- [ ] Build mapping management screen: view/edit/delete saved mapping rules per supplier
- [ ] On manual match confirmation, auto-save as mapping rule for future invoices
- [ ] Refresh dashboard tallies (cost, margin, revenue) to include AAPT data
- [ ] Refresh services-by-provider chart to show AAPT

## SasBoss Wholesale Cost Mapping
- [ ] Extract Access4 Diamond pricebook - all products, wholesale costs, RRP
- [ ] Build supplierProductCostMap table in DB schema
- [ ] Build product cost mapping UI on Suppliers page
- [ ] Apply wholesale costs to all SasBoss services in DB
- [ ] Support Xero per-customer cost overrides

## Access4/SasBoss Invoice Import & Uploader - March 2026

- [ ] Fix pricebook DB seed script (Python f-string error) and re-seed from Excel
- [ ] Re-apply correct Diamond wholesale costs to all SasBoss services (monthlyCost = wholesale)
- [ ] Move SasBoss Pivot retail data to monthlyRevenue field (not monthlyCost)
- [ ] Extract March Access4 invoice PDF - all line items, customer names, amounts
- [ ] Match invoice lines to existing customers and services using fuzzy logic
- [ ] Import matched invoice lines: wholesale cost to monthlyCost, retail to monthlyRevenue
- [ ] Populate unmatched screen for lines that cannot be auto-matched
- [ ] Build drag-and-drop invoice uploader on Suppliers page (SasBoss panel)
- [ ] Repeatable mapping engine: save product→customer mappings for future uploads
- [ ] Pivot/Dispatch sheet upload: auto-store as retail (monthlyRevenue) not cost

## ReconciliationBoard Improvements - March 2026

- [x] Fix auto-match to trigger automatically at >=90% confidence on mount (was 100%)
- [x] Add Re-run Auto-Match button to ReconciliationBoard header
- [x] Add Sync Costs button to re-apply costs from latest SasBoss workbook
- [x] Add recalculateCostsFromWorkbook() backend function + tRPC endpoint
- [x] Add $0.00 cost warning badge on service cards (rose-red highlight)
- [x] Add zero-cost warning banner when services have $0.00 supplier cost
- [x] Add auto-match running indicator (blue spinner banner)
- [x] Improve billing item tab filtering using description-based classification (not just category field)
- [x] Lower auto-match threshold from 100% to 90% for better coverage

# Live Carbon API Sync with Caching
- [x] Probe live Carbon API to confirm correct auth endpoint and session flow
- [x] Add carbon_api_cache table to schema (cacheKey, totalServices, rawJson, fetchedAt, ttlHours, lastSyncedServicesCount, lastSyncedAt)
- [x] Apply schema migration via webdev_execute_sql
- [x] Build fetchAllCarbonServices() helper: authenticate (split-secret password), paginate all 260 services across 3 pages
- [x] Build getCarbonServicesCached(): check cache freshness (default 6h TTL), call live API if stale, upsert cache row
- [x] Add getCarbonCacheStatus() helper and carbonCacheStatus tRPC procedure
- [x] Upgrade syncCarbonCostsToServices() to call live API, 3-way matching (service_identifier, circuit_id, carbonServiceId), update carbonMonthlyCost + carbonPlanName + carbonServiceId + carbonAlias + carbonServiceType
- [x] Update syncCarbonCosts tRPC procedure with forceRefresh option
- [x] Update carbon-api.test.ts: single login in beforeAll, 5 tests covering credential assembly, login, services shape, live fetch+cache, cache hit
- [x] All 137 tests passing (15 test files)

# Vocus IPTel Import & 13Number Fix
- [x] Import 121 Vocus IPTel contracts from VocusSmileITIPTel.xlsx ($5,943.91 ex-GST total)
- [x] Fuzzy-match 91 contracts automatically to existing customers on first pass
- [x] Resolve 27 of 30 unmatched contracts using confirmed abbreviation mappings
- [x] Create 4 new customers: Salter Brothers Hospitality, Hazelwood Estate, Novus Glass, ASDL Ltd
- [x] Fix 13Number product cost map: corrected from $900/month to $0.21/min wholesale ($0.30/min retail) per invoice ST-6796
- [x] Fix 13 services with incorrect $900 monthlyCost: recalculated as 70% of revenue (invoice-derived)
- [x] Correct 13Number services provider from SasBoss to Vocus, billingPlatform to Datagate
- [x] 118/121 contracts matched to customers; 3 left pending (SME, BN-002035 V2, Milestone/Legrand)
- [ ] Resolve 3 pending Vocus contracts: SME (AB054529), BN-002035 V2 (AB031926), Milestone/Legrand (AB046638)

# Vocus IPTel Import & 13Number Fix
- [x] Import 121 Vocus IPTel contracts from VocusSmileITIPTel.xlsx ($5,943.91 ex-GST total)
- [x] Fuzzy-match 91 contracts automatically to existing customers on first pass
- [x] Resolve 27 of 30 unmatched contracts using confirmed abbreviation mappings
- [x] Create 4 new customers: Salter Brothers Hospitality, Hazelwood Estate, Novus Glass, ASDL Ltd
- [x] Fix 13Number product cost map: corrected from $900/month to $0.21/min wholesale ($0.30/min retail) per invoice ST-6796
- [x] Fix 13 services with incorrect $900 monthlyCost: recalculated as 70% of revenue (invoice-derived)
- [x] Correct 13Number services provider from SasBoss to Vocus, billingPlatform to Datagate
- [x] 118/121 contracts matched to customers; 3 left pending (SME, BN-002035 V2, Milestone/Legrand)
- [ ] Resolve 3 pending Vocus contracts: SME (AB054529), BN-002035 V2 (AB031926), Milestone/Legrand (AB046638)

# Terminated Services Archiving & JSON Parse Fix
- [x] Fix JSON parse crash on published site: billingPlatform column had mixed raw strings ("SasBoss", "Datagate") and JSON arrays - converted all to JSON array format in DB
- [x] Fix ServiceDetail.tsx to use safe JSON.parse with try/catch for billingPlatform
- [x] Exclude terminated services from Revenue & Margin table (getServicesWithMargin)
- [x] Exclude terminated services from customer stat cards (Total Services, Monthly Cost, AVC Coverage, Provider Breakdown)
- [x] Exclude terminated services from Locations & Services section in CustomerDetail
- [x] Exclude terminated services from servicesByLocation map in useData.ts
- [x] Update getDashboardTotals to exclude both terminated AND archived services
- [x] Update customer list query to hide customers with only terminated/archived services
- [x] Terminated services remain visible in Flagged & Terminated section on customer detail page

# Missing Cost & Revenue Population (Comprehensive Audit)
- [x] Audit all services with $0 or unknown cost by provider (ABB, AAPT, SasBoss, SmileTel, Vocus, Exetel, Channel Haus)
- [x] Populate ABB Opticomm costs from Carbon API or pricebook — applied Kent (ABB) Opticomm pricing to all 4 ABB Opticomm services
- [x] Populate SasBoss DID/Teams Voice SIP DID costs from pricebook (8 services); Voicemail User/UCXcel/eFax (19 services)
- [ ] Populate AAPT costs from AAPT invoice data where missing (61 services — revenue not yet matched in Xero)
- [x] Populate SmileTel hosted number/BSIP/number rental costs from pricebook (4 services)
- [x] Run full revenue recalculation from service-matched billing items (970 services updated)
- [ ] Populate Vocus/Exetel/ChannelHaus missing revenue — 118/11/65 services have cost but no Xero match yet
- [x] Populate SmileTel NBN bundle costs using Carbon API wholesale estimates (91 services updated)
- [ ] Resolve remaining $0 cost SasBoss services (478 services — need Access4/SasBoss pricebook expansion)
- [ ] Resolve remaining $0 revenue ABB services (142 services — need Xero invoice matching)

# Duplicate Service Removal & Graphene Merge
- [x] Audit all duplicate services (same customer + phone/AVC + provider + cost)
- [x] Remove duplicate service records: S0289, S0002 (Little Cha), 6x TIAB 4G (SM Import Ella)
- [x] Merge Graphene customers: all 8 services consolidated under C0107 (Graphene Manufacturing Australia)
- [x] Recalculate all affected customer stats after deduplication (8 customers)

# Zambrero Restaurant Detail Import & Xero Feb 2026 Matching

- [ ] Parse RestaurantDetailList.xlsx and map each site to existing DB customers by name/entity
- [ ] Create missing Zambrero customer records with full address, contact, and entity data
- [ ] Update existing Zambrero customer records with enriched data (entity name, address, contacts)
- [ ] Build entity-to-site lookup table for Xero contact name matching
- [ ] Re-run Xero Feb 2026 matching using enriched Zambrero entity-to-site mapping
- [ ] Apply Feb 2026 revenue to all matched services and recalculate customer stats
- [ ] Export unmatched Xero billing items to spreadsheet

# Phase 2 — Remote Diagnostics & Billing Intelligence
- [x] Add carbon_diagnostic_runs table to schema and run migration
- [x] Add usage_threshold_alerts table to schema and run migration
- [x] Build Carbon remote diagnostics server module (port reset, loopback test, stability profile)
- [x] Add tRPC procedures: runDiagnostic, getDiagnosticHistory, getDiagnosticRun
- [x] Build CarbonDiagnosticsPanel component for ABB service detail pages
- [x] Inject CarbonDiagnosticsPanel into ServiceDetail.tsx
- [x] Build getSuppressedUnbilledServices query (excludes services with active Carbon outage)
- [x] Add suppressedUnbilledServices tRPC procedure
- [x] Wire outage suppression banner into ReconciliationBoard (shows suppressed services with outage info)
- [x] Build carbon-usage-alerts engine (checkUsageThresholds, 80%/90%/100% breach detection)
- [x] Add owner notification trigger when service crosses 80% plan allowance
- [x] Add acknowledgeUsageAlert and getUsageThresholdAlerts helpers
- [x] Add tRPC procedures: getUsageAlerts, acknowledgeUsageAlert, runUsageThresholdCheck
- [x] Build UsageAlerts page with active/acknowledged tabs and manual check trigger
- [x] Add Usage Alerts nav entry to sidebar
- [x] Write vitest tests for all three features (18 tests, all passing)

# BlitzNet Provider & PDF Invoice Upload
- [ ] Add BlitzNet to provider enum in schema and ProviderBadge component
- [ ] Create/link BlitzNet service records for Zambrero Marrickville (Kim Walker, Unit 3, 186 Victoria Rd)
- [ ] Map invoice line items: BlitzNet Basic 25-10 Mbps ($62.73/mo), Static IP ($2.73/mo), Activation fee ($40.91 one-off)
- [ ] Add supplier_invoice_files table for storing uploaded PDFs
- [ ] Build PDF upload backend: S3 storage + tRPC procedures (upload, list, delete)
- [ ] Build PDF upload UI on SupplierInvoices page with drag-and-drop and line item preview
- [ ] Write vitest tests for new features

# Remote Diagnostics Bug Fixes
- [x] Fix Carbon API login error (429) in Remote Diagnostics — check auth flow in carbon-diagnostics.ts
- [x] Restyle Remote Diagnostics panel — replace violet/purple with neutral slate/zinc colours

# Omada API v6.1 Integration

- [x] DB schema: omada_sites, omada_device_cache tables + omadaSiteId on customers + omadaDeviceId on services
- [x] Run Drizzle migration for new Omada tables/columns
- [x] Omada OAuth2 server module (token cache, auto-refresh, APAC CBC base URL)
- [x] Omada API helpers: site list, site status, device list, device status, client list, block/unblock client
- [x] Auto-match sites to customers by site name similarity
- [x] tRPC procedures: listOmadaSites, getSiteStatus, getDeviceStatus, getClients, blockClient, unblockClient, syncOmadaSites, matchSiteToCustomer
- [x] Omada Fleet Overview page (new sidebar nav entry: Network)
- [x] Omada Site Panel on Customer Detail page (WAN IP, uptime, health score, device/client counts)
- [x] Omada Device Panel on Service Detail page (uptime, firmware, CPU/mem, port/radio status)
- [x] Connected Clients panel on Customer Detail page (active clients + block/unblock with confirmation dialog)
- [x] Secrets: OMADA_CLIENT_ID, OMADA_CLIENT_SECRET, OMADA_CONTROLLER_ID
- [x] Vitest tests for Omada module

# Omada Token Expiry Fix
- [x] Fix omada.ts: catch -44112 refresh token expired error and fall back to full re-login

# Omada Token Fix v2
- [ ] Rewrite omada.ts token layer: always fetch fresh on first call, never seed cache with stale token

# Omada API Integration Fix
- [x] Diagnose -44112 access token error on Omada northbound API
- [x] Identify root cause: Authorization header must use `AccessToken=` (equals) not `AccessToken ` (space)
- [x] Fix Authorization header format in server/suppliers/omada.ts
- [x] Update Omada credentials (new SmileTel application: aed4409d, omadacId: 2e61e281)
- [x] Write vitest to validate credentials and API connectivity

# Omada Site-to-Customer Linking
- [x] Fix Omada site links: Caravan Fix Kunda Park → Caravan and RV Works customer
- [x] Fix Omada site links: JESS DJ STEEL & CONCRETE → correct customer
- [x] Fix Omada site links: NICKI'S PROFESSIONAL SECURITY SCREENS AND BLINDS → correct customer
- [x] Investigate CBC API for traffic/health trend/ISP activity data

# Bug: Omada Panel Disappears After Sync
- [x] Fix: Sync Now overwrites manual customerExternalId links with null/unmatched

# Omada New Features
- [x] Site-linking UI on API Integrations page (assign Omada sites to customers)
- [x] Top Clients by Traffic panel on Omada Network card (top 5 by trafficDown+trafficUp)
- [x] Hourly auto-sync cron job for Omada WAN/device/client data

# Omada Traffic Time Filter
- [x] Add time period selector (24h / 7d / 30d / All Time) to Top Clients and Connected Clients panels

# Vocus Mobile Rate Card Ingestion
- [x] Parse Vocus Wholesale Mobile Rate Card PDF (effective 3 Feb 2025)
- [x] Create supplierRateCards and supplierRateCardItems database tables
- [x] Ingest 182 rate items (PAYGD, legacy data buckets, voice buckets, SMS buckets, 4G backup, misc fees, international roaming Zone 1)
- [x] Build Rate Cards UI page with category browsing (collapsible sections per category)
- [x] Add Rate Cards nav item to sidebar
- [x] Add tRPC procedures: rateCards.list, rateCards.getItems, rateCards.getCategories

# Bug: ABB API Panels Not Displaying
- [ ] Fix: ABB API panels not showing on ABB services in customer detail page

# Service Data Verification Framework
- [ ] Analyse unverified ABB services (provider=ABB but no carbonServiceId)
- [ ] Add providerVerified / verificationSource fields to services table
- [ ] Platform Checks: add "Unverified Provider" check showing services with unconfirmed provider claims
- [ ] Service Detail: add warning banner when provider is unverified (no API confirmation, no invoice match)
- [ ] Allow quick provider correction from the warning banner

# Service Data Verification Framework
- [x] Analyse scope: 33 unverified ABB services (9 Opticomm misclassifications, 24 without Carbon API record)
- [x] Add provider verification warning banner on ServiceDetail page for unverified ABB services
- [x] Add getUnverifiedServices tRPC procedure to list all unverified ABB services
- [x] Add Data Quality panel to Platform Checks page showing expandable list of unverified services
- [x] Opticomm plan name detection: auto-flag services with Opticomm plan names as likely misclassified

# Bulk Provider Reclassification — Opticomm
- [x] Add bulkReclassifyProvider tRPC mutation to reclassify all services matching a plan name pattern to a new provider
- [x] Add "Change provider to Opticomm" bulk action button to Platform Checks Data Quality panel
- [x] On click: reclassify all 9 Opticomm-named ABB services (S0459–S0467) to provider=Opticomm in one action

## Carbon API Diagnostics & Outage Fixes
- [x] Add carbon.checkSystemAvailability tRPC procedure (GET /tests/availability)
- [x] Add carbon.getAvailableTests tRPC procedure (GET /tests/{service}/available)
- [x] Add carbon.runDiagnosticTest tRPC procedure with pre-flight validation
- [x] Add carbon.getServiceOutages tRPC procedure (GET /service/{service}/outages)
- [x] Update Diagnostics panel: system availability banner
- [x] Update Diagnostics panel: dynamic test list from getAvailableTests
- [x] Update Diagnostics panel: improved error messages
- [x] Add Service Outages panel to ServiceDetail.tsx

## Carbon API Outage Features (Round 2)
- [ ] Add bulk customer outage status tRPC procedure
- [ ] Add re-verify with Carbon API tRPC procedure
- [ ] Add active outages count tRPC procedure for Platform Checks
- [ ] Add outage badge to Customer List rows
- [ ] Add Re-verify button to Carbon API Data panel on Service Detail
- [ ] Add active outages alert card to Platform Checks
- [x] Standardise Carbon API pricing to Ex GST (÷1.1) throughout application
- [x] Fix: Restore Omada Network panel on ServiceDetail page (OmadaSitePanel via customerExternalId)

## TIAB / Octane API Integration
- [ ] Add TIAB env vars to env.ts (TIAB_API_USERNAME, TIAB_API_PASSWORD, TIAB_API_BASE_URL)
- [ ] Build server/suppliers/tiab.ts - Octane API client (Basic Auth, pagination, retry/backoff)
- [ ] Octane endpoints: Customer (list, get), Service (list, get), Mobile (notification settings, data pool, eSIM), Plan (list, get), Transaction (list), Order (list)
- [ ] Extend drizzle schema: tiabCustomers, tiabServices, tiabDataPools, tiabTransactions, tiabSyncLog tables
- [ ] Run DB migration for TIAB tables
- [ ] Build tRPC procedures: tiab.syncCustomers, tiab.syncServices, tiab.syncTransactions, tiab.getDataPools, tiab.getEsimDetails, tiab.updateDataLimit, tiab.transferPool, tiab.getNotificationSettings, tiab.updateNotificationSettings, tiab.reconcileServices
- [ ] Build TIAB dashboard page (mobile services list, data pools, eSIM status, reconciliation report)
- [ ] Add TIAB to API Integrations page with sync controls and status
- [ ] Add nightly sync cron job for TIAB services and transactions
- [ ] Write vitest tests for TIAB API client and reconciliation logic
- [x] TIAB API integration - schema, client, tRPC procedures, UI, tests

## SmileTel Branding

- [x] Upload SmileTel logo, webp, and animation assets to CDN
- [x] Apply SmileTel brand colour tokens to CSS variables (orange #e95b2a, black #000, greys)
- [x] Rebrand sidebar: jet black background, SmileTel logo, orange active nav states
- [x] Update global typography: Inter UI font + JetBrains Mono for data values
- [x] Build comprehensive in-app Style Guide page (/style-guide) with all brand sections
- [x] Add Style Guide to sidebar navigation

# Vocus Portal Data Extraction — Mobile SIM & NBN Services

- [ ] Design and migrate DB schema: vocus_mobile_services, vocus_nbn_services, vocus_buckets tables
- [ ] Extract all Standard Mobile services from Vocus portal (active + inactive)
- [ ] Extract all 4G Backup services from Vocus portal (active + inactive)
- [ ] Extract all NBN services from Vocus portal (wba.rvcict.com.au realm)
- [ ] Extract bucket quota data for mobile.smileit.com and data.smileit.com
- [ ] Load extracted Vocus Mobile SIM data into vocus_mobile_services table
- [ ] Load extracted Vocus NBN data into vocus_nbn_services table
- [ ] Cross-match Vocus Mobile services to existing services table (by MSN/phone, SIM serial)
- [ ] Cross-match Vocus NBN services to existing services table (by address, connection ID)
- [ ] Build tRPC procedures: vocus.getMobileServices, vocus.getNbnServices, vocus.getBuckets
- [ ] Build Vocus Services UI page with Mobile and NBN tabs
- [ ] Add Vocus to API Integrations page with sync status
- [ ] Write vitest tests for Vocus data procedures
- [ ] Save checkpoint

## Vocus Portal — Source of Truth Extraction (Expanded)

- [ ] Extract inactive NBN services list from portal
- [ ] Extract individual NBN service detail pages (AVC ID, NTD ID, address, speed tier, plan, IP, customer ref, establishment date)
- [ ] Extract inactive Standard Mobile SIM services
- [ ] Extract inactive 4G Backup SIM services
- [ ] Extract Standard Mobile bucket per-service quota usage breakdown
- [ ] Extract 4G Backup bucket per-service quota usage breakdown
- [ ] Expand vocus_nbn_services schema: avcId, ntdId, nbnLocationId, address, speedTier, technology, ipAddress, customerRef, establishmentDate, wsmServiceId
- [ ] Expand vocus_mobile_services schema: plan, dataAllowanceGb, voiceMinutes, smsCount, bucketDomain, wsmServiceId
- [ ] Expand vocus_buckets schema: per-service usage rows, pool assignment, overage flag
- [ ] Seed all extracted data into database
- [ ] Build tRPC: vocus.listNbn, vocus.listMobile, vocus.getBuckets, vocus.getServiceDetail, vocus.syncAll
- [ ] Build Vocus Services dashboard (NBN tab + Mobile tab, search, filter by customer/status)
- [ ] Build customer matching view (link Vocus services to SmileTel customers by AVC/MSN/address)
- [ ] Build quota alert panel (over-quota pools, per-service breakdown, recommended top-up)
- [ ] Build billing reconciliation view (Vocus wholesale cost vs SmileTel invoiced)
- [ ] Add Vocus sync status to API Integrations page
- [ ] Write vitest tests for Vocus procedures

## Vocus Portal Extraction — Completed 2026-03-24

- [x] Extract active Standard Mobile SIMs (75 records)
- [x] Extract inactive Standard Mobile SIMs (3 records)
- [x] Extract active 4G Backup SIMs (18 records)
- [x] Extract inactive 4G Backup SIMs (1 record)
- [x] Extract active NBN services (58 records)
- [x] Extract inactive NBN services (89 records)
- [x] Bulk-scrape NBN service detail pages (AVC IDs, addresses, technology, speed tier, IP, POI)
- [x] Bulk-scrape Mobile SIM detail pages (customer names, SIM numbers, plan IDs)
- [x] Extract bucket quota snapshots (Standard Mobile + 4G Backup — both over quota)
- [x] Design and migrate database schema (vocus_mobile_services, vocus_nbn_services, vocus_buckets, vocus_sync_log)
- [x] Seed all extracted data into the database (96 mobile + 147 NBN + 2 buckets)
- [x] Build Vocus tRPC router (listMobile, listNbn, getNbn, getMobile, listBuckets, getSummary, getSyncLog)
- [x] Register vocusRouter in main appRouter
- [x] Add Vocus Wholesale nav item to sidebar
- [x] Build VocusDashboard page with NBN + Mobile tabs, quota alert banner, status/match badges
- [x] Write and pass 6 vitest tests for Vocus database tables

## Vocus Auto-Match, Quota Action & Scheduled Sync — Completed 2026-03-24

- [x] Auto-match Vocus NBN services to SmileTel customers via AVC ID (exact) and address fuzzy matching (27/58 matched)
- [x] Auto-match Vocus Mobile SIMs to SmileTel customers via customer name and phone number (MSN) (92/93 matched)
- [x] Update vocus_nbn_services and vocus_mobile_services with internalServiceExternalId, internalCustomerExternalId, matchType, matchConfidence
- [x] Confirm +200 GB Standard Mobile quota increase in Vocus portal (Pending — submitted 24/Mar/2026 2:54 PM)
- [x] Submit +200 GB 4G Backup quota increase in Vocus portal (Submitted — 24/Mar/2026 3:59 PM)
- [x] Build server-side Vocus portal scraper (vocusScraper.ts) with Puppeteer for weekly automated sync
- [x] Wire up weekly cron job for Vocus sync (every Monday 6am — server/_core/index.ts)
- [x] Add tRPC endpoints: triggerManualSync, submitSyncOtp, getSyncOtpStatus
- [x] Build Sync tab in VocusDashboard with manual trigger, OTP input panel, and sync history table
- [x] All 6 Vocus vitest tests passing

## Vocus AVC Cross-Link & Quota Alert Automation — Completed 2026-03-24

- [x] Run AVC cross-link pass: update services.connectionId from services.avcId (236 services updated)
- [x] Cross-link Vocus NBN AVC IDs to services.connectionId via internalServiceExternalId match
- [x] Build vocusQuotaAlerts.ts module with 70%/90%/100% threshold checks and owner notifications
- [x] Wire quota alert into daily cron at 8am AEST in server/_core/index.ts
- [x] Add checkQuotaAlerts tRPC mutation endpoint to vocus router
- [x] Add dedicated Buckets tab to VocusDashboard with per-bucket usage bars, voice/SMS stats, and manual Check Alerts Now button
- [x] All 6 Vocus vitest tests passing

## Octane/TIAB Portal Data Extraction — Completed 2026-03-24

- [x] Log into Octane portal and map all navigation sections and data sources
- [x] Extract all 31 Octane customer/account records via browser automation (POST to SrvSearch)
- [x] Extract 84 Zambrero service records (each treated as individual customer entity)
- [x] Extract and parse 4 TIAB supplier invoices (100998-279 through 100998-282) from PDFs
- [x] Design and migrate database schema (tiab_supplier_invoices, tiab_supplier_invoice_line_items, octane_customer_links)
- [x] Seed all 31 Octane customers into tiab_customers table
- [x] Seed 84 Zambrero services into tiab_services table
- [x] Seed 111 Octane customer links into octane_customer_links table (84 Zambrero + 30 non-Zambrero + 1 parent)
- [x] Seed 4 supplier invoices with 10 corrected line items into tiab_supplier_invoices
- [x] Add tRPC procedures: getSupplierInvoices, getSupplierInvoiceDetail, getSupplierInvoiceSummary, getOctaneLinks, updateOctaneLink, getOctaneLinkStats
- [x] Add Supplier Invoices tab to TiabDashboard (invoice cards, growth trend chart, line item detail)
- [x] Add Customer Links tab to TiabDashboard (stats, search/filter, match status table)
- [x] Run auto-match Octane customers against existing SmileTel customers/services (100/111 matched, 90% rate)
- [x] Write vitest tests for Octane/TIAB supplier invoice and customer link tables (12 tests, all passing)

## TIAB Supplier Wiring, Auto-Match & Service Extraction — Completed 2026-03-24

- [x] Add TIAB as a supplier in supplierAccounts table (status: pending rate card — costs show $0.00 until rate card applied)
- [x] Reverted TIAB per-service averaged costs back to $0.00 (averaging was inaccurate without CDR data)
- [x] Run auto-match: fuzzy-match 111 octane_customer_links against SmileTel customers by name and ABN (100/111 matched, 90% rate)
- [x] Parse TIAB MVNO Wholesale Pricebook Jan 2025 — 31 plans extracted and seeded into tiab_plans
- [x] Map Retail Data Plan → TW Data Only 12GB ($16.01/mo base, Ex GST) — base charge only, pool usage/overages charged separately
- [x] Map ST Data Pool 60GB → TW 5G Mobile Pool 60GB ($49.91/mo base, Ex GST)
- [x] Generate comprehensive Excel spreadsheet of all TIAB services (TIAB_Services_Report.xlsx — 6 sheets, 84 Zambrero services, 111 Octane links, 31 accounts, 4 invoices, 31 plans)
- [ ] Extract per-customer services from 30 non-Zambrero Octane customers via browser automation
- [ ] Seed extracted non-Zambrero services into tiab_services
- [ ] Ingest TIAB rate card and calculate per-service costs against actual CDR usage data
- [ ] Build TIAB rate card ingestion UI (upload rate card, map plan names to costs, apply to services)

## CDR Usage Export, Unmatched Link Review & Non-Zambrero Service Extraction

- [ ] Navigate Octane portal and export CDR/usage data per data pool and per SIM (monthly)
- [ ] Ingest CDR data and calculate per-service costs (base + pool usage + overages) against rate card
- [ ] Manually review 11 unmatched Octane links: Orphan Services, SmileTel, JOSHELLEY PTY LTD, Bel's Resto, Infinitea Trading (x5), Mother Duck Childcare
- [ ] Create new customer records for unmatched Octane links where needed (Infinitea Trading, Mother Duck Childcare)
- [ ] Extract services for 30 non-Zambrero Octane customers via browser automation
- [ ] Seed extracted non-Zambrero services into tiab_services
- [ ] Update dashboard TIAB service counts and costs
- [ ] Populate TIAB supplier cost on dashboard from most recent supplier invoice total (invoice 100998-282, Feb 2026: $6,606.49 ex GST)
- [x] Match unmatched Vocus NBN services to RVC ICT Consulting (C0207 - Ian Donald): S7411 Ian Donald FTTP 14 Page St North Lakes $81.05/mo + S7412 Kate Donald HFC 43 Avington St Keperra $68.83/mo (AVC400045874456)
- [x] Match all 16 unmatched Vocus RVC-STUB services to SmileTel customers with full data mapping (technology, speed, IP, address, connected date) — 2 new customers created: Expert Electrical Aus Pty Ltd (C9027), Medpods Medical Centre - Yeppoon (C9028)

## Next Steps — TIAB/Octane Non-Zambrero Service Extraction

- [ ] Extract services for 30 non-Zambrero Octane customers via browser automation (navigate to each customer's Services tab)
- [ ] Seed extracted non-Zambrero services into tiab_services table
- [ ] Export CDR/usage data from Octane Reports (Mobile Data Usage / Pool Detail Report)
- [ ] Ingest CDR data and calculate per-service costs (base + pool usage + overages) against rate card
- [ ] Regenerate TIAB_Services_Report.xlsx with all newly matched services and complete service inventory

## Revenue Matching Improvements (Mar 2026)

- [x] Fix #1: globalAutoMatch now fires automatically after importSasBoss, importExetel, importAccess4, importGenericSupplier; background job now also runs redistributeProportionalRevenue + recalculateAll on completion
- [x] Fix #2: Improved billingCategory() to recognise ChannelHaus SIP/rental patterns and Exetel CDR call types as voice; improved provider alignment scoring; fixed globalAutoMatchBillingItems row extraction bug (was only processing 2 customers, now processes all 402)
- [x] Fix #3: redistributeProportionalRevenue() function added — splits billing items assigned to multiple services proportionally by monthlyCost; wired into globalAutoMatch background job
- [x] Run globalAutoMatch after all fixes — 480 new assignments created; revenue jumped from $289,894 → $467,641 (+$177,747 total improvement across all three fixes)
- [x] Fix [Max Depth] serialisation in globalAutoMatch result toast — result now flattened before storing in job state
- [x] globalAutoMatch background job now awaits recalculateAll after proportional split to keep monthlyRevenue in sync

## GST Display Standardisation (Mar 2026)

- [x] Audit all currency display points for GST handling
- [x] Ensure all revenue, cost, billing amounts display ex-GST consistently (labels, tooltips, column headers)
- [x] Add "ex GST" label to all relevant column headers and summary cards — AutoMatch, Suppliers, UnmatchedBillingQueue, CustomerBillingMatch, BlitzTerminationReview updated
- [x] Verify billing_items.lineAmount is stored ex-GST (Xero exports ex-GST by default — confirmed)
- [x] Backfill service_billing_assignments from billing_items.serviceExternalId — 2,517 new rows, +$26,813 revenue unlocked
- [x] Update monthlyRevenue on services and customers after backfill

## Revenue Matching Fixes — Round 2 (Mar 2026)

- [ ] Fix #2: Investigate DataGate/Telstra billing item description patterns vs service types
- [ ] Fix #2: Improve fuzzy matching scoring for DataGate platform services (Telstra 183 svcs $9,375/mo, AAPT 50 svcs $7,300/mo)
- [ ] Fix #3: Implement proportional ABB revenue split — when one Xero "Data - Internet" line covers multiple NBN services, split revenue by monthlyCost ratio
- [ ] Fix #1: Wire globalAutoMatch after Xero CSV import (importXeroData mutation / script)
- [ ] Run globalAutoMatch after all fixes and verify revenue improvement

## Dashboard Auto-Refresh (Mar 2026)

- [x] Add refetchInterval polling (30s) to dashboard stats tRPC query so cards update automatically
- [x] Add last-updated timestamp to dashboard header
- [x] Add manual refresh button to dashboard header

## UX Polish Round 2 (Mar 2026)

- [x] Add refetchInterval: 30_000 to Revenue & Margin page query hook
- [x] Add Auto-Match completion toast ("Auto-Match complete — dashboard updated")
- [x] Add "Data as of <billing period>" footer to each dashboard stat card
- [ ] Add "Data as of" footer to Revenue & Margin summary cards

## Vocus Pool & Alert Branding (Mar 25 2026)
- [ ] Check Vocus STANDARD-POSTPAID pool size — verify yesterday's update was applied
- [ ] Update Usage Alert notification email to notifications@smiletel.com.au
- [ ] Rebrand alert emails: replace 'Manus' with 'SmileTel', remove 'Manus From Meta' footer

## SendGrid Email & DataGate Zero-Cost Flag (Mar 25 2026)
- [ ] Build sendEmail helper using SendGrid API (noreply@smiletel.com.au)
- [x] Update Vocus quota alerts to send branded SmileTel email to notifications@smiletel.com.au
- [x] Flag Managed Voice Support zero-cost services in Revenue & Margin UI as "cost not recorded in DataGate"
- [x] Add Send Test Alert button to Usage Alerts page

## Channel Haus / ECN Negative Margin Investigation
- [ ] Investigate Channel Haus service cost vs revenue mismatch
- [ ] Fix auto-match logic for ECN/Channel Haus services
- [ ] Bulk re-apply correct matches for affected services

## Number Management Page
- [ ] Create phone_numbers DB table (number, type, provider, customer, service_id, monthly_cost, status)
- [ ] Extract Channel Haus numbers from existing billing_items and services data
- [ ] Build number.list and number.sync tRPC procedures
- [ ] Build Number Management page with filter/search/export UI
- [ ] Add "Numbers" to sidebar navigation
- [ ] Add provider sync button per provider
- [x] Seed Channel Haus numbers from invoice data

## Supplier Service ID Searchability
- [ ] Expose Vocus VBU service IDs (vocus_nbn_services.serviceId) in global search
- [ ] Expose Channel Haus service codes in global search and service detail
- [ ] Expose Carbon/ABB AVC IDs in global search
- [ ] Expose Blitz/Telstra service IDs in global search
- [ ] Add supplier service ID column to Services table with copy-to-clipboard
- [ ] Ensure all supplier IDs are searchable from the top-level search bar
- [x] Bulk auto-link Channel Haus numbers to customers
- [x] Set Managed Voice Support monthlyCost to $0.00 across all tiers

# VBU ID / connectionId Surfacing
- [x] Surface Vocus VBU IDs (connectionId) in Number Management page via service join
- [x] Add VBU ID to Number Management search filter
- [x] Improve global search label to show "VBU ID" for Vocus connectionId matches
- [x] Add dedicated "Services by VBU ID" section to global search results for Vocus services
- [x] Add 'Group by Customer' toggle button to Number Management page
- [ ] Build server-side CommsCode sync procedure (login + scrape + upsert)
- [ ] Add Sync CommsCode button to Number Management UI
- [ ] Auto-link CommsCode numbers to services by customer name match
- [x] Restructure sidebar nav into 6 collapsible groups (Dashboard, Review, Suppliers, Accounting, System, Admin)
- [x] Reduce Lucid logo size by 20% in sidebar
- [x] Auto-expand the active group on page load

# Sync NetSIP Button
- [x] Create server/suppliers/netsip.ts — REST API + web portal fallback strategies, CSV + HTML parsing
- [x] Add NETSIP_LOGIN / NETSIP_PASSWORD / NETSIP_WEB_ADDRESS to env.ts
- [x] Add syncNetSIP tRPC mutation to numbers router (upsert + auto-link to services)
- [x] Add "Sync NetSIP" button to Number Management toolbar (mirrors CommsCode/Channel Haus pattern)
- [x] Write 16 unit tests for CSV parser and parseCSVLine helper (all passing)

# Action Smart Group & Envest — Placeholder Service Records
- [x] Inspect CommsCode phone_numbers rows for Action Smart Group (10) and Envest (1)
- [x] Find or create customer records for both organisations
- [x] Create placeholder CommsCode voice service records for each customer
- [x] Run auto-link mutation and verify all 11 numbers are linked — also linked all 24 other unlinked CommsCode numbers (Spicers, Air Restore, CPM, Gateway, Salter Brothers, Wineology, Australian Computer Traders, Smile IT). 0 unlinked CommsCode numbers remain.

# Resolve 307 Unmatched Services
- [ ] Analyse unmatched services by type, supplier, and available matching fields
- [ ] Pass 1: exact phone number + SIM serial cross-match against matched customer services
- [ ] Pass 2: supplier account number match + customer name fuzzy match
- [ ] Pass 3: address-based match for remaining services with location data
- [ ] Update customer service/matched counts and verify dashboard match rate

# Resolve 557 Unmatched Services (Multi-Strategy Matching)
- [x] Pass 1: supplier account match against already-matched services (0 matched — all Telstra accounts are shared across multiple customers)
- [x] Pass 2: phone number cross-match against matched services (34 matched)
- [x] Pass 3: customer name match + manual named services (9 matched: Smile IT internals, SBH, Action Smart End 2 End)
- [x] Pass 4: address-based match (3 matched: Zambrero Majura Park, C2516, C0144)
- [x] Final count: 511 unmatched remain (down from 557) — 82.7% match rate (2436/2947). Remaining 511 are bulk Telstra Mobile/Data SIMs with customerName=Unassigned and no phone cross-match.

# SasBoss Duplicate NBN Service Deduplication
- [ ] Analyse SasBoss duplicate pattern — map SasBoss services to real provider counterparts
- [ ] Merge SasBoss cost data into matched real-provider services
- [ ] Suppress SasBoss duplicates from revenue/cost views
- [ ] Verify and confirm zero double-billing in customer views

# SasBoss/Access4 Full Data Extraction
- [ ] Authenticate with SasBoss portal using stored credentials
- [ ] Extract DID/phone number inventory and upsert into phone_numbers
- [ ] Extract customer list and upsert into customers table
- [ ] Extract services/products and upsert into services table
- [ ] Extract billing costs, revenue, product IDs
- [ ] Extract price book (RRP and wholesale rates)
- [ ] Build automated SasBoss sync procedures in the app

# Vocus Quota Alert System Fixes
- [x] Disable Manus email channel in vocusQuotaAlerts.ts (keep only in-app notifyOwner)
- [x] Fix duplicate alert firing caused by setTimeout + setInterval both running at 8am
- [ ] Update Vocus portal credentials (Smile2024! is no longer valid)
- [ ] Trigger manual Vocus sync to refresh bucket quota data after pool size increase

## Data Freshness & Integration Screen Expansion

- [ ] Add sync_log table to DB to track last-synced timestamps per data source
- [ ] Wire all existing sync operations to write to sync_log on completion
- [ ] Rebuild Integrations screen with per-source status cards, timestamps, refresh buttons, instructions
- [ ] Add stale data banner to Usage Alerts page (>48h old = warning)
- [ ] Add stale data indicators to Dashboard stat cards

## Retail Offering Customer Classification
- [ ] Add `customerType` enum field to customers table (values: standard, retail_offering)
- [ ] Add `retail_bundle_items` table to store bundled billing line items per customer
- [ ] Create DB migration and apply via webdev_execute_sql
- [ ] Add `getRetailBundleItems`, `setRetailOffering`, `getRetailCustomers` procedures to routers
- [ ] Wire OneBill line items (NBN, 4G SIM, Hardware, SIP Channels, Support) to retail bundle aggregation
- [ ] Add "Retail Offering" filter to Customers page search/filter bar
- [ ] Add Retail Offering badge/tag to customer cards and detail views
- [ ] Show bundled retail cost as a single line item in customer service breakdown
- [ ] Make retail bundle components expandable (show individual line items on expand)
- [ ] Add OneBill line item matching to link billable items to services in the database

## Billing Line Item Attribute Extraction (Fuzzy Parser)
- [ ] Audit billing_items descriptions to identify all pattern types (speed, contract, hardware, dates)
- [ ] Add parsedSpeedTier, parsedContractMonths, parsedActivationDate, parsedHardwareStatus, parsedRawAttributes (JSON) columns to billing_items
- [ ] Build server-side regex/fuzzy parser for all attribute types
- [ ] Backfill all existing billing_items with parsed attributes via SQL update
- [ ] Wire parsed speed tier into service matching score (boost when speeds match)
- [ ] Show parsed attributes as chips/badges in CustomerDetail billing items view
- [ ] Add speed tier and contract length filters to CustomerList for retail offering customers

## Retail Offering Billing Improvements (Zambrero-Cronulla style)

- [x] Add Retail Bundle billing item prompt in CustomerBillingMatch for retail_offering customers (shown when no Xero items exist)
- [x] Add Retail Bundle info banner in CustomerBillingMatch when billing items exist (guides NBN/SIM drag-assign)
- [x] Show retailBundleComponent badge (✦ NBN / ✦ SIM) on DroppableBillingItem cards
- [x] Supplier cost (monthlyCost) already flows through getBillingItemsWithAssignments → totalCost on billing item (no extra code needed)
- [x] Add planCost column to vocus_mobile_services schema and DB
- [x] Add setVocusSimPlanCost function in db.ts and tRPC procedure in vocusRouter
- [x] Add inline SIM cost editor button on DraggableServiceCard for Vocus Mobile services
- [x] Add setCustomerType function in db.ts and tRPC procedure in billing.customers router
- [x] Add Retail Offering toggle badge in CustomerDetail page header
- [x] Add "Retail Offering" filter dropdown to Customers page (customerType filter)
- [x] Add ✦ Retail badge to CustomerRow in CustomerList

# Session Continuation - Parsed Attribute Chips & Zambrero Cronulla Fix
- [x] Fix getBillingItemsWithAssignments to return parsed fields (parsedSpeedTier, parsedContractMonths, parsedHas4gBackup, parsedDataAllowance, parsedHardwareStatus, parsedSipChannels, parsedAvcId, retailBundleComponent)
- [x] Verify ParsedAttributeChips renders correctly on Zambrero Cronulla (C2753) billing item BI00018
- [x] Fix missing S1444 assignment to BI00018 (SmileTel bundle service $84.70/mo)
- [x] Mark VOCUS-MOB-13635300 as unbillable (duplicate of S6950 — same SIM/phone)
- [x] Confirm Zambrero Cronulla billing item shows: Cost $131.71, Margin $41.93 (24%), 3 services

# Retail Offering Billing Assignment Fixes
- [x] Remove S1444-type SmileTel services (billing line items wrongly imported as supplier costs) from all retail offering assignments
- [x] Find Vocus SIM plan cost from Vocus price book
- [x] Set correct Vocus SIM plan costs for all retail offering customers with Vocus Mobile SIMs
- [x] Review and fix all remaining retail offering customer assignments using correct cost sources only

# Missing Billing Items & Nodo Site Grouping
- [x] Investigate Zambrero Sutherland (C2862) - billing item BI00008 was misassigned to C0295 (Marrickville), moved to C2862
- [x] Investigate Zambrero Elizabeth St (C0335) - billing item BI00086 was on shadow record C2761, merged to C0335
- [x] Implement site-based grouping for multi-site parent entities (Nodo Pty Ltd C0171)
- [x] Display Nodo's services grouped by site address with By Site / By Type toggle button

# Revenue & Margin Audit
- [ ] Investigate S1315 Salter Brothers Luxury Collection - SasBoss $49.00 cost vs $0.80 Xero revenue (-6025% margin)
- [ ] Audit all Revenue & Margin rows for similar cost/revenue mismatches
- [ ] Fix identified errors (wrong assignments, wrong cost sources, mismatched billing items)

# Supplier Cost Validation
- [ ] Pull ABB Carbon API costs for all NBN services and compare against Xero-sourced costs
- [ ] Pull Vocus portal costs for all Vocus services and compare against Xero-sourced costs
- [ ] Pull SasBoss portal costs for all SasBoss services and compare against Xero-sourced costs
- [ ] Build cost validation report showing supplier-confirmed vs Xero-sourced costs
- [ ] Remove all Xero-sourced service assignments (1,686 assignments, 197 customers) after validation
- [ ] Mark all Xero-sourced services as unbillable after validation

# Telstra Portal Integration
- [ ] Test Telstra portal access at https://www.myservices.telstra.com.au/home
- [ ] Extract Telstra service list and costs from portal
- [ ] Match Telstra services to existing customer records
- [ ] Validate Telstra-related Xero billing items against portal costs
- [ ] Implement Telstra Sync button in API Integrations page

# Retail Offering Classification Fix & Filter Buttons
- [x] Fix retail offering classification: only customers with 'Site Bundle' Xero billing items should be retail_offering (26 correct, 137 incorrectly tagged reset to standard)
- [x] Add Retail Bundles quick-filter button to Customers screen header (teal toggle, wired to customerTypeFilter)
- [x] Add Retail Bundles quick-filter button to Revenue & Margin screen header (teal toggle, wired to customerType filter on margin.list and margin.grouped queries)
- [x] Add customerType filter parameter to getServicesWithMargin and getServicesGroupedByCustomer db functions
- [x] Add customerType to margin.list and margin.grouped router input schemas

# Telstra Portal Service Import
- [ ] Parse Telstra portal extraction into structured records (9 business accounts, 206 services)
- [ ] Match Telstra N-numbers and phone numbers against existing services in DB
- [ ] Match BigPond email-based services (yiros.albion, littlechawhitford, etc.) to customers
- [ ] Import matched Telstra services with account numbers and service reference IDs
- [ ] Create new service records for unmatched Telstra services
- [ ] Report match results to user

# Retail Offering Classification Expansion
- [ ] Find all billing item description patterns that identify retail offering customers (Site Bundle, Voice and Internet Bundle, etc.)
- [ ] Reclassify 200+ customers as retail_offering based on expanded phrase list
- [ ] Verify all customers from provided list (218 entries) are correctly tagged
- [ ] Update auto-classification logic in Xero import to tag future retail offering customers automatically

# Channel Haus Billing Fix
- [ ] Read and analyse Channel Haus invoice PDFs (6 invoices)
- [ ] Identify all negative margin Channel Haus services in the database
- [ ] Apply GST-exclusive pricing to all ECN/Channel Haus line items (divide by 1.1)
- [ ] Fix Mt Cotton Medical SIP costs: inbound $9/channel, outbound $53/channel ex GST
- [ ] Fix all inbound SIP channel costs to $9/channel ex GST
- [ ] Verify and update all Channel Haus service assignments and margins

# TIAB Customer & Service Matching Propagation
- [x] Propagate TIAB customer matches to tiab_services (all 84 TIAB services now linked)
- [x] Match 69 TIAB services to platform services via MSISDN phone number matching
- [x] Create 15 new service records for Zambrero SIM MSISDNs that existed in TIAB but had no platform service
- [x] Distribute Zambrero SIMs to individual site customers using octane_customer_links MSISDN mapping
- [x] Update services.customerExternalId for Zambrero SIMs via octane_customer_links (64 Zambrero services assigned)
- [x] Handle 3 ceased Zambrero MSISDNs with no octane_customer_links (assigned to AHJ Pty Ltd master account)
- [x] All 84 TIAB services now fully matched (84/84 matched, 0 customer_matched_only)

# Unmatched Xero Billing Items Resolution
- [x] Resolve all 8 previously unmatched Xero billing items (0 unmatched remaining)
- [x] Create service records for Nu-Dev Pty Ltd (TPG Fibre 400, $399/mo), TYS Molendinar (Site Bundle, $200.91/mo), Zambrero Coomera Square ($142.30/mo), Zam Marrickville ($164.27/mo)
- [x] Create new customer records for TYS Molendinar (C9037) and Zambrero Coomera Square (C9038)
- [x] Create service_billing_assignments for all 7 service-matched billing items
- [x] Mark Jack Green UPS hardware item as customer-matched (one-off, no service)
- [x] Total billing items: 1,338 service-matched + 187 DataGate matched + 1 customer-matched = 1,526 total matched

# Customer Service Audit Internet Focus Import
- [x] Analyse CustomerServiceAuditInternetFocus.xlsx (462 unique service records, 443 clients)
- [x] Match audit rows to existing services by AVC ID (121 rows with AVC IDs)
- [x] Match audit rows to existing services by address/site (163 rows with address as connection ID)
- [x] Match audit rows to existing customers by client name (fuzzy)
- [x] Enrich matched services with: AVC ID, contract start date, contract term, speed tier, provider
- [x] Enrich matched customers with: billing gateway (Sasboss/Datagate/OneBill/ECN) - additive only, API data protected
- [ ] Review 40 unmatched audit rows (6 AAPT with AVC IDs, 8 Vocus SIT voice, 26 NBN/mobile with postcode-only provider)
- [x] Report match results and remaining gaps

# Carrier ExDa Sheet Processing (from CustomerServiceAuditInternetFocus.xlsx)
- [x] Analyse AAPT ExDa sheet structure and fields
- [x] Analyse ABB ExDa sheet structure and fields
- [x] Analyse Vocus SIT ExDa sheet structure and fields
- [x] Analyse Telstra ExDa sheet structure and fields
- [x] Match AAPT ExDa records to services (by AVC ID / service ID) - 34/98 matched
- [x] Match ABB ExDa records to services (by address / account number) - 182/182 matched (100%)
- [x] Match Vocus SIT ExDa records to services (by phone number / service ID) - 88/172 matched
- [x] Match Telstra ExDa records to services (by address / account number) - 95/308 matched
- [x] Apply enrichment from all four sheets: 399 service fields enriched, 46 wholesale costs applied, 14 customer billing platforms updated
- [x] Report enrichment results and remaining gaps

# UI Cross-Browser Standardisation
- [x] Audit index.css, DashboardLayout, and Dashboard page for cross-browser layout issues
- [x] Fix sidebar: prevent icon-only collapse at intermediate widths, lock to fixed 220px
- [x] Fix stat cards: consistent min-height (110px), padding, font sizes across all browsers
- [x] Fix typography: use rem-based sizes locked to 16px root, no viewport-relative units
- [ ] Fix progress bars and chart containers: explicit heights, no flex shrink
- [x] Test and verify consistent render matching Perplexity reference view
- [x] Fix root font-size: lock html to 16px, remove maximum-scale=1 from viewport
- [x] Fix Layout.tsx: mobile hamburger + slide-over sidebar drawer on small screens
- [x] Fix Dashboard stat cards: replace xl:grid-cols-7 with auto-fill min-width approach
- [ ] Fix Dashboard: responsive provider/type bar charts on narrow screens
- [ ] Fix inner pages: horizontal-scroll tables on mobile, stack detail panels
- [x] Fix sidebar: hide on mobile by default, overlay when open
- [x] Diagnose Chrome rendering failures: confirmed dev-preview session issue, not a real CSS bug
- [x] Fix OKLCH colour compatibility: confirmed Chrome 130+ supports OKLCH natively, no fix needed
- [x] Fix Tailwind CSS 4 @theme inline block compatibility: no issue found, renders correctly
- [x] Fix progress bars / chart graphics: confirmed rendering correctly in Chrome (session issue only)
- [x] Fix form inputs: confirmed rendering correctly in Chrome (session issue only)

# Mobile Table Horizontal Scroll
- [ ] Add overflow-x-auto + min-width to Customers list table
- [ ] Add overflow-x-auto + min-width to Services list table
- [ ] Add overflow-x-auto + min-width to Review page table
- [ ] Add overflow-x-auto + min-width to Revenue & Margin table
- [ ] Add overflow-x-auto + min-width to Number Management table

# Dashboard Bar Chart Fix
- [x] Fix Services by Type progress bars not rendering - replaced oklch with hex colours
- [x] Fix Services by Provider progress bars not rendering - replaced oklch with hex colours
- [x] Fix provider badge colours not showing - replaced all oklch in ProviderBadge.tsx and Layout.tsx with hex

# SasBoss Pricebook
- [ ] Analyse SasbosssProductpricing.xlsx structure and extract all products/costs
- [x] Create sasboss_pricebook_versions and sasboss_pricebook_items tables in database (with effective_date + imported_at timestamps)
- [x] Populate pricebook from spreadsheet data (547 items: UCaaS 87, Managed Voice 46, Phone Hardware 414)
- [x] Build pricebook UI page (version history, product name, cost, RRP, margin, sheet grouping)
- [x] Run auto-update: cross-check all SasBoss-billed service costs against pricebook
- [x] Pricebook cost auto-update scoped to SasBoss-billed services ONLY (other platforms use own cost sources)

# SasBoss Pricebook — Fuzzy Billing-Name Cost Sync
- [x] Pricebook cost sync driven by billing item name (not provisioning platform) — NBN billed in SasBoss but provisioned in Carbon should still get SasBoss pricebook cost
- [x] Fuzzy matching logic: normalise billing names (strip quantities, punctuation, whitespace) and score against pricebook product names (Jaccard token similarity)
- [x] Resolve duplicate pricebook matches (DID Hosting vs Porting for same product name) — prefer DID Hosting sheet for recurring hosting costs
- [x] Scope sync to: services where billingPlatform LIKE '%SasBoss%' OR linked billing_items originate from SasBoss workbook
- [x] Show fuzzy match confidence score and matched pricebook entry in the preview table
- [x] 23 vitest tests written and passing for normalise(), similarity(), sheetPriority(), and end-to-end scenarios
- [ ] Allow user to accept/reject individual fuzzy matches before applying (future enhancement)

# Bug Fix: Pricebook Cost Sync & Revenue/Margin Display
- [ ] Diagnose why UCXcel Webex Basic cost sync did not apply $0.00 from pricebook (currently showing $13.80)
- [ ] Fix cost sync to correctly handle zero-cost ($0.00) pricebook products (sync was skipping null/zero cost entries)
- [ ] Apply correct $0.00 cost to all UCXcel Webex Basic services in DB
- [ ] Audit all other zero-cost pricebook products and ensure they are also updated correctly
- [ ] Fix Revenue & Margin screen: cost column must show per-service-instance cost (one seat cost), not aggregated or incorrect figure
- [ ] Revenue column should show actual billed revenue for that individual service row (not summed across all seats)
- [ ] Apply fix across all products in the margin view

# Bug Fix: Cost Sync & Margin Display (2026-03-28)
- [x] UCXcel Webex Basic cost corrected from $13.80 → $0.00 (101 services across 11 products fixed)
- [x] Root cause: billingPlatform JSON array ["SasBoss"] not matched by old LIKE filter — fixed in previewCostSync and applyCostSync procedures
- [x] DID Australia services: confirmed did-number productType → DID Hosting rate $0.20 (not porting $17.14)
- [x] Margin formula updated: confirmed zero-cost sources (sasboss_pricebook, access4_diamond_pricebook_excel, retail_only_no_wholesale, etc.) now show 100% margin instead of NULL/Unknown
- [x] CostCell UI: confirmed zero-cost products now display "$0.00" instead of "Unknown ?"
- [x] High margin filter now includes confirmed zero-cost + revenue > 0 services
- [x] costSource field added to getServicesWithMargin select (was missing, needed for UI display)
- [x] 25 vitest tests written and passing for margin formula and CostCell display logic

# SasBoss Product Bundle Pricing Support
- [ ] Identify services in DB provisioned as product bundles (single billing line covering multiple components)
- [ ] Extend pricebook schema: sasboss_bundle_definitions table (bundle name, components, combined wholesale cost, partner RRP)
- [ ] Update cost sync: when a service billing name matches a bundle, use the bundle's combined wholesale cost
- [ ] Build bundle management UI: view/create/edit bundles with component breakdown
- [ ] Show bundle indicator on Revenue & Margin screen for services priced as bundles

# SasBoss Product Bundle Pricing — Completed (2026-03-28)
- [x] Identified MC- custom bundles and Access4 formal bundle types in workbook data
- [x] Created sasboss_bundle_definitions table (bundle_name, bundle_type, billing_name, combined_buy_price, partner_rrp, is_active, notes)
- [x] Created sasboss_bundle_components table (bundle_id, pricebook_item_id, component_name, uses_bundled_price, override_buy_price, quantity)
- [x] Seeded Legal Professional Bundle (Access4 formal) and MC- custom bundles from workbook data
- [x] Updated applyCostSync: Step A checks bundle definitions first (threshold 0.7), Step B falls back to individual pricebook
- [x] Bundle cost uses combined_buy_price if set, otherwise auto-calculates from components (bundled_buy or standalone_buy per component)
- [x] Added previewBundleCostSync procedure to show which services would receive bundle pricing
- [x] Built BundleManagementPanel UI: list bundles, expand for component detail, create new bundle dialog, add/remove components
- [x] Bundle preview table shows on pricebook page when services would receive bundle pricing on next sync
- [x] 17 vitest tests written and passing for bundle matching, component cost calculation, and threshold boundary conditions

# Bug Fix: Revenue & Margin Screen (2026-03-28 round 2)
- [ ] Fix costSource label showing "DataGate" for SasBoss pricebook services — label logic reading wrong field
- [ ] Fix revenue over-attribution: when a single billing item covers multiple services of same type for a customer, show per-service revenue (divide by count) not total

# Revenue & Margin — Bundle Revenue Grouping
- [ ] Detect "shared revenue" groups: services for same customer with identical monthlyRevenue and no billingItemId
- [ ] Add revenueGroupId column to services table to tag services that share a bundled revenue line
- [ ] Update margin tRPC query to return bundle group metadata (group revenue, total group cost, group margin)
- [ ] Revenue & Margin screen: show bundle groups collapsed with total revenue/cost/margin, expandable to show component services with cost-only rows and "Part of bundle" badge
- [ ] Services with directly attributed revenue (billingItemId set) continue to show individual revenue/margin as before

# Revenue Group System (Voice Packs, Retail Bundles, Data Bundles)
- [ ] Create revenue_groups table (id, name, type: voice_pack|retail_bundle|data_bundle, customerExternalId, totalRevenue, totalCost, notes)
- [ ] Migrate existing SasBoss auto-detected groups into revenue_groups table
- [ ] Update margin query: JOIN to revenue_groups, return groupName, groupType, groupRevenue, groupTotalCost, groupMargin per service
- [ ] Flat list UI: each service in a group shows individual cost + group margin badge (e.g. "Voice Pack: 87.3% margin")
- [ ] Group badge colour: green (>50%), amber (20-50%), red (<20%), purple for retail bundle, blue for data bundle
- [ ] Drag-and-drop bundle builder: select services for a customer, name the bundle, set revenue, save as Retail Bundle or Data Bundle
- [ ] tRPC procedures: createRevenueGroup, addServiceToGroup, removeServiceFromGroup, deleteRevenueGroup, updateGroupRevenue
- [ ] Show group summary row in customer-expanded view: group name, total revenue, total cost, group margin

# Revenue Group Enhancements
- [ ] Tag Data Bundle groups from aggregated "Data - Internet" Xero lines
- [ ] Compute groupTotalCost on all revenue groups (sum of component monthlyCost)
- [ ] Add groupTotalCost to revenue_groups table and margin query
- [ ] Build Group Detail drill-down panel (slide-out sheet with all services in group)
- [ ] Loss indicator badge on group badge when totalCost > totalRevenue

# Internet Services Pricebook (2026-03-28)
- [x] Analyse ABBEEandTC4InternetCustomerPricing spreadsheet (TC4 NBN, EE, Fixed Wireless sheets)
- [x] Design internet_pricebook_versions and internet_pricebook_items DB tables
- [x] Generate and apply Drizzle migration for internet pricebook tables
- [x] Build internet-pricebook-seed.ts: parse TC4 and EE XLSX sheets, normalise speed tiers and contract terms, compute GP/margin/low-margin flags, bulk insert via sql template
- [x] Build internetPricebook tRPC router: listVersions, listItems (filtered/paginated), importFromSpreadsheet, validateCarbonCosts, updateSellPrice, getLowMarginSummary, deleteVersion, getFilterOptions
- [x] Carbon API integration: live plan cost fetch, median aggregation per plan name, variance computation, margin recalculation, low-margin re-flagging
- [x] Build InternetPricebook.tsx UI page: version selector, summary cards, filter bar, pricebook table with margin badges, Carbon variance indicators, inline sell price override dialog, import dialog
- [x] Register /internet-pricebook route in App.tsx
- [x] Add "Internet Pricebook" nav item to Suppliers section in Layout.tsx
- [x] 25 vitest tests written and passing for margin calculations, Carbon variance, spreadsheet parsing helpers, median aggregation, and sell price override scenarios

# Retail Internet Bundles Import & Workflow (2026-03-28)
- [x] Design DB schema: retail_bundles, retail_bundle_cost_inputs tables
- [x] Generate and apply Drizzle migration
- [x] Write import script: fuzzy-match 172 rows to existing customers, remove Zam25M2M dupes, apply default billing inputs
- [x] Build tRPC router: listBundles, getBundleDetail, updateCostInput, assignCostSlot, getBundleSummary
- [x] Build Retail Bundles UI page: customer list with bundle status, detail panel with drag-drop cost slots
- [x] Add "Retail Bundles" nav item to Layout.tsx
- [x] Write vitest tests for billing input logic and cost calculations (29 tests passing)
- [x] Save checkpoint and deliver

# Retail Bundles — Live Cost Auto-Population & Margin Report (2026-03-28)
- [x] Audit Carbon/TIAB/Vocus cost fields available in DB services table
- [x] Build tRPC procedure: resolveServiceCost — fetches live wholesale cost for a service when assigned to a slot
- [x] Carbon API: pull monthly_cost_cents for NBN services matched by AVC/service ID
- [x] TIAB API: pull plan cost for SIM services matched by phone number/SIM serial
- [x] Vocus feed: pull monthly cost for Vocus SIM/NBN services
- [x] Default fallback: $15/month for 4G SIM if no live cost found
- [x] Update assignServiceSlot procedure to auto-populate live cost on assignment
- [x] Update Retail Bundles UI: show live cost badge, source indicator (Carbon/TIAB/Vocus/Default), real-time margin
- [x] Show real-time margin recalculation when live costs are loaded
- [x] Build tRPC exportMarginReport procedure: all 163 bundles with retail price, costs, GP, margin %, grouped by bundle type
- [x] Add CSV export button to Retail Bundles page (client-side CSV generation)
- [x] Flag low-margin rows in export (< 20% warning, < 10% critical)
- [x] Write vitest tests: 39 tests for live cost resolution, margin classification, default input rules, CSV formatting
- [x] Save checkpoint and deliver

# Retail Bundle Costs on Reconciliation Board (2026-03-28)
- [x] Audit Reconciliation Board UI and tRPC data flow
- [x] Add getBundleCostInputsForCustomer procedure to retailBundles router
- [x] Update Reconciliation Board UI: show "Bundle Fixed Costs" section for retail_offering customers
- [x] Bundle Costs section shows: Hardware, SIP Channel, Support (and NBN/SIM if linked) with source badges
- [x] Update totalSupplierCost and margin calculation on the board to include bundle fixed costs
- [x] 22 vitest tests passing for cost aggregation, margin, source badge logic, display formatting
- [x] Save checkpoint and deliver

# Customer List Filter Persistence (2026-03-28)
- [x] Move customer list filter state (customerType, search, provider, status) into URL search params
- [x] Update customer row links to carry current filter params as ?from= query string
- [x] Update service row links similarly (fromFilter threaded through ServiceRow)
- [x] Update all Back buttons on CustomerDetail and ServiceDetail to restore filter params
- [x] Browser Back button works natively (URL-driven state)
- [x] Save checkpoint and deliver

# Bug Fixes (2026-03-28)
- [x] FIX: Bundle Fixed Costs (Hardware, Support, SIP) not appearing on Reconciliation Board — fixed Drizzle [rows,fields] tuple unwrapping in getBundleCostInputsForCustomer
- [x] FIX: Retail Bundles page data not loading — fixed GROUP BY rb.id with rb.* (ONLY_FULL_GROUP_BY) and Drizzle unwrap across all procedures
- [x] FIX: Retail Bundles margin report now working — summary bar, table, CSV export all functional

# Bundle Fixed Costs in Billing Item Margin (2026-03-29)
- [x] Audit how billing item Cost and margin are calculated on the Reconciliation Board
- [x] Inject bundle fixed costs (Hardware + SIP + Support) into the billing item cost total
- [x] Margin on billing item card must reflect: supplier services + bundle fixed costs vs revenue
- [x] Debug why bundleFixedCostTotal was 0 — root cause: bundle linked to wrong customer record (trust entity vs trading name)
- [x] Re-link 8 bundles to correct customer records (high-confidence: Cronulla, Mornington, Mt Druitt, North Penrith, Bullsbrook, Oakleigh, Darwin, Retail Ops)
- [x] Add name-based fallback lookup in getBillingItemsWithAssignments for remaining unlinked cases
- [x] Verified: C2753 Zambrero Cronulla now shows Cost $92.01 and margin 47% (was $62.01, 64%)
- [x] Test in browser and save checkpoint

# Re-link Bundle UI (2026-03-29)
- [x] Add relinkBundle tRPC procedure: accepts bundleId + customerExternalId, updates retail_bundles.customerExternalId
- [x] Add searchCustomersForBundle tRPC procedure: returns retail_offering customers with name/id for dropdown
- [x] Add Re-link button to each bundle row on Retail Bundles page (shows when bundle has no billing items on linked customer)
- [x] Searchable customer dropdown with live filter (combobox pattern)
- [x] Show current linked customer name and a warning badge when bundle is unlinked or linked to wrong customer
- [x] On confirm, update bundle and invalidate query cache
- [ ] Write vitest tests for relinkBundle procedure
- [x] Save checkpoint

# SmileTel Supplier Service $0 Cost on Reconciliation Board (2026-03-29)
- [ ] Identify the SmileTel service shown on Zambrero Cronulla board (SIP channel / voice)
- [ ] Determine why monthlyCost = $0 — check retail_bundle_cost_inputs sip_channel slot vs service record
- [ ] Fix cost resolution: sip_channel cost should come from bundle fixed cost inputs ($1.50) not service monthlyCost
- [ ] Verify total cost and margin update correctly after fix

# Internet Pricebook Import Fix + Carbon API Validation (2026-03-29)
- [x] Parse ABBEEandTC4 spreadsheet to identify all rows including Premium Support tier
- [x] Fix import parser to capture all support tiers (Standard, Premium, etc.)
- [x] Re-import spreadsheet with all rows (154 rows: 120 TC4 + 34 EE)
- [x] Add Carbon API auto-validation on import (sample wholesale cost per plan)
- [x] Add "Validate All" button to run Carbon API check across all pricebook items (already existed)

# Bundle Fixed Costs Visible on Reconciliation Board (2026-03-29)
- [x] Show bundle fixed costs (Hardware, SIP, Support) as expandable rows on billing item card
- [x] Match the same expand/collapse UX as ABB/Vocus supplier service rows
- [x] Show cost source badge (bundle) and amount for each fixed cost component

# Pricebook Filtered Stat Cards (2026-03-29)
- [x] Update Total Items, Low Margin Items, Avg Margin, Worst Margin stat cards to derive from filteredItems array
- [x] Stat cards update live when any filter (Service Type, Support Tier, Contract Term, Zone, Search, Low margin only) changes

# Bundle Cost Rows Not Visible on Recon Board (2026-03-29)
- [x] Debug why Hardware/SIP/Support rows don't appear on billing item card despite bundleFixedCostInputs being in the data
- [x] Verify bundleFixedCostInputs is returned by the tRPC query for the Cronulla customer
- [x] Fix rendering so bundle cost rows always show below supplier service rows

# Bundle Fixed Costs Missing from ReconciliationBoard Component (2026-03-29)
- [x] Add bundleFixedCostInputs to BillingItemWithAssignments type in ReconciliationBoard.tsx
- [x] Render bundle cost rows (Hardware, SIP, Support) in BillingItemDropTarget component
- [x] Show cost breakdown (svcs + bundle) in the margin row
- [x] Verify on dev server and save checkpoint

# Editable Supplier Field on Service Edit Form (2026-03-29)
- [x] Add supplier dropdown to the Edit Service form (currently provider is shown but supplier is read-only)
- [x] Ensure supplier field is saved to the database on form submission (added to routers.ts + db.ts)
- [x] Show current supplier value in Service Attributes panel (already displayed via DetailRow)
- [x] Populate supplier dropdown with 15 known suppliers + custom option
- [x] Test supplier edit on dev server and verify persistence

# Unknown Location Services Missing from Reconciliation Board (2026-03-29)
- [ ] Investigate why services with unknown locations don't appear on the LH side of the Reconciliation Board
- [ ] Fix the data query/filtering to include ALL customer-matched services regardless of location status
- [ ] Ensure unknown-location services appear as draggable supplier services on the Reconciliation Board
- [ ] Test with Body Corporate for Osprey Mooloolaba CTS4773 (has 3 unknown-location services)
- [ ] Save checkpoint and publish

# Location Auto-Inheritance for TIAB/Vocus SIMs (2026-03-30)
- [x] After auto-match assigns a TIAB/Vocus SIM to a customer, copy the ABB internet service's locationAddress to the SIM if the SIM has no address
- [x] Add a tRPC mutation (services.inheritLocation) to trigger this manually per service
- [x] Add "Inherit Location" quick action button (MapPinOff icon) on Unknown Location service rows in Customer Detail
- [x] Add a discovery note when address is auto-inherited indicating the source service
- [x] Test on Gorman & Co TIAB 4G Data Back up service — verified working

# Unknown Location Services Always Visible on Recon Board (2026-03-30)
- [x] Confirm all unassigned services (including unknown-location) appear on LH side of Recon Board
- [x] Add amber 'No location' badge on service cards in Recon Board that have no location address
- [x] Add "No Location" indicator so user knows to fix it but can still drag-drop

# Bulk Inherit Location + Auto-Inherit + Billing Platform on Recon Board (2026-03-30)
- [x] Add "Inherit All Locations" button on Customer Detail Unknown Location section header
- [x] Backend: bulkInheritLocations mutation that calls inheritLocationFromColocated for all unknown-location services at a customer
- [x] Auto-inherit location when a service is auto-matched to a customer (in assignServiceToCustomer)
- [x] Add billing platform quick-assign dropdown on Reconciliation Board service cards (No billing platform warning)
- [x] Backend: services.setBillingPlatform mutation (reused existing billing.services.update procedure with billingPlatform field)
- [x] Test all three on Gorman & Co and save checkpoint

# Provider Field Dropdown in Edit Service Form (2026-03-30)
- [x] Replace Provider free-text input with predefined dropdown (same list as Supplier: AAPT, ABB, Access4, ChannelHaus, CommsCode, DataGate, Exetel, Legion, SasBoss, SmileTel, Tech-e, Telstra, TIAB, TPG, Vocus + Custom)
- [x] Ensure Provider and Supplier dropdowns are independent (each can be set separately)
- [x] Verify changes save correctly and appear in Service Attributes panel
- [ ] Save checkpoint

# Shared Supplier/Provider Constant — Single Source of Truth (2026-03-30)
- [x] Audit all files with hardcoded supplier/provider lists (ServiceEditPanel, ReconciliationBoard, routers.ts, ProviderBadge, filters, etc.)
- [x] Create shared/suppliers.ts exporting KNOWN_SUPPLIERS array (and KNOWN_PROVIDERS alias)
- [x] Replace all hardcoded lists in client components with import from shared/suppliers.ts (ServiceEditPanel, CustomerList, RevenueMargin, ProviderBadge)
- [x] PROVIDER_COLORS now driven from SUPPLIER_COLORS in shared/suppliers.ts
- [x] Added missing Access4, CommsCode, DataGate, TPG entries to ProviderBadge providerConfig
- [x] Verify TypeScript compiles cleanly with 0 errors
- [ ] Save checkpoint

# Improved Location Inheritance — Any Address + Multi-Site Picker (2026-03-30)
- [x] Broaden inheritLocationFromColocated to use ANY service with a locationAddress (not just ABB), prioritising Internet > Mobile > Voice > Other
- [x] When exactly one unique address is found: auto-inherit silently (current behaviour)
- [x] When multiple distinct addresses are found: return candidates list instead of failing
- [x] inheritLocation tRPC mutation now accepts optional chosenAddress for site-picker confirmation
- [x] Add site-picker dialog on Customer Detail "Inherit" button when multiple candidates exist
- [x] bulkInheritLocationsForCustomer uses the same broadened logic (calls inheritLocationFromColocated)
- [x] TypeScript: 0 errors
- [ ] Save checkpoint

# Match Provenance — "Why was this matched?" (2026-03-30)
- [x] Add serviceMatchEvents table to drizzle/schema.ts (matchMethod, matchSource, matchedBy, matchedAt, matchCriteria JSON, confidence, customerExternalId, serviceExternalId, flaggedForReview, flaggedBy, flaggedAt, flagReason)
- [x] Generate migration SQL with pnpm drizzle-kit generate and apply via webdev_execute_sql
- [x] Add writeMatchProvenance() helper in server/db.ts (non-fatal, logs on failure)
- [x] Write provenance at: manual assignServiceToCustomer, manual reassignService, commitAliasAutoMatch (Carbon alias), commitAddressAutoMatch, importSasBossDispatch (workbook)
- [x] Add getMatchProvenance(), flagMatchEvent(), clearMatchEventFlag() helpers in server/db.ts
- [x] Add billing.services.matchProvenance.get / .flag / .clearFlag tRPC procedures in routers.ts
- [x] Build WhyMatchedPopover component (triggered by info button on service row in CustomerDetail)
- [x] Show: method badge, source, matched by, matched at, criteria used, confidence pill, flag/unflag action
- [ ] Save checkpoint

# WhyMatchedPopover — Fallback Provenance + Service Detail (2026-03-30)
- [x] Add synthesised provenance fallback in getMatchProvenance: when no formal events exist, build a record from service.dataSource, service.discoveryNotes, service.carbonId, service.customerExternalId
- [x] Synthesised events show inferred method/source/confidence, criteria (AVC ID, phone, address, workbook), discovery notes snippet, and a disclaimer
- [x] Synthesised events (id=-1) are not flaggable (flag button hidden)
- [x] Add WhyMatchedPopover to Service Detail page next to Edit/Reassign button
- [x] TypeScript: 0 errors
- [ ] Save checkpoint

# WhyMatchedPopover — Fix Click Not Opening (2026-03-30)
- [x] Root cause: ⓘ button inside <Link asChild> wrapper — click navigated away before popover could open
- [x] Fix: added e.preventDefault() + e.stopPropagation() on trigger button and PopoverContent
- [ ] Save checkpoint

# Negative Margin Manual Corrections (2026-03-30)
- [x] SG3D608: reassigned to Logan Central Family Clinic (C0151)
- [x] SSHKYHNC: monthlyCost → $5.00, monthlyRevenue → $10.50
- [x] SSCLR2F4: monthlyCost → $9.00, monthlyRevenue → $15.00
- [x] S1220: monthlyRevenue → $5.00 (cost $0.42 confirmed)
- [x] S1301: monthlyRevenue → $5.00 (cost $1.89 confirmed)
- [x] IPTEL-AB035443: monthlyRevenue → $75.00, monthlyCost → $0.00, planName → "Managed Voice Support (1-10 users)"
- [x] S0467: monthlyCost → $109.00
- [x] S1315: monthlyCost → $0.00 ($49 was Access4 pricebook placeholder, not actual charge)
- [x] Review flags added on S0256, SYY3IJW, SSZ2TRXE, S5ZNGFT, S0944, SSS03Z6Q, SB3PFMC, SAP1G3A, STBVXCV
- [ ] Save checkpoint

# ECN Price Book — PENDING USER ANSWERS (2026-03-30)
## ⚠ DO NOT PROCEED until user answers the following questions (next session)

### Questions asked, awaiting answers:
1. **ECN vs ChannelHaus relationship** — Is ECN the underlying wholesale provider for ChannelHaus services, or are they entirely separate suppliers? (Relevant to whether ECN $5/channel cost applies to ChannelHaus negative margin investigations: SYY3IJW, SSZ2TRXE, S5ZNGFT, SB3PFMC.)
2. **ChannelHaus SIP cost validation** — Should ECN "Business SIP Channel with Calls" ($31.82/ch) be used to validate/correct ChannelHaus service costs, or are ChannelHaus and ECN priced independently?
3. **Internet Price Book sell price column** — For the expanded multi-provider internet price book (ECN + ABB + others), should it show wholesale cost only, or also include a SmileTel sell price column?
4. **ECN cost correction scope** — For existing ECN-provider services where monthlyCost doesn't match the price book: auto-correct them, or flag for review only?

### ECN Price Book summary (extracted from uploaded CSVs):
Voice plans: Hosted PBX User ($5/ext), PBX User inc Calls ($20/ext), Business SIP Channel ($5/ch), SIP Channel with Calls ($31.82/ch), Inbound 1300 ($10/mo)
Data plans: nbn BusinessMAX 250/100 ($108.18), 500/200 ($126.36), 1000/400 ($162.73); Business Broadband nbn 50/20 ($72.73), 100/40 ($86.36), Wireless 200-250 ($119), 400 ($81.82); Mobile Broadband 1GB–300GB ($7–$229); nbn Home 25/5–1000/100 ($72.73–$108.18)

### Planned actions once answers received:
- [ ] Import ECN Voice price book into DB (supplier_price_books or dedicated ecnPriceBook table)
- [ ] Import ECN Data price book into DB
- [ ] Build ECN Price Book page under Suppliers → ECN (Voice + Data tabs, searchable/filterable)
- [ ] Expand Internet Price Book to show ECN + ABB + other providers side by side for cost comparison
- [ ] Audit existing ECN-provider services against price book and correct/flag cost mismatches
- [ ] Apply ECN voice cost corrections to ChannelHaus services if ECN is confirmed as underlying provider

# SasBoss Live API — Activation (2026-03-31)
## Confirmed by Joel (Access4 TAC):
## - IPs whitelisted: 103.250.128.21 (Dev/Sandbox) and 34.96.50.131 (Production)
## - API credentials = SasBoss portal login (SasBoss_User / SasBoss_Password)
## - Token endpoint: GET https://api.sasboss.com.au/token/?apiUser=xxxx&apiPass=xxxxxx
## - Reseller ID: 2815
## - ICS (iCall Suite) API: Basic Auth, Base URL https://ics.webuc.com.au/ — requires Tollring account (not yet set up)
- [x] Set SasBoss_API_Host = api.sasboss.com.au in secrets
- [x] Set SasBoss_Reseller_ID = 2815 in secrets
- [x] Update sasboss-api.ts: add token-based auth (GET /token/ endpoint) as primary, keep Basic Auth as fallback
- [ ] Update sasboss-api.ts: verify correct API base URL structure per Joel's confirmation
- [x] Add sasboss.testConnection tRPC procedure: calls token endpoint, returns token + roleType
- [ ] Add SasBoss API status indicator to Suppliers page (green/red live connection status)
- [x] Wire syncAllSasBossData into a tRPC procedure (sasboss.syncAll) with result summary
- [ ] Test live API: enterprises, service accounts, DID numbers, products, invoices
- [ ] Document ICS API requirements (Tollring account needed — escalate to PGM/Solutions Consultant)
- [ ] Save checkpoint after API activation

# SasBoss Live API — Activation (2026-03-31)
## Confirmed by Joel (Access4 TAC):
## - IPs whitelisted: 103.250.128.21 (Dev/Sandbox) and 34.96.50.131 (Production)
## - API credentials = SasBoss portal login (SasBoss_User / SasBoss_Password)
## - Token endpoint: GET https://api.sasboss.com.au/token/?apiUser=xxxx&apiPass=xxxxxx
## - Reseller ID: 2815
## - ICS (iCall Suite) API: Basic Auth, Base URL https://ics.webuc.com.au/ — requires Tollring account (not yet set up)
- [x] Set SasBoss_API_Host = api.sasboss.com.au in secrets
- [x] Set SasBoss_Reseller_ID = 2815 in secrets
- [x] Update sasboss-api.ts: add token-based auth (GET /token/ endpoint) as primary, keep Basic Auth as fallback
- [x] Update sasboss-api.ts: correct URL to port 10000 (provisioning) and 10001 (billing) per official SASBOSS API Spec v22102025
- [x] Add sasboss.testConnection tRPC procedure: calls token endpoint, returns token + roleType
- [ ] Add SasBoss API status indicator to Suppliers page (green/red live connection status)
- [x] Wire syncAllSasBossData into a tRPC procedure (sasboss.syncAll) with result summary
- [ ] Test live API: enterprises, service accounts, DID numbers, products, invoices
- [ ] Document ICS API requirements (Tollring account needed - escalate to PGM/Solutions Consultant)
- [ ] Save checkpoint after API activation

## Unified SasBoss Pricebook
- [ ] Schema migration: add api_buy_price, api_rrp, api_nfr_price, api_buy_bundled, api_rrp_bundled, api_buy_unlimited, api_rrp_unlimited, api_product_id, api_last_synced columns to sasboss_pricebook_items
- [ ] Extend SasBossProduct interface and fetchProducts() to capture all bundled/unlimited pricing tiers
- [ ] Add sasbossApi.syncPrices tRPC procedure (upserts api_* columns by matching productName)
- [ ] Add sasbossApi.getUnifiedPricebook tRPC procedure (joins pricebook items with services aggregates)
- [ ] Build unified pricebook UI tab on SasBoss Suppliers panel with drift alerts
- [ ] Add "Sync Prices from API" button to unified pricebook tab
- [ ] Write vitest tests for syncPrices procedure
- [x] Add column source indicators (info icon tooltips) to unified pricebook table headers showing data origin (API, Excel Upload, Invoice, Calculated)
- [x] Fix: SasBoss/Access4 supplier card missing from Suppliers page (not appearing in supplier list)
- [x] Fix: Restore Unmatched services tab on the Dashboard
- [x] Fix: SasBoss API sync failing on production — improve error reporting to surface root cause (token vs product fetch failure)

# Monthly Billing Cycle Feature
- [x] Design DB schema: billing_periods, supplier_monthly_snapshots, recon_checklist_items, discrepancy_alerts tables
- [x] Send April 2026 reconciliation checklist email to angusbs@smiletel.com.au
- [x] Build billing period management backend (create/activate period, snapshot supplier costs)
- [x] Build auto-match re-application on new invoice upload
- [x] Build discrepancy detection engine (>10% cost change flagging with reason)
- [x] Build email digest for discrepancy alerts (SendGrid)
- [x] Build Monthly Billing Cycle UI page with period selector
- [x] Build per-supplier drag-and-drop upload zones with checklist ticks
- [x] Build in-platform reconciliation checklist (auto-resets 1st of month)
- [x] Build supplier cost-vs-invoiced trend graph (per supplier, monthly)
- [x] Build total revenue trend graph (with per-supplier breakdown)
- [x] Add up/down arrows on supplier cost cards vs previous month
- [x] Schedule monthly checklist reset cron job
- [x] Write vitest tests for new billing cycle features
- [x] Save checkpoint and deliver

# Chapman Telstra Arrears Payment Plan
- [x] Look up S-CHAP-TELSTRA-ARREARS service record and Chapman customer ID
- [x] Insert payment plan PP-CHAPMAN-TELSTRA-2026 with 6 monthly instalments (Apr–Sep 2026, $128.33 ex GST each)
- [x] Save checkpoint

# Starlink Enterprise API Integration
- [x] Add starlink_accounts, starlink_service_lines, starlink_terminals, starlink_usage tables to schema
- [x] Run Drizzle migration for Starlink tables
- [x] Register Starlink in supplier_registry table
- [x] Build Starlink API client (OIDC token, accounts, service lines, terminals, data usage)
- [x] Build fuzzy customer matching engine for Starlink service lines (name, address, ABN)
- [x] Build tRPC starlink router with sync, match, and usage procedures
- [x] Update all provider/supplier dropdowns to include Starlink
- [x] Build Starlink supplier UI page (accounts, terminals, usage, match status, manual match)
- [x] Add Starlink to sidebar nav under SUPPLIERS
- [x] Write vitest tests for Starlink API client and fuzzy matcher
- [x] Save checkpoint

# Starlink Account Seeding (6 Portal Accounts)
- [x] Seed 6 Starlink portal accounts into starlink_accounts table with login/notes
- [x] Seed all KIT/service line records into starlink_service_lines with customer match hints
- [x] Create secrets placeholders for all 6 account API tokens
- [ ] Save checkpoint

# Starlink Account Corrections
- [x] Update accounts@smileit.com.au account number to ACC-2165425-22536-8 and correct subscription names
- [ ] Save checkpoint

# Starlink Invoice Import & Drag-and-Drop Upload
- [x] Confirm all portal account logins and ACC numbers (pjdrummond, support@, smileitstarlink@, orders@, productadmin@)
- [x] Parse 13 Starlink PDF invoices (Jan-Mar 2026) across all accounts
- [x] Add loginEmail and portalOwner columns to starlink_accounts table
- [x] Create starlink_invoices and starlink_invoice_lines tables with migration SQL
- [x] Import all 13 invoices and 35 invoice lines into database
- [x] Add starlinkInvoices and starlinkInvoiceLines to drizzle/schema.ts
- [x] Add invoice tRPC procedures (list, lines, upsert, delete) to starlink router
- [x] Build server-side PDF parser (parseStarlinkInvoice.ts) for Starlink AU invoice format
- [x] Add /api/starlink/parse-invoice REST endpoint with multer file upload
- [x] Add Invoices tab to Starlink page with drag-and-drop upload zone
- [x] Build invoice table with expandable rows showing service line charges
- [x] Add account filter and total spend summary to Invoices tab
- [x] Write vitest tests for invoice parser (19 tests, all passing)
- [x] Save checkpoint

# Starlink Account Cleanup (6 Accounts)
- [x] Delete 4 duplicate PORTAL-xxx placeholder rows from starlink_accounts
- [x] Confirm all 6 accounts have correct ACC numbers and loginEmail (5 rows: smileitstarlink@ and support@ consolidated as same ACC)
- [x] Save checkpoint
# SasBoss / Access4 API — Support Response (Akhil, TAC)
- [x] Update SasBoss pricebook sync to capture all 6 pricing tiers: chargeBundledRecurringFee, rrpBundledRecurringFee, chargeUnlimitedRecurringFee, rrpUnlimitedRecurringFee (columns already in DB and sync code; data populates on next successful API sync)
- [x] Display Bundled and Unlimited pricing tiers in the unified pricebook view alongside PAYG (purple = Bundled, blue = Unlimited; API drift shown inline with PAYG)G
- [ ] PENDING SASBOSS: Confirm per-enterprise pricing override endpoint exists (chargeOverriden flag noted, need per-customer custom rate endpoint)
- [ ] PENDING SASBOSS: Confirm historical transacted charges endpoint (equivalent to exportEnterprisePendingCharges but for invoiced/closed periods, filterable by date range)
- [ ] PENDING SASBOSS: Confirm webhook/event callback support for: enterprise provisioned/deprovisioned, service account activated/suspended, product price change, invoice generated/payment received (Akhil raising with Dev team)
- [ ] PENDING SASBOSS: Tollring/ICS API account setup — confirm monthly cost, per-enterprise call analytics capability, and whether it supplements or overlaps with SASBOSS CDR export

# Add Starlink as Provider
- [x] Add Starlink to supplier registry
- [x] Create 15 service records in main services table from starlink_service_lines ($4,137/month total cost inc GST)
- [x] Link Starlink services to existing customers where possible
- [x] Save checkpoint

# Starlink Auto-Match to Customers & Billing
- [x] Pull all 15 Starlink service lines with GPS coords and nicknames
- [x] Fuzzy-match service nicknames against customers table and billing_items
- [x] Applied 9/15 matches: Cubico, Gainsdale/Grunskies, Jellinbah x3, Mammoth, Middlemount Coal, Salter Brothers Tamarind, Spicers Hiddenvale
- [x] 6 services flagged for manual match: Black Pearl (1)/(2), UQ Wildlife 50GB/New, Waratah Village 1/2
- [x] Satellite Broadband already set as serviceTypeDetail on all 15 services (free-text field, no filter dropdown needed)
- [ ] Save checkpoint

# Bug Fix: Starlink Shows as Unknown in Dashboard
- [x] Fix provider field mapping so Starlink appears as 'Starlink' not 'Unknown' in Services by Provider chart (added to KNOWN_SUPPLIERS, SUPPLIER_COLORS, providerConfig, ProviderDot)
- [ ] Save checkpoint

# SasBoss Live API Integration Test
- [ ] Test pricebook sync — call GET /billing/reseller/2815/product and check all 6 pricing tiers
- [ ] Test pending charges export — call exportEnterprisePendingCharges and match against services
- [ ] Test enterprise list sync — cross-reference API enterprises against customer database
- [ ] Report findings and gaps
