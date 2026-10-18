# BI Kit — Local-First Business Intelligence Tool

A modern, local-first Business Intelligence and data visualization platform inspired by **Frappe Insights**. Built with **Next.js App Router**, **TypeScript**, **shadcn/ui**, **SQLite** (`better-sqlite3` with **Drizzle ORM**), **Recharts**, **TanStack Table**, and **react-grid-layout**.

---

## Key Features

- **Data Sources**: Connect SQLite files and CSV datasets; inspect table schemas, column types, and nullability with an instant schema drawer.
- **Visual Query Builder**: Build complex analytical queries through an intuitive drag-and-drop pipeline:
  - Steps: *Source*, *Join* (inner/left), *Filter* (type-aware conditions), *Mutate* (computed columns), *Summarize* (aggregations & date grains), *Select*, *Order By*, and *Limit*.
  - Compiles cleanly into SQLite Common Table Expressions (CTEs) or subqueries.
  - Zero SQL string interpolation: all values are bound strictly via parameterized query parameters.
- **Direct SQL Editor**: Monospace SQL editor with schema column insertion, query syntax validation, and instant keyboard execution (`⌘ + Enter` / `Ctrl + Enter`).
- **Interactive Visualizations**:
  - 6 chart types: **Bar**, **Line**, **Area**, **Pie**, **Number Card (KPI)**, and **Data Table**.
  - Powered by shadcn chart components backed by **Recharts**.
  - Multiple color palettes (*Default*, *Ocean*, *Sunset*, *Emerald*, *Monochrome*), series groupings, and number formatting.
- **Responsive Dashboards**:
  - 12-column draggable and resizable grid powered by `react-grid-layout`.
  - Edit mode / View mode toggle.
  - Auto-refresh options (Off, 30s, 1m, 5m).
  - Quick tile actions to refresh query data or jump directly to the underlying chart editor.
- **Dashboard-Level Filters**:
  - **Date Range Filter**: Popover calendar with presets (*Today*, *Last 7d*, *Last 30d*, *This Month*, *This Year*).
  - **Select Filter**: Searchable dropdown showing distinct values extracted live from active chart datasets.
  - Runtime filter injection: automatically identifies matching columns across queries and injects filter steps before aggregation steps.
  - Persistent filter definitions stored with dashboard entities in SQLite.
- **Polished UI & Theme**:
  - 100% shadcn/ui components (dialogs, sheets, popovers, alert dialogs, dropdowns, tables, tabs).
  - Dark mode with system preference detection and instant toggle.
  - Dynamic breadcrumb navigation that tracks your active workbook, query, chart, or dashboard.
  - Built-in keyboard shortcuts reference dialog (`?`).

---

## Architecture & Safety Boundary

```
src/
├── app/                  # Next.js App Router pages & REST API route handlers
│   ├── (app)/            # UI routes: /workbooks, /workbooks/[id], /data-sources
│   └── api/              # API endpoints for data sources, queries, charts, dashboards
├── components/           # UI components built with shadcn/ui & Tailwind
│   ├── charts/           # Chart editor and reusable ChartRenderer
│   ├── dashboards/       # Dashboard editor, grid layout, tiles, and filter bar
│   ├── datasource/       # Data source table, creation dialog, and schema sheet
│   ├── layout/           # App header, sidebar, breadcrumb store, shortcuts dialog
│   ├── query-builder/    # Pipeline step cards, SQL view, results table, Zustand store
│   ├── ui/               # shadcn/ui primitives
│   └── workbook/         # Workspace panel lists, editor panel, creation dialogs
└── lib/                  # Server-only domain logic, connectors, query engine, database
    ├── charts/           # Chart service & serialization
    ├── connectors/       # SQLite & CSV read-only database connectors
    ├── dashboards/       # Dashboard service, layout & filter persistence
    ├── data-sources/     # Data source registration and schema introspection
    ├── db/               # Drizzle schema, migrations, and SQLite connection
    ├── queries/          # Saved query CRUD & execution
    ├── query-engine/     # AST CTE compiler, column inference, and read-only validator
    ├── schemas/          # Zod validation schemas shared across client & server
    └── workbooks/        # Workbook service
```

### Query Execution Safety
- **Strict Read-Only Enforcement**: Executes only a single `SELECT` or read-only `WITH` statement. Rejects `INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `ATTACH`, `PRAGMA` mutations, and multiple statement batches.
- **Prepared Statements**: SQLite statements are prepared and verified as read-only via `better-sqlite3`.
- **Query Protection**: Hard caps query execution at **1,000 rows** and enforces a **10-second timeout** with execution interruption.

---

## Getting Started

### 1. Prerequisites
- **Node.js** 20.x or higher
- **npm** or **pnpm**

### 2. Environment Variables
Create a `.env.local` file by copying `.env.example`:
```bash
cp .env.example .env.local
```

Configurable variables:
- `DATA_DIR`: Directory for application storage, CSV caches, avatars, and sample databases (defaults to `./data`).
- `APP_DB_PATH`: Custom path to application SQLite database (defaults to `${DATA_DIR}/app.db`).
- `SEED_ADMIN_EMAIL`: Email for demo administrator account (defaults to `admin@example.com`).
- `SEED_ADMIN_PASSWORD`: Password for demo administrator account (defaults to `ChangeMe123!`; required in production).
- `SEED_DEMO_USER_EMAIL`: Email for demo member account (defaults to `member@example.com`).
- `SEED_DEMO_USER_PASSWORD`: Password for demo member account (defaults to `ChangeMe123!`; required in production).
- `PORT`: Development server port (defaults to `3000`).

### 3. Setup & Database Scripts
For a fresh clone, install dependencies, apply migrations, and seed demo data in one command:
```bash
npm run setup
```

#### Available Database Scripts
| Command | Description |
|---|---|
| `npm run db:migrate` | Programmatically runs pending Drizzle migrations (`src/lib/db/migrate.ts`) with WAL mode and foreign keys enabled. |
| `npm run db:generate` | Generates a new migration SQL file from `src/lib/db/schema.ts` into `src/lib/db/migrations/`. |
| `npm run db:seed` | Runs all seeders in order: `db:seed:users`, `db:seed:demo`, and `db:seed:workbook`. |
| `npm run db:seed:users` | Creates or updates demo Admin and Member users with hashed passwords and enables registration. |
| `npm run db:seed:demo` | Rebuilds deterministic `./data/sample.db` e-commerce dataset (2,000 customers, 60 sellers, 400 products, 12,000 orders). |
| `npm run db:seed:workbook` | Upserts data sources, workbooks, queries, charts, and dashboards for Admin and Member, and validates queries through the execution engine. |
| `npm run db:reset` | Checks port 3000 (aborts if dev server is running unless `--force`), wipes all local databases and uploads/csv/avatars files, runs migrations, seeds data, and prints final table row counts and demo credentials. |
| `npm run db:studio` | Launches Drizzle Studio to inspect and edit SQLite tables in a browser UI. |
| `npm run db:clean-tests` | Cleans up any test-created records from local database. |

#### Database Migration Workflow
When evolving the database schema:
1. Edit table definitions in `src/lib/db/schema.ts` (single source of truth).
2. Generate migration SQL: `npm run db:generate`.
3. Review the generated SQL in `src/lib/db/migrations/` to verify foreign keys, indexes, and constraints.
4. Apply the migration: `npm run db:migrate`.

### 4. Demo Credentials
| Role | Email | Password | Permissions & Scope |
|---|---|---|---|
| **Admin** | `admin@example.com` | `ChangeMe123!` | Full access: "Demo Store", "Order Analysis" workbook, "Sales Overview" dashboard. |
| **Demo Member** | `member@example.com` | `ChangeMe123!` | Isolated member workspace: "My First Workbook" and member queries. |

### 5. Run the Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser and sign in using the demo credentials above.

---

## Seed Data & Demo Workbooks

Running `npm run db:seed` provisions:
1. **`./data/sample.db`**: Deterministic marketplace dataset containing 2,000 customers, 60 sellers, 400 products across 12 categories, 12,000 orders over 24 months, order items, and reviews.
2. **`./data/app.db`**:
  - **Admin**: Demo Store data source, Order Analysis workbook (5 queries, 5 charts), and Sales Overview dashboard (clean 12-column responsive layout).
  - **Demo Member**: Independent Demo Store source and "My First Workbook" with customer breakdown query and dashboard.

---

## Step-by-Step Walkthrough

### Step 1: Inspecting Data Sources
1. Navigate to **Data Sources** in the sidebar (`/data-sources`).
2. The seeded **Demo Store (SQLite)** is listed.
3. Click the menu `...` on the row and select **View schema** to inspect the six tables (`customers`, `sellers`, `products`, `orders`, `order_items`, `reviews`) and column types in a flyout sheet.
4. You can also connect additional SQLite databases or upload CSV files via **Add Data Source**.

### Step 2: Creating and Running Queries
1. Navigate to **Workbooks** and open **Order Analysis** (`/workbooks/[id]`).
2. In the left panel, click **+** under **Queries** or select an existing query.
3. **Builder Mode**:
   - Choose a starting source table (e.g. `orders`).
  - Add a **Join** step to join `customers` on `orders.customer_id = customers.customer_id`.
  - Add a **Filter** step (e.g. `order_status = 'delivered'`).
  - Add a **Summarize** step: group by `order_purchase_timestamp` with month grain, aggregate revenue from `order_items`.
   - Add an **Order By** or **Limit** step.
   - Inspect the compiled SQL query in the collapsible preview.
4. **SQL Mode**:
   - Switch tabs to **SQL**.
   - Write standard SQL `SELECT` queries.
   - Use the **Insert schema column** popover to search and insert table or column identifiers.
   - Press **`⌘ + Enter`** (or `Ctrl + Enter`) to execute immediately.
5. Results appear in the bottom panel with column type badges, row count, and execution duration.

### Step 3: Visualizing with Charts
1. Switch to the **Charts** tab in the left panel.
2. Select **+** to create a chart or pick an existing chart (e.g. *Monthly Revenue Trend*).
3. Select your linked query.
4. Pick a chart type: **Bar**, **Line**, **Area**, **Pie**, **Number**, or **Table**.
5. Configure the **X-axis** column and **Y-axis** metric column(s).
6. Customize the palette (*Ocean*, *Sunset*, etc.), grid lines, legend, or number formatting.
7. The live preview updates instantly. Changes autosave automatically.

### Step 4: Composing Responsive Dashboards with Filters
1. Switch to the **Dashboards** tab and open **Executive Sales Overview**.
2. Toggle between **View** and **Edit** mode:
   - In **Edit mode**, drag tiles by their grab handle or resize them from any edge/corner.
   - Click **+ Add Chart** to add any chart from your workbook onto the grid.
3. **Interactive Filter Bar**:
   - Click **Order Date** to select a preset (*Last 30 days*, *This Month*) or pick a custom date range in the calendar.
   - Click **Status** to filter charts by order status (*completed*, *shipped*, *pending*).
   - In Edit mode, click **+ Add Filter** to map a new filter to any column present across your charts.
   - In Edit mode, click the trash icon next to a filter to delete it.
4. Select an **Auto Refresh** interval (e.g. *30s*) to keep your dashboard synchronized.

---

## Keyboard Shortcuts

| Shortcut | Context | Action |
|---|---|---|
| `⌘ + Enter` / `Ctrl + Enter` | Query Editor (Builder & SQL) | Execute query immediately |
| `?` | Global (outside inputs) | Open Keyboard Shortcuts reference modal |
| `Esc` | Dialogs / Sheets / Popovers | Close active modal, calendar, or schema drawer |
| `Tab` / `Shift + Tab` | Query Builder & Forms | Navigate through pipeline controls |

---

## Gaps vs. Frappe Insights (Roadmap for v2)

While BI Kit MVP delivers core visual query building, charting, grid dashboards, and runtime filtering, the following enterprise capabilities from Frappe Insights remain as targets for v2:

| Capability | Current MVP Status | Frappe Insights Feature / v2 Target |
|---|---|---|
| **Semantic Layer & Data Modeling** | Queries query raw database tables directly. | Explicit DocType modeling, user-defined dimensions/metrics, and automated relationship graphs where foreign keys are inferred automatically. |
| **External Connectors** | SQLite and CSV file connectors. | Native drivers for PostgreSQL, MySQL/MariaDB, ClickHouse, Snowflake, Google BigQuery, and DuckDB. |
| **User Roles & Permissions (RBAC)** | Single-tenant, local workspace. | Multi-user roles (Admin, Analyst, Viewer), fine-grained workbook permissions, and Row-Level Security (RLS) based on user attributes. |
| **Scheduled Delivery & Alerts** | Client-side dashboard polling (30s, 1m, 5m). | Server-side background worker (cron) to dispatch PDF/CSV reports and threshold-based alerts to Email, Slack, and Microsoft Teams. |
| **Public Sharing & Embedding** | Authenticated application access only. | Public dashboard URLs, password-protected links, and signed JWT embed tokens for iframes with tenant scoping. |
| **Materialization & Query Cache** | In-memory client cache with TTL. | Server-side query result caching, materialized view syncs, and Redis/DuckDB cache layer for millions of rows. |
| **Advanced Transformations** | SQL expressions and builder mutate steps. | Python code blocks, Jinja2 dynamic SQL templating, and custom user-defined transformation functions. |
| **Interactive Cross-Filtering** | Dashboard-level Popover Filter Bar. | Chart-to-chart cross-filtering on point click (e.g. clicking a pie segment filters all adjacent tiles). |
| **Drill-Downs** | Tile jump to linked chart editor. | Hierarchical drill-downs (e.g. Country → State → City) within a single chart visualization. |

---

## Testing & Quality Assurance

Run the test suite:
```bash
# Run unit & security test suite (66 tests)
npm run test

# Type-check TypeScript
npx tsc --noEmit

# Run ESLint
npm run lint
```