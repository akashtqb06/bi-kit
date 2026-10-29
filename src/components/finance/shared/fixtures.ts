import type {
  AccountDTO,
  CategoryDTO,
  TransactionDTO,
  ValuationDTO,
  NetWorthPointDTO,
  OverviewStatsDTO,
} from '@src/lib/finance/contract';

export interface AccountWithBalance extends AccountDTO {
  balance: number; // in paise
  outstanding: number; // in paise (for liabilities)
  utilization: number; // 0 - 1
  currentValue: number; // in paise (for investments)
  costBasis?: number; // in paise (for investments)
  gain?: number; // in paise (for investments)
  gainPct?: number; // percentage
  accruedValue?: number; // in paise (for FD/RD)
  interestEarned?: number; // in paise (for FD/RD)
  projectedMaturityAmount?: number; // in paise (for FD/RD)
  daysToMaturity?: number; // for FD/RD
  statementDay?: number; // for cards (1-31)
  dueDay?: number; // for cards (1-31)
  nextDueDate?: string; // YYYY-MM-DD
}

export const FIXTURE_CATEGORIES: CategoryDTO[] = [
  // Expense
  { id: 'cat-food', userId: null, name: 'Food & Dining', type: 'expense', parentId: null, icon: 'Utensils', color: '#f97316', isSystem: true, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
  { id: 'cat-groceries', userId: null, name: 'Groceries', type: 'expense', parentId: null, icon: 'ShoppingCart', color: '#10b981', isSystem: true, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
  { id: 'cat-transport', userId: null, name: 'Transport', type: 'expense', parentId: null, icon: 'Car', color: '#3b82f6', isSystem: true, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
  { id: 'cat-fuel', userId: null, name: 'Fuel', type: 'expense', parentId: null, icon: 'Fuel', color: '#ef4444', isSystem: true, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
  { id: 'cat-rent', userId: null, name: 'Rent', type: 'expense', parentId: null, icon: 'Home', color: '#8b5cf6', isSystem: true, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
  { id: 'cat-utilities', userId: null, name: 'Utilities', type: 'expense', parentId: null, icon: 'Zap', color: '#eab308', isSystem: true, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
  { id: 'cat-shopping', userId: null, name: 'Shopping', type: 'expense', parentId: null, icon: 'ShoppingBag', color: '#ec4899', isSystem: true, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
  { id: 'cat-health', userId: null, name: 'Health', type: 'expense', parentId: null, icon: 'HeartPulse', color: '#14b8a6', isSystem: true, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
  { id: 'cat-entertainment', userId: null, name: 'Entertainment', type: 'expense', parentId: null, icon: 'Film', color: '#6366f1', isSystem: true, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
  { id: 'cat-travel', userId: null, name: 'Travel', type: 'expense', parentId: null, icon: 'Plane', color: '#06b6d4', isSystem: true, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
  { id: 'cat-emi', userId: null, name: 'EMI & Loans', type: 'expense', parentId: null, icon: 'CreditCard', color: '#64748b', isSystem: true, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
  { id: 'cat-subscriptions', userId: null, name: 'Subscriptions', type: 'expense', parentId: null, icon: 'Repeat', color: '#a855f7', isSystem: true, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
  { id: 'cat-other-exp', userId: null, name: 'Others', type: 'expense', parentId: null, icon: 'MoreHorizontal', color: '#94a3b8', isSystem: true, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
  // Income
  { id: 'cat-salary', userId: null, name: 'Salary', type: 'income', parentId: null, icon: 'Briefcase', color: '#22c55e', isSystem: true, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
  { id: 'cat-interest', userId: null, name: 'Interest', type: 'income', parentId: null, icon: 'Percent', color: '#0ea5e9', isSystem: true, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
  { id: 'cat-dividends', userId: null, name: 'Dividends', type: 'income', parentId: null, icon: 'TrendingUp', color: '#84cc16', isSystem: true, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
  { id: 'cat-refunds', userId: null, name: 'Refunds', type: 'income', parentId: null, icon: 'RotateCcw', color: '#38bdf8', isSystem: true, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
  { id: 'cat-other-inc', userId: null, name: 'Other income', type: 'income', parentId: null, icon: 'DollarSign', color: '#10b981', isSystem: true, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
];

export const FIXTURE_ACCOUNTS: AccountWithBalance[] = [
  {
    id: 'acc-hdfc-salary',
    userId: 'usr-1',
    name: 'HDFC Salary Account',
    kind: 'bank',
    class: 'asset',
    currency: 'INR',
    creditLimit: null,
    isActive: true,
    metadata: { accountNumber: '••••5892', branch: 'Indiranagar' },
    balance: 18542000, // ₹1,85,420.00
    outstanding: 0,
    utilization: 0,
    currentValue: 18542000,
    createdAt: '2025-01-01',
    updatedAt: '2026-10-28',
  },
  {
    id: 'acc-cash',
    userId: 'usr-1',
    name: 'Cash Wallet',
    kind: 'cash',
    class: 'asset',
    currency: 'INR',
    creditLimit: null,
    isActive: true,
    metadata: {},
    balance: 450000, // ₹4,500.00
    outstanding: 0,
    utilization: 0,
    currentValue: 450000,
    createdAt: '2025-01-01',
    updatedAt: '2026-10-28',
  },
  {
    id: 'acc-icici-card',
    userId: 'usr-1',
    name: 'ICICI Sapphiro Card',
    kind: 'credit_card',
    class: 'liability',
    currency: 'INR',
    creditLimit: 30000000, // ₹3,00,000 limit
    isActive: true,
    metadata: { statementDay: 15, dueDay: 5, cardLast4: '4129' },
    balance: -4250000, // ₹42,500 owed
    outstanding: 4250000,
    utilization: 0.1417, // ~14.2%
    currentValue: -4250000,
    statementDay: 15,
    dueDay: 5,
    nextDueDate: '2026-11-05',
    createdAt: '2025-02-15',
    updatedAt: '2026-10-28',
  },
  {
    id: 'acc-hdfc-card',
    userId: 'usr-1',
    name: 'HDFC Millennia Card',
    kind: 'credit_card',
    class: 'liability',
    currency: 'INR',
    creditLimit: 15000000, // ₹1,50,000 limit
    isActive: true,
    metadata: { statementDay: 20, dueDay: 10, cardLast4: '8831' },
    balance: -1820000, // ₹18,200 owed
    outstanding: 1820000,
    utilization: 0.1213, // ~12.1%
    currentValue: -1820000,
    statementDay: 20,
    dueDay: 10,
    nextDueDate: '2026-11-10',
    createdAt: '2025-03-10',
    updatedAt: '2026-10-28',
  },
  {
    id: 'acc-sbi-fd',
    userId: 'usr-1',
    name: 'SBI Tax Saver FD',
    kind: 'fixed_deposit',
    class: 'asset',
    currency: 'INR',
    creditLimit: null,
    isActive: true,
    metadata: {
      principal: 20000000, // ₹2,00,000
      rate: 7.1,
      compounding: 'quarterly',
      startDate: '2026-01-15',
      maturityDate: '2027-01-15',
    },
    balance: 20000000,
    outstanding: 0,
    utilization: 0,
    currentValue: 21124000, // Accrued ~₹2,11,240
    accruedValue: 21124000,
    interestEarned: 1124000,
    projectedMaturityAmount: 21458000, // ₹2,14,580
    daysToMaturity: 79,
    createdAt: '2026-01-15',
    updatedAt: '2026-10-28',
  },
  {
    id: 'acc-hdfc-rd',
    userId: 'usr-1',
    name: 'HDFC Monthly RD',
    kind: 'recurring_deposit',
    class: 'asset',
    currency: 'INR',
    creditLimit: null,
    isActive: true,
    metadata: {
      installment: 1000000, // ₹10,000 per month
      rate: 7.0,
      startDate: '2026-03-01',
      tenureMonths: 12,
    },
    balance: 8000000, // 8 installments paid = ₹80,000
    outstanding: 0,
    utilization: 0,
    currentValue: 8225000,
    accruedValue: 8225000,
    interestEarned: 225000,
    projectedMaturityAmount: 12465000, // ₹1,24,650
    daysToMaturity: 123,
    createdAt: '2026-03-01',
    updatedAt: '2026-10-28',
  },
  {
    id: 'acc-zerodha-mf',
    userId: 'usr-1',
    name: 'Zerodha Mutual Funds',
    kind: 'mutual_fund',
    class: 'asset',
    currency: 'INR',
    creditLimit: null,
    isActive: true,
    metadata: { broker: 'Zerodha Coin' },
    balance: 40000000, // cost basis
    outstanding: 0,
    utilization: 0,
    currentValue: 47850000, // Current value: ₹4,78,500
    costBasis: 40000000,
    gain: 7850000, // ₹78,500 gain
    gainPct: 19.6,
    createdAt: '2025-01-10',
    updatedAt: '2026-10-28',
  },
  {
    id: 'acc-groww-stocks',
    userId: 'usr-1',
    name: 'Groww Demat Account',
    kind: 'stocks',
    class: 'asset',
    currency: 'INR',
    creditLimit: null,
    isActive: true,
    metadata: { broker: 'Groww' },
    balance: 25000000,
    outstanding: 0,
    utilization: 0,
    currentValue: 28540000, // Current value: ₹2,85,400
    costBasis: 25000000,
    gain: 3540000,
    gainPct: 14.2,
    createdAt: '2025-04-12',
    updatedAt: '2026-10-28',
  },
  {
    id: 'acc-car-loan',
    userId: 'usr-1',
    name: 'SBI Car Loan',
    kind: 'loan',
    class: 'liability',
    currency: 'INR',
    creditLimit: null,
    isActive: true,
    metadata: { principal: 60000000, interestRate: 8.85, emiAmount: 1240000 },
    balance: 34200000, // ₹3,42,000 remaining principal
    outstanding: 34200000,
    utilization: 0.57,
    currentValue: -34200000,
    createdAt: '2024-05-10',
    updatedAt: '2026-10-28',
  },
];

export const FIXTURE_TRANSACTIONS: TransactionDTO[] = [
  {
    id: 'tx-1',
    userId: 'usr-1',
    accountId: 'acc-hdfc-salary',
    categoryId: 'cat-groceries',
    date: '2026-10-28',
    type: 'expense',
    amount: 345000, // ₹3,450.00
    signedAmount: -345000,
    payee: 'Nature Basket',
    note: 'Weekly organic produce & supplies',
    tags: 'groceries,essentials',
    isRecurring: false,
    createdAt: '2026-10-28T10:15:00Z',
    updatedAt: '2026-10-28T10:15:00Z',
  },
  {
    id: 'tx-2',
    userId: 'usr-1',
    accountId: 'acc-icici-card',
    categoryId: 'cat-food',
    date: '2026-10-28',
    type: 'expense',
    amount: 128000, // ₹1,280.00
    signedAmount: -128000,
    payee: 'Toit Brewpub',
    note: 'Dinner with team',
    tags: 'dining,social',
    isRecurring: false,
    createdAt: '2026-10-28T14:30:00Z',
    updatedAt: '2026-10-28T14:30:00Z',
  },
  {
    id: 'tx-3',
    userId: 'usr-1',
    accountId: 'acc-cash',
    categoryId: 'cat-transport',
    date: '2026-10-27',
    type: 'expense',
    amount: 25000, // ₹250.00
    signedAmount: -25000,
    payee: 'Metro Auto Rickshaw',
    note: 'Ride to office',
    tags: 'commute',
    isRecurring: false,
    createdAt: '2026-10-27T09:10:00Z',
    updatedAt: '2026-10-27T09:10:00Z',
  },
  {
    id: 'tx-4',
    userId: 'usr-1',
    accountId: 'acc-hdfc-salary',
    categoryId: 'cat-fuel',
    date: '2026-10-27',
    type: 'expense',
    amount: 280000, // ₹2,800.00
    signedAmount: -280000,
    payee: 'Shell Petrol Pump',
    note: 'Full tank petrol',
    tags: 'car,fuel',
    isRecurring: false,
    createdAt: '2026-10-27T18:45:00Z',
    updatedAt: '2026-10-27T18:45:00Z',
  },
  {
    id: 'tx-5',
    userId: 'usr-1',
    accountId: 'acc-hdfc-salary',
    toAccountId: 'acc-icici-card',
    categoryId: null,
    date: '2026-10-26',
    type: 'transfer',
    amount: 2500000, // ₹25,000.00
    signedAmount: -2500000,
    payee: 'ICICI Credit Card Payment',
    note: 'Card bill partial payment',
    tags: 'bill-payment',
    isRecurring: false,
    createdAt: '2026-10-26T11:00:00Z',
    updatedAt: '2026-10-26T11:00:00Z',
  },
  {
    id: 'tx-6',
    userId: 'usr-1',
    accountId: 'acc-hdfc-card',
    categoryId: 'cat-shopping',
    date: '2026-10-25',
    type: 'expense',
    amount: 549900, // ₹5,499.00
    signedAmount: -549900,
    payee: 'Amazon India',
    note: 'Noise-canceling earphones',
    tags: 'electronics,shopping',
    isRecurring: false,
    createdAt: '2026-10-25T16:20:00Z',
    updatedAt: '2026-10-25T16:20:00Z',
  },
  {
    id: 'tx-7',
    userId: 'usr-1',
    accountId: 'acc-hdfc-salary',
    categoryId: 'cat-utilities',
    date: '2026-10-24',
    type: 'expense',
    amount: 320000, // ₹3,200.00
    signedAmount: -320000,
    payee: 'BESCOM Bangalore',
    note: 'Electricity bill October',
    tags: 'utilities',
    isRecurring: true,
    createdAt: '2026-10-24T12:00:00Z',
    updatedAt: '2026-10-24T12:00:00Z',
  },
  {
    id: 'tx-8',
    userId: 'usr-1',
    accountId: 'acc-hdfc-salary',
    categoryId: 'cat-salary',
    date: '2026-10-01',
    type: 'income',
    amount: 21500000, // ₹2,15,000.00
    signedAmount: 21500000,
    payee: 'Tech Systems Pvt Ltd',
    note: 'Monthly salary credit',
    tags: 'salary,income',
    isRecurring: true,
    createdAt: '2026-10-01T08:00:00Z',
    updatedAt: '2026-10-01T08:00:00Z',
  },
  {
    id: 'tx-9',
    userId: 'usr-1',
    accountId: 'acc-zerodha-mf',
    categoryId: 'cat-dividends',
    date: '2026-10-15',
    type: 'income',
    amount: 450000, // ₹4,500.00
    signedAmount: 450000,
    payee: 'HDFC AMC Dividend',
    note: 'Quarterly dividend payout',
    tags: 'investment,dividend',
    isRecurring: false,
    createdAt: '2026-10-15T10:00:00Z',
    updatedAt: '2026-10-15T10:00:00Z',
  },
  {
    id: 'tx-10',
    userId: 'usr-1',
    accountId: 'acc-hdfc-salary',
    categoryId: 'cat-rent',
    date: '2026-10-05',
    type: 'expense',
    amount: 4200000, // ₹42,000.00
    signedAmount: -4200000,
    payee: 'Landlord - S. Sharma',
    note: 'Flat 402 Rent',
    tags: 'rent,housing',
    isRecurring: true,
    createdAt: '2026-10-05T09:00:00Z',
    updatedAt: '2026-10-05T09:00:00Z',
  },
  {
    id: 'tx-11',
    userId: 'usr-1',
    accountId: 'acc-hdfc-salary',
    categoryId: 'cat-emi',
    date: '2026-10-10',
    type: 'expense',
    amount: 1240000, // ₹12,400.00
    signedAmount: -1240000,
    payee: 'SBI Car Loan EMI',
    note: 'Monthly auto loan installment',
    tags: 'emi,loan',
    isRecurring: true,
    createdAt: '2026-10-10T10:00:00Z',
    updatedAt: '2026-10-10T10:00:00Z',
  },
  {
    id: 'tx-12',
    userId: 'usr-1',
    accountId: 'acc-icici-card',
    categoryId: 'cat-subscriptions',
    date: '2026-10-18',
    type: 'expense',
    amount: 79900, // ₹799.00
    signedAmount: -79900,
    payee: 'Netflix India',
    note: 'Premium family plan',
    tags: 'entertainment,subscription',
    isRecurring: true,
    createdAt: '2026-10-18T15:00:00Z',
    updatedAt: '2026-10-18T15:00:00Z',
  },
];

export const FIXTURE_VALUATIONS: Record<string, ValuationDTO[]> = {
  'acc-zerodha-mf': [
    { id: 'val-mf-1', accountId: 'acc-zerodha-mf', date: '2026-06-30', value: 42500000, costBasis: 40000000, note: 'Mid-year rebalance', createdAt: '2026-06-30', updatedAt: '2026-06-30' },
    { id: 'val-mf-2', accountId: 'acc-zerodha-mf', date: '2026-07-31', value: 43800000, costBasis: 40000000, note: 'Monthly valuation', createdAt: '2026-07-31', updatedAt: '2026-07-31' },
    { id: 'val-mf-3', accountId: 'acc-zerodha-mf', date: '2026-08-31', value: 45200000, costBasis: 40000000, note: 'Monthly valuation', createdAt: '2026-08-31', updatedAt: '2026-08-31' },
    { id: 'val-mf-4', accountId: 'acc-zerodha-mf', date: '2026-09-30', value: 46900000, costBasis: 40000000, note: 'Quarterly review', createdAt: '2026-09-30', updatedAt: '2026-09-30' },
    { id: 'val-mf-5', accountId: 'acc-zerodha-mf', date: '2026-10-25', value: 47850000, costBasis: 40000000, note: 'Latest NAV mark', createdAt: '2026-10-25', updatedAt: '2026-10-25' },
  ],
  'acc-groww-stocks': [
    { id: 'val-st-1', accountId: 'acc-groww-stocks', date: '2026-07-31', value: 26200000, costBasis: 25000000, note: 'July market close', createdAt: '2026-07-31', updatedAt: '2026-07-31' },
    { id: 'val-st-2', accountId: 'acc-groww-stocks', date: '2026-08-31', value: 27100000, costBasis: 25000000, note: 'August market close', createdAt: '2026-08-31', updatedAt: '2026-08-31' },
    { id: 'val-st-3', accountId: 'acc-groww-stocks', date: '2026-09-30', value: 27950000, costBasis: 25000000, note: 'September market close', createdAt: '2026-09-30', updatedAt: '2026-09-30' },
    { id: 'val-st-4', accountId: 'acc-groww-stocks', date: '2026-10-25', value: 28540000, costBasis: 25000000, note: 'October market close', createdAt: '2026-10-25', updatedAt: '2026-10-25' },
  ],
};

export const FIXTURE_NET_WORTH_HISTORY: NetWorthPointDTO[] = [
  { date: '2026-05-01', assets: 102000000, liabilities: 44000000, netWorth: 58000000 },
  { date: '2026-06-01', assets: 106500000, liabilities: 42800000, netWorth: 63700000 },
  { date: '2026-07-01', assets: 111000000, liabilities: 41600000, netWorth: 69400000 },
  { date: '2026-08-01', assets: 115200000, liabilities: 40900000, netWorth: 74300000 },
  { date: '2026-09-01', assets: 120500000, liabilities: 39500000, netWorth: 81000000 },
  { date: '2026-10-01', assets: 124800000, liabilities: 38200000, netWorth: 86600000 },
  { date: '2026-10-28', assets: 127600000, liabilities: 37400000, netWorth: 90200000 },
];

export const FIXTURE_OVERVIEW_STATS: OverviewStatsDTO = {
  netWorth: 90200000, // ₹9,02,000
  totalAssets: 127600000, // ₹12,76,000
  totalLiabilities: 37400000, // ₹3,74,000
  monthlyIncome: 21950000, // ₹2,19,500
  monthlyExpense: 7292800, // ₹72,928
  savingsRate: 66.8, // 66.8%
};
