/**
 * Vocus Wholesale Portal — Dashboard
 * Displays all Mobile SIM and NBN services extracted from the Vocus Wholesale Portal.
 * Acts as source-of-truth for service/customer matching and billing reconciliation.
 */

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Signal,
  Smartphone,
  Wifi,
  AlertTriangle,
  CheckCircle2,
  Search,
  RefreshCw,
  Database,
  TrendingUp,
  Link2,
  Unlink,
  Bell,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Status Badge helpers
// ─────────────────────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <Badge variant="outline">Unknown</Badge>;
  const isActive = status.toLowerCase() === "active";
  return (
    <Badge
      variant={isActive ? "default" : "secondary"}
      className={isActive ? "bg-green-600 text-white" : "bg-zinc-500 text-white opacity-70"}
    >
      {isActive ? "Active" : "Inactive"}
    </Badge>
  );
}

function MatchBadge({ matchType }: { matchType: string | null }) {
  if (!matchType) return <Badge variant="outline" className="text-amber-600 border-amber-400">Unmatched</Badge>;
  const colors: Record<string, string> = {
    manual: "bg-blue-600 text-white",
    avc: "bg-purple-600 text-white",
    msn: "bg-purple-600 text-white",
    sim: "bg-indigo-600 text-white",
    address: "bg-teal-600 text-white",
    username: "bg-teal-600 text-white",
  };
  return (
    <Badge className={colors[matchType] ?? "bg-zinc-600 text-white"}>
      {matchType}
    </Badge>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Quota Bar
// ─────────────────────────────────────────────────────────────────────────────
function QuotaBar({ usedGb, quotaGb, isOverQuota }: { usedGb: number; quotaGb: number; isOverQuota: boolean }) {
  const pct = Math.min((usedGb / quotaGb) * 100, 100);
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{usedGb.toFixed(1)} GB used</span>
        <span>{quotaGb} GB quota</span>
      </div>
      <div className="h-2 rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${isOverQuota ? "bg-red-500" : pct > 80 ? "bg-amber-500" : "bg-green-500"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {isOverQuota && (
        <p className="text-xs text-red-500 font-medium">
          Over quota by {(usedGb - quotaGb).toFixed(1)} GB
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────
export default function VocusDashboard() {
  const [tab, setTab] = useState("nbn");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"active" | "inactive" | "all">("active");

  // Data queries
  const summaryQ = trpc.vocus.getSummary.useQuery();
  const nbnQ = trpc.vocus.listNbn.useQuery({
    serviceStatus: statusFilter,
    search: search || undefined,
    limit: 300,
  });
  const mobileQ = trpc.vocus.listMobile.useQuery({
    serviceStatus: statusFilter,
    search: search || undefined,
    limit: 300,
  });
  const bucketsQ = trpc.vocus.listBuckets.useQuery();
  const checkAlerts = trpc.vocus.checkQuotaAlerts.useMutation();

  const summary = summaryQ.data;

  // ─── Summary Cards ───────────────────────────────────────────────────────
  const summaryCards = [
    {
      label: "Active NBN Services",
      value: summary?.nbn.active ?? "—",
      sub: `${summary?.nbn.inactive ?? 0} inactive`,
      icon: Wifi,
      color: "text-blue-500",
      alert: (summary?.nbn.unmatched ?? 0) > 0,
      alertText: `${summary?.nbn.unmatched} unmatched`,
    },
    {
      label: "Active Mobile SIMs",
      value: summary?.mobile.active ?? "—",
      sub: `${summary?.mobile.standardPostpaid ?? 0} std + ${summary?.mobile.dataHosted ?? 0} 4G backup`,
      icon: Smartphone,
      color: "text-purple-500",
      alert: (summary?.mobile.unmatched ?? 0) > 0,
      alertText: `${summary?.mobile.unmatched} unmatched`,
    },
    {
      label: "Data Buckets",
      value: summary?.overQuotaCount ?? 0,
      sub: "over quota",
      icon: TrendingUp,
      color: summary?.overQuotaCount ? "text-red-500" : "text-green-500",
      alert: (summary?.overQuotaCount ?? 0) > 0,
      alertText: "Action required",
    },
    {
      label: "Total Services",
      value: (summary?.nbn.total ?? 0) + (summary?.mobile.total ?? 0),
      sub: "NBN + Mobile (all statuses)",
      icon: Database,
      color: "text-zinc-400",
      alert: false,
      alertText: "",
    },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Signal className="h-6 w-6 text-orange-500" />
            Vocus Wholesale Portal
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Source of truth — {summary?.lastSyncedAt
              ? `Last synced ${new Date(summary.lastSyncedAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}`
              : "Data loaded from portal extraction"}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { summaryQ.refetch(); nbnQ.refetch(); mobileQ.refetch(); }}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {summaryCards.map((card) => (
          <Card key={card.label} className={card.alert ? "border-amber-400/50" : ""}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{card.label}</p>
                  <p className={`text-2xl font-bold mt-1 ${card.color}`}>{card.value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{card.sub}</p>
                </div>
                <card.icon className={`h-5 w-5 ${card.color} mt-1`} />
              </div>
              {card.alert && (
                <div className="mt-2 flex items-center gap-1 text-xs text-amber-600">
                  <AlertTriangle className="h-3 w-3" />
                  {card.alertText}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Bucket Quota Alert Banner */}
      {bucketsQ.data && bucketsQ.data.some(b => b.isOverQuota) && (
        <div className="rounded-lg border border-red-400/50 bg-red-500/10 p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            <span className="font-semibold text-red-500">Mobile Data Bucket Over Quota</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {bucketsQ.data.map(bucket => (
              <div key={bucket.bucketId} className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    {bucket.bucketType === "DATA-HOSTED" ? "4G Backup Bucket" : "Standard Mobile Bucket"}
                  </span>
                  <span className="text-xs text-muted-foreground">{bucket.realm}</span>
                </div>
                <QuotaBar
                  usedGb={bucket.dataUsedMb ? Number(bucket.dataUsedMb) / 1024 : 0}
                  quotaGb={bucket.dataQuotaMb ? bucket.dataQuotaMb / 1024 : 100}
                  isOverQuota={bucket.isOverQuota ?? false}
                />
                <p className="text-xs text-muted-foreground">{bucket.simCount} SIMs · Snapshot: {bucket.snapshotDate}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            A +200 GB quota increase has been submitted for the Standard Mobile bucket. Log into the Vocus portal to confirm and action the 4G Backup bucket.
          </p>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, address, AVC, MSN, SIM..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-1">
          {(["active", "inactive", "all"] as const).map(s => (
            <Button
              key={s}
              variant={statusFilter === s ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter(s)}
              className={statusFilter === s ? "bg-orange-500 hover:bg-orange-600 text-white" : ""}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </Button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="nbn" className="gap-2">
            <Wifi className="h-4 w-4" />
            NBN Services
            <Badge variant="secondary" className="ml-1">{nbnQ.data?.length ?? "…"}</Badge>
          </TabsTrigger>
          <TabsTrigger value="mobile" className="gap-2">
            <Smartphone className="h-4 w-4" />
            Mobile SIMs
            <Badge variant="secondary" className="ml-1">{mobileQ.data?.length ?? "…"}</Badge>
          </TabsTrigger>
          <TabsTrigger value="buckets" className="gap-2">
            <Database className="h-4 w-4" />
            Buckets
            {bucketsQ.data?.some(b => b.isOverQuota) && (
              <span className="ml-1 h-2 w-2 rounded-full bg-red-500 inline-block" />
            )}
          </TabsTrigger>
          <TabsTrigger value="sync" className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Sync
          </TabsTrigger>
        </TabsList>

        {/* ── NBN Tab ─────────────────────────────────────────────────────── */}
        <TabsContent value="nbn" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">NBN Services — wba.rvcict.com.au</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Status</TableHead>
                      <TableHead>Vocus ID</TableHead>
                      <TableHead>Customer / Reference</TableHead>
                      <TableHead>Address</TableHead>
                      <TableHead>AVC ID</TableHead>
                      <TableHead>Technology</TableHead>
                      <TableHead>Speed Tier</TableHead>
                      <TableHead>IP Address</TableHead>
                      <TableHead>POI</TableHead>
                      <TableHead>Match</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {nbnQ.isLoading ? (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                          Loading NBN services…
                        </TableCell>
                      </TableRow>
                    ) : nbnQ.data?.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                          No NBN services found for the selected filters.
                        </TableCell>
                      </TableRow>
                    ) : nbnQ.data?.map(row => (
                      <TableRow
                        key={row.vocusServiceId}
                        className={row.serviceStatus === "inactive" ? "opacity-50" : ""}
                      >
                        <TableCell><StatusBadge status={row.serviceStatus} /></TableCell>
                        <TableCell className="font-mono text-xs">{row.vocusServiceId}</TableCell>
                        <TableCell className="max-w-[180px] truncate" title={row.username ?? row.customerName ?? ""}>
                          <div className="font-medium text-sm">
                            {row.username
                              ? row.username.split("@")[0].replace(/\d+$/, "").replace(/([a-z])([A-Z])/g, "$1 $2")
                              : row.customerName && row.customerName !== "N/A"
                                ? row.customerName
                                : <span className="text-muted-foreground italic">No reference</span>}
                          </div>
                          {row.username && (
                            <div className="text-xs text-muted-foreground font-mono truncate">{row.username.split("@")[0]}</div>
                          )}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate text-sm" title={row.address ?? ""}>
                          {row.address || "—"}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{row.avcId || "—"}</TableCell>
                        <TableCell className="text-xs">{row.technology || "—"}</TableCell>
                        <TableCell className="text-xs">{row.speedTier || "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{row.ipAddress || "—"}</TableCell>
                        <TableCell className="text-xs max-w-[100px] truncate">{row.poiName || "—"}</TableCell>
                        <TableCell><MatchBadge matchType={row.matchType} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Mobile Tab ──────────────────────────────────────────────────── */}
        <TabsContent value="mobile" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Mobile SIM Services — mobile.smileit.com &amp; data.smileit.com</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Status</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Vocus ID</TableHead>
                      <TableHead>Customer / Reference</TableHead>
                      <TableHead>MSN (Phone)</TableHead>
                      <TableHead>SIM Number</TableHead>
                      <TableHead>SIM Type</TableHead>
                      <TableHead>Plan</TableHead>
                      <TableHead>Match</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mobileQ.isLoading ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                          Loading Mobile SIM services…
                        </TableCell>
                      </TableRow>
                    ) : mobileQ.data?.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                          No Mobile SIM services found for the selected filters.
                        </TableCell>
                      </TableRow>
                    ) : mobileQ.data?.map(row => (
                      <TableRow
                        key={row.vocusServiceId}
                        className={row.serviceStatus === "inactive" ? "opacity-50" : ""}
                      >
                        <TableCell><StatusBadge status={row.serviceStatus} /></TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={row.serviceScope === "DATA-HOSTED"
                              ? "border-blue-400 text-blue-600"
                              : "border-purple-400 text-purple-600"}
                          >
                            {row.serviceScope === "DATA-HOSTED" ? "4G Backup" : "Standard"}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{row.vocusServiceId}</TableCell>
                        <TableCell className="max-w-[160px] truncate font-medium" title={row.customerName ?? ""}>
                          {row.customerName || <span className="text-muted-foreground italic">No reference</span>}
                        </TableCell>
                        <TableCell className="font-mono text-sm">{row.msn || "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{row.sim || "—"}</TableCell>
                        <TableCell className="text-xs">{row.simType || "—"}</TableCell>
                        <TableCell className="text-xs max-w-[140px] truncate" title={row.planId ?? ""}>
                          {row.planId || "—"}
                        </TableCell>
                        <TableCell><MatchBadge matchType={row.matchType} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Buckets Tab ──────────────────────────────────────────────────── */}
        <TabsContent value="buckets" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Mobile Data Bucket Quotas</CardTitle>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => checkAlerts.mutate()}
                  disabled={checkAlerts.isPending}
                  className="gap-2"
                >
                  <Bell className="h-4 w-4" />
                  {checkAlerts.isPending ? "Checking..." : "Check Alerts Now"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Alerts fire automatically at 8am AEST daily. Thresholds: 70% (notice), 90% (warning), 100% (critical).
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              {bucketsQ.isLoading && <p className="text-sm text-muted-foreground">Loading bucket data...</p>}
              {bucketsQ.data?.map(bucket => {
                const usedGb = bucket.dataUsedMb ? Number(bucket.dataUsedMb) / 1024 : 0;
                const quotaGb = bucket.dataQuotaMb ? bucket.dataQuotaMb / 1024 : 100;
                const pct = Math.min((usedGb / quotaGb) * 100, 100);
                const label = bucket.bucketType === "DATA-HOSTED" ? "4G Backup Bucket" : "Standard Mobile Bucket";
                return (
                  <div key={bucket.bucketId} className="space-y-3 p-4 rounded-lg border">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{label}</p>
                        <p className="text-xs text-muted-foreground">{bucket.realm} · {bucket.simCount} SIMs</p>
                      </div>
                      <div className="text-right">
                        <p className={`text-lg font-bold ${bucket.isOverQuota ? 'text-red-500' : pct >= 90 ? 'text-orange-500' : pct >= 70 ? 'text-yellow-500' : 'text-green-500'}`}>
                          {pct.toFixed(1)}%
                        </p>
                        <p className="text-xs text-muted-foreground">{usedGb.toFixed(1)} / {quotaGb.toFixed(0)} GB</p>
                      </div>
                    </div>
                    <QuotaBar usedGb={usedGb} quotaGb={quotaGb} isOverQuota={bucket.isOverQuota ?? false} />
                    <div className="grid grid-cols-3 gap-4 text-xs">
                      <div>
                        <p className="text-muted-foreground">Voice Used</p>
                        <p className="font-medium">{bucket.voiceUsedMin ? Number(bucket.voiceUsedMin).toFixed(0) : 0} / {bucket.voiceQuotaMin ?? 0} min</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">SMS Used</p>
                        <p className="font-medium">{bucket.smsUsed ?? 0} / {bucket.smsQuota ?? 0}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Snapshot</p>
                        <p className="font-medium">{bucket.snapshotDate}</p>
                      </div>
                    </div>
                    {bucket.isOverQuota && (
                      <div className="flex items-center gap-2 text-xs text-red-500 bg-red-500/10 rounded p-2">
                        <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                        Over quota by {bucket.overageDataMb ? (Number(bucket.overageDataMb) / 1024).toFixed(1) : '?'} GB — additional charges may apply
                      </div>
                    )}
                  </div>
                );
              })}
              {checkAlerts.data && (
                <div className="rounded-lg border border-blue-400/50 bg-blue-500/10 p-3 text-sm">
                  <p className="font-medium text-blue-600 dark:text-blue-400 mb-1">Alert Check Complete</p>
                  <p className="text-muted-foreground">
                    Checked {checkAlerts.data.bucketsChecked} buckets · {checkAlerts.data.alertsSent} notification{checkAlerts.data.alertsSent !== 1 ? 's' : ''} sent
                  </p>
                  {checkAlerts.data.alerts.map((a, i) => (
                    <p key={i} className="text-xs text-muted-foreground mt-1">
                      {a.bucketType}: {a.pctUsed.toFixed(1)}% — {a.threshold} — notified: {a.notified ? '✓' : '✗'}
                    </p>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Sync Tab ─────────────────────────────────────────────────────── */}
        <TabsContent value="sync" className="mt-4 space-y-4">
          <SyncPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sync Panel Component
// ─────────────────────────────────────────────────────────────────────────────
function SyncPanel() {
  const [otp, setOtp] = useState("");
  const syncLogQ = trpc.vocus.getSyncLog.useQuery({ limit: 20 });
  const otpStatusQ = trpc.vocus.getSyncOtpStatus.useQuery(undefined, { refetchInterval: 5000 });
  const triggerSync = trpc.vocus.triggerManualSync.useMutation({
    onSuccess: () => syncLogQ.refetch(),
  });
  const submitOtp = trpc.vocus.submitSyncOtp.useMutation({
    onSuccess: () => { setOtp(""); otpStatusQ.refetch(); },
  });

  return (
    <div className="space-y-4">
      {/* Manual Sync Controls */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-orange-500" />
            Vocus Portal Sync
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            The Vocus portal is automatically synced every <strong>Monday at 6:00 AM</strong>.
            You can also trigger a manual sync below. A 2FA code will be required — check the
            email sent to the portal address and enter it in the OTP field that appears.
          </p>
          <div className="flex gap-2 flex-wrap">
            <Button
              onClick={() => triggerSync.mutate({ bucketsOnly: false })}
              disabled={triggerSync.isPending}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${triggerSync.isPending ? 'animate-spin' : ''}`} />
              {triggerSync.isPending ? 'Starting...' : 'Full Sync (Services + Buckets)'}
            </Button>
            <Button
              variant="outline"
              onClick={() => triggerSync.mutate({ bucketsOnly: true })}
              disabled={triggerSync.isPending}
            >
              <Database className="h-4 w-4 mr-2" />
              Buckets Only
            </Button>
          </div>
          {triggerSync.data && (
            <p className={`text-sm ${triggerSync.data.success ? 'text-green-600' : 'text-red-500'}`}>
              {triggerSync.data.message}
            </p>
          )}

          {/* OTP Input — shown when sync is waiting */}
          {otpStatusQ.data?.waitingForOtp && (
            <div className="rounded-lg border border-amber-400/50 bg-amber-500/10 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <span className="font-medium text-amber-600">2FA Verification Required</span>
              </div>
              <p className="text-sm text-muted-foreground">
                The sync is waiting for a verification code. Check the email sent to the Vocus portal
                address and enter the code below.
              </p>
              <div className="flex gap-2">
                <Input
                  placeholder="Enter OTP code..."
                  value={otp}
                  onChange={e => setOtp(e.target.value)}
                  className="max-w-[200px] font-mono"
                  maxLength={10}
                />
                <Button
                  onClick={() => submitOtp.mutate({ otp })}
                  disabled={!otp || submitOtp.isPending}
                  className="bg-amber-500 hover:bg-amber-600 text-white"
                >
                  {submitOtp.isPending ? 'Submitting...' : 'Submit OTP'}
                </Button>
              </div>
              {submitOtp.data && (
                <p className={`text-sm ${submitOtp.data.success ? 'text-green-600' : 'text-red-500'}`}>
                  {submitOtp.data.message}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sync Log */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Database className="h-4 w-4 text-blue-500" />
            Sync History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead>Matched</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {syncLogQ.isLoading ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                ) : syncLogQ.data?.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No sync history yet.</TableCell></TableRow>
                ) : syncLogQ.data?.map(row => (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-xs">{row.id}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{row.syncType}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={
                        row.status === 'completed' ? 'bg-green-600 text-white' :
                        row.status === 'failed' ? 'bg-red-600 text-white' :
                        row.status === 'running' ? 'bg-blue-600 text-white animate-pulse' :
                        'bg-zinc-500 text-white'
                      }>{row.status}</Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {row.startedAt ? new Date(row.startedAt).toLocaleString() : '—'}
                    </TableCell>
                    <TableCell className="text-xs">
                      {row.durationMs ? `${(row.durationMs / 1000).toFixed(1)}s` : '—'}
                    </TableCell>
                    <TableCell className="text-xs">{row.recordsCreated ?? '—'}</TableCell>
                    <TableCell className="text-xs">{row.recordsUpdated ?? '—'}</TableCell>
                    <TableCell className="text-xs">{row.recordsMatched ?? '—'}</TableCell>
                    <TableCell className="text-xs max-w-[200px] truncate text-red-500" title={row.errorMessage ?? ""}>
                      {row.errorMessage || '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
