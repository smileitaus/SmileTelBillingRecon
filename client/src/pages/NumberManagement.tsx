/**
 * Number Management — All phone numbers owned/controlled by SmileTel/SmileIT
 * Filterable by provider, type, customer, status, and search by number/name
 * Supports CSV export, provider sync, and Group by Customer view
 */
import { useState, useMemo, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Phone,
  Search,
  Download,
  RefreshCw,
  Link2,
  Filter,
  Hash,
  Building2,
  User,
  DollarSign,
  CheckCircle,
  AlertCircle,
  XCircle,
  HelpCircle,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Fingerprint,
  Users,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";

type SortField = "number" | "provider" | "customerName" | "numberType" | "status" | "monthlyCost" | "monthlyRevenue";
type SortDir = "asc" | "desc";

const PROVIDER_COLOURS: Record<string, string> = {
  "Channel Haus": "bg-blue-100 text-blue-800 border-blue-200",
  "SasBoss": "bg-purple-100 text-purple-800 border-purple-200",
  "NetSIP": "bg-green-100 text-green-800 border-green-200",
  "Comms Code": "bg-orange-100 text-orange-800 border-orange-200",
  "Vocus": "bg-indigo-100 text-indigo-800 border-indigo-200",
  "Telstra": "bg-yellow-100 text-yellow-800 border-yellow-200",
};

const TYPE_LABELS: Record<string, { label: string; colour: string }> = {
  geographic: { label: "Geographic", colour: "bg-slate-100 text-slate-700" },
  mobile: { label: "Mobile", colour: "bg-cyan-100 text-cyan-700" },
  tollfree: { label: "Toll-Free", colour: "bg-emerald-100 text-emerald-700" },
  local: { label: "Local Rate", colour: "bg-violet-100 text-violet-700" },
  international: { label: "International", colour: "bg-rose-100 text-rose-700" },
  other: { label: "Other", colour: "bg-gray-100 text-gray-600" },
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  active: <CheckCircle className="w-3.5 h-3.5 text-green-500" />,
  porting: <RefreshCw className="w-3.5 h-3.5 text-blue-500 animate-spin" />,
  pending: <AlertCircle className="w-3.5 h-3.5 text-yellow-500" />,
  terminated: <XCircle className="w-3.5 h-3.5 text-red-500" />,
  unverified: <HelpCircle className="w-3.5 h-3.5 text-orange-400" />,
};

function SortIcon({ field, sortField, sortDir }: { field: SortField; sortField: SortField; sortDir: SortDir }) {
  if (field !== sortField) return <ChevronsUpDown className="w-3 h-3 text-muted-foreground/40 ml-1" />;
  return sortDir === "asc"
    ? <ChevronUp className="w-3 h-3 text-primary ml-1" />
    : <ChevronDown className="w-3 h-3 text-primary ml-1" />;
}

type NumberRow = {
  id: number;
  number: string;
  numberDisplay?: string | null;
  numberType: string;
  provider: string;
  status: string;
  customerName?: string | null;
  customerExternalId?: string | null;
  providerServiceCode?: string | null;
  notes?: string | null;
  monthlyCost?: string | null;
  monthlyRevenue?: string | null;
  lastSyncedAt?: number | null;
  connectionId?: string | null;
  linkedSupplierName?: string | null;
  linkedLocationAddress?: string | null;
};

export default function NumberManagement() {
  const [search, setSearch] = useState("");
  const [providerFilter, setProviderFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [customerFilter, setCustomerFilter] = useState("");
  const [sortField, setSortField] = useState<SortField>("number");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkTarget, setLinkTarget] = useState<{ id: number; number: string } | null>(null);
  const [linkCustomerSearch, setLinkCustomerSearch] = useState("");
  const [groupByCustomer, setGroupByCustomer] = useState(false);
  const [expandedCustomers, setExpandedCustomers] = useState<Set<string>>(new Set());

  const { data, isLoading, refetch } = trpc.numbers.list.useQuery(
    { pageSize: 500, page: 1 },
    { refetchInterval: 30_000, refetchOnWindowFocus: true }
  );

  const syncMutation = trpc.numbers.syncChannelHaus.useMutation({
    onSuccess: (result) => {
      toast.success(`Channel Haus sync — ${result.inserted} new, ${result.skipped} updated`);
      refetch();
    },
    onError: (err) => toast.error(`Channel Haus sync failed: ${err.message}`),
  });
  const syncCommsMutation = trpc.numbers.syncCommsCode.useMutation({
    onSuccess: (result) => {
      toast.success(`CommsCode sync — ${result.inserted} new, ${result.updated} updated, ${result.linked ?? 0} linked to services`);
      refetch();
    },
    onError: (err) => toast.error(`CommsCode sync failed: ${err.message}`),
  });
  const syncNetSIPMutation = trpc.numbers.syncNetSIP.useMutation({
    onSuccess: (result) => {
      toast.success(`NetSIP sync — ${result.inserted} new, ${result.updated} updated, ${result.linked ?? 0} linked to services`);
      refetch();
    },
    onError: (err) => toast.error(`NetSIP sync failed: ${err.message}`),
  });
  const syncSasBossMutation = trpc.numbers.syncSasBoss.useMutation({
    onSuccess: (result) => {
      const parts: string[] = [];
      if (result.enterprisesUpserted) parts.push(`${result.enterprisesUpserted} enterprises`);
      if (result.servicesUpserted) parts.push(`${result.servicesUpserted} services`);
      if (result.didNumbersUpserted) parts.push(`${result.didNumbersUpserted} DIDs`);
      if (result.productsUpserted) parts.push(`${result.productsUpserted} products`);
      const summary = parts.length ? parts.join(", ") : "no changes";
      if (result.apiErrors?.length) {
        toast.warning(`SasBoss sync partial: ${summary}. Errors: ${result.apiErrors.join("; ")}`);
      } else {
        toast.success(`SasBoss sync — ${summary}`);
      }
      refetch();
    },
    onError: (err) => toast.error(`SasBoss sync failed: ${err.message}`),
  });

  const updateMutation = trpc.numbers.update.useMutation({
    onSuccess: () => {
      toast.success("Number updated");
      refetch();
      setLinkDialogOpen(false);
    },
    onError: (err) => toast.error(`Update failed: ${err.message}`),
  });

  const { data: customerResults = [] } = trpc.billing.customers.proposals.searchCustomers.useQuery(
    { search: linkCustomerSearch },
    { enabled: linkDialogOpen && linkCustomerSearch.trim().length >= 2 }
  );

  const numbers = (data?.numbers ?? []) as NumberRow[];

  // Derived filter options
  const providers = useMemo(() => {
    const set = new Set(numbers.map((n) => n.provider).filter(Boolean));
    return Array.from(set).sort();
  }, [numbers]);

  // Apply filters
  const filtered = useMemo(() => {
    let list = numbers;

    if (search) {
      const q = search.toLowerCase().replace(/\s/g, "");
      const qRaw = search.toLowerCase();
      list = list.filter(
        (n) =>
          n.number.includes(q) ||
          (n.numberDisplay ?? "").toLowerCase().includes(q) ||
          (n.customerName ?? "").toLowerCase().includes(qRaw) ||
          (n.providerServiceCode ?? "").toLowerCase().includes(qRaw) ||
          (n.notes ?? "").toLowerCase().includes(qRaw) ||
          (n.connectionId ?? "").toLowerCase().includes(qRaw)
      );
    }
    if (providerFilter !== "all") list = list.filter((n) => n.provider === providerFilter);
    if (typeFilter !== "all") list = list.filter((n) => n.numberType === typeFilter);
    if (statusFilter !== "all") list = list.filter((n) => n.status === statusFilter);
    if (customerFilter) {
      const q = customerFilter.toLowerCase();
      list = list.filter((n) => (n.customerName ?? "").toLowerCase().includes(q));
    }

    // Sort
    list = [...list].sort((a, b) => {
      let av: string | number = "";
      let bv: string | number = "";
      if (sortField === "monthlyCost") { av = parseFloat(a.monthlyCost ?? "0"); bv = parseFloat(b.monthlyCost ?? "0"); }
      else if (sortField === "monthlyRevenue") { av = parseFloat(a.monthlyRevenue ?? "0"); bv = parseFloat(b.monthlyRevenue ?? "0"); }
      else { av = ((a as Record<string, unknown>)[sortField] ?? "").toString().toLowerCase(); bv = ((b as Record<string, unknown>)[sortField] ?? "").toString().toLowerCase(); }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return list;
  }, [numbers, search, providerFilter, typeFilter, statusFilter, customerFilter, sortField, sortDir]);

  // Group by customer
  const customerGroups = useMemo(() => {
    if (!groupByCustomer) return null;
    const map = new Map<string, { name: string; numbers: NumberRow[]; totalCost: number; totalRevenue: number }>();
    for (const n of filtered) {
      const key = n.customerName ?? "__unlinked__";
      const label = n.customerName ?? "Unlinked";
      if (!map.has(key)) map.set(key, { name: label, numbers: [], totalCost: 0, totalRevenue: 0 });
      const group = map.get(key)!;
      group.numbers.push(n);
      group.totalCost += parseFloat(n.monthlyCost ?? "0");
      group.totalRevenue += parseFloat(n.monthlyRevenue ?? "0");
    }
    return Array.from(map.entries())
      .map(([key, g]) => ({ key, ...g }))
      .sort((a, b) => {
        if (a.key === "__unlinked__") return 1;
        if (b.key === "__unlinked__") return -1;
        return a.name.localeCompare(b.name);
      });
  }, [filtered, groupByCustomer]);

  const toggleCustomer = useCallback((key: string) => {
    setExpandedCustomers((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    if (!customerGroups) return;
    setExpandedCustomers(new Set(customerGroups.map((g) => g.key)));
  }, [customerGroups]);

  const collapseAll = useCallback(() => {
    setExpandedCustomers(new Set());
  }, []);

  const handleSort = useCallback((field: SortField) => {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDir("asc"); }
  }, [sortField]);

  const exportCSV = useCallback(() => {
    const headers = ["Number", "Display", "Type", "Provider", "Status", "Customer", "Service Code", "VBU ID / Connection ID", "Monthly Cost", "Monthly Revenue", "Notes", "Address", "Last Synced"];
    const rows = filtered.map((n) => [
      n.number,
      n.numberDisplay,
      n.numberType,
      n.provider,
      n.status,
      n.customerName ?? "",
      n.providerServiceCode ?? "",
      n.connectionId ?? "",
      n.monthlyCost ?? "0",
      n.monthlyRevenue ?? "0",
      n.notes ?? "",
      n.linkedLocationAddress ?? "",
      n.lastSyncedAt ? new Date(n.lastSyncedAt).toLocaleDateString("en-AU") : "",
    ]);
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `smiletel-numbers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filtered.length} numbers`);
  }, [filtered]);

  // Stats
  const stats = useMemo(() => ({
    total: numbers.length,
    active: numbers.filter((n) => n.status === "active").length,
    unlinked: numbers.filter((n) => !n.customerName).length,
    providers: new Set(numbers.map((n) => n.provider)).size,
    totalCost: numbers.reduce((s, n) => s + parseFloat(n.monthlyCost ?? "0"), 0),
  }), [numbers]);

  const filteredCustomers = customerResults;

  // Reusable row renderer
  const renderRow = (n: NumberRow) => {
    const typeInfo = TYPE_LABELS[n.numberType] ?? TYPE_LABELS.other;
    const providerColour = PROVIDER_COLOURS[n.provider] ?? "bg-gray-100 text-gray-700 border-gray-200";
    const cost = parseFloat(n.monthlyCost ?? "0");
    const rev = parseFloat(n.monthlyRevenue ?? "0");
    const margin = cost > 0 && rev > 0 ? ((rev - cost) / rev) * 100 : null;

    return (
      <TableRow key={n.id} className="hover:bg-muted/30 transition-colors group">
        {/* Number */}
        <TableCell className="font-mono text-sm font-medium">
          <div className="flex items-center gap-1.5">
            <Phone className="w-3 h-3 text-muted-foreground shrink-0" />
            {n.numberDisplay ?? n.number}
          </div>
        </TableCell>

        {/* Type */}
        <TableCell>
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${typeInfo.colour}`}>
            {typeInfo.label}
          </span>
        </TableCell>

        {/* Provider */}
        <TableCell>
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${providerColour}`}>
            {n.provider}
          </span>
        </TableCell>

        {/* Status */}
        <TableCell>
          <div className="flex items-center gap-1.5 text-xs capitalize">
            {STATUS_ICONS[n.status] ?? STATUS_ICONS.unverified}
            {n.status}
          </div>
        </TableCell>

        {/* Customer — hidden in grouped view */}
        {!groupByCustomer && (
          <TableCell className="text-sm">
            {n.customerName ? (
              <span className="text-foreground">{n.customerName}</span>
            ) : (
              <span className="text-muted-foreground/60 italic text-xs">Unlinked</span>
            )}
          </TableCell>
        )}

        {/* Service / Notes */}
        <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
          {n.providerServiceCode && (
            <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded mr-1.5">{n.providerServiceCode}</span>
          )}
          {n.notes && n.notes !== n.providerServiceCode && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="truncate cursor-default">{n.notes}</span>
              </TooltipTrigger>
              <TooltipContent>{n.notes}</TooltipContent>
            </Tooltip>
          )}
        </TableCell>

        {/* VBU ID / Connection ID from linked service */}
        <TableCell className="text-xs max-w-[160px]">
          {n.connectionId ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1 cursor-default">
                  <Fingerprint className="w-3 h-3 text-indigo-400 shrink-0" />
                  <span className="font-mono text-[11px] text-indigo-400 truncate">
                    {n.connectionId}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p className="font-semibold text-xs mb-0.5">VBU / Connection ID</p>
                <p className="font-mono text-xs">{n.connectionId}</p>
                {n.linkedSupplierName && (
                  <p className="text-xs text-muted-foreground mt-0.5">Supplier: {n.linkedSupplierName}</p>
                )}
              </TooltipContent>
            </Tooltip>
          ) : (
            <span className="text-muted-foreground/30">—</span>
          )}
        </TableCell>

        {/* Cost */}
        <TableCell className="text-right text-sm tabular-nums">
          {cost > 0 ? (
            <span className="text-foreground">${cost.toFixed(2)}</span>
          ) : (
            <span className="text-muted-foreground/50">—</span>
          )}
        </TableCell>

        {/* Revenue + margin */}
        <TableCell className="text-right text-sm tabular-nums">
          {rev > 0 ? (
            <div className="flex flex-col items-end">
              <span className="text-green-600">${rev.toFixed(2)}</span>
              {margin !== null && (
                <span className={`text-xs ${margin >= 20 ? "text-green-500" : margin >= 0 ? "text-yellow-500" : "text-red-500"}`}>
                  {margin.toFixed(0)}%
                </span>
              )}
            </div>
          ) : (
            <span className="text-muted-foreground/50">—</span>
          )}
        </TableCell>

        {/* Link action */}
        <TableCell>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="w-7 h-7 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => {
                  setLinkTarget({ id: n.id, number: n.numberDisplay || n.number });
                  setLinkCustomerSearch(n.customerName ?? "");
                  setLinkDialogOpen(true);
                }}
              >
                <Link2 className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Link to customer</TooltipContent>
          </Tooltip>
        </TableCell>
      </TableRow>
    );
  };

  const colCount = groupByCustomer ? 9 : 10;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-background shrink-0">
        <div>
          <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <Phone className="w-5 h-5 text-primary" />
            Number Management
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            All phone numbers owned or controlled by SmileTel / SmileIT
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={groupByCustomer ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setGroupByCustomer((v) => !v);
                  if (!groupByCustomer) {
                    // auto-expand all when switching on
                    setExpandedCustomers(new Set());
                  }
                }}
              >
                <Users className="w-3.5 h-3.5 mr-1.5" />
                Group by Customer
              </Button>
            </TooltipTrigger>
            <TooltipContent>Toggle grouped view by customer</TooltipContent>
          </Tooltip>
          <Button
            variant="outline"
            size="sm"
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${syncMutation.isPending ? "animate-spin" : ""}`} />
            Sync Channel Haus
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => syncCommsMutation.mutate()}
            disabled={syncCommsMutation.isPending}
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${syncCommsMutation.isPending ? "animate-spin" : ""}`} />
            Sync CommsCode
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => syncNetSIPMutation.mutate()}
            disabled={syncNetSIPMutation.isPending}
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${syncNetSIPMutation.isPending ? "animate-spin" : ""}`} />
            Sync NetSIP
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => syncSasBossMutation.mutate()}
            disabled={syncSasBossMutation.isPending}
            title="Requires SasBoss API credentials and IP whitelist"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${syncSasBossMutation.isPending ? "animate-spin" : ""}`} />
            Sync SasBoss
          </Button>
          <Button size="sm" onClick={exportCSV} disabled={filtered.length === 0}>
            <Download className="w-3.5 h-3.5 mr-1.5" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Stats strip */}
      <div className="flex items-center gap-6 px-6 py-3 bg-muted/30 border-b border-border shrink-0">
        <div className="flex items-center gap-1.5 text-sm">
          <Hash className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="font-semibold">{stats.total.toLocaleString()}</span>
          <span className="text-muted-foreground">total numbers</span>
        </div>
        <div className="flex items-center gap-1.5 text-sm">
          <CheckCircle className="w-3.5 h-3.5 text-green-500" />
          <span className="font-semibold">{stats.active.toLocaleString()}</span>
          <span className="text-muted-foreground">active</span>
        </div>
        <div className="flex items-center gap-1.5 text-sm">
          <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="font-semibold">{stats.providers}</span>
          <span className="text-muted-foreground">providers</span>
        </div>
        {stats.unlinked > 0 && (
          <div className="flex items-center gap-1.5 text-sm">
            <AlertCircle className="w-3.5 h-3.5 text-orange-400" />
            <span className="font-semibold text-orange-600">{stats.unlinked}</span>
            <span className="text-muted-foreground">unlinked to customer</span>
          </div>
        )}
        <div className="flex items-center gap-1.5 text-sm ml-auto">
          <DollarSign className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="font-semibold">${stats.totalCost.toFixed(2)}</span>
          <span className="text-muted-foreground">total monthly cost</span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 px-6 py-3 border-b border-border bg-background shrink-0 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Search number, customer, code, VBU ID, SIP ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
        <div className="relative min-w-[160px]">
          <User className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground z-10" />
          <Input
            placeholder="Filter by customer..."
            value={customerFilter}
            onChange={(e) => setCustomerFilter(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
        <Select value={providerFilter} onValueChange={setProviderFilter}>
          <SelectTrigger className="h-8 text-sm w-[160px]">
            <Building2 className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
            <SelectValue placeholder="All Providers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Providers</SelectItem>
            {providers.map((p) => (
              <SelectItem key={p} value={p}>{p}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="h-8 text-sm w-[150px]">
            <Filter className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="geographic">Geographic (07/02/03)</SelectItem>
            <SelectItem value="mobile">Mobile (04)</SelectItem>
            <SelectItem value="tollfree">Toll-Free (1800)</SelectItem>
            <SelectItem value="local">Local Rate (1300)</SelectItem>
            <SelectItem value="international">International</SelectItem>
            <SelectItem value="other">Other</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 text-sm w-[130px]">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="porting">Porting</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="terminated">Terminated</SelectItem>
            <SelectItem value="unverified">Unverified</SelectItem>
          </SelectContent>
        </Select>
        {(search || providerFilter !== "all" || typeFilter !== "all" || statusFilter !== "all" || customerFilter) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-muted-foreground"
            onClick={() => {
              setSearch("");
              setProviderFilter("all");
              setTypeFilter("all");
              setStatusFilter("all");
              setCustomerFilter("");
            }}
          >
            Clear filters
          </Button>
        )}
        {groupByCustomer && customerGroups && (
          <div className="flex items-center gap-1 ml-1">
            <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" onClick={expandAll}>
              Expand all
            </Button>
            <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" onClick={collapseAll}>
              Collapse all
            </Button>
          </div>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {groupByCustomer && customerGroups
            ? `${customerGroups.length} customers · ${filtered.length.toLocaleString()} numbers`
            : `Showing ${filtered.length.toLocaleString()} of ${numbers.length.toLocaleString()}`}
        </span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 bg-background z-10">
            <TableRow className="border-b border-border">
              <TableHead
                className="cursor-pointer select-none whitespace-nowrap text-xs font-medium"
                onClick={() => handleSort("number")}
              >
                <span className="flex items-center">
                  Number <SortIcon field="number" sortField={sortField} sortDir={sortDir} />
                </span>
              </TableHead>
              <TableHead
                className="cursor-pointer select-none whitespace-nowrap text-xs font-medium"
                onClick={() => handleSort("numberType")}
              >
                <span className="flex items-center">
                  Type <SortIcon field="numberType" sortField={sortField} sortDir={sortDir} />
                </span>
              </TableHead>
              <TableHead
                className="cursor-pointer select-none whitespace-nowrap text-xs font-medium"
                onClick={() => handleSort("provider")}
              >
                <span className="flex items-center">
                  Provider <SortIcon field="provider" sortField={sortField} sortDir={sortDir} />
                </span>
              </TableHead>
              <TableHead
                className="cursor-pointer select-none whitespace-nowrap text-xs font-medium"
                onClick={() => handleSort("status")}
              >
                <span className="flex items-center">
                  Status <SortIcon field="status" sortField={sortField} sortDir={sortDir} />
                </span>
              </TableHead>
              {!groupByCustomer && (
                <TableHead
                  className="cursor-pointer select-none whitespace-nowrap text-xs font-medium"
                  onClick={() => handleSort("customerName")}
                >
                  <span className="flex items-center">
                    Customer <SortIcon field="customerName" sortField={sortField} sortDir={sortDir} />
                  </span>
                </TableHead>
              )}
              <TableHead className="text-xs font-medium">Service Code / Notes</TableHead>
              <TableHead className="text-xs font-medium whitespace-nowrap">VBU / SIP ID</TableHead>
              <TableHead
                className="cursor-pointer select-none whitespace-nowrap text-xs font-medium text-right"
                onClick={() => handleSort("monthlyCost")}
              >
                <span className="flex items-center justify-end">
                  Cost/mo <SortIcon field="monthlyCost" sortField={sortField} sortDir={sortDir} />
                </span>
              </TableHead>
              <TableHead
                className="cursor-pointer select-none whitespace-nowrap text-xs font-medium text-right"
                onClick={() => handleSort("monthlyRevenue")}
              >
                <span className="flex items-center justify-end">
                  Rev/mo <SortIcon field="monthlyRevenue" sortField={sortField} sortDir={sortDir} />
                </span>
              </TableHead>
              <TableHead className="text-xs font-medium w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 12 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: colCount }).map((_, j) => (
                    <TableCell key={j}>
                      <div className="h-4 bg-muted animate-pulse rounded w-3/4" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={colCount} className="text-center py-16 text-muted-foreground text-sm">
                  <Phone className="w-8 h-8 mx-auto mb-3 opacity-20" />
                  No numbers match your filters
                </TableCell>
              </TableRow>
            ) : groupByCustomer && customerGroups ? (
              // ── Grouped view ──────────────────────────────────────────
              customerGroups.map((group) => {
                const isExpanded = expandedCustomers.has(group.key);
                const margin = group.totalCost > 0 && group.totalRevenue > 0
                  ? ((group.totalRevenue - group.totalCost) / group.totalRevenue) * 100
                  : null;
                return (
                  <>
                    {/* Customer header row */}
                    <TableRow
                      key={`group-${group.key}`}
                      className="bg-muted/50 hover:bg-muted/70 cursor-pointer select-none border-t-2 border-border/60"
                      onClick={() => toggleCustomer(group.key)}
                    >
                      <TableCell colSpan={4} className="py-2.5">
                        <div className="flex items-center gap-2">
                          <ChevronRight
                            className={`w-4 h-4 text-muted-foreground transition-transform duration-150 ${isExpanded ? "rotate-90" : ""}`}
                          />
                          <Users className="w-3.5 h-3.5 text-primary shrink-0" />
                          <span className={`font-semibold text-sm ${group.key === "__unlinked__" ? "text-muted-foreground italic" : "text-foreground"}`}>
                            {group.name}
                          </span>
                          <span className="text-xs text-muted-foreground bg-background border border-border rounded-full px-2 py-0.5 ml-1">
                            {group.numbers.length} {group.numbers.length === 1 ? "number" : "numbers"}
                          </span>
                        </div>
                      </TableCell>
                      {/* Spacer for Service Code / VBU ID */}
                      <TableCell colSpan={2} />
                      {/* Cost total */}
                      <TableCell className="text-right py-2.5">
                        {group.totalCost > 0 ? (
                          <span className="text-sm font-semibold tabular-nums">${group.totalCost.toFixed(2)}</span>
                        ) : (
                          <span className="text-muted-foreground/40 text-sm">—</span>
                        )}
                      </TableCell>
                      {/* Revenue total + margin */}
                      <TableCell className="text-right py-2.5">
                        {group.totalRevenue > 0 ? (
                          <div className="flex flex-col items-end">
                            <span className="text-sm font-semibold text-green-600 tabular-nums">${group.totalRevenue.toFixed(2)}</span>
                            {margin !== null && (
                              <span className={`text-xs ${margin >= 20 ? "text-green-500" : margin >= 0 ? "text-yellow-500" : "text-red-500"}`}>
                                {margin.toFixed(0)}% margin
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground/40 text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell />
                    </TableRow>
                    {/* Expanded number rows */}
                    {isExpanded && group.numbers.map((n) => renderRow(n))}
                  </>
                );
              })
            ) : (
              // ── Flat view ─────────────────────────────────────────────
              filtered.map((n) => renderRow(n))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Link to Customer Dialog */}
      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="w-4 h-4" />
              Link {linkTarget?.number} to Customer
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Input
              placeholder="Search customers..."
              value={linkCustomerSearch}
              onChange={(e) => setLinkCustomerSearch(e.target.value)}
              autoFocus
            />
            <div className="max-h-60 overflow-y-auto space-y-1 rounded-md border border-border">
              {filteredCustomers.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No customers found</p>
              ) : (
                filteredCustomers.map((c: { externalId: string; name: string; id?: number }) => (
                  <button
                    key={c.externalId}
                    className="w-full text-left px-3 py-2.5 text-sm hover:bg-muted/60 transition-colors flex items-center justify-between"
                    onClick={() => {
                      if (!linkTarget) return;
                      updateMutation.mutate({
                        id: linkTarget.id,
                        customerName: c.name,
                        customerExternalId: c.externalId,
                      });
                    }}
                  >
                    <span className="font-medium">{c.name}</span>
                    <span className="text-xs text-muted-foreground">{c.externalId}</span>
                  </button>
                ))
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkDialogOpen(false)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
