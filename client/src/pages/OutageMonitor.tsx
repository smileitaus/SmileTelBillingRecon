/**
 * OutageMonitor.tsx
 * Real-time ABB Carbon API outage monitoring dashboard.
 *
 * Shows:
 *   - Active outages across all ABB services (auto-refreshes every 2 min)
 *   - Outage breakdown by type (network event, NBN current, NBN scheduled)
 *   - Per-customer outage grouping
 *   - Manual sync trigger
 *   - Usage snapshot summary for the current billing period
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  AlertTriangle, CheckCircle2, RefreshCw, Loader2, Wifi,
  Clock, Activity, BarChart3, ChevronDown, ChevronUp,
  Zap, Calendar, TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Outage {
  id: number;
  serviceExternalId: string;
  carbonServiceId: string | null;
  customerExternalId: string | null;
  outageType: string;
  outageId: string | null;
  title: string | null;
  description: string | null;
  status: string;
  severity: string | null;
  startTime: Date | string | null;
  endTime: Date | string | null;
  estimatedResolution: Date | string | null;
  firstSeenAt: Date | string;
  lastSeenAt: Date | string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-AU", { dateStyle: "short", timeStyle: "short" });
}

function formatRelative(d: Date | string | null | undefined) {
  if (!d) return "—";
  const ms = Date.now() - new Date(d).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function outageSeverityColor(severity: string | null, type: string) {
  if (severity === "critical" || type === "networkEvent") return "bg-red-100 text-red-800 border-red-200";
  if (severity === "high" || type === "currentNbnOutage") return "bg-orange-100 text-orange-800 border-orange-200";
  if (type === "scheduledNbnOutage") return "bg-blue-100 text-blue-800 border-blue-200";
  return "bg-amber-100 text-amber-800 border-amber-200";
}

function outageTypeLabel(type: string) {
  const labels: Record<string, string> = {
    networkEvent: "Network Event",
    aussieOutage: "Aussie Outage",
    currentNbnOutage: "NBN Outage",
    scheduledNbnOutage: "Scheduled Maintenance",
    resolvedNbnOutage: "Resolved",
    resolvedScheduledNbnOutage: "Resolved (Scheduled)",
  };
  return labels[type] || type;
}

// ── Outage Card ───────────────────────────────────────────────────────────────

function OutageCard({ outage }: { outage: Outage }) {
  const [expanded, setExpanded] = useState(false);
  const colorClass = outageSeverityColor(outage.severity, outage.outageType);

  return (
    <div className={`rounded-lg border p-4 ${colorClass} transition-all`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm">{outage.serviceExternalId}</span>
            <Badge variant="outline" className="text-xs border-current">
              {outageTypeLabel(outage.outageType)}
            </Badge>
            {outage.severity && (
              <Badge variant="outline" className="text-xs border-current uppercase">
                {outage.severity}
              </Badge>
            )}
          </div>
          <p className="text-sm mt-1 font-medium">{outage.title || "Service outage detected"}</p>
          {outage.customerExternalId && (
            <p className="text-xs mt-0.5 opacity-75">Customer: {outage.customerExternalId}</p>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs opacity-75">First seen</p>
          <p className="text-xs font-medium">{formatRelative(outage.firstSeenAt)}</p>
        </div>
      </div>

      {outage.description && (
        <div className="mt-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-xs opacity-75 hover:opacity-100 transition-opacity"
          >
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {expanded ? "Hide details" : "Show details"}
          </button>
          {expanded && (
            <p className="text-xs mt-2 opacity-90 leading-relaxed">{outage.description}</p>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-4 mt-3 text-xs opacity-75">
        {outage.startTime && (
          <span>Started: {formatDate(outage.startTime)}</span>
        )}
        {outage.estimatedResolution && (
          <span>ETA: {formatDate(outage.estimatedResolution)}</span>
        )}
        {outage.endTime && (
          <span>Ended: {formatDate(outage.endTime)}</span>
        )}
        <span>Last seen: {formatDate(outage.lastSeenAt)}</span>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function OutageMonitor() {
  const [syncing, setSyncing] = useState(false);
  const [syncingUsage, setSyncingUsage] = useState(false);

  const { data: outages = [], isLoading, refetch, dataUpdatedAt } = trpc.billing.getActiveOutages.useQuery(
    {},
    { refetchInterval: 2 * 60 * 1000 } // auto-refresh every 2 minutes
  );

  const syncOutagesMutation = trpc.billing.syncCarbonOutages.useMutation({
    onSuccess: (result) => {
      setSyncing(false);
      toast.success(`Outage sync complete: ${result.outagesFound} outages found, ${result.outagesCreated} new`);
      refetch();
    },
    onError: (err) => {
      setSyncing(false);
      toast.error(`Sync failed: ${err.message}`);
    },
  });

  const syncUsageMutation = trpc.billing.syncCarbonUsage.useMutation({
    onSuccess: (result) => {
      setSyncingUsage(false);
      toast.success(`Usage sync complete: ${result.snapshotsCreated} created, ${result.snapshotsUpdated} updated`);
    },
    onError: (err) => {
      setSyncingUsage(false);
      toast.error(`Usage sync failed: ${err.message}`);
    },
  });

  const handleSyncOutages = () => {
    setSyncing(true);
    syncOutagesMutation.mutate({ triggeredBy: "manual" });
  };

  const handleSyncUsage = () => {
    setSyncingUsage(true);
    syncUsageMutation.mutate({ triggeredBy: "manual" });
  };

  // Group outages by type
  const networkEvents = outages.filter((o) => o.outageType === "networkEvent");
  const currentNbn = outages.filter((o) => o.outageType === "currentNbnOutage");
  const scheduled = outages.filter((o) => o.outageType === "scheduledNbnOutage");
  const other = outages.filter(
    (o) => !["networkEvent", "currentNbnOutage", "scheduledNbnOutage"].includes(o.outageType)
  );

  const hasOutages = outages.length > 0;

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="w-6 h-6 text-orange-500" />
            Outage Monitor
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Real-time ABB Carbon API outage tracking. Auto-refreshes every 2 minutes.
            {dataUpdatedAt ? ` Last updated ${formatRelative(new Date(dataUpdatedAt))}.` : ""}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSyncUsage}
            disabled={syncingUsage}
          >
            {syncingUsage ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <BarChart3 className="w-4 h-4 mr-1" />}
            Sync Usage
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSyncOutages}
            disabled={syncing}
          >
            {syncing ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />}
            Sync Outages
          </Button>
        </div>
      </div>

      {/* Status Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className={hasOutages ? "border-red-200 bg-red-50" : "border-green-200 bg-green-50"}>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2">
              {hasOutages
                ? <AlertTriangle className="w-5 h-5 text-red-500" />
                : <CheckCircle2 className="w-5 h-5 text-green-500" />
              }
              <div>
                <p className="text-2xl font-bold">{outages.length}</p>
                <p className="text-xs text-muted-foreground">Active Outages</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-red-500" />
              <div>
                <p className="text-2xl font-bold">{networkEvents.length}</p>
                <p className="text-xs text-muted-foreground">Network Events</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2">
              <Wifi className="w-5 h-5 text-orange-500" />
              <div>
                <p className="text-2xl font-bold">{currentNbn.length}</p>
                <p className="text-xs text-muted-foreground">NBN Outages</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">{scheduled.length}</p>
                <p className="text-xs text-muted-foreground">Scheduled Maintenance</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Outage List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin mr-2" />
          Loading outage data...
        </div>
      ) : !hasOutages ? (
        <Card>
          <CardContent className="py-16 text-center">
            <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-green-700">All Clear</h3>
            <p className="text-muted-foreground text-sm mt-1">
              No active outages detected across ABB services.
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              Click "Sync Outages" to manually check for new outages, or wait for the next automatic poll (every 15 minutes).
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {networkEvents.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-red-700 uppercase tracking-wide mb-3 flex items-center gap-2">
                <Zap className="w-4 h-4" /> Network Events ({networkEvents.length})
              </h2>
              <div className="space-y-3">
                {networkEvents.map((o) => <OutageCard key={o.id} outage={o} />)}
              </div>
            </div>
          )}

          {currentNbn.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-orange-700 uppercase tracking-wide mb-3 flex items-center gap-2">
                <Wifi className="w-4 h-4" /> Current NBN Outages ({currentNbn.length})
              </h2>
              <div className="space-y-3">
                {currentNbn.map((o) => <OutageCard key={o.id} outage={o} />)}
              </div>
            </div>
          )}

          {scheduled.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-blue-700 uppercase tracking-wide mb-3 flex items-center gap-2">
                <Calendar className="w-4 h-4" /> Scheduled Maintenance ({scheduled.length})
              </h2>
              <div className="space-y-3">
                {scheduled.map((o) => <OutageCard key={o.id} outage={o} />)}
              </div>
            </div>
          )}

          {other.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-amber-700 uppercase tracking-wide mb-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" /> Other Outages ({other.length})
              </h2>
              <div className="space-y-3">
                {other.map((o) => <OutageCard key={o.id} outage={o} />)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Info footer */}
      <div className="text-xs text-muted-foreground border-t pt-4 space-y-1">
        <p className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          Outage polling runs every 15 minutes automatically. Usage data syncs nightly at 2am.
        </p>
        <p className="flex items-center gap-1">
          <TrendingUp className="w-3 h-3" />
          Usage snapshots are stored per billing period and available on each service's detail page.
        </p>
      </div>
    </div>
  );
}
