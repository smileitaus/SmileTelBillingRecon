import { useState, useCallback, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  CheckCircle2, Circle, Upload, RefreshCw, AlertTriangle, TrendingUp, TrendingDown,
  Minus, ChevronDown, ChevronUp, Mail, BarChart2, FileText, Globe, Zap, Clock, Info
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from "recharts";

// ── Types ─────────────────────────────────────────────────────────────────────

type ChecklistItem = {
  id: number;
  itemKey: string;
  category: string;
  supplierName: string;
  displayName: string;
  description: string;
  acceptedFormats: string | null;
  isRequired: number;
  isAutomatic: number;
  status: string;
  uploadedAt: string | null;
  uploadedBy: string | null;
  notes: string | null;
  sortOrder: number;
};

type DiscrepancyAlert = {
  id: number;
  supplierName: string;
  alertType: string;
  severity: string;
  prevAmountExGst: string | null;
  currAmountExGst: string | null;
  changePct: string | null;
  reason: string | null;
  status: string;
  acknowledgedBy: string | null;
  resolution: string | null;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const PERIOD_OPTIONS = [
  { key: "2026-04", label: "April 2026" },
  { key: "2026-03", label: "March 2026" },
  { key: "2026-02", label: "February 2026" },
];

const SUPPLIER_COLORS: Record<string, string> = {
  ABB: "#e95b2a",
  Vocus: "#6366f1",
  Telstra: "#0ea5e9",
  AAPT: "#10b981",
  ChannelHaus: "#f59e0b",
  SasBoss: "#8b5cf6",
  DataGate: "#ec4899",
  NetSIP: "#14b8a6",
};

const CATEGORY_LABELS: Record<string, string> = {
  supplier_invoice: "Supplier Invoices",
  revenue: "Revenue Inputs",
  portal_scrape: "Portal Scrapes",
  api_sync: "API Syncs",
};

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  supplier_invoice: <FileText className="h-4 w-4" />,
  revenue: <BarChart2 className="h-4 w-4" />,
  portal_scrape: <Globe className="h-4 w-4" />,
  api_sync: <Zap className="h-4 w-4" />,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return "—";
  const n = parseFloat(String(val));
  if (isNaN(n)) return "—";
  return `$${n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtPct(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return "—";
  const n = parseFloat(String(val));
  if (isNaN(n)) return "—";
  return `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;
}

// ── Checklist Item Card ───────────────────────────────────────────────────────

function ChecklistCard({
  item,
  onMark,
}: {
  item: ChecklistItem;
  onMark: (itemKey: string, status: "uploaded" | "synced" | "skipped" | "pending", notes?: string) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isDone = item.status === "uploaded" || item.status === "synced";
  const isAuto = item.isAutomatic === 1;

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) {
        onMark(item.itemKey, isAuto ? "synced" : "uploaded", `File: ${files[0].name}`);
      }
    },
    [item.itemKey, isAuto, onMark]
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      if (files.length > 0) {
        onMark(item.itemKey, isAuto ? "synced" : "uploaded", `File: ${files[0].name}`);
      }
    },
    [item.itemKey, isAuto, onMark]
  );

  return (
    <div
      className={`rounded-lg border transition-all ${
        isDone
          ? "border-green-500/40 bg-green-500/5"
          : item.status === "skipped"
          ? "border-zinc-600/40 bg-zinc-800/30 opacity-60"
          : dragging
          ? "border-orange-400 bg-orange-500/10 scale-[1.01]"
          : "border-zinc-700/60 bg-zinc-900/60 hover:border-zinc-600"
      }`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      <div className="flex items-start gap-3 p-3">
        {/* Status icon */}
        <div className="mt-0.5 flex-shrink-0">
          {isDone ? (
            <CheckCircle2 className="h-5 w-5 text-green-500" />
          ) : item.status === "skipped" ? (
            <Minus className="h-5 w-5 text-zinc-500" />
          ) : (
            <Circle className="h-5 w-5 text-zinc-600" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-sm font-medium ${isDone ? "text-green-400" : "text-zinc-100"}`}>
              {item.displayName}
            </span>
            {item.isRequired === 0 && (
              <Badge variant="outline" className="text-xs border-zinc-600 text-zinc-400">Optional</Badge>
            )}
            {isAuto && (
              <Badge variant="outline" className="text-xs border-blue-600 text-blue-400">Auto</Badge>
            )}
            {item.acceptedFormats && !isAuto && (
              <span className="text-xs text-zinc-500 uppercase">{item.acceptedFormats.replace(/,/g, " / ")}</span>
            )}
          </div>

          {item.uploadedAt && (
            <p className="text-xs text-zinc-500 mt-0.5">
              {item.status === "uploaded" ? "Uploaded" : "Synced"} {new Date(item.uploadedAt).toLocaleDateString("en-AU")}
              {item.uploadedBy ? ` by ${item.uploadedBy}` : ""}
              {item.notes ? ` — ${item.notes}` : ""}
            </p>
          )}

          {expanded && item.description && (
            <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">{item.description}</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-zinc-500 hover:text-zinc-300 p-1"
          >
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>

          {!isDone && !isAuto && (
            <>
              <input
                ref={inputRef}
                type="file"
                className="hidden"
                accept={item.acceptedFormats ? item.acceptedFormats.split(",").map(f => `.${f.trim()}`).join(",") : undefined}
                onChange={handleFileChange}
              />
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs border-zinc-600 bg-transparent hover:bg-zinc-800"
                onClick={() => inputRef.current?.click()}
              >
                <Upload className="h-3 w-3 mr-1" />
                Upload
              </Button>
            </>
          )}

          {!isDone && isAuto && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs border-blue-600 text-blue-400 bg-transparent hover:bg-blue-900/20"
              onClick={() => onMark(item.itemKey, "synced")}
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              Mark Synced
            </Button>
          )}

          {isDone && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs text-zinc-500 hover:text-zinc-300"
              onClick={() => onMark(item.itemKey, "pending")}
            >
              Undo
            </Button>
          )}

          {!isDone && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs text-zinc-500 hover:text-zinc-300"
              onClick={() => onMark(item.itemKey, "skipped")}
            >
              Skip
            </Button>
          )}
        </div>
      </div>

      {/* Drop zone hint when not done */}
      {!isDone && !isAuto && (
        <div className={`mx-3 mb-3 rounded border-2 border-dashed text-center py-2 text-xs transition-colors ${
          dragging ? "border-orange-400 text-orange-400" : "border-zinc-700 text-zinc-600"
        }`}>
          {dragging ? "Drop file here" : "or drag & drop file here"}
        </div>
      )}
    </div>
  );
}

// ── Discrepancy Alert Card ────────────────────────────────────────────────────

function AlertCard({
  alert,
  onAcknowledge,
}: {
  alert: DiscrepancyAlert;
  onAcknowledge: (id: number, status: "acknowledged" | "resolved", resolution?: string) => void;
}) {
  const [resolving, setResolving] = useState(false);
  const [resolution, setResolution] = useState("");

  const isCritical = alert.severity === "critical";
  const isOpen = alert.status === "open";

  return (
    <div className={`rounded-lg border p-3 ${
      isCritical ? "border-red-500/40 bg-red-500/5" : "border-amber-500/40 bg-amber-500/5"
    } ${!isOpen ? "opacity-60" : ""}`}>
      <div className="flex items-start gap-3">
        <AlertTriangle className={`h-4 w-4 mt-0.5 flex-shrink-0 ${isCritical ? "text-red-400" : "text-amber-400"}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className={`text-xs ${isCritical ? "bg-red-500/20 text-red-400 border-red-500/40" : "bg-amber-500/20 text-amber-400 border-amber-500/40"}`}>
              {alert.severity.toUpperCase()}
            </Badge>
            <span className="text-sm font-medium text-zinc-100">{alert.supplierName}</span>
            <span className="text-xs text-zinc-400">{alert.alertType.replace(/_/g, " ")}</span>
            {alert.changePct && (
              <span className={`text-sm font-bold ${parseFloat(alert.changePct) > 0 ? "text-red-400" : "text-green-400"}`}>
                {fmtPct(alert.changePct)}
              </span>
            )}
          </div>
          {alert.prevAmountExGst && alert.currAmountExGst && (
            <p className="text-xs text-zinc-400 mt-0.5">
              {fmt(alert.prevAmountExGst)} → {fmt(alert.currAmountExGst)} ex GST
            </p>
          )}
          {alert.reason && (
            <p className="text-xs text-zinc-400 mt-1 leading-relaxed">{alert.reason}</p>
          )}
          {alert.resolution && (
            <p className="text-xs text-green-400 mt-1">Resolution: {alert.resolution}</p>
          )}
          {alert.acknowledgedBy && (
            <p className="text-xs text-zinc-500 mt-0.5">
              {alert.status === "resolved" ? "Resolved" : "Acknowledged"} by {alert.acknowledgedBy}
            </p>
          )}
        </div>
        {isOpen && (
          <div className="flex gap-1.5 flex-shrink-0">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs border-zinc-600 bg-transparent hover:bg-zinc-800"
              onClick={() => onAcknowledge(alert.id, "acknowledged")}
            >
              Acknowledge
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs border-green-600 text-green-400 bg-transparent hover:bg-green-900/20"
              onClick={() => setResolving(true)}
            >
              Resolve
            </Button>
          </div>
        )}
      </div>

      {resolving && (
        <div className="mt-3 space-y-2">
          <Textarea
            placeholder="Describe the resolution (optional)..."
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
            className="text-xs bg-zinc-800 border-zinc-700 text-zinc-100 min-h-[60px]"
          />
          <div className="flex gap-2">
            <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700"
              onClick={() => { onAcknowledge(alert.id, "resolved", resolution); setResolving(false); }}>
              Confirm Resolve
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setResolving(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function BillingCycle() {
  const [selectedPeriod, setSelectedPeriod] = useState("2026-04");
  const utils = trpc.useUtils();

  // Data queries
  const { data: checklist = [], isLoading: checklistLoading } = trpc.billingCycle.getChecklist.useQuery(
    { periodKey: selectedPeriod },
    { enabled: !!selectedPeriod }
  );
  const { data: periods = [] } = trpc.billingCycle.listPeriods.useQuery();
  const { data: snapshots = [] } = trpc.billingCycle.getSupplierSnapshots.useQuery({});
  const { data: discrepancies = [], isLoading: discLoading } = trpc.billingCycle.getDiscrepancies.useQuery(
    { periodKey: selectedPeriod },
    { enabled: !!selectedPeriod }
  );
  const { data: revenueSnaps = [] } = trpc.billingCycle.getRevenueSnapshots.useQuery();

  // Mutations
  const markItem = trpc.billingCycle.markChecklistItem.useMutation({
    onSuccess: (data) => {
      utils.billingCycle.getChecklist.invalidate({ periodKey: selectedPeriod });
      utils.billingCycle.listPeriods.invalidate();
      if (data.pendingRequired === 0) {
        toast.success("Checklist complete! All required inputs received.");
      }
    },
    onError: () => toast.error("Failed to update item"),
  });

  const runDetection = trpc.billingCycle.runDiscrepancyDetection.useMutation({
    onSuccess: (data) => {
      utils.billingCycle.getDiscrepancies.invalidate({ periodKey: selectedPeriod });
      toast.success(`Detection complete — ${data.alertsCreated} alert${data.alertsCreated !== 1 ? "s" : ""} generated`);
    },
  });

  const sendEmail = trpc.billingCycle.sendDiscrepancyEmail.useMutation({
    onSuccess: (data) => {
      if (data.sent) toast.success(`Email sent — ${data.alertCount} alerts sent to angusbs@smiletel.com.au`);
      else toast.info(data.reason || "No alerts to send");
    },
  });

  const acknowledgeAlert = trpc.billingCycle.acknowledgeAlert.useMutation({
    onSuccess: () => utils.billingCycle.getDiscrepancies.invalidate({ periodKey: selectedPeriod }),
  });

  const snapshotCosts = trpc.billingCycle.snapshotSupplierCosts.useMutation({
    onSuccess: (data) => {
      utils.billingCycle.getSupplierSnapshots.invalidate();
      toast.success(`Snapshot complete — ${data.inserted} supplier cost records updated`);
    },
  });

  // Computed checklist stats
  const required = checklist.filter((i: ChecklistItem) => i.isRequired === 1);
  const completed = required.filter((i: ChecklistItem) => i.status === "uploaded" || i.status === "synced");
  const progress = required.length > 0 ? Math.round((completed.length / required.length) * 100) : 0;
  const allDone = required.length > 0 && completed.length === required.length;

  // Group checklist by category
  const grouped = checklist.reduce((acc: Record<string, ChecklistItem[]>, item: ChecklistItem) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {});

  // Build trend chart data
  const periodKeys = Array.from(new Set(snapshots.map((s: any) => s.periodKey))).sort();
  const supplierNames = Array.from(new Set(snapshots.map((s: any) => s.supplierName)));
  const trendData = periodKeys.map((pk: string) => {
    const row: any = { period: pk };
    supplierNames.forEach((sn: string) => {
      const snap = snapshots.find((s: any) => s.periodKey === pk && s.supplierName === sn);
      row[sn] = snap?.invoicedExGst ? parseFloat(snap.invoicedExGst) : snap?.expectedCostExGst ? parseFloat(snap.expectedCostExGst) : null;
    });
    return row;
  });

  // Revenue chart data
  const revenueChartData = revenueSnaps.map((r: any) => ({
    period: r.periodKey,
    revenue: parseFloat(r.totalRevenueExGst) || 0,
  }));

  // Current period snapshot for delta indicators
  const currentSnapshots = snapshots.filter((s: any) => s.periodKey === selectedPeriod);
  const openAlerts = discrepancies.filter((a: DiscrepancyAlert) => a.status === "open");

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Monthly Billing Cycle</h1>
          <p className="text-sm text-zinc-400 mt-0.5">Manage monthly reconciliation inputs, track supplier costs, and detect discrepancies</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
            <SelectTrigger className="w-44 bg-zinc-900 border-zinc-700 text-zinc-100">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-700">
              {PERIOD_OPTIONS.map((p) => (
                <SelectItem key={p.key} value={p.key} className="text-zinc-100 focus:bg-zinc-800">
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            className="border-zinc-600 bg-transparent hover:bg-zinc-800 text-zinc-300"
            onClick={() => snapshotCosts.mutate({ periodKey: selectedPeriod })}
            disabled={snapshotCosts.isPending}
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${snapshotCosts.isPending ? "animate-spin" : ""}`} />
            Refresh Costs
          </Button>
        </div>
      </div>

      {/* Progress banner */}
      <Card className="bg-zinc-900 border-zinc-700">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-zinc-200">
                {PERIOD_OPTIONS.find(p => p.key === selectedPeriod)?.label ?? selectedPeriod} Checklist
              </span>
              {allDone && (
                <Badge className="bg-green-500/20 text-green-400 border-green-500/40 text-xs">Complete</Badge>
              )}
            </div>
            <span className="text-sm text-zinc-400">{completed.length} / {required.length} required inputs</span>
          </div>
          <Progress value={progress} className="h-2 bg-zinc-800" />
          {allDone && (
            <p className="text-xs text-green-400 mt-2 flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" />
              All required inputs received. You can now run the reconciliation analysis.
            </p>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="checklist" className="space-y-4">
        <TabsList className="bg-zinc-900 border border-zinc-700">
          <TabsTrigger value="checklist" className="data-[state=active]:bg-zinc-700 text-zinc-300">
            Checklist
            {required.length - completed.length > 0 && (
              <Badge className="ml-1.5 bg-amber-500/20 text-amber-400 border-amber-500/40 text-xs">
                {required.length - completed.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="discrepancies" className="data-[state=active]:bg-zinc-700 text-zinc-300">
            Discrepancies
            {openAlerts.length > 0 && (
              <Badge className="ml-1.5 bg-red-500/20 text-red-400 border-red-500/40 text-xs">{openAlerts.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="trends" className="data-[state=active]:bg-zinc-700 text-zinc-300">
            Cost Trends
          </TabsTrigger>
          <TabsTrigger value="revenue" className="data-[state=active]:bg-zinc-700 text-zinc-300">
            Revenue
          </TabsTrigger>
        </TabsList>

        {/* ── Checklist Tab ── */}
        <TabsContent value="checklist" className="space-y-6">
          {checklistLoading ? (
            <div className="text-zinc-400 text-sm">Loading checklist...</div>
          ) : checklist.length === 0 ? (
            <div className="text-zinc-400 text-sm">No checklist items for this period.</div>
          ) : (
            Object.entries(CATEGORY_LABELS).map(([cat, label]) => {
              const items = grouped[cat] || [];
              if (items.length === 0) return null;
              const catDone = items.filter((i: ChecklistItem) => i.status === "uploaded" || i.status === "synced").length;
              return (
                <div key={cat}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-zinc-400">{CATEGORY_ICONS[cat]}</span>
                    <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide">{label}</h3>
                    <Badge variant="outline" className="text-xs border-zinc-600 text-zinc-400">
                      {catDone}/{items.length}
                    </Badge>
                  </div>
                  <div className="space-y-2">
                    {items.map((item: ChecklistItem) => (
                      <ChecklistCard
                        key={item.itemKey}
                        item={item}
                        onMark={(itemKey, status, notes) =>
                          markItem.mutate({ periodKey: selectedPeriod, itemKey, status, notes })
                        }
                      />
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </TabsContent>

        {/* ── Discrepancies Tab ── */}
        <TabsContent value="discrepancies" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-zinc-200">Supplier Invoice Discrepancies</h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                Flags cost changes &gt;10% vs previous month. Run detection after uploading invoices.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="border-zinc-600 bg-transparent hover:bg-zinc-800 text-zinc-300"
                onClick={() => runDetection.mutate({ periodKey: selectedPeriod })}
                disabled={runDetection.isPending}
              >
                <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${runDetection.isPending ? "animate-spin" : ""}`} />
                Run Detection
              </Button>
              {openAlerts.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="border-orange-600 text-orange-400 bg-transparent hover:bg-orange-900/20"
                  onClick={() => sendEmail.mutate({ periodKey: selectedPeriod })}
                  disabled={sendEmail.isPending}
                >
                  <Mail className="h-3.5 w-3.5 mr-1.5" />
                  Email Digest ({openAlerts.length})
                </Button>
              )}
            </div>
          </div>

          {discLoading ? (
            <div className="text-zinc-400 text-sm">Loading...</div>
          ) : discrepancies.length === 0 ? (
            <div className="rounded-lg border border-zinc-700 bg-zinc-900/60 p-6 text-center">
              <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto mb-2" />
              <p className="text-sm text-zinc-300">No discrepancies detected for this period.</p>
              <p className="text-xs text-zinc-500 mt-1">Run detection after uploading invoices to check for changes &gt;10%.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {discrepancies.map((alert: DiscrepancyAlert) => (
                <AlertCard
                  key={alert.id}
                  alert={alert}
                  onAcknowledge={(id, status, resolution) =>
                    acknowledgeAlert.mutate({ alertId: id, status, resolution })
                  }
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Cost Trends Tab ── */}
        <TabsContent value="trends" className="space-y-4">
          {/* Delta cards for current period */}
          {currentSnapshots.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {currentSnapshots.map((snap: any) => {
                const delta = snap.deltaPct ? parseFloat(snap.deltaPct) : null;
                const dir = snap.deltaDirection;
                return (
                  <Card key={snap.supplierName} className="bg-zinc-900 border-zinc-700">
                    <CardContent className="pt-3 pb-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-zinc-400 truncate">{snap.supplierDisplayName || snap.supplierName}</span>
                        {dir === "up" && <TrendingUp className="h-3.5 w-3.5 text-red-400 flex-shrink-0" />}
                        {dir === "down" && <TrendingDown className="h-3.5 w-3.5 text-green-400 flex-shrink-0" />}
                        {dir === "flat" && <Minus className="h-3.5 w-3.5 text-zinc-500 flex-shrink-0" />}
                        {dir === "new" && <span className="text-xs text-blue-400">NEW</span>}
                      </div>
                      <p className="text-base font-bold text-zinc-100">
                        {fmt(snap.invoicedExGst || snap.expectedCostExGst)}
                      </p>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        {snap.serviceCount} services
                        {delta !== null && (
                          <span className={`ml-1 font-medium ${delta > 0 ? "text-red-400" : delta < 0 ? "text-green-400" : "text-zinc-500"}`}>
                            {fmtPct(delta)}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-zinc-600 mt-0.5 flex items-center gap-1">
                        <Info className="h-3 w-3" />
                        {snap.invoicedExGst ? "Invoiced" : "Expected cost"}
                      </p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Line chart */}
          <Card className="bg-zinc-900 border-zinc-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-zinc-200">Supplier Cost Trend (ex GST)</CardTitle>
              <p className="text-xs text-zinc-500">Invoiced amounts where available, otherwise expected cost from service records</p>
            </CardHeader>
            <CardContent>
              {trendData.length === 0 ? (
                <div className="text-zinc-500 text-sm text-center py-8">No trend data available yet</div>
              ) : (
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={trendData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis dataKey="period" tick={{ fill: "#71717a", fontSize: 11 }} />
                    <YAxis tick={{ fill: "#71717a", fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                    <Tooltip
                      contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 6, fontSize: 12 }}
                      labelStyle={{ color: "#e4e4e7" }}
                      formatter={(v: any) => [`$${parseFloat(v).toLocaleString("en-AU", { minimumFractionDigits: 2 })}`, ""]}
                    />
                    <Legend wrapperStyle={{ fontSize: 11, color: "#a1a1aa" }} />
                    {supplierNames.slice(0, 8).map((sn: string) => (
                      <Line
                        key={sn}
                        type="monotone"
                        dataKey={sn}
                        stroke={SUPPLIER_COLORS[sn] || "#6b7280"}
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        connectNulls
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Revenue Tab ── */}
        <TabsContent value="revenue" className="space-y-4">
          <Card className="bg-zinc-900 border-zinc-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-zinc-200">Total Revenue Trend (ex GST)</CardTitle>
              <p className="text-xs text-zinc-500">From Xero invoice exports. Upload March 2026 Xero export to add this month's data.</p>
            </CardHeader>
            <CardContent>
              {revenueChartData.length === 0 ? (
                <div className="text-zinc-500 text-sm text-center py-8">No revenue data available</div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={revenueChartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis dataKey="period" tick={{ fill: "#71717a", fontSize: 11 }} />
                    <YAxis tick={{ fill: "#71717a", fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                    <Tooltip
                      contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 6, fontSize: 12 }}
                      labelStyle={{ color: "#e4e4e7" }}
                      formatter={(v: any) => [`$${parseFloat(v).toLocaleString("en-AU", { minimumFractionDigits: 2 })}`, "Revenue"]}
                    />
                    <Bar dataKey="revenue" fill="#e95b2a" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Revenue summary cards */}
          {revenueChartData.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {revenueChartData.slice(-4).reverse().map((r: any) => {
                const prev = revenueChartData[revenueChartData.indexOf(r) - 1];
                const delta = prev ? ((r.revenue - prev.revenue) / prev.revenue) * 100 : null;
                return (
                  <Card key={r.period} className="bg-zinc-900 border-zinc-700">
                    <CardContent className="pt-3 pb-3">
                      <p className="text-xs text-zinc-400">{r.period}</p>
                      <p className="text-lg font-bold text-zinc-100 mt-0.5">
                        ${(r.revenue / 1000).toFixed(1)}k
                      </p>
                      {delta !== null && (
                        <p className={`text-xs mt-0.5 ${delta > 0 ? "text-green-400" : "text-red-400"}`}>
                          {delta > 0 ? "↑" : "↓"} {Math.abs(delta).toFixed(1)}% vs prev
                        </p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
