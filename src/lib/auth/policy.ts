/**
 * RBAC extension point: the next phase can add a resource_shares table and
 * union its grants into these rules and visible list scopes.
 */
import { eq, type SQL } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";

export type Action = "view" | "edit" | "delete" | "share" | "create";
export type ResourceType = "workbook" | "dashboard" | "chart" | "query" | "data_source" | "user";
export type Resource = {
  type: ResourceType;
  id?: string;
  ownerId?: string;
  workbookId?: string;
};

export type PolicyUser = { id: string; role: string };

type Rule = (user: PolicyUser, action: Action, resource: Resource) => boolean | null;

const rules: Rule[] = [
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

export function forbiddenResponse(error: unknown): Response | null {
  return error instanceof ForbiddenError ? Response.json({ error: "Forbidden" }, { status: 403 }) : null;
}

export function visibleScope(
  user: PolicyUser,
  type: ResourceType,
): (ownerIdColumn: AnySQLiteColumn) => SQL | undefined {
  return (ownerIdColumn) => {
    if (user.role === "admin") return undefined;
    // TODO: Union shared resources from resource_shares into this scope.
    void type;
    return eq(ownerIdColumn, user.id);
  };
}