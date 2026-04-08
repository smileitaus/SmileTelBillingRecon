/**
 * SupplierIntegrations.tsx
 * Supplier API & FTP Integration management page.
 *
 * Shows status, last-run info, and manual trigger buttons for:
 *   1. Vocus Product Inventory API (TMF standard)
 *   2. AAPT CDR FTP (daily call detail records)
 *   3. ABB Carbon API (already implemented, shown here for consistency)
 *
 * Also includes setup instructions and contact details for each integration.
 */
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  RefreshCw, CheckCircle2, XCircle, AlertTriangle, Clock,
  Wifi, Phone, Server, ChevronDown, ChevronUp, ExternalLink,
  Mail, Info, Loader2, Link2, Link2Off, Search,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SyncLog {
  id: number;
  integration: string;
  status: string;
  summary: string | null;
  servicesFound: number;
  servicesCreated: number;
  servicesUpdated: number;
  recordsProcessed: number;
  errorMessage: string | null;
  durationMs: number | null;
  triggeredBy: string;
  startedAt: Date | string;
  completedAt: Date | string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  if (status === "success") return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
      <CheckCircle2 className="w-3 h-3" /> Success
    </span>
  );
  if (status === "error") return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
      <XCircle className="w-3 h-3" /> Error
    </span>
  );
  if (status === "partial") return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
      <AlertTriangle className="w-3 h-3" /> Partial
    </span>
  );
  if (status === "running") return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
      <Loader2 className="w-3 h-3 animate-spin" /> Running
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
      <Clock className="w-3 h-3" /> Never run
    </span>
  );
}

function formatDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-AU", { dateStyle: "short", timeStyle: "short" });
}

function formatDuration(ms: number | null | undefined) {
  if (!ms) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ── Integration Card ──────────────────────────────────────────────────────────

interface IntegrationCardProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  statusLabel: string;
  lastRun: Date | string | null | undefined;
  lastStatus: string;
  lastSummary: string | null | undefined;
  isConfigured: boolean;
  isPending: boolean;
  onSync: () => void;
  syncLabel?: string;
  history: SyncLog[];
  setupInstructions: React.ReactNode;
  accentColor: string; // tailwind bg color class e.g. 'bg-purple-600'
}

function IntegrationCard({
  icon, title, subtitle, statusLabel, lastRun, lastStatus, lastSummary,
  isConfigured, isPending, onSync, syncLabel = "Sync Now",
  history, setupInstructions, accentColor,
}: IntegrationCardProps) {
  const [showHistory, setShowHistory] = useState(false);
  const [showSetup, setShowSetup] = useState(!isConfigured);

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
      {/* Header */}
      <div className={`${accentColor} px-5 py-4 flex items-center justify-between`}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-white/20 rounded-lg flex items-center justify-center text-white">
            {icon}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">{title}</h3>
            <p className="text-xs text-white/80">{subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isConfigured && (
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-white/20 text-white border border-white/30">
              Setup Required
            </span>
          )}
          <button
            onClick={onSync}
            disabled={isPending || !isConfigured}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white/20 hover:bg-white/30 disabled:opacity-50 text-white rounded-lg transition-colors border border-white/30"
          >
            {isPending ? (
              <><Loader2 className="w-3 h-3 animate-spin" /> Syncing...</>
            ) : (
              <><RefreshCw className="w-3 h-3" /> {syncLabel}</>
            )}
          </button>
        </div>
      </div>

      {/* Status row */}
      <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            Last run: <span className="font-medium text-gray-700 ml-1">{formatDate(lastRun)}</span>
          </span>
          <StatusBadge status={lastStatus} />
        </div>
        {lastSummary && (
          <p className="text-xs text-gray-500 max-w-md truncate" title={lastSummary}>{lastSummary}</p>
        )}
      </div>

      {/* Setup instructions (collapsible) */}
      <div className="border-b border-gray-100">
        <button
          onClick={() => setShowSetup(v => !v)}
          className="w-full px-5 py-2.5 flex items-center justify-between text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <span className="flex items-center gap-1.5"><Info className="w-3.5 h-3.5" /> Setup & Configuration</span>
          {showSetup ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
        {showSetup && (
          <div className="px-5 pb-4 text-xs text-gray-600 space-y-2">
            {setupInstructions}
          </div>
        )}
      </div>

      {/* Sync history (collapsible) */}
      <div>
        <button
          onClick={() => setShowHistory(v => !v)}
          className="w-full px-5 py-2.5 flex items-center justify-between text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <span>Sync History ({history.length} runs)</span>
          {showHistory ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
        {showHistory && (
          <div className="px-5 pb-4">
            {history.length === 0 ? (
              <p className="text-xs text-gray-400 italic">No sync runs recorded yet.</p>
            ) : (
              <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[500px]">
                <thead>
                  <tr className="text-gray-400 border-b border-gray-100">
                    <th className="text-left py-1.5 font-medium">Started</th>
                    <th className="text-left py-1.5 font-medium">Status</th>
                    <th className="text-right py-1.5 font-medium">Found</th>
                    <th className="text-right py-1.5 font-medium">Created</th>
                    <th className="text-right py-1.5 font-medium">Updated</th>
                    <th className="text-right py-1.5 font-medium">Duration</th>
                    <th className="text-left py-1.5 font-medium pl-3">Trigger</th>
                  </tr>
                </thead>
                <tbody>
                  {[...history].reverse().map(log => (
                    <tr key={log.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-1.5 text-gray-600">{formatDate(log.startedAt)}</td>
                      <td className="py-1.5"><StatusBadge status={log.status} /></td>
                      <td className="py-1.5 text-right text-gray-700">{log.servicesFound}</td>
                      <td className="py-1.5 text-right text-green-700">{log.servicesCreated}</td>
                      <td className="py-1.5 text-right text-blue-700">{log.servicesUpdated}</td>
                      <td className="py-1.5 text-right text-gray-500">{formatDuration(log.durationMs)}</td>
                      <td className="py-1.5 pl-3 text-gray-400 capitalize">{log.triggeredBy}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Omada Site Linking Panel ─────────────────────────────────────────────────

function OmadaSiteLinkingPanel() {
  const [customerSearch, setCustomerSearch] = useState<Record<string, string>>({});
  const [linkingId, setLinkingId] = useState<string | null>(null);

  const { data: sites = [], isLoading: sitesLoading, refetch: refetchSites } =
    trpc.billing.omada.listAllSites.useQuery();

  const syncMutation = trpc.billing.omada.syncSites.useMutation({
    onSuccess: () => { toast.success('Omada sites synced'); refetchSites(); },
    onError: (e) => toast.error(`Sync failed: ${e.message}`),
  });

  const linkMutation = trpc.billing.omada.linkSiteToCustomer.useMutation({
    onSuccess: () => { toast.success('Site linked successfully'); refetchSites(); setLinkingId(null); },
    onError: (e) => toast.error(`Link failed: ${e.message}`),
  });

  const unlinkMutation = trpc.billing.omada.unlinkSite.useMutation({
    onSuccess: () => { toast.success('Site unlinked'); refetchSites(); },
    onError: (e) => toast.error(`Unlink failed: ${e.message}`),
  });

  const customerSearchQuery = trpc.billing.customers.list.useQuery(
    { search: customerSearch[linkingId ?? ''] ?? '' },
    { enabled: !!linkingId && (customerSearch[linkingId] ?? '').length >= 2 }
  );

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
      {/* Header */}
      <div className="bg-teal-600 px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-white/20 rounded-lg flex items-center justify-center text-white">
            <Wifi className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">TP-Link Omada Network Sites</h3>
            <p className="text-xs text-white/80">Link Omada sites to SmileTel customers for network monitoring</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-white/20 text-white border border-white/30">
            ✓ Configured
          </span>
          <button
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white/20 hover:bg-white/30 disabled:opacity-50 text-white rounded-lg transition-colors border border-white/30"
          >
            {syncMutation.isPending ? (
              <><Loader2 className="w-3 h-3 animate-spin" /> Syncing...</>
            ) : (
              <><RefreshCw className="w-3 h-3" /> Sync Sites</>
            )}
          </button>
        </div>
      </div>

      {/* Sites table */}
      <div className="p-5">
        {sitesLoading ? (
          <div className="flex items-center gap-2 text-sm text-gray-400 py-4">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading sites...
          </div>
        ) : sites.length === 0 ? (
          <p className="text-sm text-gray-400 italic py-4">No Omada sites found. Click Sync Sites to fetch from the API.</p>
        ) : (
          <div className="space-y-3">
            {sites.map((site) => (
              <div key={site.omadaSiteId} className="border border-gray-100 rounded-lg p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${
                        site.wanStatus === 'connected' || site.wanStatus === 'active' ? 'bg-green-500' : 'bg-red-400'
                      }`} />
                      <span className="text-sm font-semibold text-gray-800 truncate">{site.omadaSiteName}</span>
                      <span className="text-xs text-gray-400 font-mono">{site.wanIp ?? '—'}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span>{site.deviceCount ?? 0} devices</span>
                      <span>{site.clientCount ?? 0} clients</span>
                      <span>Last sync: {site.lastSyncedAt ? new Date(site.lastSyncedAt).toLocaleString('en-AU', { dateStyle: 'short', timeStyle: 'short' }) : '—'}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {site.customerExternalId ? (
                      <>
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-teal-50 text-teal-700 border border-teal-200">
                          <Link2 className="w-3 h-3" />
                          {site.customerExternalId}
                          {site.matchType === 'manual' && <span className="ml-1 text-teal-500">(manual)</span>}
                          {site.matchType === 'auto' && <span className="ml-1 text-teal-500">(auto)</span>}
                        </span>
                        <button
                          onClick={() => unlinkMutation.mutate({ omadaSiteId: site.omadaSiteId })}
                          disabled={unlinkMutation.isPending}
                          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          title="Unlink site"
                        >
                          <Link2Off className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setLinkingId(site.omadaSiteId === linkingId ? null : site.omadaSiteId)}
                          className="p-1.5 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                          title="Change link"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setLinkingId(site.omadaSiteId === linkingId ? null : site.omadaSiteId)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-teal-700 bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100 transition-colors"
                      >
                        <Link2 className="w-3 h-3" /> Link to Customer
                      </button>
                    )}
                  </div>
                </div>

                {/* Inline customer search */}
                {linkingId === site.omadaSiteId && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-gray-400" />
                      <input
                        autoFocus
                        type="text"
                        placeholder="Search customer name or ID..."
                        value={customerSearch[site.omadaSiteId] ?? ''}
                        onChange={(e) => setCustomerSearch(prev => ({ ...prev, [site.omadaSiteId]: e.target.value }))}
                        className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-teal-400"
                      />
                    </div>
                    {customerSearchQuery.isLoading && (
                      <div className="mt-2 text-xs text-gray-400 flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" /> Searching...
                      </div>
                    )}
                    {(customerSearchQuery.data ?? []).length > 0 && (
                      <div className="mt-2 border border-gray-100 rounded-lg overflow-hidden">
                        {(customerSearchQuery.data ?? []).slice(0, 8).map((c: any) => (
                          <button
                            key={c.externalId}
                            onClick={() => linkMutation.mutate({ omadaSiteId: site.omadaSiteId, customerExternalId: c.externalId })}
                            disabled={linkMutation.isPending}
                            className="w-full text-left px-3 py-2 text-xs hover:bg-teal-50 border-b border-gray-50 last:border-0 flex items-center justify-between"
                          >
                            <span className="font-medium text-gray-800">{c.businessName || c.name}</span>
                            <span className="text-gray-400 font-mono">{c.externalId}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {(customerSearch[site.omadaSiteId] ?? '').length >= 2 &&
                     !customerSearchQuery.isLoading &&
                     (customerSearchQuery.data ?? []).length === 0 && (
                      <p className="mt-2 text-xs text-gray-400 italic">No customers found.</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function SupplierIntegrations() {
  // Vocus API sync
  const vocusHistory = trpc.billing.getVocusSyncHistory.useQuery({ limit: 20 });
  const vocusSyncMutation = trpc.billing.syncVocusServices.useMutation({
    onSuccess: (result) => {
      toast.success(`Vocus sync complete: ${result.summary}`);
      vocusHistory.refetch();
    },
    onError: (err) => toast.error(`Vocus sync failed: ${err.message}`),
  });

  // AAPT CDR FTP sync
  const aaptHistory = trpc.billing.getAaptCdrSyncHistory.useQuery({ limit: 20 });
  const [aaptDateFrom, setAaptDateFrom] = useState("");
  const [aaptDateTo, setAaptDateTo] = useState("");
  const aaptSyncMutation = trpc.billing.syncAaptCdr.useMutation({
    onSuccess: (result) => {
      toast.success(`AAPT CDR sync complete: ${result.summary}`);
      aaptHistory.refetch();
    },
    onError: (err) => toast.error(`AAPT CDR sync failed: ${err.message}`),
  });

  // ABB Carbon API (existing)
  const carbonSyncMutation = trpc.billing.syncCarbonCosts.useMutation({
    onSuccess: (result: any) => {
      toast.success(`ABB Carbon sync complete`);
    },
    onError: (err: any) => toast.error(`ABB Carbon sync failed: ${err.message}`),
  });
  const carbonStatus = trpc.billing.carbonCacheStatus.useQuery();

  const vocusLastRun = vocusHistory.data?.[vocusHistory.data.length - 1];
  const aaptLastRun = aaptHistory.data?.[aaptHistory.data.length - 1];

  const isVocusConfigured = false; // Will be true once VOCUS_API_KEY is set
  const isAaptConfigured = false;  // Will be true once AAPT_FTP_HOST is set

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">Supplier API Integrations</h1>
        <p className="text-sm text-gray-500 mt-1">
          Automated data feeds from supplier platforms. Configure credentials in project secrets, then use the sync buttons to pull live data.
        </p>
      </div>

      {/* Setup required banner */}
      {(!isVocusConfigured || !isAaptConfigured) && (
        <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-600" />
          <div>
            <p className="font-semibold">API credentials required</p>
            <p className="text-xs mt-0.5 text-amber-700">
              2 integrations need credentials before they can sync. Follow the setup instructions below for each integration, then add the credentials in <strong>Settings → Secrets</strong>.
            </p>
          </div>
        </div>
      )}

      {/* Vocus CPQ + Trouble Ticketing APIs */}
      <IntegrationCard
        icon={<Wifi className="w-4 h-4" />}
        title="Vocus CPQ & Trouble Ticketing APIs"
        subtitle="Site qualification, quoting, ordering, and fault management for Vocus Internet & Ethernet"
        statusLabel="Vocus API"
        lastRun={vocusLastRun?.startedAt}
        lastStatus={vocusLastRun?.status || "never"}
        lastSummary={vocusLastRun?.summary}
        isConfigured={isVocusConfigured}
        isPending={vocusSyncMutation.isPending}
        onSync={() => vocusSyncMutation.mutate({ triggeredBy: "manual" })}
        syncLabel="Test Connection"
        history={(vocusHistory.data || []) as SyncLog[]}
        accentColor="bg-purple-600"
        setupInstructions={
          <div className="space-y-3">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="font-semibold text-amber-900 mb-1">⚠ Scope update — confirmed by Vocus (Scott Marshall, 20 Mar 2026)</p>
              <p className="text-amber-800 text-sm">Vocus does <strong>not</strong> offer a Product Inventory or Billing API. The available APIs are CPQ (Configure-Price-Quote) and Trouble Ticketing only. Service records must continue to be maintained manually or via supplier invoice upload.</p>
            </div>
            <div className="bg-purple-50 border border-purple-100 rounded-lg p-3 space-y-2">
              <p className="font-semibold text-purple-900">Available APIs (confirmed)</p>
              <div className="space-y-1.5 text-sm text-purple-800">
                <div><span className="font-medium">Geographic Address &amp; Site Management</span> — validate a site address and obtain a Vocus Site ID for use in quoting</div>
                <div><span className="font-medium">Product Offering Qualification</span> — check which Vocus Internet/Ethernet products are available at a given site</div>
                <div><span className="font-medium">Quote Management</span> — request a price quote for a Vocus data product at a qualified site</div>
                <div><span className="font-medium">Product Order Management</span> — convert an active quote into a live order; also supports Vocus voice port/number allocation</div>
                <div><span className="font-medium">Trouble Ticket API</span> — create and update fault tickets for Vocus services; receive ticket updates via callback webhook</div>
              </div>
            </div>
            <div className="bg-purple-50 border border-purple-100 rounded-lg p-3 space-y-1.5">
              <p className="font-semibold text-purple-900">Onboarding steps (one-time)</p>
              <ol className="list-decimal list-inside space-y-1 text-purple-800 text-sm">
                <li>Complete and return the Vocus Wholesale API Onboarding Form v2.0 to Scott Marshall</li>
                <li>Provide SmileTel's public IP addresses for Non-Prod and Production whitelisting</li>
                <li>Select APIs: Geographic Address, Product Offering Qualification, Quote, Order, Trouble Ticket (Partner)</li>
                <li>Provide a callback HTTPS URL for Quote, Order, and Trouble Ticket event notifications</li>
                <li>Create a generic email: <strong>vocus_apis@smiletel.com.au</strong> (required for Trouble Ticket Partner access)</li>
                <li>Vocus will issue Auth0 client ID/secret and API keys for Non-Prod, then Production after UAT</li>
              </ol>
            </div>
            <div className="flex items-center gap-2 text-purple-700">
              <Mail className="w-3.5 h-3.5 shrink-0" />
              <span>Functional Analyst: <strong>Scott.Marshall@vocus.com.au</strong> · +61 432 306 991</span>
            </div>
            <div className="flex items-center gap-2 text-purple-700">
              <Mail className="w-3.5 h-3.5 shrink-0" />
              <span>Account Manager: <strong>Leigh.Harper@vocus.com.au</strong> · +61 7 3707 7005</span>
            </div>
            <div className="flex items-center gap-2 text-purple-700">
              <Mail className="w-3.5 h-3.5 shrink-0" />
              <span>API support: <strong>vw-api-support@vocus.com.au</strong></span>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 font-mono text-gray-700 space-y-1">
              <p className="font-sans font-semibold text-gray-600 mb-1.5">Required secrets (after onboarding):</p>
              <p><span className="text-purple-700">VOCUS_CLIENT_ID</span>=your-auth0-client-id</p>
              <p><span className="text-purple-700">VOCUS_CLIENT_SECRET</span>=your-auth0-client-secret</p>
              <p><span className="text-purple-700">VOCUS_API_KEY</span>=your-api-key-from-vocus</p>
            </div>
            <p className="text-gray-500 text-sm">
              Once onboarded, this enables: (1) site qualification when provisioning new Vocus services, (2) automated fault ticket creation from the platform, and (3) order tracking for new Vocus Internet/Ethernet services.
            </p>
          </div>
        }
      />

      {/* AAPT CDR FTP */}
      <IntegrationCard
        icon={<Phone className="w-4 h-4" />}
        title="AAPT CDR FTP — Daily Call Records"
        subtitle="FTP feed of daily call detail records for voice usage reconciliation"
        statusLabel="AAPT CDR"
        lastRun={aaptLastRun?.startedAt}
        lastStatus={aaptLastRun?.status || "never"}
        lastSummary={aaptLastRun?.summary}
        isConfigured={isAaptConfigured}
        isPending={aaptSyncMutation.isPending}
        onSync={() => aaptSyncMutation.mutate({
          triggeredBy: "manual",
          dateFrom: aaptDateFrom || undefined,
          dateTo: aaptDateTo || undefined,
        })}
        syncLabel="Download CDR Files"
        history={(aaptHistory.data || []) as SyncLog[]}
        accentColor="bg-blue-600"
        setupInstructions={
          <div className="space-y-3">
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 space-y-1.5">
              <p className="font-semibold text-blue-900">FTP access setup (one-time)</p>
              <ol className="list-decimal list-inside space-y-1 text-blue-800">
                <li>Email AAPT operations requesting CDR files and FTP access</li>
                <li>Provide SmileTel's static egress IP address for FTP whitelist</li>
                <li>AAPT will provision FTP credentials and confirm the CDR file path</li>
                <li>Add credentials to project secrets (see below)</li>
              </ol>
            </div>
            <div className="flex items-center gap-2 text-blue-700">
              <Mail className="w-3.5 h-3.5 shrink-0" />
              <span>AAPT Operations: <strong>customeroperations@corp.aapt.com.au</strong></span>
            </div>
            <div className="flex items-center gap-2 text-blue-700">
              <Mail className="w-3.5 h-3.5 shrink-0" />
              <span>Frontier Link API (fixed services): <strong>DL_Frontier_Link_Technical_Support@tpgtelecom.com.au</strong></span>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 font-mono text-gray-700 space-y-1">
              <p className="font-sans font-semibold text-gray-600 mb-1.5">Required secrets (Settings → Secrets):</p>
              <p><span className="text-blue-700">AAPT_FTP_HOST</span>=ftp.aapt.com.au</p>
              <p><span className="text-blue-700">AAPT_FTP_USER</span>=your-ftp-username</p>
              <p><span className="text-blue-700">AAPT_FTP_PASS</span>=your-ftp-password</p>
              <p className="text-gray-400"># Optional:</p>
              <p><span className="text-blue-700">AAPT_FTP_PORT</span>=21</p>
              <p><span className="text-blue-700">AAPT_FTP_PATH</span>=/cdr/</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-gray-500 font-medium">Date from (YYYYMMDD)</label>
                <input
                  type="text"
                  placeholder="e.g. 20260301"
                  value={aaptDateFrom}
                  onChange={e => setAaptDateFrom(e.target.value)}
                  className="border border-gray-200 rounded px-2 py-1 text-xs font-mono w-32"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-gray-500 font-medium">Date to (YYYYMMDD)</label>
                <input
                  type="text"
                  placeholder="e.g. 20260319"
                  value={aaptDateTo}
                  onChange={e => setAaptDateTo(e.target.value)}
                  className="border border-gray-200 rounded px-2 py-1 text-xs font-mono w-32"
                />
              </div>
            </div>
            <p className="text-gray-500">
              When configured, this integration runs nightly to download the previous day's CDR file, aggregate usage by service, and create billing items for voice usage charges. Each service is matched by AAPT service ID to existing service records.
            </p>
          </div>
        }
      />

      {/* ABB Carbon API (existing) */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <div className="bg-green-700 px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-white/20 rounded-lg flex items-center justify-center text-white">
              <Server className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">ABB Carbon API</h3>
              <p className="text-xs text-white/80">Live NBN service inventory and wholesale cost sync</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-white/20 text-white border border-white/30">
              ✓ Configured
            </span>
            <button
              onClick={() => carbonSyncMutation.mutate({ forceRefresh: true })}
              disabled={carbonSyncMutation.isPending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white/20 hover:bg-white/30 disabled:opacity-50 text-white rounded-lg transition-colors border border-white/30"
            >
              {carbonSyncMutation.isPending ? (
                <><Loader2 className="w-3 h-3 animate-spin" /> Syncing...</>
              ) : (
                <><RefreshCw className="w-3 h-3" /> Force Refresh</>
              )}
            </button>
          </div>
        </div>
        <div className="px-5 py-3 flex items-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            Cache TTL: <span className="font-medium text-gray-700 ml-1">6 hours</span>
          </span>
          {carbonStatus.data && (
            <>
              <span>Last fetch: <span className="font-medium text-gray-700">{formatDate((carbonStatus.data as any).fetchedAt)}</span></span>
              <span>Services: <span className="font-medium text-gray-700">{(carbonStatus.data as any).totalServices}</span></span>
              <StatusBadge status={(carbonStatus.data as any).isStale ? "partial" : "success"} />
            </>
          )}
        </div>
        <div className="px-5 pb-4 text-xs text-gray-500">
          <p>The ABB Carbon API is already configured and active. It syncs NBN service inventory and wholesale costs from Aussie Broadband's Carbon platform. The 6-hour cache prevents excessive API calls — use "Force Refresh" to bypass the cache when needed.</p>
        </div>
      </div>

      {/* ── Omada Network Site Linking ─────────────────────────────────────── */}
      <OmadaSiteLinkingPanel />

      {/* AAPT Frontier Link API (future) */}
      <div className="bg-white border border-dashed border-gray-300 rounded-xl p-5 opacity-70">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center">
            <Server className="w-4 h-4 text-gray-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-600">AAPT Frontier Link API <span className="ml-2 text-xs font-normal text-gray-400">(Planned)</span></h3>
            <p className="text-xs text-gray-400">Fixed broadband service inventory for AAPT EPL and Ethernet services</p>
          </div>
        </div>
        <p className="text-xs text-gray-400">
          Contact <strong>DL_Frontier_Link_Technical_Support@tpgtelecom.com.au</strong> to request API resources for the PIPE/AAPT Frontierlink platform. This will auto-populate AAPT fixed service records (currently 64 services imported manually).
        </p>
      </div>
    </div>
  );
}
