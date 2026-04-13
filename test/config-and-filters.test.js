/**
 * Tests for adblocker public API and config constants
 *
 * F-02 FIX: Removed getCosmeticFilters tests — this function was never
 * exported by adblocker.js and the import would fail at runtime.
 * Replaced with tests for the actual adblocker public API.
 */

const { getAdBlockCSS, getVideoAdBlockerScript, isBlockedHostname, BLOCK_DOMAINS } = require('../src/adblocker');
const {
  ALLOWED_SETTINGS,
  ALLOWED_THEMES,
  ALLOWED_MEDIA_COMMANDS,
  TITLE_BAR_HEIGHT,
  YTM_URL,
  TRACK_POLL_INTERVAL_MS,
  PRESENCE_THROTTLE_MS,
  RPC_MAX_RETRIES,
  RPC_BASE_DELAY_MS,
  RPC_MAX_DELAY_MS,
  DISCORD_MAX_FIELD_LENGTH,
  FIRST_RUN_DELAY_MS,
  NORMAL_DELAY_MS,
  MUSIC_VIEW_MAX_LISTENERS,
  AD_BLOCKER_NORMAL_INTERVAL_MS,
  AD_BLOCKER_ACTIVE_INTERVAL_MS,
  AD_BLOCKER_MUTE_DURATION_MS,
  AD_BLOCKER_DEBOUNCE_MS,
  // Backward-compatible aliases
  AD_SKIPPER_NORMAL_INTERVAL_MS,
  AD_SKIPPER_ACTIVE_INTERVAL_MS,
  AD_SKIPPER_MUTE_DURATION_MS,
  AD_SKIPPER_DEBOUNCE_MS,
  WINDOW_BOUNDS_MIN_VISIBLE_RATIO,
  LYRICS_NULL_CACHE_TTL_MS,
  LYRICS_MAX_RESPONSE_SIZE,
  VISUALIZER_POLL_INTERVAL_MS,
  IPC_RATE_LIMIT_WINDOW_MS,
  IPC_RATE_LIMIT_MAX_CALLS,
  ALBUM_ART_THUMBNAIL_SIZE
} = require('../src/config');

describe('Adblocker public API', () => {
  test('getAdBlockCSS returns a non-empty string', () => {
    const css = getAdBlockCSS();
    expect(typeof css).toBe('string');
    expect(css.length).toBeGreaterThan(0);
  });

  test('getAdBlockCSS contains YTM-specific selectors', () => {
    const css = getAdBlockCSS();
    expect(css).toContain('ytmusic-');
    expect(css).toContain('display: none');
  });

  test('getVideoAdBlockerScript returns a non-empty string', () => {
    const script = getVideoAdBlockerScript();
    expect(typeof script).toBe('string');
    expect(script.length).toBeGreaterThan(0);
  });

  test('getVideoAdBlockerScript contains proactive blocking mechanisms', () => {
    const script = getVideoAdBlockerScript();
    expect(script).toContain('ytp-skip-ad-button');
    expect(script).toContain('ytp-ad-skip-button');
    // Proactive blocking: intercepts fetch/XHR
    expect(script).toContain('window.fetch');
    expect(script).toContain('XMLHttpRequest.prototype.open');
    // Proactive blocking: overrides play()
    expect(script).toContain('HTMLMediaElement.prototype.play');
    // Proactive blocking: strips player config
    expect(script).toContain('stripAdsFromPlayerConfig');
  });

  test('getVideoAdBlockerScript uses config constants for timing', () => {
    const script = getVideoAdBlockerScript();
    // The script should embed the numeric values from config
    expect(script).toContain(String(AD_BLOCKER_NORMAL_INTERVAL_MS));
    expect(script).toContain(String(AD_BLOCKER_ACTIVE_INTERVAL_MS));
    expect(script).toContain(String(AD_BLOCKER_MUTE_DURATION_MS));
    expect(script).toContain(String(AD_BLOCKER_DEBOUNCE_MS));
  });
});

describe('Config constants', () => {
  test('ALLOWED_SETTINGS has correct keys and types', () => {
    expect(ALLOWED_SETTINGS).toEqual({
      minimizeToTray: 'boolean',
      showNotifications: 'boolean',
      startMinimized: 'boolean',
      discordRpc: 'boolean',
      startOnBoot: 'boolean',
      showMiniPlayer: 'boolean',
      albumArtTrayIcon: 'boolean',
      showVisualizer: 'boolean',
      showLyrics: 'boolean',
      ytmTheme: 'string',
      theme: 'string'
    });
  });

  test('ALLOWED_SETTINGS is frozen', () => {
    expect(Object.isFrozen(ALLOWED_SETTINGS)).toBe(true);
  });

  test('ALLOWED_THEMES contains expected values', () => {
    expect(ALLOWED_THEMES).toContain('system');
    expect(ALLOWED_THEMES).toContain('dark');
    expect(ALLOWED_THEMES).toContain('light');
    expect(ALLOWED_THEMES).toHaveLength(3);
  });

  test('ALLOWED_THEMES is frozen', () => {
    expect(Object.isFrozen(ALLOWED_THEMES)).toBe(true);
  });

  test('ALLOWED_MEDIA_COMMANDS contains expected values', () => {
    expect(ALLOWED_MEDIA_COMMANDS).toContain('play-pause');
    expect(ALLOWED_MEDIA_COMMANDS).toContain('next');
    expect(ALLOWED_MEDIA_COMMANDS).toContain('previous');
    expect(ALLOWED_MEDIA_COMMANDS).toContain('stop');
  });

  test('ALLOWED_MEDIA_COMMANDS is frozen', () => {
    expect(Object.isFrozen(ALLOWED_MEDIA_COMMANDS)).toBe(true);
  });

  test('TITLE_BAR_HEIGHT is 32', () => {
    expect(TITLE_BAR_HEIGHT).toBe(32);
  });

  test('YTM_URL is correct', () => {
    expect(YTM_URL).toBe('https://music.youtube.com/');
  });

  test('TRACK_POLL_INTERVAL_MS is 3000', () => {
    expect(TRACK_POLL_INTERVAL_MS).toBe(3000);
  });

  test('PRESENCE_THROTTLE_MS is 5000', () => {
    expect(PRESENCE_THROTTLE_MS).toBe(5000);
  });

  test('RPC_MAX_RETRIES is 10', () => {
    expect(RPC_MAX_RETRIES).toBe(10);
  });

  test('RPC_BASE_DELAY_MS is 15000', () => {
    expect(RPC_BASE_DELAY_MS).toBe(15000);
  });

  test('RPC_MAX_DELAY_MS is 300000', () => {
    expect(RPC_MAX_DELAY_MS).toBe(300000);
  });

  test('DISCORD_MAX_FIELD_LENGTH is 128', () => {
    expect(DISCORD_MAX_FIELD_LENGTH).toBe(128);
  });

  // F-11 FIX: Test new config constants
  test('FIRST_RUN_DELAY_MS is 2000', () => {
    expect(FIRST_RUN_DELAY_MS).toBe(2000);
  });

  test('NORMAL_DELAY_MS is 500', () => {
    expect(NORMAL_DELAY_MS).toBe(500);
  });

  test('MUSIC_VIEW_MAX_LISTENERS is 30', () => {
    expect(MUSIC_VIEW_MAX_LISTENERS).toBe(30);
  });

  test('AD_BLOCKER_NORMAL_INTERVAL_MS is 3000', () => {
    expect(AD_BLOCKER_NORMAL_INTERVAL_MS).toBe(3000);
  });

  test('AD_BLOCKER_ACTIVE_INTERVAL_MS is 500', () => {
    expect(AD_BLOCKER_ACTIVE_INTERVAL_MS).toBe(500);
  });

  test('AD_BLOCKER_MUTE_DURATION_MS is 400', () => {
    expect(AD_BLOCKER_MUTE_DURATION_MS).toBe(400);
  });

  test('AD_BLOCKER_DEBOUNCE_MS is 150', () => {
    expect(AD_BLOCKER_DEBOUNCE_MS).toBe(150);
  });

  // Backward-compatible aliases
  test('AD_SKIPPER_* aliases match AD_BLOCKER_* values', () => {
    expect(AD_SKIPPER_NORMAL_INTERVAL_MS).toBe(AD_BLOCKER_NORMAL_INTERVAL_MS);
    expect(AD_SKIPPER_ACTIVE_INTERVAL_MS).toBe(AD_BLOCKER_ACTIVE_INTERVAL_MS);
    expect(AD_SKIPPER_MUTE_DURATION_MS).toBe(AD_BLOCKER_MUTE_DURATION_MS);
    expect(AD_SKIPPER_DEBOUNCE_MS).toBe(AD_BLOCKER_DEBOUNCE_MS);
  });

  test('WINDOW_BOUNDS_MIN_VISIBLE_RATIO is 0.3', () => {
    expect(WINDOW_BOUNDS_MIN_VISIBLE_RATIO).toBe(0.3);
  });

  // New config constants added in improvement pass
  test('LYRICS_NULL_CACHE_TTL_MS is 30 minutes', () => {
    expect(LYRICS_NULL_CACHE_TTL_MS).toBe(30 * 60 * 1000);
  });

  test('LYRICS_MAX_RESPONSE_SIZE is 512 KB', () => {
    expect(LYRICS_MAX_RESPONSE_SIZE).toBe(512 * 1024);
  });

  test('VISUALIZER_POLL_INTERVAL_MS is 100', () => {
    expect(VISUALIZER_POLL_INTERVAL_MS).toBe(100);
  });

  test('IPC_RATE_LIMIT_WINDOW_MS is 1000', () => {
    expect(IPC_RATE_LIMIT_WINDOW_MS).toBe(1000);
  });

  test('IPC_RATE_LIMIT_MAX_CALLS is 10', () => {
    expect(IPC_RATE_LIMIT_MAX_CALLS).toBe(10);
  });

  test('ALBUM_ART_THUMBNAIL_SIZE is 64', () => {
    expect(ALBUM_ART_THUMBNAIL_SIZE).toBe(64);
  });
});
