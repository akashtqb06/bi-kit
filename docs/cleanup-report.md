# Knip Codebase Cleanup Report

## Summary
- **Dead files removed**: 15 files
- **Barrel files removed**: 4 unused `index.ts` files
- **Unused exports removed**: `ConflictError`, `ConnectorError`, `UnauthorizedError` from `@src/app/api/utils`
- **RBAC Extension Points preserved**: Preserved all functions marked with `// keep: used by RBAC phase` in `src/lib/auth/dal.ts` and `src/lib/auth/policy.ts` (`forbiddenResponse`, `visibleScope`, etc.).
- **Build/Config dependencies preserved**: `tailwindcss`, `@tailwindcss/postcss`, `tw-animate-css`, `shadcn`, `postcss`, `drizzle-kit`, `tsx`, `better-sqlite3`, `react-day-picker`.

---

## 1. Deleted Files
The following files were flagged as unused by Knip and confirmed by manual repository-wide grep to have zero external usages:

| File Path | Type | Reason |
| :--- | :--- | :--- |
| `src/lib/finance/domain/index.ts` | Barrel file | Zero imports; domain consumers import directly from specific modules |
| `src/lib/finance/import/index.ts` | Barrel file | Zero imports; import consumers import from submodules |
| `src/lib/finance/provision/index.ts` | Barrel file | Zero imports |
| `src/lib/finance/provision/action.ts` | Dead Action | `provisionMyFinanceWorkspace` was unreferenced |
| `src/lib/pwa/index.ts` | Barrel file | Zero active imports |
| `src/lib/pwa/sw-register.ts` | Dead PWA file | Only imported by dead `index.ts` |
| `src/lib/pwa/use-pwa.ts` | Dead PWA file | Only imported by dead `index.ts` |
| `src/components/finance/shared/install-prompt.tsx` | Dead Component | Unreferenced PWA prompt component |
| `src/lib/finance/budgets/index.ts` | Barrel file | Unused budget barrel |
| `src/components/finance/budgets/budget-card.tsx` | Unintegrated Component | Superseded by placeholder view (session S6b) |
| `src/components/finance/budgets/budget-dialog.tsx` | Unintegrated Component | Superseded by placeholder view; caused cascading render lint error |
| `src/components/finance/budgets/budget-month-selector.tsx` | Unintegrated Component | Superseded by placeholder view |
| `src/components/finance/budgets/budget-overview-widget.tsx` | Unintegrated Component | Superseded by placeholder view |
| `src/components/finance/budgets/budget-summary-header.tsx` | Unintegrated Component | Superseded by placeholder view |
| `src/components/finance/budgets/fixtures.ts` | Dead Fixtures | Unused budget fixture data |

---

## 2. Unused Exports Cleaned
- `src/app/api/utils.ts`:
  - Removed re-exports of `ConflictError`, `ConnectorError`, and `UnauthorizedError` which were unused from `utils.ts` (callers import from `@src/lib/auth/policy` and `@src/lib/connectors/types` directly).

---

## 4. Final Knip Audit Status
- **Unused Files**: **0** (All active code is referenced and reachable)
- **Unlisted Binaries**: **0** (`esbuild` tracked in `ignoreBinaries` for `build:scripts`)
- **Unused Dependencies**: **0** (All production dependencies are verified)
- **Preserved Public API Surface**: Domain dialect classes (`PostgresDialect`, `MysqlDialect`, `SqliteDialect`, `MssqlDialect`), connector definitions, and schema types are intentionally preserved as the public integration API for extensible data source connectors.
