import type { FinanceVirtualTableName } from './catalog';

/**
 * Generates the parameterized SQL subquery template for a given virtual table.
 *
 * Every template:
 * - Scopes strictly to user_id = ${userIdParam} (e.g. '$1')
 * - Filters out soft-deleted transactions (deleted_at IS NULL)
 * - Converts integer paise minor units to fractional rupees (numeric / 100.0)
 * - Exposes exact column schemas per docs/finance/CONTRACT.md
 */
export function getVirtualTableTemplate(
    tableName: FinanceVirtualTableName,
    userIdParam = '$1'
): string {
    switch (tableName) {
        case 'transactions':
            return `SELECT
    t.id,
    t.date,
    EXTRACT(YEAR FROM t.date)::integer AS year,
    EXTRACT(MONTH FROM t.date)::integer AS month,
    DATE_TRUNC('month', t.date)::date AS month_start,
    EXTRACT(DOW FROM t.date)::integer AS weekday,
    t.type,
    ROUND(t.amount::numeric / 100.0, 2) AS amount,
    ROUND(t.signed_amount::numeric / 100.0, 2) AS signed_amount,
    t.account_id,
    a.name AS account_name,
    a.kind AS account_kind,
    t.to_account_id,
    t.category_id,
    COALESCE(c.name, 'Uncategorized') AS category,
    c.color AS category_color,
    pc.name AS parent_category,
    t.payee,
    t.note,
    t.tags
FROM fin_transactions t
JOIN fin_accounts a ON a.id = t.account_id
LEFT JOIN fin_categories c ON c.id = t.category_id
LEFT JOIN fin_categories pc ON pc.id = c.parent_id
WHERE t.user_id = ${userIdParam} AND t.deleted_at IS NULL`;

        case 'accounts':
            return `SELECT
    a.id,
    a.name,
    a.kind,
    a.class,
    a.currency,
    a.is_active,
    ROUND(a.credit_limit::numeric / 100.0, 2) AS credit_limit,
    a.created_at,
    a.updated_at
FROM fin_accounts a
WHERE a.user_id = ${userIdParam}`;

        case 'account_balances':
            return `WITH tx_deltas AS (
    SELECT account_id, signed_amount AS delta
    FROM fin_transactions
    WHERE user_id = ${userIdParam} AND deleted_at IS NULL
    UNION ALL
    SELECT to_account_id AS account_id, amount AS delta
    FROM fin_transactions
    WHERE user_id = ${userIdParam} AND deleted_at IS NULL AND to_account_id IS NOT NULL AND type = 'transfer'
),
balances AS (
    SELECT account_id, COALESCE(SUM(delta), 0) AS balance_paise
    FROM tx_deltas
    GROUP BY account_id
),
latest_valuations AS (
    SELECT DISTINCT ON (account_id) account_id, value AS val_paise
    FROM fin_valuations
    ORDER BY account_id, date DESC, created_at DESC
),
transfers_in AS (
    SELECT to_account_id AS account_id, COALESCE(SUM(amount), 0) AS total_in
    FROM fin_transactions
    WHERE user_id = ${userIdParam} AND deleted_at IS NULL AND type = 'transfer' AND to_account_id IS NOT NULL
    GROUP BY to_account_id
),
transfers_out AS (
    SELECT account_id, COALESCE(SUM(amount), 0) AS total_out
    FROM fin_transactions
    WHERE user_id = ${userIdParam} AND deleted_at IS NULL AND type = 'transfer'
    GROUP BY account_id
)
SELECT
    a.id AS account_id,
    a.name,
    a.kind,
    a.class,
    ROUND(COALESCE(b.balance_paise, 0)::numeric / 100.0, 2) AS balance,
    ROUND(
        CASE
            WHEN a.kind = 'credit_card' THEN GREATEST(0.0, -COALESCE(b.balance_paise, 0)::numeric / 100.0)
            WHEN a.class = 'liability' THEN GREATEST(0.0, COALESCE(b.balance_paise, 0)::numeric / 100.0)
            ELSE 0.0
        END, 2
    ) AS outstanding,
    ROUND(COALESCE(a.credit_limit, 0)::numeric / 100.0, 2) AS credit_limit,
    ROUND(
        CASE
            WHEN a.kind = 'credit_card' AND COALESCE(a.credit_limit, 0) > 0 THEN
                LEAST(1.0, GREATEST(0.0, (-COALESCE(b.balance_paise, 0)::numeric) / a.credit_limit::numeric))
            ELSE 0.0
        END, 4
    ) AS utilization,
    ROUND(
        CASE
            WHEN a.kind IN ('mutual_fund', 'stocks') THEN
                COALESCE(lv.val_paise, b.balance_paise, 0)::numeric / 100.0
            ELSE
                COALESCE(b.balance_paise, 0)::numeric / 100.0
        END, 2
    ) AS current_value,
    ROUND(
        CASE
            WHEN a.kind IN ('mutual_fund', 'stocks') THEN
                (COALESCE(tin.total_in, 0) - COALESCE(tout.total_out, 0))::numeric / 100.0
            ELSE
                COALESCE(b.balance_paise, 0)::numeric / 100.0
        END, 2
    ) AS contributions,
    ROUND(
        CASE
            WHEN a.kind IN ('mutual_fund', 'stocks') THEN
                (COALESCE(lv.val_paise, b.balance_paise, 0) - (COALESCE(tin.total_in, 0) - COALESCE(tout.total_out, 0)))::numeric / 100.0
            ELSE 0.0
        END, 2
    ) AS gain
FROM fin_accounts a
LEFT JOIN balances b ON b.account_id = a.id
LEFT JOIN latest_valuations lv ON lv.account_id = a.id
LEFT JOIN transfers_in tin ON tin.account_id = a.id
LEFT JOIN transfers_out tout ON tout.account_id = a.id
WHERE a.user_id = ${userIdParam}`;

        case 'balance_history':
            return `WITH bounds AS (
    SELECT
        COALESCE(
            LEAST(
                (SELECT MIN(date) FROM fin_transactions WHERE user_id = ${userIdParam} AND deleted_at IS NULL),
                (SELECT MIN(created_at::date) FROM fin_accounts WHERE user_id = ${userIdParam}),
                CURRENT_DATE
            ),
            CURRENT_DATE
        ) AS start_date,
        CURRENT_DATE AS end_date
),
calendar AS (
    SELECT d::date AS date
    FROM bounds,
    LATERAL generate_series(bounds.start_date::timestamp, bounds.end_date::timestamp, '1 day'::interval) AS d
),
daily_deltas AS (
    SELECT
        account_id,
        tx_date,
        SUM(delta) AS delta_paise
    FROM (
        SELECT account_id, date AS tx_date, signed_amount AS delta
        FROM fin_transactions
        WHERE user_id = ${userIdParam} AND deleted_at IS NULL
        UNION ALL
        SELECT to_account_id AS account_id, date AS tx_date, amount AS delta
        FROM fin_transactions
        WHERE user_id = ${userIdParam} AND deleted_at IS NULL AND to_account_id IS NOT NULL AND type = 'transfer'
    ) tx
    GROUP BY account_id, tx_date
),
account_days AS (
    SELECT
        c.date,
        a.id AS account_id,
        a.kind,
        a.class,
        SUM(COALESCE(dd.delta_paise, 0)) OVER (
            PARTITION BY a.id
            ORDER BY c.date
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS cum_paise
    FROM calendar c
    CROSS JOIN fin_accounts a
    LEFT JOIN daily_deltas dd ON dd.account_id = a.id AND dd.tx_date = c.date
    WHERE a.user_id = ${userIdParam}
)
SELECT
    ad.date,
    ad.account_id,
    ROUND(ad.cum_paise::numeric / 100.0, 2) AS balance,
    ROUND(
        CASE
            WHEN ad.kind IN ('mutual_fund', 'stocks') THEN
                COALESCE(
                    (SELECT v.value
                     FROM fin_valuations v
                     WHERE v.account_id = ad.account_id AND v.date <= ad.date
                     ORDER BY v.date DESC, v.created_at DESC
                     LIMIT 1),
                    ad.cum_paise
                )::numeric / 100.0
            ELSE
                ad.cum_paise::numeric / 100.0
        END, 2
    ) AS value
FROM account_days ad`;

        case 'net_worth_history':
            return `WITH bounds AS (
    SELECT
        COALESCE(
            LEAST(
                (SELECT MIN(date) FROM fin_transactions WHERE user_id = ${userIdParam} AND deleted_at IS NULL),
                (SELECT MIN(created_at::date) FROM fin_accounts WHERE user_id = ${userIdParam}),
                CURRENT_DATE
            ),
            CURRENT_DATE
        ) AS start_date,
        CURRENT_DATE AS end_date
),
calendar AS (
    SELECT d::date AS date
    FROM bounds,
    LATERAL generate_series(bounds.start_date::timestamp, bounds.end_date::timestamp, '1 day'::interval) AS d
),
daily_deltas AS (
    SELECT
        account_id,
        tx_date,
        SUM(delta) AS delta_paise
    FROM (
        SELECT account_id, date AS tx_date, signed_amount AS delta
        FROM fin_transactions
        WHERE user_id = ${userIdParam} AND deleted_at IS NULL
        UNION ALL
        SELECT to_account_id AS account_id, date AS tx_date, amount AS delta
        FROM fin_transactions
        WHERE user_id = ${userIdParam} AND deleted_at IS NULL AND to_account_id IS NOT NULL AND type = 'transfer'
    ) tx
    GROUP BY account_id, tx_date
),
account_days AS (
    SELECT
        c.date,
        a.id AS account_id,
        a.kind,
        a.class,
        SUM(COALESCE(dd.delta_paise, 0)) OVER (
            PARTITION BY a.id
            ORDER BY c.date
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS cum_paise
    FROM calendar c
    CROSS JOIN fin_accounts a
    LEFT JOIN daily_deltas dd ON dd.account_id = a.id AND dd.tx_date = c.date
    WHERE a.user_id = ${userIdParam}
),
valued_days AS (
    SELECT
        ad.date,
        ad.class,
        ad.kind,
        ad.cum_paise::numeric / 100.0 AS balance,
        CASE
            WHEN ad.kind IN ('mutual_fund', 'stocks') THEN
                COALESCE(
                    (SELECT v.value
                     FROM fin_valuations v
                     WHERE v.account_id = ad.account_id AND v.date <= ad.date
                     ORDER BY v.date DESC, v.created_at DESC
                     LIMIT 1),
                    ad.cum_paise
                )::numeric / 100.0
            ELSE
                ad.cum_paise::numeric / 100.0
        END AS val
    FROM account_days ad
)
SELECT
    vd.date,
    ROUND(COALESCE(SUM(CASE WHEN vd.class = 'asset' THEN vd.val ELSE 0.0 END), 0.0), 2) AS assets,
    ROUND(
        COALESCE(
            SUM(
                CASE
                    WHEN vd.class = 'liability' THEN
                        CASE WHEN vd.kind = 'credit_card' THEN GREATEST(0.0, -vd.balance)
                        ELSE GREATEST(0.0, vd.balance)
                        END
                    ELSE 0.0
                END
            ), 0.0
        ), 2
    ) AS liabilities,
    ROUND(
        COALESCE(SUM(CASE WHEN vd.class = 'asset' THEN vd.val ELSE 0.0 END), 0.0) -
        COALESCE(
            SUM(
                CASE
                    WHEN vd.class = 'liability' THEN
                        CASE WHEN vd.kind = 'credit_card' THEN GREATEST(0.0, -vd.balance)
                        ELSE GREATEST(0.0, vd.balance)
                        END
                    ELSE 0.0
                END
            ), 0.0
        ), 2
    ) AS net_worth
FROM valued_days vd
GROUP BY vd.date
ORDER BY vd.date ASC`;

        case 'categories':
            return `SELECT
    c.id,
    c.name,
    c.type,
    c.color AS category_color,
    c.parent_id,
    c.is_system
FROM fin_categories c
WHERE c.user_id = ${userIdParam} OR (c.user_id IS NULL AND c.is_system = TRUE)`;

        case 'budgets':
            return `SELECT
    b.id,
    b.category_id,
    ROUND(b.amount::numeric / 100.0, 2) AS amount,
    b.period,
    b.start_date
FROM fin_budgets b
WHERE b.user_id = ${userIdParam}`;

        case 'budget_progress':
            return `WITH user_budgets AS (
    SELECT
        b.id AS budget_id,
        b.category_id,
        c.name AS category_name,
        c.color AS category_color,
        b.period,
        ROUND(b.amount::numeric / 100.0, 2) AS budgeted_amount,
        b.start_date,
        CASE
            WHEN b.period = 'monthly' THEN DATE_TRUNC('month', CURRENT_DATE)::date
            WHEN b.period = 'quarterly' THEN DATE_TRUNC('quarter', CURRENT_DATE)::date
            WHEN b.period = 'yearly' THEN DATE_TRUNC('year', CURRENT_DATE)::date
            ELSE b.start_date
        END AS period_start,
        CASE
            WHEN b.period = 'monthly' THEN (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::date
            WHEN b.period = 'quarterly' THEN (DATE_TRUNC('quarter', CURRENT_DATE) + INTERVAL '3 months - 1 day')::date
            WHEN b.period = 'yearly' THEN (DATE_TRUNC('year', CURRENT_DATE) + INTERVAL '1 year - 1 day')::date
            ELSE (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::date
        END AS period_end
    FROM fin_budgets b
    JOIN fin_categories c ON c.id = b.category_id
    WHERE b.user_id = ${userIdParam}
),
spent AS (
    SELECT
        ub.budget_id,
        COALESCE(ROUND(SUM(t.amount)::numeric / 100.0, 2), 0.0) AS spent_amount
    FROM user_budgets ub
    LEFT JOIN fin_transactions t ON t.category_id = ub.category_id
        AND t.user_id = ${userIdParam}
        AND t.deleted_at IS NULL
        AND t.type = 'expense'
        AND t.date >= ub.period_start
        AND t.date <= ub.period_end
    GROUP BY ub.budget_id
)
SELECT
    ub.budget_id,
    ub.category_id,
    ub.category_name,
    ub.category_color,
    ub.period,
    ub.budgeted_amount,
    COALESCE(s.spent_amount, 0.0) AS spent_amount,
    GREATEST(0.0, ub.budgeted_amount - COALESCE(s.spent_amount, 0.0)) AS remaining_amount,
    ROUND(
        CASE
            WHEN ub.budgeted_amount > 0 THEN (COALESCE(s.spent_amount, 0.0) / ub.budgeted_amount) * 100.0
            ELSE 0.0
        END, 2
    ) AS percentage_used
FROM user_budgets ub
LEFT JOIN spent s ON s.budget_id = ub.budget_id`;
    }
}

