/**
 * AutoMatch — ABB/Carbon Alias Auto-Matching
 * Fuzzy-matches the carbonAlias field against customer names and
 * lets users preview, approve/reject, and commit bulk reassignments.
 */
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Zap,
  CheckCircle2,
  XCircle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  ArrowRightLeft,
  Filter,
  Download,
  CheckSquare,
  Square,
  AlertTriangle,
  Info,
  Loader2,
  BadgeCheck,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { exportToCSV } from "@/lib/exportCsv";

type Candidate = {
  serviceExternalId: string;
  serviceType: string;
  provider: string;
  carbonAlias: string;
  currentCustomerExternalId: string | null;
  currentCustomerName: string;
  suggestedCustomerExternalId: string;
  suggestedCustomerName: string;
  confidence: number;
  tier: string;
  isReassignment: boolean;
};

const TIER_COLORS: Record<string, string> = {
  exact: "bg-emerald-100 text-emerald-800 border-emerald-200",
  contains: "bg-blue-100 text-blue-800 border-blue-200",
  "token-high": "bg-cyan-100 text-cyan-800 border-cyan-200",
  "token-medium": "bg-amber-100 text-amber-800 border-amber-200",
  "fuzzy-high": "bg-violet-100 text-violet-800 border-violet-200",
  "fuzzy-medium": "bg-orange-100 text-orange-800 border-orange-200",
};

const TIER_LABELS: Record<string, string> = {
  exact: "Exact",
  contains: "Contains",
  "token-high": "Token High",
  "token-medium": "Token Medium",
  "fuzzy-high": "Fuzzy High",
  "fuzzy-medium": "Fuzzy Medium",
};

function ConfidenceBar({ score }: { score: number }) {
  const color = score >= 90 ? "bg-emerald-500" : score >= 75 ? "bg-blue-500" : score >= 60 ? "bg-amber-500" : "bg-red-400";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs font-mono font-semibold w-8 text-right">{score}%</span>
    </div>
  );
}

export default function AutoMatch() {
  const [minConfidence, setMinConfidence] = useState(60);
  const [filterTier, setFilterTier] = useState("all");
  const [filterType, setFilterType] = useState("all"); // all | new | reassign
  const [approved, setApproved] = useState<Set<string>>(new Set());
  const [rejected, setRejected] = useState<Set<string>>(new Set());
  const [committed, setCommitted] = useState(false);
  const [commitResult, setCommitResult] = useState<{ applied: number; errors: string[] } | null>(null);

  const utils = trpc.useUtils();

  const { data, isLoading, refetch, isFetching } = trpc.billing.autoMatch.preview.useQuery(
    { minConfidence },
    { staleTime: 30_000 }
  );

  const commitMutation = trpc.billing.autoMatch.commit.useMutation({
    onSuccess: (result) => {
      setCommitResult(result);
      setCommitted(true);
      toast.success(`Applied ${result.applied} matches successfully`);
      if (result.errors.length > 0) {
        toast.error(`${result.errors.length} errors occurred`);
      }
      // Invalidate the preview query so the next run fetches fresh candidates
      utils.billing.autoMatch.preview.invalidate();
      utils.billing.customers.list.invalidate();
      utils.billing.services.list.invalidate();
      utils.billing.unmatched.list.invalidate();
      utils.billing.summary.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const candidates: Candidate[] = data?.candidates || [];
  const stats = data?.stats;

  // Apply filters
  const filtered = useMemo(() => {
    return candidates.filter(c => {
      if (rejected.has(c.serviceExternalId)) return false;
      if (filterTier !== "all" && c.tier !== filterTier) return false;
      if (filterType === "new" && c.isReassignment) return false;
      if (filterType === "reassign" && !c.isReassignment) return false;
      return true;
    });
  }, [candidates, rejected, filterTier, filterType]);

  const allApproved = filtered.length > 0 && filtered.every(c => approved.has(c.serviceExternalId));

  const toggleApprove = (id: string) => {
    setApproved(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    setRejected(prev => { const next = new Set(prev); next.delete(id); return next; });
  };

  const toggleReject = (id: string) => {
    setRejected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    setApproved(prev => { const next = new Set(prev); next.delete(id); return next; });
  };

  const approveAll = () => {
    setApproved(new Set(filtered.map(c => c.serviceExternalId)));
    setRejected(new Set());
  };

  const rejectAll = () => {
    setRejected(new Set(filtered.map(c => c.serviceExternalId)));
    setApproved(new Set());
  };

  const approveHighConfidence = () => {
    const high = filtered.filter(c => c.confidence >= 85).map(c => c.serviceExternalId);
    setApproved(new Set(high));
  };

  const handleCommit = () => {
    const toCommit = candidates
      .filter(c => approved.has(c.serviceExternalId))
      .map(c => ({
        serviceExternalId: c.serviceExternalId,
        customerExternalId: c.suggestedCustomerExternalId,
        customerName: c.suggestedCustomerName,
      }));

    if (toCommit.length === 0) {
      toast.error("No matches approved — select at least one to commit");
      return;
    }

    commitMutation.mutate({ approvedMatches: toCommit });
  };

  const handleExport = () => {
    exportToCSV(
      filtered.map(c => ({
        "Service ID": c.serviceExternalId,
        "Service Type": c.serviceType,
        "Provider": c.provider,
        "Carbon Alias": c.carbonAlias,
        "Current Customer": c.currentCustomerName,
        "Suggested Customer": c.suggestedCustomerName,
        "Confidence %": c.confidence,
        "Match Tier": TIER_LABELS[c.tier] || c.tier,
        "Type": c.isReassignment ? "Reassignment" : "New Match",
        "Status": approved.has(c.serviceExternalId) ? "Approved" : rejected.has(c.serviceExternalId) ? "Rejected" : "Pending",
      })),
      "alias-auto-match"
    );
  };

  const approvedCount = candidates.filter(c => approved.has(c.serviceExternalId)).length;

  if (committed && commitResult) {
    return (
      <div className="p-6 lg:p-8 max-w-2xl">
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-8 text-center space-y-4">
          <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
          <h2 className="text-xl font-bold text-emerald-900">Auto-Match Complete</h2>
          <p className="text-emerald-700">
            Successfully applied <span className="font-bold">{commitResult.applied}</span> customer reassignments via Carbon alias matching.
          </p>
          {commitResult.errors.length > 0 && (
            <div className="text-left bg-red-50 border border-red-200 rounded-lg p-4 mt-4">
              <p className="text-sm font-medium text-red-800 mb-2">Errors ({commitResult.errors.length}):</p>
              {commitResult.errors.map((e, i) => (
                <p key={i} className="text-xs text-red-700">{e}</p>
              ))}
            </div>
          )}
          <div className="flex gap-3 justify-center pt-2">
            <Button onClick={() => { setCommitted(false); setApproved(new Set()); setRejected(new Set()); setCommitResult(null); }}>
              <RefreshCw className="w-4 h-4 mr-1.5" />
              Run Again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-primary" />
            Alias Auto-Match
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Fuzzy-matches the Carbon/ABB <span className="font-mono bg-muted px-1 rounded">alias</span> field against customer names to suggest reassignments.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExport} disabled={filtered.length === 0}>
            <Download className="w-3.5 h-3.5 mr-1.5" />
            Export
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { label: "Total Candidates", value: stats.total, icon: <ArrowRightLeft className="w-4 h-4" />, color: "text-primary" },
            { label: "Exact Matches", value: stats.exact, icon: <BadgeCheck className="w-4 h-4" />, color: "text-emerald-600" },
            { label: "High Confidence", value: stats.high, icon: <CheckCircle2 className="w-4 h-4" />, color: "text-blue-600" },
            { label: "Medium Confidence", value: stats.medium, icon: <AlertTriangle className="w-4 h-4" />, color: "text-amber-600" },
          ].map(s => (
            <div key={s.label} className="bg-card border border-border rounded-lg p-4">
              <div className={`flex items-center gap-1.5 ${s.color} mb-1`}>
                {s.icon}
                <span className="text-xs font-medium">{s.label}</span>
              </div>
              <p className="text-2xl font-bold">{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        {/* Confidence threshold */}
        <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-2">
          <Filter className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Min confidence:</span>
          <select
            value={minConfidence}
            onChange={e => setMinConfidence(Number(e.target.value))}
            className="text-xs bg-transparent outline-none font-medium"
          >
            {[50, 60, 70, 75, 80, 85, 90].map(v => (
              <option key={v} value={v}>{v}%</option>
            ))}
          </select>
        </div>

        {/* Tier filter */}
        <select
          value={filterTier}
          onChange={e => setFilterTier(e.target.value)}
          className="text-xs bg-card border border-border rounded-lg px-3 py-2 outline-none"
        >
          <option value="all">All tiers</option>
          {Object.entries(TIER_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>

        {/* Type filter */}
        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          className="text-xs bg-card border border-border rounded-lg px-3 py-2 outline-none"
        >
          <option value="all">All types</option>
          <option value="new">New assignments only</option>
          <option value="reassign">Reassignments only</option>
        </select>

        <div className="flex-1" />

        {/* Bulk actions */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={approveHighConfidence}>
            <BadgeCheck className="w-3.5 h-3.5 mr-1.5 text-emerald-600" />
            Approve ≥85%
          </Button>
          <Button variant="outline" size="sm" onClick={approveAll}>
            <CheckSquare className="w-3.5 h-3.5 mr-1.5" />
            Approve All
          </Button>
          <Button variant="outline" size="sm" onClick={rejectAll}>
            <XCircle className="w-3.5 h-3.5 mr-1.5 text-red-500" />
            Reject All
          </Button>
        </div>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-4 text-sm text-blue-800">
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        <span>
          Review each suggestion below. <strong>Approve</strong> matches you want to apply, <strong>Reject</strong> ones to skip.
          Address-style aliases (NBN: …) are automatically excluded. Changes are logged in the service edit history.
        </span>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-card border border-border rounded-lg p-12 text-center text-muted-foreground">
          <Zap className="w-8 h-8 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No candidates found</p>
          <p className="text-sm mt-1">Try lowering the minimum confidence threshold</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide w-8">
                  <button onClick={() => allApproved ? rejectAll() : approveAll()}>
                    {allApproved ? <CheckSquare className="w-4 h-4 text-primary" /> : <Square className="w-4 h-4" />}
                  </button>
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Service</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Carbon Alias</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Current Customer</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Suggested Customer</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide w-32">Confidence</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide w-24">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map(c => {
                const isApproved = approved.has(c.serviceExternalId);
                const isRejected = rejected.has(c.serviceExternalId);
                return (
                  <tr
                    key={c.serviceExternalId}
                    className={`transition-colors ${
                      isApproved ? "bg-emerald-50/50" : isRejected ? "bg-red-50/30 opacity-50" : "hover:bg-muted/20"
                    }`}
                  >
                    <td className="px-4 py-3">
                      <button onClick={() => toggleApprove(c.serviceExternalId)}>
                        {isApproved
                          ? <CheckSquare className="w-4 h-4 text-emerald-600" />
                          : <Square className="w-4 h-4 text-muted-foreground" />}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-mono text-xs text-muted-foreground">{c.serviceExternalId}</div>
                      <div className="text-xs text-muted-foreground">{c.serviceType}</div>
                      {c.isReassignment && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded mt-0.5">
                          <ArrowRightLeft className="w-2.5 h-2.5" />
                          Reassign
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-sm">{c.carbonAlias}</span>
                    </td>
                    <td className="px-4 py-3">
                      {c.currentCustomerName ? (
                        <span className="text-muted-foreground">{c.currentCustomerName}</span>
                      ) : (
                        <span className="text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">Unmatched</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-emerald-700">{c.suggestedCustomerName}</span>
                      <div className="text-[10px] text-muted-foreground font-mono">{c.suggestedCustomerExternalId}</div>
                    </td>
                    <td className="px-4 py-3">
                      <ConfidenceBar score={c.confidence} />
                      <span className={`inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded border ${TIER_COLORS[c.tier] || "bg-muted"}`}>
                        {TIER_LABELS[c.tier] || c.tier}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => toggleApprove(c.serviceExternalId)}
                          title="Approve"
                          className={`p-1.5 rounded transition-colors ${isApproved ? "bg-emerald-100 text-emerald-700" : "hover:bg-emerald-50 text-muted-foreground hover:text-emerald-600"}`}
                        >
                          <CheckCircle2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => toggleReject(c.serviceExternalId)}
                          title="Reject"
                          className={`p-1.5 rounded transition-colors ${isRejected ? "bg-red-100 text-red-700" : "hover:bg-red-50 text-muted-foreground hover:text-red-600"}`}
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Commit bar */}
      {approvedCount > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-4 bg-card border border-border shadow-xl rounded-full px-6 py-3">
          <span className="text-sm font-medium">
            <span className="text-emerald-600 font-bold">{approvedCount}</span> match{approvedCount !== 1 ? "es" : ""} approved
          </span>
          <Button
            onClick={handleCommit}
            disabled={commitMutation.isPending}
            className="rounded-full"
          >
            {commitMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
            ) : (
              <Zap className="w-4 h-4 mr-1.5" />
            )}
            Apply {approvedCount} Match{approvedCount !== 1 ? "es" : ""}
          </Button>
        </div>
      )}
    </div>
  );
}
