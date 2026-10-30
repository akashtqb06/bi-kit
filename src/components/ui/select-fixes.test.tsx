import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
    Select,
    SelectTrigger,
    SelectValue,
    SelectContent,
    SelectItem,
} from '@/components/ui/select';
import { SidebarInset } from '@/components/ui/sidebar';

describe('Select Component Fixes', () => {
    it('renders SelectTrigger with w-full, min-w-0 and clean ChevronDown without stray text', () => {
        const markup = renderToStaticMarkup(
            <Select>
                <SelectTrigger>
                    <SelectValue placeholder="Choose option..." />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="opt1">Option 1</SelectItem>
                </SelectContent>
            </Select>
        );

        expect(markup).toContain('w-full');
        expect(markup).toContain('min-w-0');
        expect(markup).toContain('lucide-chevron-down');
        // Must NOT contain Base UI default ▼ injected into the SVG
        expect(markup).not.toContain('▼');
    });

    it('automatically resolves and renders item label for selected value when items prop is omitted', () => {
        const markup = renderToStaticMarkup(
            <Select value="__all__">
                <SelectTrigger>
                    <SelectValue placeholder="All Sources" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="__all__">All Data Sources</SelectItem>
                    <SelectItem value="ds_123">Production Postgres</SelectItem>
                </SelectContent>
            </Select>
        );

        // Selected value must display "All Data Sources", not raw "__all__"
        expect(markup).toContain('All Data Sources');
    });

    it('displays the data source name instead of the real id for datastore selection', () => {
        const markup = renderToStaticMarkup(
            <Select value="ds_real_id_99">
                <SelectTrigger>
                    <SelectValue placeholder="All Sources" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="__all__">All Data Sources</SelectItem>
                    <SelectItem value="ds_real_id_99">E-Commerce Warehouse (postgres)</SelectItem>
                </SelectContent>
            </Select>
        );

        expect(markup).toContain('E-Commerce Warehouse (postgres)');
    });

    it('SidebarInset uses min-w-0 and does not force w-full which causes cropping with sidebar sibling', () => {
        const markup = renderToStaticMarkup(
            <SidebarInset className="test-inset">
                <div>Content</div>
            </SidebarInset>
        );

        expect(markup).toContain('min-w-0');
        expect(markup).not.toContain('w-full');
    });
});
