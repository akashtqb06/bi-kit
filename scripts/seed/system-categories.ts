import { eq, and } from 'drizzle-orm';
import { db } from '@src/lib/db';
import { finCategories } from '@src/lib/db/schema/finance';
import { newId } from '@src/lib/db/id';
import {
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_INCOME_CATEGORIES,
} from '@src/lib/finance/constants';
import { getDeterministicCategoryColor } from '@src/lib/finance/colors';

/**
 * Idempotently seeds default system categories into fin_categories.
 * System categories have userId = null and isSystem = true.
 */
export async function seedSystemCategories(): Promise<{ seeded: number; existing: number }> {
  let seeded = 0;
  let existing = 0;
  const now = new Date();

  // 1. Expense categories
  for (const name of DEFAULT_EXPENSE_CATEGORIES) {
    const found = await db
      .select({ id: finCategories.id })
      .from(finCategories)
      .where(and(eq(finCategories.name, name), eq(finCategories.isSystem, true)))
      .limit(1);

    if (found.length === 0) {
      await db.insert(finCategories).values({
        id: newId(),
        userId: null,
        name,
        type: 'expense',
        color: getDeterministicCategoryColor(name),
        isSystem: true,
        createdAt: now,
        updatedAt: now,
      });
      seeded++;
    } else {
      existing++;
    }
  }

  // 2. Income categories
  for (const name of DEFAULT_INCOME_CATEGORIES) {
    const found = await db
      .select({ id: finCategories.id })
      .from(finCategories)
      .where(and(eq(finCategories.name, name), eq(finCategories.isSystem, true)))
      .limit(1);

    if (found.length === 0) {
      await db.insert(finCategories).values({
        id: newId(),
        userId: null,
        name,
        type: 'income',
        color: getDeterministicCategoryColor(name),
        isSystem: true,
        createdAt: now,
        updatedAt: now,
      });
      seeded++;
    } else {
      existing++;
    }
  }

  console.log(`✅ System categories check: ${seeded} inserted, ${existing} already present.`);
  return { seeded, existing };
}

// Allow direct CLI invocation: tsx scripts/seed/system-categories.ts
if (process.argv[1]?.endsWith('system-categories.ts')) {
  seedSystemCategories()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Failed to seed system categories:', err);
      process.exit(1);
    });
}

