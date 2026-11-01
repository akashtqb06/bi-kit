'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

export interface AppSettingsContextValue {
    appName: string;
    setAppName: (name: string) => void;
}

const DEFAULT_APP_NAME = 'BI Kit';

const AppSettingsContext = createContext<AppSettingsContextValue>({
    appName: DEFAULT_APP_NAME,
    setAppName: () => {},
});

export function AppSettingsProvider({
    initialAppName = DEFAULT_APP_NAME,
    children,
}: {
    initialAppName?: string;
    children: ReactNode;
}) {
    const [prevInitialAppName, setPrevInitialAppName] = useState(initialAppName);
    const [appName, setAppNameState] = useState<string>(initialAppName || DEFAULT_APP_NAME);

    // Synchronize when server updates initialAppName (e.g. after router.refresh())
    if (initialAppName !== prevInitialAppName) {
        setPrevInitialAppName(initialAppName);
        setAppNameState(initialAppName || DEFAULT_APP_NAME);
    }

    // Update document title if present
    useEffect(() => {
        if (typeof document !== 'undefined' && appName) {
            if (!document.title || document.title === DEFAULT_APP_NAME) {
                document.title = appName;
            } else if (document.title.endsWith(` | ${DEFAULT_APP_NAME}`)) {
                document.title = document.title.replace(` | ${DEFAULT_APP_NAME}`, ` | ${appName}`);
            }
        }
    }, [appName]);

    // Dispatch global event for instant client-side synchronization
    const setAppName = useCallback((name: string) => {
        const trimmed = name.trim();
        if (!trimmed) return;
        setAppNameState(trimmed);
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('bi-app-name-change', { detail: trimmed }));
        }
    }, []);

    // Listen for custom event across components
    useEffect(() => {
        const handleEvent = (event: Event) => {
            const customEvent = event as CustomEvent<string>;
            if (customEvent.detail && typeof customEvent.detail === 'string') {
                const trimmed = customEvent.detail.trim();
                if (trimmed) {
                    setAppNameState(trimmed);
                }
            }
        };

        window.addEventListener('bi-app-name-change', handleEvent);
        return () => {
            window.removeEventListener('bi-app-name-change', handleEvent);
        };
    }, []);

    return (
        <AppSettingsContext.Provider value={{ appName, setAppName }}>
            {children}
        </AppSettingsContext.Provider>
    );
}

export function useAppSettings(): AppSettingsContextValue {
    return useContext(AppSettingsContext);
}
