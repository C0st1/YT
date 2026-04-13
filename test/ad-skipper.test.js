/**
 * F-14 FIX: Tests for the video ad blocker script logic
 *
 * These tests verify the structure and key patterns of the
 * VIDEO_AD_BLOCKER_SCRIPT without executing it in a real browser.
 * Updated from "skipper" to "blocker" to reflect the proactive
 * ad blocking approach.
 */

const { getVideoAdBlockerScript, getVideoAdSkipperScript } = require('../src/adblocker');

describe('Video Ad Blocker Script', () => {
  let script;

  beforeAll(() => {
    script = getVideoAdBlockerScript();
  });

  test('script is a non-empty string', () => {
    expect(typeof script).toBe('string');
    expect(script.length).toBeGreaterThan(100);
  });

  test('script is wrapped in an IIFE', () => {
    expect(script).toMatch(/^\(function\s*\(\)/);
    expect(script).toMatch(/\}\)\(\);?\s*$/);
  });

  test('script has a guard against double-initialization', () => {
    expect(script).toContain('window.__ytmAdBlocker');
    expect(script).toContain('if (window.__ytmAdBlocker) return');
    expect(script).toContain('window.__ytmAdBlocker = true');
  });

  test('script contains skip button selectors (safety net)', () => {
    expect(script).toContain('.ytp-skip-ad-button');
    expect(script).toContain('.ytp-ad-skip-button');
  });

  test('script contains ad active detection selector', () => {
    expect(script).toContain('.ad-showing');
    expect(script).toContain('.ytp-ad-active');
  });

  test('script contains overlay close button selector', () => {
    expect(script).toContain('.ytp-ad-overlay-close-button');
    expect(script).toContain('.ytp-ad-info-close-button');
  });

  test('script intercepts fetch() to block ad requests', () => {
    expect(script).toContain('window.fetch');
    expect(script).toContain('isAdUrl');
  });

  test('script intercepts XMLHttpRequest to block ad requests', () => {
    expect(script).toContain('XMLHttpRequest.prototype.open');
    expect(script).toContain('XMLHttpRequest.prototype.send');
  });

  test('script overrides HTMLMediaElement.play() to block ad playback', () => {
    expect(script).toContain('HTMLMediaElement.prototype.play');
  });

  test('script strips ad data from YouTube player config', () => {
    expect(script).toContain('stripAdsFromPlayerConfig');
    expect(script).toContain('adPlacements');
    expect(script).toContain('playerAds');
  });

  test('script overrides JSON.parse to strip ad data', () => {
    expect(script).toContain('JSON.parse');
  });

  test('script immediately removes ad DOM elements via MutationObserver', () => {
    expect(script).toContain('removeAdElements');
    expect(script).toContain('MutationObserver');
    expect(script).toContain('attributeFilter');
    expect(script).toContain('[\'class\']');
  });

  test('script seeks video to end as safety net when ad is active', () => {
    expect(script).toContain('video.currentTime = dur');
    expect(script).toContain('video.duration');
  });

  test('script temporarily mutes the video during ad (safety net)', () => {
    expect(script).toContain('video.muted = true');
    expect(script).toContain('video.muted = false');
  });

  test('script uses debounce for MutationObserver callback', () => {
    expect(script).toContain('debounceTimer');
  });

  test('script adjusts polling interval based on ad state', () => {
    expect(script).toContain('adDetected = true');
    expect(script).toContain('adDetected = false');
    expect(script).toContain('restartPoll');
  });

  test('backward-compatible getVideoAdSkipperScript alias works', () => {
    const aliasScript = getVideoAdSkipperScript();
    expect(aliasScript).toBe(script);
  });
});
