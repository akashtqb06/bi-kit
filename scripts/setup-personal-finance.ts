import readline from 'node:readline';
import { eq, and } from 'drizzle-orm';
import { db } from '@src/lib/db';
import { users } from '@src/lib/db/schema';
import { finAccounts, finTransactions } from '@src/lib/db/schema/finance';
import { newId } from '@src/lib/db/id';
import { hashPassword } from '@src/lib/auth/password';
import { seedSystemCategories } from './seed/system-categories';
import { runMigrations } from '@src/lib/db/migrate';

interface AccountConfig {
  name: string;
  kind: 'bank' | 'cash' | 'credit_card';
  balanceRupees: number;
  creditLimitRupees?: number;
}

function prompt(rl: readline.Interface, question: string, defaultVal = ''): Promise<string> {
  return new Promise((resolve) => {
    const q = defaultVal ? `${question} [${defaultVal}]: ` : `${question}: `;
    rl.question(q, (answer) => {
      resolve(answer.trim() || defaultVal);
    });
  });
}

function parseCliArgs() {
  const args = process.argv.slice(2);
  const result: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      const val = args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : 'true';
      result[key] = val;
      if (val !== 'true') i++;
    }
  }
  return result;
}

export async function setupPersonalFinance() {
  console.log('\n========================================================');
  console.log('   BI Kit — Personal Finance Local Setup & Onboarding');
  console.log('========================================================\n');

  // Step 1: Ensure migrations are up to date
  console.log('⏳ Checking database schema and migrations...');
  await runMigrations();
  console.log('✅ Database schema verified.');

  // Step 2: Ensure default categories exist
  await seedSystemCategories();

  // Step 3: Get User Details
  const cli = parseCliArgs();
  const isInteractive = process.stdin.isTTY && !cli.email && !process.env.FINANCE_USER_EMAIL;

  let email = cli.email || process.env.FINANCE_USER_EMAIL || '';
  let password = cli.password || process.env.FINANCE_USER_PASSWORD || '';
  let name = cli.name || process.env.FINANCE_USER_NAME || 'Personal Account';

  const accountsToCreate: AccountConfig[] = [];

  if (isInteractive) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.log('\n--- 1. User Account ---');
    email = await prompt(rl, 'Enter your login email', 'user@local.com');
    password = await prompt(rl, 'Enter your password', 'Password123!');
    name = await prompt(rl, 'Enter your display name', 'Personal Account');

    console.log('\n--- 2. Bank Account Details ---');
    const hasBank = await prompt(rl, 'Do you want to add a bank account now? (y/n)', 'y');
    if (hasBank.toLowerCase() === 'y') {
      const bankName = await prompt(rl, 'Bank Name (e.g. HDFC Bank, Chase, SBI)', 'Main Bank Account');
      const bankBalanceStr = await prompt(rl, 'Current Available Balance (₹ / currency amount)', '0');
      const bankBalance = parseFloat(bankBalanceStr) || 0;
      accountsToCreate.push({
        name: bankName,
        kind: 'bank',
        balanceRupees: bankBalance,
      });
    }

    console.log('\n--- 3. Cash Details ---');
    const hasCash = await prompt(rl, 'Do you want to add cash in hand? (y/n)', 'y');
    if (hasCash.toLowerCase() === 'y') {
      const cashBalanceStr = await prompt(rl, 'Current Cash in Hand (₹ / currency amount)', '0');
      const cashBalance = parseFloat(cashBalanceStr) || 0;
      accountsToCreate.push({
        name: 'Cash in Hand',
        kind: 'cash',
        balanceRupees: cashBalance,
      });
    }

    console.log('\n--- 4. Credit Card (Optional) ---');
    const hasCard = await prompt(rl, 'Do you want to add a credit card? (y/n)', 'n');
    if (hasCard.toLowerCase() === 'y') {
      const cardName = await prompt(rl, 'Card Name (e.g. Amazon Pay ICICI)', 'Credit Card');
      const cardOutstandingStr = await prompt(rl, 'Current Outstanding Balance (amount owed, e.g. 5000)', '0');
      const cardLimitStr = await prompt(rl, 'Credit Limit (e.g. 100000)', '50000');
      accountsToCreate.push({
        name: cardName,
        kind: 'credit_card',
        balanceRupees: -(parseFloat(cardOutstandingStr) || 0),
        creditLimitRupees: parseFloat(cardLimitStr) || 50000,
      });
    }

    rl.close();
  } else {
    // Non-interactive / CLI mode
    if (!email) email = 'user@local.com';
    if (!password) password = 'Password123!';

    if (cli['bank-name'] || cli['bank-balance']) {
      accountsToCreate.push({
        name: cli['bank-name'] || 'Main Bank Account',
        kind: 'bank',
        balanceRupees: parseFloat(cli['bank-balance'] || '0') || 0,
      });
    }

    if (cli['cash-balance']) {
      accountsToCreate.push({
        name: 'Cash in Hand',
        kind: 'cash',
        balanceRupees: parseFloat(cli['cash-balance'] || '0') || 0,
      });
    }
  }

  // Step 4: Upsert user
  const normalizedEmail = email.trim().toLowerCase();
  const passwordHash = await hashPassword(password);
  const now = new Date();

  let userId: string;
  const [existingUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  if (existingUser) {
    userId = existingUser.id;
    await db
      .update(users)
      .set({
        name,
        passwordHash,
        updatedAt: now,
      })
      .where(eq(users.id, userId));
    console.log(`\n👤 Updated existing user: ${normalizedEmail}`);
  } else {
    userId = newId();
    await db.insert(users).values({
      id: userId,
      email: normalizedEmail,
      name,
      passwordHash,
      role: 'admin',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });
    console.log(`\n👤 Created admin user: ${normalizedEmail}`);
  }

  // Step 5: Create accounts and opening balances
  console.log('\n🏦 Setting up accounts...');
  const todayStr = now.toISOString().slice(0, 10);

  for (const acc of accountsToCreate) {
    const isLiability = acc.kind === 'credit_card';
    const accountClass = isLiability ? 'liability' : 'asset';
    const limitPaise = acc.creditLimitRupees ? Math.round(acc.creditLimitRupees * 100) : null;

    // Check if account already exists with same name for this user
    const [existingAccount] = await db
      .select({ id: finAccounts.id })
      .from(finAccounts)
      .where(and(eq(finAccounts.userId, userId), eq(finAccounts.name, acc.name)))
      .limit(1);

    let accountId = existingAccount?.id;

    if (!accountId) {
      accountId = newId();
      await db.insert(finAccounts).values({
        id: accountId,
        userId,
        name: acc.name,
        kind: acc.kind,
        class: accountClass,
        currency: 'INR',
        creditLimit: limitPaise,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
      console.log(`   + Created account: ${acc.name} (${acc.kind})`);
    } else {
      console.log(`   • Existing account found: ${acc.name}`);
    }

    // Add initial balance transaction if non-zero
    if (acc.balanceRupees !== 0) {
      const balancePaise = Math.round(acc.balanceRupees * 100);
      const absAmountPaise = Math.abs(balancePaise);

      // Check if opening balance transaction already exists
      const [existingTx] = await db
        .select({ id: finTransactions.id })
        .from(finTransactions)
        .where(
          and(
            eq(finTransactions.userId, userId),
            eq(finTransactions.accountId, accountId),
            eq(finTransactions.payee, 'Opening Balance')
          )
        )
        .limit(1);

      if (!existingTx) {
        await db.insert(finTransactions).values({
          id: newId(),
          userId,
          accountId,
          date: todayStr,
          type: 'adjustment',
          amount: absAmountPaise,
          signedAmount: balancePaise,
          payee: 'Opening Balance',
          note: `Starting balance recorded on ${todayStr}`,
          createdAt: now,
          updatedAt: now,
        });
        console.log(`     ↳ Opening balance recorded: ₹${acc.balanceRupees.toLocaleString('en-IN')}`);
      }
    }
  }

  console.log('\n========================================================');
  console.log('   🎉 Setup Complete! You are ready to start tracking.');
  console.log('========================================================');
  console.log(`\n• Login Email:    ${normalizedEmail}`);
  console.log(`• Web App URL:    http://localhost:3000/finance/overview`);
  console.log(`• Accounts Page:  http://localhost:3000/finance/accounts`);
  console.log(`• Recurring Page: http://localhost:3000/finance/recurring`);
  console.log('\nYou can add more bank accounts, cash, or credit cards anytime directly in the UI or by running this script again!\n');
}

if (process.argv[1]?.endsWith('setup-personal-finance.ts')) {
  setupPersonalFinance()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('\n❌ Setup failed:', err);
      process.exit(1);
    });
}

