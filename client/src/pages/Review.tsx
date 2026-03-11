import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  AlertTriangle,
  AlertCircle,
  Info,
  ChevronDown,
  ChevronRight,
  DollarSign,
  Ban,
  CheckCircle2,
  Plus,
  Eye,
  EyeOff,
  Flag,
  MessageSquare,
  Clock,
  TrendingDown,
  TrendingUp,
  Zap,
  FileWarning,
  Users,
  Wifi,
  Phone,
  Search,
  X,
  Loader2,
  ArrowRightLeft,
  UserX,
  Link2,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ReviewIssue {
  id: string;
  type: string;
  severity: "critical" | "warning" | "info";
  title: string;
  description: string;
  count: number;
  financialImpact?: number;
  items: any[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number | undefined | null): string {
  if (n == null) return "$0.00";
  return "$" + Math.abs(n).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function SeverityIcon({ severity }: { severity: string }) {
  if (severity === "critical") return <AlertCircle className="w-5 h-5 text-red-500" />;
  if (severity === "warning") return <AlertTriangle className="w-5 h-5 text-amber-500" />;
  return <Info className="w-5 h-5 text-blue-500" />;
}

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    critical: "bg-red-100 text-red-700 border-red-200",
    warning: "bg-amber-100 text-amber-700 border-amber-200",
    info: "bg-blue-100 text-blue-700 border-blue-200",
  };
  return (
    <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full border ${colors[severity] || colors.info}`}>
      {severity}
    </span>
  );
}

// ─── Note Dialog ─────────────────────────────────────────────────────────────

function NoteDialog({
  open,
  onClose,
  onSubmit,
  title,
  description,
  submitLabel,
  submitVariant = "default",
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (note: string) => void;
  title: string;
  description: string;
  submitLabel: string;
  submitVariant?: "default" | "destructive" | "outline";
  loading?: boolean;
}) {
  const [note, setNote] = useState("");

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative bg-card border border-border rounded-lg shadow-2xl w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold">{title}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-sm text-muted-foreground mb-4">{description}</p>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Enter your note (required)..."
          rows={3}
          className="w-full px-3 py-2 text-sm bg-muted/50 border border-border rounded-md outline-none focus:ring-2 focus:ring-ring resize-none"
        />
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={submitVariant}
            size="sm"
            disabled={!note.trim() || loading}
            onClick={() => {
              onSubmit(note.trim());
              setNote("");
            }}
          >
            {loading && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
            {submitLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Submit for Review Dialog ────────────────────────────────────────────────

function SubmitForReviewDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [targetType, setTargetType] = useState<"service" | "customer">("service");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [selectedName, setSelectedName] = useState("");
  const [note, setNote] = useState("");
  const utils = trpc.useUtils();

  const submitMutation = trpc.billing.review.submitForReview.useMutation({
    onSuccess: () => {
      toast.success("Item submitted for review");
      utils.billing.review.manualItems.invalidate();
      setSearchQuery("");
      setSelectedId("");
      setSelectedName("");
      setNote("");
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  // Search for customers or services
  const customerSearch = trpc.billing.customers.list.useQuery(
    { search: searchQuery },
    { enabled: targetType === "customer" && searchQuery.length >= 2 }
  );
  const serviceSearch = trpc.billing.search.useQuery(
    { query: searchQuery },
    { enabled: targetType === "service" && searchQuery.length >= 2 }
  );

  if (!open) return null;

  const customerResults = (customerSearch.data as any)?.customers || customerSearch.data || [];
  const serviceResults = (serviceSearch.data as any)?.services || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative bg-card border border-border rounded-lg shadow-2xl w-full max-w-lg p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Submit for Review
          </h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Target type selector */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => { setTargetType("service"); setSearchQuery(""); setSelectedId(""); setSelectedName(""); }}
            className={`flex-1 text-sm py-2 rounded-md border transition-colors ${
              targetType === "service" ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"
            }`}
          >
            Service
          </button>
          <button
            onClick={() => { setTargetType("customer"); setSearchQuery(""); setSelectedId(""); setSelectedName(""); }}
            className={`flex-1 text-sm py-2 rounded-md border transition-colors ${
              targetType === "customer" ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"
            }`}
          >
            Customer
          </button>
        </div>

        {/* Search */}
        {!selectedId && (
          <>
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={`Search ${targetType}s by name, phone, AVC...`}
                className="w-full pl-10 pr-4 py-2 text-sm bg-muted/50 border border-border rounded-md outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            {searchQuery.length >= 2 && (
              <div className="max-h-40 overflow-y-auto border border-border rounded-md mb-4">
                {targetType === "customer" && customerResults.map((c: any) => (
                  <button
                    key={c.externalId}
                    onClick={() => { setSelectedId(c.externalId); setSelectedName(c.name); }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors border-b border-border last:border-0"
                  >
                    <span className="font-medium">{c.name}</span>
                    <span className="text-muted-foreground ml-2">{c.externalId}</span>
                  </button>
                ))}
                {targetType === "service" && serviceResults.map((s: any) => (
                  <button
                    key={s.externalId}
                    onClick={() => { setSelectedId(s.externalId); setSelectedName(s.customerName || s.planName || s.externalId); }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors border-b border-border last:border-0"
                  >
                    <span className="font-medium">{s.customerName || s.planName || "Unknown"}</span>
                    <span className="text-muted-foreground ml-2">{s.externalId} · {s.serviceType}</span>
                  </button>
                ))}
                {((targetType === "customer" && customerResults.length === 0) ||
                  (targetType === "service" && serviceResults.length === 0)) && (
                  <p className="px-3 py-3 text-sm text-muted-foreground text-center">No results found</p>
                )}
              </div>
            )}
          </>
        )}

        {/* Selected item */}
        {selectedId && (
          <div className="flex items-center gap-2 px-3 py-2 bg-primary/10 border border-primary/20 rounded-md mb-4">
            {targetType === "service" ? <Wifi className="w-4 h-4 text-primary" /> : <Users className="w-4 h-4 text-primary" />}
            <span className="text-sm font-medium flex-1">{selectedName}</span>
            <span className="text-xs text-muted-foreground">{selectedId}</span>
            <button onClick={() => { setSelectedId(""); setSelectedName(""); }} className="text-muted-foreground hover:text-foreground">
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* Note */}
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Describe the issue or reason for review (required)..."
          rows={3}
          className="w-full px-3 py-2 text-sm bg-muted/50 border border-border rounded-md outline-none focus:ring-2 focus:ring-ring resize-none mb-4"
        />

        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            disabled={!selectedId || !note.trim() || submitMutation.isPending}
            onClick={() => submitMutation.mutate({ targetType, targetId: selectedId, targetName: selectedName, note: note.trim() })}
          >
            {submitMutation.isPending && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
            Submit for Review
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Reassign Service Dialog ─────────────────────────────────────────────────

function ReassignServiceDialog({
  open,
  onClose,
  serviceExternalId,
  currentCustomerName,
}: {
  open: boolean;
  onClose: () => void;
  serviceExternalId: string;
  currentCustomerName?: string;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<{ externalId: string; name: string } | null>(null);
  const [markUnknown, setMarkUnknown] = useState(false);
  const [reason, setReason] = useState("");
  const utils = trpc.useUtils();

  const reassignMutation = trpc.billing.reassignService.useMutation({
    onSuccess: (result) => {
      toast.success(`Service ${result.serviceExternalId} reassigned to ${result.newCustomerName || 'Unknown'}`);
      utils.billing.review.issues.invalidate();
      setSearchQuery("");
      setSelectedCustomer(null);
      setMarkUnknown(false);
      setReason("");
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  const customerSearch = trpc.billing.customers.list.useQuery(
    { search: searchQuery },
    { enabled: searchQuery.length >= 2 && !markUnknown }
  );

  if (!open) return null;

  const customerResults = (customerSearch.data as any)?.customers || customerSearch.data || [];

  const canSubmit = reason.trim().length > 0 && (markUnknown || selectedCustomer !== null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative bg-card border border-border rounded-lg shadow-2xl w-full max-w-lg p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold flex items-center gap-2">
            <ArrowRightLeft className="w-4 h-4" />
            Reassign Service
          </h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="text-xs text-muted-foreground mb-4 px-3 py-2 bg-muted/50 rounded-md">
          Service: <span className="font-mono font-medium">{serviceExternalId}</span>
          {currentCustomerName && (
            <span className="ml-2">· Currently: <span className="font-medium">{currentCustomerName}</span></span>
          )}
        </div>

        {/* Mark as Unknown toggle */}
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => { setMarkUnknown(false); setSelectedCustomer(null); }}
            className={`flex-1 flex items-center justify-center gap-2 text-sm py-2 rounded-md border transition-colors ${
              !markUnknown ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"
            }`}
          >
            <Search className="w-3.5 h-3.5" />
            Reassign to Customer
          </button>
          <button
            onClick={() => { setMarkUnknown(true); setSelectedCustomer(null); setSearchQuery(""); }}
            className={`flex-1 flex items-center justify-center gap-2 text-sm py-2 rounded-md border transition-colors ${
              markUnknown ? "bg-amber-500 text-white border-amber-500" : "border-border hover:bg-muted"
            }`}
          >
            <UserX className="w-3.5 h-3.5" />
            Mark as Unknown
          </button>
        </div>

        {/* Customer search */}
        {!markUnknown && (
          <>
            {!selectedCustomer ? (
              <>
                <div className="relative mb-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search customers by name..."
                    className="w-full pl-10 pr-4 py-2 text-sm bg-muted/50 border border-border rounded-md outline-none focus:ring-2 focus:ring-ring"
                    autoFocus
                  />
                </div>
                {searchQuery.length >= 2 && (
                  <div className="max-h-40 overflow-y-auto border border-border rounded-md mb-4">
                    {customerResults.map((c: any) => (
                      <button
                        key={c.externalId}
                        onClick={() => { setSelectedCustomer({ externalId: c.externalId, name: c.name }); setSearchQuery(""); }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors border-b border-border last:border-0"
                      >
                        <span className="font-medium">{c.name}</span>
                        <span className="text-muted-foreground ml-2 text-xs">{c.externalId}</span>
                      </button>
                    ))}
                    {customerResults.length === 0 && (
                      <p className="px-3 py-3 text-sm text-muted-foreground text-center">No customers found</p>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center gap-2 px-3 py-2 bg-primary/10 border border-primary/20 rounded-md mb-4">
                <Users className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium flex-1">{selectedCustomer.name}</span>
                <span className="text-xs text-muted-foreground">{selectedCustomer.externalId}</span>
                <button onClick={() => setSelectedCustomer(null)} className="text-muted-foreground hover:text-foreground">
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
          </>
        )}

        {markUnknown && (
          <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-md mb-4">
            <UserX className="w-4 h-4 text-amber-600" />
            <span className="text-sm text-amber-700">Service will be marked as unassigned/unknown</span>
          </div>
        )}

        {/* Reason */}
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason for reassignment (required)..."
          rows={3}
          className="w-full px-3 py-2 text-sm bg-muted/50 border border-border rounded-md outline-none focus:ring-2 focus:ring-ring resize-none mb-4"
        />

        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            disabled={!canSubmit || reassignMutation.isPending}
            onClick={() => reassignMutation.mutate({
              serviceExternalId,
              newCustomerExternalId: markUnknown ? null : selectedCustomer?.externalId ?? null,
              newCustomerName: markUnknown ? null : selectedCustomer?.name ?? null,
              reason: reason.trim(),
            })}
          >
            {reassignMutation.isPending && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
            {markUnknown ? 'Mark as Unknown' : 'Reassign Service'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Associate Billing Item Dialog ────────────────────────────────────────────

function AssociateBillingDialog({
  open,
  onClose,
  billingItemId,
  billingContactName,
  billingDescription,
}: {
  open: boolean;
  onClose: () => void;
  billingItemId: number;
  billingContactName: string;
  billingDescription: string;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<{ externalId: string; name: string } | null>(null);
  const utils = trpc.useUtils();

  const associateMutation = trpc.billing.associateBillingItem.useMutation({
    onSuccess: () => {
      toast.success('Billing item associated with customer');
      utils.billing.review.issues.invalidate();
      setSearchQuery("");
      setSelectedCustomer(null);
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  const customerSearch = trpc.billing.customers.list.useQuery(
    { search: searchQuery },
    { enabled: searchQuery.length >= 2 }
  );

  if (!open) return null;

  const customerResults = (customerSearch.data as any)?.customers || customerSearch.data || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative bg-card border border-border rounded-lg shadow-2xl w-full max-w-lg p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold flex items-center gap-2">
            <Link2 className="w-4 h-4" />
            Associate Billing Item
          </h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="text-xs text-muted-foreground mb-4 px-3 py-2 bg-muted/50 rounded-md space-y-1">
          <p><span className="font-medium">Contact:</span> {billingContactName}</p>
          <p className="truncate"><span className="font-medium">Item:</span> {billingDescription}</p>
        </div>

        {/* Customer search */}
        {!selectedCustomer ? (
          <>
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search customers by name..."
                className="w-full pl-10 pr-4 py-2 text-sm bg-muted/50 border border-border rounded-md outline-none focus:ring-2 focus:ring-ring"
                autoFocus
              />
            </div>
            {searchQuery.length >= 2 && (
              <div className="max-h-40 overflow-y-auto border border-border rounded-md mb-4">
                {customerResults.map((c: any) => (
                  <button
                    key={c.externalId}
                    onClick={() => { setSelectedCustomer({ externalId: c.externalId, name: c.name }); setSearchQuery(""); }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors border-b border-border last:border-0"
                  >
                    <span className="font-medium">{c.name}</span>
                    <span className="text-muted-foreground ml-2 text-xs">{c.externalId}</span>
                  </button>
                ))}
                {customerResults.length === 0 && (
                  <p className="px-3 py-3 text-sm text-muted-foreground text-center">No customers found</p>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="flex items-center gap-2 px-3 py-2 bg-primary/10 border border-primary/20 rounded-md mb-4">
            <Users className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium flex-1">{selectedCustomer.name}</span>
            <span className="text-xs text-muted-foreground">{selectedCustomer.externalId}</span>
            <button onClick={() => setSelectedCustomer(null)} className="text-muted-foreground hover:text-foreground">
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            disabled={!selectedCustomer || associateMutation.isPending}
            onClick={() => associateMutation.mutate({
              billingItemId,
              customerExternalId: selectedCustomer?.externalId ?? null,
              customerName: selectedCustomer?.name ?? null,
              serviceExternalId: null,
            })}
          >
            {associateMutation.isPending && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
            Associate with Customer
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Issue Card ──────────────────────────────────────────────────────────────

function IssueCard({
  issue,
  ignoredIds,
  onIgnore,
  onResolve,
  onFlag,
}: {
  issue: ReviewIssue;
  ignoredIds: Set<string>;
  onIgnore: (targetId: string, targetName: string) => void;
  onResolve: (targetId: string) => void;
  onFlag: (targetId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const visibleItems = issue.items.filter((item: any) => {
    const itemId = item.serviceExternalId || item.customerExternalId || item.externalId || String(item.id);
    return !ignoredIds.has(`${issue.type}:${itemId}`);
  });

  const displayItems = showAll ? visibleItems : visibleItems.slice(0, 10);
  const activeCount = visibleItems.length;

  return (
    <div className="border border-border rounded-lg bg-card overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-5 py-4 hover:bg-muted/30 transition-colors text-left"
      >
        <SeverityIcon severity={issue.severity} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <h3 className="text-sm font-semibold">{issue.title}</h3>
            <SeverityBadge severity={issue.severity} />
          </div>
          <p className="text-xs text-muted-foreground line-clamp-1">{issue.description}</p>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          {issue.financialImpact != null && issue.financialImpact > 0 && (
            <div className="text-right">
              <p className={`text-sm font-mono font-semibold ${issue.severity === "critical" ? "text-red-600" : "text-amber-600"}`}>
                {fmt(issue.financialImpact)}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {issue.type.includes("margin") || issue.type.includes("cost") ? "monthly impact" : "at risk"}
              </p>
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className={`text-lg font-bold font-mono ${issue.severity === "critical" ? "text-red-600" : issue.severity === "warning" ? "text-amber-600" : "text-blue-600"}`}>
              {activeCount}
            </span>
            {expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
          </div>
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-border">
          {/* Special rendering for missing-info type */}
          {issue.type === "missing-info" ? (
            <div className="p-4 space-y-2">
              {issue.items.map((item: any, idx: number) => (
                <div key={idx} className="flex items-center gap-3 px-4 py-3 bg-muted/30 rounded-md">
                  <SeverityIcon severity={item.severity} />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{item.field}</p>
                    <p className="text-xs text-muted-foreground">{item.description}</p>
                  </div>
                  <span className="text-lg font-bold font-mono text-amber-600">{item.count}</span>
                </div>
              ))}
            </div>
          ) : issue.type === "customer-only-billing" ? (
            <div className="p-4">
              <div className="flex items-center gap-3 px-4 py-3 bg-blue-50 rounded-md border border-blue-100">
                <Info className="w-5 h-5 text-blue-500" />
                <div className="flex-1">
                  <p className="text-sm font-medium">
                    {issue.count.toLocaleString()} billing items matched to customer but not to a specific service
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Revenue of {fmt(issue.financialImpact)} cannot be attributed to individual services for margin calculation.
                    Use the <Link href="/billing" className="text-primary underline">Billing Match</Link> page to assign these to specific services.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {displayItems.map((item: any, idx: number) => (
                <IssueItemRow
                  key={idx}
                  issue={issue}
                  item={item}
                  onIgnore={onIgnore}
                  onResolve={onResolve}
                  onFlag={onFlag}
                />
              ))}
              {visibleItems.length > 10 && !showAll && (
                <div className="px-5 py-3 text-center">
                  <button onClick={() => setShowAll(true)} className="text-sm text-primary hover:underline">
                    Show all {visibleItems.length} items
                  </button>
                </div>
              )}
              {visibleItems.length === 0 && (
                <div className="px-5 py-6 text-center text-sm text-muted-foreground">
                  <CheckCircle2 className="w-5 h-5 mx-auto mb-2 text-green-500" />
                  All items have been reviewed
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Issue Item Row ──────────────────────────────────────────────────────────

function IssueItemRow({
  issue,
  item,
  onIgnore,
  onResolve,
  onFlag,
}: {
  issue: ReviewIssue;
  item: any;
  onIgnore: (targetId: string, targetName: string) => void;
  onResolve: (targetId: string) => void;
  onFlag: (targetId: string) => void;
}) {
  const itemId = item.serviceExternalId || item.customerExternalId || item.externalId || String(item.id);
  const itemName = item.customerName || item.contactName || item.billingContactName || item.targetName || itemId;

  // Render based on issue type
  if (issue.type === "double-billed") {
    return (
      <div className="px-5 py-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Link href={`/services/${item.serviceExternalId}`} className="text-sm font-medium text-primary hover:underline">
              {item.serviceExternalId}
            </Link>
            {item.service && (
              <span className="text-xs text-muted-foreground">
                {item.service.customerName} · {item.service.planName}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-mono font-semibold text-red-600">{item.billingItemCount} items · {fmt(item.totalBilled)}</span>
            <ItemActions itemId={item.serviceExternalId} itemName={itemName} onIgnore={onIgnore} onResolve={onResolve} onFlag={onFlag} />
          </div>
        </div>
        <div className="space-y-1 ml-4">
          {item.billingItems?.slice(0, 5).map((bi: any, idx: number) => (
            <div key={idx} className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="w-1 h-1 rounded-full bg-muted-foreground shrink-0" />
              <span className="flex-1 truncate">{bi.description}</span>
              <span className="font-mono">{fmt(bi.lineAmount)}</span>
            </div>
          ))}
          {item.billingItems?.length > 5 && (
            <p className="text-xs text-muted-foreground ml-3">+{item.billingItems.length - 5} more</p>
          )}
        </div>
      </div>
    );
  }

  if (issue.type === "unbilled-services") {
    return (
      <div className="flex items-center gap-3 px-5 py-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Link href={`/services/${item.externalId}`} className="text-sm font-medium text-primary hover:underline">
              {item.externalId}
            </Link>
            <span className="text-xs px-1.5 py-0.5 rounded bg-muted">{item.serviceType}</span>
            {item.provider && <span className="text-xs text-muted-foreground">{item.provider}</span>}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {item.customerName || "Unassigned"} · {item.planName || "No plan"}
          </p>
        </div>
        <span className="text-sm font-mono font-semibold text-red-600">{fmt(item.monthlyCost)}/mo</span>
        <ItemActions itemId={item.externalId} itemName={itemName} onIgnore={onIgnore} onResolve={onResolve} onFlag={onFlag} />
      </div>
    );
  }

  if (issue.type === "billing-no-service") {
    return (
      <div className="flex items-center gap-3 px-5 py-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{item.contactName}</p>
          <p className="text-xs text-muted-foreground truncate">{item.description}</p>
        </div>
        <span className="text-xs px-1.5 py-0.5 rounded bg-muted">{item.category}</span>
        <span className="text-sm font-mono font-semibold text-amber-600">{fmt(item.lineAmount)}</span>
        <ItemActions itemId={String(item.id)} itemName={item.contactName} onIgnore={onIgnore} onResolve={onResolve} onFlag={onFlag} />
      </div>
    );
  }

  if (issue.type === "multi-service-site") {
    return (
      <div className="px-5 py-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Link href={`/customers/${item.customerExternalId}`} className="text-sm font-medium text-primary hover:underline">
              {item.customerName}
            </Link>
            <span className="text-xs text-muted-foreground">{item.siteAddress}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-mono">{item.serviceCount} services · {fmt(item.totalCost)}/mo</span>
            <ItemActions itemId={item.customerExternalId} itemName={item.customerName} onIgnore={onIgnore} onResolve={onResolve} onFlag={onFlag} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-1 ml-4">
          {item.services?.slice(0, 6).map((svc: any, idx: number) => (
            <div key={idx} className="flex items-center gap-1 text-xs text-muted-foreground">
              <span className="w-1 h-1 rounded-full bg-muted-foreground shrink-0" />
              <span className="truncate">{svc.serviceType} · {svc.planName || svc.phoneNumber || svc.connectionId}</span>
              <span className="font-mono shrink-0">{fmt(svc.monthlyCost)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (issue.type === "name-discrepancy") {
    return (
      <div className="flex items-center gap-3 px-5 py-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium text-red-600 line-through">{item.billingContactName}</span>
            <ChevronRight className="w-3 h-3 text-muted-foreground" />
            <span className="font-medium text-green-600">{item.customerName}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{item.billingItemCount} billing items · {fmt(item.totalRevenue)}</p>
        </div>
        <ItemActions itemId={item.customerExternalId} itemName={item.customerName} onIgnore={onIgnore} onResolve={onResolve} onFlag={onFlag} />
      </div>
    );
  }

  // Margin-related items (negative, low, high)
  if (issue.type.includes("margin") || issue.type === "no-data-cost") {
    const marginColor = (item.marginPercent ?? 0) < 0 ? "text-red-600" : (item.marginPercent ?? 0) < 20 ? "text-amber-600" : "text-green-600";
    return (
      <div className="flex items-center gap-3 px-5 py-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Link href={`/services/${item.externalId}`} className="text-sm font-medium text-primary hover:underline">
              {item.externalId}
            </Link>
            <span className="text-xs px-1.5 py-0.5 rounded bg-muted">{item.serviceType}</span>
            {item.provider && <span className="text-xs text-muted-foreground">{item.provider}</span>}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{item.customerName || "Unassigned"}</p>
        </div>
        <div className="text-right shrink-0">
          <div className="flex items-center gap-3 text-xs">
            <span className="text-muted-foreground">Cost: <span className="font-mono">{fmt(item.monthlyCost)}</span></span>
            {item.monthlyRevenue != null && (
              <span className="text-muted-foreground">Rev: <span className="font-mono">{fmt(item.monthlyRevenue)}</span></span>
            )}
            {item.marginPercent != null && (
              <span className={`font-mono font-semibold ${marginColor}`}>{item.marginPercent.toFixed(1)}%</span>
            )}
          </div>
        </div>
        <ItemActions itemId={item.externalId} itemName={itemName} onIgnore={onIgnore} onResolve={onResolve} onFlag={onFlag} />
      </div>
    );
  }

  // Contract expiry items
  if (issue.type.includes("contract")) {
    return (
      <div className="flex items-center gap-3 px-5 py-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Link href={`/services/${item.externalId}`} className="text-sm font-medium text-primary hover:underline">
              {item.externalId}
            </Link>
            <span className="text-xs px-1.5 py-0.5 rounded bg-muted">{item.serviceType}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{item.customerName || "Unassigned"}</p>
        </div>
        <div className="text-right shrink-0">
          <p className={`text-sm font-mono font-semibold ${item.contractStatus === "expired" ? "text-red-600" : "text-amber-600"}`}>
            {item.contractEndDateFormatted}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {item.daysUntilExpiry != null
              ? item.daysUntilExpiry < 0
                ? `Expired ${Math.abs(item.daysUntilExpiry)} days ago`
                : `${item.daysUntilExpiry} days remaining`
              : ""}
          </p>
        </div>
        <ItemActions itemId={item.externalId} itemName={itemName} onIgnore={onIgnore} onResolve={onResolve} onFlag={onFlag} />
      </div>
    );
  }

  // Fallback
  return (
    <div className="flex items-center gap-3 px-5 py-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{itemName}</p>
        <p className="text-xs text-muted-foreground">{itemId}</p>
      </div>
      <ItemActions itemId={itemId} itemName={itemName} onIgnore={onIgnore} onResolve={onResolve} onFlag={onFlag} />
    </div>
  );
}

// ─── Item Actions ────────────────────────────────────────────────────────────

function ItemActions({
  itemId,
  itemName,
  onIgnore,
  onResolve,
  onFlag,
}: {
  itemId: string;
  itemName: string;
  onIgnore: (id: string, name: string) => void;
  onResolve: (id: string) => void;
  onFlag: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-1 shrink-0">
      <button
        onClick={(e) => { e.stopPropagation(); onResolve(itemId); }}
        title="Mark as reviewed"
        className="p-1.5 rounded hover:bg-green-100 text-muted-foreground hover:text-green-600 transition-colors"
      >
        <CheckCircle2 className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onIgnore(itemId, itemName); }}
        title="Ignore this issue"
        className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
      >
        <EyeOff className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onFlag(itemId); }}
        title="Flag for termination"
        className="p-1.5 rounded hover:bg-red-100 text-muted-foreground hover:text-red-600 transition-colors"
      >
        <Flag className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ─── Manual Review Items Section ─────────────────────────────────────────────

function ManualReviewSection() {
  const { data: manualItems, isLoading } = trpc.billing.review.manualItems.useQuery();
  const resolveMutation = trpc.billing.review.resolveManual.useMutation({
    onSuccess: () => {
      toast.success("Item resolved");
      utils.billing.review.manualItems.invalidate();
    },
  });
  const utils = trpc.useUtils();
  const [resolveId, setResolveId] = useState<number | null>(null);

  if (isLoading) return null;
  if (!manualItems || manualItems.length === 0) return null;

  const openItems = manualItems.filter((i) => i.status === "open");
  const resolvedItems = manualItems.filter((i) => i.status === "resolved");

  return (
    <div className="border border-border rounded-lg bg-card overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
        <MessageSquare className="w-5 h-5 text-purple-500" />
        <div className="flex-1">
          <h3 className="text-sm font-semibold">User-Submitted Review Items</h3>
          <p className="text-xs text-muted-foreground">{openItems.length} open · {resolvedItems.length} resolved</p>
        </div>
      </div>
      <div className="divide-y divide-border">
        {openItems.map((item) => (
          <div key={item.id} className="flex items-center gap-3 px-5 py-3">
            <div className={`w-2 h-2 rounded-full shrink-0 ${item.targetType === "service" ? "bg-blue-500" : "bg-green-500"}`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <Link
                  href={item.targetType === "service" ? `/services/${item.targetId}` : `/customers/${item.targetId}`}
                  className="text-sm font-medium text-primary hover:underline"
                >
                  {item.targetName || item.targetId}
                </Link>
                <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">{item.targetType}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{item.note}</p>
              <p className="text-[10px] text-muted-foreground mt-1">
                <Clock className="w-3 h-3 inline mr-1" />
                {item.submittedBy} · {new Date(item.createdAt).toLocaleDateString()}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setResolveId(item.id)}
            >
              <CheckCircle2 className="w-3 h-3 mr-1" />
              Resolve
            </Button>
          </div>
        ))}
      </div>

      <NoteDialog
        open={resolveId !== null}
        onClose={() => setResolveId(null)}
        onSubmit={(note) => {
          if (resolveId) resolveMutation.mutate({ id: resolveId, resolvedNote: note });
          setResolveId(null);
        }}
        title="Resolve Review Item"
        description="Add a note explaining how this issue was resolved."
        submitLabel="Mark Resolved"
        loading={resolveMutation.isPending}
      />
    </div>
  );
}

// ─── Main Review Page ────────────────────────────────────────────────────────

export default function Review() {
  const { data, isLoading, error } = trpc.billing.review.issues.useQuery();
  const ignoreMutation = trpc.billing.review.ignore.useMutation({
    onSuccess: () => {
      toast.success("Issue ignored");
      utils.billing.review.ignoredItems.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });
  const resolveMutation = trpc.billing.review.resolve.useMutation({
    onSuccess: () => toast.success("Item marked as reviewed"),
    onError: (err) => toast.error(err.message),
  });
  const flagMutation = trpc.billing.review.resolve.useMutation({
    onSuccess: () => toast.success("Service flagged for termination"),
    onError: (err) => toast.error(err.message),
  });
  const utils = trpc.useUtils();

  const { data: ignoredItems } = trpc.billing.review.ignoredItems.useQuery();

  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);
  const [ignoreDialog, setIgnoreDialog] = useState<{ issueType: string; targetId: string; targetName: string } | null>(null);

  // Build set of ignored item IDs
  const ignoredIds = new Set<string>();
  ignoredItems?.forEach((item) => {
    ignoredIds.add(`${item.issueType}:${item.targetId}`);
  });

  const handleIgnore = (issueType: string, targetId: string, targetName: string) => {
    setIgnoreDialog({ issueType, targetId, targetName });
  };

  const handleResolve = (issueType: string, targetId: string) => {
    resolveMutation.mutate({ issueType, itemId: targetId, action: "resolve" });
  };

  const handleFlag = (issueType: string, targetId: string) => {
    flagMutation.mutate({ issueType, itemId: targetId, action: "flag" });
  };

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="flex items-center gap-3 mb-8">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Analyzing billing data for issues...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-700">Failed to load review data: {error.message}</p>
        </div>
      </div>
    );
  }

  const billingReview = data?.billingReview || [];
  const accountManagement = data?.accountManagement || [];

  const totalBillingIssues = billingReview.reduce((s, i) => s + Number(i.count), 0);
  const totalAccountIssues = accountManagement.reduce((s, i) => s + Number(i.count), 0);
  const criticalCount = [...billingReview, ...accountManagement].filter((i) => i.severity === "critical").length;
  const warningCount = [...billingReview, ...accountManagement].filter((i) => i.severity === "warning").length;

  return (
    <div className="p-8 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Review</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Billing and account issues requiring attention
          </p>
        </div>
        <Button onClick={() => setSubmitDialogOpen(true)} size="sm">
          <Plus className="w-4 h-4 mr-1" />
          Submit for Review
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="border border-border rounded-lg p-4 bg-card">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Total Issues</p>
          <p className="text-2xl font-bold font-mono mt-1">{totalBillingIssues + totalAccountIssues}</p>
          <p className="text-xs text-muted-foreground">{billingReview.length + accountManagement.length} categories</p>
        </div>
        <div className="border border-red-200 rounded-lg p-4 bg-red-50">
          <p className="text-[10px] uppercase tracking-wider text-red-600 font-semibold">Critical</p>
          <p className="text-2xl font-bold font-mono mt-1 text-red-600">{criticalCount}</p>
          <p className="text-xs text-red-500">Require immediate action</p>
        </div>
        <div className="border border-amber-200 rounded-lg p-4 bg-amber-50">
          <p className="text-[10px] uppercase tracking-wider text-amber-600 font-semibold">Warnings</p>
          <p className="text-2xl font-bold font-mono mt-1 text-amber-600">{warningCount}</p>
          <p className="text-xs text-amber-500">Should be reviewed</p>
        </div>
        <div className="border border-border rounded-lg p-4 bg-card">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Ignored</p>
          <p className="text-2xl font-bold font-mono mt-1">{ignoredItems?.length || 0}</p>
          <p className="text-xs text-muted-foreground">Reviewed & dismissed</p>
        </div>
      </div>

      {/* User-Submitted Review Items */}
      <ManualReviewSection />

      {/* Billing Review Section */}
      <div className="mt-8 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center">
            <FileWarning className="w-4 h-4 text-red-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Billing Review</h2>
            <p className="text-xs text-muted-foreground">{billingReview.length} issue categories · {totalBillingIssues} total items</p>
          </div>
        </div>

        <div className="space-y-3">
          {billingReview.map((issue) => (
            <IssueCard
              key={issue.id}
              issue={issue}
              ignoredIds={ignoredIds}
              onIgnore={(targetId, targetName) => handleIgnore(issue.type, targetId, targetName)}
              onResolve={(targetId) => handleResolve(issue.type, targetId)}
              onFlag={(targetId) => handleFlag(issue.type, targetId)}
            />
          ))}
          {billingReview.length === 0 && (
            <div className="border border-border rounded-lg p-8 text-center bg-card">
              <CheckCircle2 className="w-8 h-8 mx-auto mb-3 text-green-500" />
              <p className="text-sm font-medium">No billing issues detected</p>
              <p className="text-xs text-muted-foreground mt-1">All billing data appears consistent</p>
            </div>
          )}
        </div>
      </div>

      {/* Account Management Section */}
      <div className="mt-8 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
            <TrendingDown className="w-4 h-4 text-amber-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Account Management</h2>
            <p className="text-xs text-muted-foreground">{accountManagement.length} issue categories · {totalAccountIssues} total items</p>
          </div>
        </div>

        <div className="space-y-3">
          {accountManagement.map((issue) => (
            <IssueCard
              key={issue.id}
              issue={issue}
              ignoredIds={ignoredIds}
              onIgnore={(targetId, targetName) => handleIgnore(issue.type, targetId, targetName)}
              onResolve={(targetId) => handleResolve(issue.type, targetId)}
              onFlag={(targetId) => handleFlag(issue.type, targetId)}
            />
          ))}
          {accountManagement.length === 0 && (
            <div className="border border-border rounded-lg p-8 text-center bg-card">
              <CheckCircle2 className="w-8 h-8 mx-auto mb-3 text-green-500" />
              <p className="text-sm font-medium">No account management issues detected</p>
            </div>
          )}
        </div>
      </div>

      {/* Dialogs */}
      <SubmitForReviewDialog open={submitDialogOpen} onClose={() => setSubmitDialogOpen(false)} />

      <NoteDialog
        open={ignoreDialog !== null}
        onClose={() => setIgnoreDialog(null)}
        onSubmit={(note) => {
          if (ignoreDialog) {
            ignoreMutation.mutate({
              issueType: ignoreDialog.issueType,
              targetType: "service",
              targetId: ignoreDialog.targetId,
              targetName: ignoreDialog.targetName,
              note,
            });
          }
          setIgnoreDialog(null);
        }}
        title="Ignore This Issue"
        description={`Add a note explaining why this issue is being ignored${ignoreDialog ? ` for ${ignoreDialog.targetName}` : ""}.`}
        submitLabel="Ignore Issue"
        submitVariant="outline"
        loading={ignoreMutation.isPending}
      />
    </div>
  );
}
