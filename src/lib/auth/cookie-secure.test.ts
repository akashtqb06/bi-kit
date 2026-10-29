import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isSecureCookie } from './session';

describe('Session cookie Secure flag derivation', () => {
  const originalAppUrl = process.env.APP_URL;

  beforeEach(() => {
    delete process.env.APP_URL;
  });

  afterEach(() => {
    if (originalAppUrl !== undefined) process.env.APP_URL = originalAppUrl;
    else delete process.env.APP_URL;
  });

  it('returns true when APP_URL uses https protocol', () => {
    process.env.APP_URL = 'https://finance.local';
    expect(isSecureCookie()).toBe(true);

    process.env.APP_URL = 'https://my-app.ts.net:8443';
    expect(isSecureCookie()).toBe(true);
  });

  it('returns false when APP_URL uses http protocol (e.g. localhost production container)', () => {
    process.env.APP_URL = 'http://localhost:3100';
    expect(isSecureCookie()).toBe(false);

    process.env.APP_URL = 'http://127.0.0.1:3000';
    expect(isSecureCookie()).toBe(false);
  });

  it('returns false when APP_URL is not set', () => {
    delete process.env.APP_URL;
    expect(isSecureCookie()).toBe(false);
  });
});

