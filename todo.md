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
