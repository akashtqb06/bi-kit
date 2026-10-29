/**
 * Safe-area insets and mobile viewport utilities.
 * Handles notch, home indicator bar on iOS / modern Android, and bottom sheet ergonomics.
 */

export const SAFE_AREA_CSS = {
  // Padding utilities with safe-area fallback
  paddingBottom: 'pb-[calc(1rem+env(safe-area-inset-bottom,0px))]',
  paddingTop: 'pt-[calc(0.75rem+env(safe-area-inset-top,0px))]',
  marginBottom: 'mb-[calc(1rem+env(safe-area-inset-bottom,0px))]',
  insetBottom: 'bottom-[calc(1rem+env(safe-area-inset-bottom,0px))]',
} as const;

/**
 * Returns safe-area styles as inline React CSSProperties object.
 */
export function getSafeAreaStyles(options?: {
  includeBottom?: boolean;
  includeTop?: boolean;
  extraBottomPx?: number;
}): React.CSSProperties {
  const styles: React.CSSProperties = {};
  const extraBottom = options?.extraBottomPx || 0;

  if (options?.includeBottom !== false) {
    styles.paddingBottom = `calc(${extraBottom}px + env(safe-area-inset-bottom, 0px))`;
  }
  if (options?.includeTop) {
    styles.paddingTop = 'env(safe-area-inset-top, 0px)';
  }

  return styles;
}

/**
 * Check whether a given pixel width corresponds to a phone screen width (< 640px).
 */
export function isPhoneWidth(width?: number): boolean {
  if (typeof width === 'number') {
    return width < 640;
  }
  if (typeof window !== 'undefined') {
    return window.innerWidth < 640;
  }
  return false;
}

/**
 * Check whether device is iOS (iPhone, iPad, iPod).
 */
export function isIOS(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (Boolean(window.navigator.maxTouchPoints) && /Macintosh/.test(ua));
}

/**
 * Check whether the web application is running in standalone PWA display mode.
 */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const isMatchMediaStandalone = window.matchMedia?.('(display-mode: standalone)')?.matches;
  const isIOSStandalone = Boolean((window.navigator as unknown as { standalone?: boolean })?.standalone);
  return Boolean(isMatchMediaStandalone || isIOSStandalone);
}

/**
 * Bottom-sheet styling parameters for mobile sheets.
 */
export interface BottomSheetConfig {
  className: string;
  maxHeight: string;
  hasDragHandle: boolean;
  safeAreaPadding: string;
}

export function getBottomSheetConfig(): BottomSheetConfig {
  return {
    className:
      'fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border-t bg-background p-6 shadow-2xl transition-transform max-h-[85dvh] overflow-y-auto no-scrollbar',
    maxHeight: '85dvh',
    hasDragHandle: true,
    safeAreaPadding: 'pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]',
  };
}
