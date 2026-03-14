/**
 * Tests for createCustomer and getSuggestedCustomersForService functions.
 * These are unit/integration tests that verify the customer creation logic.
 */
import { describe, it, expect } from 'vitest';
import { createCustomer } from './db';

describe('createCustomer', () => {
  it('should require a non-empty name', async () => {
    await expect(createCustomer({ name: '' })).rejects.toThrow('Customer name is required');
  });

  it('should require a non-empty name (whitespace only)', async () => {
    await expect(createCustomer({ name: '   ' })).rejects.toThrow('Customer name is required');
  });

  it('should return alreadyExists=false for a new unique name', async () => {
    // Use a highly unique name that won't exist in the DB
    const uniqueName = `Test Customer ${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const result = await createCustomer({ name: uniqueName, createdBy: 'vitest' });
    expect(result.success).toBe(true);
    expect(result.alreadyExists).toBe(false);
    expect(result.externalId).toMatch(/^C\d+$/);
  });

  it('should return alreadyExists=true when customer name already exists', async () => {
    // Use a name that definitely exists (Zambrero is a known customer group)
    // We test the duplicate detection logic by creating the same customer twice
    const uniqueName = `Duplicate Test ${Date.now()}`;
    const first = await createCustomer({ name: uniqueName });
    expect(first.success).toBe(true);

    const second = await createCustomer({ name: uniqueName });
    expect(second.alreadyExists).toBe(true);
    expect(second.externalId).toBe(first.externalId);
  });

  it('should generate sequential externalIds in C#### format', async () => {
    const name1 = `Sequential Test A ${Date.now()}`;
    const name2 = `Sequential Test B ${Date.now()}`;
    const r1 = await createCustomer({ name: name1 });
    const r2 = await createCustomer({ name: name2 });
    expect(r1.externalId).toMatch(/^C\d+$/);
    expect(r2.externalId).toMatch(/^C\d+$/);
    const num1 = parseInt(r1.externalId.slice(1));
    const num2 = parseInt(r2.externalId.slice(1));
    expect(num2).toBeGreaterThan(num1);
  });

  it('should include createdBy in notes when provided', async () => {
    const { getDb } = await import('./db');
    const { customers } = await import('../drizzle/schema');
    const { eq } = await import('drizzle-orm');

    const uniqueName = `Notes Test ${Date.now()}`;
    const result = await createCustomer({ name: uniqueName, notes: 'Test note', createdBy: 'test-user' });
    expect(result.success).toBe(true);

    const db = await getDb();
    if (db) {
      const [row] = await db.select({ notes: customers.notes })
        .from(customers)
        .where(eq(customers.externalId, result.externalId))
        .limit(1);
      expect(row?.notes).toContain('Test note');
      expect(row?.notes).toContain('test-user');
    }
  });
});

describe('getSuggestedCustomersForService', () => {
  it('should return empty array for non-existent service', async () => {
    const { getSuggestedCustomersForService } = await import('./db');
    const result = await getSuggestedCustomersForService('NONEXISTENT-9999');
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });

  it('should return suggestions with confidence scores between 0 and 100', async () => {
    const { getSuggestedCustomersForService } = await import('./db');
    // Find a service with SM import notes
    const { getDb } = await import('./db');
    const { services } = await import('../drizzle/schema');
    const { like } = await import('drizzle-orm');
    const db = await getDb();
    if (!db) return;

    const [svc] = await db.select({ externalId: services.externalId })
      .from(services)
      .where(like(services.discoveryNotes, '%SM Import%'))
      .limit(1);

    if (!svc) return; // Skip if no SM-imported services in test DB

    const suggestions = await getSuggestedCustomersForService(svc.externalId);
    for (const s of suggestions) {
      expect(s.confidence).toBeGreaterThanOrEqual(0);
      expect(s.confidence).toBeLessThanOrEqual(100);
      expect(s.externalId).toMatch(/^C\d+$/);
      expect(typeof s.name).toBe('string');
    }
  });
});
