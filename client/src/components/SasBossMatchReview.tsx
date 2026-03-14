import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CheckCircle2, AlertTriangle, XCircle, Search,
  ChevronDown, ChevronUp, Loader2, CheckCheck, SkipForward
} from "lucide-react";
import { toast } from "sonner";

interface MatchProposal {
  rowIndex: number;
  enterpriseName: string;
  productName: string;
  productType: string;
  serviceRefId: string;
  amountExGst: number;
  amountIncGst: number;
  customerConfidence: "exact" | "fuzzy" | "none";
  customerScore: number;
  matchedCustomerExternalId: string | null;
  matchedCustomerName: string | null;
  serviceConfidence: "exact" | "fuzzy" | "none";
  serviceScore: number;
  matchedServiceExternalId: string | null;
  matchedServicePlanName: string | null;
  overallConfidence: "exact" | "fuzzy" | "none";
  requiresReview: boolean;
}

interface CallUsageProposal {
  enterpriseName: string;
  callUsageExGst: number;
  customerConfidence: "exact" | "fuzzy" | "none";
  customerScore: number;
  matchedCustomerExternalId: string | null;
  matchedCustomerName: string | null;
}

interface DryRunResult {
  workbookName: string;
  billingMonth: string;
  totalExGst: number;
  lineItemCount: number;
  exactCount: number;
  fuzzyCount: number;
  noneCount: number;
  proposals: MatchProposal[];
  callUsageProposals: CallUsageProposal[];
}

interface ReviewDecision {
  action: "approve" | "skip";
  confirmedCustomerExternalId: string | null;
  confirmedCustomerName: string | null;
  confirmedServiceExternalId: string | null;
}

interface SasBossMatchReviewProps {
  dryRunResult: DryRunResult;
  invoiceReference: string;
  onConfirmed: (result: any) => void;
  onCancel: () => void;
}

function ConfidenceBadge({ tier }: { tier: "exact" | "fuzzy" | "none" }) {
  if (tier === "exact") return (
    <Badge className="bg-green-100 text-green-800 border-green-200 gap-1">
      <CheckCircle2 className="w-3 h-3" /> Exact
    </Badge>
  );
  if (tier === "fuzzy") return (
    <Badge className="bg-amber-100 text-amber-800 border-amber-200 gap-1">
      <AlertTriangle className="w-3 h-3" /> Fuzzy
    </Badge>
  );
  return (
    <Badge className="bg-red-100 text-red-800 border-red-200 gap-1">
      <XCircle className="w-3 h-3" /> No Match
    </Badge>
  );
}

function CustomerSearchPicker({
  value,
  onChange,
}: {
  value: { externalId: string; name: string } | null;
  onChange: (c: { externalId: string; name: string } | null) => void;
}) {
  const [search, setSearch] = useState("");
  const { data: results } = trpc.billing.merge.search.useQuery(
    { search },
    { enabled: search.length >= 2 }
  );

  return (
    <div className="relative">
      <div className="flex items-center gap-2 border rounded px-2 py-1 bg-white">
        <Search className="w-3 h-3 text-muted-foreground" />
        <input
          className="text-xs outline-none flex-1 min-w-0"
          placeholder="Search customer..."
          value={search || value?.name || ""}
          onChange={e => { setSearch(e.target.value); if (!e.target.value) onChange(null); }}
        />
        {value && (
          <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => { onChange(null); setSearch(""); }}>✕</button>
        )}
      </div>
      {search.length >= 2 && results && results.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 bg-white border rounded shadow-lg max-h-40 overflow-y-auto">
          {results.slice(0, 8).map((c: any) => (
            <button
              key={c.externalId}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent"
              onClick={() => { onChange({ externalId: c.externalId, name: c.name }); setSearch(""); }}
            >
              <span className="font-medium">{c.name}</span>
              <span className="text-muted-foreground ml-2">{c.externalId}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ProposalRow({
  proposal,
  decision,
  onDecisionChange,
}: {
  proposal: MatchProposal;
  decision: ReviewDecision;
  onDecisionChange: (d: ReviewDecision) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isSkipped = decision.action === "skip";

  return (
    <div className={`border rounded-lg mb-2 transition-opacity ${isSkipped ? "opacity-40" : ""}`}>
      <div className="flex items-center gap-3 px-3 py-2">
        {/* Confidence indicator */}
        <div className={`w-1 self-stretch rounded-full flex-shrink-0 ${
          proposal.overallConfidence === "exact" ? "bg-green-400" :
          proposal.overallConfidence === "fuzzy" ? "bg-amber-400" : "bg-red-400"
        }`} />

        {/* Main info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm truncate">{proposal.enterpriseName}</span>
            <span className="text-muted-foreground text-xs">→</span>
            <span className="text-xs text-muted-foreground truncate">{proposal.productName}</span>
            <ConfidenceBadge tier={proposal.overallConfidence} />
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {decision.confirmedCustomerName
              ? <span className="text-green-700 font-medium">{decision.confirmedCustomerName}</span>
              : proposal.matchedCustomerName
              ? <span className={proposal.customerConfidence === "fuzzy" ? "text-amber-700" : "text-green-700"}>{proposal.matchedCustomerName}</span>
              : <span className="text-red-600">No customer matched</span>
            }
            {" · "}
            {decision.confirmedServiceExternalId
              ? <span className="text-green-700">Service confirmed</span>
              : proposal.matchedServicePlanName
              ? <span className={proposal.serviceConfidence === "fuzzy" ? "text-amber-700" : "text-green-700"}>{proposal.matchedServicePlanName}</span>
              : <span className="text-muted-foreground">New service will be created</span>
            }
            {" · "}
            <span className="font-medium">${proposal.amountExGst.toFixed(2)}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {!isSkipped ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs text-muted-foreground hover:text-red-600"
              onClick={() => onDecisionChange({ ...decision, action: "skip" })}
            >
              <SkipForward className="w-3 h-3 mr-1" /> Skip
            </Button>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs text-green-700"
              onClick={() => onDecisionChange({ ...decision, action: "approve" })}
            >
              <CheckCircle2 className="w-3 h-3 mr-1" /> Restore
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="border-t px-3 py-3 bg-muted/30 space-y-3">
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <div className="font-medium text-muted-foreground mb-1">WORKBOOK DATA</div>
              <div><span className="text-muted-foreground">Enterprise:</span> {proposal.enterpriseName}</div>
              <div><span className="text-muted-foreground">Product:</span> {proposal.productName}</div>
              <div><span className="text-muted-foreground">Type:</span> {proposal.productType}</div>
              <div><span className="text-muted-foreground">Ref ID:</span> {proposal.serviceRefId || "—"}</div>
              <div><span className="text-muted-foreground">Ex-GST:</span> ${proposal.amountExGst.toFixed(2)}</div>
            </div>
            <div>
              <div className="font-medium text-muted-foreground mb-1">AUTO-MATCH RESULT</div>
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground">Customer:</span>
                {proposal.matchedCustomerName
                  ? <><span>{proposal.matchedCustomerName}</span><ConfidenceBadge tier={proposal.customerConfidence} /></>
                  : <span className="text-red-600">None</span>
                }
              </div>
              <div className="flex items-center gap-1 mt-0.5">
                <span className="text-muted-foreground">Service:</span>
                {proposal.matchedServicePlanName
                  ? <><span>{proposal.matchedServicePlanName}</span><ConfidenceBadge tier={proposal.serviceConfidence} /></>
                  : <span className="text-muted-foreground">Will create new</span>
                }
              </div>
            </div>
          </div>

          {/* Override customer */}
          {(proposal.requiresReview || !decision.confirmedCustomerExternalId) && (
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1">OVERRIDE CUSTOMER MATCH</div>
              <CustomerSearchPicker
                value={decision.confirmedCustomerExternalId
                  ? { externalId: decision.confirmedCustomerExternalId, name: decision.confirmedCustomerName ?? "" }
                  : null
                }
                onChange={c => onDecisionChange({
                  ...decision,
                  confirmedCustomerExternalId: c?.externalId ?? proposal.matchedCustomerExternalId,
                  confirmedCustomerName: c?.name ?? proposal.matchedCustomerName,
                  confirmedServiceExternalId: c ? null : decision.confirmedServiceExternalId, // reset service if customer changed
                })}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function SasBossMatchReview({
  dryRunResult,
  invoiceReference,
  onConfirmed,
  onCancel,
}: SasBossMatchReviewProps) {
  // Initialise decisions: exact matches auto-approved, others need review
  const [decisions, setDecisions] = useState<Map<number, ReviewDecision>>(() => {
    const map = new Map<number, ReviewDecision>();
    for (const p of dryRunResult.proposals) {
      map.set(p.rowIndex, {
        action: "approve",
        confirmedCustomerExternalId: p.matchedCustomerExternalId,
        confirmedCustomerName: p.matchedCustomerName,
        confirmedServiceExternalId: p.matchedServiceExternalId,
      });
    }
    return map;
  });

  const [callUsageDecisions, setCallUsageDecisions] = useState<Map<string, "approve" | "skip">>(() => {
    const map = new Map<string, "approve" | "skip">();
    for (const cu of dryRunResult.callUsageProposals) {
      map.set(cu.enterpriseName, cu.customerConfidence !== "none" ? "approve" : "skip");
    }
    return map;
  });

  const [activeTab, setActiveTab] = useState<"fuzzy" | "none" | "exact">("fuzzy");
  const [globalSearch, setGlobalSearch] = useState("");

  const confirmMutation = trpc.billing.confirmSasBoss.useMutation({
    onSuccess: (result) => {
      toast.success("Import confirmed", { description: `${result.matchedCount} services matched, ${result.unmatchedCount} new services created.` });
      onConfirmed(result);
    },
    onError: (err) => {
      toast.error("Import failed", { description: err.message });
    },
  });

  const updateDecision = (rowIndex: number, d: ReviewDecision) => {
    setDecisions(prev => new Map(prev).set(rowIndex, d));
  };

  const filterProposals = (tier: "exact" | "fuzzy" | "none") => {
    return dryRunResult.proposals.filter(p => {
      const matchesTier = p.overallConfidence === tier;
      const matchesSearch = !globalSearch || 
        p.enterpriseName.toLowerCase().includes(globalSearch.toLowerCase()) ||
        p.productName.toLowerCase().includes(globalSearch.toLowerCase());
      return matchesTier && matchesSearch;
    });
  };

  const approvedCount = Array.from(decisions.values()).filter(d => d.action === "approve").length;
  const skippedCount = Array.from(decisions.values()).filter(d => d.action === "skip").length;
  const callUsageApprovedCount = Array.from(callUsageDecisions.values()).filter(v => v === "approve").length;

  const handleApproveAll = (tier: "exact" | "fuzzy" | "none") => {
    const toApprove = filterProposals(tier);
    setDecisions(prev => {
      const next = new Map(prev);
      for (const p of toApprove) {
        next.set(p.rowIndex, {
          action: "approve",
          confirmedCustomerExternalId: p.matchedCustomerExternalId,
          confirmedCustomerName: p.matchedCustomerName,
          confirmedServiceExternalId: p.matchedServiceExternalId,
        });
      }
      return next;
    });
  };

  const handleSkipAll = (tier: "exact" | "fuzzy" | "none") => {
    const toSkip = filterProposals(tier);
    setDecisions(prev => {
      const next = new Map(prev);
      for (const p of toSkip) {
        const existing = next.get(p.rowIndex)!;
        next.set(p.rowIndex, { ...existing, action: "skip" });
      }
      return next;
    });
  };

  const handleConfirm = () => {
    const approvedProposals = dryRunResult.proposals.map(p => {
      const d = decisions.get(p.rowIndex)!;
      return {
        rowIndex: p.rowIndex,
        enterpriseName: p.enterpriseName,
        productName: p.productName,
        productType: p.productType,
        serviceRefId: p.serviceRefId,
        amountExGst: p.amountExGst,
        amountIncGst: p.amountIncGst,
        confirmedCustomerExternalId: d.confirmedCustomerExternalId,
        confirmedCustomerName: d.confirmedCustomerName,
        confirmedServiceExternalId: d.confirmedServiceExternalId,
        action: d.action,
      };
    });

    const callUsageProposalsInput = dryRunResult.callUsageProposals.map(cu => ({
      enterpriseName: cu.enterpriseName,
      callUsageExGst: cu.callUsageExGst,
      confirmedCustomerExternalId: cu.matchedCustomerExternalId,
      confirmedCustomerName: cu.matchedCustomerName,
      action: callUsageDecisions.get(cu.enterpriseName) ?? "skip",
    }));

    confirmMutation.mutate({
      workbookName: dryRunResult.workbookName,
      billingMonth: dryRunResult.billingMonth,
      invoiceReference,
      approvedProposals,
      callUsageProposals: callUsageProposalsInput,
    });
  };

  const fuzzyProposals = filterProposals("fuzzy");
  const noneProposals = filterProposals("none");
  const exactProposals = filterProposals("exact");

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b px-6 py-4 bg-background">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold">Review Match Proposals</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {dryRunResult.workbookName} · {dryRunResult.billingMonth} · ${dryRunResult.totalExGst.toFixed(2)} ex-GST
            </p>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="flex items-center gap-1 text-green-700">
              <CheckCircle2 className="w-4 h-4" /> {dryRunResult.exactCount} exact
            </span>
            <span className="flex items-center gap-1 text-amber-700">
              <AlertTriangle className="w-4 h-4" /> {dryRunResult.fuzzyCount} fuzzy
            </span>
            <span className="flex items-center gap-1 text-red-700">
              <XCircle className="w-4 h-4" /> {dryRunResult.noneCount} no-match
            </span>
          </div>
        </div>

        {/* Summary bar */}
        <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
          <span><strong className="text-foreground">{approvedCount}</strong> to import</span>
          <span><strong className="text-foreground">{skippedCount}</strong> skipped</span>
          <span><strong className="text-foreground">{callUsageApprovedCount}</strong> call usage records</span>
        </div>
      </div>

      {/* Search */}
      <div className="px-6 py-3 border-b">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-9 h-8 text-sm"
            placeholder="Filter by enterprise or product name..."
            value={globalSearch}
            onChange={e => setGlobalSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={v => setActiveTab(v as any)} className="flex-1 flex flex-col min-h-0">
        <TabsList className="mx-6 mt-3 w-fit">
          <TabsTrigger value="fuzzy" className="gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
            Fuzzy ({fuzzyProposals.length})
          </TabsTrigger>
          <TabsTrigger value="none" className="gap-1.5">
            <XCircle className="w-3.5 h-3.5 text-red-500" />
            No Match ({noneProposals.length})
          </TabsTrigger>
          <TabsTrigger value="exact" className="gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
            Exact ({exactProposals.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="fuzzy" className="flex-1 flex flex-col min-h-0 mt-0">
          <div className="flex items-center justify-between px-6 py-2 border-b bg-amber-50/50">
            <p className="text-xs text-amber-800">
              These matches are estimated. Please review each one before confirming.
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleApproveAll("fuzzy")}>
                <CheckCheck className="w-3 h-3 mr-1" /> Approve All
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleSkipAll("fuzzy")}>
                <SkipForward className="w-3 h-3 mr-1" /> Skip All
              </Button>
            </div>
          </div>
          <ScrollArea className="flex-1 px-6 py-3">
            {fuzzyProposals.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">No fuzzy matches</div>
            ) : (
              fuzzyProposals.map(p => (
                <ProposalRow
                  key={p.rowIndex}
                  proposal={p}
                  decision={decisions.get(p.rowIndex)!}
                  onDecisionChange={d => updateDecision(p.rowIndex, d)}
                />
              ))
            )}
          </ScrollArea>
        </TabsContent>

        <TabsContent value="none" className="flex-1 flex flex-col min-h-0 mt-0">
          <div className="flex items-center justify-between px-6 py-2 border-b bg-red-50/50">
            <p className="text-xs text-red-800">
              No customer found. Search to assign manually, or skip to create as unmatched.
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleSkipAll("none")}>
                <SkipForward className="w-3 h-3 mr-1" /> Skip All (create unmatched)
              </Button>
            </div>
          </div>
          <ScrollArea className="flex-1 px-6 py-3">
            {noneProposals.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">No unmatched items</div>
            ) : (
              noneProposals.map(p => (
                <ProposalRow
                  key={p.rowIndex}
                  proposal={p}
                  decision={decisions.get(p.rowIndex)!}
                  onDecisionChange={d => updateDecision(p.rowIndex, d)}
                />
              ))
            )}
          </ScrollArea>
        </TabsContent>

        <TabsContent value="exact" className="flex-1 flex flex-col min-h-0 mt-0">
          <div className="flex items-center justify-between px-6 py-2 border-b bg-green-50/50">
            <p className="text-xs text-green-800">
              These are high-confidence matches and will be auto-approved. You can still skip individual rows.
            </p>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleApproveAll("exact")}>
              <CheckCheck className="w-3 h-3 mr-1" /> Approve All
            </Button>
          </div>
          <ScrollArea className="flex-1 px-6 py-3">
            {exactProposals.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">No exact matches</div>
            ) : (
              exactProposals.map(p => (
                <ProposalRow
                  key={p.rowIndex}
                  proposal={p}
                  decision={decisions.get(p.rowIndex)!}
                  onDecisionChange={d => updateDecision(p.rowIndex, d)}
                />
              ))
            )}
          </ScrollArea>
        </TabsContent>
      </Tabs>

      {/* Footer */}
      <div className="border-t px-6 py-4 bg-background flex items-center justify-between">
        <Button variant="outline" onClick={onCancel} disabled={confirmMutation.isPending}>
          Cancel
        </Button>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {approvedCount} of {dryRunResult.lineItemCount} rows will be imported
          </span>
          <Button
            onClick={handleConfirm}
            disabled={confirmMutation.isPending || approvedCount === 0}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            {confirmMutation.isPending ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Importing...</>
            ) : (
              <><CheckCheck className="w-4 h-4 mr-2" /> Confirm Import ({approvedCount} rows)</>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
