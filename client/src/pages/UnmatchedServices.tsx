import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  Flag,
  Info,
  Loader2,
  MessageSquare,
  Phone,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  Wifi,
  Smartphone,
  X,
  LinkIcon,
  UserPlus,
  Ban,
  StickyNote,
  Save,
  ZapOff,
  Download,
  ClipboardList,
  MapPin,
  Users,
  Tag,
  Send,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { exportToCSV } from "@/lib/exportCsv";
import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useDebounce } from "@/hooks/useDebounce";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { ProviderBadge } from "@/components/ProviderBadge";
import { CreateCustomerDialog } from "@/components/CreateCustomerDialog";

type ConfidenceLevel = "high" | "medium" | "low" | "none";

const confidenceConfig: Record<
  ConfidenceLevel,
  { label: string; color: string; bg: string; icon: typeof ShieldCheck }
> = {
  high: {
    label: "High",
    color: "text-emerald-700",
    bg: "bg-emerald-50 border-emerald-200",
    icon: ShieldCheck,
  },
  medium: {
    label: "Medium",
    color: "text-amber-700",
    bg: "bg-amber-50 border-amber-200",
    icon: Shield,
  },
  low: {
    label: "Low",
    color: "text-orange-700",
    bg: "bg-orange-50 border-orange-200",
    icon: ShieldAlert,
  },
  none: {
    label: "No Match",
    color: "text-rose-700",
    bg: "bg-rose-50 border-rose-200",
    icon: ShieldQuestion,
  },
};

const serviceTypeIcons: Record<string, typeof Wifi> = {
  Internet: Wifi,
  Mobile: Smartphone,
  Voice: Phone,
};

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: "bg-emerald-50 text-emerald-700 border-emerald-200",
    unmatched: "bg-amber-50 text-amber-700 border-amber-200",
    flagged_for_termination: "bg-rose-50 text-rose-700 border-rose-200",
    terminated: "bg-gray-100 text-gray-500 border-gray-200",
  };
  const labels: Record<string, string> = {
    active: "Active",
    unmatched: "Unmatched",
    flagged_for_termination: "Flagged",
    terminated: "Terminated",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full border ${styles[status] || styles.unmatched}`}
    >
      {status === "flagged_for_termination" && <Flag className="w-2.5 h-2.5" />}
      {status === "terminated" && <Ban className="w-2.5 h-2.5" />}
      {labels[status] || status}
    </span>
  );
}

function DiscoveryNotesEditor({ service }: { service: any }) {
  const { user } = useAuth();
  const [notes, setNotes] = useState(service.discoveryNotes || "");
  const [isEditing, setIsEditing] = useState(false);
  const updateNotes = trpc.billing.updateNotes.useMutation();
  const utils = trpc.useUtils();

  const handleSave = async () => {
    try {
      await updateNotes.mutateAsync({
        serviceExternalId: service.externalId,
        notes: notes.trim(),
        author: user?.name || user?.email || "Team Member",
      });
      toast.success("Discovery notes saved");
      setIsEditing(false);
      utils.billing.unmatched.list.invalidate();
    } catch {
      toast.error("Failed to save notes");
    }
  };

  const hasExistingNotes = service.discoveryNotes && service.discoveryNotes.trim() !== "";

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 bg-muted/30 border-b border-border">
        <div className="flex items-center gap-2">
          <StickyNote className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Discovery Notes
          </span>
        </div>
        {hasExistingNotes && !isEditing && (
          <button
            onClick={() => setIsEditing(true)}
            className="text-xs text-primary hover:text-primary/80 transition-colors"
          >
            Edit
          </button>
        )}
      </div>
      <div className="p-3">
        {isEditing || !hasExistingNotes ? (
          <div className="space-y-2">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add notes about this service — e.g. investigation findings, who to contact, what action to take..."
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md outline-none focus:ring-2 focus:ring-ring resize-y min-h-[80px] transition-all"
              rows={3}
              autoFocus={isEditing}
            />
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-muted-foreground">
                Saved as {user?.name || user?.email || "Team Member"}
              </p>
              <div className="flex items-center gap-2">
                {isEditing && (
                  <button
                    onClick={() => {
                      setNotes(service.discoveryNotes || "");
                      setIsEditing(false);
                    }}
                    className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Cancel
                  </button>
                )}
                <button
                  onClick={handleSave}
                  disabled={updateNotes.isPending || (!notes.trim() && !hasExistingNotes)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {updateNotes.isPending ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Save className="w-3 h-3" />
                  )}
                  Save Notes
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-sm whitespace-pre-wrap">{service.discoveryNotes}</p>
            {service.notesAuthor && (
              <p className="text-[10px] text-muted-foreground mt-2">
                Last updated by {service.notesAuthor}
                {service.notesUpdatedAt && (
                  <> · {new Date(service.notesUpdatedAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}</>
                )}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ServiceStatusActions({ service }: { service: any }) {
  const updateStatus = trpc.billing.updateStatus.useMutation();
  const utils = trpc.useUtils();

  const handleStatusChange = async (newStatus: string) => {
    try {
      await updateStatus.mutateAsync({
        serviceExternalId: service.externalId,
        status: newStatus as any,
      });
      const labels: Record<string, string> = {
        flagged_for_termination: "Service flagged for termination",
        terminated: "Service marked as terminated",
        unmatched: "Service status reset to unmatched",
        active: "Service status reset to active",
      };
      toast.success(labels[newStatus] || "Status updated");
      utils.billing.unmatched.list.invalidate();
      utils.billing.summary.invalidate();
      utils.billing.customers.list.invalidate();
    } catch {
      toast.error("Failed to update status");
    }
  };

  const currentStatus = service.status;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {currentStatus !== "flagged_for_termination" && currentStatus !== "terminated" && (
        <button
          onClick={() => handleStatusChange("flagged_for_termination")}
          disabled={updateStatus.isPending}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-rose-200 text-rose-700 bg-rose-50 rounded-md hover:bg-rose-100 transition-colors disabled:opacity-50"
        >
          {updateStatus.isPending ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Flag className="w-3 h-3" />
          )}
          Flag for Termination
        </button>
      )}
      {currentStatus === "flagged_for_termination" && (
        <>
          <button
            onClick={() => handleStatusChange("terminated")}
            disabled={updateStatus.isPending}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-300 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors disabled:opacity-50"
          >
            {updateStatus.isPending ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Ban className="w-3 h-3" />
            )}
            Mark Terminated
          </button>
          <button
            onClick={() => handleStatusChange("unmatched")}
            disabled={updateStatus.isPending}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border text-muted-foreground rounded-md hover:bg-muted/50 transition-colors disabled:opacity-50"
          >
            Unflag
          </button>
        </>
      )}
      {currentStatus === "terminated" && (
        <button
          onClick={() => handleStatusChange("unmatched")}
          disabled={updateStatus.isPending}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border text-muted-foreground rounded-md hover:bg-muted/50 transition-colors disabled:opacity-50"
        >
          Undo Termination
        </button>
      )}
    </div>
  );
}

function FlagForReviewButton({ service }: { service: any }) {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const submitForReview = trpc.billing.review.submitForReview.useMutation();
  const [showDialog, setShowDialog] = useState(false);
  const [note, setNote] = useState("");

  const handleSubmit = async () => {
    if (!note.trim()) {
      toast.error("Please add a note describing why this service needs review");
      return;
    }
    try {
      await submitForReview.mutateAsync({
        targetType: "service",
        targetId: service.externalId,
        targetName: `${service.serviceType} — ${service.planName || service.externalId}${service.customerName ? " (" + service.customerName + ")" : ""}`,
        note: note.trim(),
      });
      toast.success("Service flagged for review");
      setShowDialog(false);
      setNote("");
      utils.billing.unmatched.list.invalidate();
    } catch {
      toast.error("Failed to flag for review");
    }
  };

  return (
    <>
      <button
        onClick={() => setShowDialog(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-amber-200 text-amber-700 bg-amber-50 rounded-md hover:bg-amber-100 transition-colors"
      >
        <ClipboardList className="w-3 h-3" />
        Flag for Review
      </button>
      {showDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowDialog(false)}>
          <div className="bg-card border border-border rounded-xl shadow-xl p-5 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-3">
              <ClipboardList className="w-4 h-4 text-amber-600" />
              <h3 className="text-sm font-semibold">Flag Service for Review</h3>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              <span className="font-medium text-foreground">{service.serviceType} — {service.planName || service.externalId}</span>
              {service.customerName && <span className="ml-1">· {service.customerName}</span>}
            </p>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Describe the issue or reason for review (e.g. cost mismatch, incorrect plan, needs investigation)..."
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md outline-none focus:ring-2 focus:ring-ring resize-y min-h-[90px] mb-3"
              autoFocus
            />
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => { setShowDialog(false); setNote(""); }}
                className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitForReview.isPending || !note.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium bg-amber-600 text-white rounded-md hover:bg-amber-700 transition-colors disabled:opacity-50"
              >
                {submitForReview.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <ClipboardList className="w-3 h-3" />}
                Submit for Review
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ServiceCard({
  service,
  onExpand,
  isExpanded,
}: {
  service: any;
  onExpand: (id: string) => void;
  isExpanded: boolean;
}) {
  const Icon = serviceTypeIcons[service.serviceType] || Wifi;
  const hasAvc = service.connectionId && service.connectionId.trim() !== "";
  const hasNotes = service.discoveryNotes && service.discoveryNotes.trim() !== "";
  const isFlagged = service.status === "flagged_for_termination";
  const isTerminated = service.status === "terminated";
  const noDataUse = service.noDataUse === 1;
  // Extract suggested customer name from discoveryNotes (SM Import or other sources)
  const suggestedName = (() => {
    if (!service.discoveryNotes) return null;
    const m = service.discoveryNotes.match(/SM Import[^:]*:\s*([^|\n]+)/i);
    return m ? m[1].trim() : null;
  })();

  return (
    <div
      className={`border rounded-lg transition-all ${
        isTerminated
          ? "border-gray-200 bg-gray-50/50 opacity-70"
          : isFlagged
          ? "border-rose-200 bg-rose-50/30"
          : noDataUse
          ? "border-orange-300 bg-orange-50/30"
          : isExpanded
          ? "border-primary/30 shadow-md bg-card"
          : "border-border bg-card hover:border-primary/20 hover:shadow-sm"
      }`}
    >
      <button
        onClick={() => onExpand(service.externalId)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
      >
        <div
          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
            isTerminated
              ? "bg-gray-100 text-gray-400"
              : isFlagged
              ? "bg-rose-50 text-rose-600"
              : service.serviceType === "Internet"
              ? "bg-blue-50 text-blue-600"
              : service.serviceType === "Mobile"
              ? "bg-violet-50 text-violet-600"
              : "bg-emerald-50 text-emerald-600"
          }`}
        >
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-sm font-medium truncate ${isTerminated ? "line-through text-muted-foreground" : ""}`}>
              {service.serviceType}
            </span>
            <span className="text-xs text-muted-foreground truncate">
              {service.planName || "Unknown Plan"}
            </span>
            {(isFlagged || isTerminated) && (
              <StatusBadge status={service.status} />
            )}
            {noDataUse && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full border border-orange-400 bg-orange-100 text-orange-800">
                <ZapOff className="w-2.5 h-2.5" />
                No Data Use
              </span>
            )}
            {suggestedName && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full border border-blue-300 bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-700 max-w-[160px]">
                <Tag className="w-2.5 h-2.5 shrink-0" />
                <span className="truncate">{suggestedName}</span>
              </span>
            )}
            <ProviderBadge provider={service.provider} size="xs" />
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            {service.phoneNumber && (
              <span className="text-xs font-mono text-muted-foreground">
                {service.phoneNumber}
              </span>
            )}
            {hasAvc ? (
              <span className="text-xs font-mono text-muted-foreground">
                {service.connectionId}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                <AlertTriangle className="w-3 h-3" />
                No AVC
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {hasNotes && (
            <span className="text-amber-600" title="Has discovery notes">
              <MessageSquare className="w-4 h-4" />
            </span>
          )}
          <div className="text-right">
            <p className={`text-sm font-mono font-medium ${isTerminated ? "text-muted-foreground line-through" : ""}`}>
              ${service.monthlyCost.toFixed(2)}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {service.supplierAccount}
            </p>
          </div>
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
          )}
        </div>
      </button>

      {isExpanded && <ExpandedPanel service={service} />}
    </div>
  );
}

function ExpandedPanel({ service }: { service: any }) {
  const { data: suggestions, isLoading } =
    trpc.billing.unmatched.suggestions.useQuery(
      { serviceId: service.externalId },
      { staleTime: 60000 }
    );
  const [customerSearch, setCustomerSearch] = useState("");
  const [showManualSearch, setShowManualSearch] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const debouncedCustomerSearch = useDebounce(customerSearch, 350);

  // Auto-open search and pre-fill with suggested name when panel opens
  useEffect(() => {
    if (smSuggestedName && !showManualSearch) {
      setShowManualSearch(true);
      setCustomerSearch(smSuggestedName);
    }
  // Only run on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const { data: searchResults } = trpc.billing.search.useQuery(
    { query: debouncedCustomerSearch },
    { enabled: debouncedCustomerSearch.length >= 2 }
  );
  const assignMutation = trpc.billing.unmatched.assign.useMutation();
  const dismissMutation = trpc.billing.unmatched.dismiss.useMutation();
  const bulkAssignMutation = trpc.billing.unmatched.bulkAssignByAddress.useMutation();
  const [assigningCustomerId, setAssigningCustomerId] = useState<string | null>(null);
  const [dismissingCustomerId, setDismissingCustomerId] = useState<string | null>(null);
  // Same-address bulk assign state
  const [bulkPrompt, setBulkPrompt] = useState<{
    customerExternalId: string;
    customerName: string;
    services: Array<{ externalId: string; serviceType: string; provider: string; planName: string; monthlyCost: number }>;
  } | null>(null);
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
  const [bulkApplying, setBulkApplying] = useState(false);
  const [showCreateCustomer, setShowCreateCustomer] = useState(false);
  const [createCustomerName, setCreateCustomerName] = useState("");
  const [createCustomerProposalMode, setCreateCustomerProposalMode] = useState(false);
  const utils = trpc.useUtils();

  // Extract SM Import suggestion name from discoveryNotes
  const smSuggestedName = (() => {
    if (!service.discoveryNotes) return null;
    const m = service.discoveryNotes.match(/SM Import[^:]*:\s*([^|\n]+)/i);
    return m ? m[1].trim() : null;
  })();

  // Fetch fuzzy customer suggestions for this service (only if it has an SM suggestion)
  const { data: smSuggestions, isLoading: smSuggestionsLoading } =
    trpc.billing.customers.suggestionsForService.useQuery(
      { serviceExternalId: service.externalId },
      { enabled: !!smSuggestedName, staleTime: 60000 }
    );

  useEffect(() => {
    if (showManualSearch && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [showManualSearch]);

  const invalidateAfterAssign = () => {
    utils.billing.unmatched.list.invalidate();
    utils.billing.summary.invalidate();
    utils.billing.customers.list.invalidate();
    utils.billing.margin.list.invalidate();
  };

  const handleAssign = async (customerExternalId: string, customerName?: string) => {
    setAssigningCustomerId(customerExternalId);
    try {
      await assignMutation.mutateAsync({
        serviceExternalId: service.externalId,
        customerExternalId,
      });
      toast.success("Service assigned to customer");
      invalidateAfterAssign();
      // Check for other unmatched services at the same address
      if (service.locationAddress && service.locationAddress.trim().length >= 5) {
        try {
          const sameAddr = await utils.billing.unmatched.sameAddress.fetch({
            serviceExternalId: service.externalId,
            address: service.locationAddress,
          });
          if (sameAddr && sameAddr.length > 0) {
            setBulkSelected(new Set(sameAddr.map((s: any) => s.externalId)));
            setBulkPrompt({
              customerExternalId,
              customerName: customerName || customerExternalId,
              services: sameAddr,
            });
          }
        } catch {
          // Silently ignore — bulk prompt is a convenience, not critical
        }
      }
    } catch {
      toast.error("Failed to assign service");
    } finally {
      setAssigningCustomerId(null);
    }
  };

  const handleBulkApply = async () => {
    if (!bulkPrompt || bulkSelected.size === 0) return;
    setBulkApplying(true);
    try {
      const result = await bulkAssignMutation.mutateAsync({
        serviceExternalIds: Array.from(bulkSelected),
        customerExternalId: bulkPrompt.customerExternalId,
      });
      toast.success(`${result.applied} additional service${result.applied !== 1 ? 's' : ''} assigned to ${bulkPrompt.customerName}`);
      if (result.errors.length > 0) toast.error(`${result.errors.length} failed to assign`);
      invalidateAfterAssign();
    } catch {
      toast.error("Bulk assign failed");
    } finally {
      setBulkApplying(false);
      setBulkPrompt(null);
    }
  };

  const handleDismiss = async (customerExternalId: string) => {
    setDismissingCustomerId(customerExternalId);
    try {
      await dismissMutation.mutateAsync({
        serviceExternalId: service.externalId,
        customerExternalId,
      });
      toast.success("Suggestion dismissed");
      utils.billing.unmatched.suggestions.invalidate({ serviceId: service.externalId });
    } catch {
      toast.error("Failed to dismiss suggestion");
    } finally {
      setDismissingCustomerId(null);
    }
  };

  const hasSuggestions = suggestions && suggestions.length > 0;
  const isTerminated = service.status === "terminated";

  return (
    <div className="border-t border-border px-4 py-4 space-y-4">
      {/* Same-address bulk assign dialog */}
      <Dialog open={!!bulkPrompt} onOpenChange={(open) => !open && setBulkPrompt(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary" />
              Match other services at this address?
            </DialogTitle>
            <DialogDescription>
              {bulkPrompt?.services.length} other unmatched service{bulkPrompt?.services.length !== 1 ? 's' : ''} share the same address. Assign them all to <strong>{bulkPrompt?.customerName}</strong>?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {bulkPrompt?.services.map((s) => (
              <label key={s.externalId} className="flex items-center gap-3 p-2.5 rounded-lg border border-border hover:bg-muted/40 cursor-pointer">
                <input
                  type="checkbox"
                  checked={bulkSelected.has(s.externalId)}
                  onChange={(e) => {
                    const next = new Set(bulkSelected);
                    if (e.target.checked) next.add(s.externalId); else next.delete(s.externalId);
                    setBulkSelected(next);
                  }}
                  className="rounded"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{s.serviceType} — {s.planName || s.provider}</p>
                  <p className="text-xs text-muted-foreground">${s.monthlyCost.toFixed(2)}/month · {s.provider}</p>
                </div>
              </label>
            ))}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setBulkPrompt(null)} disabled={bulkApplying}>
              Skip
            </Button>
            <Button onClick={handleBulkApply} disabled={bulkApplying || bulkSelected.size === 0}>
              {bulkApplying ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Users className="w-4 h-4 mr-2" />}
              Assign {bulkSelected.size} service{bulkSelected.size !== 1 ? 's' : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Service Details */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
        <div>
          <span className="text-muted-foreground">Account:</span>
          <span className="ml-2 font-mono">{service.supplierAccount}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Service ID:</span>
          <span className="ml-2 font-mono">{service.serviceId || "—"}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Phone:</span>
          <span className="ml-2 font-mono">{service.phoneNumber || "—"}</span>
        </div>
        <div>
          <span className="text-muted-foreground">AVC/Connection:</span>
          <span className="ml-2 font-mono">
            {service.connectionId || (
              <span className="text-amber-600">Missing — add below</span>
            )}
          </span>
        </div>
        {service.locationAddress && (
          <div className="col-span-2">
            <span className="text-muted-foreground">Address:</span>
            <span className="ml-2">{service.locationAddress}</span>
          </div>
        )}
      </div>

      {/* Status Actions */}
      <div className="border border-border rounded-lg p-3">
        <div className="flex items-center gap-2 mb-2">
          <Flag className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Service Status
          </span>
          <StatusBadge status={service.status} />
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <ServiceStatusActions service={service} />
          <FlagForReviewButton service={service} />
        </div>
      </div>
      {/* Discovery Notes */}
      <DiscoveryNotesEditor service={service} />

      {/* SM Import Suggestion Panel */}
      {smSuggestedName && !isTerminated && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-blue-600 shrink-0" />
            <span className="text-xs font-semibold text-blue-700 dark:text-blue-400">
              SM Import Suggestion
            </span>
            <span className="text-xs text-blue-600 dark:text-blue-300 font-medium ml-1">
              &ldquo;{smSuggestedName}&rdquo;
            </span>
          </div>
          {smSuggestionsLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Finding matching customers...
            </div>
          ) : smSuggestions && smSuggestions.length > 0 ? (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">Possible matches — select to assign:</p>
              {smSuggestions.map((s: any) => (
                <div
                  key={s.externalId}
                  className="flex items-center justify-between bg-white dark:bg-background rounded-md border border-blue-200 dark:border-blue-700 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{s.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.serviceCount} services &middot; {s.confidence}% match
                    </p>
                  </div>
                  <button
                    onClick={() => handleAssign(s.externalId, s.name)}
                    disabled={assignMutation.isPending}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 ml-2"
                  >
                    {assigningCustomerId === s.externalId ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <ArrowRight className="w-3 h-3" />
                    )}
                    Assign
                  </button>
                </div>
              ))}
              <button
                onClick={() => { setCreateCustomerName(smSuggestedName || ''); setCreateCustomerProposalMode(true); setShowCreateCustomer(true); }}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-700 rounded-md hover:bg-amber-50 dark:hover:bg-amber-900/30 transition-colors mt-1"
              >
                <Send className="w-3.5 h-3.5" />
                None match &mdash; Propose &ldquo;{smSuggestedName}&rdquo; as new customer
              </button>
            </div>
          ) : (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">No existing customers match this name.</p>
              <button
                onClick={() => { setCreateCustomerName(smSuggestedName || ''); setCreateCustomerProposalMode(true); setShowCreateCustomer(true); }}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-700 rounded-md hover:bg-amber-50 dark:hover:bg-amber-900/30 transition-colors"
              >
                <Send className="w-3.5 h-3.5" />
                Propose &ldquo;{smSuggestedName}&rdquo; as new customer
              </button>
            </div>
          )}
        </div>
      )}

      {/* Create Customer Dialog */}
      <CreateCustomerDialog
        open={showCreateCustomer}
        onOpenChange={(val) => { setShowCreateCustomer(val); if (!val) setCreateCustomerProposalMode(false); }}
        suggestedName={createCustomerName}
        serviceExternalId={createCustomerProposalMode ? service.externalId : undefined}
        onCreated={(externalId, name) => {
          handleAssign(externalId, name);
        }}
        onProposed={() => {
          setCreateCustomerProposalMode(false);
        }}
      />

      {/* Suggested Matches - hide for terminated services */}
      {!isTerminated && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Suggested Matches
          </h4>
          {isLoading ? (
            <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Analysing service data for matches...
            </div>
          ) : hasSuggestions ? (
            <div className="space-y-2">
              {suggestions.map((s: any, idx: number) => {
                const conf =
                  confidenceConfig[s.confidence as ConfidenceLevel] ||
                  confidenceConfig.none;
                const ConfIcon = conf.icon;
                return (
                  <div
                    key={idx}
                    className={`flex items-center gap-3 p-3 rounded-lg border ${conf.bg} transition-all`}
                  >
                    <ConfIcon className={`w-5 h-5 shrink-0 ${conf.color}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">
                          {s.customer.name}
                        </span>
                        <span
                          className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${conf.color} ${conf.bg}`}
                        >
                          {conf.label} Confidence
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {s.reason}
                      </p>
                      {s.missingInfo.length > 0 && (
                        <div className="flex items-center gap-1 mt-1">
                          <Info className="w-3 h-3 text-amber-600" />
                          <span className="text-[10px] text-amber-700">
                            Missing: {s.missingInfo.join(", ")} — provide to
                            increase confidence
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="shrink-0 flex items-center gap-1.5">
                      <button
                        onClick={() => handleDismiss(s.customer.externalId)}
                        disabled={dismissMutation.isPending}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium border border-border text-muted-foreground rounded-md hover:bg-muted/80 hover:text-foreground transition-colors disabled:opacity-50"
                        title="Dismiss this suggestion"
                      >
                        {dismissingCustomerId === s.customer.externalId ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <X className="w-3 h-3" />
                        )}
                        Dismiss
                      </button>
                      <button
                        onClick={() => handleAssign(s.customer.externalId, s.customer.name)}
                        disabled={assignMutation.isPending}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
                      >
                        {assigningCustomerId === s.customer.externalId ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <LinkIcon className="w-3 h-3" />
                        )}
                        Assign
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex items-center gap-2 py-3 px-3 bg-muted/50 rounded-lg text-sm text-muted-foreground">
              <ShieldQuestion className="w-4 h-4" />
              No automatic matches found. Use the search below to find and assign a customer.
            </div>
          )}
        </div>
      )}

      {/* Missing Info Prompt */}
      {!isTerminated && (!service.connectionId || !service.locationAddress) && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-medium text-amber-800">
                Additional information needed
              </p>
              <ul className="mt-1 space-y-0.5">
                {!service.connectionId && (
                  <li className="text-xs text-amber-700">
                    <AvcInlineEditor service={service} />
                  </li>
                )}
                {!service.locationAddress && (
                  <li className="text-xs text-amber-700">
                    Service address is missing — check Telstra portal
                  </li>
                )}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Assign to Customer Section - hide for terminated services */}
      {!isTerminated && (
        <div className="border border-border rounded-lg overflow-hidden">
          <button
            onClick={() => setShowManualSearch(!showManualSearch)}
            className={`w-full flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
              showManualSearch
                ? "bg-primary/5 text-primary border-b border-border"
                : "bg-muted/30 text-foreground hover:bg-muted/50"
            }`}
          >
            <UserPlus className="w-4 h-4" />
            <span>Find and assign a customer</span>
            <span className="text-xs text-muted-foreground ml-1">
              — search by name, phone, or AVC ID
            </span>
            <div className="flex-1" />
            {showManualSearch ? (
              <X className="w-4 h-4 text-muted-foreground" />
            ) : (
              <Search className="w-4 h-4 text-muted-foreground" />
            )}
          </button>

          {showManualSearch && (
            <div className="p-4 space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  placeholder="Type customer name, phone number, or AVC ID..."
                  className="w-full pl-9 pr-3 py-2.5 text-sm bg-background border border-border rounded-lg outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-all"
                />
                {customerSearch && (
                  <button
                    onClick={() => setCustomerSearch("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {customerSearch.length < 2 && (
                <p className="text-xs text-muted-foreground px-1">
                  Type at least 2 characters to search...
                </p>
              )}

              {searchResults && customerSearch.length >= 2 && (
                <>
                  {searchResults.customers.length > 0 ? (
                    <div className="border border-border rounded-lg divide-y divide-border max-h-64 overflow-y-auto">
                      {searchResults.customers.map((c: any) => (
                        <div
                          key={c.id}
                          className="flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors group"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">
                              {c.name}
                            </p>
                            <div className="flex items-center gap-3 mt-0.5">
                              <span className="text-xs text-muted-foreground">
                                {c.serviceCount} services
                              </span>
                              {c.billingPlatform && (
                                <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono">
                                  {c.billingPlatform}
                                </span>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={() => handleAssign(c.externalId, c.name)}
                            disabled={assignMutation.isPending}
                            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50 opacity-80 group-hover:opacity-100"
                          >
                            {assigningCustomerId === c.externalId ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <ArrowRight className="w-3 h-3" />
                            )}
                            Assign
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center py-6 text-muted-foreground gap-3">
                      <Search className="w-5 h-5 opacity-50" />
                      <div className="text-center">
                        <p className="text-sm">
                          No customers found for &ldquo;{customerSearch}&rdquo;
                        </p>
                        <p className="text-xs mt-1">
                          Try a different name, phone number, or AVC ID
                        </p>
                      </div>
                      <button
                        onClick={() => { setCreateCustomerName(customerSearch); setShowCreateCustomer(true); }}
                        className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-primary border border-primary/30 rounded-md hover:bg-primary/5 transition-colors"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        Create &ldquo;{customerSearch}&rdquo; as new customer
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AvcInlineEditor({ service }: { service: any }) {
  const [editing, setEditing] = useState(false);
  const [avcValue, setAvcValue] = useState("");
  const updateAvc = trpc.billing.updateAvc.useMutation();
  const utils = trpc.useUtils();

  const handleSave = async () => {
    if (!avcValue.trim()) return;
    try {
      await updateAvc.mutateAsync({
        serviceExternalId: service.externalId,
        connectionId: avcValue.trim(),
      });
      toast.success("AVC/Connection ID updated");
      setEditing(false);
      utils.billing.unmatched.list.invalidate();
      utils.billing.unmatched.suggestions.invalidate({
        serviceId: service.externalId,
      });
    } catch {
      toast.error("Failed to update AVC");
    }
  };

  if (editing) {
    return (
      <div className="flex items-center gap-2 mt-1">
        <input
          type="text"
          value={avcValue}
          onChange={(e) => setAvcValue(e.target.value)}
          placeholder="Enter AVC ID (e.g. AVC000068152861)"
          className="flex-1 px-2 py-1 text-xs font-mono bg-white border border-amber-300 rounded outline-none focus:ring-1 focus:ring-amber-400"
          autoFocus
        />
        <button
          onClick={handleSave}
          disabled={updateAvc.isPending}
          className="p-1 text-emerald-600 hover:text-emerald-700"
        >
          <Check className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => setEditing(false)}
          className="p-1 text-muted-foreground hover:text-foreground"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <span>
      AVC/Connection ID is missing —{" "}
      <button
        onClick={() => setEditing(true)}
        className="underline font-medium text-amber-800 hover:text-amber-900"
      >
        add it now
      </button>
    </span>
  );
}

export default function UnmatchedServices() {
  const { data: services, isLoading } =
    trpc.billing.unmatched.list.useQuery();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<
    "all" | "Internet" | "Mobile" | "Voice"
  >("all");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "unmatched" | "flagged_for_termination" | "terminated" | "no_data_use"
  >("all");
  const [providerFilter, setProviderFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"cost" | "type" | "account">("cost");

  const handleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  const allServices = services || [];

  // Provider counts (must be before early return to satisfy hooks rules)
  const providerCounts = useMemo(() => {
    return allServices.reduce(
      (acc: Record<string, number>, s: any) => {
        const p = s.provider || "Unknown";
        acc[p] = (acc[p] || 0) + 1;
        return acc;
      },
      {}
    );
  }, [allServices]);

  const providerList = useMemo(() => {
    return Object.entries(providerCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));
  }, [providerCounts]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Loading unmatched services...
          </p>
        </div>
      </div>
    );
  }

  // Apply type filter
  let filtered = typeFilter === "all"
    ? allServices
    : allServices.filter((s: any) => s.serviceType === typeFilter);

  // Apply status filter
  if (statusFilter === "no_data_use") {
    filtered = filtered.filter((s: any) => s.noDataUse === 1);
  } else if (statusFilter !== "all") {
    filtered = filtered.filter((s: any) => s.status === statusFilter);
  }

  // Apply provider filter
  if (providerFilter !== "all") {
    filtered = filtered.filter((s: any) => (s.provider || "Unknown") === providerFilter);
  }

  const sorted = [...filtered].sort((a: any, b: any) => {
    if (sortBy === "cost") return b.monthlyCost - a.monthlyCost;
    if (sortBy === "type") return a.serviceType.localeCompare(b.serviceType);
    return (a.supplierAccount || "").localeCompare(b.supplierAccount || "");
  });

  const totalCost = allServices.reduce(
    (sum: number, s: any) => sum + s.monthlyCost,
    0
  );
  const withAvc = allServices.filter(
    (s: any) => s.connectionId && s.connectionId.trim() !== ""
  ).length;
  const withoutAvc = allServices.length - withAvc;
  const withNotes = allServices.filter(
    (s: any) => s.discoveryNotes && s.discoveryNotes.trim() !== ""
  ).length;
  const flaggedCount = allServices.filter(
    (s: any) => s.status === "flagged_for_termination"
  ).length;
  const terminatedCount = allServices.filter(
    (s: any) => s.status === "terminated"
  ).length;
  const noDataUseCount = allServices.filter(
    (s: any) => s.noDataUse === 1
  ).length;

  const typeCounts = allServices.reduce(
    (acc: Record<string, number>, s: any) => {
      acc[s.serviceType] = (acc[s.serviceType] || 0) + 1;
      return acc;
    },
    {}
  );

  return (
    <div className="p-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-lg font-bold tracking-tight">
            Unmatched Services
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {allServices.length} services not yet linked to a customer. Expand
            each to see suggested matches, add notes, or flag for termination.
          </p>
        </div>
        <button
          onClick={() => exportToCSV(
            sorted.map((s: any) => ({
              "Service ID": s.externalId,
              "Service Type": s.serviceType,
              "Provider": s.provider,
              "Plan": s.planName,
              "Phone/Connection": s.phoneNumber || s.connectionId || "",
              "Monthly Cost": s.monthlyCost,
              "Status": s.status,
              "Discovery Notes": s.discoveryNotes || "",
            })),
            "unmatched-services"
          )}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-card border border-border rounded-md hover:bg-muted transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          Export CSV
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            Unmatched
          </p>
          <p className="text-2xl font-bold mt-1 text-rose-600">
            {allServices.length}
          </p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            Monthly Cost (ex GST)
          </p>
          <p className="text-2xl font-bold font-mono mt-1">
            ${totalCost.toFixed(2)}
          </p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            Flagged
          </p>
          <p className={`text-2xl font-bold mt-1 ${flaggedCount > 0 ? "text-rose-600" : "text-muted-foreground"}`}>
            {flaggedCount}
          </p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            With Notes
          </p>
          <p className={`text-2xl font-bold mt-1 ${withNotes > 0 ? "text-amber-600" : "text-muted-foreground"}`}>
            {withNotes}
          </p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            Missing AVC
          </p>
          <p className="text-2xl font-bold mt-1 text-amber-600">
            {withoutAvc}
          </p>
        </div>
        <div className="bg-card border border-orange-300 rounded-lg p-4">
          <p className="text-[10px] uppercase tracking-wider text-orange-700 font-semibold">
            No Data Use
          </p>
          <p className={`text-2xl font-bold mt-1 ${noDataUseCount > 0 ? "text-orange-600" : "text-muted-foreground"}`}>
            {noDataUseCount}
          </p>
        </div>
      </div>

      {/* Filters & Sort */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        {/* Type filter */}
        <div className="flex items-center gap-1 bg-muted/50 rounded-md p-0.5">
          {(["all", "Internet", "Mobile", "Voice"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setTypeFilter(f)}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                typeFilter === f
                  ? "bg-background shadow-sm font-medium"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {f === "all" ? "All Types" : f}
              {f !== "all" && typeCounts[f] ? ` (${typeCounts[f]})` : ""}
            </button>
          ))}
        </div>

        {/* Status filter */}
        <div className="flex items-center gap-1 bg-muted/50 rounded-md p-0.5">
          {([
            { value: "all", label: "All", count: allServices.length },
            { value: "unmatched", label: "Unmatched", count: allServices.filter((s: any) => s.status === "unmatched").length },
            { value: "flagged_for_termination", label: "Flagged", count: flaggedCount },
            { value: "terminated", label: "Terminated", count: terminatedCount },
            { value: "no_data_use", label: "No Data Use", count: noDataUseCount },
          ] as const).map((f) => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value as any)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-colors ${
                statusFilter === f.value
                  ? "bg-background shadow-sm font-medium"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.label}
              <span className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-semibold rounded-full ${
                statusFilter === f.value
                  ? f.value === "flagged_for_termination" ? "bg-rose-100 text-rose-700"
                    : f.value === "terminated" ? "bg-gray-200 text-gray-600"
                    : f.value === "no_data_use" ? "bg-orange-200 text-orange-800"
                    : "bg-primary/10 text-primary"
                  : "bg-muted text-muted-foreground"
              }`}>
                {f.count}
              </span>
            </button>
          ))}
        </div>

        {/* Provider filter */}
        {providerList.length > 1 && (
          <div className="flex items-center gap-1 bg-muted/50 rounded-md p-0.5">
            <button
              onClick={() => setProviderFilter("all")}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                providerFilter === "all"
                  ? "bg-background shadow-sm font-medium"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              All Providers
            </button>
            {providerList.map((p) => (
              <button
                key={p.name}
                onClick={() => setProviderFilter(p.name)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-colors ${
                  providerFilter === p.name
                    ? "bg-background shadow-sm font-medium"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <ProviderBadge provider={p.name} size="xs" showLabel={true} />
                <span className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-semibold rounded-full ${
                  providerFilter === p.name
                    ? "bg-primary/10 text-primary"
                    : "bg-muted text-muted-foreground"
                }`}>
                  {p.count}
                </span>
              </button>
            ))}
          </div>
        )}

        <div className="flex-1" />
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as any)}
          className="text-xs bg-muted/50 border border-border rounded-md px-2 py-1.5 outline-none"
        >
          <option value="cost">Sort by Cost</option>
          <option value="type">Sort by Type</option>
          <option value="account">Sort by Account</option>
        </select>
      </div>

      {/* Results count */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-muted-foreground">
          Showing {sorted.length} of {allServices.length} services
        </p>
      </div>

      {/* Service List */}
      <div className="space-y-2">
        {sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Check className="w-8 h-8 mb-3 text-emerald-500" />
            <p className="text-sm font-medium">
              {statusFilter !== "all" || typeFilter !== "all"
                ? "No services match the current filters"
                : "All services have been matched!"}
            </p>
          </div>
        ) : (
          sorted.map((service: any) => (
            <ServiceCard
              key={service.externalId}
              service={service}
              onExpand={handleExpand}
              isExpanded={expandedId === service.externalId}
            />
          ))
        )}
      </div>
    </div>
  );
}
