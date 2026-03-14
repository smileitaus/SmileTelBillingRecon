# Screenshot Analysis Findings (Mar 14 2026)

## Dashboard Screenshot (12:18:28pm)
The dashboard shows THREE separate "Unknown" provider rows:
1. Unknown: 782 services, $-2,617.78 (Xero credits/adjustments)
2. Unknown: 119 services, $0.00 (TIAB services with no provider badge)
3. Unknown: 65 services, $-18.18 (SmileTel services with no provider badge)

**Root cause**: TIAB and SmileTel providers don't have ProviderBadge styling, so they render as plain "Unknown" text. But in the DB they ARE stored as "TIAB" and "SmileTel" - the issue is the ProviderBadge component doesn't have entries for TIAB/SmileTel so they render without a badge, but they still show the provider name text.

Wait - looking more carefully: The three rows show:
- Row 1: "Unknown" badge (gray) - 782 services, $-2,617.78
- Row 2: "Unknown" text (no badge) - 119 services, $0.00 → This is TIAB
- Row 3: "Unknown" text (no badge) - 65 services, $-18.18 → This is SmileTel

**Fix needed**: The ProviderBadge component needs entries for TIAB and SmileTel so they render with proper badges instead of falling back to "Unknown" display.

Actually re-reading: The DB has "TIAB" and "SmileTel" as provider values. The getSummary() function uses `p.provider || 'Unknown'` which would keep them as TIAB/SmileTel. But the ProviderBadge component might not have color entries for them, causing them to render as plain text that LOOKS like "Unknown".

**Actual fix**: Add TIAB and SmileTel to ProviderBadge PROVIDER_COLORS and badge rendering.

## Service Detail Screenshot (12:17:52pm)
- HKS Financial Planning NBN 100/40 service
- Monthly Cost showing $47.01 (OLD - from uploaded invoice)
- Carbon Cost showing $84.70 (CORRECT - from Carbon API)
- **Fix needed**: monthlyCost should be updated to $84.70 (Carbon API is source of truth)

## Service Detail Screenshot (12:14:53pm)  
- Michael McNamara NBN 100/40 service
- Carbon Cost: $84.70/mo (correct)
- Customer card showing $80.00/mo (OLD - should be $84.70 after Carbon sync)

## Revenue & Margin Screenshot (12:15:21pm)
- Michael McNamara: $80.00 cost, $95.45 revenue, 16.2% margin
- After Carbon sync: should show $84.70 cost, 11.3% margin
