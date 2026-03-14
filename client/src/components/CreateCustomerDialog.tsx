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
import { UserPlus, AlertCircle, CheckCircle2, Loader2, Send, Clock } from "lucide-react";
import { toast } from "sonner";

const BILLING_PLATFORMS = ["OneBill", "SasBoss", "ECN", "Halo", "DataGate"];

interface CreateCustomerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-fill the name field (e.g. from SM import suggestion) */
  suggestedName?: string;
  /** If provided, the dialog submits a proposal (pending approval) instead of creating immediately */
  serviceExternalId?: string;
  /** Called when a customer is successfully created (immediate mode) */
  onCreated?: (externalId: string, name: string, opts: { createPlatformCheck: boolean; billingPlatforms: string[] }) => void;
  /** Called when a proposal is successfully submitted */
  onProposed?: () => void;
  /**
   * When true, the Platform Check is NOT created in customers.create — it will be created
   * in the unmatched.assign step (where service details are available). Use this when the
   * dialog is opened from the Unmatched Services workflow.
   */
  deferPlatformCheckToAssign?: boolean;
}

export function CreateCustomerDialog({
  open,
  onOpenChange,
  suggestedName = "",
  serviceExternalId,
  onCreated,
  onProposed,
  deferPlatformCheckToAssign = false,
}: CreateCustomerDialogProps) {
  const utils = trpc.useUtils();
  const isProposalMode = !!serviceExternalId;

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
      toast.success(`${name} has been added.`);
      utils.billing.customers.list.invalidate();
      onCreated?.(result.externalId, name, { createPlatformCheck, billingPlatforms: selectedPlatforms });
      onOpenChange(false);
    },
    onError: (err) => {
      toast.error(`Failed to create customer: ${err.message}`);
    },
  });

  const proposeMutation = trpc.billing.customers.proposals.submit.useMutation({
    onSuccess: () => {
      toast.success(`Proposal for "${name}" submitted — pending approval in the Auto-Match › New Customers tab.`);
      utils.billing.customers.proposals.list.invalidate();
      utils.billing.customers.proposals.pendingCount.invalidate();
      onProposed?.();
      onOpenChange(false);
    },
    onError: (err: { message: string }) => {
      toast.error(`Failed to submit proposal: ${err.message}`);
    },
  });

  const togglePlatform = (platform: string) => {
    setSelectedPlatforms(prev =>
      prev.includes(platform) ? prev.filter(p => p !== platform) : [...prev, platform]
    );
  };

  const handleSubmit = () => {
    if (!name.trim()) return;
    if (isProposalMode) {
      // Build notes string including all extra fields
      const extraDetails = [
        businessName.trim() ? `Business: ${businessName.trim()}` : null,
        contactName.trim() ? `Contact: ${contactName.trim()}` : null,
        contactEmail.trim() ? `Email: ${contactEmail.trim()}` : null,
        contactPhone.trim() ? `Phone: ${contactPhone.trim()}` : null,
        siteAddress.trim() ? `Address: ${siteAddress.trim()}` : null,
        selectedPlatforms.length > 0 ? `Billing Platforms: ${selectedPlatforms.join(', ')}` : null,
        notes.trim() || null,
      ].filter(Boolean).join('\n');
      proposeMutation.mutate({
        proposedName: name.trim(),
        notes: extraDetails || undefined,
        serviceExternalIds: [serviceExternalId!],
        source: 'manual',
        createPlatformCheck,
      });
    } else {
      // When called from UnmatchedServices (serviceExternalId is NOT set but we still want to
      // create the Platform Check in the assign step, not here). We pass createPlatformCheck: false
      // to customers.create so it doesn't create a duplicate check without service details.
      // The onCreated callback forwards createPlatformCheck + billingPlatforms to handleAssign.
      createMutation.mutate({
        name: name.trim(),
        businessName: businessName.trim() || undefined,
        contactName: contactName.trim() || undefined,
        contactEmail: contactEmail.trim() || undefined,
        contactPhone: contactPhone.trim() || undefined,
        siteAddress: siteAddress.trim() || undefined,
        notes: notes.trim() || undefined,
        billingPlatforms: selectedPlatforms.length > 0 ? selectedPlatforms : null,
        createPlatformCheck: deferPlatformCheckToAssign ? false : createPlatformCheck, // Platform Check created in assign step (with service details) when deferPlatformCheckToAssign=true
      });
    }
  };

  const isPending = createMutation.isPending || proposeMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isProposalMode ? (
              <>
                <Send className="h-5 w-5 text-amber-500" />
                Propose New Customer
              </>
            ) : (
              <>
                <UserPlus className="h-5 w-5 text-primary" />
                Create New Customer
              </>
            )}
          </DialogTitle>
          {isProposalMode && (
            <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-500" />
              This proposal will appear in <strong>Auto-Match › New Customers</strong> for approval before the customer is created.
            </p>
          )}
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
                {isProposalMode
                  ? "When approved, adds a pending verification task to the Platform Checks page."
                  : "Adds a pending verification task to the Platform Checks page to confirm billing setup."}
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
            disabled={!name.trim() || isPending}
            className={isProposalMode ? "bg-amber-500 hover:bg-amber-600 text-white" : ""}
          >
            {isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-2" />{isProposalMode ? "Submitting..." : "Creating..."}</>
            ) : isProposalMode ? (
              <><Send className="h-4 w-4 mr-2" />Submit Proposal</>
            ) : (
              <><UserPlus className="h-4 w-4 mr-2" />Create Customer</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
