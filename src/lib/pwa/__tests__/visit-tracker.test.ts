import { describe, it, expect, beforeEach } from 'vitest';
import { VisitTracker, MemoryStorage } from '../visit-tracker';

describe('PWA Visit Tracker & Install Prompt Eligibility', () => {
  let localStore: MemoryStorage;
  let sessionStore: MemoryStorage;
  let isStandaloneMode = false;
  let tracker: VisitTracker;

  beforeEach(() => {
    localStore = new MemoryStorage();
    sessionStore = new MemoryStorage();
    isStandaloneMode = false;
    tracker = new VisitTracker({
      localStore,
      sessionStore,
      checkStandalone: () => isStandaloneMode,
    });
  });

  it('records initial visit and does not increment repeatedly in same session', () => {
    expect(tracker.getVisitCount()).toBe(0);

    const count1 = tracker.recordVisit();
    expect(count1).toBe(1);
    expect(tracker.getVisitCount()).toBe(1);

    // Same session subsequent calls
    const count2 = tracker.recordVisit();
    expect(count2).toBe(1);
    expect(tracker.getVisitCount()).toBe(1);
  });

  it('increments visit count across distinct browser sessions', () => {
    // Session 1
    tracker.recordVisit();
    expect(tracker.getVisitCount()).toBe(1);

    // Simulate new session (sessionStore cleared, localStore persists)
    sessionStore = new MemoryStorage();
    const session2Tracker = new VisitTracker({
      localStore,
      sessionStore,
      checkStandalone: () => isStandaloneMode,
    });
    session2Tracker.recordVisit();
    expect(session2Tracker.getVisitCount()).toBe(2);

    // Session 3
    sessionStore = new MemoryStorage();
    const session3Tracker = new VisitTracker({
      localStore,
      sessionStore,
      checkStandalone: () => isStandaloneMode,
    });
    session3Tracker.recordVisit();
    expect(session3Tracker.getVisitCount()).toBe(3);
  });

  it('shows install prompt only after the third visit', () => {
    // Visit 1
    tracker.recordVisit();
    expect(tracker.shouldShowInstallPrompt()).toBe(false);

    // Visit 2
    sessionStore = new MemoryStorage();
    tracker = new VisitTracker({ localStore, sessionStore, checkStandalone: () => isStandaloneMode });
    tracker.recordVisit();
    expect(tracker.shouldShowInstallPrompt()).toBe(false);

    // Visit 3 (Prompt eligible!)
    sessionStore = new MemoryStorage();
    tracker = new VisitTracker({ localStore, sessionStore, checkStandalone: () => isStandaloneMode });
    tracker.recordVisit();
    expect(tracker.shouldShowInstallPrompt()).toBe(true);

    // Visit 4 (Still eligible if not dismissed)
    sessionStore = new MemoryStorage();
    tracker = new VisitTracker({ localStore, sessionStore, checkStandalone: () => isStandaloneMode });
    tracker.recordVisit();
    expect(tracker.shouldShowInstallPrompt()).toBe(true);
  });

  it('suppresses install prompt when app is already installed or running standalone', () => {
    // Reach visit 3
    localStore.setItem('bikit_finance_visit_count', '3');
    expect(tracker.shouldShowInstallPrompt()).toBe(true);

    // Running in standalone display mode
    isStandaloneMode = true;
    expect(tracker.shouldShowInstallPrompt()).toBe(false);

    // Reset standalone, mark installed via preference
    isStandaloneMode = false;
    tracker.markInstalled();
    expect(tracker.isInstalled()).toBe(true);
    expect(tracker.shouldShowInstallPrompt()).toBe(false);
  });

  it('suppresses install prompt when user dismisses it', () => {
    localStore.setItem('bikit_finance_visit_count', '3');
    expect(tracker.shouldShowInstallPrompt()).toBe(true);

    tracker.dismissPrompt(7);
    expect(tracker.isDismissed()).toBe(true);
    expect(tracker.shouldShowInstallPrompt()).toBe(false);
  });
});
