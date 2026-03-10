/*
 * Swiss Data Design — Customer Detail View
 * Summary panel + locations as grouped sections + services as rows within
 * Left colour stripe on location groups indicating health
 */

import { Link, useParams } from "wouter";
import { ArrowLeft, MapPin, Wifi, Phone, Smartphone, Globe, ChevronRight, AlertTriangle, Loader2 } from "lucide-react";
import { useCustomerDetail } from "@/hooks/useData";

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
  const cls =
    status === "active"
      ? "status-active"
      : status === "unmatched"
        ? "status-unmatched"
        : status === "flagged"
          ? "status-flagged"
          : "status-review";
  const label =
    status === "active"
      ? "Matched"
      : status === "unmatched"
        ? "Unmatched"
        : status === "flagged"
          ? "Flagged"
          : "Review";
  return <span className={cls}>{label}</span>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ServiceRow({ service }: { service: any }) {
  return (
    <Link href={`/services/${service.externalId || service.id}`} asChild>
      <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/50 transition-colors cursor-pointer group border-b border-border/30 last:border-0">
        <div className="w-7 h-7 rounded-md bg-muted flex items-center justify-center text-muted-foreground">
          <ServiceTypeIcon type={service.serviceType} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">{service.serviceType}</span>
            <span className="text-xs text-muted-foreground">{service.serviceTypeDetail || service.planName}</span>
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            {service.phoneNumber && (
              <span className="data-value text-muted-foreground">{service.phoneNumber}</span>
            )}
            {service.connectionId && (
              <span className="data-value text-muted-foreground">{service.connectionId}</span>
            )}
            {!service.phoneNumber && !service.connectionId && (
              <span className="data-value text-muted-foreground">{service.serviceId}</span>
            )}
          </div>
        </div>
        <div className="text-right shrink-0 hidden sm:block">
          <span className="data-value text-sm">
            ${Number(service.monthlyCost).toLocaleString("en-AU", { minimumFractionDigits: 2 })}
          </span>
          <span className="text-[10px] text-muted-foreground block">/month</span>
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
  const { customer, customerServices, customerLocations, servicesByLocation, isLoading } =
    useCustomerDetail(params.id || "");

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
        <Link href="/customers" className="text-sm underline mt-2 inline-block">
          Back to customers
        </Link>
      </div>
    );
  }

  const totalCost = customerServices.reduce((sum, s) => sum + Number(s.monthlyCost), 0);
  const matchedCount = customerServices.filter((s) => s.status === "active").length;
  const unmatchedCount = customerServices.filter((s) => s.status === "unmatched").length;

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
      <Link href="/customers" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4">
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <div className="bg-card border border-border rounded-lg px-4 py-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            Total Services
          </p>
          <p className="text-2xl font-bold mt-1 data-value">{customerServices.length}</p>
        </div>
        <div className="bg-card border border-border rounded-lg px-4 py-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            Monthly Cost
          </p>
          <p className="text-2xl font-bold mt-1 data-value">
            ${totalCost.toLocaleString("en-AU", { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="bg-card border border-border rounded-lg px-4 py-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            Matched
          </p>
          <p className="text-2xl font-bold mt-1 data-value text-teal">{matchedCount}</p>
        </div>
        <div className="bg-card border border-border rounded-lg px-4 py-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            Unmatched
          </p>
          <p className={`text-2xl font-bold mt-1 data-value ${unmatchedCount > 0 ? "text-amber" : "text-muted-foreground"}`}>
            {unmatchedCount}
          </p>
        </div>
      </div>

      {/* Locations & Services */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Locations & Services
        </h2>

        {locatedLocations.map((loc) => {
          const locId = loc.externalId || String(loc.id);
          const locServices = servicesByLocation[locId] || [];
          const locUnmatched = locServices.filter((s: { status: string }) => s.status === "unmatched").length;
          const borderColor = locUnmatched > 0 ? "border-l-amber" : "border-l-teal";

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
                <span className="text-xs text-muted-foreground shrink-0">
                  {locServices.length} service{locServices.length !== 1 ? "s" : ""}
                </span>
              </div>

              {/* Services */}
              <div>
                {locServices.map((svc: { id: number; externalId?: string }) => (
                  <ServiceRow key={svc.id} service={svc} />
                ))}
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
                <p className="text-xs text-muted-foreground">Services without a confirmed site address</p>
              </div>
              <span className="text-xs text-muted-foreground shrink-0">
                {unlocatedServices.length} service{unlocatedServices.length !== 1 ? "s" : ""}
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
