import { db, finCategories, resetConnection, users } from '@src/lib/db';
import { runMigrations } from '@src/lib/db/migrate';
import { DEFAULT_EXPENSE_CATEGORIES, DEFAULT_INCOME_CATEGORIES } from '../../constants';
import { DbFinanceService } from '../../db-service';

export const USER_A = 'usr_test_a';
export const USER_B = 'usr_test_b';

export async function setupFinanceTestDb(): Promise<DbFinanceService> {
  // Ensure isolated PGlite instance
  resetConnection();
  await runMigrations();

  // Seed test users
  await db
    .insert(users)
    .values([
      {
        id: USER_A,
        email: 'user_a@example.com',
        name: 'User A',
        passwordHash: 'dummy_hash_a',
        role: 'member',
        status: 'active',
      },
      {
        id: USER_B,
        email: 'user_b@example.com',
        name: 'User B',
        passwordHash: 'dummy_hash_b',
        role: 'member',
        status: 'active',
      },
    ])
    .onConflictDoNothing();

  // Seed default system categories
  const expenseValues = DEFAULT_EXPENSE_CATEGORIES.map((name) => ({
    name,
    type: 'expense' as const,
    isSystem: true,
    userId: null,
  }));

  const incomeValues = DEFAULT_INCOME_CATEGORIES.map((name) => ({
    name,
    type: 'income' as const,
    isSystem: true,
    userId: null,
  }));

  await db
    .insert(finCategories)
    .values([...expenseValues, ...incomeValues])
    .onConflictDoNothing();

  return new DbFinanceService();
}
