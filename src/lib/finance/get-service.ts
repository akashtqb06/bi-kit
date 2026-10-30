import 'server-only';
import type { FinanceService } from './service';
import { DbFinanceService } from './db-service';

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
    if (typeof require !== 'undefined' && require.extensions && !require.extensions['.ts']) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('tsx/cjs');
      } catch {}
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { MockFinanceService } = require('./mock-service') as { MockFinanceService: new () => FinanceService };
    return new MockFinanceService();
  }

  return new DbFinanceService();
}
