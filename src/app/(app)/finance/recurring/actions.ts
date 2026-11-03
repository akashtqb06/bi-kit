'use server';

import { revalidatePath } from 'next/cache';
import { requireUserApi } from '@src/lib/auth/dal';
import { getFinanceService } from '@src/lib/finance/get-service';
import type {
  AccountDTO,
  CategoryDTO,
  CreateRecurringRuleDTO,
  RecurringRuleDTO,
  UpdateRecurringRuleDTO,
} from '@src/lib/finance/contract';
import {
  generateDueRecurringTransactions,
  projectUpcomingOccurrences,
  type GenerationResult,
  type OccurrenceProjection,
} from '@src/lib/finance/recurring';
import { todayInTz, DEFAULT_TZ } from '@src/lib/finance/timezone';

export interface RecurringPageData {
  rules: RecurringRuleDTO[];
  accounts: AccountDTO[];
  categories: CategoryDTO[];
  upcoming: OccurrenceProjection[];
}

/**
 * Loads all recurring rules, user accounts, categories, and 60-day projected occurrences.
 * Automatically catches up any due recurring transactions first.
 */
export async function getRecurringPageDataAction(): Promise<RecurringPageData> {
  const user = await requireUserApi();
  const service = getFinanceService();
  const today = todayInTz(DEFAULT_TZ);

  // Catch up any due occurrences up to today before projecting
  await generateDueRecurringTransactions({
    userId: user.id,
    asOfDate: today,
  });

  const [rules, accounts, categories] = await Promise.all([
    service.listRecurringRules(user.id),
    service.listAccounts(user.id, { isActive: true }),
    service.listCategories(user.id),
  ]);

  const accountMap = new Map(accounts.map((a) => [a.id, a.name]));
  const categoryMap = new Map(categories.map((c) => [c.id, c.name]));

  const rawUpcoming = projectUpcomingOccurrences(rules, today, 60);

  const upcoming: OccurrenceProjection[] = rawUpcoming.map((item) => ({
    ...item,
    accountName: accountMap.get(item.accountId) || 'Unknown Account',
    toAccountName: item.toAccountId ? accountMap.get(item.toAccountId) || 'Unknown Account' : undefined,
    categoryName: item.categoryId ? categoryMap.get(item.categoryId) || 'Uncategorized' : undefined,
  }));

  return {
    rules,
    accounts,
    categories,
    upcoming,
  };
}

/**
 * Triggers generation of due recurring transactions up to today.
 */
export async function generateDueNowAction(): Promise<GenerationResult> {
  const user = await requireUserApi();
  const today = todayInTz(DEFAULT_TZ);
  const result = await generateDueRecurringTransactions({
    userId: user.id,
    asOfDate: today,
  });
  revalidatePath('/finance');
  revalidatePath('/finance/accounts');
  revalidatePath('/finance/transactions');
  return result;
}

/**
 * Creates a new recurring transaction rule and immediately generates due occurrences.
 */
export async function createRecurringRuleAction(
  data: CreateRecurringRuleDTO
): Promise<{ success: boolean; rule: RecurringRuleDTO }> {
  const user = await requireUserApi();
  const service = getFinanceService();
  const rule = await service.createRecurringRule(user.id, data);
  const today = todayInTz(DEFAULT_TZ);
  await generateDueRecurringTransactions({
    userId: user.id,
    asOfDate: today,
  });
  revalidatePath('/finance');
  revalidatePath('/finance/accounts');
  revalidatePath('/finance/transactions');
  return { success: true, rule };
}

/**
 * Updates an existing recurring transaction rule and checks for due occurrences.
 */
export async function updateRecurringRuleAction(
  id: string,
  data: UpdateRecurringRuleDTO
): Promise<{ success: boolean; rule: RecurringRuleDTO }> {
  const user = await requireUserApi();
  const service = getFinanceService();
  const rule = await service.updateRecurringRule(user.id, id, data);
  const today = todayInTz(DEFAULT_TZ);
  await generateDueRecurringTransactions({
    userId: user.id,
    asOfDate: today,
  });
  revalidatePath('/finance');
  revalidatePath('/finance/accounts');
  revalidatePath('/finance/transactions');
  return { success: true, rule };
}

/**
 * Toggles a recurring rule between active and paused.
 */
export async function toggleRecurringRuleAction(
  id: string,
  isActive: boolean
): Promise<{ success: boolean; rule: RecurringRuleDTO }> {
  const user = await requireUserApi();
  const service = getFinanceService();
  const rule = await service.updateRecurringRule(user.id, id, { isActive });
  if (isActive) {
    const today = todayInTz(DEFAULT_TZ);
    await generateDueRecurringTransactions({
      userId: user.id,
      asOfDate: today,
    });
  }
  revalidatePath('/finance');
  revalidatePath('/finance/accounts');
  revalidatePath('/finance/transactions');
  return { success: true, rule };
}

/**
 * Deletes a recurring rule.
 */
export async function deleteRecurringRuleAction(
  id: string
): Promise<{ success: boolean }> {
  const user = await requireUserApi();
  const service = getFinanceService();
  await service.deleteRecurringRule(user.id, id);
  return { success: true };
}
