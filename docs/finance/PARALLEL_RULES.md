# Parallel Development Rules & Ownership Map (Finance Module)

To enable seamless parallel development across multiple worktrees and AI agent sessions without merge conflicts or breaking assumptions, all sessions MUST strictly follow the ownership boundaries, merge sequence, and contract request rules defined in this document.

---

## 1. Golden Rules for All Sessions

1. **Own Your Files**: Edit ONLY files and folders inside your assigned `OWNS` scope. Do not touch another session's folder or files.
2. **Never Run `db:generate`**: Only Session 0 (Foundation) generates the database schema and migration. If you need a schema or contract change, submit a proposal to `docs/finance/CONTRACT_REQUESTS.md`.
3. **Isolated Worktrees**: Every session operates in its own worktree using its own `.env.local` pointing to an isolated PostgreSQL database (`DATABASE_URL=postgres://.../bikit_<session_name>`) and port. Never share or mutate another session's database.
4. **Base UI Rules**:
   - Use `onClick`, never `onSelect` for menu items and interactive primitives.
   - `nativeButton` prop must match the actual rendered DOM tag.
   - `DropdownMenuLabel` must be placed inside a `DropdownMenuGroup`.
   - Files marked `"use server"` must export ONLY async functions.
   - Auth-dependent Server Components must render inside a `<Suspense>` boundary.
5. **Quality Gate Before Finishing Turn**:
   - `pnpm tsc --noEmit`
   - `pnpm lint` (0 new errors)
   - `pnpm test`
   - `pnpm build`

---

## 2. Ownership Map

| Session | Focus Area | OWNS (Files & Directories) |
|---|---|---|
| **S0** | **Foundation, Schema & Contract Freeze** | `docs/finance/CONTRACT.md`, `docs/finance/PARALLEL_RULES.md`, `docs/finance/CONTRACT_REQUESTS.md`, `src/lib/db/schema/finance.ts`, `src/lib/db/migrations/0004_*.sql` (or finance migration), `src/lib/finance/contract.ts`, `src/lib/finance/constants.ts`, `src/lib/finance/service.ts`, `src/app/api/finance/**`, `src/lib/auth/policy.ts` (finance additions), `src/app/(app)/finance/**` (initial layout & stubs), `scripts/worktree-setup.sh`, `scripts/create-local-db.ts`, `src/components/finance/*/README.md`. |
| **S1** | **Domain Logic & DB Service** | `src/lib/finance/domain/**` (account math, balances, investment returns, FD/RD closed-form formulas), `src/lib/finance/db-service.ts`, `src/lib/finance/domain/**/*.test.ts`. |
| **S2** | **Finance UI Components & Quick-Add** | `src/components/finance/overview/**`, `src/components/finance/transactions/**`, `src/components/finance/accounts/**`, `src/components/finance/quick-add/**`, `src/components/finance/shared/**`, `src/app/(app)/finance/overview/**`, `src/app/(app)/finance/transactions/**`, `src/app/(app)/finance/accounts/**`. |
| **S3** | **Data Source Connectors & Virtual Tables** | `src/lib/connectors/drivers/finance/**`, `src/lib/finance/virtual-tables/**`, connector provisioning, virtual table query compilation and registration in BI Kit query engine. |
| **S4** | **Test Data, Mock Service & Day-by-Day Simulator** | `src/lib/finance/mock-service.ts`, `src/lib/finance/fixtures/**`, `scripts/seed/finance.ts`, FD/RD day-by-day continuous simulation tests cross-checking S1 (1 rupee tolerance). |
| **S5** | **Storage, Deployment, Operations & Cron Auth** | `src/lib/finance/cron-auth.ts`, `src/lib/finance/storage/**`, `vercel.json` (cron jobs), deployment guides and operational runbooks. |
| **S6a** | **Recurring Transactions** | `src/components/finance/recurring/**`, `src/app/(app)/finance/recurring/**`, recurring rule execution logic in `src/lib/finance/domain/recurring.ts`. |
| **S6b** | **Budgets & Spending Goals** | `src/components/finance/budgets/**`, `src/app/(app)/finance/budgets/**`, budget progress and alert computation logic. |
| **S6c** | **Import Engine (Bank Statements)** | `src/components/finance/import/**`, `src/app/(app)/finance/import/**`, statement CSV/OFX parser, deduplication and categorization suggestion logic. |
| **S6d** | **PWA & Mobile Quick-Add** | `public/manifest.json`, mobile meta tags, offline service worker caching for quick-add and transaction entry. |

---

## 3. Merge Order

To avoid dependency deadlocks, parallel branches should merge into `develop` in the following sequence:

```
Step 1: S0 (Foundation, Schema, Contracts, Stubs) -> develop
Step 2: S4 (Mock Service & Fixtures) + S1 (Domain Math & DB Service) -> develop
Step 3: S2 (Core UI & Quick-Add) + S3 (Virtual Tables & Connectors) -> develop
Step 4: S6a (Recurring), S6b (Budgets), S6c (Import), S6d (PWA) -> develop
Step 5: S5 (Ops, Cron & Production Deployment) -> develop
```

---

## 4. Contract Request Protocol

If a session discovers that a database column, type definition, API endpoint, or validation rule needs modification:

1. **DO NOT edit `src/lib/db/schema/finance.ts` or `src/lib/finance/contract.ts`**.
2. Open `docs/finance/CONTRACT_REQUESTS.md`.
3. Append a new entry following the template:
   ```markdown
   ### [CR-XXX] Short Title
   - **Requester**: Session ID (e.g. S2, S6c)
   - **Date**: YYYY-MM-DD
   - **What**: Exact description of requested addition or modification.
   - **Why**: Justification and blocked functionality.
   - **Proposal**: Concrete TypeScript / Zod / SQL snippet.
   - **Workaround in progress**: How the session is continuing work without being blocked.
   - **Status**: PENDING | APPROVED | REJECTED
   ```
4. Continue with your workaround (e.g. local adapter, uncommitted metadata field, or mock response) or temporarily skip the blocked edge case.

