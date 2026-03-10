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
- [ ] Create new customer records for unmatched sites if needed (181 unmatched sites)
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
