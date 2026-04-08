/**
 * Termination Archive
 * Allows bulk archiving of services from a supplier termination list.
 * Archived services are hidden from all active workflows but remain
 * in the database for dispute resolution.
 */
import { useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Archive,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  RotateCcw,
  Scissors,
  XCircle,
} from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────────────────────

function parsePhoneList(raw: string): string[] {
  return raw
    .split(/[\n,;]+/)
    .map((s) => s.trim().replace(/\s+/g, ""))
    .filter((s) => s.length >= 8);
}

function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function TerminationArchive() {
  const utils = trpc.useUtils();

  // ── State ──────────────────────────────────────────────────────────────────
  const [phoneInput, setPhoneInput] = useState("");
  const [sourceFile, setSourceFile] = useState("");
  const [confirmedDate, setConfirmedDate] = useState("");
  const [dryRunResult, setDryRunResult] = useState<any>(null);
  const [archiveResult, setArchiveResult] = useState<any>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [expandedBatch, setExpandedBatch] = useState<string | null>(null);
  const [restoreDialog, setRestoreDialog] = useState<{ externalId: string; phone: string } | null>(null);
  const [restoreReason, setRestoreReason] = useState("");

  // ── Queries ────────────────────────────────────────────────────────────────
  const { data: batches, isLoading: batchesLoading } = trpc.termination.listBatches.useQuery();
  const { data: flaggedNotArchived } = trpc.termination.getFlaggedNotArchived.useQuery();
  const { data: batchServices } = trpc.termination.getBatchServices.useQuery(
    { batchId: expandedBatch! },
    { enabled: !!expandedBatch }
  );

  // ── Mutations ──────────────────────────────────────────────────────────────
  const bulkArchive = trpc.termination.bulkArchive.useMutation({
    onSuccess: () => {
      utils.termination.listBatches.invalidate();
      utils.termination.getFlaggedNotArchived.invalidate();
    },
  });
  const restoreService = trpc.termination.restoreService.useMutation({
    onSuccess: () => {
      utils.termination.getBatchServices.invalidate({ batchId: expandedBatch! });
      utils.termination.listBatches.invalidate();
      toast.success("Service restored", { description: "Service has been restored to active status." });
      setRestoreDialog(null);
      setRestoreReason("");
    },
  });

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleDryRun = useCallback(async () => {
    const phones = parsePhoneList(phoneInput);
    if (phones.length === 0) {
      toast.error("No phone numbers", { description: "Please paste at least one phone number." });
      return;
    }
    try {
      const result = await bulkArchive.mutateAsync({
        phoneNumbers: phones,
        sourceFile,
        supplierName: "Telstra",
        terminationConfirmedDate: confirmedDate,
        dryRun: true,
      });
      setDryRunResult(result);
      setArchiveResult(null);
    } catch (e: any) {
      toast.error("Error", { description: e.message });
    }
  }, [phoneInput, sourceFile, confirmedDate, bulkArchive]);

  const handleArchive = useCallback(async () => {
    const phones = parsePhoneList(phoneInput);
    try {
      const result = await bulkArchive.mutateAsync({
        phoneNumbers: phones,
        sourceFile,
        supplierName: "Telstra",
        terminationConfirmedDate: confirmedDate,
        dryRun: false,
      });
      setArchiveResult(result);
      setDryRunResult(null);
      setConfirmOpen(false);
      setPhoneInput("");
      toast.success("Archive complete", { description: `${result.archived} services archived. ${result.notFound} not found.` });
    } catch (e: any) {
      toast.error("Error", { description: e.message });
      setConfirmOpen(false);
    }
  }, [phoneInput, sourceFile, confirmedDate, bulkArchive]);

  const handleRestore = useCallback(async () => {
    if (!restoreDialog) return;
    await restoreService.mutateAsync({
      serviceExternalId: restoreDialog.externalId,
      reason: restoreReason,
    });
  }, [restoreDialog, restoreReason, restoreService]);

  const downloadReport = useCallback((batch: any, services: any[]) => {
    const lines = [
      `Termination Archive Report`,
      `Batch ID: ${batch.batchId}`,
      `Supplier: ${batch.supplierName}`,
      `Source File: ${batch.sourceFile}`,
      `Processed: ${formatDate(batch.processedAt)}`,
      `Processed By: ${batch.processedBy}`,
      ``,
      `SUMMARY`,
      `Total Requested: ${batch.totalServices}`,
      `Successfully Archived: ${batch.archivedCount}`,
      `Not Found: ${batch.notFoundCount}`,
      ``,
    ];

    if (batch.discrepancyNotes) {
      lines.push(`DISCREPANCIES`, batch.discrepancyNotes, ``);
    }

    lines.push(
      `ARCHIVED SERVICES`,
      `Phone Number,Customer,Plan,Supplier Account,Archived At`,
      ...services.map(
        (s) => `${s.phoneNumber},${s.customerName || ""},${s.planName || ""},${s.supplierAccount || ""},${formatDate(s.archivedAt)}`
      )
    );

    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `termination-report-${batch.batchId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const phoneCount = parsePhoneList(phoneInput).length;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-destructive/10 rounded-lg">
          <Scissors className="w-6 h-6 text-destructive" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Termination Archive</h1>
          <p className="text-sm text-muted-foreground">
            Archive confirmed terminated services from supplier lists. Services are hidden from all active workflows but remain retrievable for disputes.
          </p>
        </div>
      </div>

      {/* Discrepancy Alert — flagged but not yet archived */}
      {flaggedNotArchived && flaggedNotArchived.length > 0 && (
        <Card className="border-amber-500/50 bg-amber-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-amber-600 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              {flaggedNotArchived.length} Telstra services flagged for termination but not yet archived
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-3">
              These services have status <code className="bg-muted px-1 rounded">flagged_for_termination</code> in the database but have not been matched to any termination batch. They may need to be included in the next archive run.
            </p>
            <div className="max-h-40 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Phone</TableHead>
                    <TableHead className="text-xs">Customer</TableHead>
                    <TableHead className="text-xs">Plan</TableHead>
                    <TableHead className="text-xs">Account</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {flaggedNotArchived.map((s: any) => (
                    <TableRow key={s.externalId}>
                      <TableCell className="text-xs font-mono">{s.phoneNumber}</TableCell>
                      <TableCell className="text-xs">{s.customerName || "—"}</TableCell>
                      <TableCell className="text-xs">{s.planName || "—"}</TableCell>
                      <TableCell className="text-xs">{s.supplierAccount || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Input Form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Archive className="w-4 h-4" />
            New Termination Batch
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="sourceFile">Source File / Reference</Label>
              <Input
                id="sourceFile"
                placeholder="e.g. Telstra_Terminations_Mar2026.xlsx"
                value={sourceFile}
                onChange={(e) => setSourceFile(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirmedDate">Termination Confirmed Date</Label>
              <Input
                id="confirmedDate"
                type="date"
                value={confirmedDate}
                onChange={(e) => setConfirmedDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="phones">
              Phone Numbers{" "}
              {phoneCount > 0 && (
                <Badge variant="secondary" className="ml-1 text-xs">{phoneCount} numbers</Badge>
              )}
            </Label>
            <Textarea
              id="phones"
              placeholder="Paste phone numbers here — one per line, or comma/semicolon separated&#10;e.g.&#10;0412345678&#10;0298765432&#10;0387654321"
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              className="font-mono text-sm min-h-[160px]"
            />
            <p className="text-xs text-muted-foreground">
              Accepts 10-digit Australian numbers with or without leading 0. Spaces are stripped automatically.
            </p>
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={handleDryRun}
              disabled={bulkArchive.isPending || phoneCount === 0}
            >
              <FileText className="w-4 h-4 mr-2" />
              Preview Match
            </Button>
            <Button
              variant="destructive"
              onClick={() => setConfirmOpen(true)}
              disabled={bulkArchive.isPending || phoneCount === 0}
            >
              <Archive className="w-4 h-4 mr-2" />
              Archive {phoneCount > 0 ? `${phoneCount} Services` : "Services"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Dry Run Result */}
      {dryRunResult && (
        <Card className="border-blue-500/50 bg-blue-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-blue-600 flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Preview — {dryRunResult.willArchive} of {dryRunResult.totalRequested} services will be archived
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-4 text-sm">
              <span className="flex items-center gap-1.5 text-green-600">
                <CheckCircle2 className="w-4 h-4" />
                {dryRunResult.willArchive} matched
              </span>
              {dryRunResult.notFound > 0 && (
                <span className="flex items-center gap-1.5 text-destructive">
                  <XCircle className="w-4 h-4" />
                  {dryRunResult.notFound} not found
                </span>
              )}
            </div>

            {dryRunResult.notFound > 0 && (
              <div>
                <p className="text-xs font-medium text-destructive mb-1">Numbers not found in database:</p>
                <div className="bg-muted/50 rounded p-2 font-mono text-xs max-h-24 overflow-y-auto">
                  {dryRunResult.notFoundPhones.join(", ")}
                </div>
              </div>
            )}

            <div className="max-h-48 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Phone</TableHead>
                    <TableHead className="text-xs">Customer</TableHead>
                    <TableHead className="text-xs">Plan</TableHead>
                    <TableHead className="text-xs">Current Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dryRunResult.matchedServices?.map((s: any) => (
                    <TableRow key={s.externalId}>
                      <TableCell className="text-xs font-mono">{s.phoneNumber}</TableCell>
                      <TableCell className="text-xs">{s.customerName || "—"}</TableCell>
                      <TableCell className="text-xs">{s.planName || "—"}</TableCell>
                      <TableCell className="text-xs">
                        <Badge variant={s.currentStatus === "active" ? "default" : "secondary"} className="text-xs">
                          {s.currentStatus}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <Button onClick={() => setConfirmOpen(true)} variant="destructive" size="sm">
              <Archive className="w-4 h-4 mr-2" />
              Confirm Archive
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Archive Result */}
      {archiveResult && (
        <Card className="border-green-500/50 bg-green-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-green-600 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              Archive Complete — Batch {archiveResult.batchId}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-6 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Requested</p>
                <p className="font-semibold">{archiveResult.totalRequested}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Archived</p>
                <p className="font-semibold text-green-600">{archiveResult.archived}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Not Found</p>
                <p className="font-semibold text-destructive">{archiveResult.notFound}</p>
              </div>
            </div>
            {archiveResult.notFound > 0 && (
              <div className="mt-3">
                <p className="text-xs font-medium text-destructive mb-1">Numbers not found (discrepancies):</p>
                <div className="bg-muted/50 rounded p-2 font-mono text-xs max-h-24 overflow-y-auto">
                  {archiveResult.notFoundPhones.join(", ")}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Batch History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Archive History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {batchesLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : !batches || batches.length === 0 ? (
            <p className="text-sm text-muted-foreground">No termination batches yet.</p>
          ) : (
            <div className="space-y-2">
              {batches.map((batch) => (
                <div key={batch.batchId} className="border border-border rounded-lg overflow-hidden">
                  {/* Batch header row */}
                  <button
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors text-left"
                    onClick={() =>
                      setExpandedBatch(expandedBatch === batch.batchId ? null : batch.batchId)
                    }
                  >
                    <div className="flex items-center gap-3">
                      {expandedBatch === batch.batchId ? (
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      )}
                      <div>
                        <p className="text-sm font-medium font-mono">{batch.batchId}</p>
                        <p className="text-xs text-muted-foreground">
                          {batch.sourceFile || "No source file"} · {formatDate(batch.processedAt)} · {batch.processedBy}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant="secondary" className="text-xs">
                        {batch.archivedCount}/{batch.totalServices} archived
                      </Badge>
                      {batch.notFoundCount > 0 && (
                        <Badge variant="destructive" className="text-xs">
                          {batch.notFoundCount} not found
                        </Badge>
                      )}
                    </div>
                  </button>

                  {/* Expanded batch detail */}
                  {expandedBatch === batch.batchId && (
                    <div className="border-t border-border bg-muted/20 p-4 space-y-3">
                      {batch.discrepancyNotes && (
                        <div className="bg-amber-500/10 border border-amber-500/30 rounded p-3">
                          <p className="text-xs font-medium text-amber-600 mb-1 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            Discrepancies
                          </p>
                          <p className="text-xs text-muted-foreground">{batch.discrepancyNotes}</p>
                        </div>
                      )}

                      <div className="flex justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => batchServices && downloadReport(batch, batchServices)}
                          disabled={!batchServices}
                        >
                          <Download className="w-3 h-3 mr-1.5" />
                          Download CSV Report
                        </Button>
                      </div>

                      {batchServices && batchServices.length > 0 ? (
                        <div className="max-h-64 overflow-y-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-xs">Phone</TableHead>
                                <TableHead className="text-xs">Customer</TableHead>
                                <TableHead className="text-xs">Plan</TableHead>
                                <TableHead className="text-xs">Account</TableHead>
                                <TableHead className="text-xs">Archived</TableHead>
                                <TableHead className="text-xs">Actions</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {batchServices.map((s: any) => (
                                <TableRow key={s.externalId}>
                                  <TableCell className="text-xs font-mono">{s.phoneNumber}</TableCell>
                                  <TableCell className="text-xs">{s.customerName || "—"}</TableCell>
                                  <TableCell className="text-xs">{s.planName || "—"}</TableCell>
                                  <TableCell className="text-xs">{s.supplierAccount || "—"}</TableCell>
                                  <TableCell className="text-xs">{formatDate(s.archivedAt)}</TableCell>
                                  <TableCell className="text-xs">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 px-2 text-xs"
                                      onClick={() =>
                                        setRestoreDialog({
                                          externalId: s.externalId,
                                          phone: s.phoneNumber,
                                        })
                                      }
                                    >
                                      <RotateCcw className="w-3 h-3 mr-1" />
                                      Restore
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">Loading services...</p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confirm Archive Dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Archive className="w-5 h-5" />
              Confirm Bulk Archive
            </DialogTitle>
            <DialogDescription>
              You are about to archive <strong>{phoneCount} services</strong> from the Telstra termination list.
              These services will be hidden from all active workflows and billing reconciliation.
              This action can be reversed individually per service if needed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <div className="bg-muted/50 rounded p-3 space-y-1">
              <p><span className="text-muted-foreground">Source:</span> {sourceFile || "Not specified"}</p>
              <p><span className="text-muted-foreground">Confirmed Date:</span> {confirmedDate || "Not specified"}</p>
              <p><span className="text-muted-foreground">Services to archive:</span> {phoneCount}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleArchive}
              disabled={bulkArchive.isPending}
            >
              {bulkArchive.isPending ? "Archiving..." : "Archive Services"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Restore Service Dialog */}
      <Dialog open={!!restoreDialog} onOpenChange={(o) => !o && setRestoreDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="w-5 h-5" />
              Restore Service
            </DialogTitle>
            <DialogDescription>
              Restore <strong>{restoreDialog?.phone}</strong> from archived status back to active.
              This is typically done when a termination is disputed with the supplier.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Reason for Restoration</Label>
            <Textarea
              placeholder="e.g. Telstra confirmed service is still active — dispute lodged ref #12345"
              value={restoreReason}
              onChange={(e) => setRestoreReason(e.target.value)}
              className="min-h-[80px]"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRestoreDialog(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleRestore}
              disabled={restoreService.isPending}
            >
              {restoreService.isPending ? "Restoring..." : "Restore Service"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
