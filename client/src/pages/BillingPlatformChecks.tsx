/**
 * Billing Platform Checks — manual action items created when services are reviewed.
 * Users can filter by status/platform/priority and mark items as Actioned, In Progress, or Dismissed.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  ClipboardCheck,
  CheckCircle2,
  Clock,
  XCircle,
  AlertTriangle,
  Filter,
  Download,
  Loader2,
  ChevronDown,
  ChevronUp,
  Plus,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { exportToCSV } from "@/lib/exportCsv";

const PLATFORMS = ["OneBill", "SasBoss", "ECN", "Halo", "DataGate"];
const PRIORITIES = ["critical", "high", "medium", "low"];
const STATUSES = ["open", "in-progress", "actioned", "dismissed"];

const PRIORITY_STYLES: Record<string, string> = {
  critical: "bg-red-100 text-red-800 border-red-200",
  high: "bg-orange-100 text-orange-800 border-orange-200",
  medium: "bg-amber-100 text-amber-800 border-amber-200",
  low: "bg-blue-100 text-blue-800 border-blue-200",
};

const STATUS_STYLES: Record<string, string> = {
  open: "bg-amber-100 text-amber-800 border-amber-200",
  "in-progress": "bg-blue-100 text-blue-800 border-blue-200",
  actioned: "bg-emerald-100 text-emerald-800 border-emerald-200",
  dismissed: "bg-gray-100 text-gray-500 border-gray-200",
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  open: <AlertTriangle className="w-3 h-3" />,
  "in-progress": <Clock className="w-3 h-3" />,
  actioned: <CheckCircle2 className="w-3 h-3" />,
  dismissed: <XCircle className="w-3 h-3" />,
};

function ActionDialog({
  checkId,
  currentStatus,
  onClose,
}: {
  checkId: number;
  currentStatus: string;
  onClose: () => void;
}) {
  const [note, setNote] = useState("");
  const [newStatus, setNewStatus] = useState<"actioned" | "dismissed" | "in-progress">("actioned");
  const utils = trpc.useUtils();

  const actionMutation = trpc.billing.platformChecks.action.useMutation({
    onSuccess: () => {
      toast.success(`Check marked as ${newStatus}`);
      utils.billing.platformChecks.list.invalidate();
      utils.billing.platformChecks.summary.invalidate();
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4">
        <h3 className="text-base font-semibold">Update Check Status</h3>

        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">New Status</label>
          <div className="flex gap-2">
            {(["actioned", "in-progress", "dismissed"] as const).map(s => (
              <button
                key={s}
                onClick={() => setNewStatus(s)}
                className={`flex-1 flex items-center justify-center gap-1.5 text-xs py-2 rounded-md border transition-colors capitalize ${
                  newStatus === s
                    ? s === "actioned" ? "bg-emerald-600 text-white border-emerald-600"
                    : s === "dismissed" ? "bg-gray-500 text-white border-gray-500"
                    : "bg-blue-600 text-white border-blue-600"
                    : "border-border hover:bg-muted"
                }`}
              >
                {STATUS_ICONS[s]}
                {s === "in-progress" ? "In Progress" : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Action Note <span className="text-red-500">*</span>
          </label>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            rows={3}
            placeholder="Describe what action was taken or why this was dismissed..."
            className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md outline-none focus:ring-2 focus:ring-ring resize-none"
          />
        </div>

        <div className="flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            onClick={() => actionMutation.mutate({ id: checkId, actionedNote: note, newStatus })}
            disabled={!note.trim() || actionMutation.isPending}
          >
            {actionMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
            Confirm
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function BillingPlatformChecks() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("open");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [actioningId, setActioningId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data: checks = [], isLoading } = trpc.billing.platformChecks.list.useQuery({
    status: statusFilter,
    platform: platformFilter,
    priority: priorityFilter,
    search,
  });

  const { data: summary } = trpc.billing.platformChecks.summary.useQuery();

  const handleExport = () => {
    exportToCSV(
      checks.map((c: any) => ({
        "ID": c.id,
        "Platform": c.platform,
        "Issue Type": c.issueType,
        "Issue Description": c.issueDescription,
        "Target": c.targetName,
        "Customer": c.customerName,
        "Monthly Amount": c.monthlyAmount,
        "Priority": c.priority,
        "Status": c.status,
        "Created By": c.createdBy,
        "Created At": new Date(c.createdAt).toLocaleString(),
        "Actioned By": c.actionedBy || "",
        "Action Note": c.actionedNote || "",
        "Actioned At": c.actionedAt ? new Date(c.actionedAt).toLocaleString() : "",
      })),
      "billing-platform-checks"
    );
  };

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardCheck className="w-6 h-6 text-primary" />
            Billing Platform Checks
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manual action items flagged during service reviews — ensure billing platform updates are completed.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleExport} disabled={checks.length === 0}>
          <Download className="w-3.5 h-3.5 mr-1.5" />
          Export CSV
        </Button>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
          {[
            { label: "Total", value: summary.total, color: "text-foreground" },
            { label: "Open", value: summary.open, color: "text-amber-600" },
            { label: "In Progress", value: summary.inProgress, color: "text-blue-600" },
            { label: "Actioned", value: summary.actioned, color: "text-emerald-600" },
            { label: "Dismissed", value: summary.dismissed, color: "text-gray-500" },
          ].map(s => (
            <button
              key={s.label}
              onClick={() => setStatusFilter(s.label === "Total" ? "all" : s.label.toLowerCase().replace(" ", "-"))}
              className={`bg-card border rounded-lg p-3 text-left hover:bg-muted/30 transition-colors ${
                (statusFilter === s.label.toLowerCase().replace(" ", "-") || (statusFilter === "all" && s.label === "Total"))
                  ? "border-primary ring-1 ring-primary"
                  : "border-border"
              }`}
            >
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
            </button>
          ))}
        </div>
      )}

      {/* Platform breakdown */}
      {summary && Object.keys(summary.byPlatform).length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {Object.entries(summary.byPlatform).map(([platform, data]: [string, any]) => (
            <button
              key={platform}
              onClick={() => setPlatformFilter(platformFilter === platform ? "all" : platform)}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-colors ${
                platformFilter === platform
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border hover:bg-muted"
              }`}
            >
              {platform}
              <span className={`font-bold ${data.open > 0 ? "text-amber-500" : ""}`}>{data.open}/{data.total}</span>
            </button>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by target, customer, platform..."
            className="w-full pl-10 pr-4 py-2 text-sm bg-card border border-border rounded-lg outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <select
          value={priorityFilter}
          onChange={e => setPriorityFilter(e.target.value)}
          className="text-sm bg-card border border-border rounded-lg px-3 py-2 outline-none"
        >
          <option value="all">All priorities</option>
          {PRIORITIES.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
        </select>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : checks.length === 0 ? (
        <div className="bg-card border border-border rounded-lg p-12 text-center text-muted-foreground">
          <ClipboardCheck className="w-8 h-8 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No checks found</p>
          <p className="text-sm mt-1">Checks are created automatically when services are reviewed</p>
        </div>
      ) : (
        <div className="space-y-2">
          {checks.map((check: any) => {
            const isExpanded = expandedId === check.id;
            return (
              <div
                key={check.id}
                className={`bg-card border rounded-lg overflow-hidden transition-all ${
                  check.status === "actioned" ? "border-emerald-200 opacity-75" :
                  check.status === "dismissed" ? "border-gray-200 opacity-60" :
                  check.priority === "critical" ? "border-red-200" :
                  check.priority === "high" ? "border-orange-200" :
                  "border-border"
                }`}
              >
                <div className="flex items-center gap-3 px-4 py-3">
                  {/* Priority indicator */}
                  <div className={`w-1 self-stretch rounded-full ${
                    check.priority === "critical" ? "bg-red-500" :
                    check.priority === "high" ? "bg-orange-500" :
                    check.priority === "medium" ? "bg-amber-500" :
                    "bg-blue-400"
                  }`} />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{check.targetName}</span>
                      <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border ${PRIORITY_STYLES[check.priority]}`}>
                        {check.priority}
                      </span>
                      <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border ${STATUS_STYLES[check.status]}`}>
                        {STATUS_ICONS[check.status]}
                        {check.status === "in-progress" ? "In Progress" : check.status.charAt(0).toUpperCase() + check.status.slice(1)}
                      </span>
                      <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{check.platform}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-xs text-muted-foreground">{check.customerName}</span>
                      <span className="text-xs text-muted-foreground">·</span>
                      <span className="text-xs text-muted-foreground">{check.issueType}</span>
                      {check.monthlyAmount > 0 && (
                        <>
                          <span className="text-xs text-muted-foreground">·</span>
                          <span className="text-xs font-mono">${check.monthlyAmount.toFixed(2)}/mo</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {check.status === "open" || check.status === "in-progress" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setActioningId(check.id)}
                        className="text-xs h-7"
                      >
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        Action
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {check.actionedBy && `by ${check.actionedBy}`}
                      </span>
                    )}
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : check.id)}
                      className="p-1 text-muted-foreground hover:text-foreground"
                    >
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-border px-4 py-3 bg-muted/20 space-y-2 text-sm">
                    {check.issueDescription && (
                      <p className="text-muted-foreground">{check.issueDescription}</p>
                    )}
                    <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                      <span>Created by <span className="font-medium text-foreground">{check.createdBy}</span></span>
                      <span>{new Date(check.createdAt).toLocaleString()}</span>
                      {check.targetId && <span className="font-mono">{check.targetId}</span>}
                    </div>
                    {check.actionedNote && (
                      <div className="bg-emerald-50 border border-emerald-200 rounded p-2 mt-2">
                        <p className="text-xs font-medium text-emerald-800 mb-0.5">Action taken:</p>
                        <p className="text-xs text-emerald-700">{check.actionedNote}</p>
                        {check.actionedBy && (
                          <p className="text-[10px] text-emerald-600 mt-1">
                            — {check.actionedBy}, {check.actionedAt ? new Date(check.actionedAt).toLocaleString() : ""}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Action dialog */}
      {actioningId !== null && (
        <ActionDialog
          checkId={actioningId}
          currentStatus={checks.find((c: any) => c.id === actioningId)?.status || "open"}
          onClose={() => setActioningId(null)}
        />
      )}
    </div>
  );
}
