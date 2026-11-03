import { NextRequest } from 'next/server';
import { requireUserApi } from '@src/lib/auth/dal';
import { handleApiError } from '@src/app/api/utils';
import { jsonNoStore } from '../utils';
import { db, finUserSettings } from '@src/lib/db';
import { eq } from 'drizzle-orm';
import { updateFinanceUserSettingsSchema } from '@src/lib/finance/contract';

export async function GET() {
  try {
    const user = await requireUserApi();

    const [settings] = await db
      .select({
        userId: finUserSettings.userId,
        baseCurrency: finUserSettings.baseCurrency,
        timezone: finUserSettings.timezone,
        includeEpsInNetWorth: finUserSettings.includeEpsInNetWorth,
        includeAccruedInterestInNetWorth: finUserSettings.includeAccruedInterestInNetWorth,
      })
      .from(finUserSettings)
      .where(eq(finUserSettings.userId, user.id))
      .limit(1);

    if (!settings) {
      return jsonNoStore({
        userId: user.id,
        baseCurrency: 'INR',
        timezone: 'Asia/Kolkata',
        includeEpsInNetWorth: false,
        includeAccruedInterestInNetWorth: false,
      });
    }

    return jsonNoStore(settings);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireUserApi();
    const body = await request.json();
    const validated = updateFinanceUserSettingsSchema.parse(body);

    const [existing] = await db
      .select({ userId: finUserSettings.userId })
      .from(finUserSettings)
      .where(eq(finUserSettings.userId, user.id))
      .limit(1);

    if (existing) {
      const [updated] = await db
        .update(finUserSettings)
        .set({
          ...validated,
          updatedAt: new Date(),
        })
        .where(eq(finUserSettings.userId, user.id))
        .returning({
          userId: finUserSettings.userId,
          baseCurrency: finUserSettings.baseCurrency,
          timezone: finUserSettings.timezone,
          includeEpsInNetWorth: finUserSettings.includeEpsInNetWorth,
          includeAccruedInterestInNetWorth: finUserSettings.includeAccruedInterestInNetWorth,
        });

      return jsonNoStore(updated);
    } else {
      const [inserted] = await db
        .insert(finUserSettings)
        .values({
          userId: user.id,
          baseCurrency: 'INR',
          timezone: validated.timezone || 'Asia/Kolkata',
          includeEpsInNetWorth: validated.includeEpsInNetWorth ?? false,
          includeAccruedInterestInNetWorth: validated.includeAccruedInterestInNetWorth ?? false,
        })
        .returning({
          userId: finUserSettings.userId,
          baseCurrency: finUserSettings.baseCurrency,
          timezone: finUserSettings.timezone,
          includeEpsInNetWorth: finUserSettings.includeEpsInNetWorth,
          includeAccruedInterestInNetWorth: finUserSettings.includeAccruedInterestInNetWorth,
        });

      return jsonNoStore(inserted);
    }
  } catch (err) {
    return handleApiError(err);
  }
}

