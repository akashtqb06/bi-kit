import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isRegistrationAllowed } from './registration';

describe('Registration policy control', () => {
  const originalAllow = process.env.ALLOW_REGISTRATION;

  beforeEach(() => {
    delete process.env.ALLOW_REGISTRATION;
  });

  afterEach(() => {
    if (originalAllow !== undefined) process.env.ALLOW_REGISTRATION = originalAllow;
    else delete process.env.ALLOW_REGISTRATION;
  });

  it('rejects registration when ALLOW_REGISTRATION=false', async () => {
    process.env.ALLOW_REGISTRATION = 'false';
    const allowed = await isRegistrationAllowed();
    expect(allowed).toBe(false);
  });

  it('allows registration when ALLOW_REGISTRATION=true', async () => {
    process.env.ALLOW_REGISTRATION = 'true';
    const allowed = await isRegistrationAllowed();
    expect(allowed).toBe(true);
  });
});

