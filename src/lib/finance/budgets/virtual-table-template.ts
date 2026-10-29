/**
 * Parameterized SQL template for the `budget_progress` virtual table.
 * Exported for Session S3 (Data Source Connectors & Virtual Tables) to register in the catalog.
 *
 * Scopes strictly to user_id = ${userIdParam} (defaults to '$1').
 * Excludes soft-deleted transactions and handles refunds as offsets while strictly
 * ignoring transfers.
 */
export function getBudgetProgressVirtualTableTemplate(userIdParam = '$1'): string {
  return `WITH user_budgets AS (
    SELECT
        b.id AS budget_id,
        b.category_id,
        c.name AS category_name,
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
category_spend AS (
    SELECT
        ub.budget_id,
        GREATEST(
            0.0,
            COALESCE(
                ROUND(
                    (
                        COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END), 0) -
                        COALESCE(SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE 0 END), 0)
                    )::numeric / 100.0,
                    2
                ),
                0.0
            )
        ) AS net_spent_amount
    FROM user_budgets ub
    LEFT JOIN fin_transactions t ON t.category_id = ub.category_id
        AND t.user_id = ${userIdParam}
        AND t.deleted_at IS NULL
        AND t.type IN ('expense', 'income')
        AND t.date >= ub.period_start
        AND t.date <= ub.period_end
    GROUP BY ub.budget_id
)
SELECT
    ub.budget_id,
    ub.category_id,
    ub.category_name,
    ub.period,
    ub.budgeted_amount,
    COALESCE(cs.net_spent_amount, 0.0) AS spent_amount,
    GREATEST(0.0, ub.budgeted_amount - COALESCE(cs.net_spent_amount, 0.0)) AS remaining_amount,
    ROUND(
        CASE
            WHEN ub.budgeted_amount > 0 THEN (COALESCE(cs.net_spent_amount, 0.0) / ub.budgeted_amount) * 100.0
            ELSE 0.0
        END,
        2
    ) AS percentage_used
FROM user_budgets ub
LEFT JOIN category_spend cs ON cs.budget_id = ub.budget_id`;
}
