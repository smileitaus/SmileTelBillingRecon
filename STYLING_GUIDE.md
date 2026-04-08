# Lucid Portal — Design System & Styling Guide

This document is the authoritative reference for replicating the visual design of the Lucid Portal in Replit or any other environment. It covers every design decision: colour tokens, typography, spacing, component patterns, sidebar layout, and the CSS utility classes that give the UI its polished look.

---

## 1. Fonts

Three typefaces are loaded from Google Fonts. Add the following `<link>` tags to `client/index.html` inside `<head>`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
```

| Role | Family | Weights | Usage |
|---|---|---|---|
| **Body / UI** | Inter | 400, 500, 600, 700 | All labels, paragraphs, buttons, nav |
| **Data / Code** | JetBrains Mono | 400, 500 | Phone numbers, service IDs, IP addresses, cost figures |

The CSS variables that wire these into Tailwind:

```css
--font-sans: "Inter", system-ui, sans-serif;
--font-mono: "JetBrains Mono", ui-monospace, monospace;
```

**Heading style:** All `h1`–`h6` use `font-weight: 600` and `letter-spacing: -0.02em` (tight tracking). This gives headings a crisp, modern feel distinct from body text.

---

## 2. Colour System

All colours use the **OKLCH colour space** for perceptual uniformity. Do not convert to HSL — Tailwind 4 requires OKLCH in `@theme` blocks.

### 2.1 Brand Palette

| Token | OKLCH | Hex Approx | Usage |
|---|---|---|---|
| `--color-brand` | `oklch(0.578 0.178 38.5)` | `#e95b2a` | Primary buttons, active nav, focus rings, chart-1 |
| `--color-brand-dark` | `oklch(0.48 0.178 38.5)` | `#c44820` | Hover state for brand elements |
| `--color-brand-light` | `oklch(0.92 0.06 38.5)` | `#fde8dc` | Pale orange tint backgrounds, accent surfaces |
| `--color-jet` | `oklch(0.145 0 0)` | `#1a1a1a` | Sidebar background, heading text |
| `--color-mid-grey` | `oklch(0.52 0.005 0)` | `#787879` | Muted text, secondary labels |
| `--color-light-grey` | `oklch(0.81 0.005 0)` | `#c6cacd` | Borders, dividers, scrollbar thumb |

### 2.2 Semantic Status Colours

| Token | OKLCH | Usage |
|---|---|---|
| `--color-success` | `oklch(0.56 0.15 145)` | Active/matched status, positive indicators |
| `--color-warning` | `oklch(0.72 0.16 75)` | Unmatched/review status, amber alerts |
| `--color-danger` | `oklch(0.55 0.22 25)` | Flagged/terminated, destructive actions |
| `--color-info` | `oklch(0.56 0.15 230)` | Informational badges, blue accents |

### 2.3 Semantic UI Tokens (Light Theme — Default)

These are the shadcn/ui CSS variable tokens. The portal uses **light theme only** (no dark mode toggle).

```css
:root {
  --radius: 0.5rem;

  /* Page surface */
  --background:          oklch(0.975 0.002 75);   /* near-white warm */
  --foreground:          oklch(0.145 0     0);     /* jet black text */

  /* Cards */
  --card:                oklch(1 0 0);
  --card-foreground:     oklch(0.145 0     0);

  /* Primary = SmileTel Orange */
  --primary:             oklch(0.578 0.178 38.5);
  --primary-foreground:  oklch(1 0 0);

  /* Secondary = light grey surface */
  --secondary:           oklch(0.94 0.003 0);
  --secondary-foreground: oklch(0.35 0.005 0);

  /* Muted */
  --muted:               oklch(0.94 0.003 0);
  --muted-foreground:    oklch(0.52 0.005 0);

  /* Accent = pale orange tint */
  --accent:              oklch(0.95 0.025 38.5);
  --accent-foreground:   oklch(0.578 0.178 38.5);

  /* Destructive */
  --destructive:         oklch(0.55 0.22 25);
  --destructive-foreground: oklch(1 0 0);

  /* Borders & inputs */
  --border:              oklch(0.81 0.005 0);
  --input:               oklch(0.81 0.005 0);
  --ring:                oklch(0.578 0.178 38.5);

  /* Charts — orange-led 5-colour palette */
  --chart-1: oklch(0.578 0.178 38.5);  /* brand orange */
  --chart-2: oklch(0.56  0.15  145);   /* green */
  --chart-3: oklch(0.56  0.15  230);   /* blue */
  --chart-4: oklch(0.72  0.16  75);    /* amber */
  --chart-5: oklch(0.52  0.005 0);     /* mid grey */

  /* Sidebar — jet black with orange accents */
  --sidebar:                     oklch(0.145 0 0);
  --sidebar-foreground:          oklch(0.88 0.005 0);
  --sidebar-primary:             oklch(0.578 0.178 38.5);
  --sidebar-primary-foreground:  oklch(1 0 0);
  --sidebar-accent:              oklch(0.22 0 0);
  --sidebar-accent-foreground:   oklch(1 0 0);
  --sidebar-border:              oklch(0.22 0 0);
  --sidebar-ring:                oklch(0.578 0.178 38.5);
}
```

---

## 3. Layout & Sidebar

### 3.1 Overall Structure

The portal uses a **persistent left sidebar** with a resizable width (default 280px, min 200px, max 480px). The sidebar width is persisted in `localStorage` under the key `sidebar-width`.

```
┌─────────────────────────────────────────────────────┐
│  Sidebar (jet black)  │  Main content area          │
│  280px default        │  bg-background (warm white) │
│  ─────────────────    │                             │
│  Logo                 │  Page header (breadcrumb)   │
│  Search bar           │  ─────────────────────────  │
│  Nav groups           │  Page content               │
│  ─────────────────    │                             │
│  User avatar/logout   │                             │
└─────────────────────────────────────────────────────┘
```

### 3.2 Sidebar Colours

The sidebar background is **jet black** (`oklch(0.145 0 0)`). Nav item text is light grey (`oklch(0.88 0.005 0)`). Active nav items use the **brand orange** as background with white text. Hover state uses a slightly lighter black (`oklch(0.22 0 0)`).

### 3.3 Navigation Groups

The nav is organised into collapsible groups. Each group has an icon, a label, and child items. Groups collapse/expand on click and remember their state. The active group is auto-expanded based on the current route.

| Group | Icon | Admin Only |
|---|---|---|
| Dashboard | LayoutDashboard | No |
| Review | ClipboardCheck | No |
| Suppliers | Building2 | No |
| Accounting | Receipt | **Yes** |
| System | Settings | No |
| Admin | BookOpen | **Yes** |

### 3.4 Logo

The Lucid logo is served from CDN:
```
https://d2xsxph8kpxj0f.cloudfront.net/310519663446026794/SkibUwiSvPndpvTSJv52KC/lucid-logo-full_7f99ec43.jpg
```

Display it at `h-8` (32px height) with `object-contain` in the sidebar header.

---

## 4. Typography Scale

| Element | Classes | Notes |
|---|---|---|
| Page title | `text-2xl font-semibold tracking-tight` | Used in page headers |
| Section heading | `text-lg font-semibold` | Card titles, section labels |
| Sub-heading | `text-sm font-semibold text-foreground` | Table column headers |
| Body | `text-sm` | Default for all content |
| Muted label | `text-xs text-muted-foreground` | Secondary labels, timestamps |
| Data value | `font-mono text-sm` (`.data-value` class) | IDs, phone numbers, IPs, costs |
| Stat number | `text-3xl font-bold` + `.stat-highlight` | Dashboard KPI cards |

---

## 5. Spacing & Radius

The portal uses a **0.5rem (8px) base radius** (`--radius: 0.5rem`). Components follow these radius conventions:

| Component | Radius |
|---|---|
| Cards | `rounded-lg` (0.5rem) |
| Buttons | `rounded-md` (0.375rem) |
| Badges / pills | `rounded-full` |
| Input fields | `rounded-md` |
| Dialogs / modals | `rounded-xl` |

Page padding uses the `.container` class which auto-applies responsive horizontal padding (1rem → 1.5rem → 2rem at sm/lg breakpoints) and caps max-width at 1440px.

---

## 6. Custom CSS Utility Classes

These classes are defined in `client/src/index.css` under `@layer components` and should be copied verbatim.

### `.btn-brand`
The primary orange call-to-action button. Includes a subtle lift on hover with an orange drop shadow.

```css
.btn-brand {
  @apply inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold text-white transition-all;
  background: oklch(0.578 0.178 38.5);
}
.btn-brand:hover {
  background: oklch(0.48 0.178 38.5);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px oklch(0.578 0.178 38.5 / 0.35);
}
.btn-brand:active {
  transform: translateY(0);
  box-shadow: none;
}
```

### `.badge-brand`
Orange pill badge for provider names, plan labels, and category tags.

```css
.badge-brand {
  @apply inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold;
  background: oklch(0.578 0.178 38.5 / 0.12);
  color: oklch(0.48 0.178 38.5);
  border: 1px solid oklch(0.578 0.178 38.5 / 0.25);
}
```

### Status Pills (`.status-active`, `.status-unmatched`, `.status-flagged`, `.status-review`)
Dot + text status indicators. Each has a coloured dot pseudo-element prepended automatically.

```css
.status-active   { color: oklch(0.46 0.15 145); }   /* green */
.status-active::before { background: oklch(0.56 0.15 145); }

.status-unmatched { color: oklch(0.55 0.16 75.8); }  /* amber */
.status-unmatched::before { background: oklch(0.666 0.16 75.8); }

.status-flagged  { color: oklch(0.5 0.22 25); }      /* red */
.status-flagged::before { background: oklch(0.55 0.22 25); }
```

All status pills share:
```css
@apply inline-flex items-center gap-1.5 text-xs font-medium;
/* ::before */
content: "";
@apply w-1.5 h-1.5 rounded-full;
```

### `.data-value`
Monospace style for technical identifiers:
```css
.data-value {
  font-family: "JetBrains Mono", ui-monospace, monospace;
  font-size: 0.8125rem;
  letter-spacing: -0.01em;
}
```

### `.stat-highlight`
Orange bold text for KPI numbers on the dashboard:
```css
.stat-highlight {
  color: oklch(0.578 0.178 38.5);
  font-weight: 700;
}
```

### `.card-hover`
Subtle lift animation for interactive cards:
```css
.card-hover {
  @apply transition-all duration-200;
}
.card-hover:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px oklch(0 0 0 / 0.08);
}
```

### `.border-brand-left`
Orange left accent border used on highlighted rows and info panels:
```css
.border-brand-left {
  border-left: 3px solid oklch(0.578 0.178 38.5);
}
```

---

## 7. Dashboard KPI Cards

Each stat card on the dashboard follows this pattern:

```tsx
<div className="bg-card rounded-lg border border-border p-5 card-hover">
  <div className="flex items-center justify-between mb-3">
    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      TOTAL SERVICES
    </span>
    <Wifi className="h-4 w-4 text-muted-foreground" />
  </div>
  <div className="text-3xl font-bold stat-highlight">2,940</div>
  <div className="text-xs text-muted-foreground mt-1">Across 75 locations</div>
  <div className="text-xs text-muted-foreground/60 mt-3 pt-3 border-t border-border">
    Data as of Feb 2026
  </div>
</div>
```

Key details:
- Card background: `bg-card` (pure white)
- Border: `border border-border` (light grey `oklch(0.81 0.005 0)`)
- Padding: `p-5` (20px)
- Stat number: `text-3xl font-bold stat-highlight` (orange, 30px)
- Label: `text-xs font-semibold uppercase tracking-wider text-muted-foreground`
- Footer: separated by a `border-t border-border` at reduced opacity

---

## 8. Tables

Data tables use the shadcn/ui `Table` component with these conventions:

- `TableHeader` rows: `bg-muted/50` background, `text-xs font-semibold uppercase tracking-wider text-muted-foreground`
- `TableRow` hover: `hover:bg-muted/30`
- `TableCell` padding: `px-4 py-3`
- Numeric/ID cells: wrap content in `<span className="data-value">`
- Status cells: use the `.status-*` utility classes
- Provider cells: use the `<ProviderBadge provider={name} />` component

---

## 9. Provider Badges

The `ProviderBadge` component renders a coloured pill for each telecom supplier. Each provider has a fixed colour:

| Provider | Colour |
|---|---|
| SasBoss | Blue `#3b82f6` |
| Vocus | Purple `#8b5cf6` |
| TIAB | Orange `#f97316` |
| Telstra | Blue `#1d4ed8` |
| Starlink | Dark `#1e293b` |
| Carbon | Green `#10b981` |
| NetSIP | Teal `#14b8a6` |
| Comms Code | Indigo `#6366f1` |
| AAPT | Red `#ef4444` |
| Exetel | Cyan `#06b6d4` |

Usage: `<ProviderBadge provider="SasBoss" />` — the component is in `client/src/components/ProviderBadge.tsx`.

---

## 10. Scrollbar Styling

The portal uses a custom 6px scrollbar with brand orange on hover:

```css
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb {
  background: oklch(0.81 0.005 0);
  border-radius: 3px;
}
::-webkit-scrollbar-thumb:hover {
  background: oklch(0.578 0.178 38.5 / 0.6);
}
```

---

## 11. Selection Highlight

Text selection uses a translucent brand orange:

```css
::selection {
  background: oklch(0.578 0.178 38.5 / 0.2);
  color: oklch(0.145 0 0);
}
```

---

## 12. Global Body Settings

```css
html {
  font-size: 16px;
  -webkit-text-size-adjust: 100%;
  text-size-adjust: 100%;
}
body {
  @apply bg-background text-foreground antialiased;
  font-feature-settings: "cv01", "cv02", "cv03", "cv04";
  min-width: 320px;
}
```

The `font-feature-settings` enables Inter's alternate character variants for improved legibility in data-dense interfaces.

---

## 13. Charts (Recharts)

All charts use the 5-colour `--chart-*` palette defined in the CSS variables. The standard bar chart pattern:

- `fill="var(--chart-1)"` — brand orange (primary series)
- `fill="var(--chart-2)"` — green (secondary series)
- `fill="var(--chart-3)"` — blue
- `fill="var(--chart-4)"` — amber
- `fill="var(--chart-5)"` — grey

Tooltip background: `bg-card border border-border shadow-lg rounded-lg p-3`

---

## 14. Full `index.css` Drop-in

The complete `client/src/index.css` file from the Manus build is available in the GitHub repository at:

```
https://github.com/smileitaus/SmileTelBillingRecon/blob/main/client/src/index.css
```

**The fastest path to visual parity** is to copy this file verbatim into the Replit project's `client/src/index.css`, then ensure the Google Fonts `<link>` tags are present in `client/index.html`. All other styling flows from these two files plus the shadcn/ui component library.

---

## 15. ThemeProvider Configuration

The portal uses light theme as default. In `client/src/App.tsx`:

```tsx
<ThemeProvider defaultTheme="light" storageKey="lucid-theme">
  {/* app content */}
</ThemeProvider>
```

There is no dark mode toggle exposed to users — the UI is light-only.

---

*Last updated: 8 April 2026 — extracted from production Manus build*
