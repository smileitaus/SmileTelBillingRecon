/*
 * Swiss Data Design — Customer List View (Landing Page)
 * Dense data table with search bar and filter dropdowns
 * Status pills with dot indicators, monospaced financial data
 */

import { Link } from "wouter";
import { Search, Filter, ChevronRight, ArrowUpDown } from "lucide-react";
import { useCustomerSearch } from "@/hooks/useData";
import { useState, useMemo } from "react";
import type { Customer } from "@/lib/types";

type SortKey = "name" | "serviceCount" | "monthlyCost" | "unmatchedCount";
type SortDir = "asc" | "desc";

function StatusPill({ status }: { status: string }) {
  const cls =
    status === "active"
      ? "status-active"
      : status === "partial"
        ? "status-unmatched"
        : status === "review"
          ? "status-review"
          : "status-flagged";
  const label =
    status === "active"
      ? "Matched"
      : status === "partial"
        ? "Partial"
        : status === "review"
          ? "Review"
          : "Flagged";
  return <span className={cls}>{label}</span>;
}

export default function CustomerList() {
  const {
    query,
    setQuery,
    statusFilter,
    setStatusFilter,
    platformFilter,
    setPlatformFilter,
    filtered,
    totalActive,
  } = useCustomerSearch();

  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") cmp = a.name.localeCompare(b.name);
      else if (sortKey === "serviceCount") cmp = a.serviceCount - b.serviceCount;
      else if (sortKey === "monthlyCost") cmp = a.monthlyCost - b.monthlyCost;
      else if (sortKey === "unmatchedCount") cmp = a.unmatchedCount - b.unmatchedCount;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const SortHeader = ({ label, field }: { label: string; field: SortKey }) => (
    <button
      onClick={() => toggleSort(field)}
      className="flex items-center gap-1 hover:text-foreground transition-colors"
    >
      {label}
      <ArrowUpDown className={`w-3 h-3 ${sortKey === field ? "opacity-100" : "opacity-30"}`} />
    </button>
  );

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold tracking-tight">Customers</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {totalActive} customers with active Telstra services
        </p>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="relative flex-1 min-w-[280px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, phone, AVC ID..."
            className="w-full pl-9 pr-4 py-2 text-sm bg-card border border-border rounded-md outline-none focus:ring-2 focus:ring-ring/20 transition-shadow"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-muted-foreground" />

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-sm bg-card border border-border rounded-md px-3 py-2 outline-none focus:ring-2 focus:ring-ring/20"
          >
            <option value="all">All Status</option>
            <option value="active">Matched</option>
            <option value="partial">Partial</option>
            <option value="review">Review</option>
          </select>

          <select
            value={platformFilter}
            onChange={(e) => setPlatformFilter(e.target.value)}
            className="text-sm bg-card border border-border rounded-md px-3 py-2 outline-none focus:ring-2 focus:ring-ring/20"
          >
            <option value="all">All Platforms</option>
            <option value="Datagate">Datagate</option>
            <option value="Sasboss">Sasboss</option>
            <option value="Onebill">Onebill</option>
            <option value="ECN">ECN</option>
            <option value="Halo">Halo</option>
          </select>
        </div>
      </div>

      {/* Results count */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-muted-foreground">
          Showing {sorted.length} of {totalActive} customers
        </p>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wider">
              <th className="text-left px-4 py-3 font-semibold">
                <SortHeader label="Customer" field="name" />
              </th>
              <th className="text-left px-4 py-3 font-semibold hidden md:table-cell">
                Platform
              </th>
              <th className="text-right px-4 py-3 font-semibold">
                <SortHeader label="Services" field="serviceCount" />
              </th>
              <th className="text-right px-4 py-3 font-semibold hidden sm:table-cell">
                <SortHeader label="Monthly Cost" field="monthlyCost" />
              </th>
              <th className="text-right px-4 py-3 font-semibold hidden lg:table-cell">
                <SortHeader label="Unmatched" field="unmatchedCount" />
              </th>
              <th className="text-center px-4 py-3 font-semibold">Status</th>
              <th className="w-10 px-2 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((customer: Customer) => (
              <Link key={customer.id} href={`/customers/${customer.id}`} asChild>
                <tr className="border-b border-border/50 last:border-0 hover:bg-accent/50 transition-colors cursor-pointer group">
                  <td className="px-4 py-3">
                    <span className="text-sm font-medium">{customer.name}</span>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {customer.billingPlatforms.map((p) => (
                        <span
                          key={p}
                          className="text-[10px] px-1.5 py-0.5 bg-muted rounded font-medium text-muted-foreground"
                        >
                          {p}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="data-value">{customer.serviceCount}</span>
                  </td>
                  <td className="px-4 py-3 text-right hidden sm:table-cell">
                    <span className="data-value">
                      ${customer.monthlyCost.toLocaleString("en-AU", { minimumFractionDigits: 2 })}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right hidden lg:table-cell">
                    <span className={`data-value ${customer.unmatchedCount > 0 ? "text-amber" : "text-muted-foreground"}`}>
                      {customer.unmatchedCount}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <StatusPill status={customer.status} />
                  </td>
                  <td className="px-2 py-3">
                    <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </td>
                </tr>
              </Link>
            ))}
          </tbody>
        </table>

        {sorted.length === 0 && (
          <div className="px-4 py-12 text-center text-sm text-muted-foreground">
            No customers match your search criteria
          </div>
        )}
      </div>
    </div>
  );
}
