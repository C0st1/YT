/**
 * config.js - Application constants and shared configuration
 *
 * Centralizes all magic numbers, defaults, and allowed-value
 * whitelists used across modules.  Keeps every other module
 * free of hard-coded values.
 */

const TITLE_BAR_HEIGHT = 32;

const YTM_URL = 'https://music.youtube.com/';

const ALLOWED_SETTINGS = Object.freeze({
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

const ALLOWED_THEMES = Object.freeze(['system', 'dark', 'light']);

const ALLOWED_MEDIA_COMMANDS = Object.freeze([
  'play-pause',
  'next',
  'previous',
  'stop',
  'volume-up',
  'volume-down',
  'mute'
]);

// Discord RPC exponential backoff
const RPC_MAX_RETRIES = 10;
const RPC_BASE_DELAY_MS = 15000;
const RPC_MAX_DELAY_MS = 300000; // 5 minutes cap

// Track polling
const TRACK_POLL_INTERVAL_MS = 3000;

// Discord presence throttle (ms) — position-only updates
const PRESENCE_THROTTLE_MS = 5000;

// Notification field length limits
const MAX_TITLE_LENGTH = 200;
const MAX_BODY_LENGTH = 500;
const MAX_TOOLTIP_LENGTH = 200;

// Discord Rich Presence field limits
const DISCORD_MAX_FIELD_LENGTH = 128;

// Window creation delays (F-11: moved from main.js)
const FIRST_RUN_DELAY_MS = 2000;
const NORMAL_DELAY_MS = 500;

// WebContentsView max listeners (F-11: moved from window.js)
const MUSIC_VIEW_MAX_LISTENERS = 30;

// Ad blocker timing (F-11: moved from adblocker.js)
// Renamed from AD_SKIPPER_* to AD_BLOCKER_* to reflect proactive blocking
const AD_BLOCKER_NORMAL_INTERVAL_MS = 3000;
const AD_BLOCKER_ACTIVE_INTERVAL_MS = 500;
const AD_BLOCKER_MUTE_DURATION_MS = 400;
const AD_BLOCKER_DEBOUNCE_MS = 150;

// Backward-compatible aliases (for any external consumers)
const AD_SKIPPER_NORMAL_INTERVAL_MS = AD_BLOCKER_NORMAL_INTERVAL_MS;
const AD_SKIPPER_ACTIVE_INTERVAL_MS = AD_BLOCKER_ACTIVE_INTERVAL_MS;
const AD_SKIPPER_MUTE_DURATION_MS = AD_BLOCKER_MUTE_DURATION_MS;
const AD_SKIPPER_DEBOUNCE_MS = AD_BLOCKER_DEBOUNCE_MS;

// Window bounds validation minimum visible area ratio (F-04)
const WINDOW_BOUNDS_MIN_VISIBLE_RATIO = 0.3;

// Visualizer settings
const VISUALIZER_FFT_SIZE = 256;
const VISUALIZER_BAR_COUNT = 24;

// Lyrics settings
const LYRICS_API_TIMEOUT_MS = 8000;
const LYRICS_CACHE_MAX_ENTRIES = 100;
const LYRICS_NULL_CACHE_TTL_MS = 30 * 60 * 1000; // 30 min — retry failed searches
const LYRICS_MAX_RESPONSE_SIZE = 512 * 1024; // 512 KB — limit API response

// Visualizer poll interval (main → renderer data push)
const VISUALIZER_POLL_INTERVAL_MS = 100;

// IPC rate limiting (prevent renderer flood)
const IPC_RATE_LIMIT_WINDOW_MS = 1000; // 1 second window
const IPC_RATE_LIMIT_MAX_CALLS = 10;   // max calls per window

// Album art thumbnail size for tray icon (avoid fetching full-res)
const ALBUM_ART_THUMBNAIL_SIZE = 64;

// Tray menu item visibility defaults
const TRAY_MENU_DEFAULTS = Object.freeze({
  nowPlaying: true,
  miniPlayer: true,
  lyrics: true,
  visualizer: true,
  ytmThemes: true,
  albumArtIcon: true,
  discordRpc: true,
  startOnBoot: true,
  minimizeToTray: true
});

module.exports = {
  TITLE_BAR_HEIGHT,
  YTM_URL,
  ALLOWED_SETTINGS,
  ALLOWED_THEMES,
  ALLOWED_MEDIA_COMMANDS,
  RPC_MAX_RETRIES,
  RPC_BASE_DELAY_MS,
  RPC_MAX_DELAY_MS,
  TRACK_POLL_INTERVAL_MS,
  PRESENCE_THROTTLE_MS,
  MAX_TITLE_LENGTH,
  MAX_BODY_LENGTH,
  MAX_TOOLTIP_LENGTH,
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
  VISUALIZER_FFT_SIZE,
  VISUALIZER_BAR_COUNT,
  LYRICS_API_TIMEOUT_MS,
  LYRICS_CACHE_MAX_ENTRIES,
  LYRICS_NULL_CACHE_TTL_MS,
  LYRICS_MAX_RESPONSE_SIZE,
  VISUALIZER_POLL_INTERVAL_MS,
  IPC_RATE_LIMIT_WINDOW_MS,
  IPC_RATE_LIMIT_MAX_CALLS,
  ALBUM_ART_THUMBNAIL_SIZE,
  TRAY_MENU_DEFAULTS
};
