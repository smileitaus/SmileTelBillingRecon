/*
 * Design: Swiss Data Design — persistent left sidebar (220px)
 * Navigation: sidebar with icon + label, active state highlighted
 * Font: DM Sans for labels, JetBrains Mono for data
 * Auth: uses DashboardLayout's auth guard via parent wrapper
 */

import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Users,
  Search,
  ChevronRight,
} from "lucide-react";
import { useState, useRef, useEffect, useCallback } from "react";
import { useGlobalSearch } from "@/hooks/useData";
import { useAuth } from "@/_core/hooks/useAuth";

const navItems = [
  { path: "/", label: "Dashboard", icon: LayoutDashboard },
  { path: "/customers", label: "Customers", icon: Users },
];

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
}

function CommandSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{
    customers: SearchCustomer[];
    services: SearchService[];
  }>({ customers: [], services: [] });
  const { search } = useGlobalSearch();
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const hasResults = results.customers.length > 0 || results.services.length > 0;

  const doSearch = useCallback(
    async (q: string) => {
      if (q.length < 2) {
        setResults({ customers: [], services: [] });
        return;
      }
      const r = await search(q);
      setResults(r as { customers: SearchCustomer[]; services: SearchService[] });
    },
    [search]
  );

  const handleChange = (val: string) => {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val), 250);
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
      if (e.key === "Escape") {
        setOpen(false);
        setQuery("");
        setResults({ customers: [], services: [] });
      }
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
        className="flex items-center gap-2 w-full px-3 py-2 text-sm text-muted-foreground bg-muted/50 rounded-md border border-border hover:bg-muted transition-colors"
      >
        <Search className="w-3.5 h-3.5" />
        <span className="flex-1 text-left">Search...</span>
        <kbd className="text-[10px] font-mono bg-background px-1.5 py-0.5 rounded border border-border">
          Ctrl+K
        </kbd>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
          onClick={() => {
            setOpen(false);
            setQuery("");
            setResults({ customers: [], services: [] });
          }}
        >
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-lg bg-card border border-border rounded-lg shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
              <Search className="w-4 h-4 text-muted-foreground" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => handleChange(e.target.value)}
                placeholder="Search customers, services, phone numbers..."
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              <kbd className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded border border-border">
                ESC
              </kbd>
            </div>

            {query.length >= 2 && (
              <div className="max-h-80 overflow-y-auto p-2">
                {!hasResults && (
                  <p className="text-sm text-muted-foreground px-3 py-4 text-center">
                    No results found
                  </p>
                )}
                {results.customers.length > 0 && (
                  <div className="mb-2">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-3 py-1">
                      Customers
                    </p>
                    {results.customers.map((c) => (
                      <Link
                        key={c.id}
                        href={`/customers/${c.externalId}`}
                        onClick={() => {
                          setOpen(false);
                          setQuery("");
                          setResults({ customers: [], services: [] });
                        }}
                        className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-accent text-sm transition-colors"
                      >
                        <Users className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="flex-1">{c.name}</span>
                        <span className="data-value text-muted-foreground">
                          {c.serviceCount} svc
                        </span>
                      </Link>
                    ))}
                  </div>
                )}
                {results.services.length > 0 && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-3 py-1">
                      Services
                    </p>
                    {results.services.map((s) => (
                      <Link
                        key={s.id}
                        href={`/services/${s.externalId}`}
                        onClick={() => {
                          setOpen(false);
                          setQuery("");
                          setResults({ customers: [], services: [] });
                        }}
                        className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-accent text-sm transition-colors"
                      >
                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                        <div className="flex-1 min-w-0">
                          <p className="truncate">{s.customerName}</p>
                          <p className="data-value text-muted-foreground truncate">
                            {s.phoneNumber || s.connectionId || s.serviceId}
                          </p>
                        </div>
                        <span className="text-xs text-muted-foreground">{s.serviceType}</span>
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

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-[220px] shrink-0 border-r border-border bg-sidebar flex flex-col">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-border">
          <h1 className="text-sm font-bold tracking-tight text-sidebar-foreground">
            Billing Reconciliation
          </h1>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Telstra Service Audit
          </p>
        </div>

        {/* Search */}
        <div className="px-3 py-3">
          <CommandSearch />
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-1">
          {navItems.map((item) => {
            const isActive =
              item.path === "/"
                ? location === "/"
                : location.startsWith(item.path);
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                href={item.path}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors mb-0.5 ${
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/50"
                }`}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* User & Footer */}
        <div className="px-4 py-3 border-t border-border">
          {user && (
            <div className="flex items-center justify-between mb-2">
              <div className="min-w-0">
                <p className="text-xs font-medium truncate">{user.name || "User"}</p>
                <p className="text-[10px] text-muted-foreground truncate">{user.email || ""}</p>
              </div>
              <button
                onClick={logout}
                className="text-[10px] text-muted-foreground hover:text-destructive transition-colors shrink-0 ml-2"
              >
                Sign out
              </button>
            </div>
          )}
          <p className="text-[10px] text-muted-foreground">
            Data as of Feb 2026
          </p>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto bg-background">
        {children}
      </main>
    </div>
  );
}
