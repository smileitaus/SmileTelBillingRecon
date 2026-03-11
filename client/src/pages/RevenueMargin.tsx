/*
 * Revenue & Margin Analysis — shows services with billing revenue matched,
 * cost vs revenue, margin %. Filterable by margin band. Red highlighting for low/negative.
 */

import { Link } from "wouter";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  AlertTriangle,
  Loader2,
  ArrowUpDown,
  Filter,
  Smartphone,
  Wifi,
  Phone,
  Globe,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useState, useMemo } from "react";
import { ProviderBadge } from "@/components/ProviderBadge";

function ServiceTypeIcon({ type }: { type: string }) {
  switch (type) {
    case "Internet": return <Wifi className="w-3.5 h-3.5" />;
    case "Mobile": return <Smartphone className="w-3.5 h-3.5" />;
    case "Voice": return <Phone className="w-3.5 h-3.5" />;
    default: return <Globe className="w-3.5 h-3.5" />;
  }
}

function MarginBadge({ margin }: { margin: number | null }) {
  if (margin === null) return <span className="text-xs text-muted-foreground">—</span>;
  
  let bg = "bg-emerald-50 text-emerald-700 border-emerald-200";
  let icon = <TrendingUp className="w-3 h-3" />;
  
  if (margin < 0) {
    bg = "bg-red-100 text-red-800 border-red-300 font-bold";
    icon = <TrendingDown className="w-3 h-3" />;
  } else if (margin < 20) {
    bg = "bg-red-50 text-red-700 border-red-200 font-semibold";
    icon = <AlertTriangle className="w-3 h-3" />;
  } else if (margin < 50) {
    bg = "bg-amber-50 text-amber-700 border-amber-200";
    icon = <TrendingUp className="w-3 h-3" />;
  }

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full border ${bg}`}>
      {icon}
      {margin.toFixed(1)}%
    </span>
  );
}

function formatCurrency(val: number) {
  return `$${val.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function RevenueMargin() {
  const [marginFilter, setMarginFilter] = useState("all");
  const [serviceTypeFilter, setServiceTypeFilter] = useState("all");
  const [providerFilter, setProviderFilter] = useState("all");
  const [sortField, setSortField] = useState<"margin" | "revenue" | "cost">("margin");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const { data: services, isLoading } = trpc.billing.margin.list.useQuery({
    marginFilter,
    serviceType: serviceTypeFilter,
    provider: providerFilter,
  });

  const { data: billingSummary } = trpc.billing.billingItems.summary.useQuery();

  const sorted = useMemo(() => {
    if (!services) return [];
    return [...services].sort((a, b) => {
      let aVal = 0, bVal = 0;
      if (sortField === "margin") { aVal = a.marginPercent ?? 0; bVal = b.marginPercent ?? 0; }
      else if (sortField === "revenue") { aVal = a.monthlyRevenue; bVal = b.monthlyRevenue; }
      else { aVal = a.monthlyCost; bVal = b.monthlyCost; }
      return sortDir === "asc" ? aVal - bVal : bVal - aVal;
    });
  }, [services, sortField, sortDir]);

  const stats = useMemo(() => {
    if (!services || services.length === 0) return null;
    const totalCost = services.reduce((s, v) => s + v.monthlyCost, 0);
    const totalRevenue = services.reduce((s, v) => s + v.monthlyRevenue, 0);
    const negative = services.filter(s => (s.marginPercent ?? 0) < 0).length;
    const low = services.filter(s => (s.marginPercent ?? 0) >= 0 && (s.marginPercent ?? 0) < 20).length;
    const healthy = services.filter(s => (s.marginPercent ?? 0) >= 20 && (s.marginPercent ?? 0) < 50).length;
    const high = services.filter(s => (s.marginPercent ?? 0) >= 50).length;
    const overallMargin = totalRevenue > 0 ? ((totalRevenue - totalCost) / totalRevenue * 100) : 0;
    return { totalCost, totalRevenue, negative, low, healthy, high, overallMargin, total: services.length };
  }, [services]);

  const toggleSort = (field: "margin" | "revenue" | "cost") => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir(field === "margin" ? "asc" : "desc"); }
  };

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold tracking-tight">Revenue & Margin Analysis</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Feb 2026 Xero billing matched to supplier costs — filter by margin to find underperforming services
        </p>
      </div>

      {/* Summary Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
          <div className="bg-card border border-border rounded-lg p-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Total Cost</p>
            <p className="text-lg font-bold data-value mt-1">{formatCurrency(stats.totalCost)}</p>
          </div>
          <div className="bg-card border border-border rounded-lg p-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Total Revenue</p>
            <p className="text-lg font-bold data-value mt-1 text-emerald-700">{formatCurrency(stats.totalRevenue)}</p>
          </div>
          <div className="bg-card border border-border rounded-lg p-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Overall Margin</p>
            <p className={`text-lg font-bold data-value mt-1 ${stats.overallMargin < 20 ? "text-red-700" : "text-emerald-700"}`}>
              {stats.overallMargin.toFixed(1)}%
            </p>
          </div>
          <div className="bg-card border border-red-200 rounded-lg p-4 cursor-pointer hover:bg-red-50/50 transition-colors" onClick={() => setMarginFilter("negative")}>
            <p className="text-[10px] uppercase tracking-wider text-red-700 font-semibold">Negative</p>
            <p className="text-lg font-bold text-red-700 mt-1">{stats.negative}</p>
          </div>
          <div className="bg-card border border-red-100 rounded-lg p-4 cursor-pointer hover:bg-red-50/30 transition-colors" onClick={() => setMarginFilter("low")}>
            <p className="text-[10px] uppercase tracking-wider text-red-600 font-semibold">Low (&lt;20%)</p>
            <p className="text-lg font-bold text-red-600 mt-1">{stats.low}</p>
          </div>
          <div className="bg-card border border-emerald-200 rounded-lg p-4 cursor-pointer hover:bg-emerald-50/30 transition-colors" onClick={() => setMarginFilter("high")}>
            <p className="text-[10px] uppercase tracking-wider text-emerald-700 font-semibold">High (&gt;50%)</p>
            <p className="text-lg font-bold text-emerald-700 mt-1">{stats.high}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex items-center gap-1.5">
          <Filter className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground font-medium">Margin:</span>
        </div>
        {[
          { value: "all", label: "All" },
          { value: "negative", label: "Negative" },
          { value: "low", label: "Low (<20%)" },
          { value: "healthy", label: "Healthy (20-50%)" },
          { value: "high", label: "High (>50%)" },
        ].map(f => (
          <button
            key={f.value}
            onClick={() => setMarginFilter(f.value)}
            className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
              marginFilter === f.value
                ? "bg-foreground text-background border-foreground"
                : "bg-card border-border text-foreground hover:bg-accent"
            }`}
          >
            {f.label}
          </button>
        ))}

        <div className="w-px h-5 bg-border mx-1" />

        <select
          value={serviceTypeFilter}
          onChange={e => setServiceTypeFilter(e.target.value)}
          className="px-2 py-1.5 text-xs border border-border rounded-md bg-card"
        >
          <option value="all">All Types</option>
          <option value="Internet">Internet</option>
          <option value="Mobile">Mobile</option>
          <option value="Voice">Voice</option>
        </select>

        <select
          value={providerFilter}
          onChange={e => setProviderFilter(e.target.value)}
          className="px-2 py-1.5 text-xs border border-border rounded-md bg-card"
        >
          <option value="all">All Providers</option>
          <option value="Telstra">Telstra</option>
          <option value="ABB">ABB</option>
        </select>
      </div>

      {/* Results count */}
      <p className="text-xs text-muted-foreground mb-3">
        Showing {sorted.length} services with matched revenue
      </p>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : sorted.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <DollarSign className="w-8 h-8 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No services with matched revenue found</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Service</th>
                  <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Customer</th>
                  <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Provider</th>
                  <th
                    className="text-right px-4 py-2.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold cursor-pointer hover:text-foreground"
                    onClick={() => toggleSort("cost")}
                  >
                    <span className="inline-flex items-center gap-1">
                      Cost <ArrowUpDown className="w-3 h-3" />
                    </span>
                  </th>
                  <th
                    className="text-right px-4 py-2.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold cursor-pointer hover:text-foreground"
                    onClick={() => toggleSort("revenue")}
                  >
                    <span className="inline-flex items-center gap-1">
                      Revenue <ArrowUpDown className="w-3 h-3" />
                    </span>
                  </th>
                  <th
                    className="text-right px-4 py-2.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold cursor-pointer hover:text-foreground"
                    onClick={() => toggleSort("margin")}
                  >
                    <span className="inline-flex items-center gap-1">
                      Margin <ArrowUpDown className="w-3 h-3" />
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((s: any) => {
                  const isNegative = (s.marginPercent ?? 0) < 0;
                  const isLow = (s.marginPercent ?? 0) >= 0 && (s.marginPercent ?? 0) < 20;
                  const rowBg = isNegative ? "bg-red-50/60" : isLow ? "bg-red-50/30" : "";
                  return (
                    <tr key={s.id} className={`border-b border-border/50 hover:bg-accent/30 transition-colors ${rowBg}`}>
                      <td className="px-4 py-3">
                        <Link href={`/services/${s.externalId}`} className="flex items-center gap-2 hover:text-primary transition-colors">
                          <ServiceTypeIcon type={s.serviceType} />
                          <div>
                            <p className="text-sm font-medium">{s.planName || s.serviceType}</p>
                            <p className="data-value text-[11px] text-muted-foreground">{s.phoneNumber || s.connectionId || s.serviceId}</p>
                          </div>
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        {s.customerExternalId ? (
                          <Link href={`/customers/${s.customerExternalId}`} className="text-sm hover:text-primary transition-colors">
                            {s.customerName || "Unknown"}
                          </Link>
                        ) : (
                          <span className="text-sm text-muted-foreground">Unmatched</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <ProviderBadge provider={s.provider} size="xs" />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="data-value text-sm">{formatCurrency(s.monthlyCost)}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="data-value text-sm text-emerald-700">{formatCurrency(s.monthlyRevenue)}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <MarginBadge margin={s.marginPercent} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
