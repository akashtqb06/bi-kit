/**
 * RBAC extension point: the next phase can add a resource_shares table and
 * union its grants into these rules and visible list scopes.
 */
import { eq, type SQL } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";

export type Action = "view" | "edit" | "delete" | "share" | "create";
// keep: used by RBAC phase
export type ResourceType =
  | "workbook"
  | "dashboard"
  | "chart"
  | "query"
  | "data_source"
  | "user"
  | "data_store_table"
  | "fin_account"
  | "fin_category"
  | "fin_transaction"
  | "fin_valuation"
  | "fin_budget"
  | "fin_recurring_rule";

export const FINANCE_RESOURCE_TYPES: ResourceType[] = [
  "fin_account",
  "fin_category",
  "fin_transaction",
  "fin_valuation",
  "fin_budget",
  "fin_recurring_rule",
];

export function isFinanceResource(type: ResourceType): boolean {
  return FINANCE_RESOURCE_TYPES.includes(type);
}

export function isDataStoreResource(type: ResourceType): boolean {
  return type === "data_store_table";
}

export type Resource = {
  type: ResourceType;
  id?: string;
  ownerId?: string;
  workbookId?: string;
};

export type PolicyUser = { id: string; role: string };

type Rule = (user: PolicyUser, action: Action, resource: Resource) => boolean | null;

const rules: Rule[] = [
  // Strict OWNER-ONLY rule for Data Store resources (no admin override)
  (user, action, resource) => {
    if (isDataStoreResource(resource.type)) {
      if (action === "create") {
        return !resource.ownerId || resource.ownerId === user.id ? true : false;
      }
      return resource.ownerId === user.id ? true : false;
    }
    return null;
  },
  // Strict OWNER-ONLY rule for finance resources (no admin override)
  (user, action, resource) => {
    if (isFinanceResource(resource.type)) {
      if (action === "create") {
        return !resource.ownerId || resource.ownerId === user.id ? true : false;
      }
      return resource.ownerId === user.id ? true : false;
    }
    return null;
  },
  (user) => (user.role === "admin" ? true : null),
  (user, _action, resource) =>
    user.role === "member" && resource.ownerId === user.id ? true : null,
  (user, action, resource) =>
    user.role === "member" && action === "create" && resource.type !== "user" ? true : null,
];

export function can(user: PolicyUser, action: Action, resource: Resource): boolean {
  for (const rule of rules) {
    const result = rule(user, action, resource);
    if (result !== null) return result;
  }
  return false;
}

import { NotFoundError } from "@src/lib/connectors/types";
export { NotFoundError };

export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export function assertCan(user: PolicyUser, action: Action, resource: Resource): void {
  if (!can(user, "view", resource)) {
    throw new NotFoundError("Not found");
  }
  if (!can(user, action, resource)) {
    throw new ForbiddenError();
  }
}

// keep: used by RBAC phase
export function forbiddenResponse(error: unknown): Response | null {
  return error instanceof ForbiddenError ? Response.json({ error: "Forbidden" }, { status: 403 }) : null;
}

// keep: used by RBAC phase
export function visibleScope(
  user: PolicyUser,
  type: ResourceType,
): (ownerIdColumn: AnySQLiteColumn) => SQL | undefined {
  return (ownerIdColumn) => {
    if (isFinanceResource(type)) {
      return eq(ownerIdColumn, user.id);
    }
    if (user.role === "admin") return undefined;
    // TODO: Union shared resources from resource_shares into this scope.
    void type;
    return eq(ownerIdColumn, user.id);
  };
}