import type {
  AccountDTO,
  CategoryDTO,
  TransactionDTO,
  ValuationDTO,
  BudgetDTO,
  RecurringRuleDTO,
} from '../contract';
import { PRNG } from './prng';

export type PersonaName = 'salaried-urban' | 'freelancer' | 'family';

export interface GeneratorOptions {
  persona?: PersonaName;
  seed?: number | string;
  anchorDate?: string; // YYYY-MM-DD, default 2026-10-31
  relative?: boolean; // if true, anchorDate is today
  months?: number; // default 24
  size?: 'small' | 'large';
  userId?: string;
}

export interface GeneratedFinanceData {
  persona: PersonaName;
  anchorDate: string;
  startDate: string;
  userId: string;
  accounts: AccountDTO[];
  categories: CategoryDTO[];
  transactions: TransactionDTO[];
  valuations: ValuationDTO[];
  budgets: BudgetDTO[];
  recurringRules: RecurringRuleDTO[];
}

export const TAMIL_PAYEES = [
  'அண்ணாச்சி மளிகை 🛒',
  'சரவணா ஸ்டோர்ஸ் 🛍️',
  'சென்னையம்மா உணவகம் 🍲',
  'ரயில்வே டிக்கெட் 🚂',
  'பில்லா சூப்பர்மார்க்கெட் 🏪',
  'முத்து பார்மசி 💊',
];

export const HINDI_PAYEES = [
  'चाय की दुकान ☕',
  'बिजली बिल ⚡',
  'किराना स्टोर 🛒',
  'दवाखाना 💊',
  'अग्रवाल स्वीट्स 🍬',
  'दूध डेयरी 🥛',
  'दिल्ली ऑटो सर्विस 🛺',
];

export const METRO_PAYEES = [
  'Swiggy 🍔',
  'Zomato 🍕',
  'Amazon India 📦',
  'Flipkart 🛍️',
  'Uber India 🚗',
  'Ola Cabs 🚕',
  'Netflix India 🍿',
  'Cult.fit Gym 🏋️',
  'Apollo Pharmacy 🏥',
  'Shell Petrol Pump ⛽',
  'Starbucks Coffee ☕',
  'BigBasket 🥬',
  'Jio Fiber Broadband 🌐',
  'Decathlon Sports 🚴',
];

export const DEFAULT_CATEGORIES: Array<{
  name: string;
  type: 'expense' | 'income';
  icon?: string;
  color?: string;
}> = [
  // Expenses
  { name: 'Food & Dining', type: 'expense', icon: 'utensils', color: '#f97316' },
  { name: 'Groceries', type: 'expense', icon: 'shopping-cart', color: '#10b981' },
  { name: 'Transport', type: 'expense', icon: 'car', color: '#3b82f6' },
  { name: 'Fuel', type: 'expense', icon: 'fuel', color: '#eab308' },
  { name: 'Rent', type: 'expense', icon: 'home', color: '#8b5cf6' },
  { name: 'Utilities', type: 'expense', icon: 'zap', color: '#06b6d4' },
  { name: 'Shopping', type: 'expense', icon: 'bag', color: '#ec4899' },
  { name: 'Health', type: 'expense', icon: 'heart', color: '#ef4444' },
  { name: 'Entertainment', type: 'expense', icon: 'film', color: '#a855f7' },
  { name: 'Travel', type: 'expense', icon: 'plane', color: '#14b8a6' },
  { name: 'EMI & Loans', type: 'expense', icon: 'credit-card', color: '#64748b' },
  { name: 'Education', type: 'expense', icon: 'book', color: '#6366f1' },
  { name: 'Insurance', type: 'expense', icon: 'shield', color: '#0284c7' },
  { name: 'Subscriptions', type: 'expense', icon: 'repeat', color: '#d946ef' },
  { name: 'Fees & Interest', type: 'expense', icon: 'percent', color: '#f43f5e' },
  { name: 'Others', type: 'expense', icon: 'more-horizontal', color: '#71717a' },
  // Incomes
  { name: 'Salary', type: 'income', icon: 'briefcase', color: '#22c55e' },
  { name: 'Interest', type: 'income', icon: 'trending-up', color: '#10b981' },
  { name: 'Dividends', type: 'income', icon: 'pie-chart', color: '#059669' },
  { name: 'Refunds', type: 'income', icon: 'rotate-ccw', color: '#0284c7' },
  { name: 'Other income', type: 'income', icon: 'dollar-sign', color: '#84cc16' },
];

/**
 * Formats a Date object to YYYY-MM-DD.
 */
export function formatDate(d: Date): string {
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Adds months to a Date.
 */
export function addMonths(d: Date, months: number): Date {
  const result = new Date(d.getTime());
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
}

/**
 * Generates deterministic finance data for a given persona.
 */
export function generateFinanceData(options: GeneratorOptions = {}): GeneratedFinanceData {
  const persona: PersonaName = options.persona || 'salaried-urban';
  const userId = options.userId || 'usr_finance_default';
  const prng = new PRNG(options.seed ?? `${persona}_seed_v1`);

  let anchorDate = options.anchorDate || '2026-10-31';
  if (options.relative) {
    anchorDate = formatDate(new Date());
  }

  const months = options.months ?? 24;
  const isLarge = options.size === 'large';

  // Compute start date (months prior)
  const anchorD = new Date(`${anchorDate}T00:00:00Z`);
  const startD = new Date(anchorD.getTime());
  startD.setUTCMonth(startD.getUTCMonth() - months);
  startD.setUTCDate(1);
  const startDate = formatDate(startD);

  // 1. Categories
  const categories: CategoryDTO[] = DEFAULT_CATEGORIES.map((c) => ({
    id: prng.nextId('cat'),
    userId: null, // system category
    name: c.name,
    type: c.type,
    parentId: null,
    icon: c.icon || null,
    color: c.color || null,
    isSystem: true,
    createdAt: `${startDate}T00:00:00Z`,
    updatedAt: `${startDate}T00:00:00Z`,
  }));

  const catMap = new Map<string, string>();
  for (const c of categories) {
    catMap.set(c.name, c.id);
  }

  // 2. Accounts per Persona
  const accounts: AccountDTO[] = [];
  const valuations: ValuationDTO[] = [];
  const budgets: BudgetDTO[] = [];
  const recurringRules: RecurringRuleDTO[] = [];
  const transactions: Record<string, unknown>[] = [];

  const createdTime = `${startDate}T00:00:00Z`;

  if (persona === 'salaried-urban') {
    // Accounts
    const accSalary: AccountDTO = {
      id: prng.nextId('acc_salary'),
      userId,
      name: 'Salary Account',
      kind: 'bank',
      class: 'asset',
      currency: 'INR',
      creditLimit: null,
      isActive: true,
      metadata: { bank: 'HDFC', accountNumber: '****1024' },
      createdAt: createdTime,
      updatedAt: createdTime,
    };
    const accSavings: AccountDTO = {
      id: prng.nextId('acc_savings'),
      userId,
      name: 'Savings Account',
      kind: 'bank',
      class: 'asset',
      currency: 'INR',
      creditLimit: null,
      isActive: true,
      metadata: { bank: 'ICICI', accountNumber: '****5678' },
      createdAt: createdTime,
      updatedAt: createdTime,
    };
    const accCash: AccountDTO = {
      id: prng.nextId('acc_cash'),
      userId,
      name: 'Cash Wallet',
      kind: 'cash',
      class: 'asset',
      currency: 'INR',
      creditLimit: null,
      isActive: true,
      metadata: {},
      createdAt: createdTime,
      updatedAt: createdTime,
    };
    const accCardA: AccountDTO = {
      id: prng.nextId('acc_cc_a'),
      userId,
      name: 'Credit Card A',
      kind: 'credit_card',
      class: 'liability',
      currency: 'INR',
      creditLimit: 15000000, // 150,000 INR
      isActive: true,
      metadata: { issuer: 'HDFC Regalia', billingCycleDay: 20 },
      createdAt: createdTime,
      updatedAt: createdTime,
    };
    const accFD: AccountDTO = {
      id: prng.nextId('acc_fd_1'),
      userId,
      name: 'FD 1 Year',
      kind: 'fixed_deposit',
      class: 'asset',
      currency: 'INR',
      creditLimit: null,
      isActive: true,
      metadata: { principalPaise: 10000000, interestRate: 0.075, compounding: 'quarterly', tenureYears: 1 },
      createdAt: createdTime,
      updatedAt: createdTime,
    };
    const accRD: AccountDTO = {
      id: prng.nextId('acc_rd_1'),
      userId,
      name: 'RD 5000 Monthly',
      kind: 'recurring_deposit',
      class: 'asset',
      currency: 'INR',
      creditLimit: null,
      isActive: true,
      metadata: { monthlyInstallmentPaise: 500000, interestRate: 0.07, compounding: 'quarterly', tenureMonths: 12 },
      createdAt: createdTime,
      updatedAt: createdTime,
    };
    const accMF: AccountDTO = {
      id: prng.nextId('acc_mf_sip'),
      userId,
      name: 'Mutual Fund SIP',
      kind: 'mutual_fund',
      class: 'asset',
      currency: 'INR',
      creditLimit: null,
      isActive: true,
      metadata: { folio: '12345/67', scheme: 'Nifty 50 Index Fund' },
      createdAt: createdTime,
      updatedAt: createdTime,
    };
    const accArchivedWallet: AccountDTO = {
      id: prng.nextId('acc_archived'),
      userId,
      name: 'Archived Old Wallet',
      kind: 'cash',
      class: 'asset',
      currency: 'INR',
      creditLimit: null,
      isActive: false, // satisfies "an archived account"
      metadata: { closedReason: 'Migrated to Cash Wallet' },
      createdAt: createdTime,
      updatedAt: createdTime,
    };

    accounts.push(accSalary, accSavings, accCash, accCardA, accFD, accRD, accMF, accArchivedWallet);

    // Initial FD opening transfer on start date
    transactions.push({
      id: prng.nextId('txn_init_fd'),
      userId,
      accountId: accSavings.id,
      toAccountId: accFD.id,
      categoryId: null,
      date: startDate,
      type: 'transfer',
      amount: 10000000, // 100,000 INR
      signedAmount: -10000000,
      payee: 'Fixed Deposit Booking',
      note: '1 Year Fixed Deposit Booking',
      tags: 'fd,deposit',
      createdAt: `${startDate}T09:00:00Z`,
      updatedAt: `${startDate}T09:00:00Z`,
    });

    // Opening balances for savings & salary
    transactions.push({
      id: prng.nextId('txn_init_sav'),
      userId,
      accountId: accSavings.id,
      categoryId: catMap.get('Other income') || null,
      date: startDate,
      type: 'income',
      amount: 25000000, // 250,000 INR
      signedAmount: 25000000,
      payee: 'Opening Balance',
      note: 'Initial bank balance transfer',
      createdAt: `${startDate}T08:00:00Z`,
      updatedAt: `${startDate}T08:00:00Z`,
    });

    // Include a Leap-Day Entry: 2024-02-29
    transactions.push({
      id: prng.nextId('txn_leap_day'),
      userId,
      accountId: accSalary.id,
      categoryId: catMap.get('Interest') || null,
      date: '2024-02-29',
      type: 'income',
      amount: 142850, // 1,428.50 INR
      signedAmount: 142850,
      payee: 'Bank Leap Day Savings Interest  leap',
      note: 'Special 2024-02-29 leap day interest credit',
      tags: 'leap-day,interest',
      createdAt: '2024-02-29T12:00:00Z',
      updatedAt: '2024-02-29T12:00:00Z',
    });

    // Monthly recurring flows
    let mfValuation = 5000000; // 50,000 INR
    let mfCostBasis = 5000000;

    for (let m = 0; m < months; m++) {
      const curMonthDate = addMonths(startD, m);
      const year = curMonthDate.getUTCFullYear();
      const monthNum = curMonthDate.getUTCMonth() + 1;
      const monthStr = String(monthNum).padStart(2, '0');
      const firstDay = `${year}-${monthStr}-01`;
      const isDiwaliMonth = monthNum === 10 || monthNum === 11;
      const isSummerTravel = monthNum === 5;

      // 1st of month: Salary
      const salaryAmount = 12500000; // 125,000 INR
      transactions.push({
        id: prng.nextId('txn_sal'),
        userId,
        accountId: accSalary.id,
        categoryId: catMap.get('Salary') || null,
        date: firstDay,
        type: 'income',
        amount: salaryAmount,
        signedAmount: salaryAmount,
        payee: 'TechCorp India Pvt Ltd 💼',
        note: `Monthly Salary Credit ${year}-${monthStr}`,
        tags: 'salary,monthly',
        createdAt: `${firstDay}T09:30:00Z`,
        updatedAt: `${firstDay}T09:30:00Z`,
      });

      // 2nd: Rent
      const rentDate = `${year}-${monthStr}-02`;
      transactions.push({
        id: prng.nextId('txn_rent'),
        userId,
        accountId: accSalary.id,
        categoryId: catMap.get('Rent') || null,
        date: rentDate,
        type: 'expense',
        amount: 3200000, // 32,000 INR
        signedAmount: -3200000,
        payee: 'சென்னையம்மா உணவகம் & Landlord House Rent',
        note: `Apartment Rent ${year}-${monthStr}`,
        tags: 'rent,essential',
        createdAt: `${rentDate}T10:00:00Z`,
        updatedAt: `${rentDate}T10:00:00Z`,
      });

      // 5th: Transfer to RD (5,000 INR)
      const rdDate = `${year}-${monthStr}-05`;
      transactions.push({
        id: prng.nextId('txn_rd'),
        userId,
        accountId: accSalary.id,
        toAccountId: accRD.id,
        categoryId: null,
        date: rdDate,
        type: 'transfer',
        amount: 500000, // 5,000 INR
        signedAmount: -500000,
        payee: 'RD Installment Deposit',
        note: `Monthly RD 5000 Installment #${m + 1}`,
        tags: 'rd,savings',
        createdAt: `${rdDate}T10:00:00Z`,
        updatedAt: `${rdDate}T10:00:00Z`,
      });

      // 6th: Utilities
      const utilDate = `${year}-${monthStr}-06`;
      transactions.push({
        id: prng.nextId('txn_util'),
        userId,
        accountId: accSalary.id,
        categoryId: catMap.get('Utilities') || null,
        date: utilDate,
        type: 'expense',
        amount: 354000, // 3,540 INR
        signedAmount: -354000,
        payee: 'बिजली बिल ⚡ TNEB Electricity',
        note: 'Electricity and water utility bill',
        tags: 'utilities',
        createdAt: `${utilDate}T11:00:00Z`,
        updatedAt: `${utilDate}T11:00:00Z`,
      });

      // 10th & 15th: 2-3 SIPs to Mutual Fund
      const sip1Date = `${year}-${monthStr}-10`;
      transactions.push({
        id: prng.nextId('txn_sip1'),
        userId,
        accountId: accSalary.id,
        toAccountId: accMF.id,
        categoryId: null,
        date: sip1Date,
        type: 'transfer',
        amount: 1000000, // 10,000 INR
        signedAmount: -1000000,
        payee: 'HDFC Mutual Fund SIP 📈',
        note: 'Nifty 50 Index Fund SIP',
        tags: 'sip,investment',
        createdAt: `${sip1Date}T12:00:00Z`,
        updatedAt: `${sip1Date}T12:00:00Z`,
      });

      const sip2Date = `${year}-${monthStr}-15`;
      transactions.push({
        id: prng.nextId('txn_sip2'),
        userId,
        accountId: accSalary.id,
        toAccountId: accMF.id,
        categoryId: null,
        date: sip2Date,
        type: 'transfer',
        amount: 500000, // 5,000 INR
        signedAmount: -500000,
        payee: 'Parag Parikh Flexi Cap Fund SIP 📈',
        note: 'Flexi Cap Fund SIP',
        tags: 'sip,investment',
        createdAt: `${sip2Date}T12:00:00Z`,
        updatedAt: `${sip2Date}T12:00:00Z`,
      });

      mfCostBasis += 1500000;
      // Valuation growth with realistic fluctuation
      const growthFactor = isDiwaliMonth ? 1.04 : isSummerTravel ? 0.99 : 1.015;
      mfValuation = Math.floor(mfValuation * growthFactor) + 1500000;

      // Valuations with intentional gap: skip month 7 and month 15 to test valuation gaps!
      if (m !== 7 && m !== 15) {
        valuations.push({
          id: prng.nextId('val_mf'),
          accountId: accMF.id,
          date: `${year}-${monthStr}-28`,
          value: mfValuation,
          costBasis: mfCostBasis,
          note: `Monthly NAV valuation update ${year}-${monthStr}`,
          createdAt: `${year}-${monthStr}-28T18:00:00Z`,
          updatedAt: `${year}-${monthStr}-28T18:00:00Z`,
        });
      }

      // Cash withdrawal: transfer from Salary to Cash Wallet
      const cashWdDate = `${year}-${monthStr}-07`;
      transactions.push({
        id: prng.nextId('txn_cash_wd'),
        userId,
        accountId: accSalary.id,
        toAccountId: accCash.id,
        categoryId: null,
        date: cashWdDate,
        type: 'transfer',
        amount: 800000, // 8,000 INR
        signedAmount: -800000,
        payee: 'ATM Cash Withdrawal 🏧',
        note: 'Cash replenishment for wallet',
        tags: 'cash,atm',
        createdAt: `${cashWdDate}T14:00:00Z`,
        updatedAt: `${cashWdDate}T14:00:00Z`,
      });

      // Cash expenses: chai, groceries, auto
      transactions.push({
        id: prng.nextId('txn_chai'),
        userId,
        accountId: accCash.id,
        categoryId: catMap.get('Food & Dining') || null,
        date: `${year}-${monthStr}-08`,
        type: 'expense',
        amount: 15000, // 150 INR
        signedAmount: -15000,
        payee: 'चाय की दुकान ☕',
        note: 'Evening tea and samosas with friends',
        tags: 'cash,chai',
        createdAt: `${year}-${monthStr}-08T17:30:00Z`,
        updatedAt: `${year}-${monthStr}-08T17:30:00Z`,
      });

      // Tamil payee: Groceries
      transactions.push({
        id: prng.nextId('txn_grocery'),
        userId,
        accountId: accCash.id,
        categoryId: catMap.get('Groceries') || null,
        date: `${year}-${monthStr}-12`,
        type: 'expense',
        amount: 145000, // 1,450 INR
        signedAmount: -145000,
        payee: 'அண்ணாச்சி மளிகை 🛒',
        note: 'Vegetables and provisions',
        tags: 'groceries,tamil',
        createdAt: `${year}-${monthStr}-12T11:30:00Z`,
        updatedAt: `${year}-${monthStr}-12T11:30:00Z`,
      });

      // Credit card expenses during the month
      let monthlyCardSpend = 0;
      const ccDates = [11, 14, 18, 21];
      for (const d of ccDates) {
        const spendDate = `${year}-${monthStr}-${String(d).padStart(2, '0')}`;
        const payee = prng.pickOne(METRO_PAYEES);
        const amount = isDiwaliMonth
          ? prng.nextInt(350000, 950000) // 3,500 - 9,500 INR
          : prng.nextInt(85000, 320000); // 850 - 3,200 INR
        monthlyCardSpend += amount;

        transactions.push({
          id: prng.nextId('txn_cc_exp'),
          userId,
          accountId: accCardA.id,
          categoryId: catMap.get('Shopping') || catMap.get('Food & Dining') || null,
          date: spendDate,
          type: 'expense',
          amount,
          signedAmount: -amount,
          payee,
          note: `Card purchase at ${payee}`,
          tags: 'credit_card',
          createdAt: `${spendDate}T19:00:00Z`,
          updatedAt: `${spendDate}T19:00:00Z`,
        });
      }

      // One credit card paid IN FULL around the 25th via transfer from Salary Account
      const ccPayDate = `${year}-${monthStr}-25`;
      transactions.push({
        id: prng.nextId('txn_cc_pay'),
        userId,
        accountId: accSalary.id,
        toAccountId: accCardA.id,
        categoryId: null,
        date: ccPayDate,
        type: 'transfer',
        amount: monthlyCardSpend,
        signedAmount: -monthlyCardSpend,
        payee: 'HDFC Credit Card Bill Payment 💳',
        note: `Credit card bill payment in full for ${year}-${monthStr}`,
        tags: 'credit_card,bill_payment',
        createdAt: `${ccPayDate}T16:00:00Z`,
        updatedAt: `${ccPayDate}T16:00:00Z`,
      });

      // UPI spends on various days
      const upiDays = [3, 9, 16, 22, 27];
      for (const day of upiDays) {
        const upiDate = `${year}-${monthStr}-${String(day).padStart(2, '0')}`;
        const payee = prng.pickOne([...TAMIL_PAYEES, ...HINDI_PAYEES, ...METRO_PAYEES]);
        const amount = prng.nextInt(12000, 85000); // 120 to 850 INR
        transactions.push({
          id: prng.nextId('txn_upi'),
          userId,
          accountId: accSalary.id,
          categoryId: catMap.get('Food & Dining') || catMap.get('Transport') || null,
          date: upiDate,
          type: 'expense',
          amount,
          signedAmount: -amount,
          payee,
          note: `UPI payment to ${payee}`,
          tags: 'upi',
          createdAt: `${upiDate}T13:00:00Z`,
          updatedAt: `${upiDate}T13:00:00Z`,
        });
      }

      // Month-end boundary entry: 28th, 30th, 31st
      const lastDayStr = monthNum === 2 ? '28' : [4, 6, 9, 11].includes(monthNum) ? '30' : '31';
      const monthEndDate = `${year}-${monthStr}-${lastDayStr}`;
      transactions.push({
        id: prng.nextId('txn_monthend'),
        userId,
        accountId: accSalary.id,
        categoryId: catMap.get('Subscriptions') || null,
        date: monthEndDate,
        type: 'expense',
        amount: 49900, // 499 INR
        signedAmount: -49900,
        payee: 'Netflix India 🍿',
        note: `Monthly OTT Subscription on month-end ${monthEndDate}`,
        tags: 'subscription,month-end',
        createdAt: `${monthEndDate}T23:45:00Z`,
        updatedAt: `${monthEndDate}T23:45:00Z`,
      });
    }

    // Edge Cases on purpose:
    // 1. Amount breaking floating point math: 10 paise + 20 paise = 30 paise
    transactions.push({
      id: prng.nextId('txn_float_edge'),
      userId,
      accountId: accSalary.id,
      categoryId: catMap.get('Others') || null,
      date: '2026-03-14',
      type: 'expense',
      amount: 30, // 0.30 INR = 30 paise (classic 0.1 + 0.2 float break)
      signedAmount: -30,
      payee: 'SMS Alert Charge 📲',
      note: 'Quarterly SMS alert charge with 0.1 + 0.2 float test paise amount',
      tags: 'edge_case,float_test',
      createdAt: '2026-03-14T08:00:00Z',
      updatedAt: '2026-03-14T08:00:00Z',
    });

    // 2. Refund entry
    transactions.push({
      id: prng.nextId('txn_refund'),
      userId,
      accountId: accSalary.id,
      categoryId: catMap.get('Refunds') || null,
      date: '2026-04-18',
      type: 'income',
      amount: 249900, // 2,499 INR
      signedAmount: 249900,
      payee: 'Amazon India Refund 📦',
      note: 'Return refund for defective headset',
      tags: 'refund,ecommerce',
      createdAt: '2026-04-18T15:20:00Z',
      updatedAt: '2026-04-18T15:20:00Z',
    });

    // 3. Adjustment entry (signed)
    transactions.push({
      id: prng.nextId('txn_adj'),
      userId,
      accountId: accSalary.id,
      categoryId: null,
      date: '2026-05-31',
      type: 'adjustment',
      amount: 1500, // 15 INR reconciliation
      signedAmount: 1500,
      payee: 'Statement Reconciliation Adjustment',
      note: 'Reconciling ledger with passbook balance',
      tags: 'adjustment',
      createdAt: '2026-05-31T20:00:00Z',
      updatedAt: '2026-05-31T20:00:00Z',
    });

    // 4. Soft-deleted transaction
    transactions.push({
      id: prng.nextId('txn_deleted'),
      userId,
      accountId: accSalary.id,
      categoryId: catMap.get('Shopping') || null,
      date: '2026-06-10',
      type: 'expense',
      amount: 450000,
      signedAmount: -450000,
      payee: 'Duplicate Charge Store',
      note: 'Accidental double swipe - reversed and deleted',
      deletedAt: '2026-06-11T10:00:00Z',
      createdAt: '2026-06-10T12:00:00Z',
      updatedAt: '2026-06-11T10:00:00Z',
    });

    // 5. Same-day ordering: 3 transactions on 2026-07-15
    const sameDay = '2026-07-15';
    transactions.push(
      {
        id: 'txn_same_day_01',
        userId,
        accountId: accSalary.id,
        categoryId: catMap.get('Transport') || null,
        date: sameDay,
        type: 'expense',
        amount: 25000,
        signedAmount: -25000,
        payee: 'Uber India Morning Cab 🚗',
        note: 'Office ride 1',
        createdAt: `${sameDay}T08:30:00Z`,
        updatedAt: `${sameDay}T08:30:00Z`,
      },
      {
        id: 'txn_same_day_02',
        userId,
        accountId: accSalary.id,
        categoryId: catMap.get('Food & Dining') || null,
        date: sameDay,
        type: 'expense',
        amount: 35000,
        signedAmount: -35000,
        payee: 'Lunch Cafeteria 🥗',
        note: 'Office lunch 2',
        createdAt: `${sameDay}T13:15:00Z`,
        updatedAt: `${sameDay}T13:15:00Z`,
      },
      {
        id: 'txn_same_day_03',
        userId,
        accountId: accSalary.id,
        categoryId: catMap.get('Transport') || null,
        date: sameDay,
        type: 'expense',
        amount: 28000,
        signedAmount: -28000,
        payee: 'Uber India Evening Cab 🚗',
        note: 'Home ride 3',
        createdAt: `${sameDay}T19:45:00Z`,
        updatedAt: `${sameDay}T19:45:00Z`,
      }
    );

    // 6. Backdated entry: inserted later but dated earlier
    transactions.push({
      id: prng.nextId('txn_backdated'),
      userId,
      accountId: accSavings.id,
      categoryId: catMap.get('Health') || null,
      date: '2025-01-10', // early date
      type: 'expense',
      amount: 185000, // 1,850 INR
      signedAmount: -185000,
      payee: 'Apollo Pharmacy 🏥',
      note: 'Backdated medical bill entry logged in July 2026',
      tags: 'backdated,health',
      createdAt: '2026-07-20T10:00:00Z', // created much later
      updatedAt: '2026-07-20T10:00:00Z',
    });

    // 7. Budgets
    budgets.push(
      {
        id: prng.nextId('bgt_groceries'),
        userId,
        categoryId: catMap.get('Groceries') || categories[1].id,
        amount: 1500000, // 15,000 INR
        period: 'monthly',
        startDate: '2026-01-01',
        endDate: null,
        createdAt: createdTime,
        updatedAt: createdTime,
      },
      {
        id: prng.nextId('bgt_dining'),
        userId,
        categoryId: catMap.get('Food & Dining') || categories[0].id,
        amount: 1000000, // 10,000 INR
        period: 'monthly',
        startDate: '2026-01-01',
        endDate: null,
        createdAt: createdTime,
        updatedAt: createdTime,
      }
    );

    // 8. Recurring Rules
    recurringRules.push(
      {
        id: prng.nextId('rec_rent'),
        userId,
        accountId: accSalary.id,
        toAccountId: null,
        categoryId: catMap.get('Rent') || categories[4].id,
        type: 'expense',
        amount: 3200000,
        payee: 'House Owner Rent',
        note: 'Monthly rental standing instruction',
        frequency: 'monthly',
        interval: 1,
        startDate: '2026-01-02',
        endDate: null,
        nextOccurrence: '2026-11-02',
        isActive: true,
        createdAt: createdTime,
        updatedAt: createdTime,
      },
      {
        id: prng.nextId('rec_rd'),
        userId,
        accountId: accSalary.id,
        toAccountId: accRD.id,
        categoryId: null,
        type: 'transfer',
        amount: 500000,
        payee: 'RD Auto Debit',
        note: 'Recurring Deposit Monthly Auto Debit',
        frequency: 'monthly',
        interval: 1,
        startDate: '2026-01-05',
        endDate: null,
        nextOccurrence: '2026-11-05',
        isActive: true,
        createdAt: createdTime,
        updatedAt: createdTime,
      }
    );
  } else if (persona === 'freelancer') {
    // Freelancer: Irregular income in bursts, higher cash use, two cards with partial payments & interest
    const accPrimary: AccountDTO = {
      id: prng.nextId('acc_free_bank'),
      userId,
      name: 'Salary Account',
      kind: 'bank',
      class: 'asset',
      currency: 'INR',
      creditLimit: null,
      isActive: true,
      metadata: { bank: 'Axis Bank' },
      createdAt: createdTime,
      updatedAt: createdTime,
    };
    const accCash: AccountDTO = {
      id: prng.nextId('acc_free_cash'),
      userId,
      name: 'Cash Wallet',
      kind: 'cash',
      class: 'asset',
      currency: 'INR',
      creditLimit: null,
      isActive: true,
      metadata: {},
      createdAt: createdTime,
      updatedAt: createdTime,
    };
    const accCardA: AccountDTO = {
      id: prng.nextId('acc_free_cca'),
      userId,
      name: 'Credit Card A',
      kind: 'credit_card',
      class: 'liability',
      currency: 'INR',
      creditLimit: 20000000, // 200,000 INR
      isActive: true,
      metadata: { issuer: 'ICICI Amazon Pay' },
      createdAt: createdTime,
      updatedAt: createdTime,
    };
    const accCardB: AccountDTO = {
      id: prng.nextId('acc_free_ccb'),
      userId,
      name: 'Credit Card B',
      kind: 'credit_card',
      class: 'liability',
      currency: 'INR',
      creditLimit: 10000000, // 100,000 INR
      isActive: true,
      metadata: { issuer: 'Axis Flipkart' },
      createdAt: createdTime,
      updatedAt: createdTime,
    };
    const accFD: AccountDTO = {
      id: prng.nextId('acc_free_fd'),
      userId,
      name: 'FD 1 Year',
      kind: 'fixed_deposit',
      class: 'asset',
      currency: 'INR',
      creditLimit: null,
      isActive: true,
      metadata: { principalPaise: 5000000, interestRate: 0.072 },
      createdAt: createdTime,
      updatedAt: createdTime,
    };
    const accArchived: AccountDTO = {
      id: prng.nextId('acc_free_old'),
      userId,
      name: 'Savings Account',
      kind: 'bank',
      class: 'asset',
      currency: 'INR',
      creditLimit: null,
      isActive: false, // archived
      metadata: { closedReason: 'Closed old current account' },
      createdAt: createdTime,
      updatedAt: createdTime,
    };

    accounts.push(accPrimary, accCash, accCardA, accCardB, accFD, accArchived);

    // Initial balance
    transactions.push({
      id: prng.nextId('txn_free_init'),
      userId,
      accountId: accPrimary.id,
      categoryId: catMap.get('Other income') || null,
      date: startDate,
      type: 'income',
      amount: 35000000, // 350,000 INR
      signedAmount: 35000000,
      payee: 'Opening Capital Balance',
      note: 'Freelance opening capital',
      createdAt: `${startDate}T08:00:00Z`,
      updatedAt: `${startDate}T08:00:00Z`,
    });

    // Leap-Day Entry
    transactions.push({
      id: prng.nextId('txn_free_leap'),
      userId,
      accountId: accPrimary.id,
      categoryId: catMap.get('Other income') || null,
      date: '2024-02-29',
      type: 'income',
      amount: 4500000, // 45,000 INR
      signedAmount: 4500000,
      payee: 'Global Design Client (USD Wire)',
      note: 'Freelance retainer payment received on leap day 2024-02-29',
      tags: 'freelance,leap-day',
      createdAt: '2024-02-29T14:30:00Z',
      updatedAt: '2024-02-29T14:30:00Z',
    });

    // Monthly flows for freelancer
    for (let m = 0; m < months; m++) {
      const curMonthDate = addMonths(startD, m);
      const year = curMonthDate.getUTCFullYear();
      const monthNum = curMonthDate.getUTCMonth() + 1;
      const monthStr = String(monthNum).padStart(2, '0');

      // Irregular income in bursts (some months high, some zero, some medium)
      const incomePattern = [18000000, 0, 32000000, 9500000, 0, 24000000, 41000000, 0, 16000000, 28000000, 0, 35000000];
      const monthIncome = incomePattern[m % incomePattern.length];
      if (monthIncome > 0) {
        transactions.push({
          id: prng.nextId('txn_free_inc'),
          userId,
          accountId: accPrimary.id,
          categoryId: catMap.get('Other income') || null,
          date: `${year}-${monthStr}-14`,
          type: 'income',
          amount: monthIncome,
          signedAmount: monthIncome,
          payee: prng.pickOne(['Acme US Client 🌐', 'Design Studio Mumbai 🎨', 'Fintech Consulting Chennai 💻']),
          note: `Project milestone invoice payout ${year}-${monthStr}`,
          tags: 'freelance,invoice',
          createdAt: `${year}-${monthStr}-14T11:00:00Z`,
          updatedAt: `${year}-${monthStr}-14T11:00:00Z`,
        });
      }

      // High cash use: regular ATM cash withdrawals
      transactions.push({
        id: prng.nextId('txn_free_atm'),
        userId,
        accountId: accPrimary.id,
        toAccountId: accCash.id,
        categoryId: null,
        date: `${year}-${monthStr}-03`,
        type: 'transfer',
        amount: 2500000, // 25,000 INR in cash
        signedAmount: -2500000,
        payee: 'ATM Cash Withdrawal 🏧',
        note: 'Monthly cash withdrawal for local expenses',
        tags: 'cash,atm',
        createdAt: `${year}-${monthStr}-03T10:00:00Z`,
        updatedAt: `${year}-${monthStr}-03T10:00:00Z`,
      });

      // Frequent cash expenditures
      transactions.push(
        {
          id: prng.nextId('txn_free_c1'),
          userId,
          accountId: accCash.id,
          categoryId: catMap.get('Groceries') || null,
          date: `${year}-${monthStr}-07`,
          type: 'expense',
          amount: 650000, // 6,500 INR
          signedAmount: -650000,
          payee: 'किराना स्टोर 🛒',
          note: 'Cash grocery store purchase',
          tags: 'cash,groceries',
          createdAt: `${year}-${monthStr}-07T12:00:00Z`,
          updatedAt: `${year}-${monthStr}-07T12:00:00Z`,
        },
        {
          id: prng.nextId('txn_free_c2'),
          userId,
          accountId: accCash.id,
          categoryId: catMap.get('Food & Dining') || null,
          date: `${year}-${monthStr}-18`,
          type: 'expense',
          amount: 420000, // 4,200 INR
          signedAmount: -420000,
          payee: 'अग्रवाल स्वीट्स 🍬',
          note: 'Sweets and snacks',
          tags: 'cash,food',
          createdAt: `${year}-${monthStr}-18T16:00:00Z`,
          updatedAt: `${year}-${monthStr}-18T16:00:00Z`,
        }
      );

      // Two cards with partial payments and interest charges
      // Card A spends: 25,000 - 45,000 INR
      const spendA = 3500000;
      transactions.push({
        id: prng.nextId('txn_cca_sp'),
        userId,
        accountId: accCardA.id,
        categoryId: catMap.get('Shopping') || null,
        date: `${year}-${monthStr}-10`,
        type: 'expense',
        amount: spendA,
        signedAmount: -spendA,
        payee: 'Flipkart 🛍️',
        note: 'Electronics and work supplies',
        tags: 'credit_card',
        createdAt: `${year}-${monthStr}-10T14:00:00Z`,
        updatedAt: `${year}-${monthStr}-10T14:00:00Z`,
      });

      // Card A PARTIAL payment (paying 60% of spend)
      const payA = Math.floor(spendA * 0.6);
      transactions.push({
        id: prng.nextId('txn_cca_pay'),
        userId,
        accountId: accPrimary.id,
        toAccountId: accCardA.id,
        categoryId: null,
        date: `${year}-${monthStr}-24`,
        type: 'transfer',
        amount: payA,
        signedAmount: -payA,
        payee: 'ICICI Credit Card Partial Payment',
        note: 'Partial bill payment (revolving balance)',
        tags: 'credit_card,partial_payment',
        createdAt: `${year}-${monthStr}-24T18:00:00Z`,
        updatedAt: `${year}-${monthStr}-24T18:00:00Z`,
      });

      // Interest charge on Card A for unpaid balance!
      transactions.push({
        id: prng.nextId('txn_cca_int'),
        userId,
        accountId: accCardA.id,
        categoryId: catMap.get('Fees & Interest') || null,
        date: `${year}-${monthStr}-28`,
        type: 'expense',
        amount: 45000, // 450 INR finance charge
        signedAmount: -45000,
        payee: 'ICICI Bank Card Interest & Finance Charges',
        note: 'Interest charges on revolving balance',
        tags: 'interest,fees',
        createdAt: `${year}-${monthStr}-28T22:00:00Z`,
        updatedAt: `${year}-${monthStr}-28T22:00:00Z`,
      });

      // Card B spends & partial payment
      const spendB = 1800000;
      transactions.push({
        id: prng.nextId('txn_ccb_sp'),
        userId,
        accountId: accCardB.id,
        categoryId: catMap.get('Travel') || null,
        date: `${year}-${monthStr}-12`,
        type: 'expense',
        amount: spendB,
        signedAmount: -spendB,
        payee: 'Ola Cabs 🚕 & Train Booking',
        note: 'Travel expenses',
        tags: 'travel',
        createdAt: `${year}-${monthStr}-12T15:00:00Z`,
        updatedAt: `${year}-${monthStr}-12T15:00:00Z`,
      });

      const payB = Math.floor(spendB * 0.7);
      transactions.push({
        id: prng.nextId('txn_ccb_pay'),
        userId,
        accountId: accPrimary.id,
        toAccountId: accCardB.id,
        categoryId: null,
        date: `${year}-${monthStr}-26`,
        type: 'transfer',
        amount: payB,
        signedAmount: -payB,
        payee: 'Axis Bank Card Partial Payment',
        note: 'Partial card payment',
        tags: 'credit_card,partial_payment',
        createdAt: `${year}-${monthStr}-26T17:00:00Z`,
        updatedAt: `${year}-${monthStr}-26T17:00:00Z`,
      });
    }
  } else {
    // Persona: family (Two earners, two cards, school fees, home loan EMI, several FDs, maturing FD, mutual funds and stocks)
    const accEarner1: AccountDTO = {
      id: prng.nextId('acc_fam_sal1'),
      userId,
      name: 'Salary Account',
      kind: 'bank',
      class: 'asset',
      currency: 'INR',
      creditLimit: null,
      isActive: true,
      metadata: { owner: 'Earner 1', bank: 'SBI' },
      createdAt: createdTime,
      updatedAt: createdTime,
    };
    const accJoint: AccountDTO = {
      id: prng.nextId('acc_fam_joint'),
      userId,
      name: 'Savings Account',
      kind: 'bank',
      class: 'asset',
      currency: 'INR',
      creditLimit: null,
      isActive: true,
      metadata: { joint: true, bank: 'HDFC' },
      createdAt: createdTime,
      updatedAt: createdTime,
    };
    const accCash: AccountDTO = {
      id: prng.nextId('acc_fam_cash'),
      userId,
      name: 'Cash Wallet',
      kind: 'cash',
      class: 'asset',
      currency: 'INR',
      creditLimit: null,
      isActive: true,
      metadata: {},
      createdAt: createdTime,
      updatedAt: createdTime,
    };
    const accCardA: AccountDTO = {
      id: prng.nextId('acc_fam_cca'),
      userId,
      name: 'Credit Card A',
      kind: 'credit_card',
      class: 'liability',
      currency: 'INR',
      creditLimit: 30000000, // 300,000 INR
      isActive: true,
      metadata: { issuer: 'SBI SimplyCLICK' },
      createdAt: createdTime,
      updatedAt: createdTime,
    };
    const accCardB: AccountDTO = {
      id: prng.nextId('acc_fam_ccb'),
      userId,
      name: 'Credit Card B',
      kind: 'credit_card',
      class: 'liability',
      currency: 'INR',
      creditLimit: 20000000, // 200,000 INR
      isActive: true,
      metadata: { issuer: 'HDFC Millennia' },
      createdAt: createdTime,
      updatedAt: createdTime,
    };
    const accHomeLoan: AccountDTO = {
      id: prng.nextId('acc_fam_loan'),
      userId,
      name: 'Home Loan',
      kind: 'loan',
      class: 'liability',
      currency: 'INR',
      creditLimit: null,
      isActive: true,
      metadata: { principalPaise: 450000000, interestRate: 0.085, emiPaise: 4200000 }, // 45 lakh INR remaining
      createdAt: createdTime,
      updatedAt: createdTime,
    };
    const accFDOld: AccountDTO = {
      id: prng.nextId('acc_fam_fd1'),
      userId,
      name: 'FD 1 Year',
      kind: 'fixed_deposit',
      class: 'asset',
      currency: 'INR',
      creditLimit: null,
      isActive: true,
      metadata: { principalPaise: 5000000, interestRate: 0.07, maturesInsideRange: true, maturityDate: '2025-06-30' },
      createdAt: createdTime,
      updatedAt: createdTime,
    };
    const accFD2: AccountDTO = {
      id: prng.nextId('acc_fam_fd2'),
      userId,
      name: 'RD 5000 Monthly', // Using contract generic name
      kind: 'fixed_deposit',
      class: 'asset',
      currency: 'INR',
      creditLimit: null,
      isActive: true,
      metadata: { principalPaise: 10000000, interestRate: 0.075 },
      createdAt: createdTime,
      updatedAt: createdTime,
    };
    const accMF: AccountDTO = {
      id: prng.nextId('acc_fam_mf'),
      userId,
      name: 'Mutual Fund SIP',
      kind: 'mutual_fund',
      class: 'asset',
      currency: 'INR',
      creditLimit: null,
      isActive: true,
      metadata: { scheme: 'Mirae Asset Large Cap' },
      createdAt: createdTime,
      updatedAt: createdTime,
    };
    const accStocks: AccountDTO = {
      id: prng.nextId('acc_fam_stocks'),
      userId,
      name: 'Stocks Portfolio',
      kind: 'stocks',
      class: 'asset',
      currency: 'INR',
      creditLimit: null,
      isActive: true,
      metadata: { broker: 'Zerodha Demat' },
      createdAt: createdTime,
      updatedAt: createdTime,
    };
    const accArchived: AccountDTO = {
      id: prng.nextId('acc_fam_arch'),
      userId,
      name: 'Archived Old Wallet',
      kind: 'cash',
      class: 'asset',
      currency: 'INR',
      creditLimit: null,
      isActive: false, // archived
      metadata: { closedReason: 'Old account' },
      createdAt: createdTime,
      updatedAt: createdTime,
    };

    accounts.push(accEarner1, accJoint, accCash, accCardA, accCardB, accHomeLoan, accFDOld, accFD2, accMF, accStocks, accArchived);

    // Initial Joint Account balance
    transactions.push({
      id: prng.nextId('txn_fam_init'),
      userId,
      accountId: accJoint.id,
      categoryId: catMap.get('Other income') || null,
      date: startDate,
      type: 'income',
      amount: 40000000, // 400,000 INR
      signedAmount: 40000000,
      payee: 'Opening Family Corpus',
      note: 'Household joint opening funds',
      createdAt: `${startDate}T08:00:00Z`,
      updatedAt: `${startDate}T08:00:00Z`,
    });

    // Initial FD booking
    transactions.push({
      id: prng.nextId('txn_fam_fd1_book'),
      userId,
      accountId: accJoint.id,
      toAccountId: accFDOld.id,
      categoryId: null,
      date: startDate,
      type: 'transfer',
      amount: 5000000, // 50,000 INR
      signedAmount: -5000000,
      payee: 'Term Deposit Booking',
      note: 'Maturing FD booking',
      createdAt: `${startDate}T09:00:00Z`,
      updatedAt: `${startDate}T09:00:00Z`,
    });

    // Leap-Day Entry
    transactions.push({
      id: prng.nextId('txn_fam_leap'),
      userId,
      accountId: accJoint.id,
      categoryId: catMap.get('Education') || null,
      date: '2024-02-29',
      type: 'expense',
      amount: 2500000, // 25,000 INR
      signedAmount: -2500000,
      payee: 'Delhi Public School Annual Day 📚',
      note: 'Special annual day fee payment on leap day 2024-02-29',
      tags: 'education,leap-day',
      createdAt: '2024-02-29T10:00:00Z',
      updatedAt: '2024-02-29T10:00:00Z',
    });

    // Huge amount edge case: Home Loan Initial Principal disbursement record
    transactions.push({
      id: prng.nextId('txn_huge_loan'),
      userId,
      accountId: accHomeLoan.id,
      categoryId: null,
      date: startDate,
      type: 'adjustment',
      amount: 450000000, // 45,000,000 INR (4.5 Crore paise) - tests safe large ints
      signedAmount: 450000000,
      payee: 'HDFC Home Loan Disbursal',
      note: 'Initial remaining principal balance on mortgage',
      tags: 'huge_amount,loan',
      createdAt: `${startDate}T08:30:00Z`,
      updatedAt: `${startDate}T08:30:00Z`,
    });

    let stocksVal = 15000000; // 150,000 INR
    let mfVal = 20000000; // 200,000 INR

    for (let m = 0; m < months; m++) {
      const curMonthDate = addMonths(startD, m);
      const year = curMonthDate.getUTCFullYear();
      const monthNum = curMonthDate.getUTCMonth() + 1;
      const monthStr = String(monthNum).padStart(2, '0');

      // Two Earners:
      // Earner 1 Salary (160,000 INR)
      transactions.push({
        id: prng.nextId('txn_e1_sal'),
        userId,
        accountId: accEarner1.id,
        categoryId: catMap.get('Salary') || null,
        date: `${year}-${monthStr}-01`,
        type: 'income',
        amount: 16000000,
        signedAmount: 16000000,
        payee: 'Infosys Limited 💼',
        note: `Earner 1 Salary Credit ${year}-${monthStr}`,
        tags: 'salary',
        createdAt: `${year}-${monthStr}-01T09:00:00Z`,
        updatedAt: `${year}-${monthStr}-01T09:00:00Z`,
      });

      // Earner 2 Salary credited directly to Joint Account (110,000 INR)
      transactions.push({
        id: prng.nextId('txn_e2_sal'),
        userId,
        accountId: accJoint.id,
        categoryId: catMap.get('Salary') || null,
        date: `${year}-${monthStr}-01`,
        type: 'income',
        amount: 11000000,
        signedAmount: 11000000,
        payee: 'Tata Consultancy Services 💼',
        note: `Earner 2 Salary Credit ${year}-${monthStr}`,
        tags: 'salary',
        createdAt: `${year}-${monthStr}-01T09:30:00Z`,
        updatedAt: `${year}-${monthStr}-01T09:30:00Z`,
      });

      // Transfer from Earner 1 to Joint Account (100,000 INR)
      transactions.push({
        id: prng.nextId('txn_e1_pool'),
        userId,
        accountId: accEarner1.id,
        toAccountId: accJoint.id,
        categoryId: null,
        date: `${year}-${monthStr}-02`,
        type: 'transfer',
        amount: 10000000,
        signedAmount: -10000000,
        payee: 'Household Expense Pooling Transfer',
        note: 'Monthly household pool transfer',
        tags: 'transfer,family',
        createdAt: `${year}-${monthStr}-02T10:00:00Z`,
        updatedAt: `${year}-${monthStr}-02T10:00:00Z`,
      });

      // Home Loan EMI on 10th (42,000 INR from Joint Account)
      // Decreases joint account balance, reduces home loan liability
      transactions.push({
        id: prng.nextId('txn_emi_bank'),
        userId,
        accountId: accJoint.id,
        toAccountId: accHomeLoan.id,
        categoryId: null,
        date: `${year}-${monthStr}-10`,
        type: 'transfer',
        amount: 4200000, // 42,000 INR
        signedAmount: -4200000,
        payee: 'HDFC Home Loan EMI 🏠',
        note: `Home Loan EMI #${m + 1}`,
        tags: 'emi,loan',
        createdAt: `${year}-${monthStr}-10T11:00:00Z`,
        updatedAt: `${year}-${monthStr}-10T11:00:00Z`,
      });

      // School fees paid quarterly in Mar, Jun, Sep, Dec (45,000 INR)
      if ([3, 6, 9, 12].includes(monthNum)) {
        transactions.push({
          id: prng.nextId('txn_school'),
          userId,
          accountId: accJoint.id,
          categoryId: catMap.get('Education') || null,
          date: `${year}-${monthStr}-15`,
          type: 'expense',
          amount: 4500000, // 45,000 INR
          signedAmount: -4500000,
          payee: 'The National Public School 🏫',
          note: `Quarterly Tuition Fee Q${Math.ceil(monthNum / 3)}`,
          tags: 'education,school',
          createdAt: `${year}-${monthStr}-15T10:30:00Z`,
          updatedAt: `${year}-${monthStr}-15T10:30:00Z`,
        });
      }

      // Card A and Card B Spends and Payments
      transactions.push({
        id: prng.nextId('txn_fama_sp'),
        userId,
        accountId: accCardA.id,
        categoryId: catMap.get('Groceries') || null,
        date: `${year}-${monthStr}-18`,
        type: 'expense',
        amount: 2800000, // 28,000 INR
        signedAmount: -2800000,
        payee: 'பில்லா சூப்பர்மார்க்கெட் 🏪',
        note: 'Supermarket monthly provisions',
        tags: 'groceries,credit_card',
        createdAt: `${year}-${monthStr}-18T16:00:00Z`,
        updatedAt: `${year}-${monthStr}-18T16:00:00Z`,
      });

      transactions.push({
        id: prng.nextId('txn_fama_pay'),
        userId,
        accountId: accJoint.id,
        toAccountId: accCardA.id,
        categoryId: null,
        date: `${year}-${monthStr}-25`,
        type: 'transfer',
        amount: 2800000,
        signedAmount: -2800000,
        payee: 'SBI Card Bill Payment',
        note: 'Card A bill paid in full',
        tags: 'credit_card',
        createdAt: `${year}-${monthStr}-25T15:00:00Z`,
        updatedAt: `${year}-${monthStr}-25T15:00:00Z`,
      });

      // FD Maturing Inside the Range: On 2025-06-30
      if (year === 2025 && monthNum === 6) {
        // Transfer matured principal + interest back to Joint Account
        const maturityAmount = 5359000; // 50,000 principal + 3,590 interest
        transactions.push({
          id: prng.nextId('txn_fd_mature'),
          userId,
          accountId: accFDOld.id,
          toAccountId: accJoint.id,
          categoryId: null,
          date: '2025-06-30',
          type: 'transfer',
          amount: maturityAmount,
          signedAmount: -maturityAmount,
          payee: 'Fixed Deposit Maturity Proceeds 🏦',
          note: 'FD 1 Year Matured inside range - Principal + Interest credited',
          tags: 'fd,maturity',
          createdAt: '2025-06-30T16:00:00Z',
          updatedAt: '2025-06-30T16:00:00Z',
        });
      }

      // Valuations for Mutual Funds and Stocks with monthly updates
      stocksVal = Math.floor(stocksVal * (1 + (prng.nextFloat() * 0.08 - 0.03)));
      mfVal = Math.floor(mfVal * (1 + (prng.nextFloat() * 0.06 - 0.02)));

      valuations.push(
        {
          id: prng.nextId('val_stocks'),
          accountId: accStocks.id,
          date: `${year}-${monthStr}-28`,
          value: stocksVal,
          costBasis: 14000000,
          note: `Monthly stocks demat valuation ${year}-${monthStr}`,
          createdAt: `${year}-${monthStr}-28T18:00:00Z`,
          updatedAt: `${year}-${monthStr}-28T18:00:00Z`,
        },
        {
          id: prng.nextId('val_mf_fam'),
          accountId: accMF.id,
          date: `${year}-${monthStr}-28`,
          value: mfVal,
          costBasis: 18000000,
          note: `Monthly mutual fund portfolio valuation ${year}-${monthStr}`,
          createdAt: `${year}-${monthStr}-28T18:00:00Z`,
          updatedAt: `${year}-${monthStr}-28T18:00:00Z`,
        }
      );
    }
  }

  // If size === 'large', generate ~100,000 transactions for performance tests
  if (isLarge) {
    const primaryAccount = accounts[0];
    const secondaryAccount = accounts[1] || accounts[0];
    const targetCount = 100000;
    const existingCount = transactions.length;
    const needed = targetCount - existingCount;

    for (let i = 0; i < needed; i++) {
      const isExpense = prng.nextBoolean(0.8);
      const isTransfer = !isExpense && prng.nextBoolean(0.3);
      const dateStr = prng.dateBetween(startDate, anchorDate);
      const amount = prng.nextInt(5000, 250000); // 50 to 2,500 INR

      if (isTransfer) {
        transactions.push({
          id: `txn_lg_${i}`,
          userId,
          accountId: primaryAccount.id,
          toAccountId: secondaryAccount.id,
          categoryId: null,
          date: dateStr,
          type: 'transfer',
          amount,
          signedAmount: -amount,
          payee: 'Internal Transfer',
          note: `Large seed transfer ${i}`,
          tags: 'perf_test,large',
          createdAt: `${dateStr}T12:00:00Z`,
          updatedAt: `${dateStr}T12:00:00Z`,
        });
      } else if (isExpense) {
        transactions.push({
          id: `txn_lg_${i}`,
          userId,
          accountId: primaryAccount.id,
          categoryId: prng.pickOne(categories).id,
          date: dateStr,
          type: 'expense',
          amount,
          signedAmount: -amount,
          payee: prng.pickOne(METRO_PAYEES),
          note: `Large scale transaction #${i}`,
          tags: 'perf_test',
          createdAt: `${dateStr}T12:00:00Z`,
          updatedAt: `${dateStr}T12:00:00Z`,
        });
      } else {
        transactions.push({
          id: `txn_lg_${i}`,
          userId,
          accountId: primaryAccount.id,
          categoryId: catMap.get('Other income') || null,
          date: dateStr,
          type: 'income',
          amount,
          signedAmount: amount,
          payee: 'Direct Deposit Inflow',
          note: `Large scale inflow #${i}`,
          tags: 'perf_test',
          createdAt: `${dateStr}T12:00:00Z`,
          updatedAt: `${dateStr}T12:00:00Z`,
        });
      }
    }
  }

  // Sort transactions deterministically by date ASC, id ASC
  (transactions as TransactionDTO[]).sort((a, b) => {
    if (a.date !== b.date) {
      return a.date.localeCompare(b.date);
    }
    return a.id.localeCompare(b.id);
  });

  return {
    persona,
    anchorDate,
    startDate,
    userId,
    accounts,
    categories,
    transactions: transactions.map(t => ({ isRecurring: false, ...t })) as TransactionDTO[],
    valuations,
    budgets,
    recurringRules,
  };
}
