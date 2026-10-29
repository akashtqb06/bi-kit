# BI Kit

A modern, local-first Business Intelligence (BI) and analytics platform inspired by **Frappe Insights**. Built with **Next.js 16 (App Router)**, **TypeScript**, **shadcn/ui**, **PostgreSQL** (`pg` connection pool with **Drizzle ORM**, Neon-ready), **Recharts**, and **TanStack Table**.

---

## Highlights

- **Visual Query Builder & Direct SQL**: Build multi-step analytical pipelines (*Join*, *Filter*, *Mutate*, *Summarize*, *Order*, *Limit*) or write raw `SELECT` queries with read-only security guards.
- **PostgreSQL & Neon Ready**: App persistence runs on PostgreSQL with connection pooling, SSL auto-detection, and fast isolated test suites powered by in-memory PGlite.
- **Personal Finance Module**: Track multi-account net worth, cash flow, credit cards, fixed deposits, investments, and atomic CSV bank statement imports. Gated safely behind granular feature flags.
- **Pluggable Connectors**: Connect to PostgreSQL, MySQL/MariaDB, Microsoft SQL Server, MongoDB, CSV, Excel, and SQLite files with automated schema introspection and connection pooling.
- **Rich Visualizations**: Interactive Bar, Line, Area, Pie, KPI Number Cards, and Data Tables backed by shadcn charts and Recharts.
- **Drag-and-Drop Dashboards**: 12-column grid powered by `react-grid-layout` with date range and categorical cross-filtering.
- **Local-First & Safe**: Zero SQL string interpolation, strict read-only execution boundaries, and isolated analytical storage.
- **Workbooks & Multi-User Auth**: Organize queries and dashboards in workbooks with complete session-based authentication and role policies.

---

## Quick Start

### 1. Prerequisites
- **Node.js**: `v20.9.0` or higher (`.nvmrc` included)
- **pnpm**: Version `10` or `11` (`pnpm@11.20.0` configured)
- **Docker**: For running local PostgreSQL (optional if connecting to Neon or existing Postgres)

### 2. Installation & Setup

```bash
# Clone and enter the repository
git clone <repo-url> bi-kit
cd bi-kit

# Install dependencies (always use pnpm)
pnpm install

# Start local PostgreSQL service via Docker (port 5432)
docker compose -f docker-compose.dev.yml up -d postgres

# Copy environment variables
cp .env.example .env.local

# Run migrations and seed demo data
pnpm setup

# Start the development server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) and log in.

---

## Demo Accounts

The default seed provisions an Indian e-commerce sample database (`data/sample.db`) with 12,000 orders, along with pre-built queries, charts, and a sales dashboard.

| Role | Email | Password | Access |
| :--- | :--- | :--- | :--- |
| **Admin** | `admin@example.com` | `ChangeMe123!` | Full unrestricted access to all resources, settings, and users |
| **Member** | `member@example.com` | `ChangeMe123!` | Standard access to workbooks, queries, charts, and dashboards |

> [!NOTE]
> **Personal Finance Data Privacy**:
> All Personal Finance data (accounts, transactions, valuations, budgets) is strictly **OWNER-ONLY**. Even system administrators cannot view or modify another user's financial records.

> [!WARNING]
> Default credentials are for local development only. Seed scripts reject default passwords in production. Change your password after initial login via **Settings > Security**, or use `pnpm user:reset-password <email>`.

---

## Environment Variables

Configure these settings in `.env.local` (copied from `.env.example`):

| Variable | Description | Default |
| :--- | :--- | :--- |
| `DATABASE_URL` | PostgreSQL connection string | `postgres://postgres:bi_password_123!@localhost:5432/bikit_dev` |
| `FINANCE_FEATURES` | Comma-separated list of active finance features (`overview,transactions,accounts,setup,budgets,recurring,import`) | `overview,transactions,accounts,import` |
| `FINANCE_BACKEND` | Finance persistence backend (`db` or `mock`). Production strictly enforces `db`. | `db` |
| `DATA_DIR` | Directory for local file storage, CSVs, and avatar uploads | `data` |

---

## Personal Finance Setup Journey

The Personal Finance module provides local, private tracking for net worth, bank accounts, credit cards, cash, and bank statement CSV imports:

1. **Start the App & Sign In**: Navigate to [http://localhost:3000](http://localhost:3000) and sign in.
2. **Onboarding / Setup**:
   - **Via Web UI**: Navigate to `/finance`. If you haven't set up accounts yet, you're guided through `/finance/setup` to configure your primary bank, cash in hand, and credit cards with initial balances.
   - **Via CLI Wizard**: Alternatively, run `pnpm finance:init` for an interactive command-line onboarding experience.
   - **Via Pre-built Personas**: Run `pnpm db:seed:finance` to populate realistic test personas (`salaried_single`, `freelancer_with_tax`, `family_with_home_loan`, etc.).
3. **Explore Modules**:
   - **Overview (`/finance/overview`)**: Net worth breakdown, monthly cash flow, account balances, and recent activity.
   - **Accounts (`/finance/accounts`)**: Real-time account balances, credit utilization, and account creation.
   - **Transactions (`/finance/transactions`)**: Search, filter by category/account, and manual transaction entry.
   - **Import (`/finance/import`)**: Upload bank statement CSVs with interactive column mapping, preview, and atomic rollback.
4. **Feature Flag Gating**:
   - Modules in development (e.g. `budgets`, `recurring`) are gated behind `FINANCE_FEATURES`. Enabled tabs appear in navigation; disabled routes return HTTP 404 or 501.

---

## Essential Commands

```bash
pnpm dev                  # Starts development server (http://localhost:3000)
pnpm build                # Builds optimized production bundle
pnpm test                 # Runs all test suites (isolated temporary database)
pnpm lint                 # Runs ESLint code style and hygiene checks
pnpm db:migrate           # Applies pending Drizzle migrations to PostgreSQL
pnpm db:seed              # Seeds demo users, sample e-commerce data, and workbook
pnpm db:seed:finance      # Seeds realistic personal finance demo accounts & transactions
pnpm db:seed:categories   # Seeds standard hierarchical personal finance categories
pnpm finance:init         # Interactive CLI onboarding wizard for personal finance
pnpm finance:coverage     # Reports FinanceService method coverage (Db vs Mock backends)
pnpm db:reset             # Fully wipes and reseeds the database (stop dev server first)
pnpm db:studio            # Opens Drizzle Studio GUI for inspecting database tables
pnpm user:reset-password  # CLI script to reset any account's password and revoke sessions
```

---

## Documentation

For comprehensive documentation, including detailed architecture diagrams, database workflows, troubleshooting, and project structure:

📖 **[Full Setup & Developer Guide (docs/SETUP.md)](docs/SETUP.md)**  
🔌 **[Connectors Guide & Development Reference (docs/CONNECTORS.md)](docs/CONNECTORS.md)**  
📋 **[Product Specification & Acceptance Criteria (docs/SPEC.md)](docs/SPEC.md)**  
🧹 **[Code Cleanup & Audit Report (docs/cleanup-report.md)](docs/cleanup-report.md)**

---

## License

Private / Proprietary.