import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Wifi,
  Router,
  RefreshCw,
  Search,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Link2,
  Unlink,
  Users,
  Activity,
} from "lucide-react";
import { toast } from "sonner";
import { Link } from "wouter";

function formatUptime(seconds: number | null | undefined): string {
  if (!seconds) return "—";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function HealthBadge({ status }: { status: string | null | undefined }) {
  if (!status) return <Badge variant="outline" className="text-xs">Unknown</Badge>;
  const s = status.toLowerCase();
  if (s === "good" || s === "healthy") return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-xs">{status}</Badge>;
  if (s === "warning") return <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-xs">{status}</Badge>;
  if (s === "bad" || s === "critical") return <Badge className="bg-red-100 text-red-800 border-red-200 text-xs">{status}</Badge>;
  return <Badge variant="outline" className="text-xs">{status}</Badge>;
}

function WanBadge({ status }: { status: string | null | undefined }) {
  if (status === "connected") return (
    <span className="flex items-center gap-1 text-emerald-700 text-xs font-medium">
      <CheckCircle2 className="w-3 h-3" /> Connected
    </span>
  );
  if (status === "disconnected") return (
    <span className="flex items-center gap-1 text-red-600 text-xs font-medium">
      <XCircle className="w-3 h-3" /> Disconnected
    </span>
  );
  return <span className="text-muted-foreground text-xs">—</span>;
}

export default function OmadaFleet() {
  const [search, setSearch] = useState("");
  const [linkDialog, setLinkDialog] = useState<{ siteId: string; siteName: string } | null>(null);
  const [linkCustomerSearch, setLinkCustomerSearch] = useState("");

  const { data: sites = [], refetch, isLoading } = trpc.billing.omada.listSites.useQuery();
  const syncMutation = trpc.billing.omada.syncSites.useMutation({
    onSuccess: (result) => {
      toast.success(`Sync complete — ${result.synced} sites synced, ${result.total} total from Omada.`);
      refetch();
    },
    onError: (err) => {
      toast.error(`Sync failed: ${err.message}`);
    },
  });

  const linkMutation = trpc.billing.omada.linkSiteToCustomer.useMutation({
    onSuccess: () => {
      toast.success("Omada site linked to customer.");
      setLinkDialog(null);
      refetch();
    },
    onError: (err) => {
      toast.error(`Link failed: ${err.message}`);
    },
  });

  const { data: customerResults = [] } = trpc.billing.customers.proposals.searchCustomers.useQuery(
    { search: linkCustomerSearch },
    { enabled: linkCustomerSearch.length >= 2 }
  );

  const filtered = sites.filter((s) => {
    const q = search.toLowerCase();
    return (
      s.omadaSiteName.toLowerCase().includes(q) ||
      (s.wanIp ?? "").toLowerCase().includes(q) ||
      (s.customerExternalId ?? "").toLowerCase().includes(q)
    );
  });

  const totalSites = sites.length;
  const connectedSites = sites.filter((s) => s.wanStatus === "connected").length;
  const unmatchedSites = sites.filter((s) => s.matchType === "unmatched").length;
  const alertSites = sites.filter((s) => (s.alertCount ?? 0) > 0).length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <Wifi className="w-5 h-5 text-muted-foreground" />
            Omada Network Fleet
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            TP-Link Omada Cloud Controller — APAC region
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending}
          className="gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${syncMutation.isPending ? "animate-spin" : ""}`} />
          {syncMutation.isPending ? "Syncing…" : "Sync Sites"}
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-2xl font-bold">{totalSites}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Total Sites</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-2xl font-bold text-emerald-700">{connectedSites}</div>
            <div className="text-xs text-muted-foreground mt-0.5">WAN Connected</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-2xl font-bold text-amber-600">{unmatchedSites}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Unmatched Sites</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-2xl font-bold text-red-600">{alertSites}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Sites with Alerts</div>
          </CardContent>
        </Card>
      </div>

      {/* Search + Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search sites…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
            </div>
            <span className="text-xs text-muted-foreground">{filtered.length} sites</span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">Loading sites…</div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <Router className="w-8 h-8 text-muted-foreground mx-auto" />
              <p className="text-sm text-muted-foreground">
                {sites.length === 0
                  ? "No sites synced yet. Click \"Sync Sites\" to pull from Omada."
                  : "No sites match your search."}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Site Name</TableHead>
                  <TableHead className="text-xs">WAN</TableHead>
                  <TableHead className="text-xs">WAN IP</TableHead>
                  <TableHead className="text-xs">Uptime</TableHead>
                  <TableHead className="text-xs">Devices</TableHead>
                  <TableHead className="text-xs">Clients</TableHead>
                  <TableHead className="text-xs">Health</TableHead>
                  <TableHead className="text-xs">Alerts</TableHead>
                  <TableHead className="text-xs">Customer</TableHead>
                  <TableHead className="text-xs w-8"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((site) => (
                  <TableRow key={site.omadaSiteId}>
                    <TableCell className="font-medium text-sm py-2">
                      {site.omadaSiteName}
                      {site.siteScenario && (
                        <span className="text-xs text-muted-foreground ml-1.5">({site.siteScenario})</span>
                      )}
                    </TableCell>
                    <TableCell className="py-2">
                      <WanBadge status={site.wanStatus} />
                    </TableCell>
                    <TableCell className="py-2 text-xs font-mono text-muted-foreground">
                      {site.wanIp ?? "—"}
                    </TableCell>
                    <TableCell className="py-2 text-xs text-muted-foreground">
                      {formatUptime(site.wanUptimeSeconds)}
                    </TableCell>
                    <TableCell className="py-2 text-xs">
                      <span className="flex items-center gap-1">
                        <Router className="w-3 h-3 text-muted-foreground" />
                        {site.deviceCount ?? 0}
                      </span>
                    </TableCell>
                    <TableCell className="py-2 text-xs">
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3 text-muted-foreground" />
                        {site.clientCount ?? 0}
                      </span>
                    </TableCell>
                    <TableCell className="py-2">
                      <HealthBadge status={site.healthStatus} />
                    </TableCell>
                    <TableCell className="py-2 text-xs">
                      {(site.alertCount ?? 0) > 0 ? (
                        <span className="flex items-center gap-1 text-amber-600 font-medium">
                          <AlertTriangle className="w-3 h-3" />
                          {site.alertCount}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="py-2 text-xs">
                      {site.customerExternalId ? (
                        <Link href={`/customers/${site.customerExternalId}`} className="text-blue-600 hover:underline">
                          {site.customerExternalId}
                        </Link>
                      ) : (
                        <span className="text-amber-600 text-xs">Unmatched</span>
                      )}
                    </TableCell>
                    <TableCell className="py-2">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        title={site.customerExternalId ? "Re-link site" : "Link to customer"}
                        onClick={() => setLinkDialog({ siteId: site.omadaSiteId, siteName: site.omadaSiteName })}
                      >
                        {site.customerExternalId ? <Link2 className="w-3 h-3" /> : <Unlink className="w-3 h-3 text-amber-500" />}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Link to customer dialog */}
      <Dialog open={!!linkDialog} onOpenChange={(o) => !o && setLinkDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link Omada Site to Customer</DialogTitle>
            <DialogDescription>
              Search for the customer to link <strong>{linkDialog?.siteName}</strong> to.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Input
              placeholder="Search customer name…"
              value={linkCustomerSearch}
              onChange={(e) => setLinkCustomerSearch(e.target.value)}
              autoFocus
            />
            {customerResults.length > 0 && (
              <div className="border rounded-md divide-y max-h-48 overflow-y-auto">
                {customerResults.map((c) => (
                  <button
                    key={c.externalId}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors"
                    onClick={() => {
                      if (linkDialog) {
                        linkMutation.mutate({
                          omadaSiteId: linkDialog.siteId,
                          customerExternalId: c.externalId,
                        });
                      }
                    }}
                  >
                    <div className="font-medium">{c.name}</div>
                    {c.businessName && <div className="text-xs text-muted-foreground">{c.businessName}</div>}
                  </button>
                ))}
              </div>
            )}
            {linkCustomerSearch.length >= 2 && customerResults.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-2">No customers found.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkDialog(null)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
