import 'server-only';
import type { FinanceService } from './service';
import { DbFinanceService } from './db-service';

declare const __non_webpack_require__: NodeRequire | undefined;

let _loggedOnce = false;

export function getFinanceService(): FinanceService {
  const backend = process.env.FINANCE_BACKEND ?? 'db';

  if (!_loggedOnce) {
    console.info(`[Finance] backend = ${backend}`);
    _loggedOnce = true;
  }

  if (backend === 'mock') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        '[Finance] FINANCE_BACKEND=mock is strictly prohibited in production. ' +
        'Unset FINANCE_BACKEND or set it to "db".'
      );
    }
    // Dynamic import so mock service is never bundled into production build
    const req = typeof __non_webpack_require__ !== 'undefined' ? __non_webpack_require__ : eval('require');
    if (typeof req !== 'undefined' && req.extensions && !req.extensions['.ts']) {
      try {
        req('tsx/cjs');
      } catch {}
    }
    const { MockFinanceService } = req('./mock-service') as { MockFinanceService: new () => FinanceService };
    return new MockFinanceService();
  }

  return new DbFinanceService();
}
