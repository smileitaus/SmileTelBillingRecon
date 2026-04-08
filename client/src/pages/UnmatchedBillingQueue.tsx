/**
 * UnmatchedBillingQueue - Global queue of all customers with unmatched billing services.
 *
 * Shows every customer that has:
 *   - Services not yet assigned to a Xero billing item (unmatchedBillingCount > 0)
 *   - Services escalated for manual review (escalated_services table)
 *
 * Provides quick links to each customer's Billing Match page.
 */
import { useState, useMemo } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { ProviderBadge } from "@/components/ProviderBadge";
import {
  AlertTriangle,
  AlertCircle,
  Search,
  ExternalLink,
  Loader2,
  CheckCircle2,
  TrendingDown,
  ArrowRight,
  Receipt,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

function fmt(n: number) {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);
}

type Customer = {
  externalId: string;
  name: string;
  unmatchedBillingCount: number;
  monthlyCost: number;
  serviceCount: number;
};

export default function UnmatchedBillingQueue() {
  const [search, setSearch] = useState("");
  const [expandedCustomers, setExpandedCustomers] = useState<Set<string>>(new Set());

  // Fetch all customers with unmatchedBillingCount > 0
  const { data: allCustomers = [], isLoading: loadingCustomers } =
    trpc.billing.customers.list.useQuery({});

  // Fetch customers with escalations
  const { data: escalatedGroups = [], isLoading: loadingEscalated } =
    trpc.billing.customers.billingAssignments.customersWithEscalations.useQuery();

  // Filter customers with unmatched billing
  const unmatchedCustomers = useMemo(() => {
    const list = (allCustomers as Customer[]).filter(c => c.unmatchedBillingCount > 0);
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(c => c.name.toLowerCase().includes(q) || c.externalId.toLowerCase().includes(q));
  }, [allCustomers, search]);

  // Filter escalated groups
  const filteredEscalated = useMemo(() => {
    if (!search.trim()) return escalatedGroups;
    const q = search.toLowerCase();
    return escalatedGroups.filter((g: { customerName: string; customerExternalId: string }) =>
      g.customerName.toLowerCase().includes(q) || g.customerExternalId.toLowerCase().includes(q)
    );
  }, [escalatedGroups, search]);

  const toggleExpand = (id: string) => {
    setExpandedCustomers(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const totalUnmatched = unmatchedCustomers.reduce((s: number, c: Customer) => s + c.unmatchedBillingCount, 0);
  const totalEscalated = escalatedGroups.reduce((s: number, g: { escalationCount: number }) => s + g.escalationCount, 0);
  const totalCostAtRisk = unmatchedCustomers.reduce((s: number, c: Customer) => s + Number(c.monthlyCost), 0);

  const isLoading = loadingCustomers || loadingEscalated;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Receipt className="w-6 h-6 text-amber-500" />
            Unmatched Billing Queue
          </h1>
          <p className="text-muted-foreground mt-1">
            Customers with services that have not been linked to a Xero billing item.
            Review and resolve each customer to ensure accurate margin reporting.
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Customers Affected</p>
                <p className="text-3xl font-bold mt-1">{unmatchedCustomers.length}</p>
              </div>
              <AlertTriangle className="w-8 h-8 text-amber-400 opacity-60" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Unmatched Services</p>
                <p className="text-3xl font-bold mt-1 text-amber-600">{totalUnmatched}</p>
              </div>
              <AlertCircle className="w-8 h-8 text-amber-400 opacity-60" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Escalated Services</p>
                <p className="text-3xl font-bold mt-1 text-red-600">{totalEscalated}</p>
              </div>
              <TrendingDown className="w-8 h-8 text-red-400 opacity-60" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search customers..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Tabs defaultValue="unmatched">
          <TabsList>
            <TabsTrigger value="unmatched" className="gap-2">
              <AlertTriangle className="w-3.5 h-3.5" />
              Unmatched
              {unmatchedCustomers.length > 0 && (
                <Badge variant="secondary" className="ml-1">{unmatchedCustomers.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="escalated" className="gap-2">
              <AlertCircle className="w-3.5 h-3.5" />
              Escalated
              {totalEscalated > 0 && (
                <Badge variant="destructive" className="ml-1">{totalEscalated}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Unmatched tab */}
          <TabsContent value="unmatched" className="mt-4">
            {unmatchedCustomers.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-emerald-500" />
                  <p className="font-semibold text-lg">All clear!</p>
                  <p className="text-muted-foreground mt-1">
                    {search ? "No customers match your search." : "No customers have unmatched billing services."}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer</TableHead>
                      <TableHead className="text-center">Unmatched</TableHead>
                      <TableHead className="text-center">Total Services</TableHead>
                      <TableHead className="text-right">Monthly Cost (ex GST)</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {unmatchedCustomers.map((customer: Customer) => (
                      <TableRow key={customer.externalId}>
                        <TableCell>
                          <div>
                            <Link href={`/customers/${customer.externalId}`}>
                              <span className="font-medium hover:underline cursor-pointer">
                                {customer.name}
                              </span>
                            </Link>
                            <p className="text-xs text-muted-foreground font-mono">{customer.externalId}</p>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge
                            variant="outline"
                            className="border-amber-400 text-amber-700 bg-amber-50 dark:bg-amber-950/20"
                          >
                            {customer.unmatchedBillingCount} service{customer.unmatchedBillingCount !== 1 ? "s" : ""}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center text-muted-foreground">
                          {customer.serviceCount}
                        </TableCell>
                        <TableCell className="text-right font-semibold text-orange-600">
                          {fmt(Number(customer.monthlyCost))}
                        </TableCell>
                        <TableCell className="text-right">
                          <Link href={`/customers/${customer.externalId}/billing-match`}>
                            <Button size="sm" variant="outline" className="gap-1.5">
                              Match Services
                              <ArrowRight className="w-3.5 h-3.5" />
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )}
          </TabsContent>

          {/* Escalated tab */}
          <TabsContent value="escalated" className="mt-4">
            {filteredEscalated.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-emerald-500" />
                  <p className="font-semibold text-lg">No escalations</p>
                  <p className="text-muted-foreground mt-1">
                    {search ? "No customers match your search." : "No services have been escalated for review."}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {(filteredEscalated as Array<{
                  customerExternalId: string;
                  customerName: string;
                  escalationCount: number;
                  totalMonthlyCost: number;
                  services: Array<{
                    serviceExternalId: string;
                    serviceType: string;
                    planName: string;
                    monthlyCost: number;
                    provider: string;
                    locationAddress: string;
                    reason: string;
                    escalatedBy: string;
                    createdAt: Date;
                  }>;
                }>).map(group => (
                  <Card key={group.customerExternalId}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => toggleExpand(group.customerExternalId)}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            {expandedCustomers.has(group.customerExternalId) ? (
                              <ChevronDown className="w-4 h-4" />
                            ) : (
                              <ChevronRight className="w-4 h-4" />
                            )}
                          </button>
                          <div>
                            <CardTitle className="text-base">
                              <Link href={`/customers/${group.customerExternalId}`}>
                                <span className="hover:underline cursor-pointer">{group.customerName}</span>
                              </Link>
                            </CardTitle>
                            <CardDescription className="font-mono text-xs">
                              {group.customerExternalId}
                            </CardDescription>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge variant="destructive">
                            {group.escalationCount} escalated
                          </Badge>
                          <span className="text-sm font-semibold text-orange-600">
                            {fmt(group.totalMonthlyCost)}/mo
                          </span>
                          <Link href={`/customers/${group.customerExternalId}/billing-match`}>
                            <Button size="sm" variant="outline" className="gap-1.5">
                              Review
                              <ArrowRight className="w-3.5 h-3.5" />
                            </Button>
                          </Link>
                        </div>
                      </div>
                    </CardHeader>

                    {expandedCustomers.has(group.customerExternalId) && (
                      <CardContent className="pt-0">
                        <div className="border rounded-lg overflow-hidden">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Service</TableHead>
                                <TableHead>Provider</TableHead>
                                <TableHead>Location</TableHead>
                                <TableHead className="text-right">Cost (ex GST)</TableHead>
                                <TableHead>Reason</TableHead>
                                <TableHead>Escalated By</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {group.services.map(svc => (
                                <TableRow key={svc.serviceExternalId}>
                                  <TableCell>
                                    <div>
                                      <p className="font-medium text-sm">{svc.planName || svc.serviceType}</p>
                                      <p className="text-xs text-muted-foreground">{svc.serviceType}</p>
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <ProviderBadge provider={svc.provider} size="xs" />
                                  </TableCell>
                                  <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                                    {svc.locationAddress || '—'}
                                  </TableCell>
                                  <TableCell className="text-right text-orange-600 font-semibold text-sm">
                                    {fmt(svc.monthlyCost)}
                                  </TableCell>
                                  <TableCell className="text-xs text-muted-foreground">
                                    {svc.reason}
                                  </TableCell>
                                  <TableCell className="text-xs text-muted-foreground">
                                    {svc.escalatedBy}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </CardContent>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
