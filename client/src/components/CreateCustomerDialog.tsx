import { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { UserPlus, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";

const BILLING_PLATFORMS = ["OneBill", "SasBoss", "ECN", "Halo", "DataGate"];

interface CreateCustomerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-fill the name field (e.g. from SM import suggestion) */
  suggestedName?: string;
  /** Called when a customer is successfully created */
  onCreated?: (externalId: string, name: string) => void;
}

export function CreateCustomerDialog({
  open,
  onOpenChange,
  suggestedName = "",
  onCreated,
}: CreateCustomerDialogProps) {
  const utils = trpc.useUtils();

  const [name, setName] = useState(suggestedName);
  const [businessName, setBusinessName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [siteAddress, setSiteAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [createPlatformCheck, setCreatePlatformCheck] = useState(true);

  // Reset form when dialog opens with a new suggested name
  const handleOpenChange = (val: boolean) => {
    if (val) {
      setName(suggestedName);
      setBusinessName("");
      setContactName("");
      setContactEmail("");
      setContactPhone("");
      setSiteAddress("");
      setNotes("");
      setSelectedPlatforms([]);
      setCreatePlatformCheck(true);
    }
    onOpenChange(val);
  };

  const createMutation = trpc.billing.customers.create.useMutation({
    onSuccess: (result) => {
      if (result.alreadyExists) {
        toast.error(`A customer named "${name}" already exists (${result.externalId}).`);
        return;
      }
      toast.success(`${name} has been added${createPlatformCheck ? " and a Platform Check entry created" : ""}.`);
      utils.billing.customers.list.invalidate();
      onCreated?.(result.externalId, name);
      onOpenChange(false);
    },
    onError: (err) => {
      toast.error(`Failed to create customer: ${err.message}`);
    },
  });

  const togglePlatform = (platform: string) => {
    setSelectedPlatforms(prev =>
      prev.includes(platform) ? prev.filter(p => p !== platform) : [...prev, platform]
    );
  };

  const handleSubmit = () => {
    if (!name.trim()) return;
    createMutation.mutate({
      name: name.trim(),
      businessName: businessName.trim() || undefined,
      contactName: contactName.trim() || undefined,
      contactEmail: contactEmail.trim() || undefined,
      contactPhone: contactPhone.trim() || undefined,
      siteAddress: siteAddress.trim() || undefined,
      notes: notes.trim() || undefined,
      billingPlatforms: selectedPlatforms.length > 0 ? selectedPlatforms : null,
      createPlatformCheck,
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            Create New Customer
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Customer Name */}
          <div className="space-y-1.5">
            <Label htmlFor="cust-name">
              Customer Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="cust-name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Zambrero Marrickville"
              autoFocus
            />
          </div>

          {/* Business / Franchisee Name */}
          <div className="space-y-1.5">
            <Label htmlFor="cust-biz">Business / Franchisee Name</Label>
            <Input
              id="cust-biz"
              value={businessName}
              onChange={e => setBusinessName(e.target.value)}
              placeholder="e.g. Smith Family Pty Ltd"
            />
          </div>

          {/* Contact */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cust-contact">Contact Name</Label>
              <Input
                id="cust-contact"
                value={contactName}
                onChange={e => setContactName(e.target.value)}
                placeholder="John Smith"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cust-phone">Contact Phone</Label>
              <Input
                id="cust-phone"
                value={contactPhone}
                onChange={e => setContactPhone(e.target.value)}
                placeholder="0412 345 678"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cust-email">Contact Email</Label>
            <Input
              id="cust-email"
              type="email"
              value={contactEmail}
              onChange={e => setContactEmail(e.target.value)}
              placeholder="contact@example.com"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cust-addr">Site Address</Label>
            <Input
              id="cust-addr"
              value={siteAddress}
              onChange={e => setSiteAddress(e.target.value)}
              placeholder="123 Main St, Sydney NSW 2000"
            />
          </div>

          {/* Billing Platforms */}
          <div className="space-y-1.5">
            <Label>Billing Platform(s)</Label>
            <div className="flex flex-wrap gap-2">
              {BILLING_PLATFORMS.map(p => (
                <Badge
                  key={p}
                  variant={selectedPlatforms.includes(p) ? "default" : "outline"}
                  className="cursor-pointer select-none"
                  onClick={() => togglePlatform(p)}
                >
                  {p}
                </Badge>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="cust-notes">Notes</Label>
            <Textarea
              id="cust-notes"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Any additional notes about this customer..."
              rows={3}
            />
          </div>

          {/* Platform Check option */}
          <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-3">
            <Checkbox
              id="cust-platform-check"
              checked={createPlatformCheck}
              onCheckedChange={v => setCreatePlatformCheck(!!v)}
              className="mt-0.5"
            />
            <div>
              <label htmlFor="cust-platform-check" className="text-sm font-medium cursor-pointer">
                Create Platform Check entry
              </label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Adds a pending verification task to the Platform Checks page to confirm billing setup.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!name.trim() || createMutation.isPending}
          >
            {createMutation.isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-2" />Creating...</>
            ) : (
              <><UserPlus className="h-4 w-4 mr-2" />Create Customer</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
