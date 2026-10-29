import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getAllowedOrigins,
  isAllowedOrigin,
  normalizeOrigin,
  validateRequestOrigin,
} from './origin';

describe('Origin and CSRF security verification', () => {
  const originalAppUrl = process.env.APP_URL;
  const originalExtra = process.env.APP_EXTRA_ORIGINS;

  beforeEach(() => {
    delete process.env.APP_URL;
    delete process.env.APP_EXTRA_ORIGINS;
  });

  afterEach(() => {
    if (originalAppUrl !== undefined) process.env.APP_URL = originalAppUrl;
    else delete process.env.APP_URL;
    if (originalExtra !== undefined) process.env.APP_EXTRA_ORIGINS = originalExtra;
    else delete process.env.APP_EXTRA_ORIGINS;
  });

  it('normalizes valid URLs and handles invalid strings', () => {
    expect(normalizeOrigin('http://localhost:3100/some/path')).toBe('http://localhost:3100');
    expect(normalizeOrigin('https://finance.local:8443')).toBe('https://finance.local:8443');
    expect(normalizeOrigin('not-a-valid-url')).toBeNull();
    expect(normalizeOrigin(null)).toBeNull();
  });

  it('builds allowed origins list from APP_URL and APP_EXTRA_ORIGINS', () => {
    process.env.APP_URL = 'http://localhost:3100';
    process.env.APP_EXTRA_ORIGINS = 'https://finance.local, http://192.168.1.50:3100 ';

    const allowed = getAllowedOrigins();
    expect(allowed.has('http://localhost:3100')).toBe(true);
    expect(allowed.has('https://finance.local')).toBe(true);
    expect(allowed.has('http://192.168.1.50:3100')).toBe(true);
    expect(allowed.size).toBe(3);
  });

  it('allows any origin when no APP_URL is configured (dev/test environment)', () => {
    expect(isAllowedOrigin('http://evil.com')).toBe(true);
    expect(isAllowedOrigin(null)).toBe(true);
  });

  it('strictly blocks untrusted origins when APP_URL is set', () => {
    process.env.APP_URL = 'http://localhost:3100';
    process.env.APP_EXTRA_ORIGINS = 'https://finance.local';

    expect(isAllowedOrigin('http://localhost:3100')).toBe(true);
    expect(isAllowedOrigin('https://finance.local')).toBe(true);
    expect(isAllowedOrigin('http://localhost:3000')).toBe(false);
    expect(isAllowedOrigin('http://evil-attacker.com')).toBe(false);
  });

  it('allows non-mutating requests regardless of origin', () => {
    process.env.APP_URL = 'http://localhost:3100';
    const getReq = new Request('http://localhost:3100/api/health', {
      method: 'GET',
      headers: { origin: 'http://evil.com' },
    });
    expect(validateRequestOrigin(getReq).ok).toBe(true);
  });

  it('validates and blocks mutating requests with untrusted origin', () => {
    process.env.APP_URL = 'http://localhost:3100';
    const postReq = new Request('http://localhost:3100/api/finance/accounts', {
      method: 'POST',
      headers: { origin: 'http://evil.com' },
    });
    const result = validateRequestOrigin(postReq);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("Untrusted origin 'http://evil.com'");
  });

  it('allows mutating requests from trusted origin', () => {
    process.env.APP_URL = 'http://localhost:3100';
    const postReq = new Request('http://localhost:3100/api/finance/accounts', {
      method: 'POST',
      headers: { origin: 'http://localhost:3100' },
    });
    expect(validateRequestOrigin(postReq).ok).toBe(true);
  });
});

