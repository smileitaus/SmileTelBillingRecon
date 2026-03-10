/*
 * Swiss Data Design — Service Detail View
 * All attributes, billing history timeline, status & actions
 * Monospaced data values, thin horizontal rules
 * AVC tracking with inline editing and missing-AVC warnings
 * Discovery notes and termination status workflow
 */

import { Link, useParams } from "wouter";
import {
  ArrowLeft,
  Wifi,
  Phone,
  Smartphone,
  Globe,
  MapPin,
  Building2,
  FileText,
  Flag,
  AlertTriangle,
  Loader2,
  Check,
  X,
  Pencil,
  LinkIcon,
  Ban,
  StickyNote,
  Save,
  MessageSquare,
  Cpu,
  CreditCard,
  Router,
  Database,
  Zap,
  ZapOff,
  CircleDollarSign,
  Calendar,
  User,
  Activity,
} from "lucide-react";
import { useServiceDetail } from "@/hooks/useData";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { ProviderBadge } from "@/components/ProviderBadge";

function ServiceTypeIcon({ type }: { type: string }) {
  switch (type) {
    case "Internet":
      return <Wifi className="w-5 h-5" />;
    case "Mobile":
      return <Smartphone className="w-5 h-5" />;
    case "Voice":
      return <Phone className="w-5 h-5" />;
    default:
      return <Globe className="w-5 h-5" />;
  }
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: "bg-emerald-50 text-emerald-700 border-emerald-200",
    unmatched: "bg-amber-50 text-amber-700 border-amber-200",
    flagged_for_termination: "bg-rose-50 text-rose-700 border-rose-200",
    terminated: "bg-gray-100 text-gray-500 border-gray-200",
  };
  const labels: Record<string, string> = {
    active: "Active & Matched",
    unmatched: "Unmatched",
    flagged_for_termination: "Flagged for Termination",
    terminated: "Terminated",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-full border ${styles[status] || styles.unmatched}`}
    >
      {status === "flagged_for_termination" && <Flag className="w-3 h-3" />}
      {status === "terminated" && <Ban className="w-3 h-3" />}
      {labels[status] || status}
    </span>
  );
}

function DetailRow({
  label,
  value,
  mono = false,
  children,
}: {
  label: string;
  value?: string | null;
  mono?: boolean;
  children?: React.ReactNode;
}) {
  if (!children && (!value || value === "Unknown" || value === "Unknown Plan"))
    return null;
  return (
    <div className="flex items-start justify-between py-2.5 border-b border-border/50 last:border-0">
      <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold shrink-0 w-36">
        {label}
      </span>
      {children ? (
        <div className="text-sm text-right">{children}</div>
      ) : (
        <span className={`text-sm text-right ${mono ? "data-value" : ""}`}>
          {value}
        </span>
      )}
    </div>
  );
}

function AvcEditor({
  serviceExternalId,
  currentAvc,
}: {
  serviceExternalId: string;
  currentAvc: string | null | undefined;
}) {
  const [editing, setEditing] = useState(false);
  const [avcValue, setAvcValue] = useState(currentAvc || "");
  const updateAvc = trpc.billing.updateAvc.useMutation();
  const utils = trpc.useUtils();

  const handleSave = async () => {
    if (!avcValue.trim()) return;
    try {
      await updateAvc.mutateAsync({
        serviceExternalId,
        connectionId: avcValue.trim(),
      });
      toast.success("AVC/Connection ID updated");
      setEditing(false);
      utils.billing.services.byId.invalidate({ id: serviceExternalId });
    } catch {
      toast.error("Failed to update AVC");
    }
  };

  const hasAvc = currentAvc && currentAvc.trim() !== "";

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={avcValue}
          onChange={(e) => setAvcValue(e.target.value)}
          placeholder="Enter AVC ID (e.g. AVC000068152861)"
          className="w-56 px-2 py-1 text-xs font-mono bg-background border border-primary/30 rounded outline-none focus:ring-1 focus:ring-primary/40"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
            if (e.key === "Escape") setEditing(false);
          }}
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

  if (hasAvc) {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="data-value">{currentAvc}</span>
        <button
          onClick={() => setEditing(true)}
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
      onClick={() => setEditing(true)}
      className="inline-flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded hover:bg-amber-100 transition-colors"
    >
      <AlertTriangle className="w-3.5 h-3.5" />
      Missing AVC — click to add
    </button>
  );
}

function DiscoveryNotesPanel({ service }: { service: any }) {
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
      utils.billing.services.byId.invalidate({ id: service.externalId });
    } catch {
      toast.error("Failed to save notes");
    }
  };

  const hasExistingNotes = service.discoveryNotes && service.discoveryNotes.trim() !== "";

  return (
    <div className="bg-card border border-border rounded-lg p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <StickyNote className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Discovery Notes
          </h2>
          {hasExistingNotes && (
            <MessageSquare className="w-3.5 h-3.5 text-amber-600" />
          )}
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

      {isEditing || !hasExistingNotes ? (
        <div className="space-y-3">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add notes about this service — e.g. investigation findings, who to contact, what action to take..."
            className="w-full px-3 py-2.5 text-sm bg-background border border-border rounded-md outline-none focus:ring-2 focus:ring-ring resize-y min-h-[100px] transition-all"
            rows={4}
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
            <p className="text-[10px] text-muted-foreground mt-3 pt-2 border-t border-border/50">
              Last updated by {service.notesAuthor}
              {service.notesUpdatedAt && (
                <> · {new Date(service.notesUpdatedAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}</>
              )}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function CustomerNameEditor({ service }: { service: any }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(service.customerName || "");
  const updateName = trpc.billing.updateCustomerName.useMutation();
  const utils = trpc.useUtils();

  const handleSave = async () => {
    try {
      await updateName.mutateAsync({
        serviceExternalId: service.externalId,
        customerName: name.trim(),
      });
      toast.success("Customer name updated");
      setEditing(false);
      utils.billing.services.byId.invalidate({ id: service.externalId });
      utils.billing.unmatched.list.invalidate();
    } catch {
      toast.error("Failed to update customer name");
    }
  };

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter customer name"
          className="flex-1 px-2 py-1 text-sm bg-background border border-primary/30 rounded outline-none focus:ring-1 focus:ring-primary/40"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
            if (e.key === "Escape") setEditing(false);
          }}
        />
        <button
          onClick={handleSave}
          disabled={updateName.isPending}
          className="p-1 text-emerald-600 hover:text-emerald-700"
        >
          <Check className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => { setName(service.customerName || ""); setEditing(false); }}
          className="p-1 text-muted-foreground hover:text-foreground"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  if (service.customerName) {
    return (
      <div>
        <span className="inline-flex items-center gap-2">
          <p className="text-sm font-medium">{service.customerName}</p>
          <button
            onClick={() => setEditing(true)}
            className="p-0.5 text-muted-foreground/50 hover:text-primary transition-colors"
            title="Edit customer name"
          >
            <Pencil className="w-3 h-3" />
          </button>
        </span>
        <p className="text-xs text-muted-foreground mt-0.5">
          Not linked to a customer record
        </p>
      </div>
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="inline-flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded hover:bg-amber-100 transition-colors"
    >
      <Pencil className="w-3.5 h-3.5" />
      Unassigned — click to set customer name
    </button>
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
      utils.billing.services.byId.invalidate({ id: service.externalId });
      utils.billing.unmatched.list.invalidate();
      utils.billing.summary.invalidate();
      utils.billing.customers.list.invalidate();
    } catch {
      toast.error("Failed to update status");
    }
  };

  const currentStatus = service.status;

  return (
    <div className="flex flex-wrap gap-2">
      {currentStatus !== "flagged_for_termination" && currentStatus !== "terminated" && (
        <button
          onClick={() => handleStatusChange("flagged_for_termination")}
          disabled={updateStatus.isPending}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm border border-destructive/30 text-destructive rounded-md hover:bg-destructive/5 transition-colors disabled:opacity-50"
        >
          {updateStatus.isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Flag className="w-3.5 h-3.5" />
          )}
          Flag for Termination
        </button>
      )}
      {currentStatus === "flagged_for_termination" && (
        <>
          <button
            onClick={() => handleStatusChange("terminated")}
            disabled={updateStatus.isPending}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors disabled:opacity-50"
          >
            {updateStatus.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Ban className="w-3.5 h-3.5" />
            )}
            Mark as Terminated
          </button>
          <button
            onClick={() => handleStatusChange(service.customerExternalId ? "active" : "unmatched")}
            disabled={updateStatus.isPending}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm border border-border text-foreground rounded-md hover:bg-accent transition-colors disabled:opacity-50"
          >
            Unflag
          </button>
        </>
      )}
      {currentStatus === "terminated" && (
        <button
          onClick={() => handleStatusChange(service.customerExternalId ? "active" : "unmatched")}
          disabled={updateStatus.isPending}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm border border-border text-foreground rounded-md hover:bg-accent transition-colors disabled:opacity-50"
        >
          Undo Termination
        </button>
      )}
      {(currentStatus === "active" || currentStatus === "unmatched") && (
        <button
          onClick={() =>
            toast.info("Edit customer link — feature coming soon")
          }
          className="inline-flex items-center gap-2 px-3 py-2 text-sm border border-border text-foreground rounded-md hover:bg-accent transition-colors"
        >
          <Building2 className="w-3.5 h-3.5" />
          Edit Customer Link
        </button>
      )}
    </div>
  );
}

export default function ServiceDetail() {
  const params = useParams<{ id: string }>();
  const { service, location, customer, isLoading } = useServiceDetail(
    params.id || ""
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!service) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <p>Service not found</p>
        <Link
          href="/customers"
          className="text-sm underline mt-2 inline-block"
        >
          Back to customers
        </Link>
      </div>
    );
  }

  const billingHistory = service.billingHistory || [];
  const hasAvc = service.connectionId && service.connectionId.trim() !== "";
  const isTerminated = service.status === "terminated";
  const isFlagged = service.status === "flagged_for_termination";

  return (
    <div className="p-6 lg:p-8 max-w-3xl">
      {/* Breadcrumb */}
      {customer ? (
        <Link
          href={`/customers/${customer.externalId || customer.id}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to {customer.name}
        </Link>
      ) : (
        <Link
          href="/customers"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Customers
        </Link>
      )}

      {/* Termination Banner */}
      {isTerminated && (
        <div className="bg-gray-100 border border-gray-200 rounded-lg p-4 mb-4 flex items-start gap-3">
          <Ban className="w-5 h-5 text-gray-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-700">
              This service has been terminated
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              It is no longer active and should be removed from Telstra billing.
            </p>
          </div>
        </div>
      )}

      {/* Flagged Banner */}
      {isFlagged && (
        <div className="bg-rose-50 border border-rose-200 rounded-lg p-4 mb-4 flex items-start gap-3">
          <Flag className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-rose-800">
              This service is flagged for termination
            </p>
            <p className="text-xs text-rose-700 mt-0.5">
              Review and confirm termination, or unflag if this service should remain active.
            </p>
          </div>
        </div>
      )}

      {/* Service Header */}
      <div className="flex items-start gap-4 mb-6">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
          isTerminated ? "bg-gray-100 text-gray-400" : isFlagged ? "bg-rose-50 text-rose-600" : "bg-muted text-muted-foreground"
        }`}>
          <ServiceTypeIcon type={service.serviceType} />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className={`text-xl font-bold tracking-tight ${isTerminated ? "line-through text-muted-foreground" : ""}`}>
            {service.serviceType} — {service.planName || "Unknown Plan"}
          </h1>
          <div className="flex items-center gap-3 mt-1.5">
            <StatusBadge status={service.status} />
            <ProviderBadge provider={service.provider} />
            <span className="data-value text-muted-foreground">
              {service.phoneNumber ||
                service.connectionId ||
                service.serviceId}
            </span>
          </div>
        </div>
      </div>

      {/* No Data Use Banner */}
      {service.noDataUse === 1 && (
        <div className="bg-orange-50 border-2 border-orange-400 rounded-lg p-4 mb-4 flex items-start gap-3">
          <ZapOff className="w-5 h-5 text-orange-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-bold text-orange-800">
              No Data Use Detected — Termination Prospect
            </p>
            <p className="text-xs text-orange-700 mt-0.5">
              This SIM has shown no data usage in the 2025 Blitz Report analysis period.
              Consider flagging for termination to reduce costs.
            </p>
            {service.blitzCategory && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {service.blitzCategory.split(', ').map((cat: string, i: number) => (
                  <span key={i} className="text-[10px] bg-orange-100 text-orange-800 px-1.5 py-0.5 rounded font-medium">
                    {cat}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* AVC Warning Banner */}
      {!hasAvc && !isTerminated && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-800">
              AVC/Connection ID is missing
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              This service does not have an AVC or Connection ID recorded.
              Adding one will improve matching confidence and help identify this
              service on Telstra invoices.
            </p>
            <div className="mt-2">
              <AvcEditor
                serviceExternalId={service.externalId}
                currentAvc={service.connectionId}
              />
            </div>
          </div>
        </div>
      )}

      {/* Attributes Panel */}
      <div className="bg-card border border-border rounded-lg p-5 mb-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Service Attributes
        </h2>
        <DetailRow label="Provider" value={service.provider || 'Unknown'} />
        <DetailRow label="Supplier" value={service.supplierName} />
        <DetailRow label="Account" value={service.supplierAccount} mono />
        <DetailRow
          label="Service Type"
          value={service.serviceTypeDetail || service.serviceType}
        />
        <DetailRow label="Plan" value={service.planName} />
        <DetailRow label="Phone Number" value={service.phoneNumber} mono />
        <DetailRow label="AVC / Conn ID">
          <AvcEditor
            serviceExternalId={service.externalId}
            currentAvc={service.connectionId}
          />
        </DetailRow>
        <DetailRow label="Email" value={service.email} mono />
        <DetailRow label="Location ID" value={service.locId} mono />
        <DetailRow label="IP Address" value={service.ipAddress} mono />
        <DetailRow
          label="Monthly Cost"
          value={`$${Number(service.monthlyCost).toLocaleString("en-AU", { minimumFractionDigits: 2 })}`}
          mono
        />
      </div>

      {/* SIM & Hardware Panel */}
      {(service.simSerialNumber || service.hardwareType || service.macAddress || service.modemSerialNumber || service.dataPlanGb || service.simOwner || service.purchaseDate || service.lastWanIp || service.wifiPassword || service.dataSource) && (
        <div className="bg-card border border-border rounded-lg p-5 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <CreditCard className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              SIM & Hardware
            </h2>
            {service.dataSource && (
              <span className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-medium">
                {service.dataSource}
              </span>
            )}
          </div>
          <DetailRow label="SIM Serial" value={service.simSerialNumber} mono />
          <DetailRow label="Hardware" value={service.hardwareType} />
          <DetailRow label="Modem S/N" value={service.modemSerialNumber} mono />
          <DetailRow label="MAC Address" value={service.macAddress} mono />
          <DetailRow label="Data Plan" value={service.dataPlanGb ? `${service.dataPlanGb} GB` : null} />
          <DetailRow label="SIM Owner" value={service.simOwner} />
          <DetailRow label="Purchase Date" value={service.purchaseDate} />
          <DetailRow label="Last WAN IP" value={service.lastWanIp} mono />
          <DetailRow label="WiFi Password" value={service.wifiPassword} mono />
        </div>
      )}

      {/* Device & Blitz Report Info */}
      {(service.imei || service.deviceName || service.deviceType || service.deviceCategory || service.imsi || service.userName || service.serviceActivationDate || service.flexiplanName || service.contractEndDate) && (
        <div className="bg-card border border-border rounded-lg p-5 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Device & Contract Info
            </h2>
            <span className="text-[10px] bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded font-medium">
              2025 Blitz Report
            </span>
          </div>
          <DetailRow label="IMEI" value={service.imei} mono />
          <DetailRow label="IMSI" value={service.imsi} mono />
          <DetailRow label="Device Name" value={service.deviceName} />
          <DetailRow label="Device Type" value={service.deviceType} />
          <DetailRow label="Category" value={service.deviceCategory} />
          <DetailRow label="User Name" value={service.userName} />
          <DetailRow label="Activated" value={service.serviceActivationDate} />
          <DetailRow label="Service End" value={service.serviceEndDate} />
          <DetailRow label="Flexiplan" value={service.flexiplanName || service.flexiplanCode} />
          <DetailRow label="Contract End" value={service.contractEndDate} />
        </div>
      )}

      {/* Proposed Plan */}
      {service.proposedPlan && (
        <div className="bg-card border border-blue-200 rounded-lg p-5 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <CircleDollarSign className="w-4 h-4 text-blue-600" />
            <h2 className="text-xs font-semibold uppercase tracking-wider text-blue-700">
              Proposed Plan
            </h2>
          </div>
          <DetailRow label="Plan" value={service.proposedPlan} />
          <DetailRow label="Cost" value={service.proposedCost ? `$${service.proposedCost}/mo` : null} mono />
          <DetailRow label="Data" value={service.proposedDataGb ? `${service.proposedDataGb} GB` : null} />
        </div>
      )}

      {/* Carbon API Data (ABB) */}
      {(service.carbonServiceId || service.avcId || service.technology || service.speedTier || service.carbonPlanName || service.carbonAlias) && (
        <div className="bg-card border border-indigo-200 rounded-lg p-5 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <Database className="w-4 h-4 text-indigo-600" />
            <h2 className="text-xs font-semibold uppercase tracking-wider text-indigo-700">
              Carbon API Data (ABB)
            </h2>
            <span className="text-[10px] bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded font-medium border border-indigo-200">
              Aussie Broadband
            </span>
          </div>
          <DetailRow label="Carbon ID" value={service.carbonServiceId} mono />
          <DetailRow label="AVC ID" value={service.avcId} mono />
          <DetailRow label="Alias" value={service.carbonAlias} />
          <DetailRow label="Technology" value={service.technology} />
          <DetailRow label="Speed Tier" value={service.speedTier} />
          <DetailRow label="NBN SLA" value={service.nbnSla} />
          <DetailRow label="Support Pack" value={service.supportPack} />
          <DetailRow label="POI" value={service.poiName} />
          <DetailRow label="Zone" value={service.zone} />
          <DetailRow label="Carbon Plan" value={service.carbonPlanName} />
          <DetailRow label="Carbon Status" value={service.carbonStatus} />
          <DetailRow label="Open Date" value={service.openDate} />
          {service.carbonMonthlyCost && parseFloat(String(service.carbonMonthlyCost)) > 0 && (
            <DetailRow
              label="Carbon Cost"
              value={`$${parseFloat(String(service.carbonMonthlyCost)).toLocaleString("en-AU", { minimumFractionDigits: 2 })}/mo`}
              mono
            />
          )}
        </div>
      )}

      {/* Customer & Location */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        {customer ? (
          <Link href={`/customers/${customer.externalId || customer.id}`}>
            <div className="bg-card border border-border rounded-lg p-4 hover:bg-accent/30 transition-colors">
              <div className="flex items-center gap-2 mb-2">
                <Building2 className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Customer
                </span>
              </div>
              <p className="text-sm font-medium">{customer.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {customer.serviceCount} services · $
                {Number(customer.monthlyCost).toLocaleString("en-AU", {
                  minimumFractionDigits: 2,
                })}
                /mo
              </p>
            </div>
          </Link>
        ) : (
          <div className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Customer
              </span>
            </div>
            <CustomerNameEditor service={service} />
          </div>
        )}

        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <MapPin className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Location
            </span>
          </div>
          <p className="text-sm font-medium">
            {location?.address || service.locationAddress || "Unknown"}
          </p>
        </div>
      </div>

      {/* Discovery Notes */}
      <div className="mb-4">
        <DiscoveryNotesPanel service={service} />
      </div>

      {/* Billing History */}
      <div className="bg-card border border-border rounded-lg p-5 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <FileText className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Billing History
          </h2>
        </div>

        {billingHistory.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No invoice line items matched to this service
          </p>
        ) : (
          <div className="space-y-0">
            {billingHistory.map(
              (
                item: { period: string; source: string; cost: number },
                idx: number
              ) => (
                <div
                  key={idx}
                  className="flex items-center justify-between py-2.5 border-b border-border/50 last:border-0"
                >
                  <div>
                    <p className="text-sm">{item.period}</p>
                    <p className="text-[10px] text-muted-foreground data-value mt-0.5">
                      {item.source}
                    </p>
                  </div>
                  <span className="data-value text-sm font-medium">
                    {item.cost > 0
                      ? `$${Number(item.cost).toLocaleString("en-AU", { minimumFractionDigits: 2 })}`
                      : "\u2014"}
                  </span>
                </div>
              )
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="bg-card border border-border rounded-lg p-5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Actions
        </h2>
        <ServiceStatusActions service={service} />
      </div>
    </div>
  );
}
