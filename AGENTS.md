# Repository Instructions

This repository is an MVP BI tool using Next.js App Router, TypeScript, shadcn/ui, SQLite (`better-sqlite3` with Drizzle), `react-grid-layout`, Recharts through shadcn charts, TanStack Table, Zod, and Zustand. The product scope and target organization are defined in [docs/SPEC.md](docs/SPEC.md).

## Architecture

- Keep business logic, validation shared across layers, database access, and query execution in `src/lib`.
- Keep UI in `src/components`; keep generated/composed shadcn primitives in `src/components/ui`.
- Keep route handlers in `src/app/api`. Route handlers validate and translate HTTP input/output, then delegate domain work to `src/lib`.
- Keep database schema, migrations, and client setup in `src/lib/db`. Use Drizzle for application persistence and `better-sqlite3` for SQLite access.
- Follow the target `src/` tree in `docs/SPEC.md`. The current Next starter files are at the repository root; do not move or rewrite them unless the task explicitly requires migration to the target tree.

## UI Rules

- Use shadcn/ui components for all layout and interface elements. Reuse the installed primitives and compose them where needed; do not introduce a parallel UI library or hand-built substitutes for available shadcn components.
- Use Tailwind utilities only for styling. Do not add a CSS framework or create a separate custom styling system.
- Use shadcn chart components backed by Recharts, TanStack Table for data tables, and `react-grid-layout` for dashboard layouts.
- Include appropriate loading, empty, error, and validation states for user-facing workflows.

## Data and API Rules

- Validate every API input, including path parameters, query parameters, and request bodies, with Zod before performing business operations.
- Keep Zod schemas close to their owning domain in `src/lib`; reuse the same schemas when input and persisted domain shape are shared.
- Enforce foreign-key and same-workbook relationships in business logic, not only in the UI.
- Use transactions for multi-record changes and prevent dangling query, chart, and dashboard references.
- Do not return private source configuration, local filesystem details, raw SQL driver errors, or other sensitive implementation details in API responses.

## Query Execution Safety

- Query execution is strictly read-only. Support only a single `SELECT` or read-only `WITH` statement.
- Do not rely on SQL prefix checks or regular expressions as the security boundary. Prepare the statement and verify SQLite reports it as read-only; enforce read-only connection/authorizer controls where available.
- Reject writes, schema changes, attachment commands, and multiple statements. Never expose mutation-capable query APIs.
- Bind all values as parameters. Builder operations and identifiers must come from explicit allowlists; never interpolate user input into SQL.
- Enforce both a maximum result row count and a query timeout. Report truncation and timeout explicitly, and interrupt timed-out work.
- Treat CSV inputs as data, not executable SQL. Validate their structure before making them queryable.

## TypeScript and State

- Keep TypeScript strict. Do not use `any`; prefer explicit domain types, inferred Zod types, and narrow unknown values at trust boundaries.
- Use Zustand only for shared client-side interaction state. Persist durable entities through the API and SQLite.
- Keep server-only database and filesystem modules out of client components and client bundles.
- Prefer small domain modules and focused components over monolithic route handlers or page components.

## Change Discipline

- Read [docs/SPEC.md](docs/SPEC.md) before changing domain behavior; keep implementation aligned with its MVP scope and acceptance criteria.
- Do not add product features outside the requested scope without explicit direction.
- Add or update focused tests for validation, resource relationships, and query safety when implementing those behaviors.
- When cleaning dependencies, preserve packages imported by CSS and build configuration such as `postcss.config.mjs`, `next.config.ts`, and `components.json`; static dependency scanners may not detect those imports.
- Run the relevant lint, typecheck, test, or build command for the changed code and report any check that could not be run.
- Do not add feature code when a task asks only for documentation or planning.

## Finance Module Rules & Parallel Worktrees

- All work on the Personal Finance module must adhere to the single source of truth in [docs/finance/CONTRACT.md](docs/finance/CONTRACT.md).
- Parallel AI sessions and developers must observe file boundaries, ownership, and merge order documented in [docs/finance/PARALLEL_RULES.md](docs/finance/PARALLEL_RULES.md).
- Never modify another session's owned files or edit the frozen schema/contract directly. Log proposed changes in [docs/finance/CONTRACT_REQUESTS.md](docs/finance/CONTRACT_REQUESTS.md).
- Personal Finance persistence runs on PostgreSQL via Drizzle (`drizzle-orm/pg-core`). Always run isolated worktrees with independent databases (`DATABASE_URL=postgres://.../bikit_<name>`).
- Finance resources are strictly OWNER-ONLY: neither regular members nor administrators may view, edit, or delete another user's financial data.


<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
