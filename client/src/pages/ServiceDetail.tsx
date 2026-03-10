/*
 * Swiss Data Design — Service Detail View
 * All attributes, billing history timeline, status & actions
 * Monospaced data values, thin horizontal rules
 */

import { Link, useParams } from "wouter";
import { ArrowLeft, Wifi, Phone, Smartphone, Globe, MapPin, Building2, FileText, Flag, AlertTriangle, Loader2 } from "lucide-react";
import { useServiceDetail } from "@/hooks/useData";
import { toast } from "sonner";

function ServiceTypeIcon({ type }: { type: string }) {
  switch (type) {
    case "Internet": return <Wifi className="w-5 h-5" />;
    case "Mobile": return <Smartphone className="w-5 h-5" />;
    case "Voice": return <Phone className="w-5 h-5" />;
    default: return <Globe className="w-5 h-5" />;
  }
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: "bg-teal/10 text-teal border-teal/20",
    unmatched: "bg-amber/10 text-amber border-amber/20",
    flagged: "bg-rose/10 text-rose border-rose/20",
    terminated: "bg-muted text-muted-foreground border-border",
  };
  const labels: Record<string, string> = {
    active: "Active & Matched",
    unmatched: "Unmatched",
    flagged: "Flagged for Review",
    terminated: "Terminated",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-full border ${styles[status] || styles.unmatched}`}>
      {labels[status] || status}
    </span>
  );
}

function DetailRow({ label, value, mono = false }: { label: string; value: string | null | undefined; mono?: boolean }) {
  if (!value || value === "Unknown" || value === "Unknown Plan") return null;
  return (
    <div className="flex items-start justify-between py-2.5 border-b border-border/50 last:border-0">
      <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold shrink-0 w-36">
        {label}
      </span>
      <span className={`text-sm text-right ${mono ? "data-value" : ""}`}>{value}</span>
    </div>
  );
}

export default function ServiceDetail() {
  const params = useParams<{ id: string }>();
  const { service, location, customer, isLoading } = useServiceDetail(params.id || "");

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
        <Link href="/customers" className="text-sm underline mt-2 inline-block">
          Back to customers
        </Link>
      </div>
    );
  }

  const billingHistory = service.billingHistory || [];

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

      {/* Service Header */}
      <div className="flex items-start gap-4 mb-6">
        <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-muted-foreground shrink-0">
          <ServiceTypeIcon type={service.serviceType} />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold tracking-tight">
            {service.serviceType} — {service.planName || "Unknown Plan"}
          </h1>
          <div className="flex items-center gap-3 mt-1.5">
            <StatusBadge status={service.status} />
            <span className="data-value text-muted-foreground">
              {service.phoneNumber || service.connectionId || service.serviceId}
            </span>
          </div>
        </div>
      </div>

      {/* Attributes Panel */}
      <div className="bg-card border border-border rounded-lg p-5 mb-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Service Attributes
        </h2>
        <DetailRow label="Supplier" value={service.supplierName} />
        <DetailRow label="Account" value={service.supplierAccount} mono />
        <DetailRow label="Service Type" value={service.serviceTypeDetail || service.serviceType} />
        <DetailRow label="Plan" value={service.planName} />
        <DetailRow label="Phone Number" value={service.phoneNumber} mono />
        <DetailRow label="Connection ID" value={service.connectionId} mono />
        <DetailRow label="Email" value={service.email} mono />
        <DetailRow label="Location ID" value={service.locId} mono />
        <DetailRow label="IP Address" value={service.ipAddress} mono />
        <DetailRow
          label="Monthly Cost"
          value={`$${Number(service.monthlyCost).toLocaleString("en-AU", { minimumFractionDigits: 2 })}`}
          mono
        />
      </div>

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
                {customer.serviceCount} services · ${Number(customer.monthlyCost).toLocaleString("en-AU", { minimumFractionDigits: 2 })}/mo
              </p>
            </div>
          </Link>
        ) : (
          <div className="bg-card border border-border rounded-lg p-4 border-l-[3px] border-l-amber">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-amber" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Customer
              </span>
            </div>
            <p className="text-sm font-medium text-amber">Unassigned</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              This service is not linked to a customer
            </p>
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
            {billingHistory.map((item: { period: string; source: string; cost: number }, idx: number) => (
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
                    : "—"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="bg-card border border-border rounded-lg p-5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Actions
        </h2>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => toast.info("Flag for termination — feature coming soon")}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm border border-destructive/30 text-destructive rounded-md hover:bg-destructive/5 transition-colors"
          >
            <Flag className="w-3.5 h-3.5" />
            Flag for Termination
          </button>
          <button
            onClick={() => toast.info("Edit customer link — feature coming soon")}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm border border-border text-foreground rounded-md hover:bg-accent transition-colors"
          >
            <Building2 className="w-3.5 h-3.5" />
            Edit Customer Link
          </button>
        </div>
      </div>
    </div>
  );
}
