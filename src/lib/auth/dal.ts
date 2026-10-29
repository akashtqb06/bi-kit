import 'server-only';

import { redirect } from "next/navigation";
import { getSession } from "./session";
import type { SafeUser } from "./types";

export type { SafeUser };
// keep: used by RBAC phase
export { can, assertCan, visibleScope } from './policy';

function toSafeUser(user: NonNullable<Awaited<ReturnType<typeof getSession>>>["user"]): SafeUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    status: user.status,
    avatarUrl: user.avatarUrl,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
    mustChangePassword: user.mustChangePassword,
  };
}

export async function getCurrentUser(): Promise<SafeUser | null> {
  const session = await getSession();
  if (session) return toSafeUser(session.user);
  return null;
}

export async function requireUser(next = "/"): Promise<SafeUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  if (user.mustChangePassword && !next.startsWith('/settings/security')) {
    redirect('/settings/security?forced=true');
  }
  return user;
}

import { UnauthorizedError } from "./policy";

export async function requireUserApi(): Promise<SafeUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

export function requireRole(
  role: string,
  options: { api: true },
): Promise<SafeUser | Response>;
export function requireRole(role: string, options?: { api?: false; next?: string }): Promise<SafeUser>;
export async function requireRole(
  role: string,
  options: { api?: boolean; next?: string } = {},
): Promise<SafeUser | Response> {
  const user = await getCurrentUser();
  if (!user) {
    if (options.api) return Response.json({ error: "Unauthorized" }, { status: 401 });
    redirect(`/login?next=${encodeURIComponent(options.next ?? "/")}`);
  }
  if (user.role !== role) {
    if (options.api) return Response.json({ error: "Forbidden" }, { status: 403 });
    redirect("/?toast=forbidden");
  }
  if (!options.api && user.mustChangePassword && !options.next?.startsWith('/settings/security')) {
    redirect('/settings/security?forced=true');
  }
  return user;
}