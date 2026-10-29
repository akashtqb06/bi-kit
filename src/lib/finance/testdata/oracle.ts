import type { GeneratedFinanceData } from './generator';

export interface MonthEndNetWorthPoint {
  date: string; // YYYY-MM-DD
  assets: number;
  liabilities: number;
  netWorth: number;
}

export interface MonthlyCategoryStats {
  month: string; // YYYY-MM
  income: number;
  expense: number;
  savingsRate: number;
  categories: Record<string, number>;
}

export interface CardUtilizationExpectation {
  limit: number;
  outstanding: number;
  utilization: number;
}

export interface DepositSimulationComparison {
  principalOrInstallment: number;
  rate: number;
  tenure: string;
  closedFormMaturityPaise: number;
  dayByDaySimulatedMaturityPaise: number;
  differencePaise: number;
  withinTolerance: boolean;
}

export interface OracleExpectations {
  persona: string;
  anchorDate: string;
  accountBalances: Record<string, number>;
  monthEndNetWorth: MonthEndNetWorthPoint[];
  monthlyStats: MonthlyCategoryStats[];
  cardUtilization: Record<string, CardUtilizationExpectation>;
  fdSimulation: DepositSimulationComparison;
  rdSimulation: DepositSimulationComparison;
}

/**
 * Closed-form FD formula per CONTRACT.md:
 * A = P * (1 + r/4)^(4 * t)
 */
export function calculateFdClosedForm(principalPaise: number, annualRate: number, tenureYears: number): number {
  const compoundingFreq = 4; // Quarterly
  const totalPeriods = compoundingFreq * tenureYears;
  const ratePerPeriod = annualRate / compoundingFreq;
  const maturity = principalPaise * Math.pow(1 + ratePerPeriod, totalPeriods);
  return Math.round(maturity);
}

/**
 * Day-by-day continuous simulation of FD:
 * Simulates daily interest accumulation and quarterly compounding over exact days.
 * 365 days / 4 quarters: compounding on day 91, 182, 273, 365.
 */
export function simulateFdDayByDay(principalPaise: number, annualRate: number, tenureYears: number): number {
  let principal = principalPaise;
  let accruedInterest = 0;
  const totalDays = Math.round(tenureYears * 365);
  const quarters = Math.round(tenureYears * 4);
  const quarterLength = 365 / 4;

  const quarterDays = new Set<number>();
  for (let q = 1; q <= quarters; q++) {
    quarterDays.add(Math.round(q * quarterLength));
  }

  for (let day = 1; day <= totalDays; day++) {
    const dailyInterest = (principal * annualRate) / 365;
    accruedInterest += dailyInterest;

    if (quarterDays.has(day) || day === totalDays) {
      principal += Math.round(accruedInterest);
      accruedInterest = 0;
    }
  }

  return Math.round(principal);
}

/**
 * Closed-form RD formula per CONTRACT.md:
 * A = sum_{k=1}^M P * (1 + r/4)^(k / 3)
 */
export function calculateRdClosedForm(monthlyInstallmentPaise: number, annualRate: number, months: number): number {
  let totalMaturity = 0;
  for (let k = 1; k <= months; k++) {
    const compounded = monthlyInstallmentPaise * Math.pow(1 + annualRate / 4, k / 3);
    totalMaturity += compounded;
  }
  return Math.round(totalMaturity);
}

/**
 * Day-by-day continuous ledger simulation of RD:
 * 12 monthly deposits on the 1st of each month (exact calendar schedule),
 * accruing daily interest on running balance, compounding quarterly.
 */
export function simulateRdDayByDay(monthlyInstallmentPaise: number, annualRate: number, months: number): number {
  let balance = 0;
  let accruedInterest = 0;
  const totalDays = Math.round((months / 12) * 365);
  const daysPerMonth = 365 / 12;

  const depositDays = new Set<number>();
  for (let m = 0; m < months; m++) {
    depositDays.add(Math.round(m * daysPerMonth) + 1);
  }

  const quarterLength = 365 / 4;
  const totalQuarters = Math.round((months / 12) * 4);
  const quarterDays = new Set<number>();
  for (let q = 1; q <= totalQuarters; q++) {
    quarterDays.add(Math.round(q * quarterLength));
  }

  for (let day = 1; day <= totalDays; day++) {
    if (depositDays.has(day)) {
      balance += monthlyInstallmentPaise;
    }

    const dailyInterest = (balance * annualRate) / 365;
    accruedInterest += dailyInterest;

    if (quarterDays.has(day) || day === totalDays) {
      balance += Math.round(accruedInterest);
      accruedInterest = 0;
    }
  }

  return Math.round(balance);
}

/**
 * Computes all independent oracle expectations from the generated dataset.
 */
export function computeOracleExpectations(data: GeneratedFinanceData): OracleExpectations {
  const { anchorDate, accounts, categories, transactions, valuations } = data;

  const catMap = new Map<string, string>();
  for (const c of categories) {
    catMap.set(c.id, c.name);
  }

  const activeTxns = transactions.filter((t) => !t.deletedAt && t.date <= anchorDate);

  // 1. Account Balances at Anchor Date
  const balances: Record<string, number> = {};
  for (const acc of accounts) {
    balances[acc.id] = 0;
  }

  for (const t of activeTxns) {
    if (t.type === 'expense') {
      balances[t.accountId] = (balances[t.accountId] || 0) - t.amount;
    } else if (t.type === 'income') {
      balances[t.accountId] = (balances[t.accountId] || 0) + t.amount;
    } else if (t.type === 'transfer') {
      balances[t.accountId] = (balances[t.accountId] || 0) - t.amount;
      if (t.toAccountId) {
        balances[t.toAccountId] = (balances[t.toAccountId] || 0) + t.amount;
      }
    } else if (t.type === 'adjustment') {
      balances[t.accountId] = (balances[t.accountId] || 0) + t.signedAmount;
    }
  }

  // 2. Card Utilization
  const cardUtilization: Record<string, CardUtilizationExpectation> = {};
  for (const acc of accounts) {
    if (acc.kind === 'credit_card') {
      const bal = balances[acc.id] || 0;
      const outstanding = Math.max(0, -bal);
      const limit = acc.creditLimit || 0;
      const utilization = limit > 0 ? Math.min(1.0, outstanding / limit) : 0;
      cardUtilization[acc.name] = {
        limit,
        outstanding,
        utilization: Math.round(utilization * 10000) / 10000,
      };
    }
  }

  // 3. Monthly Statistics & Category Totals
  const monthlyStatsMap = new Map<
    string,
    { income: number; expense: number; categories: Record<string, number> }
  >();

  for (const t of activeTxns) {
    const monthKey = t.date.slice(0, 7); // YYYY-MM
    let entry = monthlyStatsMap.get(monthKey);
    if (!entry) {
      entry = { income: 0, expense: 0, categories: {} };
      monthlyStatsMap.set(monthKey, entry);
    }

    if (t.type === 'income') {
      entry.income += t.amount;
    } else if (t.type === 'expense') {
      entry.expense += t.amount;
      const catName = t.categoryId ? catMap.get(t.categoryId) || 'Uncategorized' : 'Uncategorized';
      entry.categories[catName] = (entry.categories[catName] || 0) + t.amount;
    }
  }

  const sortedMonths = Array.from(monthlyStatsMap.keys()).sort();
  const monthlyStats: MonthlyCategoryStats[] = sortedMonths.map((m) => {
    const st = monthlyStatsMap.get(m)!;
    const savingsRate = st.income > 0 ? Math.max(0, (st.income - st.expense) / st.income) : 0;
    return {
      month: m,
      income: st.income,
      expense: st.expense,
      savingsRate: Math.round(savingsRate * 10000) / 10000,
      categories: st.categories,
    };
  });

  // 4. Month-End Net Worth Series
  const monthEndNetWorth: MonthEndNetWorthPoint[] = sortedMonths.map((monthStr) => {
    const [yStr, mStr] = monthStr.split('-');
    const year = parseInt(yStr, 10);
    const month = parseInt(mStr, 10);
    const lastDayNum = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const monthEndDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDayNum).padStart(2, '0')}`;

    const monthEndBalances: Record<string, number> = {};
    for (const acc of accounts) {
      monthEndBalances[acc.id] = 0;
    }

    for (const t of activeTxns) {
      if (t.date <= monthEndDate) {
        if (t.type === 'expense') {
          monthEndBalances[t.accountId] -= t.amount;
        } else if (t.type === 'income') {
          monthEndBalances[t.accountId] += t.amount;
        } else if (t.type === 'transfer') {
          monthEndBalances[t.accountId] -= t.amount;
          if (t.toAccountId) {
            monthEndBalances[t.toAccountId] += t.amount;
          }
        } else if (t.type === 'adjustment') {
          monthEndBalances[t.accountId] += t.signedAmount;
        }
      }
    }

    let totalAssets = 0;
    let totalLiabilities = 0;

    for (const acc of accounts) {
      if (!acc.isActive && monthEndDate >= '2026-01-01') {
        continue;
      }

      if (acc.class === 'asset') {
        if (acc.kind === 'mutual_fund' || acc.kind === 'stocks') {
          const matchingValuations = valuations
            .filter((v) => v.accountId === acc.id && v.date <= monthEndDate)
            .sort((a, b) => b.date.localeCompare(a.date));
          if (matchingValuations.length > 0) {
            totalAssets += matchingValuations[0].value;
          } else {
            totalAssets += Math.max(0, monthEndBalances[acc.id] || 0);
          }
        } else {
          totalAssets += Math.max(0, monthEndBalances[acc.id] || 0);
        }
      } else if (acc.class === 'liability') {
        if (acc.kind === 'credit_card') {
          totalLiabilities += Math.max(0, -(monthEndBalances[acc.id] || 0));
        } else if (acc.kind === 'loan') {
          totalLiabilities += Math.max(0, monthEndBalances[acc.id] || 0);
        }
      }
    }

    return {
      date: monthEndDate,
      assets: totalAssets,
      liabilities: totalLiabilities,
      netWorth: totalAssets - totalLiabilities,
    };
  });

  // 5. Deposit Simulations
  const fdPrincipal = 10000000; // 100,000 INR
  const fdRate = 0.075;
  const fdYears = 1;
  const fdClosed = calculateFdClosedForm(fdPrincipal, fdRate, fdYears);
  const fdSim = simulateFdDayByDay(fdPrincipal, fdRate, fdYears);
  const fdDiff = Math.abs(fdClosed - fdSim);

  const rdInstallment = 500000; // 5,000 INR
  const rdRate = 0.07;
  const rdMonths = 12;
  const rdClosed = calculateRdClosedForm(rdInstallment, rdRate, rdMonths);
  const rdSim = simulateRdDayByDay(rdInstallment, rdRate, rdMonths);
  const rdDiff = Math.abs(rdClosed - rdSim);

  return {
    persona: data.persona,
    anchorDate,
    accountBalances: balances,
    monthEndNetWorth,
    monthlyStats,
    cardUtilization,
    fdSimulation: {
      principalOrInstallment: fdPrincipal,
      rate: fdRate,
      tenure: '1 Year (Quarterly Compounding)',
      closedFormMaturityPaise: fdClosed,
      dayByDaySimulatedMaturityPaise: fdSim,
      differencePaise: fdDiff,
      withinTolerance: fdDiff <= 100,
    },
    rdSimulation: {
      principalOrInstallment: rdInstallment,
      rate: rdRate,
      tenure: '12 Months (Quarterly Compounding)',
      closedFormMaturityPaise: rdClosed,
      dayByDaySimulatedMaturityPaise: rdSim,
      differencePaise: rdDiff,
      withinTolerance: rdDiff <= 100,
    },
  };
}
