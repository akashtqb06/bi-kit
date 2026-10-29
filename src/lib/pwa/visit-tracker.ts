const VISIT_COUNT_KEY = 'bikit_finance_visit_count';
const SESSION_RECORDED_KEY = 'bikit_finance_session_recorded';
const DISMISSED_KEY = 'bikit_finance_install_dismissed';
const INSTALLED_KEY = 'bikit_finance_app_installed';

export interface StorageBackend {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class MemoryStorage implements StorageBackend {
  private data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) || null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
}

export class VisitTracker {
  private localStore: StorageBackend;
  private sessionStore: StorageBackend;
  private checkStandalone: () => boolean;

  constructor(options?: {
    localStore?: StorageBackend;
    sessionStore?: StorageBackend;
    checkStandalone?: () => boolean;
  }) {
    if (options?.localStore) {
      this.localStore = options.localStore;
    } else if (typeof window !== 'undefined' && window.localStorage) {
      this.localStore = window.localStorage;
    } else {
      this.localStore = new MemoryStorage();
    }

    if (options?.sessionStore) {
      this.sessionStore = options.sessionStore;
    } else if (typeof window !== 'undefined' && window.sessionStorage) {
      this.sessionStore = window.sessionStorage;
    } else {
      this.sessionStore = new MemoryStorage();
    }

    this.checkStandalone =
      options?.checkStandalone ||
      (() => {
        if (typeof window === 'undefined') return false;
        const isStandaloneMedia = window.matchMedia?.('(display-mode: standalone)')?.matches;
        const isIOSStandalone = Boolean((window.navigator as unknown as { standalone?: boolean })?.standalone);
        return Boolean(isStandaloneMedia || isIOSStandalone);
      });
  }

  /**
   * Record a visit in the current session. Increments the visit count if this
   * session has not yet been recorded.
   */
  recordVisit(): number {
    const isRecordedInSession = this.sessionStore.getItem(SESSION_RECORDED_KEY);
    if (!isRecordedInSession) {
      this.sessionStore.setItem(SESSION_RECORDED_KEY, 'true');
      const current = this.getVisitCount();
      const updated = current + 1;
      this.localStore.setItem(VISIT_COUNT_KEY, String(updated));
      return updated;
    }
    return this.getVisitCount();
  }

  /**
   * Returns total recorded visits.
   */
  getVisitCount(): number {
    const raw = this.localStore.getItem(VISIT_COUNT_KEY);
    const parsed = parseInt(raw || '0', 10);
    return isNaN(parsed) ? 0 : parsed;
  }

  /**
   * Checks if the app is already running as an installed PWA.
   */
  isInstalled(): boolean {
    if (this.checkStandalone()) return true;
    return this.localStore.getItem(INSTALLED_KEY) === 'true';
  }

  /**
   * Marks the app as installed.
   */
  markInstalled(): void {
    this.localStore.setItem(INSTALLED_KEY, 'true');
  }

  /**
   * Checks if the install prompt was dismissed recently.
   */
  isDismissed(): boolean {
    const raw = this.localStore.getItem(DISMISSED_KEY);
    if (!raw) return false;

    const expiry = parseInt(raw, 10);
    if (isNaN(expiry)) return false;

    // Check if cooldown has expired
    if (Date.now() > expiry) {
      this.localStore.removeItem(DISMISSED_KEY);
      return false;
    }
    return true;
  }

  /**
   * Dismiss the install prompt for a number of days (default 7).
   */
  dismissPrompt(cooldownDays = 7): void {
    const expiry = Date.now() + cooldownDays * 24 * 60 * 60 * 1000;
    this.localStore.setItem(DISMISSED_KEY, String(expiry));
  }

  /**
   * Determine whether the install prompt should be presented to the user.
   * Requirement: "an install prompt shown after the third visit" (i.e. visitCount >= 3).
   */
  shouldShowInstallPrompt(): boolean {
    if (this.isInstalled()) return false;
    if (this.isDismissed()) return false;
    return this.getVisitCount() >= 3;
  }

  /**
   * Reset tracking state (useful for tests and debug).
   */
  reset(): void {
    this.localStore.removeItem(VISIT_COUNT_KEY);
    this.localStore.removeItem(DISMISSED_KEY);
    this.localStore.removeItem(INSTALLED_KEY);
    this.sessionStore.removeItem(SESSION_RECORDED_KEY);
  }
}

// Global default singleton instance
export const visitTracker = new VisitTracker();
