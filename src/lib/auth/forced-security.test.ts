import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SafeUser } from './types';

const mockHeaders = new Map<string, string>();
const mockUser: { current: SafeUser | null } = { current: null };

vi.mock('next/headers', () => ({
  headers: async () => ({
    get: (key: string) => mockHeaders.get(key) ?? null,
  }),
  cookies: async () => ({
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  }),
}));

vi.mock('./session', () => ({
  getSession: async () => {
    if (!mockUser.current) return null;
    return {
      user: {
        ...mockUser.current,
        passwordHash: 'hash',
        updatedAt: new Date(),
      },
      session: {
        id: 's-1',
        userId: mockUser.current.id,
        token: 'token',
        expiresAt: new Date(Date.now() + 10000),
        createdAt: new Date(),
        updatedAt: new Date(),
        ipAddress: '127.0.0.1',
        userAgent: 'test',
      },
    };
  },
}));

let redirectTarget: string | null = null;
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    redirectTarget = url;
    throw new Error(`REDIRECT:${url}`);
  },
}));

import { requireUser, requireRole } from './dal';

describe('Forced password change security and redirect loop prevention', () => {
  beforeEach(() => {
    mockHeaders.clear();
    redirectTarget = null;
    mockUser.current = {
      id: 'u-1',
      email: 'newuser@example.com',
      name: 'New User',
      role: 'member',
      status: 'active',
      avatarUrl: null,
      createdAt: new Date(),
      lastLoginAt: null,
      mustChangePassword: true,
    };
  });

  it('does NOT redirect in layout (next="/") when request path is /settings/security', async () => {
    mockHeaders.set('x-pathname', '/settings/security');
    const user = await requireUser('/');
    expect(user.id).toBe('u-1');
    expect(redirectTarget).toBeNull();
  });

  it('does NOT redirect in settings layout (next="/settings") when request path is /settings/security', async () => {
    mockHeaders.set('x-pathname', '/settings/security');
    const user = await requireUser('/settings');
    expect(user.id).toBe('u-1');
    expect(redirectTarget).toBeNull();
  });

  it('does NOT redirect on the security page itself (next="/settings/security")', async () => {
    mockHeaders.set('x-pathname', '/settings/security');
    const user = await requireUser('/settings/security');
    expect(user.id).toBe('u-1');
    expect(redirectTarget).toBeNull();
  });

  it('redirects to /settings/security?forced=true when user tries to access /dashboards', async () => {
    mockHeaders.set('x-pathname', '/dashboards');
    await expect(requireUser('/dashboards')).rejects.toThrow('REDIRECT:/settings/security?forced=true');
    expect(redirectTarget).toBe('/settings/security?forced=true');
  });

  it('redirects to /settings/security?forced=true when user tries to access /settings/profile', async () => {
    mockHeaders.set('x-pathname', '/settings/profile');
    await expect(requireUser('/settings/profile')).rejects.toThrow('REDIRECT:/settings/security?forced=true');
    expect(redirectTarget).toBe('/settings/security?forced=true');
  });

  it('requireRole redirects to /settings/security?forced=true when admin must change password and is on /settings/users', async () => {
    mockUser.current = {
      ...mockUser.current!,
      role: 'admin',
      mustChangePassword: true,
    };
    mockHeaders.set('x-pathname', '/settings/users');
    await expect(requireRole('admin', { next: '/settings/users' })).rejects.toThrow('REDIRECT:/settings/security?forced=true');
    expect(redirectTarget).toBe('/settings/security?forced=true');
  });

  it('allows access normally when user does not have mustChangePassword', async () => {
    mockUser.current = {
      ...mockUser.current!,
      mustChangePassword: false,
    };
    mockHeaders.set('x-pathname', '/dashboards');
    const user = await requireUser('/dashboards');
    expect(user.id).toBe('u-1');
    expect(redirectTarget).toBeNull();
  });
});
