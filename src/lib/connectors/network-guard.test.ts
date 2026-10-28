import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
    assertHostAllowed,
    isPrivateOrReservedIp,
    resolvePinned,
} from './network-guard';
import { NetworkGuardError } from './errors';

describe('Network Guard', () => {
    const origEnv = { ...process.env };

    beforeEach(() => {
        delete process.env.CONNECTOR_HOST_ALLOWLIST;
        delete process.env.CONNECTOR_HOST_DENYLIST;
        delete process.env.CONNECTOR_NETWORK_POLICY;
    });

    afterEach(() => {
        process.env = { ...origEnv };
    });

    it('identifies private, loopback, and cloud metadata IPs', () => {
        // Cloud metadata
        expect(isPrivateOrReservedIp('169.254.169.254')).toBe(true);
        expect(isPrivateOrReservedIp('169.254.1.1')).toBe(true);
        expect(isPrivateOrReservedIp('fe80::1')).toBe(true);
        expect(isPrivateOrReservedIp('fd00:ec2::254')).toBe(true);

        // Loopback
        expect(isPrivateOrReservedIp('127.0.0.1')).toBe(true);
        expect(isPrivateOrReservedIp('::1')).toBe(true);

        // RFC 1918 Private
        expect(isPrivateOrReservedIp('10.0.0.1')).toBe(true);
        expect(isPrivateOrReservedIp('172.16.0.1')).toBe(true);
        expect(isPrivateOrReservedIp('192.168.1.1')).toBe(true);

        // Public IPs
        expect(isPrivateOrReservedIp('8.8.8.8')).toBe(false);
        expect(isPrivateOrReservedIp('1.1.1.1')).toBe(false);
        expect(isPrivateOrReservedIp('2606:4700:4700::1111')).toBe(false);
    });

    it('blocks cloud metadata endpoints unconditionally', async () => {
        await expect(assertHostAllowed('169.254.169.254')).rejects.toThrow(NetworkGuardError);
        await expect(assertHostAllowed('169.254.169.254')).rejects.toMatchObject({
            code: 'METADATA_IP_BLOCKED',
        });
    });

    it('blocks dangerous ports like SSH and SMTP', async () => {
        await expect(assertHostAllowed('8.8.8.8', 22)).rejects.toThrow(/Port 22 is blocked/);
        await expect(assertHostAllowed('8.8.8.8', 25)).rejects.toThrow(/Port 25 is blocked/);
    });

    it('blocks private IPs when CONNECTOR_NETWORK_POLICY is public-only', async () => {
        process.env.CONNECTOR_NETWORK_POLICY = 'public-only';
        await expect(assertHostAllowed('192.168.1.100')).rejects.toThrow(NetworkGuardError);
        await expect(assertHostAllowed('10.0.0.5')).rejects.toThrow(NetworkGuardError);
        await expect(assertHostAllowed('127.0.0.1')).rejects.toThrow(NetworkGuardError);
    });

    it('enforces CONNECTOR_HOST_DENYLIST', async () => {
        process.env.CONNECTOR_HOST_DENYLIST = 'badhost.internal,evil.com,192.168.1.50';
        await expect(assertHostAllowed('badhost.internal')).rejects.toThrow(/explicitly denied/);
        await expect(assertHostAllowed('evil.com')).rejects.toThrow(/explicitly denied/);
        await expect(assertHostAllowed('192.168.1.50')).rejects.toThrow(/explicitly denied/);
    });

    it('enforces CONNECTOR_HOST_ALLOWLIST', async () => {
        process.env.CONNECTOR_HOST_ALLOWLIST = 'localhost,8.8.8.8,1.1.1.0/24';
        // Denies host not in allowlist
        await expect(assertHostAllowed('9.9.9.9')).rejects.toThrow(/allowed host list/);
        // Allows exact IP match
        await expect(assertHostAllowed('8.8.8.8')).resolves.toBeUndefined();
        // Allows CIDR match
        await expect(assertHostAllowed('1.1.1.5')).resolves.toBeUndefined();
        // Allows localhost
        await expect(assertHostAllowed('localhost')).resolves.toBeUndefined();
    });

    it('resolvePinned validates host and returns pinned IP', async () => {
        const pinned = await resolvePinned('127.0.0.1', 5433);
        expect(pinned.ip).toBe('127.0.0.1');
        expect(pinned.port).toBe(5433);
    });
});
