/*
 * Swiss Data Design — Customer Detail View
 * Summary panel + locations as grouped sections + services as rows within
 * Left colour stripe on location groups indicating health
 * AVC tracking with missing-AVC icons and inline editing
 */

import { Link, useParams } from "wouter";
import {
  ArrowLeft,
  MapPin,
  Wifi,
  Phone,
  Smartphone,
  Globe,
  ChevronRight,
  AlertTriangle,
  Loader2,
  Check,
  X,
  Pencil,
  LinkIcon,
  Flag,
  Ban,
  MessageSquare,
  Settings,
  Receipt,
  Link2,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  History,
} from "lucide-react";
import { useCustomerDetail } from "@/hooks/useData";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ProviderBadge } from "@/components/ProviderBadge";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useMemo } from "react";

// ─── Manual Match Dialog ─────────────────────────────────────────────────────
function ManualMatchDialog({
  xeroService,
  customerExternalId,
  open,
  onClose,
  onMatched,
}: {
  xeroService: any;
  customerExternalId: string;
  open: boolean;
  onClose: () => void;
  onMatched: () => void;
}) {
  const utils = trpc.useUtils();
  const { data: supplierServices = [], isLoading } = trpc.billing.serviceBillingMatch.supplierServices.useQuery(
    { customerExternalId },
    { enabled: open }
  );
  const mergeMutation = trpc.billing.serviceBillingMatch.merge.useMutation({
    onSuccess: (result) => {
      toast.success(`Linked — ${result.billingItemsMoved} billing item(s) moved, revenue now $${result.newRevenue.toFixed(2)}/mo`);
      utils.billing.customers.byId.invalidate();
      utils.billing.summary.invalidate();
      onMatched();
      onClose();
    },
    onError: (err) => toast.error(`Failed to link: ${err.message}`),
  });

  // Filter to same service type as the xero stub
  const sameTypeServices = useMemo(
    () => supplierServices.filter((s: any) => s.serviceType === xeroService?.serviceType),
    [supplierServices, xeroService]
  );
  const otherServices = useMemo(
    () => supplierServices.filter((s: any) => s.serviceType !== xeroService?.serviceType),
    [supplierServices, xeroService]
  );

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LinkIcon className="w-4 h-4" />
            Link Billing to Supplier Service
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {/* Xero stub summary */}
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
            <p className="font-medium text-amber-900">Billing item to link:</p>
            <p className="text-amber-800">{xeroService?.serviceType} — {xeroService?.serviceTypeDetail}</p>
            <p className="text-amber-700">${Number(xeroService?.monthlyCost).toFixed(2)}/mo billed</p>
          </div>
          {isLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : supplierServices.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No supplier services found for this customer.</p>
          ) : (
            <ScrollArea className="max-h-72">
              <div className="space-y-1">
                {sameTypeServices.length > 0 && (
                  <p className="text-xs font-medium text-muted-foreground px-1 pt-1">Same type ({xeroService?.serviceType})</p>
                )}
                {sameTypeServices.map((svc: any) => (
                  <button
                    key={svc.externalId}
                    disabled={mergeMutation.isPending}
                    onClick={() => mergeMutation.mutate({
                      xeroServiceExternalId: xeroService.externalId,
                      supplierServiceExternalId: svc.externalId,
                    })}
                    className="w-full text-left rounded-md border border-border px-3 py-2 hover:bg-accent transition-colors disabled:opacity-50 group"
                  >
                    <div className="flex items-center gap-2">
                      <ProviderBadge provider={svc.provider} size="xs" />
                      <span className="text-sm font-medium flex-1">{svc.serviceTypeDetail || svc.serviceType}</span>
                      <span className="text-xs text-muted-foreground">${svc.monthlyCost.toFixed(2)}/mo cost</span>
                      {mergeMutation.isPending && <Loader2 className="w-3 h-3 animate-spin" />}
                    </div>
                    {(svc.avcId || svc.phoneNumber) && (
                      <p className="text-xs text-muted-foreground mt-0.5">{svc.avcId || svc.phoneNumber}</p>
                    )}
                    {svc.locationAddress && (
                      <p className="text-xs text-muted-foreground truncate">{svc.locationAddress}</p>
                    )}
                  </button>
                ))}
                {otherServices.length > 0 && (
                  <p className="text-xs font-medium text-muted-foreground px-1 pt-2">Other types</p>
                )}
                {otherServices.map((svc: any) => (
                  <button
                    key={svc.externalId}
                    disabled={mergeMutation.isPending}
                    onClick={() => mergeMutation.mutate({
                      xeroServiceExternalId: xeroService.externalId,
                      supplierServiceExternalId: svc.externalId,
                    })}
                    className="w-full text-left rounded-md border border-border px-3 py-2 hover:bg-accent transition-colors disabled:opacity-50 opacity-70"
                  >
                    <div className="flex items-center gap-2">
                      <ProviderBadge provider={svc.provider} size="xs" />
                      <span className="text-sm font-medium flex-1">{svc.serviceType} — {svc.serviceTypeDetail}</span>
                      <span className="text-xs text-muted-foreground">${svc.monthlyCost.toFixed(2)}/mo</span>
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Customer Edit Dialog ────────────────────────────────────────────────────
type CustomerEditDialogProps = {
  customer: {
    externalId: string;
    name: string;
    businessName?: string | null;
    contactName?: string | null;
    contactEmail?: string | null;
    contactPhone?: string | null;
    siteAddress?: string | null;
    notes?: string | null;
    xeroContactName?: string | null;
    xeroAccountNumber?: string | null;
    ownershipType?: string | null;
    billingPlatforms?: string[];
  };
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
};

function CustomerEditDialog({ customer, open, onClose, onSaved }: CustomerEditDialogProps) {
  const utils = trpc.useUtils();
  const [form, setForm] = useState({
    name: customer.name || '',
    businessName: customer.businessName || '',
    contactName: customer.contactName || '',
    contactEmail: customer.contactEmail || '',
    contactPhone: customer.contactPhone || '',
    siteAddress: customer.siteAddress || '',
    notes: customer.notes || '',
    xeroContactName: customer.xeroContactName || '',
    xeroAccountNumber: customer.xeroAccountNumber || '',
    ownershipType: customer.ownershipType || '',
  });

  const updateMutation = trpc.billing.customers.update.useMutation({
    onSuccess: () => {
      toast.success('Customer updated');
      utils.billing.customers.byId.invalidate({ id: customer.externalId });
      utils.billing.customers.list.invalidate();
      onSaved();
      onClose();
    },
    onError: (err) => {
      toast.error(`Failed to update: ${err.message}`);
    },
  });

  const handleSave = () => {
    if (!form.name.trim()) {
      toast.error('Customer name is required');
      return;
    }
    updateMutation.mutate({
      externalId: customer.externalId,
      updates: {
        name: form.name.trim(),
        businessName: form.businessName,
        contactName: form.contactName,
        contactEmail: form.contactEmail,
        contactPhone: form.contactPhone,
        siteAddress: form.siteAddress,
        notes: form.notes,
        xeroContactName: form.xeroContactName,
        xeroAccountNumber: form.xeroAccountNumber,
        ownershipType: form.ownershipType,
      },
    });
  };

  const field = (key: keyof typeof form) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(prev => ({ ...prev, [key]: e.target.value })),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="w-4 h-4" />
            Edit Customer
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
          {/* Core identity */}
          <div className="md:col-span-2">
            <Label htmlFor="cust-name">Customer Name <span className="text-destructive">*</span></Label>
            <Input id="cust-name" className="mt-1" {...field('name')} />
          </div>
          <div>
            <Label htmlFor="cust-biz">Business / Trading Name</Label>
            <Input id="cust-biz" className="mt-1" {...field('businessName')} />
          </div>
          <div>
            <Label htmlFor="cust-ownership">Ownership Type</Label>
            <Input id="cust-ownership" className="mt-1" placeholder="e.g. C, F, Corporate, Franchise" {...field('ownershipType')} />
          </div>
          {/* Contact */}
          <div className="md:col-span-2 border-t border-border pt-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Contact Details</p>
          </div>
          <div>
            <Label htmlFor="cust-contact">Contact Name</Label>
            <Input id="cust-contact" className="mt-1" {...field('contactName')} />
          </div>
          <div>
            <Label htmlFor="cust-email">Contact Email</Label>
            <Input id="cust-email" type="email" className="mt-1" {...field('contactEmail')} />
          </div>
          <div>
            <Label htmlFor="cust-phone">Contact Phone</Label>
            <Input id="cust-phone" className="mt-1" {...field('contactPhone')} />
          </div>
          <div>
            <Label htmlFor="cust-address">Site Address</Label>
            <Input id="cust-address" className="mt-1" {...field('siteAddress')} />
          </div>
          {/* Xero */}
          <div className="md:col-span-2 border-t border-border pt-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Xero / Billing</p>
          </div>
          <div>
            <Label htmlFor="cust-xero-name">Xero Contact Name</Label>
            <Input id="cust-xero-name" className="mt-1" {...field('xeroContactName')} />
          </div>
          <div>
            <Label htmlFor="cust-xero-acc">Xero Account Number</Label>
            <Input id="cust-xero-acc" className="mt-1" {...field('xeroAccountNumber')} />
          </div>
          {/* Notes */}
          <div className="md:col-span-2 border-t border-border pt-3">
            <Label htmlFor="cust-notes">Notes</Label>
            <Textarea id="cust-notes" className="mt-1" rows={3} {...field('notes')} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={updateMutation.isPending}>Cancel</Button>
          <Button onClick={handleSave} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ServiceTypeIcon({ type }: { type: string }) {
  switch (type) {
    case "Internet":
      return <Wifi className="w-3.5 h-3.5" />;
    case "Mobile":
      return <Smartphone className="w-3.5 h-3.5" />;
    case "Voice":
      return <Phone className="w-3.5 h-3.5" />;
    case "VoIP":
      return <Globe className="w-3.5 h-3.5" />;
    default:
      return <Globe className="w-3.5 h-3.5" />;
  }
}

function StatusPill({ status, billingLinked }: { status: string; billingLinked?: boolean }) {
  // For active services, only show "Matched" if they are genuinely linked to a billing item
  // via service_billing_assignments. Otherwise show "Unlinked" in amber.
  const effectiveStatus = status === 'active' && billingLinked === false ? 'unlinked' : status;

  const styles: Record<string, string> = {
    active: "status-active",
    unlinked: "inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full border bg-amber-50 text-amber-700 border-amber-300",
    unmatched: "status-unmatched",
    flagged_for_termination: "inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full border bg-rose-50 text-rose-700 border-rose-200",
    terminated: "inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full border bg-gray-100 text-gray-500 border-gray-200",
    flagged: "status-flagged",
    review: "status-review",
  };
  const labels: Record<string, string> = {
    active: "Matched",
    unlinked: "Unlinked",
    unmatched: "Unmatched",
    flagged_for_termination: "Flagged",
    terminated: "Terminated",
    flagged: "Flagged",
    review: "Review",
  };
  const cls = styles[effectiveStatus] || "status-review";
  const label = labels[effectiveStatus] || status;
  return (
    <span className={cls}>
      {effectiveStatus === "flagged_for_termination" && <Flag className="w-2.5 h-2.5" />}
      {effectiveStatus === "terminated" && <Ban className="w-2.5 h-2.5" />}
      {effectiveStatus === "unlinked" && <AlertTriangle className="w-2.5 h-2.5" />}
      {label}
    </span>
  );
}

function AvcInlineEditor({
  service,
  onSaved,
}: {
  service: { externalId: string; connectionId?: string | null };
  onSaved?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [avcValue, setAvcValue] = useState(service.connectionId || "");
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
      utils.billing.customers.services.invalidate();
      utils.billing.services.byId.invalidate();
      onSaved?.();
    } catch {
      toast.error("Failed to update AVC");
    }
  };

  const hasAvc = service.connectionId && service.connectionId.trim() !== "";

  if (editing) {
    return (
      <div
        className="flex items-center gap-1.5"
        onClick={(e) => e.preventDefault()}
      >
        <input
          type="text"
          value={avcValue}
          onChange={(e) => setAvcValue(e.target.value)}
          placeholder="Enter AVC ID"
          className="w-40 px-2 py-0.5 text-xs font-mono bg-background border border-primary/30 rounded outline-none focus:ring-1 focus:ring-primary/40"
          autoFocus
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
            if (e.key === "Escape") setEditing(false);
          }}
        />
        <button
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            handleSave();
          }}
          disabled={updateAvc.isPending}
          className="p-0.5 text-emerald-600 hover:text-emerald-700"
        >
          <Check className="w-3 h-3" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            setEditing(false);
          }}
          className="p-0.5 text-muted-foreground hover:text-foreground"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    );
  }

  if (hasAvc) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="data-value text-muted-foreground">
          {service.connectionId}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            setEditing(true);
          }}
          className="p-0.5 text-muted-foreground/50 hover:text-primary transition-colors"
          title="Edit AVC"
        >
          <Pencil className="w-3 h-3" />
        </button>
      </span>
    );
  }

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        setEditing(true);
      }}
      className="inline-flex items-center gap-1 text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded hover:bg-amber-100 transition-colors"
      title="Add AVC/Connection ID"
    >
      <AlertTriangle className="w-3 h-3" />
      No AVC — click to add
    </button>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ServiceRow({ service, customerExternalId, onTerminated }: { service: any; customerExternalId?: string; onTerminated?: () => void }) {
  const hasAvc = service.connectionId && service.connectionId.trim() !== "";
  const isTerminated = service.status === "terminated";
  const isFlagged = service.status === "flagged_for_termination";
  const isUnmatched = service.status === "unmatched" && service.provider === "Unknown";
  const hasNotes = service.discoveryNotes && service.discoveryNotes.trim() !== "";
  const [showConfirm, setShowConfirm] = useState(false);
  const [showMatchDialog, setShowMatchDialog] = useState(false);
  const terminateMutation = trpc.billing.terminate.useMutation();
  const restoreMutation = trpc.billing.restore.useMutation();
  const utils = trpc.useUtils();

  const handleTerminate = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const result = await terminateMutation.mutateAsync({ serviceExternalId: service.externalId });
      toast.success(`Terminated — $${result.originalCost?.toFixed(2) || '0.00'}/mo removed`);
      utils.billing.customers.byId.invalidate();
      utils.billing.summary.invalidate();
      utils.billing.margin.list.invalidate();
      utils.billing.margin.grouped.invalidate();
      utils.billing.customers.list.invalidate();
      setShowConfirm(false);
      onTerminated?.();
    } catch { toast.error("Failed to terminate"); }
  };

  const handleRestore = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await restoreMutation.mutateAsync({ serviceExternalId: service.externalId });
      toast.success("Service restored");
      utils.billing.customers.byId.invalidate();
      utils.billing.summary.invalidate();
      utils.billing.margin.list.invalidate();
      utils.billing.margin.grouped.invalidate();
      utils.billing.customers.list.invalidate();
      onTerminated?.();
    } catch { toast.error("Failed to restore"); }
  };

  return (
    <>
      <Link href={`/services/${service.externalId || service.id}`} asChild>
        <div className={`flex items-center gap-3 px-4 py-2.5 hover:bg-accent/50 transition-colors cursor-pointer group border-b border-border/30 last:border-0 ${isTerminated ? "opacity-60" : isFlagged ? "bg-rose-50/30" : ""}`}>
          <div className={`w-7 h-7 rounded-md flex items-center justify-center ${isTerminated ? "bg-gray-100 text-gray-400" : isFlagged ? "bg-rose-50 text-rose-600" : "bg-muted text-muted-foreground"}`}>
            <ServiceTypeIcon type={service.serviceType} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className={`text-sm font-medium truncate ${isTerminated ? "line-through text-muted-foreground" : ""}`}>
                {service.serviceType}
              </span>
              <span className="text-xs text-muted-foreground">
                {service.serviceTypeDetail || service.planName}
              </span>
              {hasNotes && (
                <span title="Has discovery notes">
                  <MessageSquare className="w-3 h-3 text-amber-600" />
                </span>
              )}
              <ProviderBadge provider={service.provider} size="xs" />
            </div>
            <div className="flex items-center gap-3 mt-0.5">
              {service.phoneNumber && (
                <span className="data-value text-muted-foreground">
                  {service.phoneNumber}
                </span>
              )}
              {service.serviceType === "Internet" && <AvcInlineEditor service={service} />}
              {!service.phoneNumber && !hasAvc && (
                <span className="data-value text-muted-foreground">
                  {service.serviceId}
                </span>
              )}
            </div>
          </div>
          <div className="text-right shrink-0 hidden sm:block">
            <span className="data-value text-sm">
              ${Number(service.monthlyCost).toLocaleString("en-AU", { minimumFractionDigits: 2 })}
            </span>
            <span className="text-[10px] text-muted-foreground block">supplier cost/mo</span>
          </div>
          <div className="shrink-0 hidden md:block">
            <StatusPill status={service.status} billingLinked={service.billingLinked} />
          </div>
          {/* Link to supplier service button — only for unmatched Xero stubs */}
          {isUnmatched && customerExternalId && (
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowMatchDialog(true); }}
              title="Link to supplier service"
              className="shrink-0 p-1.5 rounded text-amber-600 opacity-0 group-hover:opacity-100 hover:bg-amber-50 transition-all"
            >
              <LinkIcon className="w-3.5 h-3.5" />
            </button>
          )}
          {/* Quick terminate / restore button */}
          {!isTerminated ? (
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowConfirm(true); }}
              title="Terminate service"
              className="shrink-0 p-1.5 rounded text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive hover:bg-destructive/10 transition-all"
            >
              <Ban className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              onClick={handleRestore}
              title="Restore service"
              disabled={restoreMutation.isPending}
              className="shrink-0 p-1.5 rounded text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-green-600 hover:bg-green-50 transition-all"
            >
              {restoreMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            </button>
          )}
          <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
        </div>
      </Link>
      {/* Inline confirmation row */}
      {showConfirm && (
        <div className="px-4 py-3 bg-destructive/5 border-b border-destructive/20 flex items-center gap-3">
          <span className="text-xs text-destructive flex-1">Terminate this service? Cost of ${Number(service.monthlyCost).toFixed(2)}/mo will be removed.</span>
          <button
            onClick={handleTerminate}
            disabled={terminateMutation.isPending}
            className="text-xs px-3 py-1.5 bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/90 disabled:opacity-50 inline-flex items-center gap-1"
          >
            {terminateMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Ban className="w-3 h-3" />}
            Terminate
          </button>
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowConfirm(false); }}
            className="text-xs px-3 py-1.5 border border-border rounded-md hover:bg-accent"
          >
            Cancel
          </button>
        </div>
      )}
      {/* Manual match dialog for unmatched Xero stubs */}
      {showMatchDialog && customerExternalId && (
        <ManualMatchDialog
          xeroService={service}
          customerExternalId={customerExternalId}
          open={showMatchDialog}
          onClose={() => setShowMatchDialog(false)}
          onMatched={() => { utils.billing.customers.byId.invalidate(); onTerminated?.(); }}
        />
      )}
    </>
  );
}

// ─── Unmatched Billing Row ───────────────────────────────────────────────────
function UnmatchedBillingRow({
  service,
  availableBillingItems,
  customerExternalId,
  onResolve,
}: {
  service: any;
  availableBillingItems: any[];
  customerExternalId?: string;
  onResolve: (serviceExternalId: string, billingItemExternalId: string | null, resolution: 'linked' | 'intentionally-unbilled', notes?: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [selectedBillingItem, setSelectedBillingItem] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [resolving, setResolving] = useState(false);

  const handleLink = async () => {
    if (!selectedBillingItem) {
      toast.error('Please select a billing item to link');
      return;
    }
    setResolving(true);
    try {
      await onResolve(service.externalId, selectedBillingItem, 'linked', notes || undefined);
      setExpanded(false);
    } finally {
      setResolving(false);
    }
  };

  const handleMarkUnbilled = async () => {
    setResolving(true);
    try {
      await onResolve(service.externalId, null, 'intentionally-unbilled', notes || undefined);
      setExpanded(false);
    } finally {
      setResolving(false);
    }
  };

  return (
    <div className="border-b border-orange-100 last:border-0">
      <div
        className="flex items-center gap-3 px-4 py-3 hover:bg-orange-50/30 transition-colors cursor-pointer"
        onClick={() => setExpanded(v => !v)}
      >
        {/* Service type icon */}
        <div className="w-7 h-7 rounded-md flex items-center justify-center bg-orange-50 text-orange-600 shrink-0">
          {service.serviceType === 'Internet' ? <Wifi className="w-3.5 h-3.5" /> :
           service.serviceType === 'Voice' ? <Phone className="w-3.5 h-3.5" /> :
           service.serviceType === 'Mobile' ? <Smartphone className="w-3.5 h-3.5" /> :
           <Globe className="w-3.5 h-3.5" />}
        </div>
        {/* Service info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">{service.planName || service.serviceType}</span>
            <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{service.serviceType}</span>
            {service.provider && service.provider !== 'Unknown' && (
              <span className="text-[10px] text-muted-foreground">{service.provider}</span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
            {service.phoneNumber && <span>{service.phoneNumber}</span>}
            {service.connectionId && <span>AVC: {service.connectionId}</span>}
            {service.locationAddress && <span className="truncate max-w-[200px]">{service.locationAddress}</span>}
            <span className="font-medium text-foreground">${Number(service.monthlyCost).toFixed(2)}/mo <span className="text-[10px] font-normal text-muted-foreground">(supplier cost)</span></span>
          </div>
        </div>
        {/* Expand toggle */}
        <div className="shrink-0 text-orange-500">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </div>

      {/* Expanded resolution panel */}
      {expanded && (
        <div className="px-4 pb-4 pt-1 bg-orange-50/20 border-t border-orange-100">
          <p className="text-xs font-semibold text-muted-foreground mb-3">Link this service to a Xero billing item, or mark as intentionally unbilled:</p>

          {/* Primary action: go to Billing Match drag-and-drop workbench */}
          <div className="mb-3 p-3 rounded-md bg-orange-50 border border-orange-200 flex items-start gap-3">
            <Link2 className="w-4 h-4 text-orange-600 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-orange-800 mb-1">Use the Billing Match workbench to link this service</p>
              <p className="text-[11px] text-orange-700/80 mb-2">Drag this service from the left column onto the correct Xero billing item on the right. Multiple services can share one billing item.</p>
              {customerExternalId && (
                <a
                  href={`/customers/${customerExternalId}/billing-match`}
                  className="inline-flex items-center gap-1.5 text-[11px] font-medium text-orange-700 underline underline-offset-2 hover:text-orange-900"
                >
                  <Link2 className="w-3 h-3" />
                  Open Billing Match workbench
                </a>
              )}
            </div>
          </div>

          {/* Notes for unbilled action */}
          <div className="mb-3">
            <label className="text-xs text-muted-foreground mb-1 block">Notes (optional — for intentionally unbilled)</label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Included in bundle, no separate charge..."
              className="w-full text-sm bg-background border border-border rounded-md px-3 py-2 outline-none focus:ring-2 focus:ring-ring/20"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleMarkUnbilled}
              disabled={resolving}
              className="gap-1.5 text-muted-foreground"
            >
              {resolving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              Mark Intentionally Unbilled
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setExpanded(false)}
              className="ml-auto text-muted-foreground"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CustomerDetail() {
  const params = useParams<{ id: string }>();
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showUnmatchedBilling, setShowUnmatchedBilling] = useState(true);
  const {
    customer,
    customerServices,
    customerLocations,
    servicesByLocation,
    isLoading,
  } = useCustomerDetail(params.id || "");

  const utils = trpc.useUtils();
  const { data: unmatchedBillingServices = [], isLoading: isLoadingUnmatched } =
    trpc.billing.customers.unmatchedBillingServices.useQuery(
      { customerExternalId: params.id || "" },
      { enabled: !!params.id, staleTime: 30_000 }
    );
  const { data: availableBillingItems = [] } =
    trpc.billing.customers.availableBillingItems.useQuery(
      { customerExternalId: params.id || "" },
      { enabled: !!params.id, staleTime: 30_000 }
    );
  const resolveServiceBilling = trpc.billing.customers.resolveServiceBilling.useMutation({
    onSuccess: () => {
      utils.billing.customers.unmatchedBillingServices.invalidate();
      utils.billing.customers.availableBillingItems.invalidate();
      utils.billing.customers.byId.invalidate();
      utils.billing.summary.invalidate();
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <p>Customer not found</p>
        <Link
          href="/customers"
          className="text-sm underline mt-2 inline-block"
        >
          Back to customers
        </Link>
      </div>
    );
  }

  const totalCost = customerServices.reduce(
    (sum, s) => sum + Number(s.monthlyCost),
    0
  );
  const matchedCount = customerServices.filter(
    (s) => s.status === "active"
  ).length;
  const unmatchedCount = customerServices.filter(
    (s) => s.status === "unmatched"
  ).length;
  const flaggedCount = customerServices.filter(
    (s) => s.status === "flagged_for_termination"
  ).length;
  const terminatedCount = customerServices.filter(
    (s) => s.status === "terminated"
  ).length;

  // AVC tracking — Internet services only
  const internetServices = customerServices.filter((s) => s.serviceType === "Internet");
  const servicesWithAvc = internetServices.filter(
    (s) => s.connectionId && s.connectionId.trim() !== ""
  ).length;
  const servicesMissingAvc = internetServices.length - servicesWithAvc;

  // Provider breakdown for this customer
  const providerBreakdown = customerServices.reduce((acc: Record<string, { count: number; cost: number }>, s) => {
    const provider = s.provider || 'Unknown';
    if (!acc[provider]) acc[provider] = { count: 0, cost: 0 };
    acc[provider].count++;
    acc[provider].cost += Number(s.monthlyCost);
    return acc;
  }, {});

  // Build a set of location IDs that have actual location records
  const locationIdSet = new Set(customerLocations.map(l => l.externalId));

  // Services that belong to a known location record
  const locatedLocations = customerLocations.filter(
    (l) => l.address && l.address !== "Unknown Location"
  );

  // Services without a matching location record (either no locationExternalId, or their locationExternalId doesn't match any location)
  const orphanedServices = customerServices.filter(
    (s) => !s.locationExternalId || !locationIdSet.has(s.locationExternalId)
  );

  // Split orphaned services: those with an address vs those truly unlocated
  const orphanedWithAddress = orphanedServices.filter(
    (s) => s.locationAddress && s.locationAddress !== "Unknown Location"
  );
  const unlocatedServices = orphanedServices.filter(
    (s) => !s.locationAddress || s.locationAddress === "Unknown Location"
  );

  return (
    <div className="p-6 lg:p-8">
      {/* Breadcrumb */}
      <Link
        href="/customers"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to Customers
      </Link>

      {/* Customer Header */}
      <div className="mb-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold tracking-tight">{customer.name}</h1>
            {customer.businessName && (
              <p className="text-sm text-muted-foreground mt-0.5">{customer.businessName}</p>
            )}
          </div>
          <button
            onClick={() => setShowEditDialog(true)}
            className="shrink-0 inline-flex items-center gap-1.5 text-xs px-3 py-1.5 border border-border rounded-md hover:bg-accent transition-colors"
            title="Edit customer details"
          >
            <Pencil className="w-3 h-3" />
            Edit
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-3 mt-2">
          {customer.billingPlatforms.map((p: string) => (
            <span
              key={p}
              className="text-[10px] px-2 py-0.5 bg-muted rounded font-medium text-muted-foreground uppercase tracking-wider"
            >
              {p}
            </span>
          ))}
          {customer.ownershipType && (
            <span className={`text-[10px] px-2 py-0.5 rounded font-medium uppercase tracking-wider ${
              customer.ownershipType === 'C' ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-muted text-muted-foreground'
            }`}>
              {customer.ownershipType === 'C' ? 'Corporate' : customer.ownershipType === 'F' ? 'Franchise' : customer.ownershipType}
            </span>
          )}
        </div>
      </div>
      {/* Customer Edit Dialog */}
      {showEditDialog && (
        <CustomerEditDialog
          customer={customer}
          open={showEditDialog}
          onClose={() => setShowEditDialog(false)}
          onSaved={() => setShowEditDialog(false)}
        />
      )}

      {/* Business Contact Info - always visible so users know they can edit */}
      <div className="bg-card border border-border rounded-lg px-4 py-3 mb-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Contact & Site Info</p>
            <button
              onClick={() => setShowEditDialog(true)}
              className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
            >
              <Pencil className="w-2.5 h-2.5" />
              Edit
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <p className="text-[10px] text-muted-foreground">Contact</p>
              {customer.contactName
                ? <p className="text-sm font-medium">{customer.contactName}</p>
                : <p className="text-sm text-muted-foreground/50 italic">Not set</p>}
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Email</p>
              {customer.contactEmail
                ? <a href={`mailto:${customer.contactEmail}`} className="text-sm font-medium text-teal hover:underline">{customer.contactEmail}</a>
                : <p className="text-sm text-muted-foreground/50 italic">Not set</p>}
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Phone</p>
              {customer.contactPhone
                ? <a href={`tel:${customer.contactPhone}`} className="text-sm font-medium text-teal hover:underline">{customer.contactPhone}</a>
                : <p className="text-sm text-muted-foreground/50 italic">Not set</p>}
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Site Address</p>
              {customer.siteAddress
                ? <p className="text-sm font-medium">{customer.siteAddress}</p>
                : <p className="text-sm text-muted-foreground/50 italic">Not set</p>}
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-border">
            <p className="text-[10px] text-muted-foreground">Notes</p>
            {customer.notes
              ? <p className="text-xs text-muted-foreground">{customer.notes}</p>
              : <p className="text-xs text-muted-foreground/50 italic">No notes</p>}
          </div>
        </div>
      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
        <div className="bg-card border border-border rounded-lg px-4 py-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            Total Services
          </p>
          <p className="text-2xl font-bold mt-1 data-value">
            {customerServices.length}
          </p>
        </div>
        <div className="bg-card border border-border rounded-lg px-4 py-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            Monthly Cost (ex GST)
          </p>
          <p className="text-2xl font-bold mt-1 data-value">
            $
            {totalCost.toLocaleString("en-AU", {
              minimumFractionDigits: 2,
            })}
          </p>
        </div>
        <div className="bg-card border border-border rounded-lg px-4 py-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            Matched
          </p>
          <p className="text-2xl font-bold mt-1 data-value text-teal">
            {matchedCount}
          </p>
        </div>
        <div className="bg-card border border-border rounded-lg px-4 py-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            Unmatched
          </p>
          <p
            className={`text-2xl font-bold mt-1 data-value ${unmatchedCount > 0 ? "text-amber" : "text-muted-foreground"}`}
          >
            {unmatchedCount}
          </p>
        </div>
        {(flaggedCount > 0 || terminatedCount > 0) && (
          <div className="bg-card border border-border rounded-lg px-4 py-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              Flagged / Terminated
            </p>
            <div className="flex items-center gap-2 mt-1">
              {flaggedCount > 0 && (
                <span className="inline-flex items-center gap-1 text-sm font-bold text-rose-600">
                  <Flag className="w-3 h-3" />
                  {flaggedCount}
                </span>
              )}
              {terminatedCount > 0 && (
                <span className="inline-flex items-center gap-1 text-sm font-bold text-gray-500">
                  <Ban className="w-3 h-3" />
                  {terminatedCount}
                </span>
              )}
            </div>
          </div>
        )}
        <div className="bg-card border border-border rounded-lg px-4 py-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            AVC Coverage
          </p>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-2xl font-bold data-value">
              {servicesWithAvc}
              <span className="text-sm text-muted-foreground font-normal">
                /{internetServices.length}
              </span>
            </p>
            {servicesMissingAvc > 0 && (
              <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                <AlertTriangle className="w-3 h-3" />
                {servicesMissingAvc} missing
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Provider Breakdown */}
      {Object.keys(providerBreakdown).length > 0 && (
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Suppliers:</span>
          {Object.entries(providerBreakdown).map(([provider, data]) => (
            <div key={provider} className="inline-flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-1.5">
              <ProviderBadge provider={provider} size="sm" />
              <span className="text-xs text-muted-foreground">
                {data.count} svc · ${data.cost.toLocaleString("en-AU", { minimumFractionDigits: 2 })}/mo
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Flagged / Terminated Services */}
      {(flaggedCount > 0 || terminatedCount > 0) && (
        <div className="space-y-3 mb-8">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Flag className="w-3.5 h-3.5 text-rose-600" />
            Flagged & Terminated Services
          </h2>

          {/* Flagged services */}
          {flaggedCount > 0 && (
            <div className="bg-card border border-rose-200 rounded-lg overflow-hidden border-l-[3px] border-l-rose-500">
              <div className="flex items-center gap-3 px-4 py-3 border-b border-rose-100 bg-rose-50/50">
                <Flag className="w-4 h-4 text-rose-600 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-rose-900">Flagged for Termination</p>
                  <p className="text-xs text-rose-600/80">
                    These services have been flagged and are pending termination
                  </p>
                </div>
                <span className="text-xs font-semibold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-full">
                  {flaggedCount} service{flaggedCount !== 1 ? "s" : ""}
                </span>
              </div>
              <div>
                {customerServices
                  .filter((s) => s.status === "flagged_for_termination")
                  .map((svc) => (
                    <ServiceRow key={svc.id} service={svc} customerExternalId={customer?.externalId} />
                  ))}
              </div>
            </div>
          )}

          {/* Terminated services */}
          {terminatedCount > 0 && (
            <div className="bg-card border border-gray-200 rounded-lg overflow-hidden border-l-[3px] border-l-gray-400">
              <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 bg-gray-50/50">
                <Ban className="w-4 h-4 text-gray-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-700">Terminated</p>
                  <p className="text-xs text-gray-500">
                    These services have been terminated
                  </p>
                </div>
                <span className="text-xs font-semibold text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full">
                  {terminatedCount} service{terminatedCount !== 1 ? "s" : ""}
                </span>
              </div>
              <div>
                {customerServices
                  .filter((s) => s.status === "terminated")
                  .map((svc) => (
                    <ServiceRow key={svc.id} service={svc} customerExternalId={customer?.externalId} />
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Unmatched Billing Services */}
      {(unmatchedBillingServices.length > 0 || isLoadingUnmatched) && (
        <div className="mb-8">
          <button
            onClick={() => setShowUnmatchedBilling(v => !v)}
            className="w-full flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-orange-700 mb-3 hover:text-orange-800 transition-colors"
          >
            <Receipt className="w-3.5 h-3.5 text-orange-600" />
            Unmatched Billing
            <span className="text-xs font-medium bg-orange-100 text-orange-700 border border-orange-200 px-2 py-0.5 rounded-full">
              {unmatchedBillingServices.length} service{unmatchedBillingServices.length !== 1 ? 's' : ''}
            </span>
            <span className="ml-auto">
              {showUnmatchedBilling ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </span>
          </button>
          {showUnmatchedBilling && (
            <div className="bg-card border border-orange-200 rounded-lg overflow-hidden border-l-[3px] border-l-orange-500">
              <div className="flex items-center gap-3 px-4 py-3 border-b border-orange-100 bg-orange-50/50">
                <Receipt className="w-4 h-4 text-orange-600 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-orange-900">Services Without Billing Assignment</p>
                  <p className="text-xs text-orange-600/80">
                    These services are active but have no billing item linked. Assign a billing item or mark as intentionally unbilled.
                  </p>
                </div>
                <span className="text-xs font-semibold text-orange-700 bg-orange-100 px-2 py-0.5 rounded-full">
                  {unmatchedBillingServices.length} service{unmatchedBillingServices.length !== 1 ? 's' : ''}
                </span>
                <Link href={`/customers/${params.id}/billing-match`}>
                  <Button size="sm" className="gap-1 text-xs bg-orange-600 hover:bg-orange-700 text-white shrink-0">
                    <Link2 className="w-3.5 h-3.5" />
                    Billing Match
                  </Button>
                </Link>
                <Link href={`/customers/${params.id}/match-workbook`}>
                  <Button size="sm" variant="outline" className="gap-1 text-xs border-orange-300 text-orange-700 hover:bg-orange-50 shrink-0">
                    <Link2 className="w-3.5 h-3.5" />
                    Match Workbook
                  </Button>
                </Link>
              </div>
              {isLoadingUnmatched ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div>
                  {unmatchedBillingServices.map((svc: any) => (
                    <UnmatchedBillingRow
                      key={svc.externalId}
                      service={svc}
                      availableBillingItems={availableBillingItems}
                      customerExternalId={customer?.externalId}
                      onResolve={async (serviceExternalId: string, billingItemExternalId: string | null, resolution: 'linked' | 'intentionally-unbilled', notes?: string) => {
                        try {
                          await resolveServiceBilling.mutateAsync({
                            serviceExternalId,
                            billingItemExternalId,
                            resolution,
                            notes,
                          });
                          toast.success(resolution === 'linked' ? 'Billing item linked successfully' : 'Marked as intentionally unbilled');
                        } catch (e: any) {
                          toast.error(`Failed: ${e.message}`);
                        }
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Locations & Services */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Locations & Services
        </h2>

        {locatedLocations.map((loc) => {
          const locId = loc.externalId || String(loc.id);
          const locServices = servicesByLocation[locId] || [];
          const locUnmatched = locServices.filter(
            (s: { status: string }) => s.status === "unmatched"
          ).length;
          const locMissingAvc = locServices.filter(
            (s: { serviceType?: string; connectionId?: string | null }) =>
              s.serviceType === "Internet" && (!s.connectionId || s.connectionId.trim() === "")
          ).length;
          const borderColor =
            locUnmatched > 0 ? "border-l-amber" : "border-l-teal";

          return (
            <div
              key={loc.id}
              className={`bg-card border border-border rounded-lg overflow-hidden border-l-[3px] ${borderColor}`}
            >
              {/* Location header */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-muted/30">
                <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{loc.address}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {locMissingAvc > 0 && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                      <AlertTriangle className="w-3 h-3" />
                      {locMissingAvc} missing AVC
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {locServices.length} service
                    {locServices.length !== 1 ? "s" : ""}
                  </span>
                </div>
              </div>

              {/* Services */}
              <div>
                {locServices.map(
                  (svc: { id: number; externalId?: string }) => (
                    <ServiceRow key={svc.id} service={svc} customerExternalId={customer?.externalId} />
                  )
                )}
              </div>
            </div>
          );
        })}

        {/* Orphaned services with addresses (no location record but have an address) */}
        {orphanedWithAddress.length > 0 && (() => {
          // Group orphaned services by their locationAddress
          const grouped: Record<string, typeof orphanedWithAddress> = {};
          for (const s of orphanedWithAddress) {
            const addr = s.locationAddress || "";
            if (!grouped[addr]) grouped[addr] = [];
            grouped[addr].push(s);
          }
          return Object.entries(grouped).map(([addr, svcs]) => (
            <div
              key={`orphan-${addr}`}
              className="bg-card border border-border rounded-lg overflow-hidden border-l-[3px] border-l-teal"
            >
              <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-muted/30">
                <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{addr}</p>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">
                  {svcs.length} service{svcs.length !== 1 ? "s" : ""}
                </span>
              </div>
              <div>
                {svcs.map((svc) => (
                  <ServiceRow key={svc.id} service={svc} customerExternalId={customer?.externalId} />
                ))}
              </div>
            </div>
          ));
        })()}

        {/* Unlocated services */}
        {unlocatedServices.length > 0 && (
          <div className="bg-card border border-border rounded-lg overflow-hidden border-l-[3px] border-l-amber">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-muted/30">
              <AlertTriangle className="w-4 h-4 text-amber shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">Unknown Location</p>
                <p className="text-xs text-muted-foreground">
                  Services without a confirmed site address
                </p>
              </div>
              <span className="text-xs text-muted-foreground shrink-0">
                {unlocatedServices.length} service
                {unlocatedServices.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div>
              {unlocatedServices.map((svc) => (
                <ServiceRow key={svc.id} service={svc} customerExternalId={customer?.externalId} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
