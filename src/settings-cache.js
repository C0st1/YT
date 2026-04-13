/**
 * settings-cache.js - In-memory settings cache layer
 *
 * Eliminates repeated `store.get('settings')` disk reads.
 * Previously, every track change called store.get('settings') 4+ times
 * (notifications, lyrics, visualizer, Discord RPC), each hitting the
 * JSON file on disk. With the cache, only the first call reads from disk;
 * subsequent calls return the in-memory copy until explicitly invalidated.
 *
 * The cache is automatically invalidated when:
 *   - settings are saved via store.set('settings', ...)
 *   - invalidate() is called explicitly
 */

const log = require('./logger');

let cachedSettings = null;
let storeRef = null;

/**
 * Initialize the settings cache with a store reference.
 * Called once during app startup.
 */
function initSettingsCache(store) {
  storeRef = store;
  cachedSettings = null;
  log.info('[settings-cache] Initialized');
}

/**
 * Get settings from cache (or read from disk on first access).
 * Returns a shallow copy to prevent accidental mutation of the cache.
 */
function getSettings() {
  if (cachedSettings !== null) {
    return cachedSettings;
  }
  if (!storeRef) {
    log.warn('[settings-cache] No store reference, returning empty settings');
    return {};
  }
  try {
    cachedSettings = storeRef.get('settings') || {};
  } catch (err) {
    log.warn('[settings-cache] Failed to read settings from disk:', err.message);
    cachedSettings = {};
  }
  return cachedSettings;
}

/**
 * Get a single setting value by key.
 * Avoids reading the entire settings object from disk on every call.
 *
 * @param {string} key - Setting key (e.g., 'showLyrics')
 * @param {*} defaultValue - Default if key is missing or settings unavailable
 * @returns {*}
 */
function getSetting(key, defaultValue = undefined) {
  const settings = getSettings();
  if (settings && key in settings) {
    return settings[key];
  }
  return defaultValue;
}

/**
 * Update the cache after a settings save.
 * Call this AFTER store.set('settings', ...) to keep the cache in sync.
 *
 * @param {object} newSettings - The full settings object that was just saved
 */
function updateCache(newSettings) {
  cachedSettings = newSettings;
}

/**
 * Invalidate the cache, forcing the next getSettings() to read from disk.
 * Use this when settings may have been changed externally.
 */
function invalidate() {
  cachedSettings = null;
}

module.exports = {
  initSettingsCache,
  getSettings,
  getSetting,
  updateCache,
  invalidate
};
