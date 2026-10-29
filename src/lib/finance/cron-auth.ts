import { UnauthorizedError } from '@src/lib/auth/policy';

export function assertCronAuthorized(request: Request): void {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    throw new UnauthorizedError('CRON_SECRET is not configured on server');
  }

  const authHeader = request.headers.get('authorization');
  const bearerToken = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : undefined;
  const headerSecret = request.headers.get('x-cron-secret');

  if (bearerToken === secret || headerSecret === secret) {
    return;
  }

  throw new UnauthorizedError('Invalid or missing cron authentication');
}

