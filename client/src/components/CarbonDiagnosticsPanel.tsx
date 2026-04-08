/**
 * Carbon Remote Diagnostics Panel
 * Shown on ABB service detail pages when carbonServiceId is present.
 *
 * Implements the correct two-stage pre-flight pattern:
 *   1. GET /tests/availability — system-wide check (204 = available)
 *   2. GET /tests/{service}/available — per-service list of supported tests
 *
 * Only tests returned by the per-service endpoint are shown.
 * Tests not in the list are never offered, preventing 400 errors.
 *
 * Structured output display based on Carbon API documentation:
 *   - Line State: DSL mode, sync rates, attenuation, noise margin, distance
 *   - NTD Status: uptime, link state, flaps
 *   - UNI-D Status: port, MAC, operational/link/config state
 *   - DPU Status: operational state
 *   - DPU Port Status: sync state, operational state, power, line rate
 *   - All others: result string + status only
 */
import { useState } from "react";
import {
  Zap,
  RefreshCw,
  Activity,
  Settings2,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  Terminal,
  AlertTriangle,
  WifiOff,
  Play,
  ArrowDown,
  ArrowUp,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
type ProfileName = "FAST" | "STABLE" | "INTERLEAVED" | "DEFAULT";
interface DiagnosticRun {
  id: number;
  diagnosticType: string;
  profileName: string | null;
  status: "queued" | "running" | "completed" | "failed";
  resultSummary: string | null;
  resultJson: string | null;
  errorMessage: string | null;
  triggeredBy: string;
  startedAt: Date | string;
  completedAt: Date | string | null;
  durationMs: number | null;
}
interface AvailableTest {
  name: string;
  summary: string;
  description: string;
  link: string;
}
const PROFILE_DESCRIPTIONS: Record<ProfileName, string> = {
  FAST: "Maximum speed, minimal error correction. Best for stable line conditions.",
  STABLE: "Balanced speed and stability. Recommended for most services.",
  INTERLEAVED: "Maximum error correction. Best for noisy lines or long distances.",
  DEFAULT: "Restore ABB default profile for this service.",
};
function getTestIcon(testName: string) {
  switch (testName) {
    case "Port Reset": return RefreshCw;
    case "Loopback": return Activity;
    case "Line State": return Activity;
    case "Stability Profile": return Settings2;
    case "Check Connection": return CheckCircle2;
    case "NTD Status": return Terminal;
    case "UNI-D Status": return Terminal;
    case "DPU Status": return Terminal;
    case "DPU Port Status": return Terminal;
    case "DPU Port Reset": return RefreshCw;
    case "NCD Port Reset": return RefreshCw;
    case "NCD Reset": return RefreshCw;
    default: return Play;
  }
}

// ─── Structured Output Renderers ─────────────────────────────────────────────

function OutputRow({ label, value, unit }: { label: string; value: React.ReactNode; unit?: string }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex items-center justify-between py-1 border-b border-border/30 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-medium text-foreground">
        {value}{unit ? <span className="text-muted-foreground ml-0.5">{unit}</span> : null}
      </span>
    </div>
  );
}

function DirectionalRow({ label, downstream, upstream, unit }: { label: string; downstream: number | null; upstream: number | null; unit?: string }) {
  if (downstream === null && upstream === null) return null;
  return (
    <div className="flex items-center justify-between py-1 border-b border-border/30 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-3">
        {downstream !== null && (
          <span className="flex items-center gap-0.5 text-xs font-medium text-foreground">
            <ArrowDown className="w-3 h-3 text-blue-500" />
            {downstream}{unit ? <span className="text-muted-foreground ml-0.5">{unit}</span> : null}
          </span>
        )}
        {upstream !== null && (
          <span className="flex items-center gap-0.5 text-xs font-medium text-foreground">
            <ArrowUp className="w-3 h-3 text-emerald-500" />
            {upstream}{unit ? <span className="text-muted-foreground ml-0.5">{unit}</span> : null}
          </span>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ value }: { value: string | null }) {
  if (!value) return <span className="text-xs text-muted-foreground">—</span>;
  const lower = value.toLowerCase();
  const isGood = ["up", "active", "insync", "powered", "completed", "passed", "stable", "configured", "enabled"].some(s => lower.includes(s));
  const isBad = ["down", "failed", "error", "fault", "inactive", "outofservice"].some(s => lower.includes(s));
  const color = isGood ? "text-emerald-700 bg-emerald-50 border-emerald-200" : isBad ? "text-red-700 bg-red-50 border-red-200" : "text-amber-700 bg-amber-50 border-amber-200";
  return <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${color}`}>{value}</span>;
}

function LineStateOutput({ output }: { output: Record<string, any> }) {
  const syncRate = output.currentSyncRate || {};
  const attainable = output.attainableRate || {};
  const noiseMargin = output.noiseMarginAverage || {};
  const attenuation = output.attenuationAverage || {};
  const loopAtten = output.loopAttenuationAverage || {};
  return (
    <div className="mt-2 space-y-0">
      <OutputRow label="DSL Mode" value={output.dslMode} />
      <OutputRow label="MAC Address" value={output.macAddress} />
      <div className="flex items-center justify-between py-1 border-b border-border/30">
        <span className="text-xs text-muted-foreground">Operational Status</span>
        <StatusBadge value={output.operationalStatus} />
      </div>
      <div className="flex items-center justify-between py-1 border-b border-border/30">
        <span className="text-xs text-muted-foreground">Service Stability</span>
        <StatusBadge value={output.serviceStability} />
      </div>
      <OutputRow label="Physical Profile" value={output.physicalProfile} />
      <DirectionalRow label="Sync Rate" downstream={syncRate.downstream ?? null} upstream={syncRate.upstream ?? null} unit="kbps" />
      <DirectionalRow label="Attainable Rate" downstream={attainable.downstream ?? null} upstream={attainable.upstream ?? null} unit="kbps" />
      <DirectionalRow label="Noise Margin Avg" downstream={noiseMargin.downstream ?? null} upstream={noiseMargin.upstream ?? null} unit="dB" />
      <DirectionalRow label="Attenuation Avg" downstream={attenuation.downstream ?? null} upstream={attenuation.upstream ?? null} unit="dB" />
      <DirectionalRow label="Loop Attenuation Avg" downstream={loopAtten.downstream ?? null} upstream={loopAtten.upstream ?? null} unit="dB" />
      {output.estimatedDistanceToNodeMeters !== null && output.estimatedDistanceToNodeMeters !== undefined && (
        <OutputRow label="Distance to Node" value={output.estimatedDistanceToNodeMeters} unit="m" />
      )}
    </div>
  );
}

const BRISBANE_TZ = 'Australia/Brisbane';
function formatBrisbane(date: Date | string, opts?: Intl.DateTimeFormatOptions): string {
  return new Date(date).toLocaleString('en-AU', {
    timeZone: BRISBANE_TZ,
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    ...opts,
  });
}

function NtdStatusOutput({ output }: { output: Record<string, any> }) {
  const uptimeSecs = output.uptime;
  let uptimeStr: string | null = null;
  if (uptimeSecs !== null && uptimeSecs !== undefined) {
    const d = Math.floor(uptimeSecs / 86400);
    const h = Math.floor((uptimeSecs % 86400) / 3600);
    const m = Math.floor((uptimeSecs % 3600) / 60);
    uptimeStr = d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m` : `${m}m`;
  }
  // Calculate flap rate context: flaps per day based on uptime
  let flapContext: string | null = null;
  if (output.totalFlaps !== null && output.totalFlaps !== undefined && uptimeSecs) {
    const days = uptimeSecs / 86400;
    if (days > 0) {
      const rate = (output.totalFlaps / days).toFixed(1);
      flapContext = `${output.totalFlaps} flap${output.totalFlaps !== 1 ? 's' : ''} over ${days >= 1 ? `${Math.floor(days)}d ${Math.floor((uptimeSecs % 86400) / 3600)}h` : `${Math.floor(uptimeSecs / 3600)}h`} (${rate}/day)`;
    }
  }
  return (
    <div className="mt-2 space-y-0">
      <OutputRow label="Uptime" value={uptimeStr} />
      <div className="flex items-center justify-between py-1 border-b border-border/30">
        <span className="text-xs text-muted-foreground">Link State</span>
        <StatusBadge value={output.linkState} />
      </div>
      <OutputRow label="Total Flaps" value={flapContext ?? (output.totalFlaps !== null && output.totalFlaps !== undefined ? String(output.totalFlaps) : null)} />
      {output.lastFlapAt && (
        <OutputRow label="Last Flap" value={formatBrisbane(output.lastFlapAt)} />
      )}
    </div>
  );
}

function UnidStatusOutput({ output }: { output: Record<string, any> }) {
  return (
    <div className="mt-2 space-y-0">
      <OutputRow label="Port Number" value={output.portNumber !== null && output.portNumber !== undefined ? String(output.portNumber) : null} />
      <OutputRow label="MAC Address" value={output.macAddress} />
      <div className="flex items-center justify-between py-1 border-b border-border/30">
        <span className="text-xs text-muted-foreground">Operational State</span>
        <StatusBadge value={output.operationalState} />
      </div>
      <div className="flex items-center justify-between py-1 border-b border-border/30">
        <span className="text-xs text-muted-foreground">Link State</span>
        <StatusBadge value={output.linkState} />
      </div>
      <div className="flex items-center justify-between py-1 border-b border-border/30">
        <span className="text-xs text-muted-foreground">Config Status</span>
        <StatusBadge value={output.configStatus} />
      </div>
      <div className="flex items-center justify-between py-1 border-b border-border/30 last:border-0">
        <span className="text-xs text-muted-foreground">State</span>
        <StatusBadge value={output.state} />
      </div>
    </div>
  );
}

function DpuStatusOutput({ output }: { output: Record<string, any> }) {
  return (
    <div className="mt-2 space-y-0">
      <div className="flex items-center justify-between py-1">
        <span className="text-xs text-muted-foreground">Operational State</span>
        <StatusBadge value={output.operationalState} />
      </div>
    </div>
  );
}

function DpuPortStatusOutput({ output }: { output: Record<string, any> }) {
  return (
    <div className="mt-2 space-y-0">
      <div className="flex items-center justify-between py-1 border-b border-border/30">
        <span className="text-xs text-muted-foreground">Sync State</span>
        <StatusBadge value={output.syncState} />
      </div>
      <div className="flex items-center justify-between py-1 border-b border-border/30">
        <span className="text-xs text-muted-foreground">Operational State</span>
        <StatusBadge value={output.operationalState} />
      </div>
      <div className="flex items-center justify-between py-1 border-b border-border/30">
        <span className="text-xs text-muted-foreground">Reverse Power</span>
        <StatusBadge value={output.reversePowerState} />
      </div>
      <OutputRow label="Access Line Rate" value={output.accessLineRate} />
    </div>
  );
}

function StructuredOutput({ diagnosticType, resultJson }: { diagnosticType: string; resultJson: string | null }) {
  if (!resultJson) return null;
  let parsed: Record<string, any> = {};
  try { parsed = JSON.parse(resultJson); } catch { return null; }
  const output = parsed.output as Record<string, any> | undefined;
  // Tests with no output object — only show result string if present
  const noOutputTests = ["port_reset", "loopback_test", "stability_profile", "dpu_port_reset", "ncd_port_reset", "ncd_reset", "check_connection", "service_health_summary"];
  if (noOutputTests.includes(diagnosticType)) {
    if (parsed.result) {
      return (
        <div className="mt-2 text-xs text-foreground/80 leading-relaxed bg-muted/30 rounded p-2">
          {parsed.result}
        </div>
      );
    }
    return null;
  }
  if (!output || Object.keys(output).length === 0) {
    return (
      <div className="mt-2 text-xs text-muted-foreground italic">
        No output data returned for this test.
      </div>
    );
  }
  return (
    <div className="mt-2 bg-muted/20 rounded-md p-2 border border-border/40">
      {diagnosticType === "line_state" && <LineStateOutput output={output} />}
      {diagnosticType === "ntd_status" && <NtdStatusOutput output={output} />}
      {diagnosticType === "unid_status" && <UnidStatusOutput output={output} />}
      {diagnosticType === "dpu_status" && <DpuStatusOutput output={output} />}
      {diagnosticType === "dpu_port_status" && <DpuPortStatusOutput output={output} />}
      {/* Fallback: render all output keys as key-value pairs */}
      {!["line_state","ntd_status","unid_status","dpu_status","dpu_port_status"].includes(diagnosticType) && (
        Object.entries(output).map(([k, v]) => (
          <OutputRow key={k} label={k.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase())} value={v !== null && v !== undefined ? String(v) : null} />
        ))
      )}
    </div>
  );
}

// ─── Diagnostic Run Card ──────────────────────────────────────────────────────

function DiagnosticRunCard({ run }: { run: DiagnosticRun }) {
  const [expanded, setExpanded] = useState(false);
  const statusConfig = {
    queued: { icon: Clock, color: "text-amber-600", bg: "bg-amber-50 border-amber-200", label: "Queued" },
    running: { icon: Loader2, color: "text-blue-600", bg: "bg-blue-50 border-blue-200", label: "Running" },
    completed: { icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200", label: "Completed" },
    failed: { icon: XCircle, color: "text-red-600", bg: "bg-red-50 border-red-200", label: "Failed" },
  };
  const cfg = statusConfig[run.status] || statusConfig.queued;
  const StatusIcon = cfg.icon;
  const startedAt = new Date(run.startedAt);
  const typeLabel = run.diagnosticType
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c: string) => c.toUpperCase());
  const hasDetails = !!(run.resultSummary || run.errorMessage || run.resultJson);
  return (
    <div className={`border rounded-lg p-3 ${cfg.bg}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <StatusIcon className={`w-4 h-4 shrink-0 ${cfg.color}${run.status === "running" ? " animate-spin" : ""}`} />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-foreground">{typeLabel}</p>
            <p className="text-[10px] text-muted-foreground">
              {formatBrisbane(startedAt)}
              {run.durationMs ? ` · ${(run.durationMs / 1000).toFixed(1)}s` : ""}
              {" · "}{run.triggeredBy}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${cfg.bg} ${cfg.color}`}>
            {cfg.label}
          </span>
          {hasDetails && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </div>
      {expanded && (
        <div className="mt-2 pt-2 border-t border-current/10">
          {run.resultSummary && (
            <p className="text-xs text-foreground/80 leading-relaxed">{run.resultSummary}</p>
          )}
          <StructuredOutput diagnosticType={run.diagnosticType} resultJson={run.resultJson} />
          {run.errorMessage && (
            <p className="text-xs text-red-700 font-mono bg-red-50 rounded p-2 mt-1 break-all">
              {run.errorMessage}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
interface CarbonDiagnosticsPanelProps {
  serviceExternalId: string;
  carbonServiceId: string;
  customerExternalId?: string | null;
}
export default function CarbonDiagnosticsPanel({
  serviceExternalId,
  carbonServiceId,
  customerExternalId,
}: CarbonDiagnosticsPanelProps) {
  const [runningTest, setRunningTest] = useState<string | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<ProfileName>("STABLE");
  const [showHistory, setShowHistory] = useState(false);
  const [historyTab, setHistoryTab] = useState<"local" | "carbon">("local");
  // Stage 1: System availability check
  const { data: sysAvail, isLoading: sysLoading, refetch: refetchAvail } = trpc.billing.checkSystemAvailability.useQuery(undefined, {
    staleTime: 0,       // always re-check on mount
    retry: 2,           // retry up to 2 times on network error
    retryDelay: 2000,
  });
  // Stage 2: Per-service available tests
  const { data: availableTests, isLoading: testsLoading } = trpc.billing.getAvailableTests.useQuery(
    { carbonServiceId },
    {
      enabled: !!carbonServiceId && sysAvail?.available === true,
      staleTime: 120_000,
      retry: false,
    }
  );
  // Diagnostic history (local DB)
  const { data: history, isLoading: historyLoading, refetch: refetchHistory } = trpc.billing.getDiagnosticHistory.useQuery(
    { serviceExternalId },
    { enabled: showHistory && historyTab === "local", staleTime: 30_000 }
  );
  // Carbon API history (GET /tests/{serviceId})
  const { data: carbonHistory, isLoading: carbonHistoryLoading } = trpc.billing.listServiceTests.useQuery(
    { carbonServiceId },
    { enabled: showHistory && historyTab === "carbon" && !!carbonServiceId, staleTime: 60_000 }
  );
  const utils = trpc.useUtils();
  const runTestMutation = trpc.billing.runTest.useMutation({
    onSuccess: () => {
      setRunningTest(null);
      toast.success("Test completed");
      if (showHistory) refetchHistory();
    },
    onError: (err: { message?: string }) => {
      setRunningTest(null);
      toast.error(err.message || "Test failed");
    },
  });
  const handleRunTest = (testName: string, extraBody?: Record<string, unknown>) => {
    if (runningTest) return;
    setRunningTest(testName);
    runTestMutation.mutate({
      serviceExternalId,
      carbonServiceId,
      customerExternalId: customerExternalId ?? undefined,
      testName,
      extraBody,
    });
  };
  const isLoading = sysLoading || testsLoading;
  const hasStabilityProfile = availableTests?.some((t: AvailableTest) => t.name === "Stability Profile");
  const otherTests = availableTests?.filter((t: AvailableTest) => t.name !== "Stability Profile") ?? [];
  return (
    <div className="space-y-3">
      {/* System availability banner */}
      {sysLoading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Checking Carbon API availability...
        </div>
      ) : sysAvail?.available === false ? (
        <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-xs font-semibold text-amber-800">Testing System Unavailable</p>
            <p className="text-xs text-amber-700 mt-0.5">
              The Carbon API testing system is currently offline. Diagnostic tests cannot be run at this time.
            </p>
          </div>
          <button
            onClick={() => refetchAvail()}
            className="flex items-center gap-1 text-xs text-amber-700 hover:text-amber-900 border border-amber-300 rounded px-2 py-1 bg-amber-100 hover:bg-amber-200 transition-colors shrink-0"
          >
            <RefreshCw className="w-3 h-3" />
            Retry
          </button>
        </div>
      ) : null}
      {/* Available tests */}
      {sysAvail?.available === true && (
        <div className="space-y-2">
          {testsLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Loading available tests for this service...
            </div>
          ) : !availableTests || availableTests.length === 0 ? (
            <div className="flex items-start gap-2 p-3 bg-muted/30 border border-border rounded-lg">
              <WifiOff className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">
                No diagnostic tests are available for this service. This may be due to the service technology type or current network state.
              </p>
            </div>
          ) : (
            <>
              {otherTests.map((test: AvailableTest) => {
                const Icon = getTestIcon(test.name);
                const isRunning = runningTest === test.name;
                return (
                  <div
                    key={test.name}
                    className="flex items-start justify-between gap-3 p-3 bg-background border border-border rounded-lg"
                  >
                    <div className="flex items-start gap-2.5">
                      <Icon className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm font-medium">{test.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{test.summary}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleRunTest(test.name)}
                      disabled={runningTest !== null}
                      className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-foreground text-background rounded-md hover:opacity-80 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {isRunning ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Icon className="w-3 h-3" />
                      )}
                      {test.name.includes("Reset") ? "Reset" : "Run Test"}
                    </button>
                  </div>
                );
              })}
              {/* Stability Profile — special UI with profile selector */}
              {hasStabilityProfile && (
                <div className="p-3 bg-background border border-border rounded-lg">
                  <div className="flex items-start gap-2.5 mb-3">
                    <Settings2 className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium">Stability Profile</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Changes the DSL/NBN line profile. Takes effect within 5–10 minutes.
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    {(["FAST", "STABLE", "INTERLEAVED", "DEFAULT"] as ProfileName[]).map((profile) => (
                      <button
                        key={profile}
                        onClick={() => setSelectedProfile(profile)}
                        className={`text-left px-3 py-2 rounded-md border text-xs transition-colors ${
                          selectedProfile === profile
                            ? "bg-foreground text-background border-foreground"
                            : "bg-card border-border text-foreground hover:bg-accent"
                        }`}
                      >
                        <p className="font-semibold">{profile}</p>
                        <p className={`text-[10px] mt-0.5 leading-tight ${selectedProfile === profile ? "opacity-70" : "text-muted-foreground"}`}>
                          {PROFILE_DESCRIPTIONS[profile]}
                        </p>
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => handleRunTest("Stability Profile", { profile: selectedProfile })}
                    disabled={runningTest !== null}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-foreground text-background rounded-md hover:opacity-80 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {runningTest === "Stability Profile" ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Zap className="w-3 h-3" />
                    )}
                    Apply {selectedProfile} Profile
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
      {/* Diagnostic History */}
      <div className="mt-4 pt-3 border-t border-border/50">
        <button
          onClick={() => setShowHistory(!showHistory)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {showHistory ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          {showHistory ? "Hide" : "Show"} Diagnostic History
        </button>
        {showHistory && (
          <div className="mt-3">
            {/* Tab switcher */}
            <div className="flex gap-1 mb-3">
              <button
                onClick={() => setHistoryTab("local")}
                className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                  historyTab === "local"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                This App
              </button>
              <button
                onClick={() => setHistoryTab("carbon")}
                className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                  historyTab === "carbon"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                Carbon API
              </button>
            </div>
            <div className="space-y-2">
              {historyTab === "local" ? (
                historyLoading ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Loading history...
                  </div>
                ) : !history || history.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2 text-center">
                    No diagnostics run from this app yet
                  </p>
                ) : (
                  [...history].reverse().map((run: any) => (
                    <DiagnosticRunCard key={run.id} run={run} />
                  ))
                )
              ) : (
                carbonHistoryLoading ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Loading Carbon API history...
                  </div>
                ) : !carbonHistory || carbonHistory.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2 text-center">
                    No tests found in Carbon API for this service
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {carbonHistory.map((t: any) => (
                      <div key={t.id} className="flex items-center justify-between px-3 py-2 rounded-md bg-muted/40 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-foreground">{t.type}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                            t.result === "Passed" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                            t.result === "Failed" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" :
                            "bg-muted text-muted-foreground"
                          }`}>{t.result || t.status}</span>
                        </div>
                        <span className="text-muted-foreground">
                          {t.completed_at ? formatBrisbane(t.completed_at) : formatBrisbane(t.created_at)}
                        </span>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
