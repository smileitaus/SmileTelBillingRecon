/*
 * Lucid — Understanding & Clarity
 * Brand: Jet black sidebar (#000), Orange active state (#e95b2a), White text
 * Logo: Lucid wordmark from CDN
 * Nav: Collapsible groups — Dashboard, Review, Suppliers, Accounting, System, Admin
 * Mobile: Hamburger → slide-over drawer with backdrop
 */

import { Link, useLocation } from "wouter";
import {
  AlertTriangle,
  LayoutDashboard,
  Users,
  Search,
  ChevronRight,
  TrendingUp,
  FileWarning,
  Merge,
  ClipboardCheck,
  Sparkles,
  ShieldCheck,
  Link2,
  Upload,
  Receipt,
  Scissors,
  Wifi,
  Activity,
  Bell,
  Router,
  FileText,
  Smartphone,
  Signal,
  LogOut,
  Phone,
  ChevronDown,
  Settings,
  BookOpen,
  CreditCard,
  Palette,
  Building2,
  Menu,
  X,
  Tag,
  Package,
  Layers,
  Unlink,
  Archive,
  CalendarDays,
  Satellite,
} from "lucide-react";
import { useState, useRef, useEffect, useCallback } from "react";
import { useGlobalSearch } from "@/hooks/useData";
import { useAuth } from "@/_core/hooks/useAuth";
import { ProviderBadge } from "@/components/ProviderBadge";

const LOGO_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310519663446026794/SkibUwiSvPndpvTSJv52KC/lucid-logo-full_7f99ec43.jpg";

// ── Nav group definitions ────────────────────────────────────────────────────
interface NavItem {
  path: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavGroup {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  items: NavItem[];
  /** If true, only shown to users with role === 'admin' */
  adminOnly?: boolean;
}

const navGroups: NavGroup[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    items: [
      { path: "/", label: "Dashboard", icon: LayoutDashboard },
      { path: "/customers", label: "Customers", icon: Users },
      { path: "/numbers", label: "Number Management", icon: Phone },
      { path: "/revenue", label: "Revenue & Margin", icon: TrendingUp },
      { path: "/outages", label: "Outage Monitor", icon: Activity },
      { path: "/usage-alerts", label: "Usage Alerts", icon: Bell },
      { path: "/merge", label: "Merge Customers", icon: Merge },
      { path: "/omada", label: "Omada Network", icon: Router },
    ],
  },
  {
    id: "review",
    label: "Review",
    icon: ClipboardCheck,
    items: [
      { path: "/review", label: "Review", icon: ClipboardCheck },
      { path: "/unmatched", label: "Unmatched Services", icon: Unlink },
      { path: "/platform-checks", label: "Platform Checks", icon: ShieldCheck },
      { path: "/termination-management", label: "Termination Management", icon: Scissors },
      { path: "/termination-archive", label: "Termination Archive", icon: Archive },
      { path: "/payment-plans", label: "Payment Plans", icon: CreditCard },
      { path: "/billing-cycle", label: "Billing Cycle", icon: CalendarDays },
    ],
  },
  {
    id: "suppliers",
    label: "Suppliers",
    icon: Building2,
    items: [
      { path: "/suppliers", label: "Supplier Registry", icon: Layers },
      { path: "/supplier-invoices", label: "Supplier Invoices", icon: Upload },
      { path: "/tiab", label: "TIAB Mobile", icon: Smartphone },
      { path: "/vocus", label: "Vocus Wholesale", icon: Signal },
      { path: "/starlink", label: "Starlink", icon: Satellite },
      { path: "/pricebook", label: "SasBoss Pricebook", icon: Tag },
      { path: "/internet-pricebook", label: "Internet Pricebook", icon: Wifi },
      { path: "/retail-bundles", label: "Retail Bundles", icon: Package },
    ],
  },
  {
    id: "accounting",
    label: "Accounting",
    icon: Receipt,
    adminOnly: true,
    items: [
      { path: "/billing-queue", label: "Billing Queue", icon: Receipt },
      { path: "/blitz-termination", label: "Blitz Terminations", icon: Scissors },
    ],
  },
  {
    id: "system",
    label: "System",
    icon: Settings,
    items: [
      { path: "/integrations", label: "API Integrations", icon: Wifi },
      { path: "/rate-cards", label: "Rate Cards", icon: CreditCard },
      { path: "/style-guide", label: "Style Guide", icon: Palette },
    ],
  },
  {
    id: "admin",
    label: "Admin",
    icon: BookOpen,
    adminOnly: true,
    items: [
      { path: "/billing", label: "Billing Match", icon: FileWarning },
      { path: "/auto-match", label: "Auto-Match", icon: Sparkles },
      { path: "/service-billing-match", label: "Service Linking", icon: Link2 },
    ],
  },
];

// All paths that belong to each group (for active-group detection)
const groupPaths = navGroups.reduce<Record<string, string[]>>((acc, g) => {
  acc[g.id] = g.items.map((i) => i.path);
  return acc;
}, {});

function isGroupActive(groupId: string, location: string): boolean {
  return groupPaths[groupId]?.some((p) =>
    p === "/" ? location === "/" : location.startsWith(p)
  ) ?? false;
}

// ── Search component ─────────────────────────────────────────────────────────

interface SearchCustomer {
  id: number;
  externalId: string;
  name: string;
  serviceCount: number;
}

interface SearchService {
  id: number;
  externalId: string;
  phoneNumber: string | null;
  connectionId: string | null;
  serviceId: string | null;
  customerName: string | null;
  serviceType: string;
  planName: string | null;
  supplierAccount: string | null;
  provider: string | null;
  matchedField: string;
  matchedValue: string;
}

function CommandSearch({ onNavigate }: { onNavigate?: () => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{
    customers: SearchCustomer[];
    services: SearchService[];
    vocusNbn: any[];
    vocusMobile: any[];
    phoneNumbers: any[];
  }>({ customers: [], services: [], vocusNbn: [], vocusMobile: [], phoneNumbers: [] });
  const { search } = useGlobalSearch();
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const hasResults =
    results.customers.length > 0 ||
    results.services.length > 0 ||
    results.vocusNbn.length > 0 ||
    results.vocusMobile.length > 0 ||
    (results.phoneNumbers?.length ?? 0) > 0;

  const doSearch = useCallback(
    async (q: string) => {
      if (q.length < 2) {
        setResults({ customers: [], services: [], vocusNbn: [], vocusMobile: [], phoneNumbers: [] });
        return;
      }
      const r = await search(q);
      setResults(r as typeof results);
    },
    [search]
  );

  const handleChange = (val: string) => {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val), 250);
  };

  const closeSearch = () => {
    setOpen(false);
    setQuery("");
    setResults({ customers: [], services: [], vocusNbn: [], vocusMobile: [], phoneNumbers: [] });
  };

  const handleNavigate = () => {
    closeSearch();
    onNavigate?.();
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
      if (e.key === "Escape") closeSearch();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <>
      <button
        onClick={() => {
          setOpen(true);
          setTimeout(() => inputRef.current?.focus(), 50);
        }}
        className="flex items-center gap-2 w-full px-3 py-2 text-sm rounded-md border transition-colors"
        style={{
          background: "#383838",
          borderColor: "#474747",
          color: "#a6a6a6",
        }}
      >
        <Search className="w-3.5 h-3.5" />
        <span className="flex-1 text-left text-xs">Search...</span>
        <kbd
          className="text-[10px] font-mono px-1.5 py-0.5 rounded border hidden sm:inline"
          style={{ background: "#2d2d2d", borderColor: "#4d4d4d", color: "#8c8c8c" }}
        >
          Ctrl+K
        </kbd>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-start justify-center pt-[10vh] px-4"
          onClick={closeSearch}
        >
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-lg bg-card border border-border rounded-xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
              <Search className="w-4 h-4 text-muted-foreground shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => handleChange(e.target.value)}
                placeholder="Search by name, number, address, SIM, AVC..."
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground min-w-0"
              />
              <kbd className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded border border-border shrink-0">
                ESC
              </kbd>
            </div>

            {query.length >= 2 && (
              <div className="max-h-[60vh] overflow-y-auto p-2">
                {!hasResults && (
                  <p className="text-sm text-muted-foreground px-3 py-4 text-center">No results found</p>
                )}

                {results.customers.length > 0 && (
                  <div className="mb-2">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-3 py-1">Customers</p>
                    {results.customers.map((c) => (
                      <Link
                        key={c.id}
                        href={`/customers/${c.externalId}`}
                        onClick={handleNavigate}
                        className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-accent text-sm transition-colors"
                      >
                        <Users className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span className="flex-1 truncate">{c.name}</span>
                        <span className="data-value text-muted-foreground shrink-0">{c.serviceCount} svc</span>
                      </Link>
                    ))}
                  </div>
                )}

                {results.services.length > 0 && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-3 py-1">Services</p>
                    {results.services.map((s) => (
                      <Link
                        key={s.id}
                        href={`/services/${s.externalId}`}
                        onClick={handleNavigate}
                        className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-accent text-sm transition-colors"
                      >
                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate">{s.matchedValue}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {s.customerName ?? "Unmatched"} · {s.serviceType}
                            {s.provider ? ` · ${s.provider}` : ""}
                          </p>
                        </div>
                        <ProviderBadge provider={s.provider ?? "Unknown"} size="sm" />
                      </Link>
                    ))}
                  </div>
                )}

                {(results.phoneNumbers?.length ?? 0) > 0 && (
                  <div className="mt-2">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-3 py-1">Phone Numbers</p>
                    {results.phoneNumbers.map((n: any) => (
                      <Link
                        key={n.id}
                        href={`/numbers?highlight=${n.number}`}
                        onClick={handleNavigate}
                        className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-accent text-sm transition-colors"
                      >
                        <Phone className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-mono truncate">{n.number}</p>
                          <p className="text-xs text-muted-foreground truncate">{n.customerName ?? "Unassigned"}</p>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}

                {results.vocusNbn.length > 0 && (
                  <div className="mt-2">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-3 py-1">Vocus NBN</p>
                    {results.vocusNbn.map((v: any) => (
                      <Link
                        key={v.id}
                        href={`/vocus?tab=nbn&highlight=${v.vbuId}`}
                        onClick={handleNavigate}
                        className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-accent text-sm transition-colors"
                      >
                        <Wifi className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-mono truncate">{v.vbuId}</p>
                          <p className="text-xs text-muted-foreground truncate">{v.address ?? v.customerName ?? ""}</p>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}

                {results.vocusMobile.length > 0 && (
                  <div className="mt-2">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-3 py-1">Vocus Mobile</p>
                    {results.vocusMobile.map((v: any) => (
                      <Link
                        key={v.id}
                        href={`/vocus?tab=mobile&highlight=${v.msisdn}`}
                        onClick={handleNavigate}
                        className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-accent text-sm transition-colors"
                      >
                        <Smartphone className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-mono truncate">{v.msisdn}</p>
                          <p className="text-xs text-muted-foreground truncate">{v.customerName ?? ""}</p>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ── Nav group section ────────────────────────────────────────────────────────

function NavGroupSection({
  group,
  location,
  defaultOpen,
  onNavigate,
}: {
  group: NavGroup;
  location: string;
  defaultOpen: boolean;
  onNavigate?: () => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const activeInGroup = isGroupActive(group.id, location);
  const GroupIcon = group.icon;

  return (
    <div className="mb-0.5">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 w-full px-2.5 py-1.5 rounded-md text-[11px] font-semibold uppercase tracking-wider transition-colors"
        style={{
          color: activeInGroup ? "#e06c1a" : "#7a7a7a",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.color = activeInGroup
            ? "#e06c1a"
            : "#a6a6a6";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.color = activeInGroup
            ? "#e06c1a"
            : "#7a7a7a";
        }}
      >
        <GroupIcon className="w-3.5 h-3.5 shrink-0" />
        <span className="flex-1 text-left">{group.label}</span>
        <ChevronDown
          className="w-3 h-3 shrink-0 transition-transform duration-200"
          style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)" }}
        />
      </button>

      {/* Group items */}
      {open && (
        <div className="ml-2 pl-2 border-l border-white/[0.06]">
          {group.items.map((item) => {
            const isActive =
              item.path === "/"
                ? location === "/"
                : location.startsWith(item.path);
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                href={item.path}
                onClick={onNavigate}
                className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[12.5px] transition-all mb-0.5 group"
                style={
                  isActive
                    ? {
                        background: "#e06c1a",
                        color: "#ffffff",
                        fontWeight: 600,
                      }
                    : { color: "#949494" }
                }
                onMouseEnter={(e) => {
                  if (!isActive) {
                    (e.currentTarget as HTMLElement).style.background = "rgba(224,108,26,0.12)";
                    (e.currentTarget as HTMLElement).style.color = "#e0e0e0";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    (e.currentTarget as HTMLElement).style.background = "transparent";
                    (e.currentTarget as HTMLElement).style.color = "#949494";
                  }
                }}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Sidebar content (shared between desktop and mobile drawer) ───────────────

function SidebarContent({
  location,
  visibleGroups,
  activeGroupId,
  user,
  logout,
  onNavigate,
}: {
  location: string;
  visibleGroups: NavGroup[];
  activeGroupId: string;
  user: any;
  logout: () => void;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex flex-col h-full" style={{ background: "#1a1a1a" }}>
      {/* Logo */}
      <div style={{ borderBottom: "1px solid #333333" }}>
        <div title="Lucid: Transparently clear; Easily understandable." className="cursor-default px-4 py-2">
          <img src={LOGO_URL} alt="Lucid" className="w-[80%] h-auto object-contain block mx-auto" />
        </div>
      </div>

      {/* Search */}
      <div className="px-3 py-2.5">
        <CommandSearch onNavigate={onNavigate} />
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-1 overflow-y-auto space-y-0.5">
        {visibleGroups.map((group) => (
          <NavGroupSection
            key={group.id}
            group={group}
            location={location}
            defaultOpen={group.id === activeGroupId}
            onNavigate={onNavigate}
          />
        ))}
      </nav>

      {/* User footer */}
      <div className="px-4 py-3" style={{ borderTop: "1px solid #333333" }}>
        {user && (
          <div className="flex items-center justify-between mb-2">
            <div className="min-w-0">
              <p className="text-xs font-medium truncate" style={{ color: "#cccccc" }}>
                {user.name || "User"}
              </p>
              <p className="text-[10px] truncate" style={{ color: "#737373" }}>
                {user.email || ""}
              </p>
            </div>
            <button
              onClick={logout}
              className="shrink-0 ml-2 p-1.5 rounded transition-colors"
              style={{ color: "#737373" }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.color = "#e06c1a";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.color = "#737373";
              }}
              title="Sign out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        <p className="text-[10px]" style={{ color: "#595959" }}>
          Data as of Mar 2026
        </p>
      </div>
    </div>
  );
}

// ── Main layout ──────────────────────────────────────────────────────────────

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location]);

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  // Role-based nav filtering
  const isAdmin = (user as any)?.role === "admin";
  const visibleGroups = navGroups.filter((g) => !g.adminOnly || isAdmin);
  const activeGroupId = visibleGroups.find((g) => isGroupActive(g.id, location))?.id ?? "dashboard";

  const sidebarProps = { location, visibleGroups, activeGroupId, user, logout };

  return (
    <div className="flex h-screen overflow-hidden">

      {/* ── Desktop sidebar (hidden on mobile) ── */}
      <aside
        className="hidden md:flex w-[220px] shrink-0 flex-col"
        style={{ background: "#1a1a1a", borderRight: "1px solid #333333" }}
      >
        <SidebarContent {...sidebarProps} />
      </aside>

      {/* ── Mobile slide-over drawer ── */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          {/* Drawer panel */}
          <aside
            className="absolute left-0 top-0 bottom-0 w-[260px] flex flex-col shadow-2xl"
            style={{ background: "#1a1a1a", borderRight: "1px solid #333333" }}
          >
            {/* Close button */}
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-3 right-3 p-1.5 rounded-md z-10"
              style={{ color: "#8c8c8c" }}
            >
              <X className="w-4 h-4" />
            </button>
            <SidebarContent {...sidebarProps} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile top bar */}
        <header
          className="flex md:hidden items-center gap-3 px-4 py-3 shrink-0"
          style={{ background: "#1a1a1a", borderBottom: "1px solid #333333" }}
        >
          <button
            onClick={() => setMobileOpen(true)}
            className="p-1.5 rounded-md"
            style={{ color: "#a6a6a6" }}
            aria-label="Open navigation"
          >
            <Menu className="w-5 h-5" />
          </button>
          <img src={LOGO_URL} alt="Lucid" className="h-6 w-auto object-contain" />
        </header>

        <main className="flex-1 overflow-y-auto bg-background">{children}</main>
      </div>
    </div>
  );
}
