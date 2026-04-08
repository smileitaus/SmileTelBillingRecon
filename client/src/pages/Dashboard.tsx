/*
 * Swiss Data Design — Dashboard Overview
 * Summary stat cards, service type breakdown, provider breakdown, supplier account table
 * Minimal, data-dense, no decorative elements
 */

import { Link } from "wouter";
import {
  Users,
  Wifi,
  DollarSign,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
  FileText,
  Building2,
  Loader2,
  LinkIcon,
  Flag,
  ZapOff,
  RefreshCw,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useSummary, useSupplierAccounts, useCustomerSearch } from "@/hooks/useData";
import { ProviderBadge, PROVIDER_COLORS } from "@/components/ProviderBadge";

function StatCard({
  label,
  value,
  icon: Icon,
  subtext,
  accent,
  billingPeriod,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  subtext?: string;
  accent?: "teal" | "amber" | "rose" | "gray" | "orange";
  billingPeriod?: string | null;
}) {
  const accentColor =
    accent === "teal"
      ? "text-teal"
      : accent === "amber"
        ? "text-amber"
        : accent === "rose"
          ? "text-rose"
            : accent === "gray"
              ? "text-gray-500"
              : accent === "orange"
                ? "text-orange-600"
                : "text-foreground";

  return (
    <div className="bg-card border border-border rounded-lg px-5 py-4 flex flex-col" style={{ minHeight: "110px" }}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
          {label}
        </span>
        <Icon className="w-4 h-4 text-muted-foreground" />
      </div>
      <p className={`text-2xl font-bold data-value ${accentColor}`}>{value}</p>
      {subtext && (
        <p className="text-xs text-muted-foreground mt-1">{subtext}</p>
      )}
      {billingPeriod && (
        <p className="text-[10px] text-muted-foreground/60 mt-auto pt-2 border-t border-border/40">
          Data as of {billingPeriod}
        </p>
      )}
    </div>
  );
}

function ServiceTypeBar({
  label,
  count,
  total,
  color,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="flex items-center gap-3 py-2">
      <span className="text-sm w-20 shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="data-value text-sm text-muted-foreground w-12 text-right">{count}</span>
    </div>
  );
}

function ProviderBar({
  provider,
  count,
  cost,
  maxCost,
  color,
}: {
  provider: string;
  count: number;
  cost: number;
  maxCost: number;  // largest cost value in the list, used to scale bars
  color: string;
}) {
  // Bar width is proportional to absolute cost value; negative costs get 0 width
  const pct = maxCost > 0 ? (Math.max(0, cost) / maxCost) * 100 : 0;
  const costDisplay = cost < 0
    ? `-$${Math.abs(cost).toLocaleString("en-AU", { minimumFractionDigits: 2 })}`
    : `$${cost.toLocaleString("en-AU", { minimumFractionDigits: 2 })}`;
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="w-24 shrink-0">
        <ProviderBadge provider={provider} size="sm" />
      </div>
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="data-value text-sm text-muted-foreground w-12 text-right">{count}</span>
      <span className={`data-value text-xs w-24 text-right ${cost < 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
        {costDisplay}
      </span>
    </div>
  );
}

export default function Dashboard() {
  const { summary, isLoading: summaryLoading, dataUpdatedAt, refetch } = useSummary();
  const { supplierAccounts, isLoading: accountsLoading } = useSupplierAccounts();
  const { filtered: customers } = useCustomerSearch();

  // Live "last updated" label — recalculates every 15s so it stays accurate
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 15_000);
    return () => clearInterval(id);
  }, []);

  const lastUpdatedLabel = dataUpdatedAt
    ? (() => {
        const diffMs = Date.now() - dataUpdatedAt;
        if (diffMs < 10_000) return "just now";
        if (diffMs < 60_000) return `${Math.floor(diffMs / 1000)}s ago`;
        if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
        return new Date(dataUpdatedAt).toLocaleTimeString();
      })()
    : null;

  if (summaryLoading || !summary) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const topCustomers = [...customers]
    .sort((a, b) => b.monthlyCost - a.monthlyCost)
    .slice(0, 8);

  const matchPct =
    summary.totalServices > 0
      ? Math.round((summary.matchedServices / summary.totalServices) * 100)
      : 0;

  const servicesByType = summary.servicesByType as Record<string, number>;
  const servicesByProvider = (summary.servicesByProvider || {}) as Record<string, { count: number; cost: number }>;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Multi-supplier billing reconciliation overview
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0 mt-0.5">
          {lastUpdatedLabel && (
            <span className="text-xs text-muted-foreground">
              Updated {lastUpdatedLabel}
            </span>
          )}
          <button
            onClick={() => refetch()}
            disabled={summaryLoading}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-md px-2.5 py-1.5 transition-colors disabled:opacity-50"
            title="Refresh dashboard data"
          >
            <RefreshCw className={`w-3 h-3 ${summaryLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid gap-3 mb-8" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(180px, 100%), 1fr))" }}>
        <StatCard
          label="Total Services"
          value={summary.totalServices}
          icon={Wifi}
          subtext={`Across ${summary.totalLocations} locations`}
          billingPeriod={(summary as any).latestBillingPeriod}
        />
        <StatCard
          label="Monthly Spend (ex GST)"
          value={`$${Number(summary.totalMonthlyCost).toLocaleString("en-AU", { minimumFractionDigits: 2 })}`}
          icon={DollarSign}
          subtext="Supplier cost, ex GST"
          billingPeriod={(summary as any).latestBillingPeriod}
        />
        <StatCard
          label="Matched"
          value={`${summary.matchedServices} (${matchPct}%)`}
          icon={CheckCircle2}
          subtext="Linked to a customer"
          accent="teal"
          billingPeriod={(summary as any).latestBillingPeriod}
        />
        <StatCard
          label="Unmatched"
          value={summary.unmatchedServices}
          icon={AlertTriangle}
          subtext="Require review"
          accent="amber"
          billingPeriod={(summary as any).latestBillingPeriod}
        />
        <StatCard
          label="Flagged"
          value={summary.flaggedServices ?? 0}
          icon={Flag}
          subtext="For termination"
          accent={(summary.flaggedServices ?? 0) > 0 ? "rose" : "gray"}
          billingPeriod={(summary as any).latestBillingPeriod}
        />
        <StatCard
          label="AVC Coverage"
          value={`${summary.servicesWithAvc ?? 0} / ${summary.totalServices}`}
          icon={LinkIcon}
          subtext={`${summary.servicesMissingAvc ?? 0} missing AVC ID`}
          accent={((summary.servicesMissingAvc ?? 0) > 0) ? "rose" : "teal"}
          billingPeriod={(summary as any).latestBillingPeriod}
        />
        <StatCard
          label="No Data Use"
          value={summary.noDataUseServices ?? 0}
          icon={ZapOff}
          subtext="Termination prospects"
          accent={(summary.noDataUseServices ?? 0) > 0 ? "orange" : "gray"}
          billingPeriod={(summary as any).latestBillingPeriod}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Service Type Breakdown */}
        <div className="bg-card border border-border rounded-lg p-5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
            Services by Type
          </h2>
          <ServiceTypeBar
            label="Internet"
            count={servicesByType.Internet || 0}
            total={summary.totalServices}
            color="#10b981"
          />
          <ServiceTypeBar
            label="Mobile"
            count={servicesByType.Mobile || 0}
            total={summary.totalServices}
            color="#3b82f6"
          />
          <ServiceTypeBar
            label="Voice"
            count={servicesByType.Voice || 0}
            total={summary.totalServices}
            color="#f59e0b"
          />
          <ServiceTypeBar
            label="Other"
            count={servicesByType.Other || 0}
            total={summary.totalServices}
            color="#9ca3af"
          />
        </div>

        {/* Provider Breakdown */}
        <div className="bg-card border border-border rounded-lg p-5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
            Services by Provider
          </h2>
          {(() => {
            const sorted = Object.entries(servicesByProvider)
              .sort((a, b) => b[1].cost - a[1].cost); // sort by cost descending (ABB $24k first)
            const maxCost = sorted.length > 0 ? Math.max(...sorted.map(([, d]) => d.cost)) : 0;
            return sorted.map(([provider, data]) => (
              <ProviderBar
                key={provider}
                provider={provider}
                count={data.count}
                cost={data.cost}
                maxCost={maxCost}
                color={PROVIDER_COLORS[provider] || PROVIDER_COLORS.Unknown}
              />
            ));
          })()}
          {Object.keys(servicesByProvider).length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No provider data available
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Invoice Processing Stats */}
        <div className="bg-card border border-border rounded-lg p-5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
            Invoice Processing
          </h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between py-2 border-b border-border/50">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm">Invoice Line Items Processed</span>
              </div>
              <span className="data-value font-medium">{summary.invoiceItemsProcessed}</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-border/50">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-teal" />
                <span className="text-sm">Items Matched to Services</span>
              </div>
              <span className="data-value font-medium text-teal">{summary.invoiceItemsMatched}</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-border/50">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber" />
                <span className="text-sm">Items Unmatched</span>
              </div>
              <span className="data-value font-medium text-amber">
                {summary.invoiceItemsProcessed - summary.invoiceItemsMatched}
              </span>
            </div>
            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm">Active Customers</span>
              </div>
              <span className="data-value font-medium">{summary.totalCustomers}</span>
            </div>
          </div>
        </div>

        {/* Supplier Accounts */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Supplier Accounts
            </h2>
          </div>
          {accountsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full min-w-[280px]">
              <thead>
                <tr className="border-b border-border text-[10px] text-muted-foreground uppercase tracking-wider">
                  <th className="text-left px-4 py-2 font-semibold">Account</th>
                  <th className="text-right px-4 py-2 font-semibold">Svcs</th>
                  <th className="text-right px-4 py-2 font-semibold">Monthly</th>
                </tr>
              </thead>
              <tbody>
                {supplierAccounts
                  .filter((a: { accountNumber: string }) => a.accountNumber)
                  .sort((a: { monthlyCost: number }, b: { monthlyCost: number }) => b.monthlyCost - a.monthlyCost)
                  .map((acct: { accountNumber: string; serviceCount: number; monthlyCost: number }) => (
                    <tr key={acct.accountNumber} className="border-b border-border/30 last:border-0">
                      <td className="px-4 py-2.5">
                        <span className="data-value text-sm">{acct.accountNumber}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span className="data-value text-sm">{acct.serviceCount}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span className="data-value text-sm">
                          ${Number(acct.monthlyCost).toLocaleString("en-AU", { minimumFractionDigits: 2 })}
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          )}
        </div>
      </div>

      {/* Top Customers by Spend */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Top Customers by Spend
          </h2>
          <Link
            href="/customers"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
          >
            View all <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
        <div>
          {topCustomers.map((c) => (
            <Link key={c.id} href={`/customers/${c.externalId}`}>
              <div className="flex items-center justify-between px-5 py-2.5 border-b border-border/30 last:border-0 hover:bg-accent/30 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="text-sm truncate">{c.name}</span>
                </div>
                <div className="text-right shrink-0 ml-4">
                  <span className="data-value text-sm">
                    ${Number(c.monthlyCost).toLocaleString("en-AU", { minimumFractionDigits: 2 })}
                  </span>
                  <span className="text-[10px] text-muted-foreground block">
                    {c.serviceCount} svc
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
