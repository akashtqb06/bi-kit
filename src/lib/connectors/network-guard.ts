import dns from 'node:dns/promises';
import net from 'node:net';
import { NetworkGuardError } from './errors';

// ---------------------------------------------------------------------------
// IP & CIDR Helpers
// ---------------------------------------------------------------------------

function ipv4ToNumber(ip: string): number {
    const parts = ip.split('.').map(Number);
    return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function isIpv4InCidr(ip: string, cidr: string): boolean {
    const [range, bitsStr] = cidr.split('/');
    const bits = parseInt(bitsStr, 10);
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    const ipNum = ipv4ToNumber(ip);
    const rangeNum = ipv4ToNumber(range);
    return (ipNum & mask) === (rangeNum & mask);
}

function ipv6ToBigInt(ip: string): bigint {
    let normalized = ip.toLowerCase();
    // Expand ::
    if (normalized.includes('::')) {
        const parts = normalized.split('::');
        const left = parts[0] ? parts[0].split(':') : [];
        const right = parts[1] ? parts[1].split(':') : [];
        const missing = 8 - (left.length + right.length);
        const middle = Array(missing).fill('0');
        normalized = [...left, ...middle, ...right].join(':');
    }
    const blocks = normalized.split(':').map((b) => parseInt(b || '0', 16));
    let result = BigInt(0);
    for (let i = 0; i < 8; i++) {
        result = (result << BigInt(16)) | BigInt(blocks[i] || 0);
    }
    return result;
}

function isIpv6InCidr(ip: string, cidr: string): boolean {
    const [range, bitsStr] = cidr.split('/');
    const bits = parseInt(bitsStr, 10);
    const ipVal = ipv6ToBigInt(ip);
    const rangeVal = ipv6ToBigInt(range);
    const shift = BigInt(128 - bits);
    return (ipVal >> shift) === (rangeVal >> shift);
}

export function isIpInCidr(ip: string, cidr: string): boolean {
    const isIpV4 = net.isIPv4(ip);
    const isCidrV4 = cidr.includes('.');
    if (isIpV4 && isCidrV4) {
        return isIpv4InCidr(ip, cidr);
    }
    const isIpV6 = net.isIPv6(ip);
    const isCidrV6 = cidr.includes(':');
    if (isIpV6 && isCidrV6) {
        return isIpv6InCidr(ip, cidr);
    }
    // IPv4 mapped into IPv6 (e.g. ::ffff:169.254.1.1)
    if (isIpV6 && ip.toLowerCase().startsWith('::ffff:') && isCidrV4) {
        const mappedV4 = ip.slice(7);
        if (net.isIPv4(mappedV4)) {
            return isIpv4InCidr(mappedV4, cidr);
        }
    }
    return false;
}

// ---------------------------------------------------------------------------
// Blocked IP Ranges
// ---------------------------------------------------------------------------

const ALWAYS_BLOCKED_CIDRS = [
    // IPv4 Link-local and cloud metadata (AWS, GCP, Azure, DO, etc.)
    '169.254.0.0/16',
    // IPv6 Link-local
    'fe80::/10',
    // AWS EC2 IPv6 metadata service
    'fd00:ec2::254/128',
];

const PRIVATE_CIDRS = [
    // Loopback
    '127.0.0.0/8',
    '::1/128',
    // RFC1918 Private ranges
    '10.0.0.0/8',
    '172.16.0.0/12',
    '192.168.0.0/16',
    // Carrier-grade NAT (CGNAT)
    '100.64.0.0/10',
    // Unique Local IPv6 (ULA)
    'fc00::/7',
];

const BLOCKED_PORTS = new Set([22, 23, 25, 69, 135, 137, 138, 139, 445]);

export function isPrivateOrReservedIp(ip: string): boolean {
    for (const cidr of ALWAYS_BLOCKED_CIDRS) {
        if (isIpInCidr(ip, cidr)) return true;
    }
    for (const cidr of PRIVATE_CIDRS) {
        if (isIpInCidr(ip, cidr)) return true;
    }
    return false;
}

function matchesPattern(hostOrIp: string, pattern: string): boolean {
    if (pattern === hostOrIp) return true;
    if (pattern.startsWith('*.') && hostOrIp.endsWith(pattern.slice(1))) return true;
    if (pattern.includes('/') && isIpInCidr(hostOrIp, pattern)) return true;
    return false;
}

// ---------------------------------------------------------------------------
// Host & Network Guard Assertions
// ---------------------------------------------------------------------------

export async function assertHostAllowed(host: string, port?: number): Promise<void> {
    if (!host || typeof host !== 'string' || host.trim() === '') {
        throw new NetworkGuardError('Host cannot be empty.', 'INVALID_HOST');
    }

    const trimmedHost = host.trim().toLowerCase();

    // 1. Port range & dangerous port validation
    if (port !== undefined) {
        if (!Number.isInteger(port) || port < 1 || port > 65535) {
            throw new NetworkGuardError(`Invalid port number: ${port}. Must be between 1 and 65535.`, 'INVALID_PORT');
        }
        if (BLOCKED_PORTS.has(port)) {
            throw new NetworkGuardError(`Port ${port} is blocked for security.`, 'PORT_BLOCKED');
        }
    }

    // Reject URLs in host field (e.g. http://localhost)
    if (trimmedHost.includes('://') || trimmedHost.includes('/')) {
        throw new NetworkGuardError('Host must be a hostname or IP address without URL scheme or path.', 'INVALID_HOST');
    }

    const policy = (process.env.CONNECTOR_NETWORK_POLICY || 'allow-private').toLowerCase();
    const allowlist = (process.env.CONNECTOR_HOST_ALLOWLIST || '')
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
    const denylist = (process.env.CONNECTOR_HOST_DENYLIST || '')
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);

    // 2. Check explicit host denylist
    if (denylist.includes(trimmedHost)) {
        throw new NetworkGuardError(`Host "${trimmedHost}" is explicitly denied by network policy.`, 'HOST_DENIED');
    }

    // Fast check: If allowlist is configured and host is a name not matching pattern
    if (allowlist.length > 0 && !net.isIP(trimmedHost) && !allowlist.some((pat) => matchesPattern(trimmedHost, pat))) {
        throw new NetworkGuardError(`Host "${trimmedHost}" is not on the allowed host list.`, 'HOST_NOT_ALLOWED');
    }

    // 3. DNS resolution (all A/AAAA records)
    let addresses: { address: string; family: number }[] = [];
    if (net.isIP(trimmedHost)) {
        addresses = [{ address: trimmedHost, family: net.isIP(trimmedHost) }];
    } else {
        try {
            addresses = await dns.lookup(trimmedHost, { all: true });
        } catch {
            throw new NetworkGuardError(`Could not resolve hostname "${trimmedHost}".`, 'DNS_LOOKUP_FAILED');
        }
    }

    if (addresses.length === 0) {
        throw new NetworkGuardError(`No DNS records found for host "${trimmedHost}".`, 'DNS_LOOKUP_FAILED');
    }

    // 4. Verify each resolved IP
    for (const { address } of addresses) {
        // Denylist check on resolved IP
        for (const deny of denylist) {
            if (matchesPattern(address, deny)) {
                throw new NetworkGuardError(`Resolved IP ${address} is denied by denylist policy.`, 'HOST_DENIED');
            }
        }

        // Always blocked ranges: link-local and cloud metadata
        for (const cidr of ALWAYS_BLOCKED_CIDRS) {
            if (isIpInCidr(address, cidr)) {
                throw new NetworkGuardError(
                    `Access to link-local or cloud metadata address (${address}) is strictly blocked.`,
                    'METADATA_IP_BLOCKED'
                );
            }
        }

        // If policy is public-only, reject private and loopback IPs
        if (policy === 'public-only') {
            for (const cidr of PRIVATE_CIDRS) {
                if (isIpInCidr(address, cidr)) {
                    // Check if explicitly on allowlist
                    const isAllowed = allowlist.some((pat) => matchesPattern(address, pat) || matchesPattern(trimmedHost, pat));
                    if (!isAllowed) {
                        throw new NetworkGuardError(
                            `Private/internal address ${address} is not permitted under public-only network policy.`,
                            'PRIVATE_IP_BLOCKED'
                        );
                    }
                }
            }
        }
    }

    // 5. If allowlist is defined, ensure host or all IPs match the allowlist
    if (allowlist.length > 0) {
        const matchesHost = allowlist.some((pat) => matchesPattern(trimmedHost, pat));
        const matchesAnyIp = addresses.some(({ address }) =>
            allowlist.some((pat) => matchesPattern(address, pat))
        );
        if (!matchesHost && !matchesAnyIp) {
            throw new NetworkGuardError(`Host "${trimmedHost}" is not on the allowed host list.`, 'HOST_NOT_ALLOWED');
        }
    }
}

export async function resolvePinned(host: string, port?: number): Promise<{ ip: string; port?: number }> {
    await assertHostAllowed(host, port);
    if (net.isIP(host)) {
        return { ip: host, port };
    }
    const addresses = await dns.lookup(host, { all: true });
    return { ip: addresses[0].address, port };
}

/**
 * Validate all hosts referenced in a MongoDB connection URI (supporting mongodb:// and mongodb+srv://).
 */
export async function assertMongoUriAllowed(uri: string): Promise<void> {
    if (!uri || typeof uri !== 'string') {
        throw new NetworkGuardError('MongoDB connection string cannot be empty.', 'INVALID_URI');
    }

    const trimmed = uri.trim();
    if (!trimmed.startsWith('mongodb://') && !trimmed.startsWith('mongodb+srv://')) {
        throw new NetworkGuardError(
            'MongoDB connection string must start with "mongodb://" or "mongodb+srv://".',
            'INVALID_URI'
        );
    }

    const isSrv = trimmed.startsWith('mongodb+srv://');
    const rest = trimmed.replace(/^mongodb(\+srv)?:\/\//, '');

    // Strip credentials (user:pass@) if present
    const atIdx = rest.indexOf('@');
    const hostPart = (atIdx !== -1 ? rest.slice(atIdx + 1) : rest).split(/[/?]/)[0];

    if (!hostPart) {
        throw new NetworkGuardError('Invalid MongoDB URI: no host specified.', 'INVALID_URI');
    }

    if (isSrv) {
        // SRV connection: exactly one hostname
        const srvHost = hostPart.split(':')[0].trim();
        await assertHostAllowed(srvHost);

        try {
            const records = await dns.resolveSrv(`_mongodb._tcp.${srvHost}`);
            for (const record of records) {
                await assertHostAllowed(record.name, record.port);
            }
        } catch (err) {
            if (err instanceof NetworkGuardError) throw err;
            throw new NetworkGuardError(
                `Failed to resolve SRV records for "${srvHost}": ${(err as Error).message}`,
                'DNS_LOOKUP_FAILED'
            );
        }
    } else {
        // Standard mongodb:// format: can have comma-separated list of host:port
        const hosts = hostPart.split(',').map((h) => h.trim()).filter(Boolean);
        if (hosts.length === 0) {
            throw new NetworkGuardError('Invalid MongoDB URI: no host found.', 'INVALID_URI');
        }
        for (const item of hosts) {
            let host = item;
            let port = 27017;
            if (item.includes(':')) {
                const parts = item.split(':');
                host = parts[0];
                const p = parseInt(parts[1], 10);
                if (!isNaN(p)) port = p;
            }
            await assertHostAllowed(host, port);
        }
    }
}

/**
 * Returns a custom lookup function for network clients that pins the resolved IP
 * to eliminate DNS rebinding vulnerabilities.
 */
export function createPinnedLookup(
    pinnedIp: string
): (hostname: string, options: unknown, callback: (err: Error | null, address: string, family: number) => void) => void {
    const family = net.isIPv6(pinnedIp) ? 6 : 4;
    return (_hostname, _options, callback) => {
        callback(null, pinnedIp, family);
    };
}
