import { sql } from 'drizzle-orm';
import { db } from '@src/lib/db';
import {
  type NetWorthHistoryQuery,
  type NetWorthPointDTO,
  netWorthHistoryQuerySchema,
} from '../contract';

export async function getNetWorthHistory(
  userId: string,
  query?: NetWorthHistoryQuery
): Promise<NetWorthPointDTO[]> {
  const validated = netWorthHistoryQuerySchema.parse(query || {});

  const today = new Date().toISOString().slice(0, 10);
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
