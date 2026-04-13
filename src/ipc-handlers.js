/**
 * ipc-handlers.js - IPC handler registration
 *
 * Includes all IPC channels for: window controls, settings, themes,
 * media commands, navigation, Discord, mini player, lyrics, visualizer,
 * shortcuts, and YTM themes.
 */

const { ipcMain, Notification } = require('electron');
const path = require('path');
const log = require('./logger');
const { ALLOWED_SETTINGS, ALLOWED_THEMES, MAX_TITLE_LENGTH, MAX_BODY_LENGTH, MAX_TOOLTIP_LENGTH, IPC_RATE_LIMIT_WINDOW_MS, IPC_RATE_LIMIT_MAX_CALLS } = require('./config');
const settingsCache = require('./settings-cache');
const { isValidMediaCommand, executeMediaCommand } = require('./media-commands');
const { updateTrayTooltip } = require('./tray');
const { getMainWindow, getMusicView, getCurrentTheme } = require('./window');
const { isDiscordAvailable } = require('./discord-rpc');
const { closeMiniPlayer } = require('./mini-player');
const { loadShortcuts, saveShortcuts, updateShortcut, getDefaultShortcuts, getShortcutActions } = require('./shortcuts');
const { getAvailableThemes, applyYtmTheme, getThemeColors } = require('./themes');
const { getCurrentLyrics } = require('./lyrics');
const { buildTrayMenuData, handleTrayMenuAction } = require('./tray');

/**
 * Validate settings object against allowed keys and types (SEC-07).
 */
function validateSettings(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const sanitized = {};
  for (const [key, expectedType] of Object.entries(ALLOWED_SETTINGS)) {
    if (key in input && typeof input[key] === expectedType) {
      sanitized[key] = input[key];
    }
  }
  return Object.keys(sanitized).length > 0 ? sanitized : null;
}

/**
 * Create a rate limiter for IPC handlers.
 * Returns a function that returns true if the call should be allowed,
 * or false if it exceeds the rate limit.
 *
 * @param {number} maxCalls - Max calls allowed in the window
 * @param {number} windowMs - Time window in milliseconds
 * @returns {function(): boolean}
 */
function createRateLimiter(maxCalls = IPC_RATE_LIMIT_MAX_CALLS, windowMs = IPC_RATE_LIMIT_WINDOW_MS) {
  const timestamps = [];
  return function isAllowed() {
    const now = Date.now();
    // Remove timestamps outside the window
    while (timestamps.length > 0 && timestamps[0] <= now - windowMs) {
      timestamps.shift();
    }
    if (timestamps.length >= maxCalls) {
      return false;
    }
    timestamps.push(now);
    return true;
  };
}

/**
 * Register all IPC handlers.
 */
function registerIpcHandlers(store) {
  // ---- Rate limiters for high-frequency IPC channels ----
  const saveSettingsLimiter = createRateLimiter();
  const trayMenuActionLimiter = createRateLimiter();
  const mediaCommandLimiter = createRateLimiter(15, IPC_RATE_LIMIT_WINDOW_MS); // slightly higher for media
  const updateShortcutLimiter = createRateLimiter(5, 2000); // 5 per 2s for shortcuts

  // ---- Window state ----

  ipcMain.handle('get-window-state', () => {
    try { return store.get('windowState'); }
    catch (err) { log.warn('get-window-state failed:', err.message); return null; }
  });

  ipcMain.handle('get-settings', () => {
    try { return store.get('settings'); }
    catch (err) { log.warn('get-settings failed:', err.message); return null; }
  });

  ipcMain.handle('save-settings', (_event, settings) => {
    if (!saveSettingsLimiter()) {
      log.warn('save-settings: rate limited, dropping call');
      return false;
    }
    const sanitized = validateSettings(settings);
    if (!sanitized) {
      log.warn('save-settings: rejected invalid settings input');
      return false;
    }
    try {
      const newSettings = { ...settingsCache.getSettings(), ...sanitized };
      store.set('settings', newSettings);
      // Update the settings cache so subsequent reads don't hit disk
      settingsCache.updateCache(newSettings);
      return true;
    } catch (err) {
      log.error('save-settings failed:', err.message);
      return false;
    }
  });

  // ---- Window controls ----

  ipcMain.handle('window-minimize', (_event) => {
    const win = getMainWindow();
    if (!win) return;
    try {
      const settings = store.get('settings');
      if (settings && settings.minimizeToTray === true) {
        win.hide();
        return;
      }
    } catch (err) {
      log.warn('[ipc] Failed to check minimizeToTray setting:', err.message);
    }
    win.minimize();
  });

  ipcMain.handle('window-maximize', () => {
    const win = getMainWindow();
    if (win) {
      if (win.isMaximized()) { win.unmaximize(); return false; }
      else { win.maximize(); return true; }
    }
    return false;
  });

  ipcMain.handle('window-close', () => {
    const win = getMainWindow();
    if (win) win.close();
  });

  // ---- Theme ----

  ipcMain.handle('get-theme', () => getCurrentTheme(store));

  ipcMain.handle('set-theme', (_event, theme) => {
    if (typeof theme !== 'string' || !ALLOWED_THEMES.includes(theme)) {
      log.warn('set-theme: rejected invalid theme value:', theme);
      return getCurrentTheme(store);
    }
    try {
      const current = store.get('settings') || {};
      store.set('settings', { ...current, theme });
      const newTheme = getCurrentTheme(store);
      const win = getMainWindow();
      if (win) win.webContents.send('theme-changed', newTheme);
      return newTheme;
    } catch (err) {
      log.error('set-theme failed:', err.message);
      return getCurrentTheme(store);
    }
  });

  // ---- Notifications ----

  ipcMain.handle('show-notification', (_event, data) => {
    try {
      const settings = store.get('settings');
      if (settings.showNotifications !== true) return false;
      if (!data || typeof data !== 'object') return false;
      const title = typeof data.title === 'string' ? data.title.substring(0, MAX_TITLE_LENGTH) : 'Youtube Music Desktop';
      const body = typeof data.body === 'string' ? data.body.substring(0, MAX_BODY_LENGTH) : '';
      const notification = new Notification({ title, body, icon: path.join(__dirname, '../assets/icon.ico'), silent: true });
      notification.show();
      return true;
    } catch (err) {
      log.error('show-notification failed:', err.message);
      return false;
    }
  });

  // ---- Tray ----

  ipcMain.handle('update-tray-tooltip', (_event, text) => {
    updateTrayTooltip(typeof text === 'string' ? text.substring(0, MAX_TOOLTIP_LENGTH) : 'Youtube Music Desktop');
  });

  // ---- Discord availability ----

  ipcMain.handle('is-discord-available', () => isDiscordAvailable());

  // ---- Media commands ----

  ipcMain.handle('media-command', (_event, command) => {
    if (!mediaCommandLimiter()) {
      log.warn('media-command: rate limited, dropping call');
      return false;
    }
    if (!isValidMediaCommand(command)) {
      log.warn('media-command: rejected invalid command:', command);
      return false;
    }
    const musicView = getMusicView();
    if (musicView) { executeMediaCommand(musicView.webContents, command); }
    return true;
  });

  // ---- Navigation ----

  ipcMain.handle('go-back', () => {
    const musicView = getMusicView();
    if (musicView) musicView.webContents.goBack();
  });

  ipcMain.handle('go-forward', () => {
    const musicView = getMusicView();
    if (musicView) musicView.webContents.goForward();
  });

  ipcMain.handle('get-navigation-state', () => {
    const musicView = getMusicView();
    if (!musicView) return { canGoBack: false, canGoForward: false };
    const wc = musicView.webContents;
    const navHistory = wc.navigationHistory;
    const canGoBack = navHistory ? navHistory.canGoBack() : (wc.canGoBack ? wc.canGoBack() : false);
    const canGoForward = navHistory ? navHistory.canGoForward() : (wc.canGoForward ? wc.canGoForward() : false);
    return { canGoBack, canGoForward };
  });

  // ---- Mini Player ----

  ipcMain.handle('close-mini-player', () => {
    closeMiniPlayer();
  });

  // ---- Shortcuts ----

  ipcMain.handle('get-shortcuts', () => {
    return {
      current: loadShortcuts(store),
      defaults: getDefaultShortcuts(),
      actions: getShortcutActions()
    };
  });

  ipcMain.handle('update-shortcut', (_event, action, accelerator) => {
    if (!updateShortcutLimiter()) {
      log.warn('update-shortcut: rate limited, dropping call');
      return false;
    }
    if (typeof action !== 'string' || typeof accelerator !== 'string') return false;
    try {
      updateShortcut(store, action, accelerator);
      return true;
    } catch (err) {
      log.error('update-shortcut failed:', err.message);
      return false;
    }
  });

  // ---- YTM Themes ----

  ipcMain.handle('get-ytm-themes', () => {
    return getAvailableThemes(store);
  });

  ipcMain.handle('set-ytm-theme', (_event, themeId) => {
    if (typeof themeId !== 'string') return false;
    // Validate theme ID to prevent arbitrary string injection
    if (!/^[a-zA-Z0-9\-_]+$/.test(themeId)) {
      log.warn('set-ytm-theme: rejected invalid theme ID:', themeId);
      return false;
    }
    try {
      const current = settingsCache.getSettings();
      const newSettings = { ...current, ytmTheme: themeId };
      store.set('settings', newSettings);
      // Update the settings cache
      settingsCache.updateCache(newSettings);
      const musicView = getMusicView();
      if (musicView) {
        applyYtmTheme(musicView.webContents, themeId, store);
      }
      // Send theme colors to title bar, mini player, and tray
      const colors = getThemeColors(themeId, store);
      const win = getMainWindow();
      if (win) win.webContents.send('ytm-theme-colors', colors);
      const { updateMiniPlayerThemeColors } = require('./mini-player');
      updateMiniPlayerThemeColors(colors);
      const { updateTrayThemeColors } = require('./tray');
      updateTrayThemeColors(colors);
      return true;
    } catch (err) {
      log.error('set-ytm-theme failed:', err.message);
      return false;
    }
  });

  // ---- Lyrics ----

  ipcMain.handle('get-lyrics', () => {
    return getCurrentLyrics();
  });

  // ---- YTM Theme Colors (for title bar / mini player sync) ----

  ipcMain.handle('get-ytm-theme-colors', () => {
    try {
      const settings = store.get('settings');
      const ytmTheme = settings?.ytmTheme || 'none';
      return getThemeColors(ytmTheme, store);
    } catch {
      return null;
    }
  });

  // ---- Tray Menu (for custom themed popup) ----

  ipcMain.handle('get-tray-menu-data', () => {
    try {
      return buildTrayMenuData();
    } catch (err) {
      log.error('get-tray-menu-data failed:', err.message);
      return null;
    }
  });

  ipcMain.handle('tray-menu-action', (_event, action) => {
    if (!trayMenuActionLimiter()) {
      log.warn('tray-menu-action: rate limited, dropping call');
      return false;
    }
    if (typeof action !== 'string') return false;
    try {
      handleTrayMenuAction(action);
      return true;
    } catch (err) {
      log.error('tray-menu-action failed:', err.message);
      return false;
    }
  });

  log.info('IPC handlers registered');
}

module.exports = {
  registerIpcHandlers,
  validateSettings
};
