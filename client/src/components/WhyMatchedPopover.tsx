/**
 * WhyMatchedPopover — shows the match provenance history for a service.
 * Triggered by a small info button on service rows in CustomerDetail.
 * Displays: method badge, source, matched by, matched at, criteria, confidence,
 * and a "Flag as incorrect" action.
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Info,
  Flag,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  User,
  Clock,
  Layers,
  Database,
  X,
} from "lucide-react";
import { toast } from "sonner";

// ─── Label maps ──────────────────────────────────────────────────────────────

const METHOD_LABELS: Record<string, string> = {
  manual: "Manual Assignment",
  auto_avc: "Auto — AVC ID Match",
  auto_phone: "Auto — Phone Match",
  auto_name: "Auto — Name/Alias Match",
  workbook_import: "Workbook Import",
  api_import: "API Import",
  system: "System",
};

const SOURCE_LABELS: Record<string, string> = {
  carbon_api: "ABB Carbon API",
  tiab_spreadsheet: "TIAB Spreadsheet",
  tiab_api: "TIAB API",
  vocus_api: "Vocus API",
  sasboss_api: "SasBoss API",
  datagate_api: "DataGate API",
  workbook_upload: "Workbook Upload",
  manual_ui: "Manual (UI)",
  system: "System",
};

const CONFIDENCE_COLORS: Record<string, string> = {
  high: "bg-green-100 text-green-800 border-green-200",
  medium: "bg-amber-100 text-amber-800 border-amber-200",
  low: "bg-red-100 text-red-800 border-red-200",
};

const METHOD_COLORS: Record<string, string> = {
  manual: "bg-blue-100 text-blue-800",
  auto_avc: "bg-green-100 text-green-800",
  auto_phone: "bg-green-100 text-green-800",
  auto_name: "bg-amber-100 text-amber-800",
  workbook_import: "bg-purple-100 text-purple-800",
  api_import: "bg-cyan-100 text-cyan-800",
  system: "bg-gray-100 text-gray-600",
};

// ─── FlagForm ────────────────────────────────────────────────────────────────

function FlagForm({
  eventId,
  onDone,
}: {
  eventId: number;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const utils = trpc.useUtils();
  const flagMutation = trpc.billing.services.matchProvenance.flag.useMutation({
    onSuccess: () => {
      toast.success("Match flagged for review");
      utils.billing.services.matchProvenance.get.invalidate();
      onDone();
    },
    onError: () => toast.error("Failed to flag match"),
  });

  return (
    <div className="mt-3 pt-3 border-t border-border space-y-2">
      <p className="text-xs font-medium text-destructive">Flag as potentially incorrect</p>
      <Textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Describe why this match may be incorrect…"
        className="text-xs min-h-[60px] resize-none"
      />
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="destructive"
          className="text-xs h-7"
          disabled={!reason.trim() || flagMutation.isPending}
          onClick={() => flagMutation.mutate({ eventId, flagReason: reason.trim() })}
        >
          {flagMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Flag className="w-3 h-3 mr-1" />}
          Submit Flag
        </Button>
        <Button size="sm" variant="ghost" className="text-xs h-7" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ─── ProvenanceEvent ─────────────────────────────────────────────────────────

function ProvenanceEvent({
  event,
  isLatest,
}: {
  event: {
    id: number;
    matchMethod: string;
    matchSource: string;
    matchedBy: string;
    matchedAt: Date | string;
    matchCriteria: string | null;
    confidence: string;
    notes: string | null;
    flaggedForReview: boolean;
    flaggedBy: string | null;
    flagReason: string | null;
    _synthesised?: boolean;
  };
  isLatest: boolean;
}) {
  const [showFlagForm, setShowFlagForm] = useState(false);
  const utils = trpc.useUtils();
  const clearFlagMutation = trpc.billing.services.matchProvenance.clearFlag.useMutation({
    onSuccess: () => {
      toast.success("Flag cleared");
      utils.billing.services.matchProvenance.get.invalidate();
    },
  });

  let criteria: Record<string, unknown> | null = null;
  try {
    if (event.matchCriteria) criteria = JSON.parse(event.matchCriteria);
  } catch { /* ignore */ }

  const matchedAt = new Date(event.matchedAt);

  return (
    <div className={`rounded-lg border p-3 space-y-2 ${isLatest ? "border-primary/30 bg-primary/3" : "border-border bg-muted/20"}`}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${METHOD_COLORS[event.matchMethod] || "bg-gray-100 text-gray-600"}`}>
            {METHOD_LABELS[event.matchMethod] || event.matchMethod}
          </span>
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${CONFIDENCE_COLORS[event.confidence] || "bg-gray-100 text-gray-600"}`}>
            {event.confidence.charAt(0).toUpperCase() + event.confidence.slice(1)} confidence
          </span>
          {event.flaggedForReview && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-red-100 text-red-700 border border-red-200 flex items-center gap-0.5">
              <AlertTriangle className="w-2.5 h-2.5" /> Flagged
            </span>
          )}
        </div>
        {isLatest && !event.flaggedForReview && !event._synthesised && (
          <button
            onClick={() => setShowFlagForm(!showFlagForm)}
            className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
            title="Flag this match as potentially incorrect"
          >
            <Flag className="w-3.5 h-3.5" />
          </button>
        )}
        {isLatest && event.flaggedForReview && (
          <button
            onClick={() => clearFlagMutation.mutate({ eventId: event.id })}
            disabled={clearFlagMutation.isPending}
            className="shrink-0 text-muted-foreground hover:text-green-600 transition-colors"
            title="Clear this flag"
          >
            {clearFlagMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>

      {/* Meta rows */}
      <div className="space-y-1">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Database className="w-3 h-3 shrink-0" />
          <span>Source: <span className="text-foreground font-medium">{SOURCE_LABELS[event.matchSource] || event.matchSource}</span></span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <User className="w-3 h-3 shrink-0" />
          <span>By: <span className="text-foreground font-medium">{event.matchedBy}</span></span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="w-3 h-3 shrink-0" />
          <span>{matchedAt.toLocaleString()}</span>
        </div>
      </div>

      {/* Criteria */}
      {criteria && Object.keys(criteria).length > 0 && (
        <div className="rounded bg-muted/40 px-2 py-1.5 space-y-0.5">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
            <Layers className="w-2.5 h-2.5" /> Match Criteria
          </p>
          {Object.entries(criteria).map(([k, v]) => (
            <div key={k} className="flex gap-1 text-xs">
              <span className="text-muted-foreground shrink-0">{k}:</span>
              <span className="text-foreground font-mono break-all">{String(v)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Notes */}
      {event.notes && (
        <p className="text-xs text-muted-foreground italic">{event.notes}</p>
      )}

      {/* Flag info */}
      {event.flaggedForReview && event.flagReason && (
        <div className="rounded bg-red-50 border border-red-200 px-2 py-1.5">
          <p className="text-[10px] font-semibold text-red-700 mb-0.5">Flag reason</p>
          <p className="text-xs text-red-700">{event.flagReason}</p>
          {event.flaggedBy && (
            <p className="text-[10px] text-red-500 mt-0.5">— {event.flaggedBy}</p>
          )}
        </div>
      )}

      {event._synthesised && (
        <p className="text-[10px] text-muted-foreground italic border-t pt-1.5 mt-1">
          ⚠ Inferred from service data — this service was matched before the provenance system was introduced. Formal tracking applies to all new matches.
        </p>
      )}
      {showFlagForm && (
        <FlagForm eventId={event.id} onDone={() => setShowFlagForm(false)} />
      )}
    </div>
  );
}

// ─── WhyMatchedPopover ────────────────────────────────────────────────────────

export function WhyMatchedPopover({ serviceExternalId }: { serviceExternalId: string }) {
  const [open, setOpen] = useState(false);

  const { data: events, isLoading } = trpc.billing.services.matchProvenance.get.useQuery(
    { serviceExternalId },
    { enabled: open }
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          title="Why was this service matched?"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true); }}
          className="shrink-0 p-1 rounded text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-primary hover:bg-primary/10 transition-all"
        >
          <Info className="w-3.5 h-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="left"
        align="start"
        className="w-80 p-3 shadow-lg"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">Why was this matched?</h4>
            <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {isLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading provenance…
            </div>
          )}

          {!isLoading && (!events || events.length === 0) && (
            <div className="text-center py-4 space-y-1">
              <p className="text-sm text-muted-foreground">No match history recorded.</p>
              <p className="text-xs text-muted-foreground">
                Provenance is recorded for all new matches going forward.
                Existing matches pre-date this feature.
              </p>
            </div>
          )}

          {!isLoading && events && events.length > 0 && (
            <div className="space-y-2 max-h-[420px] overflow-y-auto pr-0.5">
              {events.map((event, idx) => (
                <ProvenanceEvent
                  key={event.id}
                  event={event as any}
                  isLatest={idx === 0}
                />
              ))}
            </div>
          )}

          <p className="text-[10px] text-muted-foreground border-t pt-2">
            {events && events.length > 0
              ? `${events.length} event${events.length !== 1 ? "s" : ""} recorded`
              : "Future matches will be recorded here automatically."}
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
