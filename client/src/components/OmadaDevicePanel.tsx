/**
 * OmadaDevicePanel — shows the Omada device linked to a service.
 * Rendered on the ServiceDetail page when an Omada device is cached for the service.
 * Shows device health (uptime, CPU, memory, WAN IP, firmware) and a Sync button.
 */
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Router,
  Wifi,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Cpu,
  MemoryStick,
  Clock,
  HardDrive,
} from "lucide-react";
import { toast } from "sonner";

function formatUptime(seconds: number | null | undefined): string {
  if (!seconds) return "—";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function HealthBar({ value, label }: { value: number | null | undefined; label: string }) {
  const pct = value ?? 0;
  const colour =
    pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span>{pct}%</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${colour}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

interface OmadaDevicePanelProps {
  serviceExternalId: string;
}

export function OmadaDevicePanel({ serviceExternalId }: OmadaDevicePanelProps) {
  const { data: device, isLoading, refetch } =
    trpc.billing.omada.getDeviceByService.useQuery({ serviceExternalId });

  const syncMutation = trpc.billing.omada.syncDevices.useMutation({
    onSuccess: () => {
      toast.success("Device cache refreshed.");
      refetch();
    },
    onError: (err) => toast.error(`Sync failed: ${err.message}`),
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-5 text-center text-sm text-muted-foreground">
          Checking Omada device link…
        </CardContent>
      </Card>
    );
  }

  if (!device) {
    return null; // No device linked — panel hidden
  }

  const isConnected = device.status === "connected";
  const deviceTypeIcon =
    device.deviceType === "gateway" ? (
      <Router className="w-3.5 h-3.5" />
    ) : (
      <Wifi className="w-3.5 h-3.5" />
    );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
          {deviceTypeIcon}
          Omada Device
          <Badge
            variant="outline"
            className={`ml-auto text-xs font-normal ${
              isConnected ? "border-emerald-500 text-emerald-700" : "border-red-400 text-red-600"
            }`}
          >
            {isConnected ? (
              <><CheckCircle2 className="w-3 h-3 mr-1" /> Online</>
            ) : (
              <><XCircle className="w-3 h-3 mr-1" /> Offline</>
            )}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Device identity */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-2">
          <div className="space-y-0.5">
            <div className="text-xs text-muted-foreground">Device Name</div>
            <div className="text-sm font-medium">{device.deviceName ?? "—"}</div>
          </div>
          <div className="space-y-0.5">
            <div className="text-xs text-muted-foreground">Model</div>
            <div className="text-sm">{device.deviceModel ?? "—"}</div>
          </div>
          <div className="space-y-0.5">
            <div className="text-xs text-muted-foreground">MAC Address</div>
            <div className="text-sm font-mono text-muted-foreground">{device.macAddress}</div>
          </div>
          <div className="space-y-0.5">
            <div className="text-xs text-muted-foreground">Firmware</div>
            <div className="text-sm font-mono text-muted-foreground">{device.firmwareVersion ?? "—"}</div>
          </div>
          {device.wanIp && (
            <div className="space-y-0.5">
              <div className="text-xs text-muted-foreground">WAN IP</div>
              <div className="text-sm font-mono">{device.wanIp}</div>
            </div>
          )}
          <div className="space-y-0.5">
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" /> Uptime
            </div>
            <div className="text-sm">{formatUptime(device.uptimeSeconds)}</div>
          </div>
        </div>

        {/* Resource utilisation bars */}
        {(device.cpuPercent != null || device.memPercent != null) && (
          <div className="space-y-2 border-t pt-3">
            {device.cpuPercent != null && (
              <HealthBar value={device.cpuPercent} label="CPU" />
            )}
            {device.memPercent != null && (
              <HealthBar value={device.memPercent} label="Memory" />
            )}
          </div>
        )}

        {/* Refresh */}
        <div className="flex items-center justify-between pt-1 border-t">
          <div className="text-xs text-muted-foreground">
            Last synced:{" "}
            {device.lastSyncedAt
              ? new Date(device.lastSyncedAt).toLocaleString()
              : "never"}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground gap-1.5"
            disabled={syncMutation.isPending}
            onClick={() => syncMutation.mutate({ omadaSiteId: device.omadaSiteId })}
          >
            <RefreshCw className={`w-3 h-3 ${syncMutation.isPending ? "animate-spin" : ""}`} />
            Sync
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
