# BI Tool MVP Specification

## Purpose

Build a local-first, Frappe Insights-style business intelligence tool for defining queries against SQLite and CSV data sources, visualizing query results, and arranging charts on dashboards. This document defines the MVP product scope and intended code organization; it does not authorize implementing features by itself.

## MVP Scope

Users can:

- Register and manage SQLite and CSV data sources.
- Create workbooks to group related queries, charts, and dashboards.
- Define a query using either a visual builder or SQL mode, execute it, and inspect bounded results.
- Create a chart from a workbook query, choosing a supported visualization and its configuration.
- Create dashboards from charts in the same workbook, arrange chart tiles with a grid layout, and view the dashboard.
- Edit and delete these resources, subject to the relationship rules below.

Supported chart types are `bar`, `line`, `area`, `pie`, `number`, and `table`.

### Not in MVP

Authentication and multi-user permissions, scheduled refreshes, alerts, sharing, external database connectors, write-capable query execution, and advanced data modeling are out of scope unless separately specified.

## Domain Model

All entities have a stable `id`. Persisted JSON fields are validated at application boundaries and stored as JSON; their concrete schemas are versioned in code.

| Entity | Fields | Rules |
| --- | --- | --- |
| `DataSource` | `id`, `name`, `type` (`sqlite` or `csv`), `config` (JSON) | `config` is type-specific and validated before use. Credentials or secrets must not be exposed in API responses or logs. |
| `Workbook` | `id`, `name`, `description` | Owns its queries, charts, and dashboards. |
| `Query` | `id`, `workbookId`, `name`, `dataSourceId`, `mode` (`builder` or `sql`), `definition` (builder-step JSON), `sql` (text) | References an existing workbook and data source. The active mode determines which query representation is executed. Builder steps are translated to parameterized, read-only SQL. |
| `Chart` | `id`, `workbookId`, `queryId`, `type`, `config` (JSON) | References a query in the same workbook. The chart config is validated for its chart type and query result shape. |
| `Dashboard` | `id`, `workbookId`, `name`, `layout` (JSON) | References charts in the same workbook. Layout items identify a `chartId` and the grid coordinates/sizing required by `react-grid-layout`. |

Reject invalid or cross-workbook references. Deleting a resource must not leave dangling references: either reject deletion while dependents exist or remove/update dependents in one transaction. Choose one consistent policy before implementing deletion endpoints.

## Primary Workflows

1. Create a data source and verify that it can be read.
2. Create a workbook and add a query, selecting a data source and builder or SQL mode.
3. Execute the query and inspect its columns and bounded rows; save or revise the query.
4. Create a chart from a saved query and configure its type and fields.
5. Create a dashboard, add charts from its workbook, arrange and resize them, and persist the layout.

## Query Safety and Result Limits

- Query execution is read-only. Accept only one statement whose prepared SQLite statement is confirmed read-only; a prefix check or regular expression alone is not a sufficient safety check. Only `SELECT` and read-only `WITH` queries are supported. Reject statements that write, mutate schema, attach databases, or contain additional statements.
- Use a read-only SQLite connection where supported, and enforce read-only behavior at the SQLite statement/connection level as well as at input validation.
- Enforce a configurable maximum returned row count. Return an explicit indication when results were truncated.
- Enforce a query execution timeout using SQLite execution controls. Cancel/interrupt work that exceeds the limit and return a bounded, non-sensitive error.
- Use bound parameters for values; never interpolate user-provided values into SQL. Do not expose local file paths, raw driver errors, or sensitive source configuration in responses.
- Validate SQL-mode and builder-mode inputs with Zod. Builder translation must use an allowlist of supported operations and identifiers.
- CSV data sources are read-only. Parse and validate headers and rows before query use; never treat CSV content as executable SQL.

## Persistence and API

- Use SQLite through `better-sqlite3` and Drizzle ORM. Define schema and migrations in `src/lib/db`; keep driver and database access out of React components and route files.
- Route handlers live under `src/app/api`. Validate request bodies, route parameters, and query parameters with Zod before calling business logic. Return consistent JSON responses and appropriate HTTP status codes for validation, not-found, conflict, and execution errors.
- Put domain operations and query execution in `src/lib`. Keep persistence operations behind focused modules rather than duplicating them across routes.
- Persist workbooks, queries, charts, and dashboards, including their relationships. Persist data source configuration in a type-specific shape; store only what is needed to reopen the source.
- Use database transactions when an operation changes multiple related records.

## UI and Interaction

- Build the application shell and all interface/layout controls from the repository's shadcn/ui components. Use Sidebar, Tabs, Card, Dialog, Sheet, Select, Command, Popover, Resizable, ScrollArea, Table, Badge, Separator, and Skeleton where appropriate; compose shadcn primitives rather than introducing a parallel component system.
- Use Tailwind utilities for styling. Do not add another CSS framework or a custom component styling system.
- Use Recharts through shadcn chart components for visualizations, TanStack Table for query result tables, and `react-grid-layout` for dashboard arrangement.
- Keep forms and API boundaries schema-aligned. Present useful loading, empty, validation, and execution-error states; do not silently discard unsaved query or dashboard edits.
- Use Zustand only for client-side state that needs to be shared across components. Persist durable domain data through the API and database, not a client store.

## Intended Folder Structure

This is the target structure for feature work. The current starter has `app/`, `components/`, and `lib/` at the repository root; this specification does not move or rewrite those files. Adopt the `src/` layout when beginning implementation and keep aliases/configuration aligned with it.

```text
src/
  app/
    (workspace)/
      layout.tsx
      page.tsx
      workbooks/
        [workbookId]/
          page.tsx
          queries/
          charts/
          dashboards/
    api/
      data-sources/
      workbooks/
        [workbookId]/
          queries/
          charts/
          dashboards/
    globals.css
    layout.tsx
  components/
    ui/                 # shadcn/ui primitives
    layout/             # app shell and navigation compositions
    data-sources/       # data-source UI
    queries/            # query builder, SQL editor, results
    charts/             # chart configuration and rendering
    dashboards/         # dashboard and grid compositions
  lib/
    db/                 # Drizzle schema, client, migrations
    data-sources/       # source validation and adapters
    queries/            # schemas, builder translation, execution
    charts/             # chart config/result validation
    dashboards/         # layout validation and operations
    validations/        # shared Zod schemas
    utils.ts
  stores/               # Zustand client stores, if needed
```

Keep route handlers thin. Route-specific request/response schemas may live beside the relevant domain module under `src/lib` or in the route when they are truly local; shared schemas belong in `src/lib/validations`.

## MVP Acceptance Criteria

- A user can create and reopen a SQLite or CSV data source without exposing its local configuration.
- A workbook can contain queries, charts, and dashboards; references cannot cross workbook boundaries.
- Builder and SQL queries can be saved and executed as read-only operations, with validated inputs, a row cap, and a timeout.
- Query results expose column metadata and bounded rows suitable for a chart or table.
- Each supported chart type can be configured from a query and rendered with its data.
- A dashboard can show charts from its workbook, arrange/resize them, and retain its layout after reload.
- Invalid inputs, missing resources, unsafe queries, and query timeouts produce controlled errors rather than unhandled exceptions.
- TypeScript remains strict and the implementation uses no `any`.