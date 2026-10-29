-- ============================================================================
-- Virtual Table SQL Template: budget_progress
-- Single Source of Truth for Session S3 (Data Source Connectors & Virtual Tables)
--
-- Exposes budget spending and progress against monthly, quarterly, and yearly targets.
--
-- Rules:
-- 1. Strict tenant scoping via user_id = $1
-- 2. Soft-deleted transactions (deleted_at IS NOT NULL) are strictly excluded
-- 3. Transfers (type = 'transfer') are NEVER counted toward category spending
-- 4. Net spent = Expenses in category minus Refunds/Credits (income with same category)
-- 5. Amounts are converted from integer paise to fractional rupees (numeric / 100.0)
-- 6. Output columns conform strictly to CONTRACT.md Section 6.8
-- ============================================================================

WITH user_budgets AS (
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
    WHERE b.user_id = $1
),
category_spend AS (
    SELECT
        ub.budget_id,
        GREATEST(
            0.0,
            COALESCE(
                ROUND(
                    (
                        -- Sum of expenses
                        COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END), 0) -
                        -- Minus refunds / credits tagged with the category
                        COALESCE(SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE 0 END), 0)
                    )::numeric / 100.0,
                    2
                ),
                0.0
            )
        ) AS net_spent_amount
    FROM user_budgets ub
    LEFT JOIN fin_transactions t ON t.category_id = ub.category_id
        AND t.user_id = $1
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
LEFT JOIN category_spend cs ON cs.budget_id = ub.budget_id;
