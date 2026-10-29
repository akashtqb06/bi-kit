import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ServiceWorkerHandler,
  SessionMemoryCache,
  SHELL_CACHE_NAME,
  APP_SHELL_URLS,
} from '../service-worker';

describe('PWA Service Worker & Cache Boundary Rules', () => {
  let handler: ServiceWorkerHandler;
  let sessionCache: SessionMemoryCache;
  let mockCacheStorage: {
    open: ReturnType<typeof vi.fn>;
    keys: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  let mockCache: {
    put: ReturnType<typeof vi.fn>;
    match: ReturnType<typeof vi.fn>;
    addAll: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    sessionCache = new SessionMemoryCache();
    handler = new ServiceWorkerHandler(sessionCache);

    mockCache = {
      put: vi.fn().mockResolvedValue(undefined),
      match: vi.fn().mockResolvedValue(null),
      addAll: vi.fn().mockResolvedValue(undefined),
    };

    mockCacheStorage = {
      open: vi.fn().mockResolvedValue(mockCache),
      keys: vi.fn().mockResolvedValue([SHELL_CACHE_NAME, 'old-cache-v0']),
      delete: vi.fn().mockResolvedValue(true),
    };
  });

  it('identifies authenticated finance API routes correctly', () => {
    expect(handler.isAuthenticatedApiRoute(new URL('https://example.com/api/finance/accounts'))).toBe(true);
    expect(handler.isAuthenticatedApiRoute(new URL('https://example.com/api/finance/transactions'))).toBe(true);
    expect(handler.isAuthenticatedApiRoute(new URL('https://example.com/api/auth/me'))).toBe(true);
    expect(handler.isAuthenticatedApiRoute(new URL('https://example.com/api/cron/recurring'))).toBe(true);
    expect(handler.isAuthenticatedApiRoute(new URL('https://example.com/finance/overview'))).toBe(false);
  });

  it('enforces network-first for API requests', async () => {
    const req = new Request('https://example.com/api/finance/accounts', { method: 'GET' });
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ accounts: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const response = await handler.handleFetch(req, mockCacheStorage as unknown as CacheStorage, mockFetch);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.accounts).toEqual([]);
  });

  it('NEVER caches authenticated API responses into persistent CacheStorage', async () => {
    const req = new Request('https://example.com/api/finance/transactions', { method: 'GET' });
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ transactions: [{ id: 'tx-secret' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    await handler.handleFetch(req, mockCacheStorage as unknown as CacheStorage, mockFetch);

    // Persistent cache.put must NOT have been called with authenticated data
    expect(mockCache.put).not.toHaveBeenCalled();
  });

  it('clears session ephemeral cache without lingering persistent records', async () => {
    const req = new Request('https://example.com/api/finance/accounts', { method: 'GET' });
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ accounts: [{ id: 'acc-1' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    // Populates session cache
    await handler.handleFetch(req, mockCacheStorage as unknown as CacheStorage, mockFetch);

    // Offline request retrieves session cache
    const offlineFetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch (offline)'));
    let res = await handler.handleFetch(req, mockCacheStorage as unknown as CacheStorage, offlineFetch);
    let data = await res.json();
    expect(data.accounts[0].id).toBe('acc-1');

    // Clear session cache (simulating session end / logout / tab close)
    handler.clearSessionCache();

    // Now offline request returns synthesized offline fallback instead of stale session data
    res = await handler.handleFetch(req, mockCacheStorage as unknown as CacheStorage, offlineFetch);
    data = await res.json();
    expect(data.offline).toBe(true);
    expect(data.accounts).toEqual([]);
  });

  it('precaches App Shell routes and cleans old caches', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('OK', { status: 200 }));

    await handler.precacheAppShell(mockCacheStorage as unknown as CacheStorage, mockFetch);

    expect(mockCacheStorage.open).toHaveBeenCalledWith(SHELL_CACHE_NAME);
    expect(mockCache.put).toHaveBeenCalledTimes(APP_SHELL_URLS.length);

    await handler.cleanOldCaches(mockCacheStorage as unknown as CacheStorage);
    expect(mockCacheStorage.delete).toHaveBeenCalledWith('old-cache-v0');
    expect(mockCacheStorage.delete).not.toHaveBeenCalledWith(SHELL_CACHE_NAME);
  });

  it('falls back to cached App Shell during offline navigation', async () => {
    const navReq = new Request('https://example.com/finance/overview', {
      headers: { accept: 'text/html' },
    });
    Object.defineProperty(navReq, 'mode', { value: 'navigate' });

    mockCache.match.mockImplementation(async (target) => {
      const url = typeof target === 'string' ? target : target.url;
      if (url === '/finance' || url === 'https://example.com/finance/overview') {
        return new Response('<html>Cached App Shell</html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        });
      }
      return null;
    });

    const mockFetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const response = await handler.handleFetch(navReq, mockCacheStorage as unknown as CacheStorage, mockFetch);

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('Cached App Shell');
  });
});
