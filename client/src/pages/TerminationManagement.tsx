/**
 * Termination Management Page
 * Lists all services in termination workflow states (flagged_for_termination,
 * termination_requested, terminated) with full detail, supplier filtering,
 * bulk status updates, and CSV/Excel export for supplier emailing.
 */
import { useState, useMemo, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Download,
  Filter,
  ChevronDown,
  ChevronRight,
  CheckSquare,
  Square,
  AlertTriangle,
  Clock,
  XCircle,
  Archive,
  RefreshCw,
  Search,
  Building2,
  MapPin,
  Phone,
  Wifi,
  Hash,
  User,
  DollarSign,
  FileText,
} from "lucide-react";

// ─── Status config ────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  flagged_for_termination: {
    label: "Flagged",
    color: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    icon: AlertTriangle,
    next: "termination_requested" as const,
    nextLabel: "Mark as Termination Requested",
  },
  termination_requested: {
    label: "Requested",
    color: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    icon: Clock,
    next: "terminated" as const,
    nextLabel: "Mark as Terminated",
  },
  terminated: {
    label: "Terminated",
    color: "bg-red-500/20 text-red-400 border-red-500/30",
    icon: XCircle,
    next: "archived" as const,
    nextLabel: "Archive Services",
  },
  archived: {
    label: "Archived",
    color: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
    icon: Archive,
    next: null,
    nextLabel: null,
  },
} as const;

type TermStatus = keyof typeof STATUS_CONFIG;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtCost(v: any) {
  const n = parseFloat(v ?? "0");
  return isNaN(n) ? "$0.00" : `$${n.toFixed(2)}`;
}

function fmtDate(v: any) {
  if (!v) return "—";
  try {
    return new Date(v).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return String(v);
  }
}

function sanitize(v: any) {
  if (v == null || v === "") return "";
  return String(v).replace(/"/g, '""');
}

// ─── Export helpers ───────────────────────────────────────────────────────────
function exportToCSV(rows: any[], supplierName: string) {
  const headers = [
    "Service ID", "AVC ID", "Connection ID", "Phone Number", "Service Type",
    "Plan Name", "Supplier", "Account Number", "Customer Name", "Site Address",
    "Contact Name", "Contact Phone", "Contact Email", "Technology", "Speed Tier",
    "NBN SLA", "Carbon Service ID", "AAPT Service ID", "AAPT Access ID",
    "IMEI", "SIM Serial", "Device Name", "Username", "Activation Date",
    "Contract End Date", "Monthly Cost", "Status", "Termination Note",
    "Termination Requested At", "Termination Requested By",
  ];

  const csvRows = rows.map(r => [
    sanitize(r.serviceId || r.externalId),
    sanitize(r.avcId),
    sanitize(r.connectionId),
    sanitize(r.phoneNumber),
    sanitize(r.serviceType),
    sanitize(r.planName),
    sanitize(r.supplierName),
    sanitize(r.supplierAccount || r.aaptAccountNumber || r.blitzAccountNumber),
    sanitize(r.customerName),
    sanitize(r.siteAddress || r.locationAddress),
    sanitize(r.contactName),
    sanitize(r.contactPhone),
    sanitize(r.contactEmail),
    sanitize(r.technology),
    sanitize(r.speedTier),
    sanitize(r.nbnSla),
    sanitize(r.carbonServiceId),
    sanitize(r.aaptServiceId),
    sanitize(r.aaptAccessId),
    sanitize(r.imei),
    sanitize(r.simSerialNumber),
    sanitize(r.deviceName),
    sanitize(r.userName),
    sanitize(r.serviceActivationDate),
    sanitize(r.contractEndDate),
    sanitize(r.monthlyCost),
    sanitize(r.status),
    sanitize(r.terminationNote),
    sanitize(r.terminationRequestedAt ? new Date(r.terminationRequestedAt).toLocaleDateString("en-AU") : ""),
    sanitize(r.terminationRequestedBy),
  ].map(v => `"${v}"`).join(","));

  const csv = [headers.map(h => `"${h}"`).join(","), ...csvRows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const date = new Date().toISOString().slice(0, 10);
  const supplier = supplierName.replace(/\s+/g, "_");
  a.download = `SmileTel_Termination_${supplier}_${date}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Service Row ──────────────────────────────────────────────────────────────
function ServiceRow({
  service,
  selected,
  onToggle,
}: {
  service: any;
  selected: boolean;
  onToggle: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const cfg = STATUS_CONFIG[service.status as TermStatus] ?? STATUS_CONFIG.flagged_for_termination;
  const Icon = cfg.icon;

  const primaryId = service.avcId || service.connectionId || service.carbonServiceId ||
    service.aaptServiceId || service.serviceId || service.externalId;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <TableRow
          className="cursor-pointer hover:bg-white/5 transition-colors"
          onClick={() => setOpen(!open)}
        >
          <TableCell onClick={e => e.stopPropagation()} className="w-10">
            <Checkbox
              checked={selected}
              onCheckedChange={() => onToggle(service.externalId)}
              aria-label="Select service"
            />
          </TableCell>
          <TableCell className="font-mono text-xs text-zinc-400">
            <div className="flex items-center gap-1">
              {open ? <ChevronDown className="w-3 h-3 shrink-0" /> : <ChevronRight className="w-3 h-3 shrink-0" />}
              <span className="truncate max-w-[120px]" title={primaryId}>{primaryId || "—"}</span>
            </div>
          </TableCell>
          <TableCell>
            <div className="font-medium text-sm">{service.customerName || "Unassigned"}</div>
            <div className="text-xs text-zinc-500 truncate max-w-[200px]" title={service.siteAddress || service.locationAddress}>
              {service.siteAddress || service.locationAddress || "—"}
            </div>
          </TableCell>
          <TableCell className="text-sm">
            <div>{service.phoneNumber || service.serviceId || "—"}</div>
            <div className="text-xs text-zinc-500">{service.serviceType}</div>
          </TableCell>
          <TableCell className="text-sm text-zinc-300 max-w-[160px] truncate" title={service.planName}>
            {service.planName || "—"}
          </TableCell>
          <TableCell className="text-sm text-zinc-400">
            {service.supplierAccount || service.aaptAccountNumber || service.blitzAccountNumber || "—"}
          </TableCell>
          <TableCell className="text-sm font-medium text-emerald-400">
            {fmtCost(service.monthlyCost)}
          </TableCell>
          <TableCell>
            <Badge variant="outline" className={`text-xs ${cfg.color} flex items-center gap-1 w-fit`}>
              <Icon className="w-3 h-3" />
              {cfg.label}
            </Badge>
          </TableCell>
        </TableRow>
      </CollapsibleTrigger>
      <CollapsibleContent asChild>
        <TableRow className="bg-zinc-900/50">
          <TableCell colSpan={8} className="p-0">
            <div className="px-6 py-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 text-xs">
              {/* Service IDs */}
              <div>
                <p className="text-zinc-500 uppercase tracking-wider mb-2 font-semibold">Service Identifiers</p>
                <Detail icon={Hash} label="AVC ID" value={service.avcId} />
                <Detail icon={Hash} label="Connection ID" value={service.connectionId} />
                <Detail icon={Hash} label="Carbon ID" value={service.carbonServiceId} />
                <Detail icon={Hash} label="AAPT Service ID" value={service.aaptServiceId} />
                <Detail icon={Hash} label="AAPT Access ID" value={service.aaptAccessId} />
                <Detail icon={Hash} label="Loc ID" value={service.locId} />
                <Detail icon={Hash} label="External ID" value={service.externalId} />
              </div>
              {/* Network */}
              <div>
                <p className="text-zinc-500 uppercase tracking-wider mb-2 font-semibold">Network Details</p>
                <Detail icon={Wifi} label="Technology" value={service.technology} />
                <Detail icon={Wifi} label="Speed Tier" value={service.speedTier} />
                <Detail icon={Wifi} label="NBN SLA" value={service.nbnSla} />
                <Detail icon={Wifi} label="Carbon Status" value={service.carbonStatus} />
                <Detail icon={Wifi} label="Carbon Alias" value={service.carbonAlias} />
                <Detail icon={Phone} label="Phone" value={service.phoneNumber} />
                <Detail icon={Hash} label="IMEI" value={service.imei} />
                <Detail icon={Hash} label="SIM Serial" value={service.simSerialNumber} />
              </div>
              {/* Customer & Location */}
              <div>
                <p className="text-zinc-500 uppercase tracking-wider mb-2 font-semibold">Customer & Location</p>
                <Detail icon={Building2} label="Customer" value={service.customerName} />
                <Detail icon={MapPin} label="Site Address" value={service.siteAddress || service.locationAddress} />
                <Detail icon={User} label="Contact" value={service.contactName} />
                <Detail icon={Phone} label="Contact Phone" value={service.contactPhone} />
                <Detail icon={User} label="Username" value={service.userName} />
                <Detail icon={Hash} label="Device" value={service.deviceName} />
              </div>
              {/* Billing & Dates */}
              <div>
                <p className="text-zinc-500 uppercase tracking-wider mb-2 font-semibold">Billing & Dates</p>
                <Detail icon={DollarSign} label="Monthly Cost" value={fmtCost(service.monthlyCost)} />
                <Detail icon={DollarSign} label="MRO ETC" value={service.blitzMroEtc ? fmtCost(service.blitzMroEtc) : undefined} />
                <Detail icon={Hash} label="Contract End" value={service.contractEndDate} />
                <Detail icon={Hash} label="MRO End" value={service.blitzMroEndDate} />
                <Detail icon={Hash} label="Activation" value={service.serviceActivationDate} />
                <Detail icon={Hash} label="Term Requested" value={service.terminationRequestedAt ? fmtDate(service.terminationRequestedAt) : undefined} />
                <Detail icon={User} label="Requested By" value={service.terminationRequestedBy} />
              </div>
              {/* Notes */}
              {(service.terminationNote || service.discoveryNotes) && (
                <div className="col-span-full">
                  <p className="text-zinc-500 uppercase tracking-wider mb-2 font-semibold">Notes</p>
                  {service.terminationNote && (
                    <p className="text-zinc-300 bg-zinc-800 rounded px-3 py-2 mb-1">{service.terminationNote}</p>
                  )}
                  {service.discoveryNotes && (
                    <p className="text-zinc-400 bg-zinc-800/50 rounded px-3 py-2 text-xs">{service.discoveryNotes}</p>
                  )}
                </div>
              )}
            </div>
          </TableCell>
        </TableRow>
      </CollapsibleContent>
    </Collapsible>
  );
}

function Detail({ icon: Icon, label, value }: { icon: any; label: string; value?: string | null }) {
  if (!value || value === "0" || value === "0.00") return null;
  return (
    <div className="flex items-start gap-1.5 mb-1">
      <Icon className="w-3 h-3 text-zinc-600 mt-0.5 shrink-0" />
      <span className="text-zinc-500">{label}:</span>
      <span className="text-zinc-300 break-all">{value}</span>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function TerminationManagement() {
  const [supplierFilter, setSupplierFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [bulkNote, setBulkNote] = useState("");
  const [pendingStatus, setPendingStatus] = useState<TermStatus | null>(null);

  const { data: suppliers } = trpc.terminationMgmt.listSuppliers.useQuery();
  const { data: summary } = trpc.terminationMgmt.getSummary.useQuery();
  const { data: services, isLoading, refetch } = trpc.terminationMgmt.listFlagged.useQuery({
    supplierName: supplierFilter !== "all" ? supplierFilter : undefined,
    status: statusFilter !== "all" ? [statusFilter] : undefined,
  });

  const utils = trpc.useUtils();
  const bulkUpdate = trpc.terminationMgmt.bulkUpdateStatus.useMutation({
    onSuccess: (data) => {
      toast.success(`Updated ${data.updated} service(s) to "${data.newStatus}"`);
      setSelected(new Set());
      setBulkDialogOpen(false);
      setBulkNote("");
      utils.terminationMgmt.listFlagged.invalidate();
      utils.terminationMgmt.getSummary.invalidate();
    },
    onError: (err) => toast.error(`Update failed: ${err.message}`),
  });

  // Filter by search
  const filtered = useMemo(() => {
    if (!services) return [];
    if (!search.trim()) return services;
    const q = search.toLowerCase();
    return services.filter((s: any) =>
      [s.customerName, s.phoneNumber, s.serviceId, s.avcId, s.connectionId,
        s.planName, s.locationAddress, s.siteAddress, s.supplierAccount,
        s.carbonServiceId, s.aaptServiceId, s.externalId]
        .some(v => v && String(v).toLowerCase().includes(q))
    );
  }, [services, search]);

  // Summary totals
  const summaryByStatus = useMemo(() => {
    if (!summary) return {};
    return (summary as any[]).reduce((acc: any, row: any) => {
      const k = row.status as string;
      if (!acc[k]) acc[k] = { count: 0, cost: 0 };
      acc[k].count += Number(row.count);
      acc[k].cost += parseFloat(row.totalMonthlyCost ?? "0");
      return acc;
    }, {} as Record<string, { count: number; cost: number }>);
  }, [summary]);

  const toggleSelect = useCallback((id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((s: any) => s.externalId)));
    }
  }, [selected, filtered]);

  const handleBulkAction = (newStatus: TermStatus) => {
    setPendingStatus(newStatus);
    setBulkDialogOpen(true);
  };

  const confirmBulkAction = () => {
    if (!pendingStatus) return;
    bulkUpdate.mutate({
      externalIds: Array.from(selected),
      newStatus: pendingStatus,
      note: bulkNote || undefined,
    });
  };

  // Determine what bulk action is available for the selection
  const selectedServices = useMemo(() =>
    filtered.filter((s: any) => selected.has(s.externalId)),
    [filtered, selected]
  );

  // Always show both target actions when services are selected (regardless of mixed status)
  const availableBulkActions = useMemo(() => {
    if (selectedServices.length === 0) return [];
    return [
      { status: "termination_requested" as TermStatus, label: "Mark as Termination Requested" },
      { status: "terminated" as TermStatus, label: "Mark as Terminated" },
    ];
  }, [selectedServices]);

  const selectedMonthlyCost = useMemo(() =>
    selectedServices.reduce((sum: number, s: any) => sum + parseFloat(s.monthlyCost ?? "0"), 0),
    [selectedServices]
  );

  return (
    <div className="flex flex-col gap-6 p-6 min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Termination Management</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Manage services through the termination workflow: Flagged → Termination Requested → Terminated → Archived
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {(["flagged_for_termination", "termination_requested", "terminated"] as TermStatus[]).map(status => {
          const cfg = STATUS_CONFIG[status];
          const Icon = cfg.icon;
          const data = summaryByStatus[status] || { count: 0, cost: 0 };
          return (
            <div
              key={status}
              className={`rounded-lg border p-4 cursor-pointer transition-all ${statusFilter === status ? "border-orange-500 bg-orange-500/10" : "border-zinc-800 bg-zinc-900 hover:border-zinc-700"}`}
              onClick={() => setStatusFilter(statusFilter === status ? "all" : status)}
            >
              <div className="flex items-center gap-2 mb-2">
                <Icon className="w-4 h-4 text-zinc-400" />
                <span className="text-xs text-zinc-400 uppercase tracking-wider">{cfg.label}</span>
              </div>
              <div className="text-2xl font-bold text-white">{data.count}</div>
              <div className="text-xs text-zinc-500">{fmtCost(data.cost)}/mo</div>
            </div>
          );
        })}
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="w-4 h-4 text-zinc-400" />
            <span className="text-xs text-zinc-400 uppercase tracking-wider">Total Showing</span>
          </div>
          <div className="text-2xl font-bold text-white">{filtered.length}</div>
          <div className="text-xs text-zinc-500">
            {fmtCost(filtered.reduce((s: number, r: any) => s + parseFloat(r.monthlyCost ?? "0"), 0))}/mo
          </div>
        </div>
      </div>

      {/* Filters & Actions Bar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Supplier filter */}
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-zinc-400" />
          <Select value={supplierFilter} onValueChange={setSupplierFilter}>
            <SelectTrigger className="w-48 bg-zinc-900 border-zinc-700 text-zinc-200">
              <SelectValue placeholder="All Suppliers" />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-700 text-zinc-100">
              <SelectItem value="all" className="text-zinc-100 focus:bg-zinc-800 focus:text-white">All Suppliers</SelectItem>
              {(suppliers as any[] ?? []).map((s: any) => (
                <SelectItem key={s.supplierName} value={s.supplierName} className="text-zinc-100 focus:bg-zinc-800 focus:text-white">
                  {s.supplierName} ({s.serviceCount})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Status filter */}
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48 bg-zinc-900 border-zinc-700 text-zinc-200">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent className="bg-zinc-900 border-zinc-700 text-zinc-100">
            <SelectItem value="all" className="text-zinc-100 focus:bg-zinc-800 focus:text-white">All Statuses</SelectItem>
            <SelectItem value="flagged_for_termination" className="text-zinc-100 focus:bg-zinc-800 focus:text-white">Flagged</SelectItem>
            <SelectItem value="termination_requested" className="text-zinc-100 focus:bg-zinc-800 focus:text-white">Termination Requested</SelectItem>
            <SelectItem value="terminated" className="text-zinc-100 focus:bg-zinc-800 focus:text-white">Terminated</SelectItem>
          </SelectContent>
        </Select>

        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search customer, phone, AVC, connection ID…"
            className="pl-9 bg-zinc-900 border-zinc-700 text-zinc-200 placeholder:text-zinc-600"
          />
        </div>

        {/* Export */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => exportToCSV(
            selected.size > 0 ? selectedServices : filtered,
            supplierFilter !== "all" ? supplierFilter : "All_Suppliers"
          )}
          className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 ml-auto"
        >
          <Download className="w-4 h-4 mr-2" />
          Export CSV {selected.size > 0 ? `(${selected.size})` : `(${filtered.length})`}
        </Button>
      </div>

      {/* Bulk Action Bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-4 px-4 py-3 bg-orange-500/10 border border-orange-500/30 rounded-lg">
          <div className="flex items-center gap-2">
            <CheckSquare className="w-4 h-4 text-orange-400" />
            <span className="text-sm text-orange-300 font-medium">
              {selected.size} service{selected.size !== 1 ? "s" : ""} selected
            </span>
            <span className="text-xs text-orange-400/70">
              · {fmtCost(selectedMonthlyCost)}/mo
            </span>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            {availableBulkActions.map(action => (
              <Button
                key={action.status}
                size="sm"
                onClick={() => handleBulkAction(action.status as TermStatus)}
                className="bg-orange-600 hover:bg-orange-700 text-white"
              >
                {action.label}
              </Button>
            ))}

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelected(new Set())}
              className="text-zinc-400 hover:text-zinc-200"
            >
              Clear
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border border-zinc-800 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-zinc-800 bg-zinc-900/80 hover:bg-zinc-900/80">
              <TableHead className="w-10">
                <Checkbox
                  checked={filtered.length > 0 && selected.size === filtered.length}
                  onCheckedChange={toggleAll}
                  aria-label="Select all"
                />
              </TableHead>
              <TableHead className="text-zinc-400 text-xs uppercase tracking-wider">Service ID / AVC</TableHead>
              <TableHead className="text-zinc-400 text-xs uppercase tracking-wider">Customer / Address</TableHead>
              <TableHead className="text-zinc-400 text-xs uppercase tracking-wider">Phone / Type</TableHead>
              <TableHead className="text-zinc-400 text-xs uppercase tracking-wider">Plan</TableHead>
              <TableHead className="text-zinc-400 text-xs uppercase tracking-wider">Account</TableHead>
              <TableHead className="text-zinc-400 text-xs uppercase tracking-wider">Cost/mo</TableHead>
              <TableHead className="text-zinc-400 text-xs uppercase tracking-wider">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12 text-zinc-500">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />
                  Loading services…
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12 text-zinc-500">
                  No services found matching the current filters.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((service: any) => (
                <ServiceRow
                  key={service.externalId}
                  service={service}
                  selected={selected.has(service.externalId)}
                  onToggle={toggleSelect}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Bulk Update Confirmation Dialog */}
      <Dialog open={bulkDialogOpen} onOpenChange={setBulkDialogOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-700 text-zinc-100">
          <DialogHeader>
            <DialogTitle>Confirm Bulk Status Update</DialogTitle>
            <DialogDescription className="text-zinc-400">
              You are about to update <strong className="text-white">{selected.size} service{selected.size !== 1 ? "s" : ""}</strong> to{" "}
              <strong className="text-orange-400">"{pendingStatus?.replace(/_/g, " ")}"</strong>.
              {pendingStatus === "archived" && (
                <span className="block mt-2 text-amber-400">
                  ⚠ Archived services will be hidden from all active workflows and billing.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label className="text-sm text-zinc-300">Note (optional)</label>
            <Textarea
              value={bulkNote}
              onChange={e => setBulkNote(e.target.value)}
              placeholder="e.g. Termination confirmed by Telstra on 31 March 2026"
              className="bg-zinc-800 border-zinc-700 text-zinc-200 placeholder:text-zinc-600"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setBulkDialogOpen(false)}
              className="border-zinc-700 text-zinc-300"
            >
              Cancel
            </Button>
            <Button
              onClick={confirmBulkAction}
              disabled={bulkUpdate.isPending}
              className="bg-orange-600 hover:bg-orange-700 text-white"
            >
              {bulkUpdate.isPending ? "Updating…" : `Update ${selected.size} Service${selected.size !== 1 ? "s" : ""}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
