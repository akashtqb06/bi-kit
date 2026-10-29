# Feature Audit & Platform Capability Matrix

This document provides a comprehensive audit of the administration, platform settings, standalone dashboards, and security controls across BI Kit.

## 1. Audit Overview

### Settings Pages & Administration
| Route | Access | Existing Status | Target Implementation |
|---|---|---|---|
| `/settings/profile` | Member & Admin | Complete (Name, Avatar upload/remove) | Preserve |
| `/settings/security` | Member & Admin | Complete (Change password, rate limiting) | Integrate `mustChangePassword` forced reset flow & session invalidation |
| `/settings/sessions` | Member & Admin | Complete (List sessions, revoke) | Preserve |
| `/settings/appearance` | Member & Admin | Complete (Theme selection) | Preserve |
| `/settings/finance` | Member & Admin | Complete (Owner-only preferences) | Strictly owner-only; admins cannot view member finance data |
| `/settings/users` | Admin Only | Placeholder ("Coming soon") | DataTable, create user with temp password, role change, disable/enable, reset password, revoke sessions, delete with typed confirmation |
| `/settings/general` | Admin Only | Partial (Backup card + placeholder) | App settings (App name, registration toggle, session lifetime, allowed connectors), read-only environment cards, backup trigger/instructions |
| `/settings/audit` | Admin Only | Missing | Audit event log table, multi-field filters, CSV export, retention setting (180 days default), nightly purge |
| `/settings/roles` | Admin Only | Placeholder ("Coming soon") | Roles overview, capability matrix derived from `policy.ts`, "Sharing is coming" roadmap notice |

### Standalone Dashboards
| Route | Access | Audit Findings | Planned Corrections |
|---|---|---|---|
| `/dashboards` | Member & Admin | High functionality (tile & table views, favorites, recents), but uses `onSelect` in combobox commands; owner filtering properly scoped. | Replace `onSelect` with `onClick` / `onSelect` standard, ensure seamless real-data queries and strict policy check. |
| `/dashboards/[did]` | Member & Admin | Viewer functional with dynamic grid, filters, query runner, auto-refresh, and PNG export. | Validate policy scoping so non-admin members only view dashboards they own; verify error states. |

### Security & Hardening
| Area | Status Before Hardening | Target Status |
|---|---|---|
| Account Lockout | Generic rate-limit message | Explicit "Account locked" notification after consecutive failed attempts |
| Password Change | Sessions partially invalidated | Explicit invalidation of all other sessions upon password change |
| Security Headers & CSP | No CSP or hardening headers configured | Standard secure headers (`CSP`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`) |
| Data Sanitization in Logs | Best-effort | Explicit verification: zero passwords, secrets, or tokens logged |
| Sensitive Rate Limiting | `test` has basic limit; `[id]/test` unmetered | Uniform rate limiting across all auth and test-connection endpoints |
| Route Handler Auth Gate | Ad-hoc per route | Automated test enumerating all API routes and verifying 401 response without session |

---

## 2. Policy & Capability Matrix

Derived directly from `src/lib/auth/policy.ts`:

| Resource Type | Action | Admin Capability | Member Capability | Notes |
|---|---|---|---|---|
| **Workbooks** | View / Edit / Delete / Create | Full (Workspace-wide) | Own resources only | Scoped by `ownerId` |
| **Dashboards** | View / Edit / Delete / Create | Full (Workspace-wide) | Own resources only | Scoped by `ownerId` |
| **Charts** | View / Edit / Delete / Create | Full (Workspace-wide) | Own resources only | Attached to workbook query |
| **Queries** | View / Edit / Delete / Create | Full (Workspace-wide) | Own resources only | Attached to data source |
| **Data Sources** | View / Edit / Delete / Test | Full (Workspace-wide) | Own resources only | Scoped by `ownerId` |
| **Users** | View / Create / Edit / Delete | Full (Admin only) | None (Profile self-management only) | Last active admin cannot be deleted or demoted |
| **App Settings** | View / Edit | Full (Admin only) | None | Stored in `app_settings` |
| **Audit Logs** | View / Export / Purge | Full (Admin only) | None | System-wide visibility |
| **Data Store Tables** | View / Edit / Delete / Sync | **Strictly Owner-Only** | **Strictly Owner-Only** | Admins CANNOT view or access member tables |
| **Personal Finance** | View / Edit / Delete / Import | **Strictly Owner-Only** | **Strictly Owner-Only** | Admins CANNOT view or access member finances |

---

## 3. Implementation Plan & Commit Sequence

1. **Commit 1**: Users Admin (Settings > Users, user APIs, session guard for forced password change, last-admin protection, audit logs).
2. **Commit 2**: General Settings (App settings management, registration toggle, lifetime, connectors, read-only env, backup trigger).
3. **Commit 3**: Audit Log Viewer (Event viewer table, filters, CSV export, retention configuration, purge scheduler).
4. **Commit 4**: Roles & Permissions (Declarative roles matrix derived from policy, sharing roadmap notes).
5. **Commit 5**: Standalone Dashboards (Viewer and list verified with real data, fix UI event handlers).
6. **Commit 6**: Security Hardening (Lockout messages, session invalidation, secure headers/CSP, rate limits, 401 route audit test).
