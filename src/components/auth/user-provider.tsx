'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { SafeUser } from '@src/lib/auth/types';
import { safeUserSchema } from '@src/lib/auth/schemas';

const UserContext = createContext<SafeUser | null | undefined>(undefined);

export function UserProvider({ user, children }: { user: SafeUser; children: ReactNode }) {
    return <UserContext.Provider value={user}>{children}</UserContext.Provider>;
}

export function useCurrentUser(): SafeUser | null {
    const providedUser = useContext(UserContext);
    const [fetchedUser, setFetchedUser] = useState<SafeUser | null>(null);

    useEffect(() => {
        if (providedUser !== undefined) return;
        let active = true;
        void fetch('/api/auth/me', { credentials: 'same-origin' })
            .then(async (response) => {
                if (!response.ok) return null;
                const parsed = safeUserSchema.safeParse(await response.json());
                return parsed.success ? parsed.data : null;
            })
            .then((user) => {
                if (active) setFetchedUser(user);
            })
            .catch(() => {
                if (active) setFetchedUser(null);
            });
        return () => {
            active = false;
        };
    }, [providedUser]);

    return providedUser === undefined ? fetchedUser : providedUser;
}
