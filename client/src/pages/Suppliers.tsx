/**
 * Suppliers — Supplier registry with invoice upload history, mapping rules, and AAPT management.
 * Shows all registered suppliers ranked by priority, with per-supplier:
 *   - Invoice upload history
 *   - Persistent service mapping rules (auto-applied on future uploads)
 *   - AAPT: full service list, unmatched services, and manual assignment
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Building2, Upload, CheckCircle, AlertCircle, Clock,
  ChevronDown, ChevronUp, Link2, MapPin, FileText,
  RefreshCw, Search, X, ExternalLink, Layers, DollarSign,
  TrendingUp, Wifi, Phone
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";

// ── Supplier colour map ───────────────────────────────────────────────────────
const SUPPLIER_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  AAPT:    { bg: "bg-blue-50",   text: "text-blue-800",   border: "border-blue-200" },
  Telstra: { bg: "bg-yellow-50", text: "text-yellow-800", border: "border-yellow-200" },
  Exetel:  { bg: "bg-green-50",  text: "text-green-800",  border: "border-green-200" },
  SasBoss: { bg: "bg-purple-50", text: "text-purple-800", border: "border-purple-200" },
  Vocus:   { bg: "bg-red-50",    text: "text-red-800",    border: "border-red-200" },
  default: { bg: "bg-gray-50",   text: "text-gray-800",   border: "border-gray-200" },
};

function supplierColor(name: string) {
  return SUPPLIER_COLORS[name] || SUPPLIER_COLORS.default;
}

function formatCurrency(n: number | string | null | undefined) {
  const num = typeof n === "string" ? parseFloat(n) : (n ?? 0);
  return `$${num.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(d: string | Date | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" });
}

// ── AAPT Unmatched Assignment Dialog ─────────────────────────────────────────
function AaptAssignDialog({
  service,
  onClose,
  onAssigned,
}: {
  service: any;
  onClose: () => void;
  onAssigned: () => void;
}) {
  const [search, setSearch] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<{ externalId: string; name: string } | null>(null);

  const { data: customers } = trpc.billing.customers.list.useQuery(
    { search: search.trim() || undefined },
    { enabled: search.length >= 2 }
  );

  const assign = trpc.billing.aapt.assign.useMutation({
    onSuccess: () => {
      toast.success(`Assigned to ${selectedCustomer?.name} — mapping rule saved`);
      onAssigned();
      onClose();
    },
    onError: (err) => toast.error(`Assignment failed: ${err.message}`),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Assign AAPT Service to Customer</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {/* Service summary */}
          <div className="rounded-lg border bg-muted/40 p-3 text-sm space-y-1">
            <div className="font-medium">{service.aaptServiceId} — {service.aaptProductType}</div>
            {service.aaptYourId && <div className="text-muted-foreground">Your ID: {service.aaptYourId}</div>}
            {service.locationAddress && <div className="text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" />{service.locationAddress}</div>}
            <div className="font-semibold text-blue-700">{formatCurrency(service.monthlyCost)}/mo</div>
          </div>

          {/* Customer search */}
          <div>
            <label className="text-sm font-medium mb-1 block">Search Customer</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Type customer name…"
                value={search}
                onChange={e => { setSearch(e.target.value); setSelectedCustomer(null); }}
              />
            </div>
            {customers && customers.length > 0 && !selectedCustomer && (
              <div className="mt-1 border rounded-md max-h-48 overflow-y-auto divide-y">
                {customers.slice(0, 10).map((c: any) => (
                  <button
                    key={c.externalId}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted/60 transition-colors"
                    onClick={() => { setSelectedCustomer({ externalId: c.externalId, name: c.name }); setSearch(c.name); }}
                  >
                    <div className="font-medium">{c.name}</div>
                    {c.siteAddress && <div className="text-xs text-muted-foreground">{c.siteAddress}</div>}
                  </button>
                ))}
              </div>
            )}
            {selectedCustomer && (
              <div className="mt-1 flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm">
                <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
                <span className="font-medium text-green-800">{selectedCustomer.name}</span>
                <button onClick={() => { setSelectedCustomer(null); setSearch(""); }} className="ml-auto text-muted-foreground hover:text-foreground">
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="text-sm font-medium mb-1 block">Notes (optional)</label>
            <Input
              placeholder="Reason for manual assignment…"
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            This match will be saved as a mapping rule — future invoice uploads will auto-apply it.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!selectedCustomer || assign.isPending}
            onClick={() => {
              if (!selectedCustomer) return;
              assign.mutate({
                serviceExternalId: service.externalId,
                customerExternalId: selectedCustomer.externalId,
                customerName: selectedCustomer.name,
                notes: notes || undefined,
              });
            }}
          >
            {assign.isPending ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Link2 className="h-4 w-4 mr-2" />}
            Assign & Save Mapping
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── AAPT Detail Panel ─────────────────────────────────────────────────────────
function AaptPanel() {
  const [assignTarget, setAssignTarget] = useState<any | null>(null);
  const [tab, setTab] = useState("overview");

  const { data: stats, refetch: refetchStats } = trpc.billing.aapt.stats.useQuery();
  const { data: unmatched, refetch: refetchUnmatched } = trpc.billing.aapt.unmatched.useQuery();
  const { data: mappings } = trpc.billing.aapt.mappings.useQuery();
  const { data: uploads } = trpc.billing.aapt.invoiceUploads.useQuery();
  const { data: allServices } = trpc.billing.aapt.services.useQuery({});

  const refetchAll = () => { refetchStats(); refetchUnmatched(); };

  return (
    <div className="space-y-4">
      {/* Stats row */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total Services", value: stats.totalServices, icon: Layers },
            { label: "Matched", value: stats.matchedServices, icon: CheckCircle, color: "text-green-600" },
            { label: "Unmatched", value: stats.unmatchedServices, icon: AlertCircle, color: "text-amber-600" },
            { label: "Monthly Cost", value: formatCurrency(stats.totalMonthlyCost), icon: DollarSign },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="rounded-lg border bg-card p-3">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <Icon className={`h-3.5 w-3.5 ${color || ""}`} />
                {label}
              </div>
              <div className={`text-lg font-bold ${color || ""}`}>{value}</div>
            </div>
          ))}
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview">All Services</TabsTrigger>
          <TabsTrigger value="unmatched">
            Unmatched
            {(stats?.unmatchedServices ?? 0) > 0 && (
              <Badge variant="destructive" className="ml-1.5 h-4 px-1 text-[10px]">
                {stats?.unmatchedServices}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="mappings">Mapping Rules ({mappings?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="uploads">Upload History</TabsTrigger>
        </TabsList>

        {/* All Services */}
        <TabsContent value="overview" className="mt-3">
          <div className="rounded-md border overflow-auto max-h-[480px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Service ID</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Your ID / Label</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Monthly Cost</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(allServices ?? []).map((svc: any) => (
                  <TableRow key={svc.externalId}>
                    <TableCell className="font-mono text-xs">{svc.aaptServiceId}</TableCell>
                    <TableCell className="text-xs">{svc.aaptProductType}</TableCell>
                    <TableCell className="text-xs max-w-[120px] truncate" title={svc.aaptYourId || ""}>{svc.aaptYourId || "—"}</TableCell>
                    <TableCell className="text-xs max-w-[160px] truncate" title={svc.locationAddress || ""}>{svc.locationAddress || "—"}</TableCell>
                    <TableCell className="text-xs">{svc.customerName || <span className="text-muted-foreground italic">Unassigned</span>}</TableCell>
                    <TableCell className="text-right text-xs font-medium">{formatCurrency(svc.monthlyCost)}</TableCell>
                    <TableCell>
                      <Badge variant={svc.status === "unmatched" ? "destructive" : "secondary"} className="text-[10px]">
                        {svc.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* Unmatched */}
        <TabsContent value="unmatched" className="mt-3">
          {(unmatched ?? []).length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <CheckCircle className="h-10 w-10 mb-3 text-green-500" />
              <p className="font-medium">All AAPT services are matched</p>
            </div>
          ) : (
            <div className="rounded-md border overflow-auto max-h-[480px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Service ID</TableHead>
                    <TableHead>Product Type</TableHead>
                    <TableHead>Your ID / Access ID</TableHead>
                    <TableHead>Address</TableHead>
                    <TableHead className="text-right">Monthly Cost</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(unmatched ?? []).map((svc: any) => (
                    <TableRow key={svc.externalId} className="hover:bg-amber-50/40">
                      <TableCell className="font-mono text-xs">{svc.aaptServiceId}</TableCell>
                      <TableCell className="text-xs">{svc.aaptProductType}</TableCell>
                      <TableCell className="text-xs max-w-[140px] truncate" title={svc.aaptYourId || svc.aaptAccessId || ""}>
                        {svc.aaptYourId || svc.aaptAccessId || "—"}
                      </TableCell>
                      <TableCell className="text-xs max-w-[160px] truncate" title={svc.locationAddress || ""}>
                        {svc.locationAddress ? (
                          <span className="flex items-center gap-1"><MapPin className="h-3 w-3 text-muted-foreground" />{svc.locationAddress}</span>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-right text-xs font-medium">{formatCurrency(svc.monthlyCost)}</TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAssignTarget(svc)}>
                          <Link2 className="h-3 w-3 mr-1" />Assign
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* Mapping Rules */}
        <TabsContent value="mappings" className="mt-3">
          <p className="text-xs text-muted-foreground mb-3">
            These rules are automatically applied when future AAPT invoices are uploaded. Each confirmed match creates rules for service ID, access ID, and address.
          </p>
          <div className="rounded-md border overflow-auto max-h-[480px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Match Type</TableHead>
                  <TableHead>Key Value</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Confirmed By</TableHead>
                  <TableHead className="text-right">Uses</TableHead>
                  <TableHead>Last Used</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(mappings ?? []).map((m: any) => (
                  <TableRow key={m.id}>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] capitalize">{m.matchKeyType.replace("_", " ")}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs max-w-[160px] truncate" title={m.matchKeyValue}>{m.matchKeyValue}</TableCell>
                    <TableCell className="text-xs">{m.productType || "—"}</TableCell>
                    <TableCell className="text-xs font-medium">{m.customerName}</TableCell>
                    <TableCell className="text-xs text-muted-foreground capitalize">{m.confirmedBy}</TableCell>
                    <TableCell className="text-right text-xs">{m.useCount}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(m.lastUsedAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* Upload History */}
        <TabsContent value="uploads" className="mt-3">
          <div className="rounded-md border overflow-auto max-h-[480px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Billing Period</TableHead>
                  <TableHead>Services</TableHead>
                  <TableHead>Matched</TableHead>
                  <TableHead>Unmatched</TableHead>
                  <TableHead className="text-right">Total (ex-GST)</TableHead>
                  <TableHead>Imported</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(uploads ?? []).length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No uploads yet</TableCell></TableRow>
                ) : (uploads ?? []).map((u: any) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-mono text-xs">{u.invoiceNumber}</TableCell>
                    <TableCell className="text-xs">{u.billingPeriod}</TableCell>
                    <TableCell className="text-xs">{u.serviceCount}</TableCell>
                    <TableCell className="text-xs text-green-700">{u.matchedCount}</TableCell>
                    <TableCell className="text-xs text-amber-700">{u.unmatchedCount}</TableCell>
                    <TableCell className="text-right text-xs font-medium">{formatCurrency(u.totalExGst)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(u.importedAt)}</TableCell>
                    <TableCell>
                      <Badge variant={u.status === "complete" ? "secondary" : "outline"} className="text-[10px] capitalize">{u.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      {/* Assignment dialog */}
      {assignTarget && (
        <AaptAssignDialog
          service={assignTarget}
          onClose={() => setAssignTarget(null)}
          onAssigned={refetchAll}
        />
      )}
    </div>
  );
}

// ── Vocus Panel ──────────────────────────────────────────────────────────────
function VocusPanel() {
  const utils = trpc.useUtils();
  const { data: stats, isLoading: statsLoading } = trpc.billing.vocus.stats.useQuery();
  const { data: services, isLoading: servicesLoading } = trpc.billing.vocus.services.useQuery();
  const importMutation = trpc.billing.vocus.importStandardMobileSims.useMutation({
    onSuccess: (result: any) => {
      toast.success(`Vocus import complete: ${result.inserted} inserted, ${result.updated} updated`);
      utils.billing.vocus.stats.invalidate();
      utils.billing.vocus.services.invalidate();
      utils.billing.supplierRegistry.list.invalidate();
    },
    onError: (e: any) => toast.error(`Import failed: ${e.message}`),
  });

  const unmatched = (services ?? []).filter((s: any) => s.status === "unmatched");
  const active = (services ?? []).filter((s: any) => s.status === "active");

  return (
    <div className="space-y-4">
      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-md border bg-muted/30 p-3 text-center">
          <div className="text-lg font-bold">{statsLoading ? "…" : (stats?.totalServices ?? 0)}</div>
          <div className="text-xs text-muted-foreground">Total SIMs</div>
        </div>
        <div className="rounded-md border bg-muted/30 p-3 text-center">
          <div className="text-lg font-bold text-amber-600">{statsLoading ? "…" : (stats?.unmatchedServices ?? 0)}</div>
          <div className="text-xs text-muted-foreground">Unmatched</div>
        </div>
        <div className="rounded-md border bg-muted/30 p-3 text-center">
          <div className="text-lg font-bold text-green-600">{statsLoading ? "…" : (stats?.matchedServices ?? 0)}</div>
          <div className="text-xs text-muted-foreground">Matched</div>
        </div>
      </div>

      {/* Re-import button */}
      <div className="flex items-center gap-3">
        <Button
          size="sm"
          variant="outline"
          onClick={() => importMutation.mutate()}
          disabled={importMutation.isPending}
          className="border-red-200 text-red-800 hover:bg-red-50"
        >
          {importMutation.isPending ? (
            <><RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />Importing…</>
          ) : (
            <><RefreshCw className="h-3.5 w-3.5 mr-1.5" />Re-import Standard Mobile SIMs (75)</>
          )}
        </Button>
        <span className="text-xs text-muted-foreground">Upserts all 75 Vocus Standard Mobile SIMs — safe to run multiple times</span>
      </div>

      {/* Service tabs */}
      <Tabs defaultValue="unmatched">
        <TabsList className="h-8">
          <TabsTrigger value="unmatched" className="text-xs h-7">Unmatched ({unmatched.length})</TabsTrigger>
          <TabsTrigger value="active" className="text-xs h-7">Active ({active.length})</TabsTrigger>
          <TabsTrigger value="all" className="text-xs h-7">All ({(services ?? []).length})</TabsTrigger>
        </TabsList>
        {(["unmatched", "active", "all"] as const).map((tab) => {
          const rows = tab === "unmatched" ? unmatched : tab === "active" ? active : (services ?? []);
          return (
            <TabsContent key={tab} value={tab} className="mt-2">
              {servicesLoading ? (
                <div className="flex items-center gap-2 py-4 text-muted-foreground text-sm"><RefreshCw className="h-4 w-4 animate-spin" />Loading…</div>
              ) : rows.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground text-sm"><Phone className="h-8 w-8 mx-auto mb-2 opacity-30" />No {tab} services</div>
              ) : (
                <div className="rounded-md border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="text-xs">Phone</TableHead>
                        <TableHead className="text-xs">Address</TableHead>
                        <TableHead className="text-xs">Vocus ID</TableHead>
                        <TableHead className="text-xs">Status</TableHead>
                        <TableHead className="text-xs">Customer</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.slice(0, 50).map((svc: any) => (
                        <TableRow key={svc.id} className="text-xs">
                          <TableCell className="font-mono">{svc.phoneNumber || "—"}</TableCell>
                          <TableCell className="max-w-[200px] truncate">{svc.locationAddress || "—"}</TableCell>
                          <TableCell className="font-mono text-muted-foreground">{svc.serviceId || "—"}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`text-[10px] ${
                              svc.status === "active" ? "border-green-300 text-green-700" :
                              svc.status === "unmatched" ? "border-amber-300 text-amber-700" :
                              "border-gray-300 text-gray-600"
                            }`}>{svc.status}</Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{svc.customerName || "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {rows.length > 50 && (
                    <div className="px-4 py-2 text-xs text-muted-foreground border-t bg-muted/30">Showing 50 of {rows.length} services</div>
                  )}
                </div>
              )}
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}

// ── SasBoss / Access4 Product Cost Pricebook Panel ─────────────────────────
function SasBossPanel() {
  const { data: products, isLoading, refetch } = trpc.billing.productCosts.list.useQuery({ supplier: "SasBoss" });
  const updateMutation = trpc.billing.productCosts.update.useMutation({
    onSuccess: () => { toast.success("Cost updated"); refetch(); setEditRow(null); },
    onError: (e) => toast.error(e.message),
  });
  const [editRow, setEditRow] = useState<any>(null);
  const [editWholesale, setEditWholesale] = useState("");
  const [editRrp, setEditRrp] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("all");

  const categories = Array.from(new Set((products ?? []).map((p: any) => p.productCategory).filter(Boolean)));
  const filtered = (products ?? []).filter((p: any) => {
    const matchSearch = !search || p.productName?.toLowerCase().includes(search.toLowerCase());
    const matchCat = filterCat === "all" || p.productCategory === filterCat;
    return matchSearch && matchCat;
  });

  function openEdit(p: any) {
    setEditRow(p);
    setEditWholesale(parseFloat(p.wholesaleCost).toFixed(2));
    setEditRrp(parseFloat(p.defaultRetailPrice).toFixed(2));
    setEditNotes(p.notes ?? "");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <DollarSign className="h-4 w-4 text-purple-600" />
        <span className="font-semibold text-sm">Access4 Diamond Pricebook</span>
        <Badge variant="outline" className="text-[10px]">108 products</Badge>
        <span className="text-xs text-muted-foreground ml-auto">Diamond Tier wholesale costs — edit to override</span>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="Search products…" className="pl-8 h-8 text-sm" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select
          className="h-8 text-sm rounded-md border border-input bg-background px-2 text-muted-foreground"
          value={filterCat}
          onChange={e => setFilterCat(e.target.value)}
        >
          <option value="all">All Categories</option>
          {categories.map((c: any) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
          <RefreshCw className="h-4 w-4 animate-spin" />Loading pricebook…
        </div>
      ) : (
        <div className="rounded-md border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="text-xs">Category</TableHead>
                <TableHead className="text-xs">Product</TableHead>
                <TableHead className="text-xs text-right">Wholesale (Diamond)</TableHead>
                <TableHead className="text-xs text-right">RRP</TableHead>
                <TableHead className="text-xs text-right">Margin</TableHead>
                <TableHead className="text-xs">Notes</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p: any) => {
                const wc = parseFloat(p.wholesaleCost);
                const rrp = parseFloat(p.defaultRetailPrice);
                const margin = rrp > 0 ? ((rrp - wc) / rrp * 100).toFixed(0) : "—";
                return (
                  <TableRow key={p.id} className="text-xs hover:bg-muted/30">
                    <TableCell className="text-muted-foreground">{p.productCategory || "—"}</TableCell>
                    <TableCell className="font-medium">{p.productName}</TableCell>
                    <TableCell className="text-right font-mono text-green-700">${wc.toFixed(2)}</TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">${rrp.toFixed(2)}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant="outline" className={`text-[10px] ${Number(margin) >= 30 ? 'text-green-700 border-green-300' : Number(margin) >= 15 ? 'text-yellow-700 border-yellow-300' : 'text-red-700 border-red-300'}`}>
                        {margin}%
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground max-w-[160px] truncate">{p.notes || "—"}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => openEdit(p)}>
                        <span className="text-xs">✏️</span>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Edit dialog */}
      {editRow && (
        <Dialog open onOpenChange={() => setEditRow(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-sm">Edit Cost — {editRow.productName}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div>
                <label className="text-xs text-muted-foreground">Wholesale Cost (Diamond Tier, ex-GST)</label>
                <Input type="number" step="0.01" value={editWholesale} onChange={e => setEditWholesale(e.target.value)} className="mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Default RRP (ex-GST)</label>
                <Input type="number" step="0.01" value={editRrp} onChange={e => setEditRrp(e.target.value)} className="mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Notes</label>
                <Input value={editNotes} onChange={e => setEditNotes(e.target.value)} className="mt-1" placeholder="Optional notes…" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setEditRow(null)}>Cancel</Button>
              <Button size="sm" onClick={() => updateMutation.mutate({ id: editRow.id, wholesaleCost: parseFloat(editWholesale), defaultRetailPrice: parseFloat(editRrp), notes: editNotes })} disabled={updateMutation.isPending}>
                {updateMutation.isPending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ── Supplier Card ─────────────────────────────────────────────────────────────
function SupplierCard({ supplier }: { supplier: any }) {
  const [expanded, setExpanded] = useState(false);
  const colors = supplierColor(supplier.name);

  return (
    <div className={`rounded-xl border ${colors.border} overflow-hidden`}>
      {/* Header */}
      <button
        className={`w-full flex items-center gap-4 px-5 py-4 ${colors.bg} hover:brightness-[0.97] transition-all text-left`}
        onClick={() => setExpanded(e => !e)}
      >
        {/* Rank badge */}
        <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${colors.text} border ${colors.border} bg-white`}>
          {supplier.rank}
        </div>

        {/* Name & category */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`font-semibold text-base ${colors.text}`}>{supplier.displayName || supplier.name}</span>
            <Badge variant="outline" className={`text-[10px] ${colors.text} ${colors.border}`}>{supplier.category}</Badge>
          </div>
          {supplier.notes && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{supplier.notes}</p>
          )}
        </div>

        {/* Stats */}
        <div className="hidden sm:flex items-center gap-6 text-sm">
          <div className="text-center">
            <div className="font-semibold">{supplier.totalServices ?? "—"}</div>
            <div className="text-xs text-muted-foreground">Services</div>
          </div>
          <div className="text-center">
            <div className="font-semibold">{supplier.totalMonthlyCost ? formatCurrency(supplier.totalMonthlyCost) : "—"}</div>
            <div className="text-xs text-muted-foreground">Monthly Cost</div>
          </div>
          {supplier.lastInvoiceDate && (
            <div className="text-center">
              <div className="font-semibold">{formatDate(supplier.lastInvoiceDate)}</div>
              <div className="text-xs text-muted-foreground">Last Invoice</div>
            </div>
          )}
        </div>

        {/* Expand toggle */}
        <div className="flex-shrink-0 ml-2">
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-5 py-4 border-t bg-background">
          {supplier.name === "AAPT" ? (
            <AaptPanel />
          ) : supplier.name === "SasBoss" || supplier.name === "Access4" ? (
            <SasBossPanel />
          ) : supplier.name === "Vocus" ? (
            <VocusPanel />
          ) : (
            <div className="space-y-3">
              {/* Generic supplier info */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                {supplier.abn && (
                  <div><span className="text-muted-foreground text-xs">ABN</span><div className="font-mono">{supplier.abn}</div></div>
                )}
                {supplier.uploadFormats && (
                  <div><span className="text-muted-foreground text-xs">Upload Formats</span><div className="uppercase">{supplier.uploadFormats}</div></div>
                )}
                {supplier.lastInvoiceNumber && (
                  <div><span className="text-muted-foreground text-xs">Last Invoice</span><div className="font-mono text-xs">{supplier.lastInvoiceNumber}</div></div>
                )}
              </div>
              {supplier.uploadInstructions && (
                <div className="rounded-md bg-muted/50 p-3 text-sm">
                  <div className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                    <Upload className="h-3 w-3" />Upload Instructions
                  </div>
                  {supplier.uploadInstructions}
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <Button variant="outline" size="sm" onClick={() => window.location.href = "/supplier-invoices"}>
                  <Upload className="h-3.5 w-3.5 mr-1.5" />Upload Invoice
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Dashboard Cost by Provider ────────────────────────────────────────────────
function CostByProviderChart({ data }: { data: any[] }) {
  const total = data.reduce((sum, r) => sum + Number(r.totalCost), 0);
  const colors = ["bg-blue-500", "bg-yellow-500", "bg-green-500", "bg-purple-500", "bg-orange-500", "bg-pink-500", "bg-teal-500"];

  return (
    <div className="space-y-2">
      {data.map((row, i) => {
        const pct = total > 0 ? (Number(row.totalCost) / total) * 100 : 0;
        return (
          <div key={row.provider || "unknown"} className="flex items-center gap-3">
            <div className="w-24 text-xs font-medium truncate">{row.provider || "Unknown"}</div>
            <div className="flex-1 h-5 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full ${colors[i % colors.length]} transition-all`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="w-24 text-right text-xs text-muted-foreground">{formatCurrency(row.totalCost)}</div>
            <div className="w-10 text-right text-xs text-muted-foreground">{pct.toFixed(0)}%</div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Suppliers() {
  const { data: suppliers, isLoading } = trpc.billing.supplierRegistry.list.useQuery();
  const { data: totals } = trpc.billing.dashboardTotals.useQuery();

  return (
    <div className="space-y-6 p-6 max-w-5xl mx-auto">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="h-6 w-6" />
            Suppliers
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Registered suppliers, invoice history, and persistent service mapping rules
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => window.location.href = "/supplier-invoices"}>
          <Upload className="h-4 w-4 mr-1.5" />Upload Invoice
        </Button>
      </div>

      {/* Cost breakdown */}
      {totals && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />Cost by Provider (Monthly, All Active Services)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 mb-4">
              {[
                { label: "Total Revenue", value: formatCurrency(totals.totalRevenue), color: "text-green-700" },
                { label: "Total Cost", value: formatCurrency(totals.totalCost), color: "text-red-700" },
                { label: "Gross Margin", value: `${totals.marginPercent.toFixed(1)}%`, color: totals.marginPercent >= 0 ? "text-green-700" : "text-red-700" },
              ].map(({ label, value, color }) => (
                <div key={label} className="text-center">
                  <div className={`text-xl font-bold ${color}`}>{value}</div>
                  <div className="text-xs text-muted-foreground">{label}</div>
                </div>
              ))}
            </div>
            {totals.costByProvider && totals.costByProvider.length > 0 && (
              <CostByProviderChart data={totals.costByProvider} />
            )}
          </CardContent>
        </Card>
      )}

      {/* Supplier list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <RefreshCw className="h-5 w-5 animate-spin mr-2" />Loading suppliers…
        </div>
      ) : (suppliers ?? []).length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Building2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>No suppliers registered yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {(suppliers ?? []).map((s: any) => (
            <SupplierCard key={s.id} supplier={s} />
          ))}
        </div>
      )}
    </div>
  );
}
