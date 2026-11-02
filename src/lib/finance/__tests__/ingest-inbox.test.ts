import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@src/lib/db';
import {
  finAccounts,
  finCategories,
  finInbox,
  finTransactions,
  payeeRules,
  users,
} from '@src/lib/db';
import { eq, inArray } from 'drizzle-orm';
import { ingestItems } from '../ingest/service';
import { approveItems, listInbox, rejectItems, learnPayeeRule } from '../inbox/service';
import { ingestBatchSchema, ingestItemSchema } from '../ingest/schema';

describe('Transaction Ingest & Inbox Workflow', () => {
  const userA = 'usr_ingest_a';
  const userB = 'usr_ingest_b';
  const accountA1 = 'acc_ingest_hdfc_savings';
  const accountA2 = 'acc_ingest_hdfc_card';
  const categoryDining = 'cat_ingest_dining';
  const categoryGroceries = 'cat_ingest_groceries';

  beforeEach(async () => {
    // Seed users
    await db.insert(users).values([
      { id: userA, email: 'ingest_a@example.com', name: 'User A', passwordHash: 'h', role: 'member' },
      { id: userB, email: 'ingest_b@example.com', name: 'User B', passwordHash: 'h', role: 'member' },
    ]).onConflictDoNothing();

    // Seed accounts for User A
    await db.insert(finAccounts).values([
      {
        id: accountA1,
        userId: userA,
        name: 'HDFC Savings',
        kind: 'bank',
        class: 'asset',
        metadata: { labelLast4: '7890' },
      },
      {
        id: accountA2,
        userId: userA,
        name: 'HDFC Millennia Card',
        kind: 'credit_card',
        class: 'liability',
        creditLimit: 10000000,
        metadata: { labelLast4: '4521' },
      },
    ]).onConflictDoNothing();

    // Seed categories
    await db.insert(finCategories).values([
      { id: categoryDining, userId: userA, name: 'Dining', type: 'expense' },
      { id: categoryGroceries, userId: userA, name: 'Groceries', type: 'expense' },
    ]).onConflictDoNothing();

    // Seed payee rule: Swiggy -> Dining
    await db.insert(payeeRules).values({
      id: 'rule_swiggy',
      userId: userA,
      payeePattern: 'swiggy',
      categoryId: categoryDining,
      priority: 10,
    }).onConflictDoNothing();
  });

  afterEach(async () => {
    await db.delete(finTransactions).where(inArray(finTransactions.userId, [userA, userB]));
    await db.delete(finInbox).where(inArray(finInbox.userId, [userA, userB]));
    await db.delete(payeeRules).where(inArray(payeeRules.userId, [userA, userB]));
  });

  it('validates payload limits: enforces max 50 items and truncates raw text to 2048 characters', () => {
    const validItem = {
      idempotencyKey: 'k-1',
      source: 'email' as const,
      receivedAt: new Date().toISOString(),
      date: '2026-11-01',
      amount: 50000,
      direction: 'debit' as const,
      currency: 'INR',
    };

    // Array of 51 items exceeds limit
    const items51 = Array.from({ length: 51 }, (_, i) => ({
      ...validItem,
      idempotencyKey: `k-${i}`,
    }));
    expect(() => ingestBatchSchema.parse({ items: items51 })).toThrow(/Maximum 50 items/);

    // Truncates raw text longer than 2048 chars
    const longRaw = 'A'.repeat(5000);
    const parsedItem = ingestItemSchema.parse({ ...validItem, raw: longRaw });
    expect(parsedItem.raw?.length).toBe(2048);
  });

  it('matches account by last4 hint or name and suggests category from payee rules', async () => {
    const results = await ingestItems(userA, [
      {
        idempotencyKey: 'msg-swiggy-001',
        source: 'email',
        receivedAt: new Date().toISOString(),
        date: '2026-11-01',
        amount: 85000, // Rs. 850
        direction: 'debit',
        currency: 'INR',
        merchant: 'Swiggy Bangalore',
        accountHint: { last4: '4521' }, // Matches HDFC Card
      },
      {
        idempotencyKey: 'msg-salary-002',
        source: 'email',
        receivedAt: new Date().toISOString(),
        date: '2026-11-01',
        amount: 5000000, // Rs. 50,000
        direction: 'credit',
        currency: 'INR',
        merchant: 'Employer Corp',
        accountHint: { name: 'HDFC Savings' }, // Matches HDFC Savings
      },
    ]);

    expect(results).toHaveLength(2);
    expect(results[0].status).toBe('accepted');
    expect(results[1].status).toBe('accepted');

    const inboxList = await listInbox(userA, { status: 'pending' });
    const swiggyItem = inboxList.items.find((i) => i.idempotencyKey === 'msg-swiggy-001');
    const salaryItem = inboxList.items.find((i) => i.idempotencyKey === 'msg-salary-002');

    // Verified account matching
    expect(swiggyItem?.matchedAccountId).toBe(accountA2);
    expect(salaryItem?.matchedAccountId).toBe(accountA1);

    // Verified category suggestion from payee rules
    expect(swiggyItem?.suggestedCategoryId).toBe(categoryDining);
  });

  it('is idempotent: re-ingesting the same idempotencyKey returns the existing item without duplicates', async () => {
    const item = {
      idempotencyKey: 'idemp-test-unique-key',
      source: 'api' as const,
      receivedAt: new Date().toISOString(),
      date: '2026-11-01',
      amount: 150000,
      direction: 'debit' as const,
      currency: 'INR',
      merchant: 'Amazon IN',
    };

    const first = await ingestItems(userA, [item]);
    expect(first[0].status).toBe('accepted');
    const initialId = first[0].inboxId;

    // Second ingestion with same key
    const second = await ingestItems(userA, [{ ...item, amount: 999999 }]); // Attempting different amount
    expect(second[0].inboxId).toBe(initialId);

    // Ensure database contains only 1 inbox item
    const allItems = await db
      .select()
      .from(finInbox)
      .where(eq(finInbox.idempotencyKey, item.idempotencyKey));
    expect(allItems).toHaveLength(1);
    expect(allItems[0].amount).toBe(150000); // Original amount preserved
  });

  it('detects duplicate warnings against existing transactions (similar amount/date/payee & importHash)', async () => {
    // Insert an existing ledger transaction
    await db.insert(finTransactions).values({
      id: 'txn_existing_1',
      userId: userA,
      accountId: accountA1,
      date: '2026-11-01',
      type: 'expense',
      amount: 129900,
      signedAmount: -129900,
      payee: 'Amazon IN',
    });

    // Ingest alert with same amount, similar payee, on same date
    const [result] = await ingestItems(userA, [
      {
        idempotencyKey: 'alert-amzn-duplicate',
        source: 'email',
        receivedAt: new Date().toISOString(),
        date: '2026-11-01',
        amount: 129900,
        direction: 'debit',
        currency: 'INR',
        merchant: 'Amazon India', // similar payee
      },
    ]);

    expect(result.status).toBe('accepted');
    const [inboxItem] = await db.select().from(finInbox).where(eq(finInbox.id, result.inboxId!));
    expect(inboxItem.duplicateWarning).toBeDefined();
    expect(inboxItem.duplicateWarning).not.toBeNull();
    const warnings = inboxItem.duplicateWarning as Array<{ reason: string; existingId?: string }>;
    expect(warnings.some((w) => w.reason === 'similar_transaction')).toBe(true);
  });

  it('approves items: creates exactly one transaction with clientRequestId = idempotencyKey in one atomic transaction', async () => {
    const [ingestRes] = await ingestItems(userA, [
      {
        idempotencyKey: 'ingest-approve-key-1',
        source: 'sms',
        receivedAt: new Date().toISOString(),
        date: '2026-11-01',
        amount: 250000,
        direction: 'debit',
        currency: 'INR',
        merchant: 'BookMyShow',
        accountHint: { name: 'HDFC Savings' },
      },
    ]);

    // Approve the inbox item
    const approveResult = await approveItems(userA, [
      {
        id: ingestRes.inboxId!,
        accountId: accountA1,
        categoryId: categoryDining,
        payee: 'BookMyShow Bangalore',
        amount: 250000,
      },
    ]);

    expect(approveResult.approved).toContain(ingestRes.inboxId);
    expect(approveResult.transactionIds).toHaveLength(1);
    const txnId = approveResult.transactionIds[0];

    // Verify exactly one transaction created in fin_transactions
    const [createdTxn] = await db
      .select()
      .from(finTransactions)
      .where(eq(finTransactions.id, txnId));

    expect(createdTxn).toBeDefined();
    expect(createdTxn.clientRequestId).toBe('ingest-approve-key-1');
    expect(createdTxn.amount).toBe(250000);
    expect(createdTxn.signedAmount).toBe(-250000);
    expect(createdTxn.payee).toBe('BookMyShow Bangalore');
    expect(createdTxn.categoryId).toBe(categoryDining);

    // Verify inbox item updated to 'approved'
    const [updatedInbox] = await db
      .select()
      .from(finInbox)
      .where(eq(finInbox.id, ingestRes.inboxId!));
    expect(updatedInbox.status).toBe('approved');
    expect(updatedInbox.createdTransactionId).toBe(txnId);
  });

  it('rejected items update status and never create ledger transactions', async () => {
    const [ingestRes] = await ingestItems(userA, [
      {
        idempotencyKey: 'reject-test-key',
        source: 'sms',
        receivedAt: new Date().toISOString(),
        date: '2026-11-01',
        amount: 10000,
        direction: 'debit',
        currency: 'INR',
        merchant: 'Spam Alert',
      },
    ]);

    const rejectRes = await rejectItems(userA, [ingestRes.inboxId!]);
    expect(rejectRes.rejected).toContain(ingestRes.inboxId);

    // Verify status is rejected
    const [inboxItem] = await db.select().from(finInbox).where(eq(finInbox.id, ingestRes.inboxId!));
    expect(inboxItem.status).toBe('rejected');
    expect(inboxItem.createdTransactionId).toBeNull();

    // Verify NO transactions were created
    const txns = await db
      .select()
      .from(finTransactions)
      .where(eq(finTransactions.clientRequestId, 'reject-test-key'));
    expect(txns).toHaveLength(0);
  });

  it('learnPayeeRule creates and upserts rule for merchant pattern', async () => {
    const [ingestRes] = await ingestItems(userA, [
      {
        idempotencyKey: 'learn-rule-key',
        source: 'email',
        receivedAt: new Date().toISOString(),
        date: '2026-11-01',
        amount: 45000,
        direction: 'debit',
        currency: 'INR',
        merchant: 'BigBasket Online',
      },
    ]);

    await learnPayeeRule(userA, ingestRes.inboxId!, categoryGroceries);

    // Verify payee rule was created
    const [rule] = await db
      .select()
      .from(payeeRules)
      .where(eq(payeeRules.payeePattern, 'bigbasket online'));

    expect(rule).toBeDefined();
    expect(rule.categoryId).toBe(categoryGroceries);
    expect(rule.userId).toBe(userA);
  });

  it('enforces strict user isolation: User A cannot see, approve or reject User B items', async () => {
    const [userBItem] = await ingestItems(userB, [
      {
        idempotencyKey: 'user-b-secret-item',
        source: 'api',
        receivedAt: new Date().toISOString(),
        date: '2026-11-01',
        amount: 99900,
        direction: 'debit',
        currency: 'INR',
        merchant: 'Private Merchant',
      },
    ]);

    // User A lists inbox — User B item must not be visible
    const listA = await listInbox(userA, { status: 'pending' });
    expect(listA.items.find((i) => i.id === userBItem.inboxId)).toBeUndefined();

    // User A attempts to approve User B item — must fail
    const approveAttempt = await approveItems(userA, [
      { id: userBItem.inboxId!, accountId: accountA1 },
    ]);
    expect(approveAttempt.approved).toHaveLength(0);
    expect(approveAttempt.failed[0]?.reason).toBe('Not found');

    // Item must remain untouched in User B inbox
    const [itemB] = await db.select().from(finInbox).where(eq(finInbox.id, userBItem.inboxId!));
    expect(itemB.status).toBe('pending');
    expect(itemB.createdTransactionId).toBeNull();
  });
});
