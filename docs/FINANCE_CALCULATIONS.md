# Finance Calculations & Conventions

This document specifies the official calculation rules and conventions for the BI Kit Personal Finance module.

---

## 1. Recurring Deposit (RD) Calculations

### 1.1 Formula & Compounding Convention
Indian banking standard for Recurring Deposits compounds quarterly ($n = 4$) at nominal annual rate $r\%$ (or fraction $r/100$).
Installments of amount $R$ (in minor units, paise) are deposited monthly on the installment day from the account's start date up to $\min(\text{as-of date}, \text{maturity date})$.

For each installment $m$, let $t_m$ be the tenure (in months) that the installment remains invested as of the evaluation date:

$$\text{value}(asOf) = \sum_{\text{deposited installments}} R \times \left(1 + \frac{r}{400}\right)^{\frac{\text{months since that deposit}}{3}}$$

At full maturity ($M$ months tenure):
The $M$-th installment deposited 1 month before maturity is invested for 1 month ($k = 1$).
The 1st installment deposited at start date is invested for $M$ months ($k = M$).

$$\text{maturityAmount} = \sum_{k=1}^{M} R \times \left(1 + \frac{r}{400}\right)^{\frac{k}{3}}$$

- **Total Invested**: $\sum R$ (or $R \times M$ for full tenure).
- **Interest Earned**: $\text{value}(asOf) - \text{total deposited}$.
- **TDS**: Ignored in calculations.

### 1.2 Installment Sourcing Modes
Configured per account via `metadata.installmentMode`:
1. **`assume_schedule` (Default)**:
   Installments are assumed to have been deposited on the scheduled installment day of each month from the start date up to $\min(\text{asOfDate}, \text{maturityDate})$.
   If the start date day is the 31st (or exceeds month length), the installment date clamps to the last calendar day of each respective month (e.g. Feb 28/29, Apr 30).
2. **`recorded_transfers`**:
   Installments are sourced strictly from recorded transfer transactions entering the RD account (`toAccountId = rd.id`, `deletedAt IS NULL`, `date <= asOfDate`).

### 1.3 Manual Valuation Anchor Rule
If a manual valuation exists (for example, an actual current value entered during the onboarding setup journey or recorded as a valuation snapshot on anchor date $D_{\text{anchor}}$):
- Treat the manual valuation as the anchor.
- Accrue the anchor value forward from $D_{\text{anchor}}$ to $asOfDate$:
  $$\text{value}_{\text{anchor-accrued}} = \text{anchorValue} \times \left(1 + \frac{r}{400}\right)^{\frac{\text{months between } D_{\text{anchor}} \text{ and } asOfDate}{3}}$$
- Plus add new installments deposited strictly after $D_{\text{anchor}}$, each compounded for the months since that new deposit.
- Total deposited is: $(\text{cost basis at anchor or sum of installments up to anchor}) + \sum (\text{new installments after anchor})$.
- Interest earned = $\text{value}(asOf) - \text{total deposited}$.

---

## 2. Fixed Deposit (FD) Calculations

### 2.1 Formula & Compounding Convention
For principal $P$ (in paise) at annual interest rate $r\%$ for tenure $t$ (in years):

$$\text{value} = P \times \left(1 + \frac{r}{100 \times n}\right)^{n \times t}$$

Where compounding frequency count $n$ is:
- **Quarterly (Default)**: $n = 4$
- **Monthly**: $n = 12$
- **Half-yearly**: $n = 2$
- **Yearly**: $n = 1$
- **Simple Interest ($n = 0$)**: $\text{value} = P \times \left(1 + \frac{r}{100} \times t\right)$

Where tenure $t = \frac{\text{days between start date and } \min(asOfDate, maturityDate)}{365.0}$.
Interest stops compounding after the maturity date.

### 2.2 Manual Valuation Anchor Rule
If a manual valuation exists at anchor date $D_{\text{anchor}}$:
- The anchor value compounds forward from $D_{\text{anchor}}$ to $\min(asOfDate, maturityDate)$ using the account's rate and compounding frequency.
- Interest earned = $\text{currentValue} - P$.

---

## 3. Credit Cards & Liabilities Conventions

### 3.1 Accounting & Sign Convention
- **Internal Storage**:
  - Credit card ledger balances are negative when money is owed:
    $$\text{balance} \le 0 \implies \text{outstanding debt} = -\text{balance}$$
  - When a card is overpaid, balance is positive ($\text{balance} > 0$), representing a credit balance.
  - Loans ledger balances are positive: $\text{outstanding} = \max(0, \text{balance})$.
- **User-Facing Display**:
  - In selects, tiles, tables, and dialogs, raw negative signs are not presented.
  - If money is owed: **"Owes ₹X"**
  - If overpaid: **"Credit ₹Y"**
  - If zero balance: **"₹0"**

### 3.2 Bill Payment Model
- Spends on a credit card are recorded as an **`expense`** on the credit card account. This correctly reflects expenses in spending charts, budgets, and categorization.
- Paying the credit card bill is a **`transfer`** from a bank or cash account to the credit card account:
  - Source (`accountId`): Bank / Cash
  - Destination (`toAccountId`): Credit Card
  - Type: `transfer`
  - Category: `Credit card payment` (system category)
- **Spending Reports Invariance**:
  Transfers are never categorized as expenses. Paying a ₹10,000 credit card bill transfers ₹10,000 from Bank to Card; it **never** increases monthly spending or affects budget limits.
- **Overpayment Notice**:
  If payment amount exceeds current outstanding debt, the surplus creates a positive credit balance on the card.

---

## 4. Investment Portfolio Conventions

- **Current Value**: Latest valuation recorded on or before $asOfDate$ (fallback to uninvested ledger contributions).
- **Cost Basis**: Net principal contributions ($\sum \text{Transfers In} - \sum \text{Transfers Out}$) plus opening contribution.
- **Returns (Gain)**: $\text{Gain} = \text{Current Value} - \text{Cost Basis}$.
- **Return Rate (Gain %)**: $\frac{\text{Gain}}{\text{Cost Basis}} \times 100$.
- **Signed Display**:
  - If $\text{Gain} \ge 0$: display with positive prefix `+` (e.g. `+₹5,000`, `+12.4%`) in emerald/green.
  - If $\text{Gain} < 0$: display negative value (e.g. `-₹2,500`, `-6.2%`) in rose/red.
