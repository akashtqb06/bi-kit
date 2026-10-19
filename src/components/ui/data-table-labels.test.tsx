import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { renderToString } from 'react-dom/server';
import {
    DropdownMenuGroup,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
} from '@/components/ui/dropdown-menu';
import {
    SelectGroup,
    SelectLabel,
} from '@/components/ui/select';

describe('Base UI Safe Labels Verification', () => {
    it('renders DropdownMenuLabel safely outside a group without crashing', () => {
        expect(() => {
            const html = renderToString(
                <DropdownMenuLabel>Standalone Label</DropdownMenuLabel>
            );
            expect(html).toContain('Standalone Label');
            expect(html).toContain('data-slot="dropdown-menu-label"');
        }).not.toThrow();
    });

    it('renders DropdownMenuLabel inside DropdownMenuGroup with Base UI attributes', () => {
        expect(() => {
            const html = renderToString(
                <DropdownMenuGroup>
                    <DropdownMenuLabel>Group Label</DropdownMenuLabel>
                </DropdownMenuGroup>
            );
            expect(html).toContain('Group Label');
            expect(html).toContain('data-slot="dropdown-menu-label"');
            expect(html).toContain('aria-hidden="true"');
        }).not.toThrow();
    });

    it('renders DropdownMenuLabel inside DropdownMenuRadioGroup without crashing', () => {
        expect(() => {
            const html = renderToString(
                <DropdownMenuRadioGroup value="opt1">
                    <DropdownMenuLabel>Radio Group Label</DropdownMenuLabel>
                </DropdownMenuRadioGroup>
            );
            expect(html).toContain('Radio Group Label');
            expect(html).toContain('data-slot="dropdown-menu-label"');
        }).not.toThrow();
    });

    it('renders SelectLabel safely outside a group without crashing', () => {
        expect(() => {
            const html = renderToString(
                <SelectLabel>Standalone Select Label</SelectLabel>
            );
            expect(html).toContain('Standalone Select Label');
            expect(html).toContain('data-slot="select-label"');
        }).not.toThrow();
    });

    it('renders SelectLabel inside SelectGroup with Base UI attributes', () => {
        expect(() => {
            const html = renderToString(
                <SelectGroup>
                    <SelectLabel>Grouped Select Label</SelectLabel>
                </SelectGroup>
            );
            expect(html).toContain('Grouped Select Label');
            expect(html).toContain('data-slot="select-label"');
            expect(html).toContain('aria-hidden="true"');
        }).not.toThrow();
    });

    it('renders columns toggle group structure with label inside DropdownMenuGroup', () => {
        expect(() => {
            const html = renderToString(
                <DropdownMenuGroup>
                    <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
                </DropdownMenuGroup>
            );
            expect(html).toContain('Toggle columns');
            expect(html).toContain('data-slot="dropdown-menu-group"');
            expect(html).toContain('data-slot="dropdown-menu-label"');
        }).not.toThrow();
    });
});
