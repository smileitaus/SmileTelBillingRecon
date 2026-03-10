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
} from "lucide-react";
import { useCustomerDetail } from "@/hooks/useData";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { toast } from "sonner";
import { ProviderBadge } from "@/components/ProviderBadge";

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

function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: "status-active",
    unmatched: "status-unmatched",
    flagged_for_termination: "inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full border bg-rose-50 text-rose-700 border-rose-200",
    terminated: "inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full border bg-gray-100 text-gray-500 border-gray-200",
    flagged: "status-flagged",
    review: "status-review",
  };
  const labels: Record<string, string> = {
    active: "Matched",
    unmatched: "Unmatched",
    flagged_for_termination: "Flagged",
    terminated: "Terminated",
    flagged: "Flagged",
    review: "Review",
  };
  const cls = styles[status] || "status-review";
  const label = labels[status] || status;
  return (
    <span className={cls}>
      {status === "flagged_for_termination" && <Flag className="w-2.5 h-2.5" />}
      {status === "terminated" && <Ban className="w-2.5 h-2.5" />}
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
function ServiceRow({ service }: { service: any }) {
  const hasAvc = service.connectionId && service.connectionId.trim() !== "";
  const isTerminated = service.status === "terminated";
  const isFlagged = service.status === "flagged_for_termination";
  const hasNotes = service.discoveryNotes && service.discoveryNotes.trim() !== "";

  return (
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
            <AvcInlineEditor service={service} />
            {!service.phoneNumber && !hasAvc && (
              <span className="data-value text-muted-foreground">
                {service.serviceId}
              </span>
            )}
          </div>
        </div>
        <div className="text-right shrink-0 hidden sm:block">
          <span className="data-value text-sm">
            $
            {Number(service.monthlyCost).toLocaleString("en-AU", {
              minimumFractionDigits: 2,
            })}
          </span>
          <span className="text-[10px] text-muted-foreground block">
            /month
          </span>
        </div>
        <div className="shrink-0 hidden md:block">
          <StatusPill status={service.status} />
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
      </div>
    </Link>
  );
}

export default function CustomerDetail() {
  const params = useParams<{ id: string }>();
  const {
    customer,
    customerServices,
    customerLocations,
    servicesByLocation,
    isLoading,
  } = useCustomerDetail(params.id || "");

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

  // AVC tracking
  const servicesWithAvc = customerServices.filter(
    (s) => s.connectionId && s.connectionId.trim() !== ""
  ).length;
  const servicesMissingAvc = customerServices.length - servicesWithAvc;

  // Services without a proper location
  const unlocatedServices = customerServices.filter(
    (s) => !s.locationAddress || s.locationAddress === "Unknown Location"
  );
  const locatedLocations = customerLocations.filter(
    (l) => l.address && l.address !== "Unknown Location"
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
        <h1 className="text-xl font-bold tracking-tight">{customer.name}</h1>
        <div className="flex flex-wrap items-center gap-3 mt-2">
          {customer.billingPlatforms.map((p: string) => (
            <span
              key={p}
              className="text-[10px] px-2 py-0.5 bg-muted rounded font-medium text-muted-foreground uppercase tracking-wider"
            >
              {p}
            </span>
          ))}
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
            Monthly Cost
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
                /{customerServices.length}
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
                    <ServiceRow key={svc.id} service={svc} />
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
                    <ServiceRow key={svc.id} service={svc} />
                  ))}
              </div>
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
            (s: { connectionId?: string | null }) =>
              !s.connectionId || s.connectionId.trim() === ""
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
                    <ServiceRow key={svc.id} service={svc} />
                  )
                )}
              </div>
            </div>
          );
        })}

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
                <ServiceRow key={svc.id} service={svc} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
