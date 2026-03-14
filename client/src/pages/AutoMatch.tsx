/**
 * AutoMatch — Two-mode auto-matching:
 * 1. Alias Match: ABB/Carbon alias → customer name
 * 2. Address & Name Match: service address / planName → customer address / name
 */
import React, { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Zap,
  CheckCircle2,
  XCircle,
  RefreshCw,
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
  MapPin,
  Tag,
  User,
  UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { exportToCSV } from "@/lib/exportCsv";
import CustomerProposalsTab from "@/components/CustomerProposalsTab";

// ─── Shared types ────────────────────────────────────────────────────────────

type AliasCandidate = {
  serviceExternalId: string;
  serviceType: string;
  provider: string;
  carbonAlias: string;
  aliasSource?: 'carbon_alias' | 'sm_customer_name';
  currentCustomerExternalId: string | null;
  currentCustomerName: string;
  suggestedCustomerExternalId: string;
  suggestedCustomerName: string;
  confidence: number;
  tier: string;
  isReassignment: boolean;
};

type AddressCandidate = {
  serviceExternalId: string;
  serviceId: string;
  serviceType: string;
  provider: string;
  planName: string;
  locationAddress: string;
  matchSource: "address" | "planName" | "customerName";
  matchedText: string;
  currentCustomerExternalId: string | null;
  currentCustomerName: string;
  suggestedCustomerExternalId: string;
  suggestedCustomerName: string;
  suggestedCustomerAddress: string;
  confidence: number;
  tier: string;
  isReassignment: boolean;
};

// ─── Shared helpers ───────────────────────────────────────────────────────────

const TIER_COLORS: Record<string, string> = {
  exact: "bg-emerald-100 text-emerald-800 border-emerald-200",
  high: "bg-blue-100 text-blue-800 border-blue-200",
  contains: "bg-blue-100 text-blue-800 border-blue-200",
  "token-high": "bg-cyan-100 text-cyan-800 border-cyan-200",
  medium: "bg-amber-100 text-amber-800 border-amber-200",
  "token-medium": "bg-amber-100 text-amber-800 border-amber-200",
  "fuzzy-high": "bg-violet-100 text-violet-800 border-violet-200",
  "fuzzy-medium": "bg-orange-100 text-orange-800 border-orange-200",
  low: "bg-red-100 text-red-800 border-red-200",
};

const TIER_LABELS: Record<string, string> = {
  exact: "Exact",
  high: "High",
  contains: "Contains",
  "token-high": "Token High",
  medium: "Medium",
  "token-medium": "Token Medium",
  "fuzzy-high": "Fuzzy High",
  "fuzzy-medium": "Fuzzy Medium",
  low: "Low",
};

function ConfidenceBar({ score }: { score: number }) {
  const color =
    score >= 90
      ? "bg-emerald-500"
      : score >= 75
      ? "bg-blue-500"
      : score >= 60
      ? "bg-amber-500"
      : "bg-red-400";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${color} transition-all`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className="text-xs font-mono font-semibold w-8 text-right">
        {score}%
      </span>
    </div>
  );
}

const MATCH_SOURCE_ICONS: Record<string, React.ReactNode> = {
  address: <MapPin className="w-3 h-3" />,
  planName: <Tag className="w-3 h-3" />,
  customerName: <User className="w-3 h-3" />,
};

const MATCH_SOURCE_LABELS: Record<string, string> = {
  address: "Address",
  planName: "Plan Name",
  customerName: "Customer Name",
};

const MATCH_SOURCE_COLORS: Record<string, string> = {
  address: "bg-blue-100 text-blue-700 border-blue-200",
  planName: "bg-purple-100 text-purple-700 border-purple-200",
  customerName: "bg-teal-100 text-teal-700 border-teal-200",
};

// ─── Alias Match Tab ──────────────────────────────────────────────────────────

function AliasMatchTab() {
  const [minConfidence, setMinConfidence] = useState(60);
  const [filterTier, setFilterTier] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [approved, setApproved] = useState<Set<string>>(new Set());
  const [rejected, setRejected] = useState<Set<string>>(new Set());
  const [committed, setCommitted] = useState(false);
  const [commitResult, setCommitResult] = useState<{
    applied: number;
    errors: string[];
  } | null>(null);

  const utils = trpc.useUtils();

  const { data, isLoading, refetch, isFetching } =
    trpc.billing.autoMatch.preview.useQuery(
      { minConfidence },
      { staleTime: 30_000 }
    );

  const commitMutation = trpc.billing.autoMatch.commit.useMutation({
    onSuccess: (result) => {
      setCommitResult(result);
      setCommitted(true);
      toast.success(`Applied ${result.applied} matches successfully`);
      if (result.errors.length > 0)
        toast.error(`${result.errors.length} errors occurred`);
      utils.billing.autoMatch.preview.invalidate();
      utils.billing.customers.list.invalidate();
      utils.billing.services.list.invalidate();
      utils.billing.unmatched.list.invalidate();
      utils.billing.summary.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const candidates: AliasCandidate[] = data?.candidates || [];
  const stats = data?.stats;

  const filtered = useMemo(() => {
    return candidates.filter((c) => {
      if (rejected.has(c.serviceExternalId)) return false;
      if (filterTier !== "all" && c.tier !== filterTier) return false;
      if (filterType === "new" && c.isReassignment) return false;
      if (filterType === "reassign" && !c.isReassignment) return false;
      return true;
    });
  }, [candidates, rejected, filterTier, filterType]);

  const allApproved =
    filtered.length > 0 &&
    filtered.every((c) => approved.has(c.serviceExternalId));

  const toggleApprove = (id: string) => {
    setApproved((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setRejected((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const toggleReject = (id: string) => {
    setRejected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setApproved((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const approveAll = () => {
    setApproved(new Set(filtered.map((c) => c.serviceExternalId)));
    setRejected(new Set());
  };
  const rejectAll = () => {
    setRejected(new Set(filtered.map((c) => c.serviceExternalId)));
    setApproved(new Set());
  };
  const approveHighConfidence = () => {
    const high = filtered
      .filter((c) => c.confidence >= 85)
      .map((c) => c.serviceExternalId);
    setApproved(new Set(high));
  };

  const handleCommit = () => {
    const toCommit = candidates
      .filter((c) => approved.has(c.serviceExternalId))
      .map((c) => ({
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
      filtered.map((c) => ({
        "Service ID": c.serviceExternalId,
        "Service Type": c.serviceType,
        Provider: c.provider,
        "Carbon Alias": c.carbonAlias,
        "Current Customer": c.currentCustomerName,
        "Suggested Customer": c.suggestedCustomerName,
        "Confidence %": c.confidence,
        "Match Tier": TIER_LABELS[c.tier] || c.tier,
        Type: c.isReassignment ? "Reassignment" : "New Match",
        Status: approved.has(c.serviceExternalId)
          ? "Approved"
          : rejected.has(c.serviceExternalId)
          ? "Rejected"
          : "Pending",
      })),
      "alias-auto-match"
    );
  };

  const approvedCount = candidates.filter((c) =>
    approved.has(c.serviceExternalId)
  ).length;

  if (committed && commitResult) {
    return (
      <div className="max-w-2xl">
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-8 text-center space-y-4">
          <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
          <h2 className="text-xl font-bold text-emerald-900">
            Auto-Match Complete
          </h2>
          <p className="text-emerald-700">
            Successfully applied{" "}
            <span className="font-bold">{commitResult.applied}</span> customer
            reassignments via Carbon alias matching.
          </p>
          {commitResult.errors.length > 0 && (
            <div className="text-left bg-red-50 border border-red-200 rounded-lg p-4 mt-4">
              <p className="text-sm font-medium text-red-800 mb-2">
                Errors ({commitResult.errors.length}):
              </p>
              {commitResult.errors.map((e, i) => (
                <p key={i} className="text-xs text-red-700">
                  {e}
                </p>
              ))}
            </div>
          )}
          <div className="flex gap-3 justify-center pt-2">
            <Button
              onClick={() => {
                setCommitted(false);
                setApproved(new Set());
                setRejected(new Set());
                setCommitResult(null);
              }}
            >
              <RefreshCw className="w-4 h-4 mr-1.5" />
              Run Again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            {
              label: "Total Candidates",
              value: stats.total,
              icon: <ArrowRightLeft className="w-4 h-4" />,
              color: "text-primary",
            },
            {
              label: "Exact Matches",
              value: stats.exact,
              icon: <BadgeCheck className="w-4 h-4" />,
              color: "text-emerald-600",
            },
            {
              label: "High Confidence",
              value: stats.high,
              icon: <CheckCircle2 className="w-4 h-4" />,
              color: "text-blue-600",
            },
            {
              label: "Medium Confidence",
              value: stats.medium,
              icon: <AlertTriangle className="w-4 h-4" />,
              color: "text-amber-600",
            },
          ].map((s) => (
            <div
              key={s.label}
              className="bg-card border border-border rounded-lg p-4"
            >
              <div
                className={`flex items-center gap-1.5 ${s.color} mb-1`}
              >
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
        <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-2">
          <Filter className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            Min confidence:
          </span>
          <select
            value={minConfidence}
            onChange={(e) => setMinConfidence(Number(e.target.value))}
            className="text-xs bg-transparent outline-none font-medium"
          >
            {[50, 60, 70, 75, 80, 85, 90].map((v) => (
              <option key={v} value={v}>
                {v}%
              </option>
            ))}
          </select>
        </div>
        <select
          value={filterTier}
          onChange={(e) => setFilterTier(e.target.value)}
          className="text-xs bg-card border border-border rounded-lg px-3 py-2 outline-none"
        >
          <option value="all">All tiers</option>
          {Object.entries(TIER_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="text-xs bg-card border border-border rounded-lg px-3 py-2 outline-none"
        >
          <option value="all">All types</option>
          <option value="new">New assignments only</option>
          <option value="reassign">Reassignments only</option>
        </select>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={filtered.length === 0}
          >
            <Download className="w-3.5 h-3.5 mr-1.5" />
            Export
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            {isFetching ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            )}
            Refresh
          </Button>
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
          Fuzzy-matches two sources against existing customer names: the Carbon/ABB{" "}
          <span className="font-mono bg-blue-100 px-1 rounded">alias</span>{" "}
          field, and{" "}
          <span className="inline-flex items-center gap-0.5 bg-violet-100 text-violet-700 px-1 rounded text-xs font-medium">SM Name</span>{" "}
          customer names extracted from unmatched service notes. Address-style aliases (NBN: …) are automatically excluded.
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
          <p className="text-sm mt-1">
            Try lowering the minimum confidence threshold
          </p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide w-8">
                  <button
                    onClick={() =>
                      allApproved ? rejectAll() : approveAll()
                    }
                  >
                    {allApproved ? (
                      <CheckSquare className="w-4 h-4 text-primary" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Service
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Carbon Alias
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Current Customer
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Suggested Customer
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide w-32">
                  Confidence
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide w-24">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((c) => {
                const isApproved = approved.has(c.serviceExternalId);
                const isRejected = rejected.has(c.serviceExternalId);
                return (
                  <tr
                    key={c.serviceExternalId}
                    className={`transition-colors ${
                      isApproved
                        ? "bg-emerald-50/50"
                        : isRejected
                        ? "bg-red-50/30 opacity-50"
                        : "hover:bg-muted/20"
                    }`}
                  >
                    <td className="px-4 py-3">
                      <button
                        onClick={() =>
                          toggleApprove(c.serviceExternalId)
                        }
                      >
                        {isApproved ? (
                          <CheckSquare className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <Square className="w-4 h-4 text-muted-foreground" />
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-mono text-xs text-muted-foreground">
                        {c.serviceExternalId}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {c.serviceType}
                      </div>
                      {c.isReassignment && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded mt-0.5">
                          <ArrowRightLeft className="w-2.5 h-2.5" />
                          Reassign
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-sm">
                        {c.carbonAlias}
                      </span>
                      {c.aliasSource === 'sm_customer_name' && (
                        <div className="mt-0.5">
                          <span className="inline-flex items-center gap-0.5 text-[10px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded">
                            SM Name
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {c.currentCustomerName ? (
                        <span className="text-muted-foreground">
                          {c.currentCustomerName}
                        </span>
                      ) : (
                        <span className="text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                          Unmatched
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-emerald-700">
                        {c.suggestedCustomerName}
                      </span>
                      <div className="text-[10px] text-muted-foreground font-mono">
                        {c.suggestedCustomerExternalId}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <ConfidenceBar score={c.confidence} />
                      <span
                        className={`inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded border ${
                          TIER_COLORS[c.tier] || "bg-muted"
                        }`}
                      >
                        {TIER_LABELS[c.tier] || c.tier}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() =>
                            toggleApprove(c.serviceExternalId)
                          }
                          title="Approve"
                          className={`p-1.5 rounded transition-colors ${
                            isApproved
                              ? "bg-emerald-100 text-emerald-700"
                              : "hover:bg-emerald-50 text-muted-foreground hover:text-emerald-600"
                          }`}
                        >
                          <CheckCircle2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() =>
                            toggleReject(c.serviceExternalId)
                          }
                          title="Reject"
                          className={`p-1.5 rounded transition-colors ${
                            isRejected
                              ? "bg-red-100 text-red-700"
                              : "hover:bg-red-50 text-muted-foreground hover:text-red-600"
                          }`}
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
            <span className="text-emerald-600 font-bold">{approvedCount}</span>{" "}
            match{approvedCount !== 1 ? "es" : ""} approved
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

// ─── Address & Name Match Tab ─────────────────────────────────────────────────

function AddressMatchTab() {
  const [minConfidence, setMinConfidence] = useState(55);
  const [filterSource, setFilterSource] = useState("all");
  const [filterTier, setFilterTier] = useState("all");
  const [approved, setApproved] = useState<Set<string>>(new Set());
  const [rejected, setRejected] = useState<Set<string>>(new Set());
  const [committed, setCommitted] = useState(false);
  const [commitResult, setCommitResult] = useState<{
    applied: number;
    errors: string[];
  } | null>(null);

  const utils = trpc.useUtils();

  const { data, isLoading, refetch, isFetching } =
    trpc.billing.addressMatch.preview.useQuery(
      { minConfidence },
      { staleTime: 30_000 }
    );

  const commitMutation = trpc.billing.addressMatch.commit.useMutation({
    onSuccess: (result) => {
      setCommitResult(result);
      setCommitted(true);
      toast.success(`Applied ${result.applied} address matches successfully`);
      if (result.errors.length > 0)
        toast.error(`${result.errors.length} errors occurred`);
      utils.billing.addressMatch.preview.invalidate();
      utils.billing.customers.list.invalidate();
      utils.billing.services.list.invalidate();
      utils.billing.unmatched.list.invalidate();
      utils.billing.summary.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const candidates: AddressCandidate[] = data?.candidates || [];
  const stats = data?.stats;

  const filtered = useMemo(() => {
    return candidates.filter((c) => {
      if (rejected.has(c.serviceExternalId)) return false;
      if (filterSource !== "all" && c.matchSource !== filterSource) return false;
      if (filterTier !== "all" && c.tier !== filterTier) return false;
      return true;
    });
  }, [candidates, rejected, filterSource, filterTier]);

  const allApproved =
    filtered.length > 0 &&
    filtered.every((c) => approved.has(c.serviceExternalId));

  const toggleApprove = (id: string) => {
    setApproved((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setRejected((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const toggleReject = (id: string) => {
    setRejected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setApproved((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const approveAll = () => {
    setApproved(new Set(filtered.map((c) => c.serviceExternalId)));
    setRejected(new Set());
  };
  const rejectAll = () => {
    setRejected(new Set(filtered.map((c) => c.serviceExternalId)));
    setApproved(new Set());
  };
  const approveHighConfidence = () => {
    const high = filtered
      .filter((c) => c.confidence >= 80)
      .map((c) => c.serviceExternalId);
    setApproved(new Set(high));
  };

  const handleCommit = () => {
    const toCommit = candidates
      .filter((c) => approved.has(c.serviceExternalId))
      .map((c) => ({
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
      filtered.map((c) => ({
        "Service ID": c.serviceExternalId,
        "Service Type": c.serviceType,
        Provider: c.provider,
        "Plan Name": c.planName,
        "Service Address": c.locationAddress,
        "Match Source": MATCH_SOURCE_LABELS[c.matchSource] || c.matchSource,
        "Matched Text": c.matchedText,
        "Suggested Customer": c.suggestedCustomerName,
        "Customer Address": c.suggestedCustomerAddress,
        "Confidence %": c.confidence,
        "Match Tier": TIER_LABELS[c.tier] || c.tier,
        Status: approved.has(c.serviceExternalId)
          ? "Approved"
          : rejected.has(c.serviceExternalId)
          ? "Rejected"
          : "Pending",
      })),
      "address-auto-match"
    );
  };

  const approvedCount = candidates.filter((c) =>
    approved.has(c.serviceExternalId)
  ).length;

  if (committed && commitResult) {
    return (
      <div className="max-w-2xl">
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-8 text-center space-y-4">
          <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
          <h2 className="text-xl font-bold text-emerald-900">
            Address Match Complete
          </h2>
          <p className="text-emerald-700">
            Successfully matched{" "}
            <span className="font-bold">{commitResult.applied}</span> services
            to customers via address and name matching.
          </p>
          {commitResult.errors.length > 0 && (
            <div className="text-left bg-red-50 border border-red-200 rounded-lg p-4 mt-4">
              <p className="text-sm font-medium text-red-800 mb-2">
                Errors ({commitResult.errors.length}):
              </p>
              {commitResult.errors.map((e, i) => (
                <p key={i} className="text-xs text-red-700">
                  {e}
                </p>
              ))}
            </div>
          )}
          <div className="flex gap-3 justify-center pt-2">
            <Button
              onClick={() => {
                setCommitted(false);
                setApproved(new Set());
                setRejected(new Set());
                setCommitResult(null);
              }}
            >
              <RefreshCw className="w-4 h-4 mr-1.5" />
              Run Again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            {
              label: "Total Candidates",
              value: stats.total,
              icon: <MapPin className="w-4 h-4" />,
              color: "text-primary",
            },
            {
              label: "By Address",
              value: stats.byAddress,
              icon: <MapPin className="w-4 h-4" />,
              color: "text-blue-600",
            },
            {
              label: "By Plan Name",
              value: stats.byPlanName,
              icon: <Tag className="w-4 h-4" />,
              color: "text-purple-600",
            },
            {
              label: "By Customer Name",
              value: stats.byCustomerName,
              icon: <User className="w-4 h-4" />,
              color: "text-teal-600",
            },
          ].map((s) => (
            <div
              key={s.label}
              className="bg-card border border-border rounded-lg p-4"
            >
              <div
                className={`flex items-center gap-1.5 ${s.color} mb-1`}
              >
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
        <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-2">
          <Filter className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            Min confidence:
          </span>
          <select
            value={minConfidence}
            onChange={(e) => setMinConfidence(Number(e.target.value))}
            className="text-xs bg-transparent outline-none font-medium"
          >
            {[45, 50, 55, 60, 65, 70, 75, 80].map((v) => (
              <option key={v} value={v}>
                {v}%
              </option>
            ))}
          </select>
        </div>
        <select
          value={filterSource}
          onChange={(e) => setFilterSource(e.target.value)}
          className="text-xs bg-card border border-border rounded-lg px-3 py-2 outline-none"
        >
          <option value="all">All match sources</option>
          <option value="address">Address only</option>
          <option value="planName">Plan name only</option>
          <option value="customerName">Customer name only</option>
        </select>
        <select
          value={filterTier}
          onChange={(e) => setFilterTier(e.target.value)}
          className="text-xs bg-card border border-border rounded-lg px-3 py-2 outline-none"
        >
          <option value="all">All tiers</option>
          <option value="exact">Exact</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={filtered.length === 0}
          >
            <Download className="w-3.5 h-3.5 mr-1.5" />
            Export
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            {isFetching ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            )}
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={approveHighConfidence}>
            <BadgeCheck className="w-3.5 h-3.5 mr-1.5 text-emerald-600" />
            Approve ≥80%
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
          Matches unmatched services to customers using three strategies:{" "}
          <strong>service address → customer address</strong>,{" "}
          <strong>plan name → customer name</strong> (ChannelHaus/Voice), and{" "}
          <strong>customer name field → customer name</strong>. Review each
          suggestion before applying.
        </span>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-card border border-border rounded-lg p-12 text-center text-muted-foreground">
          <MapPin className="w-8 h-8 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No candidates found</p>
          <p className="text-sm mt-1">
            Try lowering the minimum confidence threshold, or import supplier
            invoices first to populate service addresses.
          </p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide w-8">
                  <button
                    onClick={() =>
                      allApproved ? rejectAll() : approveAll()
                    }
                  >
                    {allApproved ? (
                      <CheckSquare className="w-4 h-4 text-primary" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Service
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Matched Text
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Suggested Customer
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Customer Address
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide w-32">
                  Confidence
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide w-24">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((c) => {
                const isApproved = approved.has(c.serviceExternalId);
                const isRejected = rejected.has(c.serviceExternalId);
                return (
                  <tr
                    key={c.serviceExternalId}
                    className={`transition-colors ${
                      isApproved
                        ? "bg-emerald-50/50"
                        : isRejected
                        ? "bg-red-50/30 opacity-50"
                        : "hover:bg-muted/20"
                    }`}
                  >
                    <td className="px-4 py-3">
                      <button
                        onClick={() =>
                          toggleApprove(c.serviceExternalId)
                        }
                      >
                        {isApproved ? (
                          <CheckSquare className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <Square className="w-4 h-4 text-muted-foreground" />
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-3 max-w-[180px]">
                      <div className="font-mono text-xs text-muted-foreground truncate">
                        {c.serviceId || c.serviceExternalId}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {c.provider} · {c.serviceType}
                      </div>
                      {/* Match source badge */}
                      <span
                        className={`inline-flex items-center gap-1 mt-1 text-[10px] px-1.5 py-0.5 rounded border ${
                          MATCH_SOURCE_COLORS[c.matchSource] || "bg-muted"
                        }`}
                      >
                        {MATCH_SOURCE_ICONS[c.matchSource]}
                        {MATCH_SOURCE_LABELS[c.matchSource]}
                      </span>
                    </td>
                    <td className="px-4 py-3 max-w-[200px]">
                      <div className="text-xs font-medium truncate" title={c.matchedText}>
                        {c.matchedText}
                      </div>
                      {c.matchSource === "address" && c.locationAddress && (
                        <div className="text-[10px] text-muted-foreground truncate mt-0.5" title={c.locationAddress}>
                          {c.locationAddress}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-emerald-700">
                        {c.suggestedCustomerName}
                      </span>
                      <div className="text-[10px] text-muted-foreground font-mono">
                        {c.suggestedCustomerExternalId}
                      </div>
                    </td>
                    <td className="px-4 py-3 max-w-[180px]">
                      <div
                        className="text-xs text-muted-foreground truncate"
                        title={c.suggestedCustomerAddress}
                      >
                        {c.suggestedCustomerAddress || (
                          <span className="italic opacity-50">No address</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <ConfidenceBar score={c.confidence} />
                      <span
                        className={`inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded border ${
                          TIER_COLORS[c.tier] || "bg-muted"
                        }`}
                      >
                        {TIER_LABELS[c.tier] || c.tier}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() =>
                            toggleApprove(c.serviceExternalId)
                          }
                          title="Approve"
                          className={`p-1.5 rounded transition-colors ${
                            isApproved
                              ? "bg-emerald-100 text-emerald-700"
                              : "hover:bg-emerald-50 text-muted-foreground hover:text-emerald-600"
                          }`}
                        >
                          <CheckCircle2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() =>
                            toggleReject(c.serviceExternalId)
                          }
                          title="Reject"
                          className={`p-1.5 rounded transition-colors ${
                            isRejected
                              ? "bg-red-100 text-red-700"
                              : "hover:bg-red-50 text-muted-foreground hover:text-red-600"
                          }`}
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
            <span className="text-emerald-600 font-bold">{approvedCount}</span>{" "}
            match{approvedCount !== 1 ? "es" : ""} approved
          </span>
          <Button
            onClick={handleCommit}
            disabled={commitMutation.isPending}
            className="rounded-full"
          >
            {commitMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
            ) : (
              <MapPin className="w-4 h-4 mr-1.5" />
            )}
            Apply {approvedCount} Match{approvedCount !== 1 ? "es" : ""}
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Bulk Activate Tab ────────────────────────────────────────────────────────────────

function BulkActivateTab() {
  const utils = trpc.useUtils();
  const previewQuery = trpc.billing.bulkActivate.preview.useQuery(undefined, { staleTime: 30_000 });
  const commitMutation = trpc.billing.bulkActivate.commit.useMutation({
    onSuccess: (data) => {
      toast.success(`Activated ${data.count} services across ${data.affectedCustomers} customers`);
      previewQuery.refetch();
      utils.billing.customers.list.invalidate();
      utils.billing.services.list.invalidate();
      utils.billing.unmatched.list.invalidate();
      utils.billing.summary.invalidate();
    },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });

  const preview = previewQuery.data;
  const totalMonthly = preview?.preview.reduce((s, p) => s + p.monthlyCost, 0) ?? 0;

  return (
    <div className="space-y-4">
      {/* Info banner */}
      <div className="flex items-start gap-3 p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg text-sm">
        <Info className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
        <div>
          <p className="font-medium text-blue-900 dark:text-blue-100">Services already linked to customers</p>
          <p className="text-blue-700 dark:text-blue-300 mt-0.5">
            These services have a valid customer assignment but their status is still{" "}
            <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">unmatched</code>.
            Activating them updates their status to{" "}
            <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">active</code> and
            recalculates all customer cost, revenue, and margin figures.
          </p>
        </div>
      </div>

      {previewQuery.isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
          <Loader2 className="w-5 h-5 animate-spin" />
          Loading preview…
        </div>
      ) : preview ? (
        <>
          {/* Stats cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-card border border-border rounded-lg p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Services to Activate</p>
              <p className="text-3xl font-bold text-green-600 mt-1">{preview.count.toLocaleString()}</p>
            </div>
            <div className="bg-card border border-border rounded-lg p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Customers Affected</p>
              <p className="text-3xl font-bold text-primary mt-1">{preview.affectedCustomers.toLocaleString()}</p>
            </div>
            <div className="bg-card border border-border rounded-lg p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Validation Errors</p>
              <p className={`text-3xl font-bold mt-1 ${preview.errors.length > 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
                {preview.errors.length}
              </p>
            </div>
            <div className="bg-card border border-border rounded-lg p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Monthly Cost (preview)</p>
              <p className="text-3xl font-bold text-amber-600 mt-1">
                ${totalMonthly.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </p>
            </div>
          </div>

          {/* Action button */}
          {preview.count > 0 && (
            <div className="flex items-center gap-3">
              <Button
                onClick={() => commitMutation.mutate()}
                disabled={commitMutation.isPending}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                {commitMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Activating…</>
                ) : (
                  <><CheckCircle2 className="w-4 h-4 mr-2" />Activate All {preview.count.toLocaleString()} Services</>
                )}
              </Button>
              <span className="text-sm text-muted-foreground">
                Updates status to <strong>active</strong> and recalculates all customer stats.
              </span>
            </div>
          )}

          {preview.count === 0 && (
            <div className="flex items-center gap-2 text-green-600 py-4">
              <CheckCircle2 className="w-5 h-5" />
              <span className="font-medium">All linked services are already active. Nothing to do.</span>
            </div>
          )}

          {/* Preview table */}
          {preview.preview.length > 0 && (
            <div className="border border-border rounded-lg overflow-hidden">
              <div className="bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Preview (first {preview.preview.length} of {preview.count})
              </div>
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/90 backdrop-blur-sm">
                    <tr className="border-b border-border">
                      <th className="text-left px-4 py-2 font-medium">Service ID</th>
                      <th className="text-left px-4 py-2 font-medium">Customer</th>
                      <th className="text-left px-4 py-2 font-medium">Address</th>
                      <th className="text-right px-4 py-2 font-medium">Monthly Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.preview.map((row, i) => (
                      <tr key={row.serviceExternalId} className={`border-b border-border/50 ${i % 2 === 0 ? '' : 'bg-muted/10'}`}>
                        <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{row.serviceExternalId}</td>
                        <td className="px-4 py-2">
                          <span className="font-medium">{row.customerName}</span>
                          <span className="ml-2 text-xs text-muted-foreground">{row.customerExternalId}</span>
                        </td>
                        <td className="px-4 py-2 text-muted-foreground text-xs max-w-xs truncate">{row.locationAddress || '—'}</td>
                        <td className="px-4 py-2 text-right font-mono">${row.monthlyCost.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Errors */}
          {preview.errors.length > 0 && (
            <div className="border border-red-200 rounded-lg p-4 bg-red-50 dark:bg-red-950/20">
              <p className="text-sm font-medium text-red-700 mb-2">Validation errors ({preview.errors.length}):</p>
              <ul className="text-xs text-red-600 space-y-1">
                {preview.errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}
        </>
      ) : null}

      {/* Recalculate All */}
      <RecalculateAllSection />
    </div>
  );
}

function RecalculateAllSection() {
  const utils = trpc.useUtils();
  const [lastRan, setLastRan] = React.useState<Date | null>(null);
  const recalcMutation = trpc.billing.recalculateAll.useMutation({
    onSuccess: () => {
      setLastRan(new Date());
      toast.success('Full recalculation complete — all costs, revenue, and margins updated');
      utils.billing.customers.list.invalidate();
      utils.billing.summary.invalidate();
    },
    onError: (err) => toast.error(`Recalculation failed: ${err.message}`),
  });
  return (
    <div className="mt-6 border-t border-border pt-6">
      <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
        <RefreshCw className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-medium text-amber-900 dark:text-amber-100">Full Database Recalculation</p>
          <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
            Recalculates cost, revenue, and margin for every service and customer. Run this after bulk imports or if figures appear stale.
          </p>
          {lastRan && (
            <p className="text-xs text-amber-600 mt-1">Last ran: {lastRan.toLocaleTimeString()}</p>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => recalcMutation.mutate()}
          disabled={recalcMutation.isPending}
          className="border-amber-400 text-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/30 shrink-0"
        >
          {recalcMutation.isPending ? (
            <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Recalculating…</>
          ) : (
            <><RefreshCw className="w-3.5 h-3.5 mr-1.5" />Recalculate All</>
          )}
        </Button>
      </div>
    </div>
  );
}
// ─── Root page ─────────────────────────────────────────────────────────────────

export default function AutoMatch() {
  const [activeTab, setActiveTab] = useState<"alias" | "address" | "bulk" | "proposals">("bulk");
  const { data: pendingCount = 0 } = trpc.billing.customers.proposals.pendingCount.useQuery(undefined, { refetchInterval: 30_000 });

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-primary" />
            Auto-Match
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Automatically match unmatched services to customers using fuzzy
            logic.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-muted/40 border border-border rounded-lg p-1 w-fit">
        <button
          onClick={() => setActiveTab("bulk")}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === "bulk"
              ? "bg-card shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <CheckCircle2 className="w-4 h-4" />
          Bulk Activate
        </button>
        <button
          onClick={() => setActiveTab("address")}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === "address"
              ? "bg-card shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <MapPin className="w-4 h-4" />
          Address &amp; Name Match
        </button>
        <button
          onClick={() => setActiveTab("alias")}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === "alias"
              ? "bg-card shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Zap className="w-4 h-4" />
          Alias Match
        </button>
        <button
          onClick={() => setActiveTab("proposals")}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === "proposals"
              ? "bg-card shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <UserPlus className="w-4 h-4" />
          New Customers
          {pendingCount > 0 && (
            <span className="ml-1 bg-amber-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
              {pendingCount > 9 ? "9+" : pendingCount}
            </span>
          )}
        </button>
      </div>

      {/* Tab content */}
      {activeTab === "bulk" ? <BulkActivateTab /> : activeTab === "address" ? <AddressMatchTab /> : activeTab === "alias" ? <AliasMatchTab /> : <CustomerProposalsTab />}
    </div>
  );
}
