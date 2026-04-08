/*
 * Revenue & Margin Analysis — shows services with billing revenue matched,
 * cost vs revenue, margin %. Filterable by margin band. Debounced search.
 * Group by Customer toggle for aggregated view.
 *
 * Cost data comes from supplier invoices (ABB, Telstra, ChannelHaus, etc.).
 * When cost = $0, it means no supplier invoice has been matched yet (cost unknown).
 * Margin is only shown when BOTH cost and revenue are known.
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
  Download,
  Search,
  Users,
  List,
  ChevronDown,
  ChevronRight,
  HelpCircle,
  X,
  Package,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useState, useMemo, useCallback } from "react";
import { ProviderBadge } from "@/components/ProviderBadge";
import { exportToCSV } from "@/lib/exportCsv";
import { useDebounce } from "@/hooks/useDebounce";
import { KNOWN_SUPPLIERS, supplierLabel } from "@shared/suppliers";

function ServiceTypeIcon({ type }: { type: string }) {
  switch (type) {
    case "Internet": return <Wifi className="w-3.5 h-3.5" />;
    case "Mobile": return <Smartphone className="w-3.5 h-3.5" />;
    case "Voice": return <Phone className="w-3.5 h-3.5" />;
    default: return <Globe className="w-3.5 h-3.5" />;
  }
}

function MarginBadge({ margin }: { margin: number | null }) {
  if (margin === null) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full border bg-muted/50 text-muted-foreground border-border">
      <HelpCircle className="w-3 h-3" />
      Unknown
    </span>
  );

  // Colour scale:
  //   negative  = red (cost > revenue — losing money)
  //   0–20%     = amber/yellow (low but profitable)
  //   20–50%    = teal (healthy)
  //   50%+      = green (high margin)
  let bg = "bg-emerald-50 text-emerald-700 border-emerald-200";
  let icon = <TrendingUp className="w-3 h-3" />;

  if (margin < 0) {
    bg = "bg-red-100 text-red-800 border-red-300 font-bold";
    icon = <TrendingDown className="w-3 h-3" />;
  } else if (margin < 20) {
    // Low but positive — amber warning, not red
    bg = "bg-amber-50 text-amber-700 border-amber-200 font-semibold";
    icon = <AlertTriangle className="w-3 h-3" />;
  } else if (margin < 50) {
    bg = "bg-teal-50 text-teal-700 border-teal-200";
    icon = <TrendingUp className="w-3 h-3" />;
  }

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full border ${bg}`}>
      {icon}
      {margin.toFixed(1)}%
    </span>
  );
}

const CONFIRMED_ZERO_COST_SOURCES = [
  'sasboss_pricebook',
  'access4_diamond_pricebook_excel',
  'access4_diamond_pricebook',
  'retail_only_no_wholesale',
  'access4_invoice_corrected',
  'pricebook-derived',
  'product_map',
];

function CostCell({ cost, costSource }: { cost: number; costSource?: string }) {
  if (cost === 0) {
    // Confirmed zero-cost from a known pricebook source — show as $0.00, not Unknown
    if (costSource && CONFIRMED_ZERO_COST_SOURCES.includes(costSource)) {
      const sourceLabel =
        costSource === 'sasboss_pricebook' ? 'SasBoss pricebook' :
        costSource === 'retail_only_no_wholesale' ? 'retail-only product' :
        costSource === 'access4_diamond_pricebook_excel' ? 'Access4 pricebook' :
        costSource;
      return (
        <span className="data-value text-sm text-muted-foreground" title={`Confirmed $0.00 wholesale cost (${sourceLabel})`}>
          $0.00
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground italic">
        <HelpCircle className="w-3 h-3" />
        Unknown
      </span>
    );
  }
  return <span className="data-value text-sm">${cost.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>;
}

function formatCurrency(val: number) {
  return `$${val.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ── Group Detail Slide-out Panel ─────────────────────────────────────────────
function GroupDetailPanel({ groupId, onClose }: { groupId: string; onClose: () => void }) {
  const { data, isLoading } = trpc.billing.margin.groupDetail.useQuery({ groupId }, {
    enabled: !!groupId,
    staleTime: 30_000,
  });

  const typeLabel = data?.type === 'voice_pack' ? '📞 Voice Pack'
    : data?.type === 'data_bundle' ? '🌐 Data Bundle'
    : '📦 Service Bundle';

  const typeColour = data?.type === 'voice_pack'
    ? 'bg-blue-50 text-blue-700 border-blue-200'
    : data?.type === 'data_bundle'
    ? 'bg-teal-50 text-teal-700 border-teal-200'
    : 'bg-purple-50 text-purple-700 border-purple-200';

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" />
      {/* Panel */}
      <div
        className="relative z-10 w-full max-w-lg bg-card border-l border-border shadow-2xl flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-muted/30">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-muted-foreground" />
            <span className="font-semibold text-sm">Revenue Group Detail</span>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-accent transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : !data ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">Group not found</div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {/* Group summary */}
            <div className="px-5 py-4 border-b border-border space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full border ${typeColour}`}>
                  {typeLabel}
                </span>
                {data.isLoss && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full border bg-red-100 text-red-800 border-red-300 font-bold">
                    <TrendingDown className="w-3 h-3" /> Loss
                  </span>
                )}
              </div>
              <div>
                <p className="text-base font-semibold">{data.name}</p>
                <p className="text-xs text-muted-foreground">{data.customerName}</p>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-muted/40 rounded-lg p-3 text-center">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Revenue</p>
                  <p className="text-sm font-semibold text-emerald-700">{formatCurrency(data.totalRevenue)}</p>
                </div>
                <div className="bg-muted/40 rounded-lg p-3 text-center">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Total Cost</p>
                  <p className={`text-sm font-semibold ${data.isLoss ? 'text-red-700' : 'text-foreground'}`}>
                    {formatCurrency(data.totalCost)}
                  </p>
                </div>
                <div className="bg-muted/40 rounded-lg p-3 text-center">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Margin</p>
                  {data.groupMargin !== null ? (
                    <p className={`text-sm font-bold ${
                      data.groupMargin < 0 ? 'text-red-700' :
                      data.groupMargin < 20 ? 'text-amber-700' :
                      data.groupMargin < 50 ? 'text-teal-700' : 'text-emerald-700'
                    }`}>
                      {data.groupMargin.toFixed(1)}%
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">—</p>
                  )}
                </div>
              </div>
            </div>

            {/* Component services */}
            <div className="px-5 py-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-3">
                {data.services.length} Component Service{data.services.length !== 1 ? 's' : ''}
              </p>
              <div className="space-y-2">
                {data.services.map((s: any) => {
                  const cost = parseFloat(s.monthlyCost || '0');
                  const isConfirmedZero = cost === 0 && s.costSource && [
                    'sasboss_pricebook','access4_diamond_pricebook_excel',
                    'retail_only_no_wholesale','access4_diamond_pricebook',
                  ].includes(s.costSource);
                  return (
                    <div key={s.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                      <div className="flex items-center gap-2 min-w-0">
                        <ServiceTypeIcon type={s.serviceType} />
                        <div className="min-w-0">
                          <Link href={`/services/${s.externalId}`} onClick={onClose}
                            className="text-xs font-medium hover:text-primary transition-colors truncate block">
                            {s.planName || s.serviceType}
                          </Link>
                          <p className="text-[10px] text-muted-foreground">
                            {s.phoneNumber || s.connectionId || s.externalId}
                          </p>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 ml-3">
                        {isConfirmedZero ? (
                          <span className="text-xs text-muted-foreground">$0.00</span>
                        ) : cost > 0 ? (
                          <span className="text-xs font-medium">{formatCurrency(cost)}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">Unknown</span>
                        )}
                        <p className="text-[10px] text-muted-foreground">cost/mo</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Grouped by Customer Row ──────────────────────────────────────────────────
function CustomerGroupRow({ group }: { group: any }) {
  const [expanded, setExpanded] = useState(false);
  const isNegative = group.marginPercent !== null && group.marginPercent < 0;
  const isLow = group.marginPercent !== null && group.marginPercent >= 0 && group.marginPercent < 20;
  // Only red background for genuinely negative margins; amber tint for low-but-positive
  const rowBg = isNegative ? "bg-red-50/60" : isLow ? "bg-amber-50/20" : "";

  return (
    <>
      <tr
        className={`border-b border-border/50 cursor-pointer hover:bg-accent/30 transition-colors ${rowBg}`}
        onClick={() => setExpanded(e => !e)}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            {expanded ? (
              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            )}
            {group.customerExternalId !== '__unmatched__' ? (
              <Link
                href={`/customers/${group.customerExternalId}`}
                className="text-sm font-semibold hover:text-primary transition-colors"
                onClick={e => e.stopPropagation()}
              >
                {group.customerName}
              </Link>
            ) : (
              <span className="text-sm font-semibold text-muted-foreground">Unmatched</span>
            )}
            <span className="text-[11px] text-muted-foreground ml-1">
              {group.serviceCount} service{group.serviceCount !== 1 ? 's' : ''}
            </span>
          </div>
        </td>
        <td className="px-4 py-3 text-right">
          <CostCell cost={group.totalCost} />
        </td>
        <td className="px-4 py-3 text-right">
          <span className="data-value text-sm text-emerald-700">{formatCurrency(group.totalRevenue)}</span>
        </td>
        <td className="px-4 py-3 text-right">
          <MarginBadge margin={group.marginPercent} />
        </td>
      </tr>
      {expanded && group.services.map((s: any) => {
        const sNeg = s.marginPercent !== null && s.marginPercent < 0;
        const sLow = s.marginPercent !== null && s.marginPercent >= 0 && s.marginPercent < 20;
        const sBg = sNeg ? "bg-red-50/40" : sLow ? "bg-amber-50/20" : "bg-muted/20";
        return (
          <tr key={s.id} className={`border-b border-border/30 ${sBg}`}>
            <td className="pl-10 pr-4 py-2.5">
              <Link href={`/services/${s.externalId}`} className="flex items-center gap-2 hover:text-primary transition-colors">
                <ServiceTypeIcon type={s.serviceType} />
                <div>
                  <p className="text-xs font-medium">{s.planName || s.serviceType}</p>
                  <p className="data-value text-[10px] text-muted-foreground">{s.phoneNumber || s.connectionId || s.externalId}</p>
                </div>
                <ProviderBadge provider={s.provider} size="xs" />
              </Link>
            </td>
            <td className="px-4 py-2.5 text-right">
              <CostCell cost={s.monthlyCost} costSource={s.costSource} />
            </td>
            <td className="px-4 py-2.5 text-right">
              <span className="data-value text-xs text-emerald-700">{formatCurrency(s.monthlyRevenue)}</span>
            </td>
            <td className="px-4 py-2.5 text-right">
              <MarginBadge margin={s.marginPercent} />
            </td>
          </tr>
        );
      })}
    </>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function RevenueMargin() {
  const [marginFilter, setMarginFilter] = useState("all");
  const [serviceTypeFilter, setServiceTypeFilter] = useState("all");
  const [providerFilter, setProviderFilter] = useState("all");
  const [costReviewNeeded, setCostReviewNeeded] = useState(false);
  const [sortField, setSortField] = useState<"margin" | "revenue" | "cost">("margin");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [searchInput, setSearchInput] = useState("");
  const [groupByCustomer, setGroupByCustomer] = useState(false);
  const [customerTypeFilter, setCustomerTypeFilter] = useState("all");
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const openGroup = useCallback((groupId: string) => setSelectedGroupId(groupId), []);
  const closeGroup = useCallback(() => setSelectedGroupId(null), []);

  // Debounce search — only fires query after 350ms of inactivity
  const search = useDebounce(searchInput, 350);

  const queryInput = {
    marginFilter,
    serviceType: serviceTypeFilter,
    provider: providerFilter,
    search: search || undefined,
    costReviewNeeded: costReviewNeeded || undefined,
    customerType: customerTypeFilter !== 'all' ? customerTypeFilter : undefined,
  };

  const { data: listData, isLoading: listLoading } = trpc.billing.margin.list.useQuery(queryInput, {
    enabled: !groupByCustomer,
    refetchOnWindowFocus: true,
    staleTime: 0,
    refetchInterval: 30_000,
  });

  // Unwrap the new { services, latestBillingPeriod } envelope
  const services = listData?.services;
  const latestBillingPeriod = listData?.latestBillingPeriod ?? null;

  const { data: grouped, isLoading: groupedLoading } = trpc.billing.margin.grouped.useQuery(
    { marginFilter, serviceType: serviceTypeFilter, provider: providerFilter, search: search || undefined, customerType: customerTypeFilter !== 'all' ? customerTypeFilter : undefined },
    { enabled: groupByCustomer, refetchOnWindowFocus: true, staleTime: 0, refetchInterval: 30_000 }
  );

  const isLoading = groupByCustomer ? groupedLoading : listLoading;

  const sorted = useMemo(() => {
    if (!services) return [];
    return [...services].sort((a, b) => {
      if (sortField === "margin") {
        // Nulls (unknown cost) go to the end regardless of sort direction
        if (a.marginPercent === null && b.marginPercent === null) return 0;
        if (a.marginPercent === null) return 1;
        if (b.marginPercent === null) return -1;
        return sortDir === "asc" ? a.marginPercent - b.marginPercent : b.marginPercent - a.marginPercent;
      } else if (sortField === "revenue") {
        return sortDir === "asc" ? a.monthlyRevenue - b.monthlyRevenue : b.monthlyRevenue - a.monthlyRevenue;
      } else {
        // cost sort: unknown ($0) goes to end
        if (a.monthlyCost === 0 && b.monthlyCost === 0) return 0;
        if (a.monthlyCost === 0) return 1;
        if (b.monthlyCost === 0) return -1;
        return sortDir === "asc" ? a.monthlyCost - b.monthlyCost : b.monthlyCost - a.monthlyCost;
      }
    });
  }, [services, sortField, sortDir]);

  // Stats always computed from the flat list (even in grouped mode)
  const stats = useMemo(() => {
    const src = services;
    if (!src || src.length === 0) return null;
    const knownCostServices = src.filter(s => s.monthlyCost > 0);
    const totalKnownCost = knownCostServices.reduce((s, v) => s + v.monthlyCost, 0);
    const totalRevenue = src.reduce((s, v) => s + v.monthlyRevenue, 0);
    // Revenue for services where cost is also known (for fair margin calculation)
    const revenueWhereKnown = knownCostServices.reduce((s, v) => s + v.monthlyRevenue, 0);
    const withKnownCost = knownCostServices.length;
    const withUnknownCost = src.filter(s => s.monthlyCost === 0).length;
    const negative = src.filter(s => s.marginPercent !== null && s.marginPercent < 0).length;
    const low = src.filter(s => s.marginPercent !== null && s.marginPercent >= 0 && s.marginPercent < 20).length;
    const healthy = src.filter(s => s.marginPercent !== null && s.marginPercent >= 20 && s.marginPercent < 50).length;
    const high = src.filter(s => s.marginPercent !== null && s.marginPercent >= 50).length;
    const unknownMargin = src.filter(s => s.marginPercent === null).length;
    // Overall margin only computed from services where BOTH cost and revenue are known
    const overallMargin = totalKnownCost > 0 && revenueWhereKnown > 0
      ? ((revenueWhereKnown - totalKnownCost) / revenueWhereKnown * 100)
      : null;
    return { totalKnownCost, totalRevenue, withKnownCost, withUnknownCost, negative, low, healthy, high, unknownMargin, overallMargin, total: src.length };
  }, [services]);

  const toggleSort = (field: "margin" | "revenue" | "cost") => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir(field === "margin" ? "asc" : "desc"); }
  };

  const displayCount = groupByCustomer ? (grouped?.length ?? 0) : sorted.length;

  return (
    <>
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Revenue & Margin Analysis</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Feb 2026 Xero billing matched to supplier costs — filter by margin to find underperforming services.
            Costs come from supplier invoices; services without a matched supplier invoice show cost as "Unknown".
          </p>
        </div>
        <button
          onClick={() => setCustomerTypeFilter(customerTypeFilter === 'retail_offering' ? 'all' : 'retail_offering')}
          className={`shrink-0 flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md border transition-colors ${
            customerTypeFilter === 'retail_offering'
              ? 'bg-teal-500/20 text-teal-400 border-teal-500/40 hover:bg-teal-500/30'
              : 'bg-card text-muted-foreground border-border hover:text-foreground hover:border-teal-500/40'
          }`}
        >
          <span className="text-xs">✦</span>
          Retail Bundles
        </button>
      </div>

      {/* Summary Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
          {/* Reusable footer snippet */}
          {([
            {
              label: "Known Cost (ex GST)",
              value: <p className="text-lg font-bold data-value mt-1">{formatCurrency(stats.totalKnownCost)}</p>,
              sub: <p className="text-[10px] text-muted-foreground mt-0.5">{stats.withKnownCost} services</p>,
              cls: "border-border",
            },
            {
              label: "Total Revenue (ex GST)",
              value: <p className="text-lg font-bold data-value mt-1 text-emerald-700">{formatCurrency(stats.totalRevenue)}</p>,
              sub: <p className="text-[10px] text-muted-foreground mt-0.5">{stats.total} services</p>,
              cls: "border-border",
            },
            {
              label: "Overall Margin",
              value: stats.overallMargin !== null
                ? <p className={`text-lg font-bold data-value mt-1 ${stats.overallMargin < 20 ? "text-red-700" : "text-emerald-700"}`}>{stats.overallMargin.toFixed(1)}%</p>
                : <p className="text-lg font-bold text-muted-foreground mt-1">—</p>,
              sub: <p className="text-[10px] text-muted-foreground mt-0.5">where cost known</p>,
              cls: "border-border",
              onClick: undefined,
            },
            {
              label: "Cost Unknown",
              value: <p className="text-lg font-bold text-muted-foreground mt-1">{stats.withUnknownCost}</p>,
              sub: null,
              cls: "border-muted cursor-pointer hover:bg-muted/30 transition-colors",
              onClick: () => { setMarginFilter("all"); setCostReviewNeeded(false); setGroupByCustomer(false); },
            },
            {
              label: "Negative",
              labelCls: "text-red-700",
              value: <p className="text-lg font-bold text-red-700 mt-1">{stats.negative}</p>,
              sub: null,
              cls: "border-red-200 cursor-pointer hover:bg-red-50/50 transition-colors",
              onClick: () => { setMarginFilter("negative"); setGroupByCustomer(false); },
            },
            {
              label: "Low (<20%)",
              labelCls: "text-red-600",
              value: <p className="text-lg font-bold text-red-600 mt-1">{stats.low}</p>,
              sub: null,
              cls: "border-red-100 cursor-pointer hover:bg-red-50/30 transition-colors",
              onClick: () => { setMarginFilter("low"); setGroupByCustomer(false); },
            },
            {
              label: "High (>50%)",
              labelCls: "text-emerald-700",
              value: <p className="text-lg font-bold text-emerald-700 mt-1">{stats.high}</p>,
              sub: null,
              cls: "border-emerald-200 cursor-pointer hover:bg-emerald-50/30 transition-colors",
              onClick: () => { setMarginFilter("high"); setGroupByCustomer(false); },
            },
          ] as Array<{ label: string; labelCls?: string; value: React.ReactNode; sub: React.ReactNode | null; cls: string; onClick?: () => void }>).map((card) => (
            <div
              key={card.label}
              className={`bg-card border ${card.cls} rounded-lg p-4 flex flex-col`}
              onClick={card.onClick}
            >
              <p className={`text-[10px] uppercase tracking-wider font-semibold ${card.labelCls ?? "text-muted-foreground"}`}>{card.label}</p>
              {card.value}
              {card.sub}
              {latestBillingPeriod && (
                <p className="text-[10px] text-muted-foreground/60 mt-auto pt-2 border-t border-border/40">
                  Data as of {latestBillingPeriod}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Search bar */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          placeholder="Search by customer, plan, phone, address…"
          className="w-full pl-9 pr-4 py-2 text-sm bg-card border border-border rounded-md outline-none focus:ring-2 focus:ring-ring transition-all placeholder:text-muted-foreground/60"
        />
        {searchInput && (
          <button
            onClick={() => setSearchInput("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs"
          >
            ✕
          </button>
        )}
      </div>

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
          {KNOWN_SUPPLIERS.map((s) => (
            <option key={s} value={s}>{supplierLabel(s)}</option>
          ))}
        </select>

        <div className="w-px h-5 bg-border mx-1" />

        <button
          onClick={() => setCostReviewNeeded(v => !v)}
          className={`px-3 py-1.5 text-xs rounded-md border transition-colors flex items-center gap-1.5 ${
            costReviewNeeded
              ? "bg-amber-500 text-white border-amber-500 font-semibold"
              : "bg-card border-amber-300 text-amber-700 hover:bg-amber-50"
          }`}
        >
          <AlertTriangle className="w-3 h-3" />
          Cost Review Needed
        </button>

        <div className="w-px h-5 bg-border mx-1" />

        {/* Group by Customer toggle */}
        <button
          onClick={() => setGroupByCustomer(v => !v)}
          className={`px-3 py-1.5 text-xs rounded-md border transition-colors flex items-center gap-1.5 ${
            groupByCustomer
              ? "bg-primary text-primary-foreground border-primary font-semibold"
              : "bg-card border-border text-foreground hover:bg-accent"
          }`}
        >
          {groupByCustomer ? <Users className="w-3 h-3" /> : <List className="w-3 h-3" />}
          {groupByCustomer ? "Grouped by Customer" : "Group by Customer"}
        </button>
      </div>

      {/* Results count + export */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-muted-foreground">
          {isLoading
            ? "Loading…"
            : groupByCustomer
              ? `Showing ${displayCount} customer${displayCount !== 1 ? 's' : ''} (${services?.length ?? 0} services)`
              : costReviewNeeded
                ? `Showing ${sorted.length} services flagged for cost review`
                : `Showing ${sorted.length} service${sorted.length !== 1 ? 's' : ''} with matched revenue — grows as more services are matched`
          }
        </p>
        <button
          onClick={() => {
            if (groupByCustomer && grouped) {
              exportToCSV(
                grouped.flatMap((g: any) => g.services.map((s: any) => ({
                  "Customer": g.customerName,
                  "Service ID": s.externalId,
                  "Service Type": s.serviceType,
                  "Provider": s.provider,
                  "Plan": s.planName,
                  "Monthly Cost": s.monthlyCost > 0 ? s.monthlyCost : "Unknown",
                  "Monthly Revenue": s.monthlyRevenue,
                  "Margin %": s.marginPercent !== null ? s.marginPercent.toFixed(1) : "Unknown",
                }))),
                "revenue-margin-grouped"
              );
            } else {
              exportToCSV(
                sorted.map((s: any) => ({
                  "Service ID": s.externalId,
                  "Customer": s.customerName || "",
                  "Service Type": s.serviceType,
                  "Provider": s.provider,
                  "Plan": s.planName,
                  "Monthly Cost": s.monthlyCost > 0 ? s.monthlyCost : "Unknown",
                  "Monthly Revenue": s.monthlyRevenue,
                  "Margin %": s.marginPercent !== null ? s.marginPercent.toFixed(1) : "Unknown",
                })),
                "revenue-margin"
              );
            }
          }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-card border border-border rounded-md hover:bg-muted transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          Export CSV
        </button>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : groupByCustomer ? (
        /* ── Grouped by Customer view ── */
        (grouped?.length ?? 0) === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Users className="w-8 h-8 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No customers found</p>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Customer</th>
                    <th className="text-right px-4 py-2.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Total Cost (ex GST)</th>
                    <th className="text-right px-4 py-2.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Total Revenue (ex GST)</th>
                    <th className="text-right px-4 py-2.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {grouped!.map((group: any) => (
                    <CustomerGroupRow key={group.customerExternalId} group={group} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : (
        /* ── Flat service list view ── */
        sorted.length === 0 ? (
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
                        Cost (ex GST) <ArrowUpDown className="w-3 h-3" />
                      </span>
                    </th>
                    <th
                      className="text-right px-4 py-2.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold cursor-pointer hover:text-foreground"
                      onClick={() => toggleSort("revenue")}
                    >
                      <span className="inline-flex items-center gap-1">
                        Revenue (ex GST) <ArrowUpDown className="w-3 h-3" />
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
                    const isNegative = s.marginPercent !== null && s.marginPercent < 0;
                    const isLow = s.marginPercent !== null && s.marginPercent >= 0 && s.marginPercent < 20;
                    const rowBg = isNegative ? "bg-red-50/60" : isLow ? "bg-red-50/30" : "";
                    return (
                      <tr key={s.id} className={`border-b border-border/50 hover:bg-accent/30 transition-colors ${rowBg}`}>
                        <td className="px-4 py-3">
                          <Link href={`/services/${s.externalId}`} className="flex items-center gap-2 hover:text-primary transition-colors">
                            <ServiceTypeIcon type={s.serviceType} />
                            <div>
                              <p className="text-sm font-medium">{s.planName || s.serviceType}</p>
                              <p className="data-value text-[11px] text-muted-foreground">{s.phoneNumber || s.connectionId || s.externalId}</p>
                              {s.discoveryNotes?.includes('COST REVIEW NEEDED') && (
                                <span className="inline-flex items-center gap-0.5 mt-0.5 px-1.5 py-0.5 text-[10px] rounded bg-amber-100 text-amber-700 border border-amber-200">
                                  <AlertTriangle className="w-2.5 h-2.5" />
                                  Cost Review Needed
                                </span>
                              )}
                              {s.monthlyCost === 0 && s.costSource === 'sasboss_pricebook' && (
                                <span className="inline-flex items-center gap-0.5 mt-0.5 px-1.5 py-0.5 text-[10px] rounded bg-violet-50 text-violet-700 border border-violet-200" title="Confirmed $0.00 wholesale cost from SasBoss pricebook">
                                  $0 (SasBoss Pricebook)
                                </span>
                              )}
                              {s.monthlyCost === 0 && s.costSource === 'retail_only_no_wholesale' && (
                                <span className="inline-flex items-center gap-0.5 mt-0.5 px-1.5 py-0.5 text-[10px] rounded bg-violet-50 text-violet-700 border border-violet-200" title="Retail-only product — no wholesale cost">
                                  $0 (Retail Only)
                                </span>
                              )}
                              {s.revenueGroupId && s.groupName && (() => {
                                const grpRevenue = parseFloat(s.groupTotalRevenue || '0');
                                const grpCost = parseFloat(s.groupTotalCost || '0');
                                const isGroupLoss = grpCost > grpRevenue && grpRevenue > 0;
                                const badgeColour = isGroupLoss
                                  ? 'bg-red-50 text-red-700 border-red-300 hover:bg-red-100'
                                  : s.groupType === 'data_bundle'
                                  ? 'bg-teal-50 text-teal-700 border-teal-200 hover:bg-teal-100'
                                  : 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100';
                                return (
                                  <button
                                    type="button"
                                    onClick={e => { e.preventDefault(); e.stopPropagation(); openGroup(s.revenueGroupId); }}
                                    className={`inline-flex items-center gap-0.5 mt-0.5 px-1.5 py-0.5 text-[10px] rounded border cursor-pointer transition-colors ${badgeColour}`}
                                    title={`Click to view group detail. Revenue billed as "${s.groupName}". Group total: ${formatCurrency(grpRevenue)}.${isGroupLoss ? ' ⚠ Group is at a loss.' : ''}`}
                                  >
                                    {isGroupLoss && <TrendingDown className="w-2.5 h-2.5" />}
                                    {s.groupType === 'voice_pack' ? '📞' : s.groupType === 'data_bundle' ? '🌐' : '📦'} {s.groupName}
                                    {isGroupLoss && <span className="font-bold ml-0.5">LOSS</span>}
                                  </button>
                                );
                              })()}
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
                          <CostCell cost={s.monthlyCost} costSource={s.costSource} />
                        </td>
                        <td className="px-4 py-3 text-right">
                          {s.revenueGroupId && s.groupTotalRevenue ? (
                            <div className="text-right">
                              <span className="data-value text-sm text-emerald-700">{formatCurrency(parseFloat(s.groupTotalRevenue))}</span>
                              <p className="text-[10px] text-muted-foreground mt-0.5">group total</p>
                            </div>
                          ) : (
                            <span className="data-value text-sm text-emerald-700">{formatCurrency(s.monthlyRevenue)}</span>
                          )}
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
        )
      )}
    </div>

    {/* Group Detail Slide-out Panel */}
    {selectedGroupId && (
      <GroupDetailPanel groupId={selectedGroupId} onClose={closeGroup} />
    )}
    </>
  );
}
