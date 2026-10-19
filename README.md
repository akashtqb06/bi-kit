# BI Kit

A modern, local-first Business Intelligence (BI) and analytics platform inspired by **Frappe Insights**. Built with **Next.js 16 (App Router)**, **TypeScript**, **shadcn/ui**, **SQLite** (`better-sqlite3` with **Drizzle ORM**), **Recharts**, and **TanStack Table**.

---

## Highlights

- **Visual Query Builder & Direct SQL**: Build multi-step analytical pipelines (*Join*, *Filter*, *Mutate*, *Summarize*, *Order*, *Limit*) or write raw `SELECT` queries with read-only security guards.
- **Rich Visualizations**: Interactive Bar, Line, Area, Pie, KPI Number Cards, and Data Tables backed by shadcn charts and Recharts.
- **Drag-and-Drop Dashboards**: 12-column grid powered by `react-grid-layout` with date range and categorical cross-filtering.
- **Local-First & Safe**: Zero SQL string interpolation, strict read-only execution boundaries, and isolated SQLite storage.
- **Workbooks & Multi-User Auth**: Organize queries and dashboards in workbooks with complete session-based authentication and role policies.

---

## Quick Start

### 1. Prerequisites
- **Node.js**: `v20.9.0` or higher (`.nvmrc` included)
- **pnpm**: Version `10` or `11` (`pnpm@11.20.0` configured)

### 2. Installation & Setup

```bash
# Clone and enter the repository
git clone <repo-url> bi-kit
cd bi-kit

# Install dependencies (always use pnpm)
pnpm install

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

> [!WARNING]
> Default credentials are for local development only. Seed scripts reject default passwords in production. Change your password after initial login via **Settings > Security**, or use `pnpm user:reset-password <email>`.

---

## Essential Commands

```bash
pnpm dev                  # Starts development server (http://localhost:3000)
pnpm build                # Builds optimized production bundle
pnpm test                 # Runs all test suites (isolated temporary database)
pnpm lint                 # Runs ESLint code style and hygiene checks
pnpm db:migrate           # Applies pending Drizzle migrations to data/app.db
pnpm db:seed              # Seeds demo users, sample e-commerce data, and workbook
pnpm db:reset             # Fully wipes and reseeds the database (stop dev server first)
pnpm db:studio            # Opens Drizzle Studio GUI for inspecting database tables
pnpm user:reset-password  # CLI script to reset any account's password and revoke sessions
```

---

## Documentation

For comprehensive documentation, including detailed architecture diagrams, database workflows, troubleshooting, and project structure:

📖 **[Full Setup & Developer Guide (docs/SETUP.md)](docs/SETUP.md)**  
📋 **[Product Specification & Acceptance Criteria (docs/SPEC.md)](docs/SPEC.md)**  
🧹 **[Code Cleanup & Audit Report (docs/cleanup-report.md)](docs/cleanup-report.md)**

---

## License

Private / Proprietary.