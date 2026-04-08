/**
 * RateCards — View and browse supplier wholesale rate cards.
 * Currently shows the Vocus Mobile Rate Card (Feb 2025).
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { FileText, ChevronDown, ChevronUp, DollarSign, Wifi, Phone, MessageSquare, Globe } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";

const CATEGORY_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  mobile_data_paygd:        { label: "4G Mobile Data (PAYGD)",       icon: <Wifi className="w-4 h-4" />,          color: "bg-blue-50 text-blue-800 border-blue-200" },
  mobile_data_legacy_bucket:{ label: "Mobile Data Buckets (Legacy)",  icon: <Wifi className="w-4 h-4" />,          color: "bg-cyan-50 text-cyan-800 border-cyan-200" },
  "4g_backup_data_bucket":  { label: "4G Backup Data Buckets",        icon: <Wifi className="w-4 h-4" />,          color: "bg-teal-50 text-teal-800 border-teal-200" },
  mobile_voice_bucket:      { label: "Mobile Voice Buckets",          icon: <Phone className="w-4 h-4" />,         color: "bg-green-50 text-green-800 border-green-200" },
  mobile_sms_bucket:        { label: "Mobile SMS Buckets",            icon: <MessageSquare className="w-4 h-4" />, color: "bg-yellow-50 text-yellow-800 border-yellow-200" },
  miscellaneous:            { label: "Miscellaneous Fees",            icon: <DollarSign className="w-4 h-4" />,    color: "bg-orange-50 text-orange-800 border-orange-200" },
  international_roaming_zone1: { label: "International Roaming — Zone 1", icon: <Globe className="w-4 h-4" />,   color: "bg-purple-50 text-purple-800 border-purple-200" },
};

function fmt(val: string | number | null | undefined, decimals = 4) {
  if (val === null || val === undefined || val === "") return "—";
  const n = typeof val === "string" ? parseFloat(val) : val;
  if (isNaN(n)) return "—";
  return `$${n.toFixed(decimals)}`;
}

function fmtNum(val: number | null | undefined) {
  if (val === null || val === undefined) return "—";
  return val.toLocaleString("en-AU");
}

function CategorySection({ rateCardId, category, categoryLabel }: {
  rateCardId: number;
  category: string;
  categoryLabel: string | null;
}) {
  const [open, setOpen] = useState(false);
  const { data: items, isLoading } = trpc.rateCards.getItems.useQuery(
    { rateCardId, category },
    { enabled: open }
  );

  const meta = CATEGORY_META[category];
  const label = meta?.label ?? categoryLabel ?? category;

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-gray-50 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          {meta?.icon && (
            <span className={`inline-flex items-center justify-center w-7 h-7 rounded-md border ${meta.color}`}>
              {meta.icon}
            </span>
          )}
          <span className="font-medium text-sm">{label}</span>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>

      {open && (
        <div className="border-t">
          {isLoading ? (
            <div className="p-4 text-sm text-gray-500">Loading...</div>
          ) : !items?.length ? (
            <div className="p-4 text-sm text-gray-500">No items found.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50">
                  <TableHead className="text-xs">Plan / Item</TableHead>
                  <TableHead className="text-xs text-right">Price (ex GST)</TableHead>
                  <TableHead className="text-xs text-right">Inclusion</TableHead>
                  <TableHead className="text-xs text-right">Overage Rate</TableHead>
                  <TableHead className="text-xs text-right">Access Fee</TableHead>
                  <TableHead className="text-xs">Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map(item => (
                  <TableRow key={item.id} className="text-sm">
                    <TableCell className="font-medium">{item.planName ?? "—"}</TableCell>
                    <TableCell className="text-right font-mono">
                      {item.priceExGst ? `${fmt(item.priceExGst, 4)}` : "—"}
                      {item.unit ? <span className="text-xs text-gray-400 ml-1">/{item.unit.replace("per_", "")}</span> : null}
                    </TableCell>
                    <TableCell className="text-right text-xs">
                      {item.inclusionGB ? `${fmtNum(Number(item.inclusionGB))} GB` :
                       item.inclusionMinutes ? `${fmtNum(item.inclusionMinutes)} min` :
                       item.inclusionSMS ? `${fmtNum(item.inclusionSMS)} SMS` : "—"}
                    </TableCell>
                    <TableCell className="text-right text-xs font-mono">
                      {item.overageRatePerGB ? `${fmt(item.overageRatePerGB, 6)}/GB` :
                       item.overageRatePerMinute ? `${fmt(item.overageRatePerMinute, 6)}/min` :
                       item.overageRatePerSMS ? `${fmt(item.overageRatePerSMS, 6)}/SMS` : "—"}
                    </TableCell>
                    <TableCell className="text-right text-xs font-mono">
                      {item.monthlyAccessFee ? `${fmt(item.monthlyAccessFee, 2)}/SIM/mo` : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-gray-500 max-w-xs truncate" title={item.notes ?? undefined}>
                      {item.notes ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      )}
    </div>
  );
}

export default function RateCards() {
  const { data: rateCards, isLoading } = trpc.rateCards.list.useQuery();
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const activeCard = rateCards?.find(rc => rc.id === selectedId) ?? rateCards?.[0];
  const activeId = activeCard?.id ?? null;

  const { data: categories } = trpc.rateCards.getCategories.useQuery(
    { rateCardId: activeId! },
    { enabled: !!activeId }
  );

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <FileText className="w-6 h-6 text-gray-600" />
        <div>
          <h1 className="text-xl font-semibold">Supplier Rate Cards</h1>
          <p className="text-sm text-gray-500">Wholesale pricing reference for cost calculations</p>
        </div>
      </div>

      {isLoading && <div className="text-sm text-gray-500">Loading rate cards...</div>}

      {rateCards && rateCards.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center text-gray-500">
            No rate cards have been ingested yet.
          </CardContent>
        </Card>
      )}

      {rateCards && rateCards.length > 0 && (
        <>
          {/* Rate card selector */}
          <div className="flex flex-wrap gap-2">
            {rateCards.map(rc => (
              <Button
                key={rc.id}
                variant={activeId === rc.id ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedId(rc.id)}
              >
                {rc.rateCardName}
                <Badge variant="secondary" className="ml-2 text-xs">
                  {new Date(rc.effectiveDate).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" })}
                </Badge>
              </Button>
            ))}
          </div>

          {activeCard && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base">{activeCard.rateCardName}</CardTitle>
                    <p className="text-sm text-gray-500 mt-1">
                      Effective {new Date(activeCard.effectiveDate).toLocaleDateString("en-AU", { day: "2-digit", month: "long", year: "numeric" })}
                      {" · "}{activeCard.currency} · All prices {activeCard.taxStatus === "excl_gst" ? "excluding GST" : "including GST"}
                    </p>
                    {activeCard.notes && (
                      <p className="text-xs text-gray-400 mt-1">{activeCard.notes}</p>
                    )}
                  </div>
                  <Badge variant={activeCard.isActive ? "default" : "secondary"}>
                    {activeCard.isActive ? "Active" : "Archived"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {!categories ? (
                  <div className="text-sm text-gray-500">Loading categories...</div>
                ) : (
                  categories.map(cat => (
                    <CategorySection
                      key={cat.category}
                      rateCardId={activeId!}
                      category={cat.category}
                      categoryLabel={cat.categoryLabel}
                    />
                  ))
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
