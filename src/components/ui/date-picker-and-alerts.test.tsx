import { describe, it, expect, vi } from 'vitest';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  DatePicker,
  DateRangePicker,
  parseDate,
  formatDateToISO,
} from '@/components/ui/date-picker';
import {
  AppModalProvider,
  appAlert,
  appConfirm,
} from '@/components/ui/app-modal';
import { Toaster } from '@/components/ui/sonner';

describe('DatePicker Component and Utilities', () => {
  it('correctly parses ISO date strings without timezone shifts', () => {
    const parsed = parseDate('2026-10-30');
    expect(parsed).toBeDefined();
    expect(parsed?.getFullYear()).toBe(2026);
    expect(parsed?.getMonth()).toBe(9); // 0-indexed October
    expect(parsed?.getDate()).toBe(30);

    expect(parseDate('')).toBeUndefined();
    expect(parseDate(undefined)).toBeUndefined();
  });

  it('correctly formats Date objects back to ISO YYYY-MM-DD strings', () => {
    const d = new Date(2026, 9, 30);
    expect(formatDateToISO(d)).toBe('2026-10-30');
    expect(formatDateToISO(undefined)).toBe('');
  });

  it('renders DatePicker with placeholder when value is empty', () => {
    const markup = renderToStaticMarkup(
      <DatePicker placeholder="Choose start date" />
    );
    expect(markup).toContain('Choose start date');
    expect(markup).toContain('lucide-calendar');
  });

  it('renders DatePicker with formatted date when value is provided', () => {
    const markup = renderToStaticMarkup(
      <DatePicker value="2026-10-30" />
    );
    expect(markup).toContain('Oct 30, 2026');
  });

  it('renders hidden input when name is provided for form submission', () => {
    const markup = renderToStaticMarkup(
      <DatePicker name="birthDate" value="2026-10-30" required />
    );
    expect(markup).toContain('type="hidden"');
    expect(markup).toContain('name="birthDate"');
    expect(markup).toContain('value="2026-10-30"');
  });

  it('renders clear button when clearable is true and date is set', () => {
    const markup = renderToStaticMarkup(
      <DatePicker value="2026-10-30" clearable />
    );
    expect(markup).toContain('aria-label="Clear date"');
    expect(markup).toContain('lucide-x');
  });

  it('renders DateRangePicker with formatted range', () => {
    const markup = renderToStaticMarkup(
      <DateRangePicker
        value={{
          from: new Date(2026, 9, 1),
          to: new Date(2026, 9, 30),
        }}
      />
    );
    expect(markup).toContain('Oct 1, 2026 - Oct 30, 2026');
  });
});

describe('App Modal and Alert System', () => {
  it('renders AppModalProvider wrapping children', () => {
    const markup = renderToStaticMarkup(
      <AppModalProvider>
        <div id="test-child">App Content</div>
      </AppModalProvider>
    );
    expect(markup).toContain('id="test-child"');
    expect(markup).toContain('App Content');
  });

  it('falls back gracefully to browser window methods when window is present', async () => {
    const fakeAlert = vi.fn();
    const fakeConfirm = vi.fn().mockReturnValue(true);
    const originalWindow = globalThis.window;
    (globalThis as unknown as { window: unknown }).window = {
      alert: fakeAlert,
      confirm: fakeConfirm,
    };

    try {
      await appAlert('Test Alert');
      expect(fakeAlert).toHaveBeenCalledWith('Test Alert');

      const result = await appConfirm('Are you sure?');
      expect(fakeConfirm).toHaveBeenCalledWith('Are you sure?');
      expect(result).toBe(true);
    } finally {
      (globalThis as unknown as { window: unknown }).window = originalWindow;
    }
  });

  it('handles server side calls without window without throwing', async () => {
    await expect(appAlert('Server alert')).resolves.toBeUndefined();
    await expect(appConfirm('Server confirm')).resolves.toBe(false);
  });
});

describe('Toaster Component Configuration', () => {
  it('renders Sonner toaster with notification container', () => {
    const markup = renderToStaticMarkup(<Toaster />);
    expect(markup).toContain('aria-label="Notifications');
  });
});
