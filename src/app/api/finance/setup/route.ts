import { NextRequest, NextResponse } from 'next/server';
import { requireUserApi } from '@src/lib/auth/dal';
import { handleApiError } from '@src/app/api/utils';
import { jsonNoStore } from '../utils';
import { checkFeatureGatedApi } from '@src/lib/finance/flags';
import {
  checkSetupRedirect,
  completeSetup,
  getUserSettings,
  saveDraft,
  skipSetup,
} from '@src/lib/finance/setup/service';
import {
  completeSetupPayloadSchema,
  setupDraftStateSchema,
} from '@src/lib/finance/setup/types';
import { z } from 'zod';

export async function GET() {
  try {
    const user = await requireUserApi();
    const gated = checkFeatureGatedApi('setup');
    if (gated) return gated;

    const settings = await getUserSettings(user.id);
    const redirectInfo = await checkSetupRedirect(user.id);

    return jsonNoStore({
      settings,
      draft: settings?.draft || null,
      redirectInfo,
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireUserApi();
    const gated = checkFeatureGatedApi('setup');
    if (gated) return gated;

    const json = await request.json();

    const bodySchema = z.object({
      step: z.number().int().min(1).max(6),
      draft: setupDraftStateSchema,
    });

    const parsed = bodySchema.parse(json);
    const updated = await saveDraft(user.id, parsed.step, parsed.draft);

    return NextResponse.json({ settings: updated });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUserApi();
    const gated = checkFeatureGatedApi('setup');
    if (gated) return gated;

    const json = await request.json();

    const actionSchema = z.discriminatedUnion('action', [
      z.object({
        action: z.literal('skip'),
      }),
      z.object({
        action: z.literal('complete'),
        payload: completeSetupPayloadSchema,
      }),
    ]);

    const parsed = actionSchema.parse(json);

    if (parsed.action === 'skip') {
      const settings = await skipSetup(user.id);
      return NextResponse.json({ success: true, settings });
    }

    if (parsed.action === 'complete') {
      const result = await completeSetup(user.id, parsed.payload);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    return handleApiError(err);
  }
}
