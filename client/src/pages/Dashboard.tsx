/*
 * Swiss Data Design — Dashboard Overview
 * Summary stat cards, service type breakdown, supplier account table
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
} from "lucide-react";
import { useSummary, useSupplierAccounts, useCustomerSearch } from "@/hooks/useData";

function StatCard({
  label,
  value,
  icon: Icon,
  subtext,
  accent,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  subtext?: string;
  accent?: "teal" | "amber" | "rose";
}) {
  const accentColor =
    accent === "teal"
      ? "text-teal"
      : accent === "amber"
        ? "text-amber"
        : accent === "rose"
          ? "text-rose"
          : "text-foreground";

  return (
    <div className="bg-card border border-border rounded-lg px-5 py-4">
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

export default function Dashboard() {
  const { summary, isLoading: summaryLoading } = useSummary();
  const { supplierAccounts, isLoading: accountsLoading } = useSupplierAccounts();
  const { filtered: customers } = useCustomerSearch();

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

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Telstra billing reconciliation overview
        </p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-8">
        <StatCard
          label="Total Services"
          value={summary.totalServices}
          icon={Wifi}
          subtext={`Across ${summary.totalLocations} locations`}
        />
        <StatCard
          label="Monthly Spend"
          value={`$${Number(summary.totalMonthlyCost).toLocaleString("en-AU", { minimumFractionDigits: 2 })}`}
          icon={DollarSign}
          subtext="Estimated from invoices"
        />
        <StatCard
          label="Matched"
          value={`${summary.matchedServices} (${matchPct}%)`}
          icon={CheckCircle2}
          subtext="Linked to a customer"
          accent="teal"
        />
        <StatCard
          label="Unmatched"
          value={summary.unmatchedServices}
          icon={AlertTriangle}
          subtext="Require review"
          accent="amber"
        />
        <StatCard
          label="AVC Coverage"
          value={`${summary.servicesWithAvc ?? 0} / ${summary.totalServices}`}
          icon={LinkIcon}
          subtext={`${summary.servicesMissingAvc ?? 0} missing AVC ID`}
          accent={((summary.servicesMissingAvc ?? 0) > 0) ? "rose" : "teal"}
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
            color="oklch(0.637 0.137 175.8)"
          />
          <ServiceTypeBar
            label="Mobile"
            count={servicesByType.Mobile || 0}
            total={summary.totalServices}
            color="oklch(0.55 0.15 260)"
          />
          <ServiceTypeBar
            label="Voice"
            count={servicesByType.Voice || 0}
            total={summary.totalServices}
            color="oklch(0.666 0.16 75.8)"
          />
          <ServiceTypeBar
            label="Other"
            count={servicesByType.Other || 0}
            total={summary.totalServices}
            color="oklch(0.7 0.01 56)"
          />
        </div>

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
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Supplier Accounts */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Telstra Accounts
            </h2>
          </div>
          {accountsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-border text-[10px] text-muted-foreground uppercase tracking-wider">
                  <th className="text-left px-5 py-2 font-semibold">Account</th>
                  <th className="text-right px-5 py-2 font-semibold">Services</th>
                  <th className="text-right px-5 py-2 font-semibold">Monthly</th>
                </tr>
              </thead>
              <tbody>
                {supplierAccounts
                  .filter((a: { accountNumber: string }) => a.accountNumber)
                  .sort((a: { monthlyCost: number }, b: { monthlyCost: number }) => b.monthlyCost - a.monthlyCost)
                  .map((acct: { accountNumber: string; serviceCount: number; monthlyCost: number }) => (
                    <tr key={acct.accountNumber} className="border-b border-border/30 last:border-0">
                      <td className="px-5 py-2.5">
                        <span className="data-value text-sm">{acct.accountNumber}</span>
                      </td>
                      <td className="px-5 py-2.5 text-right">
                        <span className="data-value text-sm">{acct.serviceCount}</span>
                      </td>
                      <td className="px-5 py-2.5 text-right">
                        <span className="data-value text-sm">
                          ${Number(acct.monthlyCost).toLocaleString("en-AU", { minimumFractionDigits: 2 })}
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
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
    </div>
  );
}
