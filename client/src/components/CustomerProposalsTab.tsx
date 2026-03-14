/**
 * CustomerProposalsTab — New Customer Proposals approval workflow
 * Shows pending proposals queued from SM imports and manual submissions.
 * Reviewers can:
 *   - Approve (creates new customer + assigns services + Platform Check)
 *   - Assign to Existing Customer (assigns services to existing customer + Platform Check)
 *   - Reject with a reason (creates Platform Check noting rejection)
 */
import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  CheckCircle2,
  XCircle,
  Clock,
  User,
  FileText,
  Loader2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  BadgeCheck,
  UserPlus,
  Link2,
  UserCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import AssignToExistingCustomerDialog from "./AssignToExistingCustomerDialog";

type StatusFilter = "pending" | "approved" | "rejected" | "all";

function StatusBadge({ status }: { status: string }) {
  if (status === "pending")
    return (
      <Badge variant="outline" className="border-amber-400 text-amber-600 bg-amber-50 dark:bg-amber-950/30 gap-1">
        <Clock className="w-3 h-3" /> Pending
      </Badge>
    );
  if (status === "approved")
    return (
      <Badge variant="outline" className="border-emerald-400 text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 gap-1">
        <BadgeCheck className="w-3 h-3" /> Approved
      </Badge>
    );
  return (
    <Badge variant="outline" className="border-red-400 text-red-600 bg-red-50 dark:bg-red-950/30 gap-1">
      <XCircle className="w-3 h-3" /> Rejected
    </Badge>
  );
}

function ProposalCard({
  proposal,
  onApprove,
  onReject,
  onAssignToExisting,
  approving,
  rejecting,
}: {
  proposal: any;
  onApprove: (id: number) => void;
  onReject: (id: number, reason: string) => void;
  onAssignToExisting: (proposal: any) => void;
  approving: boolean;
  rejecting: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const serviceIds: string[] = Array.isArray(proposal.serviceExternalIds)
    ? proposal.serviceExternalIds
    : [];

  const createdAt = proposal.createdAt
    ? new Date(proposal.createdAt).toLocaleString()
    : "—";
  const reviewedAt = proposal.reviewedAt
    ? new Date(proposal.reviewedAt).toLocaleString()
    : null;

  return (
    <div className="border border-border rounded-lg bg-card overflow-hidden">
      {/* Card header */}
      <div className="flex items-start gap-3 p-4">
        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
          <UserPlus className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-foreground">{proposal.proposedName}</span>
            <StatusBadge status={proposal.status} />
            {proposal.createPlatformCheck && (
              <Badge variant="outline" className="border-blue-400 text-blue-600 bg-blue-50 dark:bg-blue-950/30 text-xs gap-1">
                <FileText className="w-3 h-3" /> Platform Check
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1">
              <User className="w-3 h-3" /> Proposed by {proposal.proposedBy}
            </span>
            <span>{createdAt}</span>
            {proposal.source && (
              <span className="flex items-center gap-1">
                <Link2 className="w-3 h-3" /> {proposal.source}
              </span>
            )}
            {serviceIds.length > 0 && (
              <span className="flex items-center gap-1">
                <Link2 className="w-3 h-3" /> {serviceIds.length} service{serviceIds.length !== 1 ? "s" : ""} to assign
              </span>
            )}
          </div>
          {proposal.notes && (
            <p className="mt-1.5 text-sm text-muted-foreground line-clamp-2">{proposal.notes}</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
          {proposal.status === "pending" && (
            <>
              {/* Reject */}
              <Button
                size="sm"
                variant="outline"
                className="border-red-300 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                onClick={() => setShowRejectForm(!showRejectForm)}
                disabled={approving || rejecting}
              >
                <XCircle className="w-3.5 h-3.5 mr-1" />
                Reject
              </Button>
              {/* Assign to existing */}
              <Button
                size="sm"
                variant="outline"
                className="border-blue-300 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30"
                onClick={() => onAssignToExisting(proposal)}
                disabled={approving || rejecting}
              >
                <UserCheck className="w-3.5 h-3.5 mr-1" />
                Assign to Existing
              </Button>
              {/* Approve (create new customer) */}
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => onApprove(proposal.id)}
                disabled={approving || rejecting}
              >
                {approving ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                )}
                Approve
              </Button>
            </>
          )}
          {proposal.status === "approved" && proposal.createdCustomerExternalId && (
            <span className="text-xs text-emerald-600 font-medium">
              → Customer {proposal.createdCustomerExternalId}
            </span>
          )}
          {proposal.status === "rejected" && proposal.rejectionReason && (
            <span className="text-xs text-red-500 max-w-[200px] truncate" title={proposal.rejectionReason}>
              {proposal.rejectionReason}
            </span>
          )}
          <button
            className="text-muted-foreground hover:text-foreground p-1"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Reject form */}
      {showRejectForm && proposal.status === "pending" && (
        <div className="px-4 pb-3 border-t border-border bg-red-50/50 dark:bg-red-950/10">
          <p className="text-xs font-medium text-red-700 dark:text-red-400 mt-3 mb-1.5">
            Rejection reason (optional)
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              className="flex-1 text-sm border border-border rounded px-2 py-1.5 bg-background"
              placeholder="e.g. Duplicate of existing customer, wrong name..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
            <Button
              size="sm"
              variant="destructive"
              onClick={() => {
                onReject(proposal.id, rejectReason);
                setShowRejectForm(false);
              }}
              disabled={rejecting}
            >
              {rejecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Confirm Reject"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowRejectForm(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Expanded details */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-border bg-muted/20">
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Services to Assign</p>
              {serviceIds.length === 0 ? (
                <p className="text-muted-foreground text-xs">No services linked</p>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {serviceIds.map((id) => (
                    <Badge key={id} variant="secondary" className="text-xs font-mono">
                      {id}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Review Info</p>
              {reviewedAt ? (
                <p className="text-xs text-muted-foreground">
                  {proposal.status === "approved" ? "Approved" : "Rejected"} by {proposal.reviewedBy} on {reviewedAt}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">Not yet reviewed</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CustomerProposalsTab() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [approvingId, setApprovingId] = useState<number | null>(null);
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [assignToExistingProposal, setAssignToExistingProposal] = useState<any | null>(null);

  const utils = trpc.useUtils();

  const { data: proposals = [], isLoading, refetch } = trpc.billing.customers.proposals.list.useQuery(
    statusFilter === "all" ? {} : { status: statusFilter as any },
    { refetchInterval: 30_000 }
  );

  const { data: pendingCount = 0 } = trpc.billing.customers.proposals.pendingCount.useQuery(
    undefined,
    { refetchInterval: 30_000 }
  );

  const approveMutation = trpc.billing.customers.proposals.approve.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        toast.success(`Customer created successfully (${result.customerExternalId})`);
      } else {
        toast.error(result.error || "Failed to approve proposal");
      }
      utils.billing.customers.proposals.list.invalidate();
      utils.billing.customers.proposals.pendingCount.invalidate();
      utils.billing.customers.list.invalidate();
      utils.billing.platformChecks.list.invalidate();
      utils.billing.platformChecks.summary.invalidate();
      setApprovingId(null);
    },
    onError: (err) => {
      toast.error(err.message || "Failed to approve proposal");
      setApprovingId(null);
    },
  });

  const rejectMutation = trpc.billing.customers.proposals.reject.useMutation({
    onSuccess: () => {
      toast.success("Proposal rejected — Platform Check created for billing review");
      utils.billing.customers.proposals.list.invalidate();
      utils.billing.customers.proposals.pendingCount.invalidate();
      utils.billing.platformChecks.list.invalidate();
      utils.billing.platformChecks.summary.invalidate();
      setRejectingId(null);
    },
    onError: (err) => {
      toast.error(err.message || "Failed to reject proposal");
      setRejectingId(null);
    },
  });

  const handleApprove = (id: number) => {
    setApprovingId(id);
    approveMutation.mutate({ proposalId: id });
  };

  const handleReject = (id: number, reason: string) => {
    setRejectingId(id);
    rejectMutation.mutate({ proposalId: id, reason });
  };

  const tabs: { key: StatusFilter; label: string }[] = [
    { key: "pending", label: `Pending${pendingCount > 0 ? ` (${pendingCount})` : ""}` },
    { key: "approved", label: "Approved" },
    { key: "rejected", label: "Rejected" },
    { key: "all", label: "All" },
  ];

  return (
    <div className="space-y-4">
      {/* Sub-tab filter */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 bg-muted/40 border border-border rounded-lg p-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setStatusFilter(t.key)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                statusFilter === t.key
                  ? "bg-card shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
          Refresh
        </Button>
      </div>

      {/* Info banner for pending */}
      {statusFilter === "pending" && pendingCount > 0 && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 text-sm text-amber-800 dark:text-amber-200">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>
            <strong>{pendingCount} proposal{pendingCount !== 1 ? "s" : ""}</strong> awaiting review.
            You can <strong>Approve</strong> (creates new customer), <strong>Assign to Existing</strong> (links services to an existing customer), or <strong>Reject</strong> (records a Platform Check for billing review).
          </span>
        </div>
      )}

      {/* Proposals list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Loading proposals...
        </div>
      ) : proposals.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <CheckCircle2 className="w-10 h-10 mb-3 opacity-30" />
          <p className="font-medium">No {statusFilter !== "all" ? statusFilter : ""} proposals</p>
          <p className="text-sm mt-1 opacity-70">
            {statusFilter === "pending"
              ? 'Use the "Create New Customer" button on any unmatched service to submit a proposal.'
              : "No proposals match this filter."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {proposals.map((proposal: any) => (
            <ProposalCard
              key={proposal.id}
              proposal={proposal}
              onApprove={handleApprove}
              onReject={handleReject}
              onAssignToExisting={setAssignToExistingProposal}
              approving={approvingId === proposal.id}
              rejecting={rejectingId === proposal.id}
            />
          ))}
        </div>
      )}

      {/* Assign to Existing Customer dialog */}
      {assignToExistingProposal && (
        <AssignToExistingCustomerDialog
          proposalId={assignToExistingProposal.id}
          proposedName={assignToExistingProposal.proposedName}
          serviceCount={
            Array.isArray(assignToExistingProposal.serviceExternalIds)
              ? assignToExistingProposal.serviceExternalIds.length
              : 0
          }
          onSuccess={() => {
            utils.billing.customers.list.invalidate();
          }}
          onClose={() => setAssignToExistingProposal(null)}
        />
      )}
    </div>
  );
}
