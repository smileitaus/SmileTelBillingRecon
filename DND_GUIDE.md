# Drag-and-Drop Reconciliation Board — Implementation Guide

This document gives the Replit developer a complete, production-accurate reference for implementing the drag-and-drop reconciliation board that matches the Manus build. The board is the core UX of the platform — it allows operators to drag supplier services onto Xero billing items to create cost/revenue assignments, calculate margins, and drive the reconciliation workflow.

---

## Architecture Overview

The drag-and-drop system uses the **HTML5 Drag and Drop API** directly — not `@dnd-kit/core` (which is installed but not used for this feature). The board is a two-column layout rendered inside `ReconciliationBoard.tsx` and embedded in the `CustomerDetail` page.

```
CustomerDetail.tsx
  └── ReconciliationBoard.tsx          ← Main component
        ├── ServiceCard (draggable)    ← Left column: supplier services
        ├── CategoryGroup              ← Groups ServiceCards by category
        ├── BillingItemDropTarget      ← Right column: Xero billing items
        └── BucketDropTarget           ← Special assignment buckets
```

**Data flow:**

```
tRPC query: billing.customers.billingAssignments.unassignedServices
  → services table WHERE customerExternalId = X
  → EXCLUDE service_billing_assignments (already assigned)
  → EXCLUDE unbillable_services (marked unbillable)

tRPC query: billing.customers.billingAssignments.billingItemsWithAssignments
  → billing_items table WHERE customerExternalId = X
  → JOIN service_billing_assignments to get assigned services per item
  → Calculate totalCost, margin, marginPercent per billing item

On drop → tRPC mutation: billing.customers.billingAssignments.assign
  → INSERT into service_billing_assignments
  → INSERT into service_billing_match_log (for future auto-matching)
  → UPDATE billing_items.matchStatus = 'service-matched'
  → Invalidate queries → UI refreshes
```

---

## Package Dependency

The board uses the **native HTML5 DnD API** — no additional package is required beyond what is already installed.

```json
"@dnd-kit/core": "^6.3.1"   ← installed but NOT used for the reconciliation board
```

> **Important:** Do not attempt to rewrite the board using `@dnd-kit`. The native API is intentionally used here because it produces cleaner drag previews and avoids the accessibility overhead of the full dnd-kit context tree for this specific use case.

---

## The Three-Part DnD Contract

Every drag-and-drop interaction requires three coordinated pieces:

| Part | Element | Key Attribute / Event |
|---|---|---|
| **Draggable source** | `ServiceCard` | `draggable` prop + `onDragStart` |
| **Drop target** | `BillingItemDropTarget` / `BucketDropTarget` | `onDragOver` + `onDrop` |
| **Data transfer** | `e.dataTransfer` | `setData` on drag start, `getData` on drop |

If any one of these three is missing or misconfigured, the drop will silently fail.

---

## Draggable Service Card

The `ServiceCard` component sets `draggable` on the root `<div>` and writes the service ID into the drag payload via `dataTransfer.setData`:

```tsx
function ServiceCard({ service, isDragging, onDragStart, onDragEnd }) {
  return (
    <div
      draggable                                        // ← REQUIRED: enables HTML5 drag
      onDragStart={(e) => onDragStart(e, service)}
      onDragEnd={onDragEnd}
      className={cn(
        "group relative bg-white border border-border rounded-lg px-3 py-2.5",
        "cursor-grab active:cursor-grabbing transition-all select-none",
        "hover:border-orange-300 hover:shadow-sm",
        isDragging && "opacity-40 scale-95 border-orange-400 shadow-lg"
      )}
    >
      {/* GripVertical icon signals draggability to the user */}
      <GripVertical className="w-3.5 h-3.5 text-muted-foreground/40 mt-0.5 shrink-0" />
      {/* ... service content ... */}
    </div>
  );
}
```

**The drag start handler** (in the parent `ReconciliationBoard`):

```tsx
const handleDragStart = useCallback((e: React.DragEvent, service: UnassignedService) => {
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("serviceExternalId", service.externalId); // ← payload
  setDragState({ draggingId: service.externalId, draggingService: service });
}, []);

const handleDragEnd = useCallback(() => {
  setDragState({ draggingId: null, draggingService: null });
  setDragOverTarget(null);
}, []);
```

> **Common mistake:** Calling `e.preventDefault()` in `onDragStart` will cancel the drag entirely. Only call `preventDefault()` in `onDragOver`.

---

## Drop Target — Billing Item

The `BillingItemDropTarget` component handles the right-column drop zones:

```tsx
function BillingItemDropTarget({ item, isDragOver, onDragOver, onDragLeave, onDrop, onRemoveAssignment }) {
  return (
    <div
      onDragOver={onDragOver}       // ← REQUIRED: must call e.preventDefault() inside
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, item.externalId)}
      className={cn(
        "rounded-lg border-2 transition-all",
        isDragOver
          ? "border-orange-400 bg-orange-50 shadow-md scale-[1.01]"   // active drop state
          : hasAssignments
          ? "border-teal-200 bg-teal-50/30"                           // has assignments
          : "border-dashed border-border bg-muted/20 hover:border-orange-300" // empty
      )}
    >
      {/* ... billing item content ... */}
    </div>
  );
}
```

**The drag-over and drop handlers:**

```tsx
const handleDragOver = useCallback((e: React.DragEvent, targetId: string) => {
  e.preventDefault();                        // ← REQUIRED: without this, drop won't fire
  e.dataTransfer.dropEffect = "move";
  setDragOverTarget(targetId);
}, []);

const handleDragLeave = useCallback(() => {
  setDragOverTarget(null);
}, []);

const handleDropOnBillingItem = useCallback((e: React.DragEvent, billingItemExternalId: string) => {
  e.preventDefault();
  setDragOverTarget(null);
  const serviceId = e.dataTransfer.getData("serviceExternalId"); // ← read payload
  if (!serviceId) return;

  assignMutation.mutate({
    billingItemExternalId,
    serviceExternalId: serviceId,
    customerExternalId,
    assignmentMethod: "drag-drop",
    assignmentBucket: "standard",
  });
}, [customerExternalId, assignMutation]);
```

> **The single most common DnD bug:** forgetting `e.preventDefault()` inside `onDragOver`. The browser's default behaviour is to reject drops, so without this call the `onDrop` event will never fire regardless of how the drop target is styled.

---

## Drop Target — Special Buckets

The four special buckets (Usage Holding, Professional Services, Hardware Sales, Internal Cost) work identically to billing item drop targets but route to different mutations:

```tsx
const handleDropOnBucket = useCallback((e: React.DragEvent, bucketId: AssignmentBucket) => {
  e.preventDefault();
  setDragOverTarget(null);
  const serviceId = e.dataTransfer.getData("serviceExternalId");
  if (!serviceId) return;

  if (bucketId === "internal-cost") {
    // Internal Cost → marks service as unbillable in the database
    markUnbillableMutation.mutate({
      serviceExternalId: serviceId,
      customerExternalId,
      reason: "internal-cost",
      notes: "Assigned to Internal Cost bucket",
    });
  } else {
    // Other buckets → tracked locally in component state only (not persisted)
    setBucketAssignments(prev => ({
      ...prev,
      [bucketId]: [...(prev[bucketId] || []), serviceId],
    }));
    toast.success(`Assigned to ${SPECIAL_BUCKETS.find(b => b.id === bucketId)?.label}`);
  }
}, [customerExternalId, markUnbillableMutation]);
```

**Bucket styling** (dashed border, coloured by bucket type):

```tsx
const SPECIAL_BUCKETS = [
  { id: "usage-holding",         color: "border-purple-300 bg-purple-50" },
  { id: "professional-services", color: "border-indigo-300 bg-indigo-50" },
  { id: "hardware-sales",        color: "border-amber-300 bg-amber-50" },
  { id: "internal-cost",         color: "border-gray-300 bg-gray-50" },
];

// BucketDropTarget renders:
<div
  onDragOver={(e) => handleDragOver(e, `bucket-${bucket.id}`)}
  onDragLeave={handleDragLeave}
  onDrop={(e) => handleDropOnBucket(e, bucket.id)}
  className={cn(
    "border-2 border-dashed rounded-lg p-3 transition-all",
    bucket.color,
    isDragOver && "scale-[1.02] shadow-md border-solid"
  )}
>
```

---

## Backend: tRPC Procedures

The board relies on three queries and three mutations. All are nested under `billing.customers.billingAssignments`:

### Queries

```typescript
// server/routers.ts — inside billing.customers.billingAssignments router

billingItemsWithAssignments: protectedProcedure
  .input(z.object({ customerExternalId: z.string() }))
  .query(async ({ input }) => {
    return await getBillingItemsWithAssignments(input.customerExternalId);
  }),

unassignedServices: protectedProcedure
  .input(z.object({ customerExternalId: z.string() }))
  .query(async ({ input }) => {
    return await getUnassignedServicesForCustomer(input.customerExternalId);
  }),

fuzzyProposals: protectedProcedure
  .input(z.object({ customerExternalId: z.string() }))
  .query(async ({ input }) => {
    return await getFuzzyMatchProposals(input.customerExternalId);
  }),
```

### Mutations

```typescript
assign: protectedProcedure
  .input(z.object({
    billingItemExternalId: z.string(),
    serviceExternalId: z.string(),
    customerExternalId: z.string(),
    assignmentMethod: z.enum(['manual', 'auto', 'drag-drop']).default('drag-drop'),
    assignmentBucket: z.enum([
      'standard', 'usage-holding', 'professional-services',
      'hardware-sales', 'internal-cost'
    ]).default('standard'),
    notes: z.string().optional(),
  }))
  .mutation(async ({ input, ctx }) => {
    const assignedBy = ctx.user?.name || ctx.user?.email || 'unknown';
    return await assignServiceToBillingItem(
      input.billingItemExternalId,
      input.serviceExternalId,
      input.customerExternalId,
      assignedBy,
      input.assignmentMethod,
      input.notes,
      input.assignmentBucket
    );
  }),

removeAssignment: protectedProcedure
  .input(z.object({
    billingItemExternalId: z.string(),
    serviceExternalId: z.string(),
  }))
  .mutation(async ({ input }) => {
    return await removeServiceBillingAssignment(
      input.billingItemExternalId,
      input.serviceExternalId
    );
  }),

markUnbillable: protectedProcedure
  .input(z.object({
    serviceExternalId: z.string(),
    customerExternalId: z.string(),
    reason: z.string(),
    notes: z.string().optional(),
  }))
  .mutation(async ({ input }) => {
    return await markServiceUnbillable(
      input.serviceExternalId,
      input.customerExternalId,
      input.reason,
      input.notes
    );
  }),
```

---

## Backend: Database Functions

### `assignServiceToBillingItem` (server/db.ts)

This function does four things atomically:

1. Checks for duplicate assignment (returns early if already assigned)
2. Inserts into `service_billing_assignments`
3. Inserts a reusable match rule into `service_billing_match_log` (enables future auto-matching)
4. Updates `billing_items.matchStatus` to `'service-matched'`

```typescript
export async function assignServiceToBillingItem(
  billingItemExternalId: string,
  serviceExternalId: string,
  customerExternalId: string,
  assignedBy: string,
  assignmentMethod: 'manual' | 'auto' | 'drag-drop' = 'drag-drop',
  notes?: string,
  assignmentBucket: string = 'standard'
) {
  const db = await getDb();

  // 1. Duplicate check
  const existing = await db
    .select({ id: serviceBillingAssignments.id })
    .from(serviceBillingAssignments)
    .where(and(
      eq(serviceBillingAssignments.billingItemExternalId, billingItemExternalId),
      eq(serviceBillingAssignments.serviceExternalId, serviceExternalId)
    ))
    .limit(1);
  if (existing.length > 0) return { success: true, alreadyAssigned: true };

  // 2. Insert assignment
  await db.insert(serviceBillingAssignments).values({
    billingItemExternalId,
    serviceExternalId,
    customerExternalId,
    assignedBy,
    assignmentMethod,
    assignmentBucket,
    notes: notes || null,
  });

  // 3. Insert match rule for future auto-matching
  const [svc] = await db.select({ planName: services.planName, serviceType: services.serviceType })
    .from(services).where(eq(services.externalId, serviceExternalId)).limit(1);
  const matchKey = `${svc?.planName ?? ''}|${customerExternalId}`;
  await db.insert(serviceBillingMatchLog).values({
    matchKey,
    serviceExternalId,
    billingItemExternalId,
    customerExternalId,
    matchedBy: assignedBy,
    matchMethod: assignmentMethod,
    confidence: 'confirmed',
  }).onDuplicateKeyUpdate({ set: { matchedBy: assignedBy, matchMethod: assignmentMethod } });

  // 4. Update billing item match status
  await db.update(billingItems)
    .set({ matchStatus: 'service-matched' })
    .where(eq(billingItems.externalId, billingItemExternalId));

  return { success: true, alreadyAssigned: false };
}
```

### `getUnassignedServicesForCustomer` (server/db.ts)

Returns all active services for a customer that are not yet assigned to a billing item and not marked unbillable:

```typescript
export async function getUnassignedServicesForCustomer(customerExternalId: string) {
  const db = await getDb();

  // Get already-assigned service IDs
  const assigned = await db
    .select({ serviceExternalId: serviceBillingAssignments.serviceExternalId })
    .from(serviceBillingAssignments)
    .where(eq(serviceBillingAssignments.customerExternalId, customerExternalId));

  // Get unbillable service IDs
  const unbillable = await db
    .select({ serviceExternalId: unbillableServices.serviceExternalId })
    .from(unbillableServices)
    .where(eq(unbillableServices.customerExternalId, customerExternalId));

  const excludedIds = new Set([
    ...assigned.map(a => a.serviceExternalId),
    ...unbillable.map(u => u.serviceExternalId),
  ]);

  // Return active services not in the excluded set
  const allServices = await db
    .select()
    .from(services)
    .where(and(
      eq(services.customerExternalId, customerExternalId),
      sql`${services.status} NOT IN ('terminated', 'flagged_for_termination')`
    ));

  return allServices.filter(s => !excludedIds.has(s.externalId));
}
```

---

## Cache Invalidation After Drop

After a successful assignment, the board must invalidate four query caches to keep the UI consistent:

```tsx
const assignMutation = trpc.billing.customers.billingAssignments.assign.useMutation({
  onSuccess: () => {
    refetchServices();                                          // Left column
    refetchItems();                                             // Right column
    utils.billing.customers.byId.invalidate();                 // Customer header stats
    utils.billing.customers.unmatchedBillingServices.invalidate(); // Unmatched count
    utils.billing.summary.invalidate();                        // Dashboard KPI cards
  },
  onError: (err) => toast.error(`Assignment failed: ${err.message}`),
});
```

Missing any of these invalidations causes stale counts to appear in the header or dashboard even after a successful drop.

---

## Billing Type Tab System

The board is divided into four tabs that filter both the left and right columns simultaneously:

| Tab ID | Label | Billing Type | Included Categories |
|---|---|---|---|
| `advance` | Services (Advance) | Recurring, billed ahead | internet, voice, mobile, starlink, iot, other |
| `arrears` | Usage (Arrears) | Usage charges, billed after | usage, calls |
| `non-recurring` | Non-Recurring | One-off | hardware, professional-services |
| `internal` | Internal / Parked | Internal costs | internal |

The left column filters by `CATEGORY_CONFIG[service.serviceCategory].billingType === activeTab`. The right column uses a description-based heuristic to classify billing items since Xero items do not carry an explicit billing type:

```typescript
function classifyBillingItemType(item: BillingItemWithAssignments): BillingType {
  const desc = (item.description || '').toLowerCase();
  if (desc.match(/hardware|handset|router|modem|one.off|setup fee|installation|professional service/))
    return 'non-recurring';
  if (desc.match(/usage|calls|excess|overage|arrears|per.*call/))
    return 'arrears';
  if (desc.match(/internal|parked|absorbed/))
    return 'internal';
  return 'advance'; // default
}
```

---

## Auto-Match Feature

The **Auto-Match** button triggers `trpc.billing.customers.billingAssignments.autoMatch.useMutation()`. It runs server-side and:

1. Queries `service_billing_match_log` for `confidence = 'confirmed'` rules for this customer
2. For each unassigned service, looks for a rule where `matchKey = planName|customerExternalId`
3. If found, calls `assignServiceToBillingItem` with `assignmentMethod = 'auto'`
4. Returns a count of auto-matched pairs

The button should only be shown once per session (`autoMatchRan` state flag prevents re-running):

```tsx
const [autoMatchRan, setAutoMatchRan] = useState(false);

<Button
  variant="outline"
  size="sm"
  disabled={autoMatchRan || autoMatchRunning}
  onClick={async () => {
    setAutoMatchRunning(true);
    const result = await autoMatchMutation.mutateAsync({ customerExternalId });
    setAutoMatchRan(true);
    setAutoMatchRunning(false);
    toast.success(`Auto-matched ${result.matched} services`);
  }}
>
  {autoMatchRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
  Auto-Match
  {!autoMatchRan && totalUnassigned > 0 && (
    <span className="ml-1 bg-orange-100 text-orange-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
      {totalUnassigned}
    </span>
  )}
</Button>
```

---

## Remove Assignment

Each assigned service row inside a `BillingItemDropTarget` has an `×` button that calls `removeAssignment`:

```tsx
<button
  onClick={() => onRemoveAssignment(item.externalId, svc.serviceExternalId)}
  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-rose-500 transition-all"
>
  <X className="w-3 h-3" />
</button>
```

The remove mutation also invalidates the same four caches as the assign mutation.

---

## Visual States Reference

| State | CSS Classes |
|---|---|
| Service card — idle | `bg-white border border-border cursor-grab` |
| Service card — hover | `hover:border-orange-300 hover:shadow-sm` |
| Service card — dragging | `opacity-40 scale-95 border-orange-400 shadow-lg` |
| Drop target — empty | `border-dashed border-border bg-muted/20` |
| Drop target — drag over | `border-orange-400 bg-orange-50 shadow-md scale-[1.01]` |
| Drop target — has assignments | `border-teal-200 bg-teal-50/30` |
| Bucket — drag over | `scale-[1.02] shadow-md border-solid` |
| Margin positive | `text-teal-700` with `TrendingUp` icon |
| Margin negative | `text-rose-600` with `TrendingDown` icon |

---

## Common Failure Modes

| Symptom | Root Cause | Fix |
|---|---|---|
| Drop does nothing | `e.preventDefault()` missing in `onDragOver` | Add `e.preventDefault()` to every drop target's `onDragOver` handler |
| Service disappears on drag but doesn't appear in target | `dataTransfer.getData()` returns empty string | Ensure `setData("serviceExternalId", ...)` is called in `onDragStart` before any `preventDefault` |
| Drop fires but tRPC mutation not called | `serviceId` check failing | Log `e.dataTransfer.getData("serviceExternalId")` on drop to verify the payload |
| Left column doesn't refresh after drop | Missing `refetchServices()` in `onSuccess` | Add `refetchServices()` to the assign mutation's `onSuccess` callback |
| Right column shows stale margin | Missing `refetchItems()` in `onSuccess` | Add `refetchItems()` to the assign mutation's `onSuccess` callback |
| Dashboard stats don't update | Missing `utils.billing.summary.invalidate()` | Add summary invalidation to `onSuccess` |
| Service appears in both columns after drop | `getUnassignedServicesForCustomer` not excluding the new assignment | Verify the DB function queries `service_billing_assignments` for exclusions |
| Auto-match runs but matches nothing | `service_billing_match_log` is empty | Auto-match only works after at least one manual drag-drop has created a match rule |

---

## Database Tables Involved

| Table | Role |
|---|---|
| `service_billing_assignments` | Primary assignment records — one row per service-to-billing-item link |
| `service_billing_match_log` | Reusable match rules — populated on every drag-drop, used by auto-match |
| `unbillable_services` | Services dropped into Internal Cost bucket |
| `billing_items` | Xero billing items — `matchStatus` updated to `'service-matched'` on assignment |
| `services` | Source of unassigned services — filtered by `status NOT IN ('terminated', 'flagged_for_termination')` |

---

## Checklist for Replit Implementation

- [ ] `ServiceCard` has `draggable` attribute on root element
- [ ] `onDragStart` calls `e.dataTransfer.setData("serviceExternalId", service.externalId)`
- [ ] `onDragStart` sets `e.dataTransfer.effectAllowed = "move"`
- [ ] Every drop target's `onDragOver` calls `e.preventDefault()`
- [ ] Every drop target's `onDrop` calls `e.preventDefault()` and reads `e.dataTransfer.getData("serviceExternalId")`
- [ ] `dragOverTarget` state drives the visual highlight on the active drop zone
- [ ] `assignMutation.onSuccess` calls `refetchServices()`, `refetchItems()`, and invalidates `byId` + `summary`
- [ ] `removeAssignment` mutation also invalidates the same caches
- [ ] `getUnassignedServicesForCustomer` excludes both `service_billing_assignments` AND `unbillable_services`
- [ ] `assignServiceToBillingItem` writes to both `service_billing_assignments` AND `service_billing_match_log`
- [ ] `assignServiceToBillingItem` updates `billing_items.matchStatus = 'service-matched'`
- [ ] Billing type tabs filter both left and right columns simultaneously
- [ ] Auto-match button is disabled after first run per session
