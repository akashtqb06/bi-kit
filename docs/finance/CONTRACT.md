# Finance Module Contract (v1)

This document is the **single source of truth** for all parallel sessions building the Personal Finance module in BI Kit. All types, database schemas, API routes, calculation rules, and data contracts MUST conform to this specification.

---

## 1. Core Conventions

- **Money Representation**:
  - All currency values are stored as **integer minor units** (paise for INR, 1 INR = 100 paise) in PostgreSQL `bigint` columns.
  - In TypeScript DTOs, API payloads, and calculation logic, money values are JavaScript safe integers (`number`, integer minor units). For amounts exceeding $2^{53}-1$ or fractional paise, strict integer truncation applies.
  - Virtual tables for dashboard / BI reporting expose amounts in fractional rupees (`numeric(15, 2)` or `FLOAT` in SQL views/connectors: `paise / 100.0`), but internal ledger and transactions always use integer paise.
- **Currency**:
  - Default currency is `'INR'`.
  - Currency is stored per account (`fin_accounts.currency`, ISO 4217 code).
  - Version 1 does NOT perform foreign exchange (FX) conversion. Transfers between accounts of different currencies are forbidden in v1.
- **Dates**:
  - Dates are plain calendar dates (`DATE`, formatted as ISO `YYYY-MM-DD`).
  - The client provides the user's local date (`YYYY-MM-DD`).
  - Timestamps (`createdAt`, `updatedAt`, `deletedAt`) are stored as UTC `TIMESTAMPTZ`.
- **Identifiers**:
  - Primary keys and external IDs use URL-safe nanoid strings (length 21, or matching BI Kit nanoid helper `nanoid()`).
- **Soft Delete**:
  - Transactions use soft delete via `deletedAt: TIMESTAMPTZ | null`.
  - Queries, balances, and reports exclude records where `deletedAt IS NOT NULL` by default.
  - Accounts and categories use `isActive: boolean` flag.

---

## 2. Account Kinds, Classes & Hierarchy

### 2.1 Account Classes
Every account belongs to exactly one `class`:
1. `asset`: Positive balances represent user assets (Cash, Bank, FD, RD, Mutual Funds, Stocks, Other Assets).
2. `liability`: Positive debt or owed amounts represent user liabilities (Credit Card, Loan, Other Liabilities).

### 2.2 Account Kinds
| Kind | Class | Description |
|---|---|---|
| `cash` | `asset` | Physical cash. |
| `bank` | `asset` | Checking, savings accounts. |
| `wallet` | `asset` | Digital payment wallets (Paytm, Amazon Pay balance, PhonePe wallet, etc.). |
| `credit_card` | `liability` | Revolving credit card lines. |
| `fixed_deposit` | `asset` | Term deposits with compounding interest. |
| `recurring_deposit` | `asset` | Monthly installment deposits with interest. |
| `mutual_fund` | `asset` | Units held with periodic NAV valuation. |
| `stocks` | `asset` | Equity shares held in demat accounts. |
| `loan` | `liability` | Mortgages, auto loans, personal loans. |
| `other_asset` | `asset` | Precious metals, real estate, collectibles. |
| `other_liability` | `liability` | Informal loans, personal debts owed. |

---

## 3. Transaction Types & Balance Rules

### 3.1 Transaction Types
- `expense`: Reduces account balance. Represents money outgoing to external entities.
- `income`: Increases account balance. Represents money incoming from external entities.
- `transfer`: Moves funds between two owned accounts (`accountId` $\to$ `toAccountId`). Requires `toAccountId IS NOT NULL` and `toAccountId <> accountId`. Decreases source account, increases target account.
- `adjustment`: Signed adjustment (+ or -) to reconcile account ledger with actual statement balance without categorizing as income/expense.

### 3.2 Account Balance Rules
- **Asset Accounts** (e.g., `bank`, `cash`):
  - $\text{Balance} = \sum(\text{Income}) - \sum(\text{Expense}) + \sum(\text{Transfers In}) - \sum(\text{Transfers Out}) + \sum(\text{Adjustments})$
- **Credit Cards** (`liability`):
  - Stored ledger balance is **negative** when money is owed:
    - Expense on card makes balance more negative (decreases balance).
    - Payment/transfer from bank to card makes balance less negative / zero (increases balance).
  - $\text{Outstanding} = \max(0, -\text{balance})$
  - $\text{Credit Limit}$ is stored in paise (`fin_accounts.creditLimit`).
  - $\text{Utilization} = \begin{cases} 0 & \text{if creditLimit} \le 0 \\ \min(1.0, \frac{\text{outstanding}}{\text{creditLimit}}) & \text{otherwise} \end{cases}$
- **Loans** (`liability`):
  - Stored ledger balance represents remaining principal balance. Payments reduce outstanding principal balance.
  - $\text{Outstanding} = \max(0, \text{balance})$.

### 3.3 Investment Accounts (`mutual_fund`, `stocks`)
- **Ledger Balance**: Reflects uninvested cash / capital pool if tracking cash, or ledger sum of contributions.
- **Valuation (`fin_valuations`)**: Periodic record of the account's total market value on a specific date (`accountId`, `date`, `value`, `costBasis`).
- **Current Value**:
  - On any date $D$, $\text{Current Value}(D) =$ the `value` from the latest `fin_valuations` record on or before $D$.
  - If no valuation exists on or before $D$, fallback to ledger balance.
- **Contributions**:
  - $\text{Contributions} =$ Net transfers into the investment account ($\sum \text{Transfers In} - \sum \text{Transfers Out}$).
- **Gain / Returns**:
  - $\text{Gain} = \text{Current Value} - \text{Contributions}$.
  - Income credited directly to an investment account (e.g. dividend payout) counts as **realized return**, not a principal contribution.

### 3.4 Net Worth Formula
$$\text{Net Worth} = \sum_{\text{Asset Accounts}} \text{Current Value / Balance} - \sum_{\text{Liability Accounts}} \text{Outstanding Debt}$$

Where:
- Asset accounts use `Current Value` for investments, and ledger `Balance` for cash/bank/deposits.
- Liability accounts contribute their `Outstanding` amount ($\max(0, -\text{balance})$ for credit cards, $\max(0, \text{balance})$ for loans).

---

## 4. Fixed Deposit (FD) and Recurring Deposit (RD) Formulas

### 4.1 Fixed Deposit (FD) Closed-Form Formula
For a lump sum deposit $P$ (in paise) at annual interest rate $r$ (decimal, e.g. $0.075$ for $7.5\%$) for tenure $t$ (years):

$$A = P \left(1 + \frac{r}{n}\right)^{n \cdot t}$$

Where $n$ is the compounding frequency per year:
- Monthly: $n = 12$
- Quarterly (Indian banking default): $n = 4$
- Half-yearly: $n = 2$
- Yearly: $n = 1$
- Simple Interest ($n = 0$): $A = P \cdot (1 + r \cdot t)$

**Interest Earned**: $I = A - P$.

### 4.2 Recurring Deposit (RD) Closed-Form Formula & Data Model

#### 4.2.1 Data Model (`fin_accounts.metadata` for `kind: 'recurring_deposit'`)
- `monthlyInstallment`: Integer minor units (paise).
- `startDate`: Account opening date (`YYYY-MM-DD`).
- `installmentDay`: Day of month (integer 1–31 or `'last'` / `'last day of month'`), clamped to the calendar length of each month.
- `firstInstallmentOn`: `'start_date'` (default) | `'first_installment_day'`.
  - `'start_date'`: Installment 1 falls on `startDate`; installments 2..M fall on `installmentDay` in subsequent months.
  - `'first_installment_day'`: Installment 1 falls on the first occurrence of `installmentDay` after `startDate`; installments 2..M follow in subsequent months.
- `tenureMonths`: Total tenure $M$ (integer).
- `maturityDate`: Derived as `startDate + tenureMonths` (clamped calendar addition), with optional user override.
- `interestRate`: Annual interest rate $r$ (percent e.g. 6.8 for 6.8%).
- `compounding`: Compounding frequency (`'quarterly'` by default, `'monthly'`, `'half_yearly'`, `'yearly'`, `'simple'`).
- `payFromAccountId`: Optional source bank account ID.
- `autoDebit`: Boolean (defaults to `true` when `payFromAccountId` is provided). When enabled, a recurring TRANSFER rule is maintained automatically to generate bank-to-RD transfers.
- `installmentsMode`: `'schedule'` (default, assumed paid on schedule) | `'recorded'` (strictly matched to recorded transfers).
- `installmentDayHistory`: `Array<{ effectiveFrom: string; day: number | 'last' }>` preserving historical installment days when changed from an effective month.
- `skippedInstallments`: `string[]` of due dates (`YYYY-MM-DD`) that were skipped without interest accrual.
- `paidLateInstallments`: `Array<{ dueDate: string; paidDate: string }>` recording late installment dates compounding from their actual deposit date.

#### 4.2.2 Closed-Form Valuation & Compounding Formula
Each paid installment $i$ compounds from its actual deposit date $D_i$ to evaluation date $asOf$:

$$V_i = R \times \left(1 + \frac{r}{100 \times q}\right)^{q \times \frac{\text{days}_i}{365}}$$

Where:
- $R$ is the monthly installment amount in paise.
- $r$ is the nominal annual rate percent (e.g. 6.8).
- $q$ is compounding periods per year ($q = 4$ for quarterly, $12$ for monthly, $2$ for half-yearly, $1$ for yearly, $0$ for simple interest $R \times (1 + \frac{r \cdot \text{days}}{36500})$).
- $\text{days}_i = \max(0, asOf - D_i)$.

With a manual passbook anchor $(\text{anchorDate}, \text{anchorValue})$:

$$\text{value}(asOf) = \text{anchorValue} \times \left(1 + \frac{r}{100 \times q}\right)^{q \times \frac{asOf - \text{anchorDate}}{365}} + \sum_{D_i > \text{anchorDate}} V_i$$

Total deposited is the sum of installments paid (or anchor baseline plus post-anchor installments), and accrued interest is $\text{currentValue} - \text{totalDeposited}$.
Projected maturity value compounds all scheduled installments to `maturityDate`.

> **Reconciliation Note**: Bank statements may differ by a few rupees because different financial institutions use their own day-count conventions (30/360 vs Actual/365) and specific quarter-end accrual schedules. Users can record a passbook anchor to reconcile exact statement values.

---

## 5. Default Categories

On user initialization or database provisioning, the following system categories (`isSystem: true`) are seeded:

### 5.1 Expense Categories
1. `Food & Dining`
2. `Groceries`
3. `Transport`
4. `Fuel`
5. `Rent`
6. `Utilities`
7. `Shopping`
8. `Health`
9. `Entertainment`
10. `Travel`
11. `EMI & Loans`
12. `Education`
13. `Insurance`
14. `Subscriptions`
15. `Fees & Interest`
16. `Others`

### 5.2 Income Categories
1. `Salary`
2. `Interest`
3. `Dividends`
4. `Refunds`
5. `Other income`

---

## 6. Virtual Tables Catalog (Dashboard Data Source)

The BI Kit dashboard engine exposes virtual tables so users can build charts, pivots, and metrics.
Amounts in virtual tables are exposed in **rupees** as `numeric(15, 2)` (or floating point numeric values) for natural chart axes and aggregation.

### 6.1 `transactions`
- `id` (text, primary key)
- `date` (date, YYYY-MM-DD)
- `year` (integer, e.g. 2026)
- `month` (integer, 1-12)
- `month_start` (date, first day of month)
- `weekday` (integer, 0-6 where 0=Sunday)
- `type` (text: 'expense' | 'income' | 'transfer' | 'adjustment')
- `amount` (numeric(15, 2), positive amount in rupees)
- `signed_amount` (numeric(15, 2), negative for expenses/outflows, positive for income/inflows)
- `account_id` (text)
- `account_name` (text)
- `account_kind` (text)
- `to_account_id` (text, nullable)
- `category_id` (text, nullable)
- `category` (text, category name)
- `parent_category` (text, parent category name or null)
- `payee` (text, nullable)
- `note` (text, nullable)
- `tags` (text, comma-separated or json string)

### 6.2 `accounts`
- `id` (text, primary key)
- `name` (text)
- `kind` (text)
- `class` (text: 'asset' | 'liability')
- `currency` (text: default 'INR')
- `is_active` (boolean)
- `credit_limit` (numeric(15, 2), nullable)
- `created_at` (timestamp)
- `updated_at` (timestamp)

### 6.3 `account_balances`
- `account_id` (text, primary key)
- `name` (text)
- `kind` (text)
- `class` (text)
- `balance` (numeric(15, 2))
- `outstanding` (numeric(15, 2), non-negative)
- `credit_limit` (numeric(15, 2))
- `utilization` (numeric(5, 4), 0.0000 - 1.0000)
- `current_value` (numeric(15, 2))
- `contributions` (numeric(15, 2))
- `gain` (numeric(15, 2))

### 6.4 `balance_history`
- `date` (date)
- `account_id` (text)
- `balance` (numeric(15, 2))
- `value` (numeric(15, 2))

### 6.5 `net_worth_history`
- `date` (date, primary key)
- `assets` (numeric(15, 2))
- `liabilities` (numeric(15, 2))
- `net_worth` (numeric(15, 2))

### 6.6 `categories`
- `id` (text, primary key)
- `name` (text)
- `type` (text: 'expense' | 'income')
- `parent_id` (text, nullable)
- `is_system` (boolean)

### 6.7 `budgets`
- `id` (text, primary key)
- `category_id` (text)
- `amount` (numeric(15, 2))
- `period` (text: 'monthly' | 'quarterly' | 'yearly')
- `start_date` (date)

### 6.8 `budget_progress`
- `budget_id` (text, primary key)
- `category_id` (text)
- `category_name` (text)
- `period` (text)
- `budgeted_amount` (numeric(15, 2))
- `spent_amount` (numeric(15, 2))
- `remaining_amount` (numeric(15, 2))
- `percentage_used` (numeric(5, 2))

---

## 7. API Specification & Error Handling

All finance endpoints require authentication via `requireUserApi()`.
Standard error shape:
```json
{
  "error": "Descriptive message"
}
```

### 7.1 Accounts
- `GET /api/finance/accounts`
  - Query params: `class` (`asset`|`liability`), `kind`, `isActive` (`true`|`false`)
  - Response: `{ "accounts": AccountDTO[] }`
- `POST /api/finance/accounts`
  - Body: `CreateAccountDTO`
  - Response: `{ "account": AccountDTO }` (201)
- `GET /api/finance/accounts/:id`
  - Response: `{ "account": AccountDTO }`
- `PUT /api/finance/accounts/:id`
  - Body: `UpdateAccountDTO`
  - Response: `{ "account": AccountDTO }`
- `DELETE /api/finance/accounts/:id`
  - Response: `{ "success": true }` (200)

### 7.2 Categories
- `GET /api/finance/categories`
  - Query params: `type` (`expense`|`income`)
  - Response: `{ "categories": CategoryDTO[] }`
- `POST /api/finance/categories`
  - Body: `CreateCategoryDTO`
  - Response: `{ "category": CategoryDTO }` (201)
- `GET /api/finance/categories/:id`
  - Response: `{ "category": CategoryDTO }`
- `PUT /api/finance/categories/:id`
  - Body: `UpdateCategoryDTO`
  - Response: `{ "category": CategoryDTO }`
- `DELETE /api/finance/categories/:id`
  - Response: `{ "success": true }`

### 7.3 Transactions
- `GET /api/finance/transactions`
  - Filters: `accountId`, `categoryId`, `type`, `startDate`, `endDate`, `search`, `cursor`, `limit` (default 50, max 200)
  - Cursor pagination: Base64-encoded `date:id`
  - Response: `{ "transactions": TransactionDTO[], "nextCursor": string | null, "hasMore": boolean }`
- `POST /api/finance/transactions`
  - Body: `CreateTransactionDTO`
  - Header: Optional `X-Client-Request-Id` (or body `clientRequestId`) for idempotent submission.
  - Response: `{ "transaction": TransactionDTO }` (201)
- `GET /api/finance/transactions/:id`
  - Response: `{ "transaction": TransactionDTO }`
- `PUT /api/finance/transactions/:id`
  - Body: `UpdateTransactionDTO`
  - Response: `{ "transaction": TransactionDTO }`
- `DELETE /api/finance/transactions/:id`
  - Response: `{ "success": true }`

### 7.4 Valuations (Investments)
- `GET /api/finance/valuations`
  - Query params: `accountId` (required), `startDate`, `endDate`
  - Response: `{ "valuations": ValuationDTO[] }`
- `POST /api/finance/valuations`
  - Body: `CreateValuationDTO` (`accountId`, `date`, `value`, `costBasis`, `note`)
  - Response: `{ "valuation": ValuationDTO }` (201)

### 7.5 Budgets
- `GET /api/finance/budgets`
  - Query params: `period`, `activeOnly`
  - Response: `{ "budgets": BudgetDTO[], "progress": BudgetProgressDTO[] }`
- `POST /api/finance/budgets`
  - Body: `CreateBudgetDTO`
  - Response: `{ "budget": BudgetDTO }` (201)
- `GET /api/finance/budgets/:id`
  - Response: `{ "budget": BudgetDTO }`
- `PUT /api/finance/budgets/:id`
  - Body: `UpdateBudgetDTO`
  - Response: `{ "budget": BudgetDTO }`
- `DELETE /api/finance/budgets/:id`
  - Response: `{ "success": true }`

### 7.6 Recurring Rules
- `GET /api/finance/recurring`
  - Response: `{ "rules": RecurringRuleDTO[] }`
- `POST /api/finance/recurring`
  - Body: `CreateRecurringRuleDTO`
  - Response: `{ "rule": RecurringRuleDTO }` (201)
- `GET /api/finance/recurring/:id`
  - Response: `{ "rule": RecurringRuleDTO }`
- `PUT /api/finance/recurring/:id`
  - Body: `UpdateRecurringRuleDTO`
  - Response: `{ "rule": RecurringRuleDTO }`
- `DELETE /api/finance/recurring/:id`
  - Response: `{ "success": true }`

### 7.7 Overview & Statistics
- `GET /api/finance/stats/overview`
  - Response: `{ "netWorth": number, "totalAssets": number, "totalLiabilities": number, "monthlyIncome": number, "monthlyExpense": number, "savingsRate": number }`
- `GET /api/finance/stats/net-worth-history`
  - Query params: `startDate`, `endDate`, `interval` (`daily`|`monthly`)
  - Response: `{ "history": NetWorthPointDTO[] }`

### 7.8 Cron Endpoints
Protected by `Authorization: Bearer <CRON_SECRET>` or `x-cron-secret: <CRON_SECRET>`.
- `POST /api/cron/recurring`: Materializes due recurring transactions into `fin_transactions`.
- `POST /api/cron/valuations`: Refreshes or snapshots daily valuations and net worth history.

