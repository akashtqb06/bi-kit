/**
 * Origin and CSRF validation for mutating requests.
 * Trusts exactly APP_URL (+ optional APP_EXTRA_ORIGINS).
 */

export function normalizeOrigin(urlString?: string | null): string | null {
  if (!urlString) return null;
  try {
    const parsed = new URL(urlString);
    return `${parsed.protocol}//${parsed.host}`.toLowerCase();
  } catch {
    return null;
  }
}

export function getAllowedOrigins(): Set<string> {
  const allowed = new Set<string>();

  const appUrl = process.env.APP_URL;
  if (appUrl) {
    const norm = normalizeOrigin(appUrl);
    if (norm) allowed.add(norm);
  }

  const extra = process.env.APP_EXTRA_ORIGINS;
  if (extra) {
    for (const raw of extra.split(',')) {
      const trimmed = raw.trim();
      if (trimmed) {
        const norm = normalizeOrigin(trimmed);
        if (norm) allowed.add(norm);
      }
    }
  }

  return allowed;
}

/**
 * Returns true if the origin is trusted according to APP_URL and APP_EXTRA_ORIGINS.
 * If APP_URL is not set (e.g., in development or tests), returns true.
 */
export function isAllowedOrigin(originHeader?: string | null): boolean {
  const allowed = getAllowedOrigins();
  // If no trusted origins are defined (dev/test), allow
  if (allowed.size === 0) {
    return true;
  }

  if (!originHeader) {
    // If no Origin header was sent (e.g. same-origin GET/form or non-browser client)
    return true;
  }

  const normalized = normalizeOrigin(originHeader);
  if (!normalized) {
    return false;
  }

  return allowed.has(normalized);
}

/**
 * Validates request origin against allowed origins for mutating HTTP methods.
 */
export function validateRequestOrigin(request: Request): { ok: boolean; reason?: string } {
  const method = request.method.toUpperCase();
  const mutatingMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];

  if (!mutatingMethods.includes(method)) {
    return { ok: true };
  }

  const origin = request.headers.get('origin');
  if (origin && !isAllowedOrigin(origin)) {
    return {
      ok: false,
      reason: `Untrusted origin '${origin}'. Allowed origins: ${Array.from(getAllowedOrigins()).join(', ')}`,
    };
  }

  return { ok: true };
}

