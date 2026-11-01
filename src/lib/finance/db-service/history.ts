import { and, asc, eq, isNull, or, sql } from 'drizzle-orm';
import { db, finAccounts, finTransactions, finUserSettings, finValuations } from '@src/lib/db';
import { NotFoundError } from '@src/app/api/utils';
import {
  type AccountHistoryPointDTO,
  type AccountHistoryResponseDTO,
  type NetWorthHistoryQuery,
  type NetWorthPointDTO,
  netWorthHistoryQuerySchema,
} from '../contract';
import { todayInTz, DEFAULT_TZ } from '../timezone';
import { calculateFDAccruedValue, calculateRDAccruedValue, normalizeInterestRate } from '../domain/deposits';
import type { CompoundingFrequency } from '../constants';

export async function getNetWorthHistory(
  userId: string,
  query?: NetWorthHistoryQuery
): Promise<NetWorthPointDTO[]> {
  const validated = netWorthHistoryQuerySchema.parse(query || {});

  const [settings] = await db
    .select({ timezone: finUserSettings.timezone })
    .from(finUserSettings)
    .where(eq(finUserSettings.userId, userId))
    .limit(1);
  const userTz = settings?.timezone || DEFAULT_TZ;
  const today = todayInTz(userTz);
  const endDate = validated.endDate || today;

  // If startDate is not provided, default to 30 days before endDate (or 1 year if monthly)
  let startDate = validated.startDate;
  if (!startDate) {
    const end = new Date(`${endDate}T00:00:00Z`);
    const offsetDays = validated.interval === 'monthly' ? 365 : 30;
    end.setUTCDate(end.getUTCDate() - offsetDays);
    startDate = end.toISOString().slice(0, 10);
  }

  // Ensure startDate <= endDate
  if (startDate > endDate) {
    startDate = endDate;
  }

  const intervalSql = validated.interval === 'monthly'
    ? sql`'1 month'::interval`
    : sql`'1 day'::interval`;

  const result = await db.execute<{
    date: string;
    assets: string | number;
    liabilities: string | number;
    net_worth: string | number;
  }>(sql`
    WITH date_series AS (
      SELECT d::date AS date
      FROM generate_series(
        ${startDate}::date,
        ${endDate}::date,
        ${intervalSql}
      ) AS d
    ),
    user_accounts AS (
      SELECT id, kind, class
      FROM fin_accounts
      WHERE user_id = ${userId} AND is_active = true
    ),
    daily_account_deltas AS (
      SELECT
        t.date::date AS tx_date,
        t.account_id AS account_id,
        SUM(t.signed_amount) AS delta
      FROM fin_transactions t
      WHERE t.user_id = ${userId} AND t.deleted_at IS NULL
      GROUP BY t.date::date, t.account_id

      UNION ALL

      SELECT
        t.date::date AS tx_date,
        t.to_account_id AS account_id,
        SUM(t.amount) AS delta
      FROM fin_transactions t
      WHERE t.user_id = ${userId} AND t.to_account_id IS NOT NULL AND t.type = 'transfer' AND t.deleted_at IS NULL
      GROUP BY t.date::date, t.to_account_id
    ),
    account_daily_balances AS (
      SELECT
        ds.date,
        ua.id AS account_id,
        ua.kind,
        ua.class,
        COALESCE(
          (
            SELECT SUM(delta)
            FROM daily_account_deltas dad
            WHERE dad.account_id = ua.id AND dad.tx_date <= ds.date
          ),
          0
        ) AS ledger_balance,
        (
          SELECT v.value
          FROM fin_valuations v
          WHERE v.account_id = ua.id AND v.date::date <= ds.date
          ORDER BY v.date DESC
          LIMIT 1
        ) AS latest_valuation
      FROM date_series ds
      CROSS JOIN user_accounts ua
    ),
    account_values AS (
      SELECT
        date,
        kind,
        class,
        CASE
          WHEN latest_valuation IS NOT NULL AND kind IN ('mutual_fund', 'stocks', 'fixed_deposit', 'recurring_deposit') THEN latest_valuation
          ELSE ledger_balance
        END AS effective_balance
      FROM account_daily_balances
    ),
    daily_totals AS (
      SELECT
        date,
        SUM(
          CASE
            WHEN class = 'asset' THEN GREATEST(0, effective_balance)
            ELSE 0
          END
        ) AS assets,
        SUM(
          CASE
            WHEN class = 'liability' AND kind = 'credit_card' THEN GREATEST(0, -effective_balance)
            WHEN class = 'liability' THEN GREATEST(0, effective_balance)
            ELSE 0
          END
        ) AS liabilities
      FROM account_values
      GROUP BY date
    )
    SELECT
      to_char(ds.date, 'YYYY-MM-DD') AS date,
      COALESCE(dt.assets, 0) AS assets,
      COALESCE(dt.liabilities, 0) AS liabilities,
      COALESCE(dt.assets - dt.liabilities, 0) AS net_worth
    FROM date_series ds
    LEFT JOIN daily_totals dt ON dt.date = ds.date
    ORDER BY ds.date ASC;
  `);

  const rawRows = (result as { rows?: Record<string, unknown>[] }).rows || (result as unknown as Record<string, unknown>[]);

  return rawRows.map((r: Record<string, unknown>) => ({
    date: String(r.date),
    assets: Math.round(Number(r.assets || 0)),
    liabilities: Math.round(Number(r.liabilities || 0)),
    netWorth: Math.round(Number(r.net_worth || 0)),
  }));
}

export type { AccountHistoryPointDTO, AccountHistoryResponseDTO };

export async function getAccountHistory(
  userId: string,
  accountId: string,
  options?: {
    from?: string;
    to?: string;
    preset?: string;
  }
): Promise<AccountHistoryResponseDTO> {
  const [account] = await db
    .select()
    .from(finAccounts)
    .where(and(eq(finAccounts.id, accountId), eq(finAccounts.userId, userId)))
    .limit(1);

  if (!account) {
    throw new NotFoundError(`Account not found: ${accountId}`);
  }

  const [settings] = await db
    .select({ timezone: finUserSettings.timezone })
    .from(finUserSettings)
    .where(eq(finUserSettings.userId, userId))
    .limit(1);
  const userTz = settings?.timezone || DEFAULT_TZ;
  const today = todayInTz(userTz);

  const meta = (account.metadata || {}) as Record<string, unknown>;

  // Determine earliest recorded date for this account
  const [earliestTx] = await db
    .select({ minDate: sql<string>`MIN(${finTransactions.date})` })
    .from(finTransactions)
    .where(
      and(
        eq(finTransactions.userId, userId),
        isNull(finTransactions.deletedAt),
        or(
          eq(finTransactions.accountId, accountId),
          eq(finTransactions.toAccountId, accountId)
        )!
      )
    );

  const openingDate: string =
    (meta.openingDate as string) ||
    earliestTx?.minDate ||
    (account.createdAt instanceof Date
      ? account.createdAt.toISOString().slice(0, 10)
      : String(account.createdAt).slice(0, 10));

  const endDate = options?.to || today;
  let startDate = options?.from;

  if (!startDate) {
    const preset = options?.preset || 'all';
    if (preset === '7D') {
      const endD = new Date(`${endDate}T00:00:00Z`);
      endD.setUTCDate(endD.getUTCDate() - 7);
      startDate = endD.toISOString().slice(0, 10);
    } else if (preset === '30D') {
      const endD = new Date(`${endDate}T00:00:00Z`);
      endD.setUTCDate(endD.getUTCDate() - 30);
      startDate = endD.toISOString().slice(0, 10);
    } else if (preset === '90D') {
      const endD = new Date(`${endDate}T00:00:00Z`);
      endD.setUTCDate(endD.getUTCDate() - 90);
      startDate = endD.toISOString().slice(0, 10);
    } else if (preset === '1Y') {
      const endD = new Date(`${endDate}T00:00:00Z`);
      endD.setUTCDate(endD.getUTCDate() - 365);
      startDate = endD.toISOString().slice(0, 10);
    } else {
      // Default: 'all' -> start from openingDate
      startDate = openingDate;
    }
  }

  // Ensure start <= end
  if (startDate > endDate) {
    startDate = endDate;
  }

  const isLiability = account.class === 'liability';

  // Compute Current Balance directly from DB for invariant check
  const [srcSum] = await db
    .select({ total: sql<string>`COALESCE(SUM(${finTransactions.signedAmount}), 0)` })
    .from(finTransactions)
    .where(
      and(
        eq(finTransactions.userId, userId),
        eq(finTransactions.accountId, accountId),
        isNull(finTransactions.deletedAt)
      )
    );

  const [tgtSum] = await db
    .select({ total: sql<string>`COALESCE(SUM(${finTransactions.amount}), 0)` })
    .from(finTransactions)
    .where(
      and(
        eq(finTransactions.userId, userId),
        eq(finTransactions.toAccountId, accountId),
        eq(finTransactions.type, 'transfer'),
        isNull(finTransactions.deletedAt)
      )
    );

  let currentBalance = Number(srcSum?.total || 0) + Number(tgtSum?.total || 0);
  const currentOutstanding = isLiability ? Math.max(0, -currentBalance) : 0;

  let history: AccountHistoryPointDTO[] = [];

  if (account.kind === 'mutual_fund' || account.kind === 'stocks') {
    // Investment valuations series
    const valRows = await db
      .select({
        date: finValuations.date,
        value: finValuations.value,
      })
      .from(finValuations)
      .where(and(eq(finValuations.accountId, accountId), sql`${finValuations.date} <= ${endDate}`))
      .orderBy(asc(finValuations.date));

    const result = await db.execute<{
      date: string;
    }>(sql`
      SELECT to_char(d::date, 'YYYY-MM-DD') AS date
      FROM generate_series(${startDate}::date, ${endDate}::date, '1 day'::interval) AS d
      ORDER BY d::date ASC
    `);

    const dateList = ((result as { rows?: Record<string, unknown>[] }).rows || (result as unknown as Record<string, unknown>[])).map(
      (r) => String(r.date)
    );

    const valDateMap = new Set(valRows.map((v) => v.date));
    let latestVal = valRows.length > 0 ? Number(valRows[0].value) : currentBalance;

    history = dateList.map((d) => {
      // Find latest valuation on or before date d
      for (const v of valRows) {
        if (v.date <= d) {
          latestVal = Number(v.value);
        }
      }
      return {
        date: d,
        balance: latestVal,
        outstanding: 0,
        hasActivity: valDateMap.has(d),
      };
    });

    if (valRows.length > 0) {
      currentBalance = Number(valRows[valRows.length - 1].value);
    }
  } else if (account.kind === 'fixed_deposit' || account.kind === 'recurring_deposit') {
    // Deposits: generate date series
    const result = await db.execute<{
      date: string;
    }>(sql`
      SELECT to_char(d::date, 'YYYY-MM-DD') AS date
      FROM generate_series(${startDate}::date, ${endDate}::date, '1 day'::interval) AS d
      ORDER BY d::date ASC
    `);

    const dateList = ((result as { rows?: Record<string, unknown>[] }).rows || (result as unknown as Record<string, unknown>[])).map(
      (r) => String(r.date)
    );

    const rawRate = Number(meta.interestRate ?? meta.rate ?? 0.07);
    const normRate = normalizeInterestRate(rawRate);
    const compoundingFrequency = (meta.compoundingFrequency ?? 'quarterly') as CompoundingFrequency;
    const depStartDate = (meta.startDate as string) || openingDate;

    if (account.kind === 'fixed_deposit') {
      const principal = Number(meta.principalPaise ?? meta.depositAmount ?? currentBalance);
      history = dateList.map((d) => {
        let val = principal;
        if (d >= depStartDate) {
          val = calculateFDAccruedValue({
            principal,
            annualInterestRate: normRate,
            compoundingFrequency,
            startDate: depStartDate,
            maturityDate: meta.maturityDate as string | undefined,
            asOfDate: d,
          });
        }
        return {
          date: d,
          balance: val,
          outstanding: 0,
          hasActivity: d === depStartDate,
        };
      });
      if (history.length > 0) {
        currentBalance = history[history.length - 1].balance;
      }
    } else {
      // Recurring deposit
      const installment = Number(meta.monthlyInstallmentPaise ?? meta.installmentPaise ?? currentBalance);
      const tenure = Number(meta.tenureMonths || 12);
      history = dateList.map((d) => {
        let val = installment;
        if (d >= depStartDate) {
          val = calculateRDAccruedValue({
            monthlyInstallment: installment,
            annualInterestRate: normRate,
            startDate: depStartDate,
            tenureMonths: tenure,
            asOfDate: d,
          });
        }
        return {
          date: d,
          balance: val,
          outstanding: 0,
          hasActivity: d === depStartDate,
        };
      });
      if (history.length > 0) {
        currentBalance = history[history.length - 1].balance;
      }
    }
  } else {
    // Bank, Cash, Credit Card, Loan, Other Asset/Liability:
    // Generate daily continuous series using generate_series and cumulative sums
    const result = await db.execute<{
      date: string;
      cumulative_balance: string | number;
      has_activity: boolean;
    }>(sql`
      WITH date_series AS (
        SELECT d::date AS date
        FROM generate_series(
          ${startDate}::date,
          ${endDate}::date,
          '1 day'::interval
        ) AS d
      ),
      daily_deltas AS (
        SELECT
          t.date::date AS tx_date,
          SUM(t.signed_amount) AS delta,
          COUNT(*) AS tx_count
        FROM fin_transactions t
        WHERE t.user_id = ${userId}
          AND t.account_id = ${accountId}
          AND t.deleted_at IS NULL
        GROUP BY t.date::date

        UNION ALL

        SELECT
          t.date::date AS tx_date,
          SUM(t.amount) AS delta,
          COUNT(*) AS tx_count
        FROM fin_transactions t
        WHERE t.user_id = ${userId}
          AND t.to_account_id = ${accountId}
          AND t.type = 'transfer'
          AND t.deleted_at IS NULL
        GROUP BY t.date::date
      ),
      aggregated_daily AS (
        SELECT
          tx_date,
          SUM(delta) AS delta,
          SUM(tx_count) AS tx_count
        FROM daily_deltas
        GROUP BY tx_date
      )
      SELECT
        to_char(ds.date, 'YYYY-MM-DD') AS date,
        COALESCE(
          (
            SELECT SUM(ad.delta)
            FROM aggregated_daily ad
            WHERE ad.tx_date <= ds.date
          ),
          0
        ) AS cumulative_balance,
        COALESCE(
          (
            SELECT ad.tx_count > 0
            FROM aggregated_daily ad
            WHERE ad.tx_date = ds.date
          ),
          false
        ) AS has_activity
      FROM date_series ds
      ORDER BY ds.date ASC;
    `);

    const rawRows = ((result as { rows?: Record<string, unknown>[] }).rows || (result as unknown as Record<string, unknown>[]));

    history = rawRows.map((r) => {
      const bal = Math.round(Number(r.cumulative_balance || 0));
      return {
        date: String(r.date),
        balance: bal,
        outstanding: isLiability ? Math.max(0, -bal) : 0,
        hasActivity: Boolean(r.has_activity),
      };
    });
  }

  // Enforce Invariant: last point must equal account's current balance (or outstanding)
  const lastPoint = history[history.length - 1];
  let isMismatch = false;

  if (lastPoint) {
    if (isLiability) {
      if (lastPoint.outstanding !== currentOutstanding) {
        isMismatch = true;
        console.error(
          `[Invariant Mismatch] Account ${accountId} (${account.name}): last point outstanding (${lastPoint.outstanding}) !== current outstanding (${currentOutstanding})`
        );
      }
    } else {
      if (lastPoint.balance !== currentBalance) {
        isMismatch = true;
        console.error(
          `[Invariant Mismatch] Account ${accountId} (${account.name}): last point balance (${lastPoint.balance}) !== current balance (${currentBalance})`
        );
      }
    }
  }

  return {
    accountId,
    accountName: account.name,
    kind: account.kind,
    class: account.class,
    currency: account.currency,
    openingDate,
    currentBalance,
    currentOutstanding,
    isMismatch,
    history,
  };
}
