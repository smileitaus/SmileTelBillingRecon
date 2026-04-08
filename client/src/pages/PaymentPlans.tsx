/**
 * Payment Plans — tracks overdue debt arrangements with customers.
 * Shows all active payment plans, their invoice breakdowns, and allows
 * updating payment status per invoice.
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ChevronDown,
  ChevronRight,
  CreditCard,
  AlertTriangle,
  CheckCircle2,
  Clock,
  XCircle,
  User,
  Mail,
  Phone,
  Calendar,
  FileText,
} from "lucide-react";
import { format } from "date-fns";

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(amount: number | string | null | undefined) {
  const n = parseFloat(String(amount ?? 0));
  return isNaN(n) ? "$0.00" : `$${n.toFixed(2)}`;
}

function fmtDate(d: string | Date | null | undefined) {
  if (!d) return "—";
  try {
    return format(new Date(d), "dd MMM yyyy");
  } catch {
    return String(d);
  }
}

const STATUS_COLORS: Record<string, string> = {
  active: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  completed: "bg-green-500/20 text-green-300 border-green-500/30",
  defaulted: "bg-red-500/20 text-red-300 border-red-500/30",
  cancelled: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
};

const PAYMENT_STATUS_COLORS: Record<string, string> = {
  outstanding: "bg-red-500/20 text-red-300 border-red-500/30",
  promised: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  paid: "bg-green-500/20 text-green-300 border-green-500/30",
  disputed: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  waived: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
};

const PAYMENT_STATUS_ICONS: Record<string, React.ReactNode> = {
  outstanding: <AlertTriangle className="h-3 w-3" />,
  promised: <Clock className="h-3 w-3" />,
  paid: <CheckCircle2 className="h-3 w-3" />,
  disputed: <XCircle className="h-3 w-3" />,
  waived: <XCircle className="h-3 w-3" />,
};

// ── Invoice Status Update Dialog ─────────────────────────────────────────────

interface InvoiceStatusDialogProps {
  invoice: {
    id: number;
    invoiceNumber: string;
    amountIncGst: string;
    paymentStatus: string;
    customerName: string;
  };
  onClose: () => void;
  onSaved: () => void;
}

function InvoiceStatusDialog({ invoice, onClose, onSaved }: InvoiceStatusDialogProps) {
  const [status, setStatus] = useState(invoice.paymentStatus);
  const [paidDate, setPaidDate] = useState("");

  const updateMutation = trpc.paymentPlans.updateInvoiceStatus.useMutation({
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-zinc-900 border-zinc-700 text-zinc-100 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">Update Invoice Status</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="bg-zinc-800 rounded-lg p-3 text-sm">
            <div className="font-semibold text-white">{invoice.invoiceNumber}</div>
            <div className="text-zinc-400">{invoice.customerName}</div>
            <div className="text-zinc-300 mt-1">{fmt(invoice.amountIncGst)} inc GST</div>
          </div>
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Payment Status</label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="bg-zinc-800 border-zinc-600 text-zinc-100">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-zinc-800 border-zinc-700">
                {["outstanding", "promised", "paid", "disputed", "waived"].map((s) => (
                  <SelectItem key={s} value={s} className="text-zinc-100 focus:bg-zinc-700 focus:text-white capitalize">
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {status === "paid" && (
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Paid Date</label>
              <input
                type="date"
                value={paidDate}
                onChange={(e) => setPaidDate(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-600 rounded-md px-3 py-2 text-zinc-100 text-sm"
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-zinc-600 text-zinc-300">
            Cancel
          </Button>
          <Button
            onClick={() =>
              updateMutation.mutate({
                id: invoice.id,
                paymentStatus: status as "outstanding" | "promised" | "paid" | "disputed" | "waived",
                paidDate: paidDate || undefined,
              })
            }
            disabled={updateMutation.isPending}
            className="bg-orange-600 hover:bg-orange-700 text-white"
          >
            {updateMutation.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Plan Card ─────────────────────────────────────────────────────────────────

interface PlanCardProps {
  plan: {
    planId: string;
    customerName: string;
    contactName: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
    totalOverdueIncGst: string;
    totalOverdueExGst: string;
    status: "active" | "completed" | "defaulted" | "cancelled";
    agreedTerms: string | null;
    sourceReference: string | null;
    notes: string | null;
    arrangementDate: Date | string | null;
    targetClearDate: Date | string | null;
    invoiceStats: {
      totalInvoices: number;
      totalIncGst: number;
      paidIncGst: number;
      outstandingIncGst: number;
      paidCount: number;
      outstandingCount: number;
    };
  };
}

function PlanCard({ plan }: PlanCardProps) {
  const [expanded, setExpanded] = useState(true);
  const [editingInvoice, setEditingInvoice] = useState<null | {
    id: number;
    invoiceNumber: string;
    amountIncGst: string;
    paymentStatus: string;
    customerName: string;
  }>(null);

  const utils = trpc.useUtils();
  const { data: planDetail, isLoading } = trpc.paymentPlans.getPlan.useQuery(
    { planId: plan.planId },
    { enabled: expanded }
  );

  const stats = plan.invoiceStats;
  const paidPct =
    stats.totalIncGst > 0
      ? Math.round((stats.paidIncGst / stats.totalIncGst) * 100)
      : 0;

  // Group invoices by site
  const invoicesBySite: Record<string, NonNullable<typeof planDetail>["invoices"]> = {};
  if (planDetail && planDetail.invoices) {
    for (const inv of planDetail.invoices) {
      if (!invoicesBySite[inv.customerName]) invoicesBySite[inv.customerName] = [];
      invoicesBySite[inv.customerName].push(inv);
    }
  }

  return (
    <Card className="bg-zinc-900 border-zinc-700">
      {/* Plan header */}
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-zinc-400 hover:text-zinc-200 flex-shrink-0"
            >
              {expanded ? (
                <ChevronDown className="h-5 w-5" />
              ) : (
                <ChevronRight className="h-5 w-5" />
              )}
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <CardTitle className="text-white text-base">{plan.customerName}</CardTitle>
                <Badge
                  variant="outline"
                  className={`text-xs ${STATUS_COLORS[plan.status] ?? ""}`}
                >
                  {plan.status}
                </Badge>
                <span className="text-xs text-zinc-500 font-mono">{plan.planId}</span>
              </div>
              {/* Contact row */}
              <div className="flex flex-wrap gap-3 mt-1 text-xs text-zinc-400">
                {plan.contactName && (
                  <span className="flex items-center gap-1">
                    <User className="h-3 w-3" /> {plan.contactName}
                  </span>
                )}
                {plan.contactEmail && (
                  <span className="flex items-center gap-1">
                    <Mail className="h-3 w-3" />{" "}
                    <a
                      href={`mailto:${plan.contactEmail}`}
                      className="hover:text-orange-400 underline"
                    >
                      {plan.contactEmail}
                    </a>
                  </span>
                )}
                {plan.contactPhone && (
                  <span className="flex items-center gap-1">
                    <Phone className="h-3 w-3" /> {plan.contactPhone}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Financial summary */}
          <div className="flex-shrink-0 text-right">
            <div className="text-lg font-bold text-white">
              {fmt(plan.totalOverdueIncGst)}{" "}
              <span className="text-xs font-normal text-zinc-400">inc GST</span>
            </div>
            <div className="text-xs text-zinc-400">
              {fmt(plan.totalOverdueExGst)} ex GST
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-3">
          <div className="flex justify-between text-xs text-zinc-400 mb-1">
            <span>
              {stats.paidCount} of {stats.totalInvoices} invoices paid
            </span>
            <span>{paidPct}% cleared</span>
          </div>
          <div className="h-2 bg-zinc-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 rounded-full transition-all"
              style={{ width: `${paidPct}%` }}
            />
          </div>
          <div className="flex justify-between text-xs mt-1">
            <span className="text-green-400">Paid: {fmt(stats.paidIncGst)}</span>
            <span className="text-amber-400">
              Outstanding: {fmt(stats.outstandingIncGst)}
            </span>
          </div>
        </div>

        {/* Dates */}
        <div className="flex flex-wrap gap-4 mt-2 text-xs text-zinc-400">
          {plan.arrangementDate && (
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" /> Arranged: {fmtDate(plan.arrangementDate)}
            </span>
          )}
          {plan.targetClearDate && (
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" /> Target clear: {fmtDate(plan.targetClearDate)}
            </span>
          )}
        </div>
      </CardHeader>

      {/* Expanded invoice detail */}
      {expanded && (
        <CardContent className="pt-0">
          {/* Agreed terms */}
          {plan.agreedTerms && (
            <div className="mb-4 bg-zinc-800 rounded-lg p-3 text-xs text-zinc-300 border border-zinc-700">
              <div className="flex items-center gap-1 text-zinc-400 mb-1 font-medium">
                <FileText className="h-3 w-3" /> Agreed Terms
              </div>
              <p className="whitespace-pre-wrap">{plan.agreedTerms}</p>
            </div>
          )}

          {/* Notes */}
          {plan.notes && (
            <div className="mb-4 bg-zinc-800/50 rounded-lg p-3 text-xs text-zinc-400 border border-zinc-700/50">
              <div className="font-medium text-zinc-500 mb-1">Notes</div>
              <p className="whitespace-pre-wrap">{plan.notes}</p>
            </div>
          )}

          {/* Source reference */}
          {plan.sourceReference && (
            <div className="mb-4 text-xs text-zinc-500 italic">
              Source: {plan.sourceReference}
            </div>
          )}

          {isLoading ? (
            <div className="text-zinc-500 text-sm py-4 text-center">Loading invoices…</div>
          ) : (
            <div className="space-y-4">
              {Object.entries(invoicesBySite).map(([siteName, siteInvoices]) => {
                const siteTotal = siteInvoices.reduce(
                  (s, i) => s + parseFloat(String(i.amountIncGst)),
                  0
                );
                const sitePaid = siteInvoices.filter(
                  (i) => i.paymentStatus === "paid"
                ).length;
                return (
                  <div key={siteName}>
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="text-sm font-medium text-zinc-300">{siteName}</h4>
                      <span className="text-xs text-zinc-400">
                        {fmt(siteTotal)} inc GST · {sitePaid}/{siteInvoices.length} paid
                      </span>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow className="border-zinc-700 hover:bg-transparent">
                          <TableHead className="text-zinc-400 text-xs py-1.5 h-auto">Invoice</TableHead>
                          <TableHead className="text-zinc-400 text-xs py-1.5 h-auto">Date</TableHead>
                          <TableHead className="text-zinc-400 text-xs py-1.5 h-auto">Description</TableHead>
                          <TableHead className="text-zinc-400 text-xs py-1.5 h-auto text-right">Amount (inc GST)</TableHead>
                          <TableHead className="text-zinc-400 text-xs py-1.5 h-auto">Status</TableHead>
                          <TableHead className="text-zinc-400 text-xs py-1.5 h-auto">Due / Paid</TableHead>
                          <TableHead className="w-16" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {siteInvoices.map((inv) => (
                          <TableRow
                            key={inv.id}
                            className="border-zinc-800 hover:bg-zinc-800/40"
                          >
                            <TableCell className="text-xs font-mono text-zinc-200 py-2">
                              {inv.invoiceNumber}
                              {inv.isFinalInvoice && (
                                <span className="ml-1 text-[10px] text-orange-400 font-sans">FINAL</span>
                              )}
                            </TableCell>
                            <TableCell className="text-xs text-zinc-400 py-2">
                              {fmtDate(inv.invoiceDate)}
                            </TableCell>
                            <TableCell className="text-xs text-zinc-400 py-2 max-w-xs truncate">
                              {inv.description || "—"}
                            </TableCell>
                            <TableCell className="text-xs text-zinc-200 py-2 text-right font-medium">
                              {fmt(inv.amountIncGst)}
                            </TableCell>
                            <TableCell className="py-2">
                              <Badge
                                variant="outline"
                                className={`text-[10px] flex items-center gap-1 w-fit ${
                                  PAYMENT_STATUS_COLORS[inv.paymentStatus] ?? ""
                                }`}
                              >
                                {PAYMENT_STATUS_ICONS[inv.paymentStatus]}
                                {inv.paymentStatus}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs text-zinc-400 py-2">
                              {inv.paymentStatus === "paid" && inv.paidDate
                                ? fmtDate(inv.paidDate)
                                : inv.promisedPaymentDate
                                ? `By ${fmtDate(inv.promisedPaymentDate)}`
                                : "—"}
                            </TableCell>
                            <TableCell className="py-2">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 px-2 text-xs text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700"
                                onClick={() =>
                                  setEditingInvoice({
                                    id: inv.id,
                                    invoiceNumber: inv.invoiceNumber,
                                    amountIncGst: String(inv.amountIncGst),
                                    paymentStatus: inv.paymentStatus,
                                    customerName: inv.customerName,
                                  })
                                }
                              >
                                Edit
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      )}

      {editingInvoice && (
        <InvoiceStatusDialog
          invoice={editingInvoice}
          onClose={() => setEditingInvoice(null)}
          onSaved={() => utils.paymentPlans.getPlan.invalidate({ planId: plan.planId })}
        />
      )}
    </Card>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function PaymentPlans() {
  const { data: plans, isLoading } = trpc.paymentPlans.listPlans.useQuery();

  const activePlans = plans?.filter((p) => p.status === "active") ?? [];
  const otherPlans = plans?.filter((p) => p.status !== "active") ?? [];

  const totalOutstanding = activePlans.reduce(
    (s, p) => s + parseFloat(String(p.invoiceStats?.outstandingIncGst ?? 0)),
    0
  );
  const totalOverdue = activePlans.reduce(
    (s, p) => s + parseFloat(String(p.totalOverdueIncGst ?? 0)),
    0
  );

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <CreditCard className="h-6 w-6 text-orange-400" />
            Payment Plans
          </h1>
          <p className="text-sm text-zinc-400 mt-0.5">
            Overdue debt arrangements and invoice payment tracking
          </p>
        </div>
      </div>

      {/* Summary cards */}
      {!isLoading && plans && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-3">
            <div className="text-xs text-zinc-400">Active Plans</div>
            <div className="text-2xl font-bold text-white">{activePlans.length}</div>
          </div>
          <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-3">
            <div className="text-xs text-zinc-400">Total Overdue</div>
            <div className="text-2xl font-bold text-red-400">{fmt(totalOverdue)}</div>
            <div className="text-[10px] text-zinc-500">inc GST</div>
          </div>
          <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-3">
            <div className="text-xs text-zinc-400">Still Outstanding</div>
            <div className="text-2xl font-bold text-amber-400">{fmt(totalOutstanding)}</div>
            <div className="text-[10px] text-zinc-500">inc GST</div>
          </div>
          <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-3">
            <div className="text-xs text-zinc-400">Cleared</div>
            <div className="text-2xl font-bold text-green-400">
              {fmt(totalOverdue - totalOutstanding)}
            </div>
            <div className="text-[10px] text-zinc-500">inc GST</div>
          </div>
        </div>
      )}

      {/* Active plans */}
      {isLoading ? (
        <div className="text-zinc-400 text-sm py-8 text-center">Loading payment plans…</div>
      ) : activePlans.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-8 text-center text-zinc-400">
          No active payment plans
        </div>
      ) : (
        <div className="space-y-4">
          {activePlans.map((plan) => (
            <PlanCard key={plan.planId} plan={plan as any} />
          ))}
        </div>
      )}

      {/* Completed / cancelled plans */}
      {otherPlans.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-zinc-400 mb-3">Completed / Cancelled</h2>
          <div className="space-y-4">
            {otherPlans.map((plan) => (
              <PlanCard key={plan.planId} plan={plan as any} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
