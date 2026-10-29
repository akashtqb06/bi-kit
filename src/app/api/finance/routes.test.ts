import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock auth DAL to simulate both unauthenticated and authenticated users
vi.mock('@src/lib/auth/dal', () => {
  let mockUser: { id: string; role: string } | null = null;
  return {
    setTestUser: (user: { id: string; role: string } | null) => {
      mockUser = user;
    },
    requireUserApi: vi.fn(async () => {
      if (!mockUser) {
        const { UnauthorizedError } = await import('@src/lib/auth/policy');
        throw new UnauthorizedError('Unauthorized');
      }
      return mockUser;
    }),
  };
});

// Mock the finance service factory to return stubs (NotImplementedError throwers)
// so this test can verify HTTP routing / auth semantics without a real DB.
vi.mock('@src/lib/finance/service', async (importOriginal) => {
  const original = await importOriginal<typeof import('@src/lib/finance/service')>();
  return {
    ...original,
    getFinanceService: () => new original.DbFinanceService(),
  };
});


describe('Finance API Routes (Authentication & 501 Stubs Enforced)', () => {
  beforeEach(async () => {
    const { setTestUser } = (await import('@src/lib/auth/dal')) as unknown as {
      setTestUser: (u: { id: string; role: string } | null) => void;
    };
    setTestUser(null); // default unauthenticated
  });

  const testUser = { id: 'usr_test_1', role: 'member' };

  describe('Accounts API (/api/finance/accounts)', () => {
    it('returns 401 when unauthenticated', async () => {
      const { GET, POST } = await import('./accounts/route');
      const getReq = new NextRequest('http://localhost:3000/api/finance/accounts');
      const getRes = await GET(getReq);
      expect(getRes.status).toBe(401);

      const postReq = new NextRequest('http://localhost:3000/api/finance/accounts', {
        method: 'POST',
        body: JSON.stringify({ name: 'HDFC', kind: 'bank' }),
      });
      const postRes = await POST(postReq);
      expect(postRes.status).toBe(401);
    });

    it('returns 501 Not Implemented when authenticated', async () => {
      const { setTestUser } = (await import('@src/lib/auth/dal')) as unknown as {
        setTestUser: (u: { id: string; role: string } | null) => void;
      };
      setTestUser(testUser);

      const { GET, POST } = await import('./accounts/route');
      const getReq = new NextRequest('http://localhost:3000/api/finance/accounts');
      const getRes = await GET(getReq);
      expect(getRes.status).toBe(501);
      const getJson = await getRes.json();
      expect(getJson.error).toBe('not_implemented');

      const postReq = new NextRequest('http://localhost:3000/api/finance/accounts', {
        method: 'POST',
        body: JSON.stringify({ name: 'HDFC Bank', kind: 'bank' }),
      });
      const postRes = await POST(postReq);
      expect(postRes.status).toBe(501);
    });
  });

  describe('Transactions API (/api/finance/transactions)', () => {
    it('returns 401 when unauthenticated', async () => {
      const { GET, POST } = await import('./transactions/route');
      const getReq = new NextRequest('http://localhost:3000/api/finance/transactions');
      const getRes = await GET(getReq);
      expect(getRes.status).toBe(401);

      const postReq = new NextRequest('http://localhost:3000/api/finance/transactions', {
        method: 'POST',
        body: JSON.stringify({
          accountId: 'acc_1',
          date: '2026-10-28',
          type: 'expense',
          amount: 5000,
        }),
      });
      const postRes = await POST(postReq);
      expect(postRes.status).toBe(401);
    });

    it('returns 501 Not Implemented when authenticated with valid payload', async () => {
      const { setTestUser } = (await import('@src/lib/auth/dal')) as unknown as {
        setTestUser: (u: { id: string; role: string } | null) => void;
      };
      setTestUser(testUser);

      const { GET, POST } = await import('./transactions/route');
      const getReq = new NextRequest('http://localhost:3000/api/finance/transactions');
      const getRes = await GET(getReq);
      expect(getRes.status).toBe(501);

      const postReq = new NextRequest('http://localhost:3000/api/finance/transactions', {
        method: 'POST',
        body: JSON.stringify({
          accountId: 'acc_1',
          date: '2026-10-28',
          type: 'expense',
          amount: 5000,
        }),
      });
      const postRes = await POST(postReq);
      expect(postRes.status).toBe(501);
    });
  });

  describe('Overview Stats API (/api/finance/stats/overview)', () => {
    it('returns 401 unauthenticated and 501 authenticated', async () => {
      const { GET } = await import('./stats/overview/route');
      const unauthRes = await GET();
      expect(unauthRes.status).toBe(401);

      const { setTestUser } = (await import('@src/lib/auth/dal')) as unknown as {
        setTestUser: (u: { id: string; role: string } | null) => void;
      };
      setTestUser(testUser);

      const authRes = await GET();
      expect(authRes.status).toBe(501);
    });
  });

  describe('Categories, Budgets, Recurring, Valuations', () => {
    it('returns 501 when authenticated', async () => {
      const { setTestUser } = (await import('@src/lib/auth/dal')) as unknown as {
        setTestUser: (u: { id: string; role: string } | null) => void;
      };
      setTestUser(testUser);

      const categories = await import('./categories/route');
      const catRes = await categories.GET(
        new NextRequest('http://localhost:3000/api/finance/categories')
      );
      expect(catRes.status).toBe(501);

      const budgets = await import('./budgets/route');
      const budRes = await budgets.GET(
        new NextRequest('http://localhost:3000/api/finance/budgets')
      );
      expect(budRes.status).toBe(501);

      const recurring = await import('./recurring/route');
      const recRes = await recurring.GET();
      expect(recRes.status).toBe(501);

      const valuations = await import('./valuations/route');
      const valRes = await valuations.GET(
        new NextRequest('http://localhost:3000/api/finance/valuations?accountId=acc_1')
      );
      expect(valRes.status).toBe(501);
    });
  });
});

