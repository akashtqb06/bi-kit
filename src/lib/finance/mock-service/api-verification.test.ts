import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import './index'; // Load mock-service which wires into BaseMockFinanceService prototype

// Mock auth DAL to authenticate user
vi.mock('@src/lib/auth/dal', () => ({
  requireUserApi: vi.fn(async () => ({
    id: 'usr_test_verification',
    email: 'member@example.com',
    role: 'member',
  })),
}));

describe('Finance API Routes with FINANCE_BACKEND=mock', () => {
  const originalBackend = process.env.FINANCE_BACKEND;

  beforeEach(() => {
    process.env.FINANCE_BACKEND = 'mock';
  });

  afterEach(() => {
    process.env.FINANCE_BACKEND = originalBackend;
  });

  it('GET /api/finance/accounts returns mock accounts data', async () => {
    const { GET } = await import('@src/app/api/finance/accounts/route');
    const req = new NextRequest('http://localhost:3000/api/finance/accounts');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.accounts).toBeDefined();
    expect(Array.isArray(body.accounts)).toBe(true);
    expect(body.accounts.length).toBeGreaterThan(0);

    const salaryAcc = body.accounts.find((a: { name: string }) => a.name === 'Salary Account');
    expect(salaryAcc).toBeDefined();
  });

  it('GET /api/finance/stats/overview returns mock overview stats', async () => {
    const { GET } = await import('@src/app/api/finance/stats/overview/route');
    const req = new NextRequest('http://localhost:3000/api/finance/stats/overview');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.netWorth).toBeDefined();
    expect(typeof body.netWorth).toBe('number');
    expect(body.totalAssets).toBeDefined();
    expect(typeof body.totalAssets).toBe('number');
    expect(body.totalLiabilities).toBeDefined();
    expect(typeof body.totalLiabilities).toBe('number');
    expect(body.monthlyIncome).toBeDefined();
    expect(body.monthlyExpense).toBeDefined();
    expect(body.savingsRate).toBeDefined();
  });
});
