# Recurring Rules Components (Session S6a)

- **Owning Session**: **S6a** (Recurring Transactions)
- **Scope**:
  - Full recurring rule lifecycle: Create, Edit, Pause, Resume, Delete
  - Presets & quick-add templates for:
    - 🏠 House Rent (Monthly, Expense, Category: Rent)
    - 📈 Mutual Fund SIP (Monthly, Transfer, Investment)
    - 💳 Loan EMI (Monthly, Expense/Transfer, Category: EMI & Loans)
    - 🍿 Subscriptions (Monthly/Yearly, Expense, Category: Subscriptions)
  - Generator integration:
    - "Generate due now" button with sonner toast notifications reporting created & backfilled transactions
    - CRON endpoint `POST /api/cron/recurring` authenticated via `CRON_SECRET`
    - Month-end clamping (28/29/30/31 days) with leap year resilience
    - Client request ID idempotency (`clientRequestId = ${ruleId}_${date}`)
  - Upcoming schedule projection:
    - Chronological list of scheduled transactions over the next 60 days
    - Relative date badges ("Today", "Tomorrow", "In X days")
    - Total projected outflow calculation
