# Local Container Deployment & Personal Finance Setup Guide

This guide explains how to run BI Kit locally inside a self-contained Docker environment with PostgreSQL, migrate the database automatically, and initialize your personal financial data (bank accounts, starting cash balance, credit cards) for daily tracking.

---

## 🚀 Quick Start (One Command)

To build the image and start both the PostgreSQL database and the web application in the background:

```bash
docker compose up -d --build
```

What this does automatically:
1. Spins up PostgreSQL 16 on port `5432` with a persistent Docker volume (`postgres_data`).
2. Waits for PostgreSQL to become healthy and ready for connections.
3. Automatically runs all pending database migrations (`pnpm run db:migrate`).
4. Automatically seeds the standard finance categories (Food, Rent, Salary, Utilities, etc.).
5. Starts the production Next.js application at **[http://localhost:3000](http://localhost:3000)**.

To view live logs:
```bash
docker compose logs -f app
```

---

## 🏦 Step 2: Initialize Your Financial Details

Once the container is running, you can initialize your account with your initial bank balance and cash details using our interactive setup assistant:

### Option A: Interactive CLI Assistant (Recommended)

Run inside the container:
```bash
docker compose exec app pnpm run finance:init
```

Or run locally (if you have Node.js/pnpm installed):
```bash
pnpm run finance:init
```

The interactive prompt will ask you:
1. **Login Email & Password**: (e.g. `yourname@gmail.com`)
2. **Bank Account Details**:
   - Bank Name (e.g. `HDFC Bank`, `SBI`, `Chase`)
   - Current Available Balance (e.g. `45000` or whatever your balance is right now)
3. **Cash in Hand Details**:
   - Current Cash in Hand (e.g. `3500`)
4. **Credit Card Details** (Optional):
   - Card Name, current balance owed, and credit limit.

The script immediately creates your user account, sets up the accounts in the database, and creates opening balance transactions so your current net worth and balances are active from day 1!

---

### Option B: Non-Interactive / Scripted Setup

You can also pass your details directly as arguments:

```bash
docker compose exec app pnpm run finance:init \
  --email "user@local.com" \
  --password "SecurePassword123!" \
  --bank-name "HDFC Bank" \
  --bank-balance 50000 \
  --cash-balance 4200
```

---

## 📱 Accessing Your Finance Dashboard

Once setup is complete:
1. Open **[http://localhost:3000/login](http://localhost:3000/login)** in your browser.
2. Sign in with the email & password you configured.
3. Navigate to:
   - **Overview**: `http://localhost:3000/finance/overview`
   - **Accounts**: `http://localhost:3000/finance/accounts`
   - **Transactions**: `http://localhost:3000/finance/transactions`
   - **Recurring Rules**: `http://localhost:3000/finance/recurring`
   - **Budgets**: `http://localhost:3000/finance/budgets`

---

## 💾 Data Persistence & Backup

Your financial data is persisted locally in named Docker volumes:
- `postgres_data`: Contains your PostgreSQL database files and transaction history.
- `app_data`: Contains any uploaded CSV bank statements or attachments.

Stopping and restarting containers preserves all your data:
```bash
# Stop containers
docker compose stop

# Start containers again
docker compose start

# Full stop without removing volumes
docker compose down
```

> ⚠️ Note: Do not run `docker compose down -v` unless you intentionally want to delete all your database records and start fresh.

---

## 🛠️ Adding More Accounts Later

You can add more bank accounts, cash wallets, fixed deposits, or investments at any time directly through the UI:
- Open **`/finance/accounts`** and click **"+ Add Account"**.
- Specify the account kind (`bank`, `cash`, `credit_card`, `fixed_deposit`, etc.) and opening balance.

