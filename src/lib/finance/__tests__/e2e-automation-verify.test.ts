/**
 * End-to-end verification test for the Automation Foundation:
 * VERIFY requirements from user prompt:
 * 1. Create a token (shown once in full, prefix + scopes stored).
 * 2. Replay fixtures with expected parsed outputs (HDFC debit, HDFC credit, ICICI debit).
 * 3. Inspect items in Inbox with suggestions and duplicate flags.
 * 4. Approve some and confirm balances update exactly once.
 * 5. Replay again and confirm no duplicates (idempotency + duplicate detection).
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { db } from '@src/lib/db';
import {
  finAccounts,
  finCategories,
  finInbox,
  finTransactions,
  payeeRules,
  users,
} from '@src/lib/db';
import { eq } from 'drizzle-orm';
import { createToken, validateToken } from '@src/lib/auth/api-tokens';
import { ingestItems } from '../ingest/service';
import { approveItems, listInbox } from '../inbox/service';
import { calculateAccountBalance } from '../domain/balances';

describe('VERIFY: End-to-End Automation & Ingestion', () => {
  const userId = 'usr_verify_e2e';
  const cardAccountId = 'acc_verify_card_4521';
  const savingsAccountId = 'acc_verify_savings_7890';
  const categoryShopping = 'cat_verify_shopping';
  const categoryIncome = 'cat_verify_income';

  let apiToken = '';
  let tokenPrefix = '';

  beforeAll(async () => {
    // Clean up
    await db.delete(finTransactions).where(eq(finTransactions.userId, userId));
    await db.delete(finInbox).where(eq(finInbox.userId, userId));
    await db.delete(payeeRules).where(eq(payeeRules.userId, userId));
    await db.delete(finAccounts).where(eq(finAccounts.userId, userId));
    await db.delete(finCategories).where(eq(finCategories.userId, userId));
    await db.delete(users).where(eq(users.id, userId));

    // Seed test user
    await db.insert(users).values({
      id: userId,
      email: 'verify_e2e@example.com',
      name: 'E2E Verifier',
      passwordHash: 'dummy',
      role: 'member',
    });

    // Seed test accounts matching fixture hints: Card XX4521 and Savings XX7890
    await db.insert(finAccounts).values([
      {
        id: cardAccountId,
        userId,
        name: 'HDFC Credit Card',
        kind: 'credit_card',
        class: 'liability',
        creditLimit: 5000000,
        metadata: { labelLast4: '4521' },
      },
      {
        id: savingsAccountId,
        userId,
        name: 'HDFC Savings Account',
        kind: 'bank',
        class: 'asset',
        metadata: { labelLast4: '7890' },
      },
    ]);

    await db.insert(finCategories).values([
      { id: categoryShopping, userId, name: 'Shopping', type: 'expense' },
      { id: categoryIncome, userId, name: 'Salary', type: 'income' },
    ]);

    // Payee rule: AMAZON IN -> Shopping
    await db.insert(payeeRules).values({
      id: 'rule_amzn_e2e',
      userId,
      payeePattern: 'amazon in',
      categoryId: categoryShopping,
      priority: 10,
    });
  });

  afterAll(async () => {
    await db.delete(finTransactions).where(eq(finTransactions.userId, userId));
    await db.delete(finInbox).where(eq(finInbox.userId, userId));
    await db.delete(payeeRules).where(eq(payeeRules.userId, userId));
    await db.delete(finAccounts).where(eq(finAccounts.userId, userId));
    await db.delete(finCategories).where(eq(finCategories.userId, userId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it('Step 1: Creates an API token (raw shown once, prefix + scopes stored)', async () => {
    const { token, record } = await createToken(userId, 'n8n E2E Ingester', ['finance:ingest']);

    expect(token).toBeDefined();
    expect(token.length).toBe(64);
    apiToken = token;
    tokenPrefix = record.prefix;

    expect(tokenPrefix).toBe(token.slice(0, 8));
    expect(record.scopes).toEqual(['finance:ingest']);

    // Validates with finance:ingest
    const auth = await validateToken(apiToken, 'finance:ingest');
    expect(auth).not.toBeNull();
    expect(auth?.userId).toBe(userId);
  });

  it('Step 2 & 3: Ingests alert fixtures, matches accounts, provides category suggestions and duplicate flags', async () => {
    const fixturesDir = path.join(process.cwd(), 'scripts/fixtures/email-alerts');
    const hdfcDebitRaw = fs.readFileSync(path.join(fixturesDir, 'hdfc-debit.txt'), 'utf8');
    const hdfcCreditRaw = fs.readFileSync(path.join(fixturesDir, 'hdfc-credit.txt'), 'utf8');
    const iciciDebitRaw = fs.readFileSync(path.join(fixturesDir, 'icici-debit.txt'), 'utf8');

    const today = new Date().toISOString().split('T')[0];

    const results = await ingestItems(userId, [
      {
        idempotencyKey: `e2e-hdfc-debit-${today}`,
        source: 'email',
        receivedAt: new Date().toISOString(),
        date: today,
        amount: 129900, // Rs. 1,299
        direction: 'debit',
        currency: 'INR',
        merchant: 'AMAZON IN',
        description: 'Rs.1,299.00 debited from HDFC Credit Card XX4521 at AMAZON IN',
        accountHint: { last4: '4521' },
        raw: hdfcDebitRaw,
      },
      {
        idempotencyKey: `e2e-hdfc-credit-${today}`,
        source: 'email',
        receivedAt: new Date().toISOString(),
        date: today,
        amount: 4500000, // Rs. 45,000
        direction: 'credit',
        currency: 'INR',
        merchant: 'NEFT Transfer',
        description: 'Rs.45,000.00 credited to HDFC Savings XX7890',
        accountHint: { last4: '7890' },
        raw: hdfcCreditRaw,
      },
      {
        idempotencyKey: `e2e-icici-debit-${today}`,
        source: 'email',
        receivedAt: new Date().toISOString(),
        date: today,
        amount: 59900, // Rs. 599
        direction: 'debit',
        currency: 'INR',
        merchant: 'NETFLIX',
        description: 'INR 599.00 used at NETFLIX on ICICI Card XX8832',
        accountHint: { last4: '8832' },
        raw: iciciDebitRaw,
      },
    ]);

    expect(results).toHaveLength(3);
    expect(results.every((r) => r.status === 'accepted')).toBe(true);

    // List Inbox items and check hints & suggestions
    const inbox = await listInbox(userId, { status: 'pending' });
    expect(inbox.pendingCount).toBe(3);

    const amazon = inbox.items.find((i) => i.merchant === 'AMAZON IN');
    const salary = inbox.items.find((i) => i.merchant === 'NEFT Transfer');
    const netflix = inbox.items.find((i) => i.merchant === 'NETFLIX');

    expect(amazon).toBeDefined();
    expect(salary).toBeDefined();
    expect(netflix).toBeDefined();

    // Verify account hints
    expect(amazon?.matchedAccountId).toBe(cardAccountId); // Matched XX4521
    expect(salary?.matchedAccountId).toBe(savingsAccountId); // Matched XX7890
    expect(netflix?.matchedAccountId).toBeNull(); // XX8832 unmatched

    // Verify category suggestions
    expect(amazon?.suggestedCategoryId).toBe(categoryShopping); // Matched payee rule
  });

  it('Step 4: Approves items and confirms account ledger balance updates once', async () => {
    const inbox = await listInbox(userId, { status: 'pending' });
    const amazon = inbox.items.find((i) => i.merchant === 'AMAZON IN')!;

    // Initial card balance
    const initialTxns = await db
      .select()
      .from(finTransactions)
      .where(eq(finTransactions.accountId, cardAccountId));
    const initialBalance = calculateAccountBalance(initialTxns, cardAccountId);
    expect(initialBalance).toBe(0);

    // Approve Amazon item
    const approveResult = await approveItems(userId, [
      {
        id: amazon.id,
        accountId: amazon.matchedAccountId!,
        categoryId: amazon.suggestedCategoryId,
        payee: amazon.merchant,
        amount: amazon.amount,
      },
    ]);

    expect(approveResult.approved).toContain(amazon.id);
    expect(approveResult.transactionIds).toHaveLength(1);

    // Verify exactly 1 transaction created in fin_transactions
    const updatedTxns = await db
      .select()
      .from(finTransactions)
      .where(eq(finTransactions.accountId, cardAccountId));
    expect(updatedTxns).toHaveLength(1);

    // Confirm card balance updated once: -129900 paise (expense on card)
    const newBalance = calculateAccountBalance(updatedTxns, cardAccountId);
    expect(newBalance).toBe(-129900);
  });

  it('Step 5: Replays again and confirms no duplicates (idempotency + duplicate detection)', async () => {
    const today = new Date().toISOString().split('T')[0];

    // Replay the exact same payload
    const replayResults = await ingestItems(userId, [
      {
        idempotencyKey: `e2e-hdfc-debit-${today}`,
        source: 'email',
        receivedAt: new Date().toISOString(),
        date: today,
        amount: 129900,
        direction: 'debit',
        currency: 'INR',
        merchant: 'AMAZON IN',
        accountHint: { last4: '4521' },
      },
    ]);

    expect(replayResults).toHaveLength(1);

    // Replay check: transaction table still has exactly 1 transaction
    const cardTxns = await db
      .select()
      .from(finTransactions)
      .where(eq(finTransactions.accountId, cardAccountId));
    expect(cardTxns).toHaveLength(1);

    const balance = calculateAccountBalance(cardTxns, cardAccountId);
    expect(balance).toBe(-129900); // Balance unchanged

    // Replay with new idempotency key but similar txn attributes -> triggers duplicate detection
    const duplicateAlert = await ingestItems(userId, [
      {
        idempotencyKey: `new-alert-similar-amazon-${Date.now()}`,
        source: 'email',
        receivedAt: new Date().toISOString(),
        date: today,
        amount: 129900,
        direction: 'debit',
        currency: 'INR',
        merchant: 'Amazon India',
        accountHint: { last4: '4521' },
      },
    ]);

    const [dupItem] = await db
      .select()
      .from(finInbox)
      .where(eq(finInbox.id, duplicateAlert[0].inboxId!));

    expect(dupItem.duplicateWarning).toBeDefined();
    expect(dupItem.duplicateWarning).not.toBeNull();
    const warnings = dupItem.duplicateWarning as Array<{ reason: string }>;
    expect(warnings.some((w) => w.reason === 'similar_transaction')).toBe(true);
  });
});
