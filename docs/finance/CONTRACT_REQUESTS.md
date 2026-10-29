# Contract Change Requests (Finance Module)

This file tracks all proposed schema, API, or contract adjustments submitted by parallel development sessions.
Only Session 0 (or a designated consolidation lead) reviews and applies updates to the frozen contract.

---

## Log of Change Requests

### [CR-001] Wire MockFinanceService in src/lib/finance/service.ts
- **Requester**: S4
- **Date**: 2026-10-28
- **What**: In `src/lib/finance/service.ts`, import `MockFinanceService` from `@src/lib/finance/mock-service` instead of the stub throwing `NotImplementedError`.
- **Why**: Allows the Next.js API routes under `/api/finance/*` to serve in-memory mock data when `FINANCE_BACKEND=mock` is set.
- **Proposal**:
```typescript
import { MockFinanceService } from './mock-service';
export { MockFinanceService };
```
- **Workaround in progress**: S4 provides full implementation in `src/lib/finance/mock-service`, exports it, and verifies it with in-memory parity and oracle tests. S0 / merge lead to apply the wiring upon branch merge.
- **Status**: PENDING

### [CR-002] Relax RD Day-by-Day Simulation Tolerance in CONTRACT.md
- **Requester**: S4
- **Date**: 2026-10-28
- **What**: Relax the day-by-day continuous ledger simulation tolerance for Recurring Deposits (RD) from 100 paise (1 INR) to 1,500 paise (15 INR) or specify the calendar day convention.
- **Why**: The closed-form formula in CONTRACT.md assumes uniform 30-day periods with fractional quarterly powers $(1 + r/4)^{k/3}$. In a true day-by-day continuous ledger simulation using actual calendar month lengths (31, 28, 31, 30 days) and quarterly compounding dates, accumulated simple daily interest over partial quarters yields ~1,068 paise (10.68 INR) higher interest on a 12-month 5,000 INR RD at 7%.
- **Proposal**:
Update CONTRACT.md Section 4.2 to specify: "Simulation Cross-Check: S1 implements the closed-form math; S4 verifies by day-by-day continuous ledger simulation with an allowed tolerance of 1,500 paise (15 INR) for RD to account for varying monthly calendar days (28-31) and quarterly interest capitalization points."
- **Workaround in progress**: S4 documents the exact difference in `oracle.json` under `rdSimulation.differencePaise` and tests for mathematical consistency.
- **Status**: PENDING

### [CR-003] Explicit Day of Month Column on fin_recurring_rules
- **Requester**: S6a (Recurring Transactions)
- **Date**: 2026-10-28
- **What**: Add an explicit integer column `day_of_month` (values 1 to 31) to `fin_recurring_rules` and `recurringRuleSchema` / DTOs.
- **Why**: Allows users to explicitly specify the desired calendar day of the month for monthly, quarterly, and yearly recurrences (e.g., day 31, 15, or 1) rather than inferring from `startDate` or storing a `[DOM:XX]` metadata tag in `note`. Enables clearer UI day-of-month picking and cleaner persistence across edits.
- **Proposal**:
```typescript
// In src/lib/db/schema/finance.ts:
dayOfMonth: integer('day_of_month'),

// In src/lib/finance/contract.ts:
dayOfMonth: z.number().int().min(1).max(31).optional(),
```
- **Workaround in progress**: S6a stores and parses `[DOM:XX]` tag within `note` and falls back to the day component of `startDate` (`startDate.split('-')[2]`). Clamping logic is fully operational without schema changes.
- **Status**: PENDING

### [CR-003] Link Manifest & Mount PWA Components in Finance Layout
- **Requester**: S6d
- **Date**: 2026-10-28
- **What**: In `src/app/(app)/finance/layout.tsx` (owned by S0), add `<link rel="manifest" href="/manifest.webmanifest">`, mobile viewport/theme-color meta tags, mount `<InstallPrompt />` / `<PendingSyncIndicator />` from `@src/components/finance/shared/install-prompt`, and register the Service Worker via `@src/lib/pwa`.
- **Why**: S0 owns `src/app/(app)/finance/layout.tsx` and Next.js route layouts. Browsers automatically discover PWA manifests when linked in layout heads, and mobile users see the 3rd-visit install prompt and offline sync indicator across all finance tabs.
- **Proposal**:
```tsx
// In src/app/(app)/finance/layout.tsx
import { InstallPrompt, PendingSyncIndicator } from '@/src/components/finance/shared/install-prompt';

// Inside layout JSX header / main:
<div className="flex items-center gap-2">
  <PendingSyncIndicator compact />
</div>
...
<InstallPrompt />
```
- **Workaround in progress**: S6d implements and verifies all PWA modules in `src/lib/pwa/**`, `public/manifest.webmanifest`, `public/icons/**`, and `src/components/finance/shared/install-prompt.tsx`. Components are exportable and verified with 28 automated tests. S0 / merge lead to mount the components into the finance layout during Step 4 consolidation.
- **Status**: PENDING

### [CR-004] Add Rollover Flag to fin_budgets Schema and BudgetDTO
- **Requester**: S6b
- **Date**: 2026-10-28
- **What**: In `src/lib/db/schema/finance.ts`, add `rollover: boolean('rollover').notNull().default(false)` (or `metadata: jsonb('metadata')`) to `fin_budgets`. In `src/lib/finance/contract.ts`, add `rollover: z.boolean().default(false).optional()` to `budgetSchema`, `createBudgetSchema`, and `updateBudgetSchema`.
- **Why**: Allows users to specify whether category budget surpluses/deficits should automatically roll over into the next month on a per-budget basis in the database.
- **Proposal**:
```typescript
// In src/lib/db/schema/finance.ts:
export const finBudgets = pgTable('fin_budgets', {
  // ...
  rollover: boolean('rollover').notNull().default(false),
});

// In src/lib/finance/contract.ts:
export const budgetSchema = z.object({
  // ...
  rollover: z.boolean().default(false),
});
export const createBudgetSchema = z.object({
  // ...
  rollover: z.boolean().optional().default(false),
});
```
- **Workaround in progress**: S6b supports full rollover math and month-to-month surplus/deficit calculation in `src/lib/finance/budgets/progress.ts`. The UI maintains rollover toggles via client state and local storage, applying effective budgets seamlessly.
- **Status**: PENDING

---

## Request Template

```markdown
### [CR-XXX] Short Title
- **Requester**: Session ID (e.g. S1, S2, S3)
- **Date**: YYYY-MM-DD
- **What**: Description of requested change
- **Why**: Use-case or rationale
- **Proposal**: Concrete TypeScript / Zod / Drizzle SQL code snippet
- **Workaround in progress**: Active non-blocking workaround
- **Status**: PENDING
```

