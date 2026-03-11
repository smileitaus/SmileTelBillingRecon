/*
 * Billable / Service Unmatched — shows billing items that couldn't be matched
 * to a service, with workflow to prompt matching or termination of billing.
 * Groups by contact name, shows revenue at risk.
 */

import { Link } from "wouter";
import {
  AlertCircle,
  DollarSign,
  Loader2,
  Search,
  ArrowRight,
  FileWarning,
  Users,
  ChevronDown,
  ChevronRight,
  XCircle,
  Download,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { exportToCSV } from "@/lib/exportCsv";

function formatCurrency(val: number) {
  return `$${val.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    unmatched: "bg-amber-50 text-amber-700 border-amber-200",
    "customer-matched": "bg-blue-50 text-blue-700 border-blue-200",
    "service-matched": "bg-emerald-50 text-emerald-700 border-emerald-200",
    "service-unmatched": "bg-orange-50 text-orange-700 border-orange-200",
  };
  const labels: Record<string, string> = {
    unmatched: "Unmatched",
    "customer-matched": "Customer Only",
    "service-matched": "Fully Matched",
    "service-unmatched": "Needs Service Match",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-medium rounded-full border ${styles[status] || styles.unmatched}`}>
      {labels[status] || status}
    </span>
  );
}

function ContactGroup({
  contactName,
  items,
  onMatchToCustomer,
}: {
  contactName: string;
  items: any[];
  onMatchToCustomer: (billingItemId: number, customerExternalId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);

  const totalRevenue = items.reduce((s, i) => s + i.lineAmount, 0);
  const unmatchedCount = items.filter(i => i.matchStatus === "unmatched").length;

  const { data: searchResults } = trpc.billing.merge.search.useQuery(
    { search: searchQuery },
    { enabled: searchQuery.length >= 2 }
  );

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent/30 transition-colors text-left"
      >
        {expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{contactName}</p>
          <p className="text-xs text-muted-foreground">
            {items.length} billing item{items.length !== 1 ? "s" : ""} · {unmatchedCount} unmatched
          </p>
        </div>
        <span className="data-value text-sm font-medium text-amber-700">{formatCurrency(totalRevenue)}</span>
      </button>

      {expanded && (
        <div className="border-t border-border">
          {/* Quick match to customer */}
          <div className="px-4 py-3 bg-muted/20 border-b border-border">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">Match all to customer:</span>
              <button
                onClick={() => setShowSearch(!showSearch)}
                className="text-xs text-primary hover:text-primary/80 transition-colors"
              >
                {showSearch ? "Cancel" : "Search..."}
              </button>
            </div>
            {showSearch && (
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search customer name..."
                  className="w-full pl-8 pr-3 py-2 text-sm bg-background border border-border rounded-md outline-none focus:ring-1 focus:ring-primary/40"
                  autoFocus
                />
                {searchResults && searchResults.length > 0 && (
                  <div className="absolute z-10 top-full mt-1 w-full bg-card border border-border rounded-md shadow-lg max-h-48 overflow-y-auto">
                    {searchResults.map((c: any) => (
                      <button
                        key={c.externalId}
                        onClick={() => {
                          items.filter(i => i.matchStatus === "unmatched").forEach(i => {
                            onMatchToCustomer(i.id, c.externalId);
                          });
                          setShowSearch(false);
                          setSearchQuery("");
                          toast.success(`Matched ${unmatchedCount} items to ${c.name}`);
                        }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors flex items-center justify-between"
                      >
                        <span>{c.name}</span>
                        <span className="text-xs text-muted-foreground">{c.serviceCount} svc</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Individual items */}
          {items.map((item: any) => (
            <div key={item.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-border/50 last:border-0 hover:bg-accent/20 transition-colors">
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate">{item.description}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] text-muted-foreground data-value">{item.accountCode}</span>
                  <span className="text-[10px] text-muted-foreground">{item.category}</span>
                  <StatusBadge status={item.matchStatus} />
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="data-value text-sm">{formatCurrency(item.lineAmount)}</p>
                {item.taxAmount > 0 && (
                  <p className="text-[10px] text-muted-foreground">+{formatCurrency(item.taxAmount)} tax</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function BillingUnmatched() {
  const [statusFilter, setStatusFilter] = useState("unmatched");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const { data: items, isLoading } = trpc.billing.billingItems.list.useQuery({
    matchStatus: statusFilter,
    category: categoryFilter,
  });

  const { data: summary } = trpc.billing.billingItems.summary.useQuery();

  const assignToCustomer = trpc.billing.billingItems.assignToCustomer.useMutation();
  const utils = trpc.useUtils();

  const handleMatchToCustomer = async (billingItemId: number, customerExternalId: string) => {
    try {
      await assignToCustomer.mutateAsync({ billingItemId, customerExternalId });
      utils.billing.billingItems.list.invalidate();
      utils.billing.billingItems.summary.invalidate();
    } catch {
      toast.error("Failed to match billing item");
    }
  };

  // Group items by contact name
  const grouped = useMemo(() => {
    if (!items) return [];
    const map = new Map<string, any[]>();
    items.forEach((item: any) => {
      const key = item.contactName || "Unknown Contact";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    });
    return Array.from(map.entries())
      .map(([name, items]) => ({ name, items, total: items.reduce((s: number, i: any) => s + i.lineAmount, 0) }))
      .sort((a, b) => b.total - a.total);
  }, [items]);

  const totalUnmatchedRevenue = summary?.statusBreakdown?.find((s: any) => s.matchStatus === "unmatched")?.revenue ?? 0;

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Billing / Service Matching</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Feb 2026 Xero billing items — match to customers and services, or flag for billing termination
          </p>
        </div>
        <button
          onClick={() => exportToCSV(
            (items || []).map((item: any) => ({
              "Item ID": item.id,
              "Contact Name": item.contactName,
              "Description": item.description,
              "Amount": item.lineAmount,
              "Tax": item.taxAmount,
              "Account Code": item.accountCode,
              "Category": item.category,
              "Status": item.matchStatus,
              "Customer": item.customerName || "",
              "Service ID": item.serviceExternalId || "",
            })),
            "billing-items"
          )}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-card border border-border rounded-md hover:bg-muted transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          Export CSV
        </button>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
          <div className="bg-card border border-border rounded-lg p-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Total Items</p>
            <p className="text-lg font-bold mt-1">{summary.totalItems}</p>
            <p className="text-xs text-muted-foreground">{formatCurrency(summary.totalRevenue)} revenue</p>
          </div>
          {summary.statusBreakdown.map((s: any) => {
            const statusLabels: Record<string, string> = {
              unmatched: "Unmatched",
              "customer-matched": "Customer Only",
              "service-matched": "Fully Matched",
              "service-unmatched": "Needs Service Match",
            };
            return (
              <div
                key={s.matchStatus}
                className={`bg-card border rounded-lg p-4 cursor-pointer hover:bg-accent/30 transition-colors ${
                  statusFilter === s.matchStatus ? "border-primary" : "border-border"
                }`}
                onClick={() => setStatusFilter(s.matchStatus)}
              >
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                  {statusLabels[s.matchStatus] || s.matchStatus}
                </p>
                <p className="text-lg font-bold mt-1">{s.count}</p>
                <p className="text-xs text-muted-foreground">{formatCurrency(s.revenue)}</p>
              </div>
            );
          })}
        </div>
      )}

      {/* Revenue at risk banner */}
      {totalUnmatchedRevenue > 0 && statusFilter === "unmatched" && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 flex items-start gap-3">
          <FileWarning className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800">
              {formatCurrency(totalUnmatchedRevenue)} in unmatched billing revenue
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              These billing items from Xero couldn't be automatically matched to customers. Match them below or flag for billing review.
            </p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <span className="text-xs text-muted-foreground font-medium">Status:</span>
        {[
          { value: "all", label: "All" },
          { value: "unmatched", label: "Unmatched" },
          { value: "customer-matched", label: "Customer Only" },
          { value: "service-unmatched", label: "Needs Service Match" },
          { value: "service-matched", label: "Fully Matched" },
        ].map(s => (
          <button
            key={s.value}
            onClick={() => setStatusFilter(s.value)}
            className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
              statusFilter === s.value
                ? "bg-foreground text-background border-foreground"
                : "bg-card border-border text-foreground hover:bg-accent"
            }`}
          >
            {s.label}
          </button>
        ))}

        <div className="w-px h-5 bg-border mx-1" />

        <select
          value={categoryFilter}
          onChange={e => setCategoryFilter(e.target.value)}
          className="px-2 py-1.5 text-xs border border-border rounded-md bg-card"
        >
          <option value="all">All Categories</option>
          {summary?.categoryBreakdown?.map((c: any) => (
            <option key={c.category} value={c.category}>{c.category} ({c.count})</option>
          ))}
        </select>
      </div>

      {/* Results */}
      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : grouped.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <AlertCircle className="w-8 h-8 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No billing items match the current filters</p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {grouped.length} contact group{grouped.length !== 1 ? "s" : ""} · {items?.length ?? 0} items
          </p>
          {grouped.map(g => (
            <ContactGroup
              key={g.name}
              contactName={g.name}
              items={g.items}
              onMatchToCustomer={handleMatchToCustomer}
            />
          ))}
        </div>
      )}
    </div>
  );
}
