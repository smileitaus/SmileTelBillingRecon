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
