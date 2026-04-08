import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { toast } from "sonner";
import {
  Satellite,
  RefreshCw,
  Wifi,
  WifiOff,
  Zap,
  ZapOff,
  Activity,
  Database,
  Globe,
  Link2,
  Link2Off,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  Settings,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Search,
  Plus,
  Minus,
  Upload,
  FileText,
  Trash2,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function MatchBadge({ confidence, method }: { confidence?: number | null; method?: string | null }) {
  if (method === "manual" || (confidence !== null && confidence !== undefined && confidence >= 85)) {
    return <Badge className="bg-emerald-600 text-white text-xs">Matched</Badge>;
  }
  if (confidence !== null && confidence !== undefined && confidence >= 60) {
    return <Badge className="bg-amber-500 text-white text-xs">Suggested</Badge>;
  }
  return <Badge variant="outline" className="text-xs text-muted-foreground">Unmatched</Badge>;
}

function OnlineBadge({ online }: { online?: number | null }) {
  if (online === 1) return <Badge className="bg-emerald-600 text-white text-xs gap-1"><Wifi className="w-3 h-3" />Online</Badge>;
  return <Badge variant="outline" className="text-xs text-muted-foreground gap-1"><WifiOff className="w-3 h-3" />Offline</Badge>;
}

function StatusBadge({ status }: { status?: string | null }) {
  if (status === "active") return <Badge className="bg-emerald-600 text-white text-xs">Active</Badge>;
  return <Badge variant="destructive" className="text-xs">Inactive</Badge>;
}

// ─── Account Row (expandable) ─────────────────────────────────────────────────

function AccountRow({
  account,
  onMatch,
  onUnmatch,
}: {
  account: {
    id: number;
    accountNumber: string;
    nickname?: string | null;
    serviceAddress?: string | null;
    status?: string | null;
    customerExternalId?: string | null;
    customerName?: string | null;
    matchConfidence?: number | null;
    matchMethod?: string | null;
    lastSyncedAt?: Date | string | null;
  };
  onMatch: (accountNumber: string) => void;
  onUnmatch: (accountNumber: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const { data: serviceLines } = trpc.starlink.serviceLines.list.useQuery(
    { accountNumber: account.accountNumber },
    { enabled: expanded }
  );
  const { data: terminals } = trpc.starlink.terminals.list.useQuery(
    { accountNumber: account.accountNumber },
    { enabled: expanded }
  );

  const utils = trpc.useUtils();

  const deactivateSL = trpc.starlink.serviceLines.deactivate.useMutation({
    onSuccess: () => { toast.success("Service line deactivated"); utils.starlink.serviceLines.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const renameSL = trpc.starlink.serviceLines.rename.useMutation({
    onSuccess: () => { toast.success("Nickname updated"); utils.starlink.serviceLines.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const rebootTerm = trpc.starlink.terminals.reboot.useMutation({
    onSuccess: () => toast.success("Reboot command sent"),
    onError: (e) => toast.error(e.message),
  });

  const [renameTarget, setRenameTarget] = useState<{ serviceLineNumber: string; current: string } | null>(null);
  const [renameValue, setRenameValue] = useState("");

  return (
    <>
      <TableRow
        className="cursor-pointer hover:bg-muted/30"
        onClick={() => setExpanded((v) => !v)}
      >
        <TableCell className="w-6">
          {expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
        </TableCell>
        <TableCell className="font-mono text-xs">{account.accountNumber}</TableCell>
        <TableCell className="font-medium">{account.nickname || account.accountNumber}</TableCell>
        <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{account.serviceAddress || "—"}</TableCell>
        <TableCell><StatusBadge status={account.status} /></TableCell>
        <TableCell>
          <MatchBadge confidence={account.matchConfidence} method={account.matchMethod} />
          {account.customerName && (
            <span className="ml-2 text-xs text-muted-foreground">{account.customerName}</span>
          )}
        </TableCell>
        <TableCell onClick={(e) => e.stopPropagation()}>
          {account.customerExternalId ? (
            <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => onUnmatch(account.accountNumber)}>
              <Link2Off className="w-3 h-3 mr-1" />Unmatch
            </Button>
          ) : (
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onMatch(account.accountNumber)}>
              <Link2 className="w-3 h-3 mr-1" />Match
            </Button>
          )}
        </TableCell>
      </TableRow>

      {expanded && (
        <TableRow>
          <TableCell colSpan={7} className="bg-muted/10 p-0">
            <div className="p-4 space-y-4">
              {/* Service Lines */}
              <div>
                <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-blue-500" />
                  Service Lines ({serviceLines?.length ?? 0})
                </h4>
                {serviceLines && serviceLines.length > 0 ? (
                  <div className="rounded border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/30">
                          <TableHead className="text-xs">Service Line #</TableHead>
                          <TableHead className="text-xs">Nickname</TableHead>
                          <TableHead className="text-xs">Status</TableHead>
                          <TableHead className="text-xs">Product</TableHead>
                          <TableHead className="text-xs">Public IP</TableHead>
                          <TableHead className="text-xs">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {serviceLines.map((sl) => (
                          <ServiceLineRow
                            key={sl.serviceLineNumber}
                            sl={sl}
                            accountNumber={account.accountNumber}
                            onDeactivate={() => deactivateSL.mutate({ accountNumber: account.accountNumber, serviceLineNumber: sl.serviceLineNumber })}
                            onRename={() => { setRenameTarget({ serviceLineNumber: sl.serviceLineNumber, current: sl.nickname || "" }); setRenameValue(sl.nickname || ""); }}
                          />
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No service lines synced yet.</p>
                )}
              </div>

              {/* Terminals */}
              <div>
                <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <Satellite className="w-4 h-4 text-purple-500" />
                  Terminals ({terminals?.length ?? 0})
                </h4>
                {terminals && terminals.length > 0 ? (
                  <div className="rounded border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/30">
                          <TableHead className="text-xs">Device ID</TableHead>
                          <TableHead className="text-xs">Kit Serial</TableHead>
                          <TableHead className="text-xs">Status</TableHead>
                          <TableHead className="text-xs">Signal</TableHead>
                          <TableHead className="text-xs">DL Mbps</TableHead>
                          <TableHead className="text-xs">UL Mbps</TableHead>
                          <TableHead className="text-xs">Service Line</TableHead>
                          <TableHead className="text-xs">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {terminals.map((t) => (
                          <TableRow key={t.deviceId}>
                            <TableCell className="font-mono text-xs">{t.deviceId}</TableCell>
                            <TableCell className="text-xs">{t.kitSerialNumber || "—"}</TableCell>
                            <TableCell><OnlineBadge online={t.online} /></TableCell>
                            <TableCell className="text-xs">{t.signalQuality !== null && t.signalQuality !== undefined ? `${t.signalQuality}%` : "—"}</TableCell>
                            <TableCell className="text-xs">{t.downlinkThroughputMbps ? Number(t.downlinkThroughputMbps).toFixed(1) : "—"}</TableCell>
                            <TableCell className="text-xs">{t.uplinkThroughputMbps ? Number(t.uplinkThroughputMbps).toFixed(1) : "—"}</TableCell>
                            <TableCell className="font-mono text-xs">{t.serviceLineNumber || "—"}</TableCell>
                            <TableCell>
                              <Button
                                size="sm" variant="ghost" className="h-7 text-xs"
                                onClick={() => rebootTerm.mutate({ accountNumber: account.accountNumber, deviceId: t.deviceId })}
                              >
                                <RotateCcw className="w-3 h-3 mr-1" />Reboot
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No terminals synced yet.</p>
                )}
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}

      {/* Rename dialog */}
      <Dialog open={!!renameTarget} onOpenChange={() => setRenameTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Rename Service Line</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>New Nickname</Label>
            <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} placeholder="e.g. Head Office - Starlink" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTarget(null)}>Cancel</Button>
            <Button onClick={() => {
              if (renameTarget && renameValue.trim()) {
                renameSL.mutate({ accountNumber: account.accountNumber, serviceLineNumber: renameTarget.serviceLineNumber, nickname: renameValue.trim() });
                setRenameTarget(null);
              }
            }}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Service Line Row (with usage expansion) ──────────────────────────────────

function ServiceLineRow({
  sl,
  accountNumber,
  onDeactivate,
  onRename,
}: {
  sl: {
    serviceLineNumber: string;
    nickname?: string | null;
    status?: string | null;
    productReferenceId?: string | null;
    publicIp?: string | null;
  };
  accountNumber: string;
  onDeactivate: () => void;
  onRename: () => void;
}) {
  const [showUsage, setShowUsage] = useState(false);
  const { data: cycles } = trpc.starlink.serviceLines.billingCycles.useQuery(
    { accountNumber, serviceLineNumber: sl.serviceLineNumber },
    { enabled: showUsage }
  );

  const topUp = trpc.starlink.serviceLines.topUp.useMutation({
    onSuccess: () => toast.success("Top-up data added"),
    onError: (e) => toast.error(e.message),
  });

  return (
    <>
      <TableRow>
        <TableCell className="font-mono text-xs">{sl.serviceLineNumber}</TableCell>
        <TableCell className="text-xs">{sl.nickname || "—"}</TableCell>
        <TableCell><StatusBadge status={sl.status} /></TableCell>
        <TableCell className="text-xs font-mono">{sl.productReferenceId ? sl.productReferenceId.slice(0, 20) + "…" : "—"}</TableCell>
        <TableCell className="text-xs">{sl.publicIp ? <Badge className="bg-blue-600 text-white text-xs">Enabled</Badge> : <Badge variant="outline" className="text-xs">Disabled</Badge>}</TableCell>
        <TableCell className="flex gap-1 flex-wrap">
          <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={onRename}>
            <Settings className="w-3 h-3 mr-1" />Rename
          </Button>
          <Button
            size="sm" variant="ghost" className="h-6 text-xs px-2"
            onClick={() => topUp.mutate({ accountNumber, serviceLineNumber: sl.serviceLineNumber, dataBlockType: "GB_50" })}
          >
            <Plus className="w-3 h-3 mr-1" />Top-up
          </Button>
          <Button
            size="sm" variant="ghost" className="h-6 text-xs px-2"
            onClick={() => setShowUsage((v) => !v)}
          >
            <TrendingUp className="w-3 h-3 mr-1" />Usage
          </Button>
          {sl.status === "active" && (
            <Button size="sm" variant="ghost" className="h-6 text-xs px-2 text-destructive" onClick={onDeactivate}>
              <ZapOff className="w-3 h-3 mr-1" />Deactivate
            </Button>
          )}
        </TableCell>
      </TableRow>
      {showUsage && cycles && cycles.length > 0 && (
        <TableRow className="bg-muted/5">
          <TableCell colSpan={6} className="p-2">
            <div className="text-xs font-semibold mb-1 text-muted-foreground">Billing Cycle Usage</div>
            <div className="grid grid-cols-3 gap-2">
              {cycles.slice(0, 6).map((c, i) => (
                <div key={i} className="rounded border p-2 bg-background text-xs space-y-1">
                  <div className="font-semibold">{c.startDate?.slice(0, 7) ?? "—"}</div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Priority</span><span>{c.priorityGb} GB</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Standard</span><span>{c.standardGb} GB</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Mobile</span><span>{c.mobileGb} GB</span></div>
                  {(c.overageGb ?? 0) > 0 && (
                    <div className="flex justify-between text-amber-500"><span>Overage</span><span>{c.overageGb} GB</span></div>
                  )}
                  <div className="flex justify-between font-semibold border-t pt-1"><span>Total</span><span>{c.totalGb} GB</span></div>
                </div>
              ))}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

// ─── Match Dialog ─────────────────────────────────────────────────────────────

function MatchDialog({
  accountNumber,
  open,
  onClose,
}: {
  accountNumber: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");

  const { data: suggestions } = trpc.starlink.previewMatch.useQuery(
    { accountNumber: accountNumber! },
    { enabled: !!accountNumber }
  );

  const manualMatch = trpc.starlink.manualMatch.useMutation({
    onSuccess: () => { toast.success("Customer matched"); onClose(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Match Customer — {accountNumber}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {suggestions && suggestions.length > 0 && (
            <div>
              <Label className="text-xs text-muted-foreground mb-2 block">Suggested Match</Label>
              {suggestions.map((s) => (
                <div
                  key={s.customerExternalId}
                  className={`flex items-center justify-between p-2 rounded border cursor-pointer hover:bg-muted/30 ${selectedId === s.customerExternalId ? "border-primary bg-primary/5" : ""}`}
                  onClick={() => setSelectedId(s.customerExternalId)}
                >
                  <div>
                    <div className="text-sm font-medium">{s.customerName}</div>
                    <div className="text-xs text-muted-foreground">{s.customerExternalId}</div>
                  </div>
                  <Badge className="bg-amber-500 text-white text-xs">{s.confidence}% match</Badge>
                </div>
              ))}
            </div>
          )}
          <div>
            <Label>Customer External ID (manual)</Label>
            <Input
              value={selectedId || search}
              onChange={(e) => { setSearch(e.target.value); setSelectedId(e.target.value); }}
              placeholder="e.g. C0001"
              className="mt-1"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!selectedId || manualMatch.isPending}
            onClick={() => accountNumber && manualMatch.mutate({ accountNumber, customerExternalId: selectedId })}
          >
            {manualMatch.isPending ? "Matching…" : "Confirm Match"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Address Capacity Checker ─────────────────────────────────────────────────

function AddressCapacityChecker({ accountNumber }: { accountNumber: string }) {
  const [address, setAddress] = useState("");
  const [suburb, setSuburb] = useState("");
  const [postcode, setPostcode] = useState("");
  const [result, setResult] = useState<{ available: boolean; reason?: string } | null>(null);

  const check = trpc.starlink.addresses.checkCapacity.useMutation({
    onSuccess: (data) => setResult(data),
    onError: (e) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">Check Service Availability</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Street Address</Label>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="123 Main St" className="mt-1 h-8 text-sm" />
          </div>
          <div>
            <Label className="text-xs">Suburb</Label>
            <Input value={suburb} onChange={(e) => setSuburb(e.target.value)} placeholder="Sydney" className="mt-1 h-8 text-sm" />
          </div>
          <div>
            <Label className="text-xs">Postcode</Label>
            <Input value={postcode} onChange={(e) => setPostcode(e.target.value)} placeholder="2000" className="mt-1 h-8 text-sm" />
          </div>
        </div>
        <Button
          size="sm"
          disabled={!address || check.isPending}
          onClick={() => check.mutate({ accountNumber, addressLines: [address], locality: suburb, postalCode: postcode, countryCode: "AU" })}
        >
          {check.isPending ? "Checking…" : "Check Availability"}
        </Button>
        {result && (
          <div className={`flex items-center gap-2 p-2 rounded text-sm ${result.available ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"}`}>
            {result.available ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
            {result.available ? "Service available at this address" : `Not available: ${result.reason || "No coverage"}`}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Invoices Tab ────────────────────────────────────────────────────────────

function InvoicesTab({ accounts }: { accounts?: { accountNumber: string; nickname?: string | null }[] }) {
  const [dragOver, setDragOver] = useState(false);
  const [filterAccount, setFilterAccount] = useState<string>("all");
  const [expandedInvoice, setExpandedInvoice] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const utils = trpc.useUtils();
  const { data: invoices, isLoading } = trpc.starlink.invoices.list.useQuery(
    { accountNumber: filterAccount === "all" ? undefined : filterAccount },
  );
  const { data: invoiceLines } = trpc.starlink.invoices.lines.useQuery(
    { invoiceNumber: expandedInvoice! },
    { enabled: !!expandedInvoice }
  );
  const deleteInvoice = trpc.starlink.invoices.delete.useMutation({
    onSuccess: () => { toast.success("Invoice deleted"); utils.starlink.invoices.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const upsertInvoice = trpc.starlink.invoices.upsert.useMutation({
    onSuccess: () => { toast.success("Invoice saved"); utils.starlink.invoices.list.invalidate(); setUploading(false); },
    onError: (e) => { toast.error(e.message); setUploading(false); },
  });

  async function handleFiles(files: FileList | File[]) {
    const arr = Array.from(files);
    const pdfs = arr.filter(f => f.type === "application/pdf" || f.name.endsWith(".pdf"));
    if (pdfs.length === 0) { toast.error("Please drop PDF files only"); return; }
    setUploading(true);
    let ok = 0;
    for (const file of pdfs) {
      try {
        const formData = new FormData();
        formData.append("pdf", file);
        const res = await fetch("/api/starlink/parse-invoice", { method: "POST", body: formData });
        if (!res.ok) { const t = await res.text(); throw new Error(t); }
        const parsed = await res.json() as {
          invoiceNumber: string; accountNumber: string; invoiceDate: string;
          billingPeriodStart: string; billingPeriodEnd: string;
          subtotalExGst: number; totalGst: number; totalIncGst: number;
          paymentReceived: number; totalDue: number; status: string;
          lines: { serviceLineNumber?: string; serviceNickname?: string; kitSerial?: string; productDescription: string; qty: number; unitPriceExGst?: number; totalGst?: number; totalIncGst: number; billingPeriodStart?: string; billingPeriodEnd?: string; lineType: string }[];
        };
        await upsertInvoice.mutateAsync({ ...parsed, pdfFilename: file.name });
        ok++;
      } catch (e: unknown) {
        toast.error(`Failed to parse ${file.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    setUploading(false);
    if (ok > 0) toast.success(`${ok} invoice${ok > 1 ? "s" : ""} imported`);
  }

  const totalSpend = invoices?.reduce((s, i) => s + parseFloat(i.totalIncGst as string || "0"), 0) ?? 0;

  return (
    <div className="space-y-4">
      {/* Drop Zone */}
      <div
        className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
          dragOver ? "border-blue-500 bg-blue-500/10" : "border-muted-foreground/30 hover:border-blue-400/60 hover:bg-muted/30"
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
        onClick={() => { const inp = document.createElement("input"); inp.type = "file"; inp.accept = ".pdf"; inp.multiple = true; inp.onchange = (ev) => { const t = ev.target as HTMLInputElement; if (t.files) handleFiles(t.files); }; inp.click(); }}
      >
        {uploading ? (
          <div className="flex flex-col items-center gap-2">
            <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
            <p className="text-sm text-muted-foreground">Parsing invoice…</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Upload className={`w-8 h-8 ${dragOver ? "text-blue-500" : "text-muted-foreground/50"}`} />
            <p className="text-sm font-medium">{dragOver ? "Drop to import" : "Drag & drop Starlink PDF invoices here"}</p>
            <p className="text-xs text-muted-foreground">or click to browse — supports multiple files</p>
            <p className="text-xs text-muted-foreground/60">Source: Starlink portal invoice PDFs (INV-DF-AUS-...)</p>
          </div>
        )}
      </div>

      {/* Summary + Filter */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <div className="text-sm"><span className="font-semibold">{invoices?.length ?? 0}</span><span className="text-muted-foreground ml-1">invoices</span></div>
          <div className="text-sm"><span className="font-semibold">${totalSpend.toFixed(2)}</span><span className="text-muted-foreground ml-1">total inc GST</span></div>
        </div>
        <Select value={filterAccount} onValueChange={setFilterAccount}>
          <SelectTrigger className="w-56 h-8 text-xs"><SelectValue placeholder="Filter by account" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Accounts</SelectItem>
            {accounts?.map(a => (
              <SelectItem key={a.accountNumber} value={a.accountNumber}>{a.nickname || a.accountNumber}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Invoice Table */}
      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground text-sm">Loading invoices…</div>
      ) : !invoices || invoices.length === 0 ? (
        <Card><CardContent className="pt-6 text-center text-muted-foreground">
          <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No invoices yet. Drop PDF invoices above to import them.</p>
        </CardContent></Card>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="w-6" />
                <TableHead className="text-xs">Invoice #</TableHead>
                <TableHead className="text-xs">Account</TableHead>
                <TableHead className="text-xs">Invoice Date</TableHead>
                <TableHead className="text-xs">Billing Period</TableHead>
                <TableHead className="text-xs text-right">Ex GST</TableHead>
                <TableHead className="text-xs text-right">GST</TableHead>
                <TableHead className="text-xs text-right">Inc GST</TableHead>
                <TableHead className="text-xs text-right">Balance Due</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map(inv => (
                <>
                  <TableRow key={inv.invoiceNumber} className="cursor-pointer hover:bg-muted/20">
                    <TableCell className="w-6 pl-3">
                      <button onClick={() => setExpandedInvoice(expandedInvoice === inv.invoiceNumber ? null : inv.invoiceNumber)} className="text-muted-foreground hover:text-foreground">
                        {expandedInvoice === inv.invoiceNumber ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </button>
                    </TableCell>
                    <TableCell className="text-xs font-mono">{inv.invoiceNumber}</TableCell>
                    <TableCell className="text-xs">{accounts?.find(a => a.accountNumber === inv.accountNumber)?.nickname || inv.accountNumber}</TableCell>
                    <TableCell className="text-xs">{inv.invoiceDate}</TableCell>
                    <TableCell className="text-xs">{inv.billingPeriodStart} → {inv.billingPeriodEnd}</TableCell>
                    <TableCell className="text-xs text-right">${parseFloat(inv.subtotalExGst as string).toFixed(2)}</TableCell>
                    <TableCell className="text-xs text-right">${parseFloat(inv.totalGst as string).toFixed(2)}</TableCell>
                    <TableCell className="text-xs text-right font-semibold">${parseFloat(inv.totalIncGst as string).toFixed(2)}</TableCell>
                    <TableCell className="text-xs text-right">
                      <span className={parseFloat(inv.totalDue as string) > 0 ? "text-red-500 font-semibold" : "text-muted-foreground"}>
                        ${parseFloat(inv.totalDue as string).toFixed(2)}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs">
                      <Badge className={inv.status === "paid" ? "bg-emerald-600 text-white text-xs" : "bg-amber-500 text-white text-xs"}>{inv.status}</Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-red-500"
                        onClick={() => { if (confirm(`Delete invoice ${inv.invoiceNumber}?`)) deleteInvoice.mutate({ invoiceNumber: inv.invoiceNumber }); }}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </TableCell>
                  </TableRow>
                  {expandedInvoice === inv.invoiceNumber && (
                    <TableRow key={`${inv.invoiceNumber}-lines`}>
                      <TableCell colSpan={11} className="bg-muted/10 p-0">
                        <div className="px-8 py-3">
                          <p className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wide">Service Line Charges</p>
                          {invoiceLines && invoiceLines.length > 0 ? (
                            <table className="w-full text-xs">
                              <thead><tr className="text-muted-foreground border-b">
                                <th className="text-left pb-1 font-medium">Service / Kit</th>
                                <th className="text-left pb-1 font-medium">Product</th>
                                <th className="text-right pb-1 font-medium">Ex GST</th>
                                <th className="text-right pb-1 font-medium">GST</th>
                                <th className="text-right pb-1 font-medium">Inc GST</th>
                              </tr></thead>
                              <tbody>
                                {invoiceLines.map(l => (
                                  <tr key={l.id} className="border-b border-muted/30">
                                    <td className="py-1">
                                      <div className="font-medium">{l.serviceNickname || l.serviceLineNumber || "—"}</div>
                                      {l.kitSerial && <div className="text-muted-foreground font-mono">{l.kitSerial}</div>}
                                    </td>
                                    <td className="py-1 text-muted-foreground max-w-xs truncate">{l.productDescription}</td>
                                    <td className="py-1 text-right">${parseFloat(l.unitPriceExGst as string || "0").toFixed(2)}</td>
                                    <td className="py-1 text-right">${parseFloat(l.totalGst as string || "0").toFixed(2)}</td>
                                    <td className="py-1 text-right font-semibold">${parseFloat(l.totalIncGst as string).toFixed(2)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          ) : (
                            <p className="text-xs text-muted-foreground">No line items recorded.</p>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function StarlinkPage() {
  const [matchTarget, setMatchTarget] = useState<string | null>(null);
  const [matchFilter, setMatchFilter] = useState<"all" | "matched" | "unmatched" | "suggested">("all");
  const [selectedAccountForTools, setSelectedAccountForTools] = useState<string>("");

  const { data: status, refetch: refetchStatus } = trpc.starlink.status.useQuery();
  const { data: accounts, isLoading, refetch: refetchAccounts } = trpc.starlink.listAccounts.useQuery({ matchStatus: matchFilter });
  const { data: addresses } = trpc.starlink.addresses.list.useQuery(
    { accountNumber: selectedAccountForTools },
    { enabled: !!selectedAccountForTools }
  );
  const { data: routerConfigs } = trpc.starlink.routers.configs.useQuery(
    { accountNumber: selectedAccountForTools },
    { enabled: !!selectedAccountForTools }
  );

  const utils = trpc.useUtils();

  const syncAll = trpc.starlink.syncAll.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success(`Sync complete — ${data.accountsSynced} accounts, ${data.serviceLinesSynced} service lines, ${data.terminalsSynced} terminals`);
        utils.starlink.listAccounts.invalidate();
        utils.starlink.status.invalidate();
      } else {
        toast.error(data.error || "Sync failed");
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const autoMatch = trpc.starlink.runAutoMatch.useMutation({
    onSuccess: (data) => {
      toast.success(`Auto-match complete — ${(data as { matched?: number }).matched ?? 0} accounts matched`);
      utils.starlink.listAccounts.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const unmatch = trpc.starlink.unmatch.useMutation({
    onSuccess: () => { toast.success("Match removed"); utils.starlink.listAccounts.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  if (!status?.configured) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <Card className="border-amber-500/30 bg-amber-50/10">
          <CardContent className="pt-6">
            <div className="flex gap-3">
              <AlertTriangle className="w-6 h-6 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-amber-700 dark:text-amber-400">Starlink credentials not configured</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  To connect your Starlink accounts, add the following secrets via the Secrets panel:
                </p>
                <ul className="mt-2 space-y-1 text-sm font-mono">
                  <li><code className="bg-muted px-1 rounded">STARLINK_CLIENT_ID</code> — from Starlink portal → Settings → Service Accounts</li>
                  <li><code className="bg-muted px-1 rounded">STARLINK_CLIENT_SECRET</code> — shown once on service account creation</li>
                  <li><code className="bg-muted px-1 rounded">STARLINK_ACCOUNT_NUMBERS</code> — comma-separated account numbers (optional, syncs all if omitted)</li>
                </ul>
                <p className="text-xs text-muted-foreground mt-2">
                  Note: API access requires an Enterprise or Reseller Starlink account. Standard Business accounts do not have API access by default.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-600/10">
            <Satellite className="w-6 h-6 text-blue-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Starlink</h1>
            <p className="text-sm text-muted-foreground">Enterprise API — Full Management</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => autoMatch.mutate()} disabled={autoMatch.isPending}>
            <Link2 className="w-4 h-4 mr-2" />
            {autoMatch.isPending ? "Matching…" : "Auto-Match"}
          </Button>
          <Button size="sm" onClick={() => syncAll.mutate({})} disabled={syncAll.isPending}>
            <RefreshCw className={`w-4 h-4 mr-2 ${syncAll.isPending ? "animate-spin" : ""}`} />
            {syncAll.isPending ? "Syncing…" : "Sync All"}
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{status?.accountCount ?? 0}</div>
            <div className="text-xs text-muted-foreground mt-1">Accounts</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{status?.serviceLineCount ?? 0}</div>
            <div className="text-xs text-muted-foreground mt-1">Service Lines</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{status?.terminalCount ?? 0}</div>
            <div className="text-xs text-muted-foreground mt-1">Terminals</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-emerald-500">{status?.matchedCount ?? 0}</div>
            <div className="text-xs text-muted-foreground mt-1">Matched to Customers</div>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs defaultValue="accounts">
        <TabsList>
          <TabsTrigger value="accounts">Accounts & Service Lines</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="tools">Tools & Utilities</TabsTrigger>
        </TabsList>

        {/* Accounts Tab */}
        <TabsContent value="accounts" className="space-y-4">
          {/* Filter */}
          <div className="flex gap-2 items-center">
            <span className="text-sm text-muted-foreground">Filter:</span>
            {(["all", "matched", "unmatched", "suggested"] as const).map((f) => (
              <Button
                key={f}
                size="sm"
                variant={matchFilter === f ? "default" : "outline"}
                className="h-7 text-xs capitalize"
                onClick={() => setMatchFilter(f)}
              >
                {f}
              </Button>
            ))}
          </div>

          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground">Loading accounts…</div>
          ) : !accounts || accounts.length === 0 ? (
            <Card>
              <CardContent className="pt-6 text-center text-muted-foreground">
                <Satellite className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No accounts synced yet. Click <strong>Sync All</strong> to pull data from Starlink.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="w-6" />
                    <TableHead className="text-xs">Account #</TableHead>
                    <TableHead className="text-xs">Name</TableHead>
                    <TableHead className="text-xs">Address</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs">Customer Match</TableHead>
                    <TableHead className="text-xs">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accounts.map((acct) => (
                    <AccountRow
                      key={acct.accountNumber}
                      account={acct}
                      onMatch={(an) => setMatchTarget(an)}
                      onUnmatch={(an) => unmatch.mutate({ accountNumber: an })}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* Tools Tab */}
        <TabsContent value="tools" className="space-y-4">
          <div className="mb-4">
            <Label>Select Account for Tools</Label>
            <Select value={selectedAccountForTools} onValueChange={setSelectedAccountForTools}>
              <SelectTrigger className="mt-1 w-72">
                <SelectValue placeholder="Choose an account…" />
              </SelectTrigger>
              <SelectContent>
                {accounts?.map((a) => (
                  <SelectItem key={a.accountNumber} value={a.accountNumber}>
                    {a.nickname || a.accountNumber}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedAccountForTools ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Address Capacity Checker */}
              <AddressCapacityChecker accountNumber={selectedAccountForTools} />

              {/* Addresses */}
              <Card>
                <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Globe className="w-4 h-4" />Registered Addresses</CardTitle></CardHeader>
                <CardContent>
                  {addresses && addresses.length > 0 ? (
                    <div className="space-y-2">
                      {addresses.map((a) => (
                        <div key={a.addressReferenceId} className="text-xs p-2 rounded border">
                          <div className="font-mono text-muted-foreground">{a.addressReferenceId}</div>
                          <div>{a.formatted || [a.addressLines?.join(", "), a.locality, a.administrativeArea, a.postalCode].filter(Boolean).join(", ")}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">No addresses on file.</p>
                  )}
                </CardContent>
              </Card>

              {/* Router Configs */}
              <Card>
                <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Settings className="w-4 h-4" />Router Configurations</CardTitle></CardHeader>
                <CardContent>
                  {routerConfigs && routerConfigs.length > 0 ? (
                    <div className="space-y-2">
                      {routerConfigs.map((c) => (
                        <div key={c.configId} className="text-xs p-2 rounded border">
                          <div className="font-semibold">{c.name || c.configId}</div>
                          <div className="font-mono text-muted-foreground">{c.configId}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">No router configs.</p>
                  )}
                </CardContent>
              </Card>

              {/* API Info */}
              <Card>
                <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Database className="w-4 h-4" />API Capabilities</CardTitle></CardHeader>
                <CardContent className="text-xs space-y-1 text-muted-foreground">
                  <div className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-emerald-500" />Service line activate/deactivate</div>
                  <div className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-emerald-500" />One-time &amp; recurring data top-up</div>
                  <div className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-emerald-500" />Public IP enable/disable</div>
                  <div className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-emerald-500" />Product/plan changes</div>
                  <div className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-emerald-500" />Terminal reboot &amp; service line assignment</div>
                  <div className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-emerald-500" />Billing cycle usage (all periods)</div>
                  <div className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-emerald-500" />Partial period (current month) usage</div>
                  <div className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-emerald-500" />Address capacity checks</div>
                  <div className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-emerald-500" />Router config management</div>
                  <div className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-emerald-500" />Opt-in / opt-out programs</div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card>
              <CardContent className="pt-6 text-center text-muted-foreground">
                <p className="text-sm">Select an account above to use the tools.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Invoices Tab */}
        <TabsContent value="invoices" className="space-y-4">
          <InvoicesTab accounts={accounts ?? []} />
        </TabsContent>
      </Tabs>

      {/* Match Dialog */}
      <MatchDialog
        accountNumber={matchTarget}
        open={!!matchTarget}
        onClose={() => setMatchTarget(null)}
      />
    </div>
  );
}
