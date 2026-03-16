import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Search,
  Filter,
  Phone,
  Cpu,
  DollarSign,
  Clock,
  FileText,
  ChevronDown,
  ChevronUp,
  Info,
} from "lucide-react";

type TermSvc = {
  id: number;
  phoneNumber: string | null;
  simSerialNumber: string | null;
  imei: string | null;
  userName: string | null;
  flexiplanName: string | null;
  flexiplanCode: string | null;
  monthlyCost: number;
  blitzBillMar26: number | null;
  blitzAvg3mBill: number | null;
  isZeroCost: boolean;
  blitzLastUsedDate: string | null;
  blitzNoUse3m: number;
  blitzNoUse6m: number;
  blitzMroContract: string | null;
  blitzMroEndDate: string | null;
  blitzMroEtc: number | null;
  blitzMroDeviceName: string | null;
  blitzAvg3mDataMb: number | null;
  blitzAvg6mDataMb: number | null;
  blitzAvg3mVoiceMins: number | null;
  blitzAvg6mVoiceMins: number | null;
  blitzAccountNumber: string | null;
  blitzPostcode: string | null;
  blitzDeviceAgeMths: number | null;
  deviceName: string | null;
  deviceType: string | null;
  serviceActivationDate: string | null;
  terminationNote: string | null;
  customerExternalId: string | null;
  customerName: string | null;
  locationAddress: string | null;
  status: string;
  blitzImportDate: string | null;
  blitzReportName: string | null;
};

function formatMB(mb: number | null): string {
  if (!mb || mb === 0) return "0 MB";
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${Math.round(mb)} MB`;
};

function SvcDetailDialog({
  svc,
  onClose,
}: {
  svc: TermSvc;
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="w-4 h-4 text-red-500" />
            {svc.phoneNumber}
            {svc.isZeroCost && (
              <Badge variant="outline" className="text-slate-500 border-slate-400 text-xs ml-1">
                $0 Cost
              </Badge>
            )}
            {svc.blitzMroContract && (
              <Badge className="bg-amber-500 text-white text-xs ml-1">
                MRO Contract
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          {/* Termination Note */}
          {svc.terminationNote && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="font-semibold text-red-800 mb-1 flex items-center gap-1">
                <AlertTriangle className="w-4 h-4" /> Agent Review Note
              </p>
              <pre className="whitespace-pre-wrap text-red-700 text-xs font-mono leading-relaxed">
                {svc.terminationNote}
              </pre>
            </div>
          )}

          {/* Key details grid */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-slate-500 text-xs uppercase tracking-wide mb-1">Service Details</p>
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-600">Phone</span>
                  <span className="font-mono font-medium">{svc.phoneNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">SIM Serial</span>
                  <span className="font-mono text-xs">{svc.simSerialNumber || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">IMEI</span>
                  <span className="font-mono text-xs">{svc.imei || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Account #</span>
                  <span className="font-mono">{svc.blitzAccountNumber || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Activation</span>
                  <span>{svc.serviceActivationDate || "—"}</span>
                </div>
              </div>
            </div>

            <div>
              <p className="text-slate-500 text-xs uppercase tracking-wide mb-1">Plan & Cost</p>
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-600">Plan</span>
                  <span className="text-right max-w-[160px] truncate" title={svc.flexiplanName ?? undefined}>
                    {svc.flexiplanName || "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Mar 2026 Bill</span>
                  <span className={svc.isZeroCost ? "text-slate-400" : "font-semibold text-red-600"}>
                    ${(svc.blitzBillMar26 ?? svc.monthlyCost).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">3-Month Avg</span>
                  <span>${(svc.blitzAvg3mBill ?? 0).toFixed(2)}</span>
                </div>
                {svc.isZeroCost && (
                  <div className="text-slate-400 text-xs italic mt-1">
                    ⚠️ $0 cost — no direct financial saving from termination
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Usage */}
          <div>
            <p className="text-slate-500 text-xs uppercase tracking-wide mb-1">Usage (Prior to March 2026)</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-slate-50 rounded p-2">
                <p className="text-xs text-slate-500">3-Month Avg Data</p>
                <p className="font-semibold">{formatMB(svc.blitzAvg3mDataMb)}</p>
              </div>
              <div className="bg-slate-50 rounded p-2">
                <p className="text-xs text-slate-500">6-Month Avg Data</p>
                <p className="font-semibold">{formatMB(svc.blitzAvg6mDataMb)}</p>
              </div>
              <div className="bg-slate-50 rounded p-2">
                <p className="text-xs text-slate-500">3-Month Avg Voice</p>
                <p className="font-semibold">{svc.blitzAvg3mVoiceMins ? `${svc.blitzAvg3mVoiceMins} mins` : "0 mins"}</p>
              </div>
              <div className="bg-slate-50 rounded p-2">
                <p className="text-xs text-slate-500">Last Network Activity</p>
                <p className="font-semibold text-red-600">{svc.blitzLastUsedDate || "Never recorded"}</p>
              </div>
            </div>
          </div>

          {/* Device */}
          {svc.deviceName && (
            <div>
              <p className="text-slate-500 text-xs uppercase tracking-wide mb-1">Device</p>
              <div className="bg-slate-50 rounded p-2 space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-600">Device</span>
                  <span>{svc.deviceName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Type</span>
                  <span>{svc.deviceType || "—"}</span>
                </div>
                {svc.blitzDeviceAgeMths !== null && (
                  <div className="flex justify-between">
                    <span className="text-slate-600">Age</span>
                    <span>{svc.blitzDeviceAgeMths} months</span>
                  </div>
                )}
                {svc.blitzPostcode && (
                  <div className="flex justify-between">
                    <span className="text-slate-600">Last-used Postcode</span>
                    <span>{svc.blitzPostcode}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* MRO Contract Warning */}
          {svc.blitzMroContract && (
            <div className="bg-amber-50 border border-amber-300 rounded-lg p-3">
              <p className="font-semibold text-amber-800 mb-1 flex items-center gap-1">
                <AlertTriangle className="w-4 h-4" /> MRO Contract Active — Review Before Terminating
              </p>
              <div className="space-y-1 text-amber-700 text-xs">
                <div className="flex justify-between">
                  <span>Contract</span>
                  <span className="font-mono">{svc.blitzMroContract}</span>
                </div>
                <div className="flex justify-between">
                  <span>Device</span>
                  <span>{svc.blitzMroDeviceName}</span>
                </div>
                <div className="flex justify-between">
                  <span>Contract End</span>
                  <span>{svc.blitzMroEndDate}</span>
                </div>
                <div className="flex justify-between">
                  <span>Early Termination Charge</span>
                  <span className="font-semibold">${svc.blitzMroEtc?.toFixed(2) ?? "Unknown"}</span>
                </div>
              </div>
            </div>
          )}

          {/* Customer assignment */}
          {svc.customerName && (
            <div>
              <p className="text-slate-500 text-xs uppercase tracking-wide mb-1">Assigned Customer</p>
              <p className="font-medium">{svc.customerName}</p>
              {svc.locationAddress && (
                <p className="text-slate-500 text-xs">{svc.locationAddress}</p>
              )}
            </div>
          )}

          {/* User name */}
          {svc.userName && (
            <div>
              <p className="text-slate-500 text-xs uppercase tracking-wide mb-1">Telstra User Name</p>
              <p className="font-medium">{svc.userName}</p>
            </div>
          )}

          {/* Source */}
          <div className="text-xs text-slate-400 border-t pt-2">
            Imported from: {svc.blitzReportName} on {svc.blitzImportDate}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function BlitzTerminationReview() {
  const { data: list = [], isLoading } = trpc.billing.blitz.terminationList.useQuery();
  const { data: stats } = trpc.billing.blitz.importStats.useQuery();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "paid" | "zero" | "mro">("all");
  const [selected, setSelected] = useState<TermSvc | null>(null);
  const [sortField, setSortField] = useState<"cost" | "phone" | "lastUsed">("cost");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const filtered = useMemo(() => {
    let result = [...list];

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (s) =>
          s.phoneNumber?.includes(q) ||
          s.simSerialNumber?.toLowerCase().includes(q) ||
          s.imei?.toLowerCase().includes(q) ||
          s.userName?.toLowerCase().includes(q) ||
          s.customerName?.toLowerCase().includes(q) ||
          s.blitzAccountNumber?.includes(q) ||
          s.flexiplanName?.toLowerCase().includes(q)
      );
    }

    // Filter
    if (filter === "paid") result = result.filter((s) => !s.isZeroCost);
    if (filter === "zero") result = result.filter((s) => s.isZeroCost);
    if (filter === "mro") result = result.filter((s) => !!s.blitzMroContract);

    // Sort
    result.sort((a, b) => {
      let av = 0, bv = 0;
      if (sortField === "cost") { av = a.monthlyCost; bv = b.monthlyCost; }
      else if (sortField === "phone") return sortDir === "asc" ? (a.phoneNumber || "").localeCompare(b.phoneNumber || "") : (b.phoneNumber || "").localeCompare(a.phoneNumber || "");
      else if (sortField === "lastUsed") return sortDir === "asc" ? (a.blitzLastUsedDate || "").localeCompare(b.blitzLastUsedDate || "") : (b.blitzLastUsedDate || "").localeCompare(a.blitzLastUsedDate || "");
      return sortDir === "asc" ? av - bv : bv - av;
    });

    return result;
  }, [list, search, filter, sortField, sortDir]);

  const totalSavings = filtered.filter((s) => !s.isZeroCost).reduce((sum, s) => sum + s.monthlyCost, 0);
  const mroCount = filtered.filter((s) => !!s.blitzMroContract).length;
  const zeroCostCount = filtered.filter((s) => s.isZeroCost).length;

  function toggleSort(field: typeof sortField) {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDir("desc"); }
  }

  function SortIcon({ field }: { field: typeof sortField }) {
    if (sortField !== field) return null;
    return sortDir === "asc" ? <ChevronUp className="w-3 h-3 inline ml-1" /> : <ChevronDown className="w-3 h-3 inline ml-1" />;
  }

  // CSV export
  function exportCSV() {
    const headers = [
      "Phone Number", "SIM Serial Number", "IMEI", "Telstra Account Number",
      "Telstra User Name", "Plan Name", "Plan Code",
      "Mar 2026 Bill ($)", "3-Month Avg Bill ($)", "Monthly Cost ($)",
      "Zero Cost Service", "Last Network Activity",
      "No Use 3 Months", "No Use 6 Months",
      "MRO Contract", "MRO End Date", "MRO ETC ($)", "MRO Device",
      "3-Month Avg Data", "6-Month Avg Data",
      "3-Month Avg Voice (mins)", "6-Month Avg Voice (mins)",
      "Device Name", "Device Type", "Device Age (months)",
      "Last-used Postcode", "Service Activation Date",
      "Assigned Customer", "Location Address",
      "Termination Reason", "Import Source"
    ];

    const rows = list.map((s) => [
      s.phoneNumber,
      s.simSerialNumber || "",
      s.imei || "",
      s.blitzAccountNumber || "",
      s.userName || "",
      s.flexiplanName || "",
      s.flexiplanCode || "",
      (s.blitzBillMar26 ?? s.monthlyCost).toFixed(2),
      (s.blitzAvg3mBill ?? 0).toFixed(2),
      s.monthlyCost.toFixed(2),
      s.isZeroCost ? "YES - $0 cost service (no direct financial saving)" : "No",
      s.blitzLastUsedDate || "Never recorded",
      s.blitzNoUse3m ? "Yes" : "No",
      s.blitzNoUse6m ? "Yes" : "No",
      s.blitzMroContract || "",
      s.blitzMroEndDate || "",
      s.blitzMroEtc?.toFixed(2) || "",
      s.blitzMroDeviceName || "",
      formatMB(s.blitzAvg3mDataMb),
      formatMB(s.blitzAvg6mDataMb),
      s.blitzAvg3mVoiceMins?.toString() || "0",
      s.blitzAvg6mVoiceMins?.toString() || "0",
      s.deviceName || "",
      s.deviceType || "",
      s.blitzDeviceAgeMths?.toString() || "",
      s.blitzPostcode || "",
      s.serviceActivationDate || "",
      s.customerName || "Unassigned",
      s.locationAddress || "",
      "No usage recorded in 6 months prior to March 2026 (Blitz Report verification)",
      `${s.blitzReportName} (${s.blitzImportDate})`
    ]);

    const csvContent = [headers, ...rows]
      .map((row: (string | number | boolean | null | undefined)[]) => row.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Telstra_Termination_List_March2026_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <AlertTriangle className="w-6 h-6 text-red-500" />
              Blitz Termination Review
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              Services with no usage in 6 months — March 2026 Blitz Report. Review and submit to Telstra for termination.
            </p>
          </div>
          <Button onClick={exportCSV} className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white">
            <Download className="w-4 h-4" />
            Export Termination List (CSV)
          </Button>
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border-red-200 bg-red-50">
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-red-600 uppercase tracking-wide font-medium">Flagged for Termination</p>
              <p className="text-3xl font-bold text-red-700 mt-1">{stats?.flaggedForTermination ?? list.length}</p>
              <p className="text-xs text-red-500 mt-1">services, no use 6+ months</p>
            </CardContent>
          </Card>
          <Card className="border-emerald-200 bg-emerald-50">
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-emerald-600 uppercase tracking-wide font-medium">Monthly Savings (Paid)</p>
              <p className="text-3xl font-bold text-emerald-700 mt-1">
                ${(stats?.totalMonthlySavings ?? 0).toFixed(0)}
              </p>
              <p className="text-xs text-emerald-500 mt-1">{stats?.paidFlagged ?? 0} paid services</p>
            </CardContent>
          </Card>
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-amber-600 uppercase tracking-wide font-medium">MRO Contracts</p>
              <p className="text-3xl font-bold text-amber-700 mt-1">{stats?.mroContractFlagged ?? 0}</p>
              <p className="text-xs text-amber-500 mt-1">review ETC before terminating</p>
            </CardContent>
          </Card>
          <Card className="border-slate-200 bg-slate-50">
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-slate-600 uppercase tracking-wide font-medium">$0 Cost Services</p>
              <p className="text-3xl font-bold text-slate-700 mt-1">{stats?.zeroCostFlagged ?? 0}</p>
              <p className="text-xs text-slate-500 mt-1">DOT/backup plans, no cost saving</p>
            </CardContent>
          </Card>
        </div>

        {/* Info banner */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex gap-2 text-sm text-blue-800">
          <Info className="w-4 h-4 mt-0.5 flex-shrink-0 text-blue-500" />
          <div>
            <strong>Source of truth:</strong> All data sourced from {stats?.lastReportName || "March 2026 Blitz Summary"} (imported {stats?.lastImportDate || "2026-03-16"}).
            Each service has a detailed agent note explaining the termination reason. Click any row to view full details.
            Export the CSV to provide to Telstra to facilitate terminations.
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search phone, SIM, IMEI, customer..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex gap-2">
           {(["all", "paid", "zero", "mro"] as const).map((f) => (
              <Button
                key={f}
                variant={filter === f ? "default" : "outline"}
                size="sm"
                onClick={() => setFilter(f)}
                className={filter === f ? "bg-red-600 hover:bg-red-700" : ""}
              >
                {f === "all" ? `All (${list.length})` : f === "paid" ? `Paid (${list.filter((s: TermSvc) => !s.isZeroCost).length})` : f === "zero" ? `$0 Cost (${list.filter((s: TermSvc) => s.isZeroCost).length})` : `MRO Contract (${list.filter((s: TermSvc) => !!s.blitzMroContract).length})`}
              </Button>
            ))}
          </div>
        </div>

        {/* Showing summary */}
        {filtered.length > 0 && (
          <div className="text-sm text-slate-500">
            Showing {filtered.length} services — potential monthly saving:{" "}
            <span className="font-semibold text-emerald-700">${totalSavings.toFixed(2)}</span>
            {mroCount > 0 && (
              <span className="ml-2 text-amber-600">
                · {mroCount} with MRO contract (review ETC)
              </span>
            )}
            {zeroCostCount > 0 && (
              <span className="ml-2 text-slate-400">
                · {zeroCostCount} $0 cost (no saving)
              </span>
            )}
          </div>
        )}

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("phone")}>
                      Phone <SortIcon field="phone" />
                    </TableHead>
                    <TableHead>SIM / IMEI</TableHead>
                    <TableHead>Telstra Account</TableHead>
                    <TableHead>User Name</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("cost")}>
                      Mar 2026 Bill <SortIcon field="cost" />
                    </TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("lastUsed")}>
                      Last Activity <SortIcon field="lastUsed" />
                    </TableHead>
                    <TableHead>Flags</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-12 text-slate-400">
                        Loading termination list...
                      </TableCell>
                    </TableRow>
                  ) : filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-12 text-slate-400">
                        No services match your search.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((svc) => (
                      <TableRow
                        key={svc.id}
                        className="cursor-pointer hover:bg-red-50/50 transition-colors"
                        onClick={() => setSelected(svc)}
                      >
                        <TableCell>
                          <span className="font-mono font-medium text-slate-800">{svc.phoneNumber}</span>
                        </TableCell>
                        <TableCell>
                          <div className="text-xs font-mono text-slate-600">
                            <div>{svc.simSerialNumber || "—"}</div>
                            {svc.imei && <div className="text-slate-400">{svc.imei}</div>}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="font-mono text-xs text-slate-600">{svc.blitzAccountNumber || "—"}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-slate-700">{svc.userName || <span className="text-slate-400 italic">—</span>}</span>
                        </TableCell>
                        <TableCell>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger>
                                <span className="text-xs text-slate-600 max-w-[140px] truncate block">
                                  {svc.flexiplanName || "—"}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>{svc.flexiplanName}</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </TableCell>
                        <TableCell>
                          {svc.isZeroCost ? (
                            <span className="text-slate-400 font-medium">$0.00</span>
                          ) : (
                            <span className="font-semibold text-red-600">
                              ${(svc.blitzBillMar26 ?? svc.monthlyCost).toFixed(2)}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-red-600 font-medium">
                            {svc.blitzLastUsedDate || "Never"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {svc.isZeroCost && (
                              <Badge variant="outline" className="text-slate-500 border-slate-300 text-xs px-1 py-0">
                                $0
                              </Badge>
                            )}
                            {svc.blitzMroContract && (
                              <Badge className="bg-amber-500 text-white text-xs px-1 py-0">
                                MRO
                              </Badge>
                            )}
                            {svc.blitzNoUse3m === 1 && (
                              <Badge className="bg-red-100 text-red-700 text-xs px-1 py-0 border border-red-200">
                                3m
                              </Badge>
                            )}
                            <Badge className="bg-red-600 text-white text-xs px-1 py-0">
                              6m
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-slate-600 max-w-[120px] truncate block">
                            {svc.customerName || <span className="text-slate-400 italic">Unassigned</span>}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-slate-500 hover:text-red-600"
                            onClick={(e) => { e.stopPropagation(); setSelected(svc); }}
                          >
                            <FileText className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {selected && <SvcDetailDialog svc={selected} onClose={() => setSelected(null)} />}
    </DashboardLayout>
  );
}
