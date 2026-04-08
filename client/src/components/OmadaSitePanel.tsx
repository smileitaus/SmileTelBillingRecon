/**
 * OmadaSitePanel — shows Omada network status for a customer.
 * Rendered on the CustomerDetail page when an Omada site is linked.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Link } from "wouter";
import {
  Wifi,
  Router,
  Users,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ShieldOff,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  TrendingUp,
  ArrowDown,
  ArrowUp,
} from "lucide-react";
import { toast } from "sonner";

function formatUptime(seconds: number | null | undefined): string {
  if (!seconds) return "—";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return "—";
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  return `${(bytes / 1e3).toFixed(0)} KB`;
}

interface OmadaSitePanelProps {
  customerExternalId: string;
}

export function OmadaSitePanel({ customerExternalId }: OmadaSitePanelProps) {
  const [showClients, setShowClients] = useState(false);
  const [showTopClients, setShowTopClients] = useState(false);
  const [blockTarget, setBlockTarget] = useState<{ mac: string; hostname: string } | null>(null);
  const [trafficTimeRange, setTrafficTimeRange] = useState<'24h' | '7d' | '30d' | 'all'>('30d');

  const { data: site, isLoading: siteLoading, refetch: refetchSite } =
    trpc.billing.omada.getSiteByCustomer.useQuery({ customerExternalId });

  const { data: clientsData, isLoading: clientsLoading, refetch: refetchClients } =
    trpc.billing.omada.getClients.useQuery(
      { omadaSiteId: site?.omadaSiteId ?? "" },
      { enabled: showClients && !!site?.omadaSiteId }
    );

  const { data: topClients = [], isLoading: topClientsLoading } =
    trpc.billing.omada.getTopClients.useQuery(
      { omadaSiteId: site?.omadaSiteId ?? "", limit: 5, timeRange: trafficTimeRange },
      { enabled: showTopClients && !!site?.omadaSiteId }
    );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clients: Array<any> = Array.isArray(clientsData) ? clientsData : [];

  const syncMutation = trpc.billing.omada.syncSites.useMutation({
    onSuccess: () => {
      toast.success("Omada site data refreshed.");
      refetchSite();
    },
    onError: (err) => toast.error(`Sync failed: ${err.message}`),
  });

  const unblockMutation = trpc.billing.omada.unblockClient.useMutation({
    onSuccess: (res) => {
      toast.success(`Client ${res.mac} unblocked.`);
      refetchClients();
    },
    onError: (err) => toast.error(`Unblock failed: ${err.message}`),
  });

  const blockMutation = trpc.billing.omada.blockClient.useMutation({
    onSuccess: (res) => {
      toast.success(`Client ${res.mac} blocked.`);
      setBlockTarget(null);
      refetchClients();
    },
    onError: (err) => toast.error(`Block failed: ${err.message}`),
  });

  if (siteLoading) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          Loading Omada network status…
        </CardContent>
      </Card>
    );
  }

  if (!site) {
    return null; // No Omada site linked — panel hidden
  }

  const wanConnected = site.wanStatus === "connected" || site.wanStatus === "active";

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <Wifi className="w-3.5 h-3.5" />
            Omada Network
            <div className="ml-auto flex items-center gap-2">
              <Badge
                variant="outline"
                className={`text-xs font-normal ${
                  wanConnected
                    ? "border-emerald-500 text-emerald-700"
                    : "border-red-400 text-red-600"
                }`}
              >
                {wanConnected ? (
                  <><CheckCircle2 className="w-3 h-3 mr-1" /> Online</>
                ) : (
                  <><XCircle className="w-3 h-3 mr-1" /> Offline</>
                )}
              </Badge>
              <Link href="/omada-fleet">
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-muted-foreground gap-1">
                  <ExternalLink className="w-3 h-3" /> Fleet
                </Button>
              </Link>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* WAN row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="space-y-0.5">
              <div className="text-xs text-muted-foreground">WAN Status</div>
              <div className="flex items-center gap-1 text-sm font-medium">
                {wanConnected ? (
                  <><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Connected</>
                ) : (
                  <><XCircle className="w-3.5 h-3.5 text-red-500" /> Disconnected</>
                )}
              </div>
            </div>
            <div className="space-y-0.5">
              <div className="text-xs text-muted-foreground">WAN IP</div>
              <div className="text-sm font-mono">{site.wanIp ?? "—"}</div>
            </div>
            <div className="space-y-0.5">
              <div className="text-xs text-muted-foreground">Uptime</div>
              <div className="text-sm">{formatUptime(site.wanUptimeSeconds)}</div>
            </div>
            <div className="space-y-0.5">
              <div className="text-xs text-muted-foreground">Health</div>
              <div className="text-sm capitalize">{site.healthStatus ?? "—"}</div>
            </div>
          </div>

          {/* Device counts */}
          <div className="grid grid-cols-4 gap-2 pt-1 border-t">
            <div className="text-center">
              <div className="text-lg font-semibold">{site.deviceCount ?? 0}</div>
              <div className="text-xs text-muted-foreground">Devices</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold">{site.apCount ?? 0}</div>
              <div className="text-xs text-muted-foreground">APs</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold">{site.switchCount ?? 0}</div>
              <div className="text-xs text-muted-foreground">Switches</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold text-blue-600">{site.clientCount ?? 0}</div>
              <div className="text-xs text-muted-foreground">Clients</div>
            </div>
          </div>

          {/* Alerts */}
          {(site.alertCount ?? 0) > 0 && (
            <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>{site.alertCount} active alert{(site.alertCount ?? 0) > 1 ? "s" : ""} on this site</span>
            </div>
          )}

          {/* Top Clients by Traffic */}
          <div className="border-t pt-2">
            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                size="sm"
                className="flex-1 justify-between text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setShowTopClients((v) => !v)}
              >
                <span className="flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5" />
                  Top Clients by Traffic
                </span>
                {showTopClients ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </Button>
              {showTopClients && (
                <div className="flex items-center gap-0.5 ml-2">
                  {(['24h', '7d', '30d', 'all'] as const).map((range) => (
                    <button
                      key={range}
                      onClick={() => setTrafficTimeRange(range)}
                      className={`px-2 py-0.5 text-xs rounded transition-colors ${
                        trafficTimeRange === range
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                      }`}
                    >
                      {range === 'all' ? 'All' : range}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {showTopClients && (
              <div className="mt-2">
                {topClientsLoading ? (
                  <div className="py-3 text-center text-xs text-muted-foreground">Loading traffic data…</div>
                ) : topClients.length === 0 ? (
                  <div className="py-3 text-center text-xs text-muted-foreground">No traffic data available.</div>
                ) : (
                  <div className="space-y-1.5">
                    {topClients.map((c, i) => {
                      const total = c.totalTraffic || 1;
                      const maxTotal = topClients[0]?.totalTraffic || 1;
                      const barWidth = Math.round((total / maxTotal) * 100);
                      return (
                        <div key={c.mac} className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground w-4 text-right shrink-0">{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-0.5">
                              <span className="text-xs font-medium truncate">{c.name}</span>
                              <span className="text-xs text-muted-foreground shrink-0 ml-2">
                                <span className="inline-flex items-center gap-0.5"><ArrowDown className="w-2.5 h-2.5 text-blue-500" />{formatBytes(c.trafficDown)}</span>
                                {" / "}
                                <span className="inline-flex items-center gap-0.5"><ArrowUp className="w-2.5 h-2.5 text-orange-500" />{formatBytes(c.trafficUp)}</span>
                              </span>
                            </div>
                            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-blue-400 to-teal-500 rounded-full"
                                style={{ width: `${barWidth}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Connected clients toggle */}
          <div className="border-t pt-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-between text-xs text-muted-foreground hover:text-foreground"
              onClick={() => {
                setShowClients((v) => !v);
                if (!showClients) refetchClients();
              }}
            >
              <span className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" />
                Connected Clients
              </span>
              {showClients ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </Button>

            {showClients && (
              <div className="mt-2">
                {clientsLoading ? (
                  <div className="py-4 text-center text-xs text-muted-foreground">Loading clients…</div>
                ) : clients.length === 0 ? (
                  <div className="py-4 text-center text-xs text-muted-foreground">No connected clients.</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Hostname</TableHead>
                        <TableHead className="text-xs">IP</TableHead>
                        <TableHead className="text-xs">MAC</TableHead>
                        <TableHead className="text-xs">Connection</TableHead>
                        <TableHead className="text-xs">↓ / ↑</TableHead>
                        <TableHead className="text-xs w-8"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {clients.map((c) => {
                        const mac = String(c.mac ?? "");
                        const hostname = String(c.name ?? c.hostname ?? mac);
                        const ip = String(c.ip ?? "—");
                        const ssid = String(c.ssid ?? c.networkName ?? "—");
                        const down = Number(c.downPacket ?? c.trafficDown ?? 0);
                        const up = Number(c.upPacket ?? c.trafficUp ?? 0);
                        return (
                          <TableRow key={mac}>
                            <TableCell className="py-1.5 text-xs font-medium">{hostname}</TableCell>
                            <TableCell className="py-1.5 text-xs font-mono text-muted-foreground">{ip}</TableCell>
                            <TableCell className="py-1.5 text-xs font-mono text-muted-foreground">{mac}</TableCell>
                            <TableCell className="py-1.5 text-xs">{ssid}</TableCell>
                            <TableCell className="py-1.5 text-xs text-muted-foreground">
                              {formatBytes(down)} / {formatBytes(up)}
                            </TableCell>
                            <TableCell className="py-1.5">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6 text-red-500 hover:text-red-700"
                                title="Block client"
                                onClick={() => setBlockTarget({ mac, hostname })}
                              >
                                <ShieldOff className="w-3.5 h-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </div>
            )}
          </div>

          {/* Footer: last synced + sync button */}
          <div className="flex items-center justify-between pt-1 border-t">
            <div className="text-xs text-muted-foreground">
              Last synced:{" "}
              {site.lastSyncedAt
                ? new Date(site.lastSyncedAt).toLocaleString()
                : "never"}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground gap-1.5"
              disabled={syncMutation.isPending}
              onClick={() => syncMutation.mutate()}
            >
              <RefreshCw className={`w-3 h-3 ${syncMutation.isPending ? "animate-spin" : ""}`} />
              Sync Now
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Block confirmation dialog */}
      <Dialog open={!!blockTarget} onOpenChange={(o) => !o && setBlockTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldOff className="w-4 h-4 text-red-500" />
              Block Client
            </DialogTitle>
            <DialogDescription>
              This will block <strong>{blockTarget?.hostname}</strong> ({blockTarget?.mac}) from the network at this site.
              The client will be unable to connect until manually unblocked.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setBlockTarget(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={blockMutation.isPending}
              onClick={() => {
                if (blockTarget && site) {
                  blockMutation.mutate({ omadaSiteId: site.omadaSiteId, mac: blockTarget.mac });
                }
              }}
            >
              {blockMutation.isPending ? "Blocking…" : "Block Client"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
