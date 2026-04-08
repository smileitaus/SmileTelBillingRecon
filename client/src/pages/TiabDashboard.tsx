/**
 * TiabDashboard.tsx
 * TIAB / Octane (Inabox) Mobile Services Dashboard
 *
 * Tabs:
 *   Overview    — summary stats, last sync info, quick actions
 *   Services    — paginated list of all TIAB mobile services with search/filter
 *   Customers   — TIAB customers with link status to internal customers
 *   Recon       — reconciliation issues (missing services, status mismatches)
 *   Sync Log    — history of all sync runs
 */
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  RefreshCw, CheckCircle2, XCircle, AlertTriangle, Clock,
  Smartphone, Users, Activity, Link2, Link2Off, Search,
  ChevronDown, ChevronUp, Loader2, Info, ExternalLink,
  Wifi, Database, ShieldCheck, Play, ArrowRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Link } from "wouter";

// ── Helpers ───────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string | null | undefined }) {
  const s = status ?? "unknown";
  if (s === "Active" || s === "active" || s === "completed")
    return <Badge className="bg-green-100 text-green-800 border-green-200">{s}</Badge>;
  if (s === "Suspended" || s === "suspended")
    return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">{s}</Badge>;
  if (s === "Ceased" || s === "ceased" || s === "failed")
    return <Badge className="bg-red-100 text-red-800 border-red-200">{s}</Badge>;
  if (s === "pending" || s === "running")
    return <Badge className="bg-blue-100 text-blue-800 border-blue-200">{s}</Badge>;
  return <Badge variant="outline">{s}</Badge>;
}

function SeverityBadge({ severity }: { severity: string | null | undefined }) {
  const s = severity ?? "medium";
  if (s === "high") return <Badge className="bg-red-100 text-red-800 border-red-200">High</Badge>;
  if (s === "medium") return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">Medium</Badge>;
  return <Badge className="bg-gray-100 text-gray-700 border-gray-200">Low</Badge>;
}

function ReconTypeBadge({ type }: { type: string }) {
  if (type === "missing_service") return <Badge className="bg-orange-100 text-orange-800 border-orange-200">Missing Service</Badge>;
  if (type === "sim_state_mismatch") return <Badge className="bg-purple-100 text-purple-800 border-purple-200">Status Mismatch</Badge>;
  if (type === "cost_variance") return <Badge className="bg-blue-100 text-blue-800 border-blue-200">Cost Variance</Badge>;
  return <Badge variant="outline">{type}</Badge>;
}

function fmtDate(d: string | Date | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-AU", { dateStyle: "short", timeStyle: "short" });
}

function fmtDuration(ms: number | null | undefined) {
  if (!ms) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ── Tab types ─────────────────────────────────────────────────────────────────
type Tab = "overview" | "services" | "customers" | "recon" | "invoices" | "links" | "synclog";

// ── Supplier Invoices Tab ─────────────────────────────────────────────────────
function SupplierInvoicesTab() {
  const { data: summary, isLoading } = trpc.tiab.getSupplierInvoiceSummary.useQuery();
  const [selectedInvoice, setSelectedInvoice] = useState<string | null>(null);
  const { data: detail } = trpc.tiab.getSupplierInvoiceDetail.useQuery(
    { invoiceNumber: selectedInvoice! },
    { enabled: !!selectedInvoice }
  );

  const fmtAud = (n: number) => `$${n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const categoryColor: Record<string, string> = {
    mobile_service: "bg-blue-100 text-blue-800",
    sim_card: "bg-green-100 text-green-800",
    otp_sms: "bg-purple-100 text-purple-800",
    other: "bg-gray-100 text-gray-700",
  };

  if (isLoading) return <div className="flex items-center justify-center h-40"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;

  const invoices = summary ?? [];
  const totalCost = invoices.reduce((sum, inv) => sum + inv.totalExGst, 0);

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {invoices.map((inv) => (
          <button
            key={inv.invoiceNumber}
            onClick={() => setSelectedInvoice(inv.invoiceNumber === selectedInvoice ? null : inv.invoiceNumber)}
            className={`text-left p-4 rounded-lg border transition-all ${
              selectedInvoice === inv.invoiceNumber
                ? "border-indigo-500 bg-indigo-50 ring-1 ring-indigo-300"
                : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
            }`}
          >
            <div className="text-xs text-gray-500 font-medium mb-1">{inv.invoiceReference}</div>
            <div className="text-xs text-gray-400 mb-2">{inv.billingMonth} · {inv.invoiceDate}</div>
            <div className="text-xl font-bold text-gray-900">{fmtAud(inv.totalExGst)}</div>
            <div className="text-xs text-gray-400 mt-1">ex GST · {fmtAud(inv.totalIncGst)} inc</div>
          </button>
        ))}
      </div>

      {/* Growth trend */}
      {invoices.length > 1 && (
        <Card className="border border-gray-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Cost Growth Trend (Ex GST)</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex items-end gap-3 h-24">
              {invoices.map((inv, i) => {
                const maxVal = Math.max(...invoices.map((x) => x.totalExGst));
                const pct = maxVal > 0 ? (inv.totalExGst / maxVal) * 100 : 0;
                const prev = i > 0 ? invoices[i - 1].totalExGst : null;
                const growth = prev ? ((inv.totalExGst - prev) / prev) * 100 : null;
                return (
                  <div key={inv.invoiceNumber} className="flex-1 flex flex-col items-center gap-1">
                    {growth !== null && (
                      <span className={`text-xs font-medium ${growth >= 0 ? "text-red-600" : "text-green-600"}`}>
                        {growth >= 0 ? "+" : ""}{growth.toFixed(0)}%
                      </span>
                    )}
                    <div
                      className="w-full rounded-t bg-indigo-400 transition-all"
                      style={{ height: `${Math.max(pct, 4)}%` }}
                      title={fmtAud(inv.totalExGst)}
                    />
                    <span className="text-xs text-gray-500">{inv.billingMonth.substring(5)}/{inv.billingMonth.substring(2, 4)}</span>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 text-sm text-gray-600">
              Total across all invoices: <strong>{fmtAud(totalCost)}</strong> ex GST
              {invoices.length >= 2 && (
                <span className="ml-3 text-red-600 font-medium">
                  ({((invoices[invoices.length - 1].totalExGst / invoices[0].totalExGst - 1) * 100).toFixed(0)}% growth from first to latest invoice)
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Invoice detail */}
      {selectedInvoice && detail && (
        <Card className="border border-indigo-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-700">
              Invoice {detail.invoice.invoiceReference} — {detail.invoice.invoiceDate}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div><span className="text-gray-500 text-xs">Supplier</span><div className="font-medium">{detail.invoice.supplierName}</div></div>
              <div><span className="text-gray-500 text-xs">Billed To</span><div className="font-medium">{detail.invoice.billedToName}</div></div>
              <div><span className="text-gray-500 text-xs">Payment Due</span><div className="font-medium">{detail.invoice.paymentDueDate}</div></div>
              <div><span className="text-gray-500 text-xs">Status</span><div><Badge variant="outline" className="capitalize">{detail.invoice.status}</Badge></div></div>
            </div>

            <div className="overflow-x-auto rounded border border-gray-200">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {["Description", "Category", "Ex GST", "GST", "Inc GST"].map((h) => (
                      <th key={h} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {detail.lineItems.map((li) => (
                    <tr key={li.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium">{li.description}</td>
                      <td className="px-3 py-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${categoryColor[li.lineCategory] ?? "bg-gray-100 text-gray-700"}`}>
                          {li.lineCategory.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono">{fmtAud(Number(li.gstExclusive))}</td>
                      <td className="px-3 py-2 text-right font-mono text-gray-500">{fmtAud(Number(li.gst))}</td>
                      <td className="px-3 py-2 text-right font-mono font-semibold">{fmtAud(Number(li.amountGstIncl))}</td>
                    </tr>
                  ))}
                  <tr className="bg-gray-50 font-semibold border-t-2 border-gray-300">
                    <td className="px-3 py-2" colSpan={2}>Total</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtAud(Number(detail.invoice.totalExGst))}</td>
                    <td className="px-3 py-2 text-right font-mono text-gray-500">{fmtAud(Number(detail.invoice.totalGst))}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtAud(Number(detail.invoice.totalIncGst))}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="p-3 bg-gray-50 rounded text-xs text-gray-600">
              <strong>Payment:</strong> BSB {detail.invoice.paymentBsb} · Account {detail.invoice.paymentAccount} · {detail.invoice.paymentEmail}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Octane Links Tab ──────────────────────────────────────────────────────────
function OctaneLinksTab() {
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [showZambrero, setShowZambrero] = useState<boolean | undefined>(undefined);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  const { data: stats } = trpc.tiab.getOctaneLinkStats.useQuery();
  const { data, isLoading, refetch } = trpc.tiab.getOctaneLinks.useQuery({
    search: search || undefined,
    matchType: filterType === "all" ? undefined : filterType,
    isZambreroService: showZambrero,
    page,
    pageSize: PAGE_SIZE,
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="space-y-4">
      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Total Links", value: stats.total, color: "text-gray-700" },
            { label: "Matched", value: stats.matched, color: "text-green-600" },
            { label: "Unmatched", value: stats.unmatched, color: "text-red-600" },
            { label: "Zambrero Services", value: stats.zambrero, color: "text-indigo-600" },
          ].map((s) => (
            <Card key={s.label} className="border border-gray-200">
              <CardContent className="p-4">
                <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">{s.label}</div>
                <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search by name or MSISDN..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="pl-9"
          />
        </div>
        <Select value={filterType} onValueChange={(v) => { setFilterType(v); setPage(0); }}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Match type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="unmatched">Unmatched</SelectItem>
            <SelectItem value="manual">Manual</SelectItem>
            <SelectItem value="exact_name">Exact Name</SelectItem>
            <SelectItem value="fuzzy_name">Fuzzy Name</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={showZambrero === undefined ? "all" : showZambrero ? "zambrero" : "non-zambrero"}
          onValueChange={(v) => {
            setShowZambrero(v === "all" ? undefined : v === "zambrero");
            setPage(0);
          }}
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Customer type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Customers</SelectItem>
            <SelectItem value="zambrero">Zambrero Services</SelectItem>
            <SelectItem value="non-zambrero">Non-Zambrero</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center h-40"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : rows.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Link2Off className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No links found matching your filters.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {["Octane Customer", "Service / Location", "MSISDN", "Match Status", "Internal Customer", "Confidence"].map((h) => (
                  <th key={h} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2">
                    <div className="font-medium text-xs">{row.octaneCustomerName}</div>
                    <div className="text-xs text-gray-400">ID: {row.octaneCustomerId}</div>
                  </td>
                  <td className="px-3 py-2">
                    {row.isZambreroService ? (
                      <span className="text-xs font-medium text-indigo-700">{row.octaneServiceName}</span>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{row.msisdn || "—"}</td>
                  <td className="px-3 py-2">
                    {row.matchType === "unmatched" ? (
                      <Badge className="bg-red-100 text-red-800 border-red-200 text-xs">Unmatched</Badge>
                    ) : (
                      <Badge className="bg-green-100 text-green-800 border-green-200 text-xs capitalize">{row.matchType?.replace(/_/g, " ")}</Badge>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {row.internalCustomerName ? (
                      <div>
                        <div className="font-medium text-xs">{row.internalCustomerName}</div>
                        <div className="text-xs text-gray-400">{row.internalCustomerExternalId}</div>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">Not linked</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {row.matchConfidence ? `${Number(row.matchConfidence).toFixed(0)}%` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">Showing {Math.min(page * PAGE_SIZE + 1, total)}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>Previous</Button>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={(page + 1) * PAGE_SIZE >= total}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Overview Tab ──────────────────────────────────────────────────────────────
function OverviewTab() {
  const { data: summary, isLoading, refetch } = trpc.tiab.getSummary.useQuery();
  const syncAll = trpc.tiab.syncAll.useMutation({
    onSuccess: (data) => {
      toast.success(`Sync complete — ${JSON.stringify(data.results)}`);
      refetch();
    },
    onError: (err) => toast.error(`Sync failed: ${err.message}`),
  });
  const testConn = trpc.tiab.testConnection.useMutation({
    onSuccess: (data) => toast.success(`Connection: ${data.message ?? "OK"}`),
    onError: (err) => toast.error(`Connection failed: ${err.message}`),
  });
  const runRecon = trpc.tiab.runReconciliation.useMutation({
    onSuccess: (data) => {
      toast.success(`Reconciliation complete — ${data.issuesFound} issues found`);
      refetch();
    },
    onError: (err) => toast.error(`Reconciliation failed: ${err.message}`),
  });

  if (isLoading) return (
    <div className="flex items-center justify-center h-48">
      <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
    </div>
  );

  const lastSync = summary?.lastSync;

  return (
    <div className="space-y-6">
      {/* Connection status banner */}
      <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
        <AlertTriangle className="w-4 h-4 flex-shrink-0" />
        <span>
          <strong>IP Whitelist Pending:</strong> The Manus server IP (47.129.135.112) must be whitelisted by Inabox before live API calls will succeed.
          Once whitelisted, use the <strong>Test Connection</strong> button below to verify.
        </span>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { label: "TIAB Customers", value: summary?.totalCustomers ?? 0, icon: Users, color: "text-blue-600" },
          { label: "Total Services", value: summary?.totalServices ?? 0, icon: Smartphone, color: "text-indigo-600" },
          { label: "Active Services", value: summary?.activeServices ?? 0, icon: Activity, color: "text-green-600" },
          { label: "Linked Services", value: summary?.linkedServices ?? 0, icon: Link2, color: "text-teal-600" },
          { label: "Linked Customers", value: summary?.linkedCustomers ?? 0, icon: Users, color: "text-cyan-600" },
          { label: "Open Recon Issues", value: summary?.openReconIssues ?? 0, icon: AlertTriangle, color: summary?.openReconIssues ? "text-red-600" : "text-gray-400" },
        ].map((stat) => (
          <Card key={stat.label} className="border border-gray-200">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <stat.icon className={`w-4 h-4 ${stat.color}`} />
                <span className="text-xs text-gray-500 uppercase tracking-wide">{stat.label}</span>
              </div>
              <div className="text-2xl font-bold text-gray-900">{stat.value.toLocaleString()}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Last sync info */}
      {lastSync && (
        <Card className="border border-gray-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Last Sync</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div><span className="text-gray-500">Type</span><div className="font-medium capitalize">{lastSync.syncType}</div></div>
              <div><span className="text-gray-500">Status</span><div><StatusBadge status={lastSync.status} /></div></div>
              <div><span className="text-gray-500">Started</span><div className="font-medium">{fmtDate(lastSync.startedAt)}</div></div>
              <div><span className="text-gray-500">Duration</span><div className="font-medium">{fmtDuration(lastSync.durationMs)}</div></div>
              <div><span className="text-gray-500">Fetched</span><div className="font-medium">{lastSync.recordsFetched ?? 0}</div></div>
              <div><span className="text-gray-500">Created</span><div className="font-medium">{lastSync.recordsCreated ?? 0}</div></div>
              <div><span className="text-gray-500">Updated</span><div className="font-medium">{lastSync.recordsUpdated ?? 0}</div></div>
              <div><span className="text-gray-500">Errors</span><div className="font-medium text-red-600">{lastSync.recordsErrored ?? 0}</div></div>
            </div>
            {lastSync.errorMessage && (
              <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                {lastSync.errorMessage}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Quick actions */}
      <Card className="border border-gray-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-gray-600">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => testConn.mutate()}
              disabled={testConn.isPending}
            >
              {testConn.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Wifi className="w-4 h-4 mr-2" />}
              Test Connection
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => syncAll.mutate()}
              disabled={syncAll.isPending}
            >
              {syncAll.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              Sync All (Customers + Services + Plans)
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => runRecon.mutate({})}
              disabled={runRecon.isPending}
            >
              {runRecon.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
              Run Reconciliation
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Integration info */}
      <Card className="border border-gray-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-gray-600">Integration Details</CardTitle>
        </CardHeader>
        <CardContent className="pt-0 text-sm space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div><span className="text-gray-500">API Base URL</span><div className="font-mono text-xs text-gray-700 break-all">{import.meta.env.VITE_TIAB_BASE_URL ?? "benzine.telcoinabox.com (test)"}</div></div>
            <div><span className="text-gray-500">Auth Method</span><div className="font-medium">HTTP Basic Auth</div></div>
            <div><span className="text-gray-500">API Version</span><div className="font-medium">v2</div></div>
            <div>
              <span className="text-gray-500">Documentation</span>
              <div>
                <a href="https://octane-api.apidog.io/doc-399363" target="_blank" rel="noopener noreferrer"
                  className="text-blue-600 hover:underline inline-flex items-center gap-1">
                  Octane API Docs <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          </div>
          <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded text-blue-800">
            <strong>Capabilities once whitelisted:</strong> Customer sync, Service sync, Plan catalogue, Transaction history,
            Data pool management, eSIM lifecycle (suspend/activate/reset/replace), Usage notification thresholds,
            and full reconciliation against internal mobile services.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Services Tab ──────────────────────────────────────────────────────────────
function ServicesTab() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [reconFilter, setReconFilter] = useState("all");
  const [linkedFilter, setLinkedFilter] = useState("all");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  const { data, isLoading } = trpc.tiab.getServices.useQuery({
    search: search || undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
    reconStatus: reconFilter !== "all" ? reconFilter : undefined,
    linked: linkedFilter === "linked" ? true : linkedFilter === "unlinked" ? false : undefined,
    page,
    pageSize: PAGE_SIZE,
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search MSISDN, SIM serial, IMEI, plan..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="pl-9 h-9 text-sm"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
          <SelectTrigger className="w-36 h-9 text-sm"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="Active">Active</SelectItem>
            <SelectItem value="Suspended">Suspended</SelectItem>
            <SelectItem value="Ceased">Ceased</SelectItem>
          </SelectContent>
        </Select>
        <Select value={reconFilter} onValueChange={(v) => { setReconFilter(v); setPage(0); }}>
          <SelectTrigger className="w-36 h-9 text-sm"><SelectValue placeholder="Recon" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Recon</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="matched">Matched</SelectItem>
            <SelectItem value="issue">Has Issues</SelectItem>
          </SelectContent>
        </Select>
        <Select value={linkedFilter} onValueChange={(v) => { setLinkedFilter(v); setPage(0); }}>
          <SelectTrigger className="w-36 h-9 text-sm"><SelectValue placeholder="Link" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="linked">Linked</SelectItem>
            <SelectItem value="unlinked">Unlinked</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Count */}
      <div className="text-sm text-gray-500">
        {isLoading ? "Loading..." : `${total.toLocaleString()} service${total !== 1 ? "s" : ""}`}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Smartphone className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No TIAB services found. Run a sync to populate data.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {["TIAB ID", "MSISDN", "SIM Serial", "Plan", "Status", "Recon", "Linked Service", "Activated"].map((h) => (
                  <th key={h} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((svc) => (
                <tr key={svc.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-mono text-xs text-gray-600">{svc.tiabServiceId}</td>
                  <td className="px-3 py-2 font-mono text-xs">{svc.msisdn ?? "—"}</td>
                  <td className="px-3 py-2 font-mono text-xs text-gray-500">{svc.simSerial ?? "—"}</td>
                  <td className="px-3 py-2 text-xs max-w-32 truncate" title={svc.planName ?? ""}>{svc.planName ?? "—"}</td>
                  <td className="px-3 py-2"><StatusBadge status={svc.status} /></td>
                  <td className="px-3 py-2">
                    {svc.reconStatus === "matched" ? (
                      <Badge className="bg-green-100 text-green-800 border-green-200">Matched</Badge>
                    ) : svc.reconStatus === "issue" ? (
                      <Badge className="bg-red-100 text-red-800 border-red-200">Issue</Badge>
                    ) : (
                      <Badge variant="outline" className="text-gray-500">Pending</Badge>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {svc.internalServiceExternalId ? (
                      <Link href={`/services/${svc.internalServiceExternalId}`}>
                        <span className="inline-flex items-center gap-1 text-blue-600 hover:underline text-xs">
                          <Link2 className="w-3 h-3" />{svc.internalServiceExternalId}
                        </span>
                      </Link>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-gray-400 text-xs">
                        <Link2Off className="w-3 h-3" />Unlinked
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500">{svc.activationDate ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">Page {page + 1} of {Math.ceil(total / PAGE_SIZE)}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>Previous</Button>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={(page + 1) * PAGE_SIZE >= total}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Customers Tab ─────────────────────────────────────────────────────────────
function CustomersTab() {
  const [search, setSearch] = useState("");
  const [linkedFilter, setLinkedFilter] = useState("all");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  const { data, isLoading } = trpc.tiab.getCustomers.useQuery({
    search: search || undefined,
    linked: linkedFilter === "linked" ? true : linkedFilter === "unlinked" ? false : undefined,
    page,
    pageSize: PAGE_SIZE,
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search company name, email, phone, ABN..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="pl-9 h-9 text-sm"
          />
        </div>
        <Select value={linkedFilter} onValueChange={(v) => { setLinkedFilter(v); setPage(0); }}>
          <SelectTrigger className="w-36 h-9 text-sm"><SelectValue placeholder="Link" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="linked">Linked</SelectItem>
            <SelectItem value="unlinked">Unlinked</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="text-sm text-gray-500">
        {isLoading ? "Loading..." : `${total.toLocaleString()} customer${total !== 1 ? "s" : ""}`}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No TIAB customers found. Run a sync to populate data.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {["TIAB ID", "Company", "Contact", "Email", "ABN", "Status", "Linked Customer", "Match Type"].map((h) => (
                  <th key={h} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((cust) => (
                <tr key={cust.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-mono text-xs text-gray-600">{cust.tiabCustomerId}</td>
                  <td className="px-3 py-2 font-medium text-xs max-w-40 truncate" title={cust.companyName ?? ""}>{cust.companyName ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-gray-600">{[cust.firstName, cust.lastName].filter(Boolean).join(" ") || "—"}</td>
                  <td className="px-3 py-2 text-xs text-gray-500 max-w-32 truncate" title={cust.email ?? ""}>{cust.email ?? "—"}</td>
                  <td className="px-3 py-2 font-mono text-xs text-gray-500">{cust.abn ?? "—"}</td>
                  <td className="px-3 py-2"><StatusBadge status={cust.status} /></td>
                  <td className="px-3 py-2">
                    {cust.internalCustomerExternalId ? (
                      <Link href={`/customers/${cust.internalCustomerExternalId}`}>
                        <span className="inline-flex items-center gap-1 text-blue-600 hover:underline text-xs">
                          <Link2 className="w-3 h-3" />{cust.internalCustomerExternalId}
                        </span>
                      </Link>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-gray-400 text-xs">
                        <Link2Off className="w-3 h-3" />Unlinked
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500 capitalize">{cust.matchType ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">Page {page + 1} of {Math.ceil(total / PAGE_SIZE)}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>Previous</Button>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={(page + 1) * PAGE_SIZE >= total}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Recon Tab ─────────────────────────────────────────────────────────────────
function ReconTab() {
  const [statusFilter, setStatusFilter] = useState("open");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.tiab.getReconIssues.useQuery({
    status: statusFilter,
    severity: severityFilter !== "all" ? severityFilter : undefined,
    page,
    pageSize: PAGE_SIZE,
  });

  const resolve = trpc.tiab.resolveReconIssue.useMutation({
    onSuccess: () => {
      toast.success("Issue resolved");
      utils.tiab.getReconIssues.invalidate();
      utils.tiab.getSummary.invalidate();
    },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });

  const runRecon = trpc.tiab.runReconciliation.useMutation({
    onSuccess: (data) => {
      toast.success(`Reconciliation complete — ${data.issuesFound} issues found`);
      utils.tiab.getReconIssues.invalidate();
      utils.tiab.getSummary.invalidate();
    },
    onError: (err) => toast.error(`Reconciliation failed: ${err.message}`),
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex gap-3">
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
            <SelectTrigger className="w-36 h-9 text-sm"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="manually_resolved">Resolved</SelectItem>
              <SelectItem value="dismissed">Dismissed</SelectItem>
              <SelectItem value="auto_remediated">Auto-remediated</SelectItem>
            </SelectContent>
          </Select>
          <Select value={severityFilter} onValueChange={(v) => { setSeverityFilter(v); setPage(0); }}>
            <SelectTrigger className="w-36 h-9 text-sm"><SelectValue placeholder="Severity" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Severities</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => runRecon.mutate({})}
          disabled={runRecon.isPending}
        >
          {runRecon.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Play className="w-4 h-4 mr-2" />}
          Run Reconciliation
        </Button>
      </div>

      <div className="text-sm text-gray-500">
        {isLoading ? "Loading..." : `${total.toLocaleString()} issue${total !== 1 ? "s" : ""}`}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <ShieldCheck className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No reconciliation issues found.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((issue) => (
            <div key={issue.id} className="border border-gray-200 rounded-lg p-4 bg-white">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <ReconTypeBadge type={issue.issueType} />
                    <SeverityBadge severity={issue.severity} />
                    {issue.billingPeriod && (
                      <span className="text-xs text-gray-500 font-mono">{issue.billingPeriod}</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-700 mt-1">{issue.description}</p>
                  <div className="flex gap-4 mt-2 text-xs text-gray-500">
                    {issue.tiabServiceId && <span>TIAB: <span className="font-mono">{issue.tiabServiceId}</span></span>}
                    {issue.internalServiceExternalId && (
                      <Link href={`/services/${issue.internalServiceExternalId}`}>
                        <span className="text-blue-600 hover:underline font-mono">{issue.internalServiceExternalId}</span>
                      </Link>
                    )}
                    {issue.expectedValue && <span>Expected: <strong>{issue.expectedValue}</strong></span>}
                    {issue.actualValue && <span>Actual: <strong>{issue.actualValue}</strong></span>}
                    {issue.varianceAmount && <span>Variance: <strong className="text-red-600">${Number(issue.varianceAmount).toFixed(2)}</strong></span>}
                  </div>
                </div>
                {issue.status === "open" && (
                  <div className="flex gap-2 flex-shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => resolve.mutate({ issueId: issue.id, status: "manually_resolved" })}
                      disabled={resolve.isPending}
                    >
                      <CheckCircle2 className="w-3 h-3 mr-1" />Resolve
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => resolve.mutate({ issueId: issue.id, status: "dismissed" })}
                      disabled={resolve.isPending}
                    >
                      Dismiss
                    </Button>
                  </div>
                )}
              </div>
              {issue.resolutionNotes && (
                <div className="mt-2 p-2 bg-gray-50 rounded text-xs text-gray-600">
                  <strong>Resolution:</strong> {issue.resolutionNotes} — {issue.resolvedBy} at {fmtDate(issue.resolvedAt)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">Page {page + 1} of {Math.ceil(total / PAGE_SIZE)}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>Previous</Button>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={(page + 1) * PAGE_SIZE >= total}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sync Log Tab ──────────────────────────────────────────────────────────────
function SyncLogTab() {
  const { data: logs, isLoading, refetch } = trpc.tiab.getSyncLog.useQuery({ limit: 50 });

  const syncCustomers = trpc.tiab.syncCustomers.useMutation({
    onSuccess: (d) => { toast.success(`Customers synced: ${d.recordsCreated} new, ${d.recordsUpdated} updated`); refetch(); },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });
  const syncServices = trpc.tiab.syncServices.useMutation({
    onSuccess: (d) => { toast.success(`Services synced: ${d.recordsCreated} new, ${d.recordsUpdated} updated`); refetch(); },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });
  const syncPlans = trpc.tiab.syncPlans.useMutation({
    onSuccess: (d) => { toast.success(`Plans synced: ${d.recordsCreated} new, ${d.recordsUpdated} updated`); refetch(); },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });
  const syncTransactions = trpc.tiab.syncTransactions.useMutation({
    onSuccess: (d) => { toast.success(`Transactions synced: ${d.recordsCreated} new, ${d.recordsUpdated} updated`); refetch(); },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });

  const anyPending = syncCustomers.isPending || syncServices.isPending || syncPlans.isPending || syncTransactions.isPending;

  return (
    <div className="space-y-4">
      {/* Manual sync buttons */}
      <Card className="border border-gray-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-gray-600">Manual Sync Triggers</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-wrap gap-3">
            {[
              { label: "Sync Customers", action: () => syncCustomers.mutate({ triggeredBy: "manual" }), pending: syncCustomers.isPending },
              { label: "Sync Services", action: () => syncServices.mutate({ triggeredBy: "manual" }), pending: syncServices.isPending },
              { label: "Sync Plans", action: () => syncPlans.mutate({ triggeredBy: "manual" }), pending: syncPlans.isPending },
              { label: "Sync Transactions", action: () => syncTransactions.mutate({ triggeredBy: "manual" }), pending: syncTransactions.isPending },
            ].map((btn) => (
              <Button key={btn.label} variant="outline" size="sm" onClick={btn.action} disabled={anyPending}>
                {btn.pending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                {btn.label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Log table */}
      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : !logs || logs.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Clock className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No sync history yet. Run a sync to see logs here.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {["Type", "Status", "Started", "Duration", "Fetched", "Created", "Updated", "Errors", "Triggered By"].map((h) => (
                  <th key={h} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 capitalize font-medium text-xs">{log.syncType}</td>
                  <td className="px-3 py-2"><StatusBadge status={log.status} /></td>
                  <td className="px-3 py-2 text-xs text-gray-600">{fmtDate(log.startedAt)}</td>
                  <td className="px-3 py-2 text-xs text-gray-600">{fmtDuration(log.durationMs)}</td>
                  <td className="px-3 py-2 text-xs">{log.recordsFetched ?? 0}</td>
                  <td className="px-3 py-2 text-xs text-green-700">{log.recordsCreated ?? 0}</td>
                  <td className="px-3 py-2 text-xs text-blue-700">{log.recordsUpdated ?? 0}</td>
                  <td className="px-3 py-2 text-xs text-red-600">{log.recordsErrored ?? 0}</td>
                  <td className="px-3 py-2 text-xs text-gray-500 capitalize">{log.triggeredBy ?? "system"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function TiabDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>("overview");

  const tabs: { id: Tab; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: "overview", label: "Overview", icon: Activity },
    { id: "services", label: "Services", icon: Smartphone },
    { id: "customers", label: "Customers", icon: Users },
    { id: "invoices", label: "Supplier Invoices", icon: Database },
    { id: "links", label: "Customer Links", icon: Link2 },
    { id: "recon", label: "Reconciliation", icon: ShieldCheck },
    { id: "synclog", label: "Sync Log", icon: Clock },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
            <Smartphone className="w-4 h-4 text-indigo-600" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">TIAB Mobile Services</h1>
          <Badge variant="outline" className="text-xs text-gray-500">Octane / Inabox</Badge>
        </div>
        <p className="text-sm text-gray-500 ml-11">
          Mobile service management, eSIM lifecycle, data pool monitoring, and billing reconciliation via the Octane API.
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      {activeTab === "overview" && <OverviewTab />}
      {activeTab === "services" && <ServicesTab />}
      {activeTab === "customers" && <CustomersTab />}
      {activeTab === "invoices" && <SupplierInvoicesTab />}
      {activeTab === "links" && <OctaneLinksTab />}
      {activeTab === "recon" && <ReconTab />}
      {activeTab === "synclog" && <SyncLogTab />}
    </div>
  );
}
