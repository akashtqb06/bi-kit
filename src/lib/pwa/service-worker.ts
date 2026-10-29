export const SHELL_CACHE_NAME = 'bikit-finance-shell-v1';
export const SESSION_CACHE_NAME = 'bikit-finance-session-ephemeral';

export const APP_SHELL_URLS = [
  '/finance',
  '/finance/overview',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon.svg',
];

/**
 * Ephemeral in-memory store for session-scoped data.
 * Does NOT persist beyond the active session/worker lifecycle.
 */
export class SessionMemoryCache {
  private memory = new Map<string, { body: string; headers: [string, string][]; status: number }>();

  async put(url: string, response: Response): Promise<void> {
    try {
      const cloned = response.clone();
      const body = await cloned.text();
      const headers = Array.from(cloned.headers.entries());
      this.memory.set(url, { body, headers, status: cloned.status });
    } catch {
      // Ignore caching errors
    }
  }

  get(url: string): Response | null {
    const item = this.memory.get(url);
    if (!item) return null;
    return new Response(item.body, {
      status: item.status,
      headers: new Headers(item.headers),
    });
  }

  clear(): void {
    this.memory.clear();
  }
}

/**
 * Core caching strategies for the Service Worker.
 * Follows strict rule: Do not cache authenticated API responses beyond the session.
 */
export class ServiceWorkerHandler {
  private sessionCache: SessionMemoryCache;

  constructor(sessionCache?: SessionMemoryCache) {
    this.sessionCache = sessionCache || new SessionMemoryCache();
  }

  /**
   * Determine if a request URL points to an authenticated finance API endpoint.
   */
  isAuthenticatedApiRoute(url: URL): boolean {
    return (
      url.pathname.startsWith('/api/finance/') ||
      url.pathname.startsWith('/api/auth/') ||
      url.pathname.startsWith('/api/cron/')
    );
  }

  /**
   * Determine if a request URL points to the general API.
   */
  isApiRoute(url: URL): boolean {
    return url.pathname.startsWith('/api/');
  }

  /**
   * Determine if a request is for an app shell or static asset.
   */
  isAppShellRoute(url: URL): boolean {
    if (APP_SHELL_URLS.includes(url.pathname)) return true;
    if (url.pathname.startsWith('/_next/static/')) return true;
    if (url.pathname.startsWith('/icons/')) return true;
    return false;
  }

  /**
   * Handle fetch request according to PWA routing strategy.
   */
  async handleFetch(
    request: Request,
    cachesStore?: CacheStorage,
    fetchFn: typeof fetch = fetch
  ): Promise<Response> {
    const url = new URL(request.url);

    // Non-GET requests (e.g. POST, PUT, DELETE) pass directly to network
    if (request.method !== 'GET') {
      return fetchFn(request);
    }

    // 1. API Calls: Network-First Strategy
    if (this.isApiRoute(url)) {
      try {
        const response = await fetchFn(request);

        // Rule: Do not cache authenticated API responses beyond the session.
        if (response.ok && this.isAuthenticatedApiRoute(url)) {
          // Session-only ephemeral cache (never written to persistent CacheStorage)
          await this.sessionCache.put(url.href, response);
        }

        return response;
      } catch (err) {
        // Network failure / offline
        if (this.isAuthenticatedApiRoute(url)) {
          // Check session memory cache first
          const cachedSessionResponse = this.sessionCache.get(url.href);
          if (cachedSessionResponse) {
            return cachedSessionResponse;
          }

          // Fallback offline response for finance APIs
          return new Response(
            JSON.stringify({
              offline: true,
              error: 'Network unavailable. Changes will sync automatically when connection is restored.',
              transactions: [],
              accounts: [],
            }),
            {
              status: 503,
              headers: {
                'Content-Type': 'application/json',
                'X-Offline-Fallback': 'true',
              },
            }
          );
        }

        throw err;
      }
    }

    // 2. Navigation / App Shell: Network-first with App Shell cache fallback
    if (request.mode === 'navigate' || request.destination === 'document') {
      try {
        const networkResponse = await fetchFn(request);
        if (networkResponse.ok && cachesStore) {
          const cache = await cachesStore.open(SHELL_CACHE_NAME);
          await cache.put(request, networkResponse.clone());
        }
        return networkResponse;
      } catch {
        if (cachesStore) {
          const cache = await cachesStore.open(SHELL_CACHE_NAME);
          const cached =
            (await cache.match(request)) ||
            (await cache.match('/finance')) ||
            (await cache.match('/finance/overview'));
          if (cached) return cached;
        }
        return new Response('Offline - App Shell Unavailable', { status: 503 });
      }
    }

    // 3. Static Assets: Cache-First with Network fallback
    if (this.isAppShellRoute(url)) {
      if (cachesStore) {
        const cache = await cachesStore.open(SHELL_CACHE_NAME);
        const cached = await cache.match(request);
        if (cached) return cached;

        try {
          const networkResponse = await fetchFn(request);
          if (networkResponse.ok) {
            await cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        } catch {
          return new Response('Asset Unavailable Offline', { status: 503 });
        }
      }
    }

    // Default: network pass-through
    return fetchFn(request);
  }

  /**
   * Pre-cache app shell assets into CacheStorage.
   */
  async precacheAppShell(cachesStore: CacheStorage, fetchFn: typeof fetch = fetch): Promise<void> {
    const cache = await cachesStore.open(SHELL_CACHE_NAME);
    await Promise.all(
      APP_SHELL_URLS.map(async (url) => {
        try {
          const response = await fetchFn(url);
          if (response.ok) {
            await cache.put(url, response);
          }
        } catch {
          // Precache failure is non-fatal during installation
        }
      })
    );
  }

  /**
   * Remove obsolete caches on service worker activation.
   */
  async cleanOldCaches(cachesStore: CacheStorage): Promise<void> {
    const keys = await cachesStore.keys();
    await Promise.all(
      keys
        .filter((key) => key !== SHELL_CACHE_NAME)
        .map((key) => cachesStore.delete(key))
    );
  }

  clearSessionCache(): void {
    this.sessionCache.clear();
  }
}

/**
 * Raw service worker JavaScript script string for registration or standalone serving.
 */
export const SERVICE_WORKER_CODE = `
const SHELL_CACHE = '${SHELL_CACHE_NAME}';
const APP_SHELL = ${JSON.stringify(APP_SHELL_URLS)};
const sessionCache = new Map();

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => {
      return cache.addAll(APP_SHELL).catch(() => {});
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((k) => k !== SHELL_CACHE).map((k) => caches.delete(k))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method !== 'GET') return;

  // API calls: Network-first, NO persistent caching of authenticated responses beyond session
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(req).then((res) => {
        if (res.ok && url.pathname.startsWith('/api/finance/')) {
          // Ephemeral in-memory clone for active session only
          res.clone().text().then((body) => {
            sessionCache.set(url.href, { body, status: res.status, headers: Array.from(res.headers.entries()) });
          }).catch(() => {});
        }
        return res;
      }).catch(() => {
        const cached = sessionCache.get(url.href);
        if (cached) {
          return new Response(cached.body, { status: cached.status, headers: new Headers(cached.headers) });
        }
        return new Response(JSON.stringify({ offline: true, error: 'Offline - pending changes will sync on reconnect' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json', 'X-Offline': '1' }
        });
      })
    );
    return;
  }

  // Navigations: Network-first with App Shell fallback
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put(req, clone));
        }
        return res;
      }).catch(() => {
        return caches.match(req).then((cached) => cached || caches.match('/finance'));
      })
    );
    return;
  }

  // App shell / Static assets: Cache-first
  event.respondWith(
    caches.match(req).then((cached) => {
      return cached || fetch(req).then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put(req, clone));
        }
        return res;
      });
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data?.type === 'CLEAR_SESSION') {
    sessionCache.clear();
  }
});
`.trim();
