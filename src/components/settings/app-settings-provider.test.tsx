import { describe, it, expect, vi } from 'vitest';
import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { AppSettingsProvider, useAppSettings } from './app-settings-provider';
import { AppSidebar } from '@src/components/layout/app-sidebar';
import { SidebarProvider } from '@/components/ui/sidebar';

// Mock next/navigation
vi.mock('next/navigation', () => ({
    usePathname: () => '/dashboards',
    useRouter: () => ({ refresh: vi.fn() }),
}));

function TestConsumer() {
    const { appName } = useAppSettings();
    return <span data-testid="app-name">{appName}</span>;
}

describe('AppSettingsProvider & Dynamic App Name', () => {
    it('provides default appName "BI Kit" when no initialAppName is provided', () => {
        const html = renderToString(
            <AppSettingsProvider>
                <TestConsumer />
            </AppSettingsProvider>
        );
        expect(html).toContain('BI Kit');
    });

    it('provides custom appName when configured', () => {
        const customName = 'Acme Analytics';
        const html = renderToString(
            <AppSettingsProvider initialAppName={customName}>
                <TestConsumer />
            </AppSettingsProvider>
        );
        expect(html).toContain(customName);
        expect(html).not.toContain('BI Kit');
    });

    it('renders custom appName inside AppSidebar header', () => {
        const customName = 'Enterprise Insights Hub';
        const html = renderToString(
            <SidebarProvider>
                <AppSettingsProvider initialAppName={customName}>
                    <AppSidebar />
                </AppSettingsProvider>
            </SidebarProvider>
        );
        expect(html).toContain(customName);
        expect(html).not.toContain('BI Kit');
    });
});
