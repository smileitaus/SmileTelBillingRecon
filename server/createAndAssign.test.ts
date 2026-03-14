/**
 * Tests for the "Create as new customer + assign service + create Platform Check" workflow.
 * Verifies that:
 *   1. createCustomer creates a customer
 *   2. assignServiceToCustomer assigns the service and updates its status
 *   3. getServiceForPlatformCheck returns the correct service details
 *   4. createBillingPlatformCheck creates a check with the correct targetType/targetId
 */
import { describe, it, expect } from 'vitest';
import {
  createCustomer,
  assignServiceToCustomer,
  getServiceForPlatformCheck,
  createBillingPlatformCheck,
} from './db';

describe('create-and-assign workflow', () => {
  it('getServiceForPlatformCheck returns null for non-existent service', async () => {
    const result = await getServiceForPlatformCheck('NONEXISTENT-9999');
    expect(result).toBeNull();
  });

  it('getServiceForPlatformCheck returns service details for a real service', async () => {
    const { getDb } = await import('./db');
    const { services } = await import('../drizzle/schema');
    const db = await getDb();
    if (!db) return;

    // Find any service to test with
    const [svc] = await db.select().from(services).limit(1);
    if (!svc) return;

    const details = await getServiceForPlatformCheck(svc.externalId);
    expect(details).not.toBeNull();
    expect(typeof details!.serviceType === 'string' || details!.serviceType === null).toBe(true);
    expect(typeof details!.monthlyCost === 'number' || typeof details!.monthlyCost === 'string').toBe(true);
  });

  it('full workflow: create customer → assign service → create Platform Check', async () => {
    const { getDb } = await import('./db');
    const { services, customers, billingPlatformChecks: billing_platform_checks } = await import('../drizzle/schema');
    const { eq, and } = await import('drizzle-orm');
    const db = await getDb();
    if (!db) return;

    // Find an unmatched service to use in the test
    const [unmatchedSvc] = await db
      .select()
      .from(services)
      .where(eq(services.status, 'unmatched'))
      .limit(1);

    if (!unmatchedSvc) {
      // No unmatched services available — skip test gracefully
      console.warn('No unmatched services found; skipping full workflow test');
      return;
    }

    // Step 1: Create a new customer
    const uniqueName = `Workflow Test Customer ${Date.now()}`;
    const customer = await createCustomer({ name: uniqueName, createdBy: 'vitest' });
    expect(customer.success).toBe(true);
    expect(customer.alreadyExists).toBe(false);
    expect(customer.externalId).toMatch(/^C\d+$/);

    // Step 2: Assign the service to the new customer
    const assignResult = await assignServiceToCustomer(
      unmatchedSvc.externalId,
      customer.externalId
    );
    expect(assignResult.success).toBe(true);

    // Verify the service is now linked to the customer
    const [updatedSvc] = await db
      .select()
      .from(services)
      .where(eq(services.externalId, unmatchedSvc.externalId))
      .limit(1);
    expect(updatedSvc?.customerExternalId).toBe(customer.externalId);
    expect(updatedSvc?.status).toBe('active');

    // Step 3: Get service details for Platform Check
    const svcDetails = await getServiceForPlatformCheck(unmatchedSvc.externalId);
    expect(svcDetails).not.toBeNull();

    // Step 4: Create Platform Check with service details
    const checkResult = await createBillingPlatformCheck({
      targetType: 'service',
      targetId: unmatchedSvc.externalId,
      targetName: svcDetails?.planName || svcDetails?.serviceType || unmatchedSvc.externalId,
      platform: 'OneBill',
      issueType: 'new-customer-assignment',
      issueDescription: `Service assigned to new customer "${uniqueName}". Verify billing platform setup.`,
      customerName: uniqueName,
      customerExternalId: customer.externalId,
      monthlyAmount: Number(svcDetails?.monthlyCost ?? 0),
      priority: 'medium',
      createdBy: 'vitest',
    });
    // MySQL insertId may be BigInt; check it's truthy and positive
    expect(checkResult.id).toBeTruthy();

    // Verify the Platform Check was created with correct targetType and targetId
    const [check] = await db
      .select()
      .from(billing_platform_checks)
      .where(
        and(
          eq(billing_platform_checks.targetId, unmatchedSvc.externalId),
          eq(billing_platform_checks.targetType, 'service')
        )
      )
      .limit(1);
    expect(check).toBeDefined();
    expect(check?.targetType).toBe('service');
    expect(check?.targetId).toBe(unmatchedSvc.externalId);
    expect(check?.customerExternalId).toBe(customer.externalId);
    expect(check?.issueType).toBe('new-customer-assignment');

    // Cleanup: remove test records so they don’t pollute the Platform Checks page
    if (check?.id) {
      await db.delete(billing_platform_checks).where(eq(billing_platform_checks.id, check.id));
    }
    // Also unassign the service so it goes back to unmatched for future test runs
    await db.update(services)
      .set({ customerExternalId: null, customerName: null, status: 'unmatched' } as any)
      .where(eq(services.externalId, unmatchedSvc.externalId));
    // Remove test customer
    await db.delete(customers).where(eq(customers.externalId, customer.externalId));
  });
});
