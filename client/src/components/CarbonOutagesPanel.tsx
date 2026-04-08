/**
 * Carbon Service Outages Panel
 * Shows current, scheduled, and resolved outage data for an ABB service.
 * Uses GET /service/{service}/outages from the Carbon API.
 */
import { useState } from "react";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Loader2,
  Radio,
  Wifi,
  WifiOff,
} from "lucide-react";
import { trpc } from "@/lib/trpc";

interface OutageEvent {
  reference: string;
  title: string;
  summary: string;
  start_time: string;
  end_time: string;
  restored_at: string;
  last_updated: string;
}

interface NbnOutage {
  created: string;
  status: string;
  comments: string;
  updated_at: string;
}

interface ScheduledOutage {
  start_date: string;
  end_date: string;
  duration: number;
}

interface ServiceOutages {
  networkEvents: OutageEvent[];
  aussieOutages: OutageEvent[];
  currentNbnOutages: NbnOutage[];
  scheduledNbnOutages: ScheduledOutage[];
  resolvedScheduledNbnOutages: ScheduledOutage[];
  resolvedNbnOutages: NbnOutage[];
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleString("en-AU", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

function OutageEventCard({ event, resolved }: { event: OutageEvent; resolved?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className={`border rounded-lg p-3 ${resolved ? "bg-muted/30 border-border" : "bg-red-50 border-red-200"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 flex-1 min-w-0">
          {resolved
            ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
            : <WifiOff className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
          }
          <div className="min-w-0">
            <p className="text-xs font-semibold text-foreground truncate">{event.title || event.reference}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {formatDate(event.start_time)}
              {event.end_time ? ` → ${formatDate(event.end_time)}` : " (ongoing)"}
            </p>
          </div>
        </div>
        {event.summary && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>
      {expanded && event.summary && (
        <p className="mt-2 pt-2 border-t border-current/10 text-xs text-foreground/80 leading-relaxed">
          {event.summary}
        </p>
      )}
    </div>
  );
}

function NbnOutageCard({ outage, resolved }: { outage: NbnOutage; resolved?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className={`border rounded-lg p-3 ${resolved ? "bg-muted/30 border-border" : "bg-orange-50 border-orange-200"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 flex-1 min-w-0">
          {resolved
            ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
            : <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-orange-600" />
          }
          <div className="min-w-0">
            <p className="text-xs font-semibold text-foreground">{outage.status}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Created: {formatDate(outage.created)}
              {outage.updated_at ? ` · Updated: ${formatDate(outage.updated_at)}` : ""}
            </p>
          </div>
        </div>
        {outage.comments && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>
      {expanded && outage.comments && (
        <p className="mt-2 pt-2 border-t border-current/10 text-xs text-foreground/80 leading-relaxed">
          {outage.comments}
        </p>
      )}
    </div>
  );
}

function ScheduledOutageCard({ outage, resolved }: { outage: ScheduledOutage; resolved?: boolean }) {
  return (
    <div className={`border rounded-lg p-3 ${resolved ? "bg-muted/30 border-border" : "bg-blue-50 border-blue-200"}`}>
      <div className="flex items-start gap-2">
        {resolved
          ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
          : <Calendar className="w-4 h-4 shrink-0 mt-0.5 text-blue-600" />
        }
        <div>
          <p className="text-xs font-semibold text-foreground">
            {resolved ? "Completed" : "Scheduled"} Maintenance
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {formatDate(outage.start_date)} → {formatDate(outage.end_date)}
            {outage.duration ? ` · ${outage.duration} min` : ""}
          </p>
        </div>
      </div>
    </div>
  );
}

interface CarbonOutagesPanelProps {
  carbonServiceId: string;
}

export default function CarbonOutagesPanel({ carbonServiceId }: CarbonOutagesPanelProps) {
  const [showResolved, setShowResolved] = useState(false);

  const { data: outages, isLoading, error } = trpc.billing.getServiceOutages.useQuery(
    { carbonServiceId },
    { refetchInterval: 5 * 60_000 } // refresh every 5 minutes
  );

  const hasActiveOutages =
    (outages?.networkEvents?.length ?? 0) > 0 ||
    (outages?.aussieOutages?.length ?? 0) > 0 ||
    (outages?.currentNbnOutages?.length ?? 0) > 0 ||
    (outages?.scheduledNbnOutages?.length ?? 0) > 0;

  const hasResolvedOutages =
    (outages?.resolvedNbnOutages?.length ?? 0) > 0 ||
    (outages?.resolvedScheduledNbnOutages?.length ?? 0) > 0;

  return (
    <div className="bg-card border border-border rounded-lg p-5 mb-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <Radio className="w-4 h-4 text-muted-foreground" />
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Service Outages
        </h2>
        <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded font-medium border border-border">
          Carbon API
        </span>
        {!isLoading && outages && (
          <span className={`ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
            hasActiveOutages
              ? "bg-red-50 text-red-700 border-red-200"
              : "bg-emerald-50 text-emerald-700 border-emerald-200"
          }`}>
            {hasActiveOutages ? "Active Issues" : "No Active Outages"}
          </span>
        )}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-4">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Loading outage data...
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 p-3 bg-muted/50 border border-border rounded-lg">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">Unable to load outage data: {error.message}</p>
        </div>
      )}

      {/* No outages */}
      {!isLoading && !error && outages && !hasActiveOutages && (
        <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
          <Wifi className="w-4 h-4 shrink-0 text-emerald-600" />
          <p className="text-xs text-emerald-800 font-medium">No active or scheduled outages for this service.</p>
        </div>
      )}

      {/* Active outages */}
      {!isLoading && !error && outages && hasActiveOutages && (
        <div className="space-y-3">
          {/* Network Events */}
          {outages.networkEvents.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Network Events</p>
              <div className="space-y-2">
                {outages.networkEvents.map((e: OutageEvent, i: number) => (
                  <OutageEventCard key={e.reference || i} event={e} />
                ))}
              </div>
            </div>
          )}

          {/* Aussie Outages */}
          {outages.aussieOutages.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Aussie Broadband Outages</p>
              <div className="space-y-2">
                {outages.aussieOutages.map((e: OutageEvent, i: number) => (
                  <OutageEventCard key={e.reference || i} event={e} />
                ))}
              </div>
            </div>
          )}

          {/* Current NBN Outages */}
          {outages.currentNbnOutages.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Current NBN Outages</p>
              <div className="space-y-2">
                {outages.currentNbnOutages.map((o: NbnOutage, i: number) => (
                  <NbnOutageCard key={i} outage={o} />
                ))}
              </div>
            </div>
          )}

          {/* Scheduled NBN Outages */}
          {outages.scheduledNbnOutages.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Scheduled Maintenance</p>
              <div className="space-y-2">
                {outages.scheduledNbnOutages.map((o: ScheduledOutage, i: number) => (
                  <ScheduledOutageCard key={i} outage={o} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Resolved outages toggle */}
      {!isLoading && !error && hasResolvedOutages && (
        <div className="mt-4 pt-3 border-t border-border/50">
          <button
            onClick={() => setShowResolved(!showResolved)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {showResolved ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {showResolved ? "Hide" : "Show"} Resolved Outages
          </button>
          {showResolved && outages && (
            <div className="mt-3 space-y-3">
              {outages.resolvedNbnOutages.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Resolved NBN Outages</p>
                  <div className="space-y-2">
                    {outages.resolvedNbnOutages.map((o: NbnOutage, i: number) => (
                      <NbnOutageCard key={i} outage={o} resolved />
                    ))}
                  </div>
                </div>
              )}
              {outages.resolvedScheduledNbnOutages.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Completed Maintenance</p>
                  <div className="space-y-2">
                    {outages.resolvedScheduledNbnOutages.map((o: ScheduledOutage, i: number) => (
                      <ScheduledOutageCard key={i} outage={o} resolved />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
