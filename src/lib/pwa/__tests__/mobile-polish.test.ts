import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  isPhoneWidth,
  getSafeAreaStyles,
  getBottomSheetConfig,
  SAFE_AREA_CSS,
} from '../mobile-utils';

describe('PWA Mobile Polish & Phone Width Ergonomics', () => {
  it('correctly classifies phone widths under 640px', () => {
    // Standard phone screen widths
    expect(isPhoneWidth(320)).toBe(true); // iPhone SE 1st gen
    expect(isPhoneWidth(375)).toBe(true); // iPhone 8 / SE
    expect(isPhoneWidth(390)).toBe(true); // iPhone 12/13/14/15
    expect(isPhoneWidth(412)).toBe(true); // Google Pixel / Samsung Galaxy
    expect(isPhoneWidth(430)).toBe(true); // iPhone Pro Max
    expect(isPhoneWidth(639)).toBe(true); // Just below sm breakpoint

    // Tablets and desktops
    expect(isPhoneWidth(640)).toBe(false); // Tailwind sm breakpoint
    expect(isPhoneWidth(768)).toBe(false); // iPad portrait / md breakpoint
    expect(isPhoneWidth(1024)).toBe(false); // Desktop
  });

  it('generates safe-area insets style declarations', () => {
    const defaultStyles = getSafeAreaStyles();
    expect(defaultStyles.paddingBottom).toBe('calc(0px + env(safe-area-inset-bottom, 0px))');
    expect(defaultStyles.paddingTop).toBeUndefined();

    const customStyles = getSafeAreaStyles({
      includeBottom: true,
      includeTop: true,
      extraBottomPx: 16,
    });
    expect(customStyles.paddingBottom).toBe('calc(16px + env(safe-area-inset-bottom, 0px))');
    expect(customStyles.paddingTop).toBe('env(safe-area-inset-top, 0px)');

    expect(SAFE_AREA_CSS.paddingBottom).toContain('env(safe-area-inset-bottom,0px)');
  });

  it('provides phone-safe bottom sheet parameters', () => {
    const config = getBottomSheetConfig();
    expect(config.maxHeight).toBe('85dvh');
    expect(config.hasDragHandle).toBe(true);
    expect(config.safeAreaPadding).toContain('env(safe-area-inset-bottom');
    expect(config.className).toContain('max-h-[85dvh]');
  });

  it('validates public/manifest.webmanifest content and icon files existence', () => {
    const manifestPath = path.join(process.cwd(), 'public', 'manifest.webmanifest');
    expect(fs.existsSync(manifestPath)).toBe(true);

    const raw = fs.readFileSync(manifestPath, 'utf-8');
    const manifest = JSON.parse(raw);

    // Required PWA properties
    expect(manifest.start_url).toBe('/finance');
    expect(manifest.display).toBe('standalone');
    expect(manifest.name).toBeTruthy();
    expect(manifest.short_name).toBeTruthy();
    expect(manifest.theme_color).toBeTruthy();
    expect(manifest.background_color).toBeTruthy();

    // Verify icons exist
    expect(Array.isArray(manifest.icons)).toBe(true);
    expect(manifest.icons.length).toBeGreaterThanOrEqual(4);

    for (const icon of manifest.icons) {
      const diskPath = path.join(process.cwd(), 'public', icon.src.replace(/^\//, ''));
      expect(fs.existsSync(diskPath)).toBe(true);
      const stat = fs.statSync(diskPath);
      expect(stat.size).toBeGreaterThan(0);
    }

    // Verify maskable icon is declared
    const hasMaskable = manifest.icons.some(
      (icon: { purpose?: string }) => icon.purpose === 'maskable'
    );
    expect(hasMaskable).toBe(true);
  });
});
