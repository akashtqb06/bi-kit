export type AuthField = 'name' | 'email' | 'password' | 'confirmPassword';

export type AuthActionResult = {
    ok: boolean;
    fieldErrors?: Partial<Record<AuthField, string>>;
    formError?: string;
};

export type SettingsActionResult = {
    ok: boolean;
    fieldErrors?: Record<string, string>;
    formError?: string;
};

export type SafeUser = {
    id: string;
    email: string;
    name: string;
    role: string;
    avatarUrl: string | null;
    createdAt: Date;
    lastLoginAt: Date | null;
    mustChangePassword?: boolean;
    status?: string;
};

export type ListedSession = {
    id: string;
    userId: string;
    createdAt: Date;
    expiresAt: Date;
    lastUsedAt: Date;
    ipAddress: string | null;
    userAgent: string | null;
    isCurrent?: boolean;
};

