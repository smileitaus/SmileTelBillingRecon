/**
 * Usage Threshold Alerts Page
 *
 * Shows all ABB services that have exceeded a data usage threshold
 * (80%, 90%, or 100% of plan allowance) in the current billing period.
 * Allows manual check trigger and alert acknowledgement.
 */

import { useState, useMemo } from "react";
import {
  AlertTriangle,
  Wifi,
  RefreshCw,
  Loader2,
  CheckCircle2,
  Bell,
  BellOff,
  ChevronRight,
  Filter,
  TrendingUp,
  Calendar,
  Building2,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Link } from "wouter";

function UsageBar({ percent }: { percent: number }) {
  const clamped = Math.min(percent, 100);
  const color =
    clamped >= 100
      ? "bg-red-500"
      : clamped >= 90
      ? "bg-orange-500"
      : clamped >= 80
      ? "bg-amber-500"
      : "bg-emerald-500";

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
      <span
        className={`text-xs font-mono font-semibold w-12 text-right ${
          clamped >= 100
            ? "text-red-600"
            : clamped >= 90
            ? "text-orange-600"
            : "text-amber-600"
        }`}
      >
        {percent.toFixed(1)}%
      </span>
    </div>
  );
}

function ThresholdBadge({ threshold }: { threshold: number }) {
  const config =
    threshold >= 100
      ? { bg: "bg-red-50 border-red-200 text-red-700", label: "100% — Over Limit" }
      : threshold >= 90
      ? { bg: "bg-orange-50 border-orange-200 text-orange-700", label: "90% — Critical" }
      : { bg: "bg-amber-50 border-amber-200 text-amber-700", label: "80% — Warning" };

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full border ${config.bg}`}>
      <AlertTriangle className="w-2.5 h-2.5" />
      {config.label}
    </span>
  );
}

export default function UsageAlerts() {
  const [statusFilter, setStatusFilter] = useState<"active" | "acknowledged" | "all">("active");
  const [billingPeriod] = useState(() => new Date().toISOString().substring(0, 7));
  const [runningCheck, setRunningCheck] = useState(false);

  const utils = trpc.useUtils();

  const { data: alerts, isLoading } = trpc.billing.getUsageThresholdAlerts.useQuery(
    {
      status: statusFilter === "all" ? undefined : statusFilter,
      billingPeriod,
    },
    { refetchInterval: 60_000 }
  );

  const checkMutation = trpc.billing.checkUsageThresholds.useMutation({
    onMutate: () => setRunningCheck(true),
    onSuccess: (result) => {
      setRunningCheck(false);
      toast.success(
        `Check complete: ${result.alertsCreated} new alert${result.alertsCreated !== 1 ? "s" : ""} created, ${result.notificationsSent} notification${result.notificationsSent !== 1 ? "s" : ""} sent`
      );
      utils.billing.getUsageThresholdAlerts.invalidate();
    },
    onError: (err) => {
      setRunningCheck(false);
      toast.error(`Check failed: ${err.message}`);
    },
  });

  const sendTestAlertMutation = trpc.vocus.sendTestAlert.useMutation({
    onSuccess: (result) => {
      toast.success(`Test alert sent to ${result.to}`);
    },
    onError: (err) => toast.error(`Test alert failed: ${err.message}`),
  });

  const acknowledgeMutation = trpc.billing.acknowledgeUsageAlert.useMutation({
    onSuccess: () => {
      toast.success("Alert acknowledged");
      utils.billing.getUsageThresholdAlerts.invalidate();
    },
    onError: (err) => toast.error(`Failed to acknowledge: ${err.message}`),
  });

  // Summary stats
  const stats = useMemo(() => {
    if (!alerts) return { total: 0, critical: 0, warning: 0, overLimit: 0 };
    return {
      total: alerts.length,
      overLimit: alerts.filter((a) => a.thresholdPercent >= 100).length,
      critical: alerts.filter((a) => a.thresholdPercent === 90).length,
      warning: alerts.filter((a) => a.thresholdPercent === 80).length,
    };
  }, [alerts]);

  return (
    <div className="p-6 lg:p-8 max-w-5xl">
      {/* Page Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Usage Threshold Alerts</h1>
          <p className="text-sm text-muted-foreground mt-1">
            ABB services approaching or exceeding their monthly data allowance — billing period {billingPeriod}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => sendTestAlertMutation.mutate()}
            disabled={sendTestAlertMutation.isPending}
            title="Send a test email to notifications@smiletel.com.au"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-card border border-border rounded-md hover:bg-muted transition-colors disabled:opacity-50"
          >
            {sendTestAlertMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Bell className="w-4 h-4" />
            )}
            Send Test Alert
          </button>
          <button
            onClick={() => checkMutation.mutate({ triggeredBy: "manual" })}
            disabled={runningCheck}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {runningCheck ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            Run Check Now
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Total Alerts</p>
          <p className="text-2xl font-bold mt-1">{stats.total}</p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-xs text-red-700 uppercase tracking-wider font-semibold">Over Limit</p>
          <p className="text-2xl font-bold text-red-700 mt-1">{stats.overLimit}</p>
        </div>
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
          <p className="text-xs text-orange-700 uppercase tracking-wider font-semibold">Critical (90%+)</p>
          <p className="text-2xl font-bold text-orange-700 mt-1">{stats.critical}</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <p className="text-xs text-amber-700 uppercase tracking-wider font-semibold">Warning (80%+)</p>
          <p className="text-2xl font-bold text-amber-700 mt-1">{stats.warning}</p>
        </div>
      </div>

      {/* Info Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-5 flex items-start gap-3">
        <TrendingUp className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-blue-800">How threshold alerts work</p>
          <p className="text-xs text-blue-700 mt-0.5">
            Usage is synced nightly from the ABB Carbon API. Alerts are created automatically when a service
            crosses 80%, 90%, or 100% of its plan allowance. An owner notification is sent once per threshold
            per billing period. Services with "Unlimited" data plans are excluded.
          </p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 mb-4 bg-muted/50 rounded-lg p-1 w-fit">
        {(["active", "acknowledged", "all"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setStatusFilter(f)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors capitalize ${
              statusFilter === f
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Alert List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : !alerts || alerts.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <BellOff className="w-8 h-8 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">No {statusFilter !== "all" ? statusFilter + " " : ""}alerts for {billingPeriod}</p>
          <p className="text-xs mt-1">
            {statusFilter === "active"
              ? "All services are within their data allowance, or no usage data has been synced yet."
              : "No alerts match the selected filter."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className={`bg-card border rounded-lg p-4 transition-colors ${
                alert.status === "acknowledged"
                  ? "border-border opacity-60"
                  : alert.thresholdPercent >= 100
                  ? "border-red-200"
                  : alert.thresholdPercent >= 90
                  ? "border-orange-200"
                  : "border-amber-200"
              }`}
            >
              <div className="flex items-start gap-3">
                <Wifi className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">
                        {alert.planName || alert.serviceExternalId}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        {alert.customerName && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Building2 className="w-3 h-3" />
                            {alert.customerName}
                          </span>
                        )}
                        {alert.locationAddress && (
                          <span className="text-xs text-muted-foreground truncate max-w-48">
                            {alert.locationAddress}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <ThresholdBadge threshold={alert.thresholdPercent} />
                      {alert.notificationSent === 1 && (
                        <span title="Owner notification sent" className="text-blue-500">
                          <Bell className="w-3.5 h-3.5" />
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Usage bar */}
                  <div className="mb-2">
                    <UsageBar percent={alert.usagePercent} />
                  </div>

                  {/* Usage details */}
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="font-mono">
                      {alert.usedGb.toFixed(1)} GB used
                      {alert.planGb ? ` / ${alert.planGb.toFixed(0)} GB plan` : ""}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      Detected {new Date(alert.createdAt).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
                    </span>
                    {alert.acknowledgedBy && (
                      <span>Ack'd by {alert.acknowledgedBy}</span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  {alert.status === "active" && (
                    <button
                      onClick={() => acknowledgeMutation.mutate({ alertId: alert.id })}
                      disabled={acknowledgeMutation.isPending}
                      title="Acknowledge alert"
                      className="p-1.5 text-muted-foreground hover:text-emerald-600 hover:bg-emerald-50 rounded-md transition-colors"
                    >
                      {acknowledgeMutation.isPending ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}
                  {alert.serviceExternalId && (
                    <Link href={`/services/${alert.serviceExternalId}`}>
                      <button
                        title="View service"
                        className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/5 rounded-md transition-colors"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </Link>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
