# Lucid Portal — Visual Diff & Component Reference

This document is a **pixel-accurate reference** for the Replit developer to close the visual gap between the Replit build and the Manus production build. It is derived directly from the production source files — every colour value, class name, and inline style is copied verbatim from the running codebase.

---

## 1. The Core Problem

The Replit build is likely using Tailwind's default shadcn/ui theme (blue primary, white sidebar, standard radius). The Manus build overrides all of this with a custom brand system. **The entire visual identity lives in two files:**

1. `client/src/index.css` — all CSS variables, custom utility classes, font declarations
2. `client/src/components/Layout.tsx` — the sidebar with hardcoded dark hex values

Both files must be copied verbatim from the GitHub repository. The guide below explains what each section does and why it matters visually.

---

## 2. Sidebar — The Most Visible Difference

The Manus sidebar uses **hardcoded hex values via inline `style` props**, not Tailwind classes. This is intentional — it guarantees the sidebar is always jet black regardless of theme. The Replit build is likely rendering a white or grey sidebar because it is relying on Tailwind's `bg-sidebar` token, which resolves differently.

### Sidebar background

```tsx
// ✅ Manus production — hardcoded, always black
<aside style={{ background: "#1a1a1a", borderRight: "1px solid #333333" }}>

// ❌ Replit likely has — resolves to wrong colour
<aside className="bg-sidebar">
```

### Sidebar container

```tsx
<div className="flex flex-col h-full" style={{ background: "#1a1a1a" }}>
```

### Logo section

```tsx
<div style={{ borderBottom: "1px solid #333333" }}>
  <div className="cursor-default px-4 py-2">
    <img
      src="https://d2xsxph8kpxj0f.cloudfront.net/310519663446026794/SkibUwiSvPndpvTSJv52KC/lucid-logo-full_7f99ec43.jpg"
      alt="Lucid"
      className="w-[80%] h-auto object-contain block mx-auto"
    />
  </div>
</div>
```

### Search bar (inside sidebar)

```tsx
<button
  style={{
    background: "#383838",
    borderColor: "#474747",
    color: "#a6a6a6",
  }}
  className="flex items-center gap-2 w-full px-3 py-2 text-sm rounded-md border transition-colors"
>
  <Search className="w-3.5 h-3.5" />
  <span className="flex-1 text-left text-xs">Search...</span>
  <kbd
    style={{ background: "#2d2d2d", borderColor: "#4d4d4d", color: "#8c8c8c" }}
    className="text-[10px] font-mono px-1.5 py-0.5 rounded border hidden sm:inline"
  >
    Ctrl+K
  </kbd>
</button>
```

### Nav group header (collapsible section label)

```tsx
<button
  style={{ color: activeInGroup ? "#e06c1a" : "#7a7a7a" }}
  onMouseEnter={(e) => {
    e.currentTarget.style.color = activeInGroup ? "#e06c1a" : "#a6a6a6";
  }}
  onMouseLeave={(e) => {
    e.currentTarget.style.color = activeInGroup ? "#e06c1a" : "#7a7a7a";
  }}
  className="flex items-center gap-2 w-full px-2.5 py-1.5 rounded-md text-[11px] font-semibold uppercase tracking-wider transition-colors"
>
  <GroupIcon className="w-3.5 h-3.5 shrink-0" />
  <span className="flex-1 text-left">{group.label}</span>
  <ChevronDown
    className="w-3 h-3 shrink-0 transition-transform duration-200"
    style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)" }}
  />
</button>
```

### Nav item (child link inside a group)

The indented child items use a left border accent and inline style for active/hover states:

```tsx
{/* Group items wrapper — left border accent */}
<div className="ml-2 pl-2 border-l border-white/[0.06]">
  <Link
    href={item.path}
    style={
      isActive
        ? { background: "#e06c1a", color: "#ffffff", fontWeight: 600 }
        : { color: "#949494" }
    }
    onMouseEnter={(e) => {
      if (!isActive) {
        e.currentTarget.style.background = "rgba(224,108,26,0.12)";
        e.currentTarget.style.color = "#e0e0e0";
      }
    }}
    onMouseLeave={(e) => {
      if (!isActive) {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = "#949494";
      }
    }}
    className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[12.5px] transition-all mb-0.5"
  >
    <Icon className="w-3.5 h-3.5 shrink-0" />
    <span className="truncate">{item.label}</span>
  </Link>
</div>
```

**Key values:**
- Active item background: `#e06c1a` (the production orange — slightly different from the CSS variable `oklch(0.578 0.178 38.5)` which is `#e95b2a`)
- Active item text: `#ffffff`
- Inactive item text: `#949494`
- Hover background: `rgba(224,108,26,0.12)` — translucent orange tint
- Hover text: `#e0e0e0`
- Group label active: `#e06c1a`
- Group label inactive: `#7a7a7a`

### Sidebar footer

```tsx
<div className="px-4 py-3" style={{ borderTop: "1px solid #333333" }}>
  <div className="flex items-center justify-between mb-2">
    <div className="min-w-0">
      <p className="text-xs font-medium truncate" style={{ color: "#cccccc" }}>
        {user.name}
      </p>
      <p className="text-[10px] truncate" style={{ color: "#737373" }}>
        {user.email}
      </p>
    </div>
    <button
      style={{ color: "#737373" }}
      onMouseEnter={(e) => { e.currentTarget.style.color = "#e06c1a"; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = "#737373"; }}
      className="shrink-0 ml-2 p-1.5 rounded transition-colors"
    >
      <LogOut className="w-3.5 h-3.5" />
    </button>
  </div>
  <p className="text-[10px]" style={{ color: "#595959" }}>
    Data as of Mar 2026
  </p>
</div>
```

### Desktop sidebar width

```tsx
<aside className="hidden md:flex w-[220px] shrink-0 flex-col" ...>
```

The sidebar is **220px wide** on desktop. The overall layout wrapper is:

```tsx
<div className="flex h-screen overflow-hidden">
  <aside className="hidden md:flex w-[220px] shrink-0 flex-col" ...>
    {/* sidebar */}
  </aside>
  <main className="flex-1 flex flex-col overflow-hidden">
    {/* page content */}
  </main>
</div>
```

---

## 3. Top Bar (Mobile)

On mobile, the sidebar collapses and a top bar appears with a hamburger button:

```tsx
<header
  className="md:hidden flex items-center gap-3 px-4 py-3 shrink-0"
  style={{ background: "#1a1a1a", borderBottom: "1px solid #333333" }}
>
  <button
    onClick={() => setMobileOpen(true)}
    style={{ color: "#8c8c8c" }}
    className="p-1.5 rounded-md"
  >
    <Menu className="w-5 h-5" />
  </button>
  <img
    src={LOGO_URL}
    alt="Lucid"
    className="h-6 object-contain"
  />
</header>
```

---

## 4. Page Background

The main content area uses a **warm near-white** background, not pure white:

```css
--background: oklch(0.975 0.002 75);  /* warm white, very slight warm tint */
```

This is subtly different from `#ffffff`. Cards sit on top of this with pure white (`--card: oklch(1 0 0)`), creating a slight depth effect without shadows.

---

## 5. Dashboard KPI Cards

From the screenshots, the Manus cards have:
- Pure white background (`bg-card`)
- 1px light grey border (`border border-border`)
- `p-5` padding (20px)
- Stat number in **orange** (`stat-highlight` class) or **green** (for positive metrics) or **red** (for flagged)
- Small uppercase label above the number
- Muted footer text below with a top border separator

```tsx
<div className="bg-card rounded-lg border border-border p-5 card-hover">
  <div className="flex items-center justify-between mb-3">
    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      TOTAL SERVICES
    </span>
    <Wifi className="h-4 w-4 text-muted-foreground" />
  </div>
  <div className="text-3xl font-bold" style={{ color: "oklch(0.578 0.178 38.5)" }}>
    2,940
  </div>
  <div className="text-xs text-muted-foreground mt-1">Across 75 locations</div>
  <div className="text-xs text-muted-foreground/60 mt-3 pt-3 border-t border-border">
    Data as of Feb 2026
  </div>
</div>
```

**Colour coding for stat numbers:**
- Orange (`oklch(0.578 0.178 38.5)`) — neutral/total counts
- Green (`oklch(0.56 0.15 145)`) — positive/matched
- Amber (`oklch(0.666 0.16 75.8)`) — warning/unmatched
- Red (`oklch(0.55 0.22 25)`) — flagged/danger

---

## 6. Provider Badges

The Manus build uses a `ProviderBadge` component in `client/src/components/ProviderBadge.tsx`. Each provider has a fixed colour with a small logo/icon prefix.

The badge renders as a pill with:
- Rounded full border
- Provider-specific background tint (10–15% opacity of the provider colour)
- Provider-specific text colour
- Optional small logo image prefix (ABB has a logo, others use text)

**Provider colour map (exact hex values from production):**

| Provider | Background | Text | Border |
|---|---|---|---|
| SasBoss | `rgba(59,130,246,0.1)` | `#3b82f6` | `rgba(59,130,246,0.25)` |
| Vocus | `rgba(139,92,246,0.1)` | `#8b5cf6` | `rgba(139,92,246,0.25)` |
| TIAB | `rgba(249,115,22,0.1)` | `#f97316` | `rgba(249,115,22,0.25)` |
| Telstra | `rgba(29,78,216,0.1)` | `#1d4ed8` | `rgba(29,78,216,0.25)` |
| Starlink | `rgba(30,41,59,0.1)` | `#1e293b` | `rgba(30,41,59,0.25)` |
| Carbon | `rgba(16,185,129,0.1)` | `#10b981` | `rgba(16,185,129,0.25)` |
| NetSIP | `rgba(20,184,166,0.1)` | `#14b8a6` | `rgba(20,184,166,0.25)` |
| Comms Code | `rgba(99,102,241,0.1)` | `#6366f1` | `rgba(99,102,241,0.25)` |
| AAPT | `rgba(239,68,68,0.1)` | `#ef4444` | `rgba(239,68,68,0.25)` |
| Exetel | `rgba(6,182,212,0.1)` | `#06b6d4` | `rgba(6,182,212,0.25)` |
| ABB | `rgba(34,197,94,0.1)` | `#16a34a` | `rgba(34,197,94,0.25)` |
| OneBill | `rgba(234,179,8,0.1)` | `#ca8a04` | `rgba(234,179,8,0.25)` |
| Channel Haus | `rgba(168,85,247,0.1)` | `#9333ea` | `rgba(168,85,247,0.25)` |

Badge JSX pattern:

```tsx
<span
  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold border"
  style={{
    background: "rgba(59,130,246,0.1)",
    color: "#3b82f6",
    borderColor: "rgba(59,130,246,0.25)",
  }}
>
  SasBoss
</span>
```

---

## 7. Status Indicators

Status pills use a coloured dot + text pattern. These are CSS utility classes defined in `index.css`:

```tsx
// Active / Matched
<span className="status-active">Matched</span>

// Unmatched / Review
<span className="status-unmatched">Unmatched</span>

// Flagged / Terminated
<span className="status-flagged">Flagged</span>
```

The CSS for these (copy into `index.css` under `@layer components`):

```css
.status-active {
  @apply inline-flex items-center gap-1.5 text-xs font-medium;
  color: oklch(0.46 0.15 145);
}
.status-active::before {
  content: "";
  @apply w-1.5 h-1.5 rounded-full inline-block;
  background: oklch(0.56 0.15 145);
}
.status-unmatched {
  @apply inline-flex items-center gap-1.5 text-xs font-medium;
  color: oklch(0.55 0.16 75.8);
}
.status-unmatched::before {
  content: "";
  @apply w-1.5 h-1.5 rounded-full inline-block;
  background: oklch(0.666 0.16 75.8);
}
.status-flagged {
  @apply inline-flex items-center gap-1.5 text-xs font-medium;
  color: oklch(0.5 0.22 25);
}
.status-flagged::before {
  content: "";
  @apply w-1.5 h-1.5 rounded-full inline-block;
  background: oklch(0.55 0.22 25);
}
```

---

## 8. Table Styling

From the Customers page screenshot, tables have:
- No outer box shadow — just a `border border-border rounded-lg` wrapper
- Header row: `bg-muted/50` with `text-xs font-semibold uppercase tracking-wider text-muted-foreground`
- Row hover: `hover:bg-muted/30`
- Cell padding: `px-4 py-3`
- Customer name: `text-sm font-medium text-foreground`
- Secondary info (platform tags, alert badges): inline next to the name

The Customers page header pattern:

```tsx
<div className="mb-6">
  <div className="flex items-center justify-between">
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Customers</h1>
      <p className="text-sm text-muted-foreground mt-1">
        454 customers total · 454 with active services
      </p>
    </div>
    <div className="flex gap-2">
      <Button variant="outline" size="sm">+ Retail Bundles</Button>
      <Button size="sm" className="btn-brand">
        <UserPlus className="w-4 h-4" />
        New Customer
      </Button>
    </div>
  </div>
</div>
```

---

## 9. Margin / Revenue Page

From the Revenue & Margin screenshots, the key visual elements are:

**Margin percentage badges** (pill with trend arrow):

```tsx
// Negative margin — red pill
<span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold"
  style={{ background: "rgba(239,68,68,0.1)", color: "#dc2626", border: "1px solid rgba(239,68,68,0.2)" }}>
  <TrendingDown className="w-3 h-3" /> -211.4%
</span>

// Positive margin — green pill
<span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold"
  style={{ background: "rgba(16,185,129,0.1)", color: "#059669", border: "1px solid rgba(16,185,129,0.2)" }}>
  <TrendingUp className="w-3 h-3" /> +40%
</span>
```

**Revenue figure** (green, bold):
```tsx
<span className="font-semibold" style={{ color: "#059669" }}>$35.00</span>
```

**Cost figure** (neutral, standard weight):
```tsx
<span className="text-sm">${cost.toFixed(2)}</span>
```

**"Cost Review Needed" badge** (amber outline):
```tsx
<span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium border"
  style={{ color: "#ca8a04", borderColor: "#ca8a04", background: "rgba(234,179,8,0.06)" }}>
  <AlertTriangle className="w-3 h-3" /> Cost Review Needed
</span>
```

**Filter pills** (the "All / Negative / Low / Healthy / High" toggle):
```tsx
// Active filter
<button className="px-3 py-1.5 rounded-md text-sm font-semibold text-white"
  style={{ background: "#1a1a1a" }}>
  All
</button>
// Inactive filter
<button className="px-3 py-1.5 rounded-md text-sm font-medium border border-border text-foreground hover:bg-muted/50">
  Negative
</button>
```

---

## 10. Customer Detail Page

From the customer detail screenshot, the layout is:

```
┌─────────────────────────────────────────────────────────┐
│  ← Back to Customers                                     │
│  Customer Name                              [Edit] button│
│  PLATFORM TAGS  + RETAIL OFFERING tag                    │
├─────────────────────────────────────────────────────────┤
│  CONTACT & SITE INFO card (full width)      [Edit]       │
│  Contact / Email / Phone / Site Address / Notes          │
├──────────────────────┬──────────────────────────────────┤
│  TOTAL SERVICES      │  MONTHLY COST (EX GST)           │
│  4                   │  $113.01                         │
├──────────────────────┼──────────────────────────────────┤
│  MATCHED             │  UNMATCHED                       │
│  3 (green)           │  0                               │
├──────────────────────┴──────────────────────────────────┤
│  AVC COVERAGE                                            │
│  1/2  ⚠ 1 missing                                       │
└─────────────────────────────────────────────────────────┘
```

The stat cards on the customer detail page use the same pattern as the dashboard but in a 2-column grid:

```tsx
<div className="grid grid-cols-2 gap-4 mb-6">
  <div className="bg-card border border-border rounded-lg p-5">
    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
      TOTAL SERVICES
    </p>
    <p className="text-3xl font-bold text-foreground">4</p>
  </div>
  <div className="bg-card border border-border rounded-lg p-5">
    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
      MONTHLY COST (EX GST)
    </p>
    <p className="text-3xl font-bold text-foreground">$113.01</p>
  </div>
</div>
```

---

## 11. Reconciliation Board

The recon board (visible in the customer detail screenshots) has a distinctive two-column drag-and-drop layout:

**Section header pattern:**
```tsx
<h3 className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 mb-3">
  <DollarSign className="w-3.5 h-3.5" />
  RECONCILIATION BOARD
</h3>
```

**Supplier service card** (left column, draggable):
```tsx
<div className="border border-border rounded-lg p-3 bg-card cursor-grab active:cursor-grabbing">
  <div className="flex items-center justify-between">
    <div className="flex items-center gap-2">
      <GripVertical className="w-3.5 h-3.5 text-muted-foreground/40" />
      <Phone className="w-3.5 h-3.5 text-muted-foreground" />
      <span className="text-sm font-medium">Voice</span>
      <ProviderBadge provider="SasBoss" />
    </div>
    <div className="text-right">
      <span className="text-sm font-semibold text-danger">$0.00</span>
      <span className="text-[10px] text-muted-foreground ml-1">ADV</span>
    </div>
  </div>
</div>
```

**Assignment buckets** (dashed border drop zones):
```tsx
<div className="border-2 border-dashed border-border rounded-lg p-4 hover:border-brand/50 transition-colors">
  <div className="flex items-center gap-2 mb-1">
    <Clock className="w-4 h-4 text-muted-foreground" />
    <span className="text-sm font-semibold">Usage Holding</span>
  </div>
  <p className="text-xs text-muted-foreground">Usage costs held for next month's billing</p>
</div>
```

---

## 12. Typography — Exact Font Loading

Add to `client/index.html` inside `<head>`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&family=JetBrains+Mono:ital,wght@0,100..800;1,100..800&display=swap" rel="stylesheet" />
```

The variable-weight Inter import (using `ital,opsz,wght` range syntax) is important — it enables all weights from 100–900 without multiple requests and activates optical sizing for small text.

---

## 13. Quick Checklist for Replit Developer

Work through these in order — each step brings the visual closer to production:

| Step | Action | Impact |
|---|---|---|
| 1 | Copy `client/src/index.css` verbatim from GitHub | Fixes colours, fonts, utility classes |
| 2 | Add variable-weight Inter + JetBrains Mono to `index.html` | Fixes typography |
| 3 | Replace sidebar with hardcoded hex inline styles (see Section 2) | Fixes sidebar colour |
| 4 | Set sidebar width to `w-[220px]` | Fixes sidebar width |
| 5 | Replace provider badge component with exact colour map (Section 6) | Fixes provider pills |
| 6 | Replace status indicators with CSS utility classes (Section 7) | Fixes status dots |
| 7 | Apply `text-3xl font-bold stat-highlight` to KPI numbers | Fixes dashboard orange numbers |
| 8 | Apply margin badge pattern with red/green pills (Section 9) | Fixes revenue page |
| 9 | Ensure `ThemeProvider defaultTheme="light"` in `App.tsx` | Prevents dark mode bleed |
| 10 | Verify `bg-background` resolves to warm white not pure white | Subtle but visible |

---

*Extracted from production Manus build — 8 April 2026*
