/**
 * tray.js - System tray icon and context menu management
 *
 * Tray shows: Now Playing info, Play/Pause toggle, then a Settings
 * submenu containing all toggleable options (Mini Player, Lyrics,
 * Visualizer, Themes, Album Art Icon, Discord RPC, Start on Boot,
 * Minimize to Tray). Finally: Show Window and Quit.
 *
 * FIX v22: Removed themed tray icon (user requested removal).
 * Instead, the tray context menu now uses a custom themed popup
 * window that matches the active YTM theme colors.
 * FIX: Lyrics toggle now stops the lyrics poll.
 * FIX: Visualizer toggle now stops the visualizer poll.
 */

const { Tray, Menu, nativeImage, app, BrowserWindow, screen } = require('electron');
const path = require('path');
const crypto = require('crypto');
const log = require('./logger');
const { isDiscordAvailable, enableDiscordRPC, disableDiscordRPC } = require('./discord-rpc');
const { toggleMiniPlayer, isMiniPlayerVisible } = require('./mini-player');
const { getAvailableThemes, getThemeColors } = require('./themes');
const { TRAY_MENU_DEFAULTS, ALBUM_ART_THUMBNAIL_SIZE } = require('./config');
const settingsCache = require('./settings-cache');

let tray = null;
let currentTrackInfo = null;
let isPlaying = false;
let mediaCommandCallback = null;
let storeRef = null;
let currentThemeColors = null;
let trayMenuWindow = null;

/**
 * FIX v22: Generate a themed context menu popup window.
 * This creates a BrowserWindow popup positioned near the tray icon
 * with HTML/CSS that matches the active YTM theme colors.
 * Native Electron menus can't be themed, so we use a custom window.
 */
function generateTrayMenuHTML(nonce, colors) {
  const c = colors || {
    bg: '#030303', bgNav: '#1a1a1a', text: '#ffffff',
    textMuted: '#888888', accent: '#ff0000', bgInput: '#333333', bgHover: '#2a2a2a'
  };

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; img-src 'self' data: https: http:;">
  <title>Tray Menu</title>
  <style nonce="${nonce}">
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: 100%; height: 100%;
      overflow: hidden;
      background: ${c.bgNav};
      font-family: 'Segoe UI', -apple-system, sans-serif;
      color: ${c.text};
      user-select: none;
      font-size: 13px;
    }
    .menu { padding: 4px 0; }
    .menu-item {
      padding: 6px 16px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      white-space: nowrap;
      transition: background 0.1s;
    }
    .menu-item:hover { background: ${c.bgHover}; }
    .menu-item.disabled {
      color: ${c.textMuted};
      cursor: default;
    }
    .menu-item.disabled:hover { background: transparent; }
    .menu-item .check {
      width: 16px;
      text-align: center;
      color: ${c.accent};
      font-size: 12px;
    }
    .separator {
      height: 1px;
      background: ${c.bgInput};
      margin: 4px 8px;
    }
    .submenu-arrow {
      margin-left: auto;
      color: ${c.textMuted};
      font-size: 11px;
    }
    .submenu-panel {
      display: none;
      background: ${c.bgNav};
      border: 1px solid ${c.bgInput};
      border-radius: 6px;
      padding: 4px 0;
      position: absolute;
      left: 0; right: 0; top: 0;
      z-index: 10;
      box-shadow: 0 4px 12px rgba(0,0,0,0.5);
    }
    .submenu-panel.visible { display: block; }
    .submenu-back {
      padding: 6px 16px;
      cursor: pointer;
      color: ${c.accent};
      display: flex; align-items: center; gap: 6px;
    }
    .submenu-back:hover { background: ${c.bgHover}; }
    .now-playing {
      padding: 8px 16px 4px;
    }
    .now-playing .title {
      font-size: 12px; font-weight: 600;
      color: ${c.text};
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      max-width: 200px;
    }
    .now-playing .artist {
      font-size: 11px;
      color: ${c.textMuted};
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      max-width: 200px;
    }
    .theme-item {
      padding: 5px 16px 5px 32px;
      cursor: pointer;
      white-space: nowrap;
    }
    .theme-item:hover { background: ${c.bgHover}; }
    .theme-item.active { color: ${c.accent}; }
  </style>
</head>
<body>
  <div class="menu" id="main-menu"></div>
  <div class="submenu-panel" id="themes-submenu"></div>

  <script nonce="${nonce}">
    const api = window.electronAPI;
    let currentSection = 'main';

    function escapeHtml(str) {
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    }

    function buildMainMenu() {
      const menu = document.getElementById('main-menu');
      menu.innerHTML = '';
      currentSection = 'main';

      api.getTrayMenuData().then(data => {
        if (!data) return;
        const items = data.items || [];

        items.forEach(item => {
          if (item.type === 'separator') {
            const sep = document.createElement('div');
            sep.className = 'separator';
            menu.appendChild(sep);
          } else if (item.type === 'now-playing') {
            const np = document.createElement('div');
            np.className = 'now-playing';
            const titleEl = document.createElement('div');
            titleEl.className = 'title';
            titleEl.textContent = item.title || 'Not Playing';
            np.appendChild(titleEl);
            if (item.artist) {
              const artistEl = document.createElement('div');
              artistEl.className = 'artist';
              artistEl.textContent = item.artist;
              np.appendChild(artistEl);
            }
            menu.appendChild(np);
          } else if (item.type === 'themes') {
            const mi = document.createElement('div');
            mi.className = 'menu-item';
            const labelSpan = document.createElement('span');
            labelSpan.textContent = item.label;
            const arrow = document.createElement('span');
            arrow.className = 'submenu-arrow';
            arrow.innerHTML = '&#9654;';
            mi.appendChild(labelSpan);
            mi.appendChild(arrow);
            mi.addEventListener('click', () => showThemesSubmenu(data.themes || [], data.currentTheme || 'none'));
            menu.appendChild(mi);
          } else if (item.action) {
            const mi = document.createElement('div');
            mi.className = 'menu-item' + (item.disabled ? ' disabled' : '');
            const check = document.createElement('span');
            check.className = 'check';
            check.innerHTML = item.checked ? '&#10003;' : '';
            const labelSpan = document.createElement('span');
            labelSpan.textContent = item.label;
            mi.appendChild(check);
            mi.appendChild(labelSpan);
            if (!item.disabled) {
              mi.addEventListener('click', () => {
                api.trayMenuAction(item.action);
                window.close();
              });
            }
            menu.appendChild(mi);
          }
        });
      }).catch(err => log.warn('[tray] Failed to get tray menu data:', err.message));
    }

    function showThemesSubmenu(themes, currentTheme) {
      currentSection = 'themes';
      const mainMenu = document.getElementById('main-menu');
      const submenu = document.getElementById('themes-submenu');
      mainMenu.style.display = 'none';
      submenu.innerHTML = '';

      const back = document.createElement('div');
      back.className = 'submenu-back';
      back.innerHTML = '&#9664; Themes';
      back.addEventListener('click', () => {
        submenu.classList.remove('visible');
        mainMenu.style.display = '';
        currentSection = 'main';
      });
      submenu.appendChild(back);

      themes.forEach(t => {
        const ti = document.createElement('div');
        ti.className = 'theme-item' + (t.id === currentTheme ? ' active' : '');
        ti.textContent = (t.id === currentTheme ? '\\u2713 ' : '   ') + t.name;
        ti.addEventListener('click', () => {
          api.trayMenuAction('set-theme:' + t.id);
          window.close();
        });
        submenu.appendChild(ti);
      });

      submenu.classList.add('visible');
    }

    buildMainMenu();

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (currentSection === 'themes') {
          const submenu = document.getElementById('themes-submenu');
          const mainMenu = document.getElementById('main-menu');
          submenu.classList.remove('visible');
          mainMenu.style.display = '';
          currentSection = 'main';
        } else {
          window.close();
        }
      }
    });

    // Close when losing focus
    window.addEventListener('blur', () => {
      setTimeout(() => window.close(), 150);
    });
  </script>
</body>
</html>`;
}

/**
 * Show the themed tray context menu as a popup window.
 */
function showThemedTrayMenu() {
  if (trayMenuWindow && !trayMenuWindow.isDestroyed()) {
    trayMenuWindow.close();
    trayMenuWindow = null;
  }

  if (!tray) return;

  const trayBounds = tray.getBounds();
  // FIX: Use getDisplayNearestPoint to support multi-monitor setups.
  // Previously used getPrimaryDisplay(), which caused the menu to appear
  // on the wrong monitor when the tray was on a secondary display.
  const trayPoint = { x: Math.round(trayBounds.x + trayBounds.width / 2), y: Math.round(trayBounds.y) };
  const display = screen.getDisplayNearestPoint(trayPoint);
  const { workArea } = display;

  const windowWidth = 240;
  const windowHeight = 380;

  // Position the menu near the tray icon
  let x = Math.round(trayBounds.x + trayBounds.width / 2 - windowWidth / 2);
  let y = Math.round(trayBounds.y + trayBounds.height);

  // Keep menu within work area
  if (x + windowWidth > workArea.x + workArea.width) {
    x = workArea.x + workArea.width - windowWidth;
  }
  if (x < workArea.x) x = workArea.x;
  if (y + windowHeight > workArea.y + workArea.height) {
    y = Math.round(trayBounds.y - windowHeight);
  }

  const nonce = crypto.randomBytes(16).toString('base64');
  const html = generateTrayMenuHTML(nonce, currentThemeColors);

  trayMenuWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    x: x,
    y: y,
    frame: false,
    transparent: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    focusable: true,
    icon: path.join(__dirname, '../assets/icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  trayMenuWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

  trayMenuWindow.once('ready-to-show', () => {
    trayMenuWindow.show();
    trayMenuWindow.focus();
  });

  trayMenuWindow.on('closed', () => {
    trayMenuWindow = null;
  });
}

/**
 * Build tray menu data for the custom themed popup.
 */
function buildTrayMenuData() {
  const items = [];

  // Now Playing
  if (isMenuItemVisible('nowPlaying')) {
    if (currentTrackInfo && currentTrackInfo.title) {
      items.push({
        type: 'now-playing',
        title: currentTrackInfo.title.length > 40 ? currentTrackInfo.title.substring(0, 37) + '...' : currentTrackInfo.title,
        artist: currentTrackInfo.artist || 'Unknown Artist'
      });
      items.push({
        action: 'play-pause',
        label: isPlaying ? '\u275A\u275A  Pause' : '\u25B6  Play',
        checked: false
      });
    } else {
      items.push({ type: 'now-playing', title: 'Not Playing', artist: '' });
    }
    items.push({ type: 'separator' });
  }

  // Settings toggles
  if (isMenuItemVisible('miniPlayer')) {
    items.push({
      action: 'mini-player',
      label: 'Mini Player',
      checked: isMiniPlayerVisible()
    });
  }
  if (isMenuItemVisible('lyrics')) {
    items.push({
      action: 'lyrics',
      label: 'Lyrics Overlay',
      checked: readSetting('showLyrics', false)
    });
  }
  if (isMenuItemVisible('visualizer')) {
    items.push({
      action: 'visualizer',
      label: 'Audio Visualizer',
      checked: readSetting('showVisualizer', false)
    });
  }

  items.push({ type: 'separator' });

  // Themes submenu
  if (isMenuItemVisible('ytmThemes')) {
    const currentYtmTheme = readStringSetting('ytmTheme', 'none');
    const themes = getAvailableThemes(storeRef);
    items.push({
      type: 'themes',
      label: '\u2668  Themes',
      themes: themes,
      currentTheme: currentYtmTheme
    });
  }

  if (isMenuItemVisible('albumArtIcon')) {
    items.push({
      action: 'album-art-icon',
      label: 'Album Art as Icon',
      checked: readSetting('albumArtTrayIcon', false)
    });
  }

  items.push({ type: 'separator' });

  if (isMenuItemVisible('discordRpc') && isDiscordAvailable()) {
    items.push({
      action: 'discord-rpc',
      label: 'Discord Rich Presence',
      checked: readSetting('discordRpc', true)
    });
  }
  if (isMenuItemVisible('startOnBoot')) {
    items.push({
      action: 'start-on-boot',
      label: 'Start on Boot',
      checked: readSetting('startOnBoot', false)
    });
  }
  if (isMenuItemVisible('minimizeToTray')) {
    items.push({
      action: 'minimize-to-tray',
      label: 'Minimize to Tray',
      checked: readSetting('minimizeToTray', true)
    });
  }

  items.push({ type: 'separator' });

  items.push({ action: 'show-window', label: '\u25B6  Show Window', checked: false });
  items.push({ action: 'quit', label: '\u2715  Quit', checked: false });

  return {
    items: items,
    themes: isMenuItemVisible('ytmThemes') ? getAvailableThemes(storeRef) : [],
    currentTheme: readStringSetting('ytmTheme', 'none')
  };
}

/**
 * Handle actions from the themed tray menu popup.
 */
function handleTrayMenuAction(action) {
  if (!action) return;

  switch (action) {
    case 'play-pause':
      if (mediaCommandCallback) mediaCommandCallback('play-pause');
      break;
    case 'mini-player':
      toggleMiniPlayer(storeRef, mediaCommandCallback);
      break;
    case 'lyrics': {
      const next = !readSetting('showLyrics', false);
      saveSetting('showLyrics', next);
      const win = require('./window').getMainWindow();
      if (win) win.webContents.send('lyrics-toggled', next);
      if (next) {
        try { require('./window').startLyricsPoll(); } catch (err) { log.warn('[tray] Failed to start lyrics poll:', err.message); }
      } else {
        try { require('./window').stopLyricsPoll(); } catch (err) { log.warn('[tray] Failed to stop lyrics poll:', err.message); }
      }
      break;
    }
    case 'visualizer': {
      const next = !readSetting('showVisualizer', false);
      saveSetting('showVisualizer', next);
      const win = require('./window').getMainWindow();
      if (win) win.webContents.send('visualizer-toggled', next);
      if (next) {
        try {
          const { startVisualizerPoll, injectVisualizer, getMusicView } = require('./window');
          const mv = getMusicView();
          if (mv) injectVisualizer(mv.webContents);
          startVisualizerPoll();
        } catch (err) { log.warn('[tray] Failed to start visualizer:', err.message); }
      } else {
        try { require('./window').stopVisualizerPoll(); } catch (err) { log.warn('[tray] Failed to stop visualizer poll:', err.message); }
      }
      break;
    }
    case 'album-art-icon': {
      const next = !readSetting('albumArtTrayIcon', false);
      saveSetting('albumArtTrayIcon', next);
      if (next) {
        updateTrayAlbumArt();
      } else {
        resetTrayIcon();
      }
      break;
    }
    case 'discord-rpc': {
      const next = !readSetting('discordRpc', true);
      saveSetting('discordRpc', next);
      if (next) {
        enableDiscordRPC();
      } else {
        disableDiscordRPC().catch(err => log.warn('Error disabling Discord RPC:', err.message));
      }
      break;
    }
    case 'start-on-boot': {
      const next = !readSetting('startOnBoot', false);
      saveSetting('startOnBoot', next);
      try {
        app.setLoginItemSettings({ openAtLogin: next, path: app.getPath('exe'), args: [] });
      } catch (err) {
        log.warn('Failed to set login item:', err.message);
      }
      break;
    }
    case 'minimize-to-tray':
      saveSetting('minimizeToTray', !readSetting('minimizeToTray', true));
      break;
    case 'show-window': {
      const { getMainWindow } = require('./window');
      const win = getMainWindow();
      if (win) { win.show(); win.focus(); }
      break;
    }
    case 'quit':
      require('./window').setIsQuitting(true);
      app.quit();
      break;
    default:
      // Theme selection: action is "set-theme:<themeId>"
      if (action.startsWith('set-theme:')) {
        const themeId = action.substring('set-theme:'.length);
        // Validate theme ID to prevent arbitrary string injection.
        // Theme IDs should only contain alphanumeric chars, dashes, and underscores.
        if (!/^[a-zA-Z0-9\-_]+$/.test(themeId)) {
          log.warn('[tray] Invalid theme ID in action, ignoring:', themeId);
          break;
        }
        saveSetting('ytmTheme', themeId);
        const { getMusicView, getMainWindow } = require('./window');
        const { applyYtmTheme, getThemeColors } = require('./themes');
        const mv = getMusicView();
        if (mv) applyYtmTheme(mv.webContents, themeId, storeRef);
        const colors = getThemeColors(themeId, storeRef);
        const win = getMainWindow();
        if (win) win.webContents.send('ytm-theme-colors', colors);
        const { updateMiniPlayerThemeColors } = require('./mini-player');
        updateMiniPlayerThemeColors(colors);
        updateTrayThemeColors(colors);
      }
      break;
  }
}

/**
 * Read a boolean setting from the store.
 */
function readSetting(key, defaultValue = true) {
  try {
    const settings = settingsCache.getSettings();
    if (settings && typeof settings[key] === 'boolean') {
      return settings[key];
    }
  } catch (err) {
    log.warn('[tray] Failed to read boolean setting:', err.message);
  }
  return defaultValue;
}

/**
 * Read a string setting from the store.
 */
function readStringSetting(key, defaultValue = '') {
  try {
    const settings = settingsCache.getSettings();
    if (settings && typeof settings[key] === 'string') {
      return settings[key];
    }
  } catch (err) {
    log.warn('[tray] Failed to read string setting:', err.message);
  }
  return defaultValue;
}

/**
 * Read tray menu visibility for an item.
 */
function isMenuItemVisible(itemId) {
  try {
    const custom = storeRef ? storeRef.get('trayMenuItems') : null;
    if (custom && typeof custom[itemId] === 'boolean') {
      return custom[itemId];
    }
  } catch (err) {
    log.warn('[tray] Failed to read menu item visibility:', err.message);
  }
  return TRAY_MENU_DEFAULTS[itemId] !== false;
}

/**
 * Save a setting and refresh the tray menu.
 */
function saveSetting(key, value) {
  if (storeRef) {
    try {
      const current = settingsCache.getSettings();
      const newSettings = { ...current, [key]: value };
      storeRef.set('settings', newSettings);
      // Update the settings cache so subsequent reads don't hit disk
      settingsCache.updateCache(newSettings);
      log.info(`Setting ${key} set to:`, value);
    } catch (err) {
      log.error(`Failed to save setting ${key}:`, err.message);
    }
  }
  refreshTrayMenu();
}

/**
 * Build the Settings submenu.
 */
function buildSettingsSubmenu() {
  const items = [];

  // ── Mini Player ──
  if (isMenuItemVisible('miniPlayer')) {
    const miniPlayerVisible = isMiniPlayerVisible();
    items.push({
      label: miniPlayerVisible ? '\u2713  Mini Player' : '     Mini Player',
      click: () => {
        toggleMiniPlayer(storeRef, mediaCommandCallback);
        refreshTrayMenu();
      }
    });
  }

  // ── Lyrics Toggle ──
  if (isMenuItemVisible('lyrics')) {
    const showLyrics = readSetting('showLyrics', false);
    items.push({
      label: showLyrics ? '\u2713  Lyrics Overlay' : '     Lyrics Overlay',
      click: () => {
        const next = !showLyrics;
        saveSetting('showLyrics', next);
        const win = require('./window').getMainWindow();
        if (win) win.webContents.send('lyrics-toggled', next);
        // Stop/start lyrics poll
        if (next) {
          try {
            const { startLyricsPoll } = require('./window');
            startLyricsPoll();
          } catch (err) { log.warn('[tray] Failed to start lyrics poll:', err.message); }
        } else {
          try {
            const { stopLyricsPoll } = require('./window');
            stopLyricsPoll();
          } catch (err) { log.warn('[tray] Failed to stop lyrics poll:', err.message); }
        }
      }
    });
  }

  // ── Visualizer Toggle ──
  if (isMenuItemVisible('visualizer')) {
    const showVisualizer = readSetting('showVisualizer', false);
    items.push({
      label: showVisualizer ? '\u2713  Audio Visualizer' : '     Audio Visualizer',
      click: () => {
        const next = !showVisualizer;
        saveSetting('showVisualizer', next);
        const win = require('./window').getMainWindow();
        if (win) win.webContents.send('visualizer-toggled', next);
        // Stop/start visualizer poll
        if (next) {
          try {
            const { startVisualizerPoll, injectVisualizer } = require('./window');
            const { getMusicView } = require('./window');
            const mv = getMusicView();
            if (mv) injectVisualizer(mv.webContents);
            startVisualizerPoll();
          } catch (err) { log.warn('[tray] Failed to start visualizer:', err.message); }
        } else {
          try {
            const { stopVisualizerPoll } = require('./window');
            stopVisualizerPoll();
          } catch (err) { log.warn('[tray] Failed to stop visualizer poll:', err.message); }
        }
      }
    });
  }

  items.push({ type: 'separator' });

  // ── YTM Themes submenu ──
  if (isMenuItemVisible('ytmThemes')) {
    const currentYtmTheme = readStringSetting('ytmTheme', 'none');
    const themes = getAvailableThemes(storeRef);
    const themeSubmenu = themes.map(t => ({
      label: t.id === currentYtmTheme ? '\u2713 ' + t.name : '   ' + t.name,
      click: () => {
        saveSetting('ytmTheme', t.id);
        const { getMusicView, getMainWindow } = require('./window');
        const { applyYtmTheme, getThemeColors } = require('./themes');
        const mv = getMusicView();
        if (mv) applyYtmTheme(mv.webContents, t.id, storeRef);
        // Send theme colors to title bar and mini player
        const colors = getThemeColors(t.id, storeRef);
        const win = getMainWindow();
        if (win) win.webContents.send('ytm-theme-colors', colors);
        const { updateMiniPlayerThemeColors } = require('./mini-player');
        updateMiniPlayerThemeColors(colors);
        // Update tray icon to match the new theme
        updateTrayThemeColors(colors);
      }
    }));

    items.push({
      label: '\u2668  Themes',
      submenu: themeSubmenu
    });
  }

  // ── Album Art Tray Icon ──
  if (isMenuItemVisible('albumArtIcon')) {
    const albumArtIcon = readSetting('albumArtTrayIcon', false);
    items.push({
      label: albumArtIcon ? '\u2713  Album Art as Icon' : '     Album Art as Icon',
      click: () => {
        const next = !albumArtIcon;
        saveSetting('albumArtTrayIcon', next);
        if (next) {
          updateTrayAlbumArt();
        } else {
          resetTrayIcon();
        }
      }
    });
  }

  items.push({ type: 'separator' });

  // ── Discord Rich Presence ──
  if (isMenuItemVisible('discordRpc') && isDiscordAvailable()) {
    const discordRpc = readSetting('discordRpc', true);
    items.push({
      label: discordRpc ? '\u2713  Discord Rich Presence' : '     Discord Rich Presence',
      click: () => {
        const next = !discordRpc;
        saveSetting('discordRpc', next);
        if (next) {
          enableDiscordRPC();
        } else {
          disableDiscordRPC().catch(err => {
            log.warn('Error disabling Discord RPC:', err.message);
          });
        }
      }
    });
  }

  // ── Start on Boot ──
  if (isMenuItemVisible('startOnBoot')) {
    const startOnBoot = readSetting('startOnBoot', false);
    items.push({
      label: startOnBoot ? '\u2713  Start on Boot' : '     Start on Boot',
      click: () => {
        const next = !startOnBoot;
        saveSetting('startOnBoot', next);
        try {
          app.setLoginItemSettings({ openAtLogin: next, path: app.getPath('exe'), args: [] });
          log.info('Start on boot set to:', next);
        } catch (err) {
          log.warn('Failed to set login item:', err.message);
        }
      }
    });
  }

  // ── Minimize to Tray ──
  if (isMenuItemVisible('minimizeToTray')) {
    const minimizeToTray = readSetting('minimizeToTray', true);
    items.push({
      label: minimizeToTray ? '\u2713  Minimize to Tray' : '     Minimize to Tray',
      click: () => {
        saveSetting('minimizeToTray', !minimizeToTray);
      }
    });
  }

  return items;
}

/**
 * Build the context menu template dynamically.
 */
function buildContextMenu() {
  const menuItems = [];

  // ── Now Playing section ──
  if (isMenuItemVisible('nowPlaying')) {
    if (currentTrackInfo && currentTrackInfo.title) {
      const displayTitle = currentTrackInfo.title.length > 50
        ? currentTrackInfo.title.substring(0, 47) + '...'
        : currentTrackInfo.title;

      const displayArtist = currentTrackInfo.artist
        ? (currentTrackInfo.artist.length > 40
            ? currentTrackInfo.artist.substring(0, 37) + '...'
            : currentTrackInfo.artist)
        : 'Unknown Artist';

      menuItems.push(
        { label: '\u266A  Now Playing', enabled: false },
        { label: `    ${displayTitle}`, enabled: false },
        { label: `    ${displayArtist}`, enabled: false },
        { type: 'separator' }
      );

      menuItems.push({
        label: isPlaying ? '\u275A\u275A  Pause' : '\u25B6  Play',
        click: () => { if (mediaCommandCallback) mediaCommandCallback('play-pause'); }
      });
    } else {
      menuItems.push(
        { label: '\u266A  Not Playing', enabled: false },
        { type: 'separator' }
      );
    }
  }

  // ── Settings submenu ──
  menuItems.push({
    label: '\u2699  Settings',
    submenu: buildSettingsSubmenu()
  });

  // ── Show Window ──
  menuItems.push({
    label: '\u25B6  Show Window',
    click: () => {
      const { getMainWindow } = require('./window');
      const win = getMainWindow();
      if (win) { win.show(); win.focus(); }
    }
  });

  menuItems.push({ type: 'separator' });

  // ── Quit ──
  menuItems.push({
    label: '\u2715  Quit',
    click: () => {
      const { setIsQuitting } = require('./window');
      setIsQuitting(true);
      app.quit();
    }
  });

  return Menu.buildFromTemplate(menuItems);
}

/**
 * Refresh the tray context menu.
 */
function refreshTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(buildContextMenu());
}

/**
 * Create the system tray icon and context menu.
 * FIX v22: Right-click shows a custom themed popup menu that matches
 * the active YTM theme. Left-click toggles the main window.
 */
function createTray(store, callback) {
  storeRef = store;
  mediaCommandCallback = callback;

  const iconPath = path.join(__dirname, '../assets/icon.ico');
  let trayIcon;

  try {
    trayIcon = nativeImage.createFromPath(iconPath);
    if (trayIcon.isEmpty()) {
      trayIcon = nativeImage.createEmpty();
    }
  } catch (error) {
    log.error('Failed to load tray icon:', error);
    trayIcon = nativeImage.createEmpty();
  }

  tray = new Tray(trayIcon);
  tray.setToolTip('Youtube Music Desktop');

  // Set a basic native context menu as fallback (for accessibility)
  // The themed menu is shown via right-click handler below
  tray.setContextMenu(buildContextMenu());

  // Left-click: toggle main window visibility
  tray.on('click', () => {
    const { getMainWindow } = require('./window');
    const win = getMainWindow();
    if (win) {
      if (win.isVisible()) {
        win.hide();
      } else {
        win.show();
        win.focus();
      }
    }
  });

  // Right-click: show custom themed popup menu
  tray.on('right-click', () => {
    showThemedTrayMenu();
  });

  log.info('System tray created');
}

/**
 * Update tray tooltip with track info.
 */
function updateTrayTooltip(text) {
  if (!tray) return;
  const tooltip = typeof text === 'string' && text.length > 0
    ? text.substring(0, 200)
    : 'Youtube Music Desktop';
  tray.setToolTip(tooltip);
}

/**
 * Update the tray with current track info and play state.
 */
function updateTrayTrack(track) {
  if (!track || !track.title) return;

  const changed = !currentTrackInfo ||
    currentTrackInfo.title !== track.title ||
    currentTrackInfo.artist !== track.artist ||
    currentTrackInfo.isPaused !== track.isPaused ||
    currentTrackInfo.albumArt !== track.albumArt;

  if (!changed) return;

  currentTrackInfo = {
    title: track.title,
    artist: track.artist || '',
    isPaused: !!track.isPaused,
    albumArt: track.albumArt || ''
  };
  isPlaying = !currentTrackInfo.isPaused;

  const label = currentTrackInfo.artist
    ? `${currentTrackInfo.title} - ${currentTrackInfo.artist}`
    : currentTrackInfo.title;
  updateTrayTooltip(label);

  // Update album art tray icon if enabled
  if (readSetting('albumArtTrayIcon', false)) {
    updateTrayAlbumArt();
  }

  refreshTrayMenu();
}

/**
 * Update the tray icon with the current track's album art.
 */
async function updateTrayAlbumArt() {
  if (!tray || !currentTrackInfo || !currentTrackInfo.albumArt) {
    resetTrayIcon();
    return;
  }

  // Prefer a small thumbnail instead of fetching full-resolution album art.
  // YouTube serves thumbnails at /s64/ which is 64x64 — sufficient for
  // a 16x16 tray icon and avoids downloading 1000+ pixel images.
  let thumbUrl = currentTrackInfo.albumArt || '';
  if (thumbUrl && ALBUM_ART_THUMBNAIL_SIZE) {
    try {
      // Replace size hint in YouTube thumbnail URLs
      thumbUrl = thumbUrl.replace(/=s\d+/, '=s' + ALBUM_ART_THUMBNAIL_SIZE);
      if (!thumbUrl.includes('=s')) {
        thumbUrl += '=s' + ALBUM_ART_THUMBNAIL_SIZE;
      }
    } catch (_) { /* use original URL */ }
  }

  try {
    const response = await fetch(thumbUrl, {
      signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) return;

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const image = nativeImage.createFromBuffer(buffer);

    if (!image.isEmpty()) {
      const resized = image.resize({ width: 16, height: 16 });
      tray.setImage(resized);
    }
  } catch (err) {
    log.warn('Failed to load album art for tray icon:', err.message);
  }
}

/**
 * Update tray theme colors (for the custom popup menu).
 * FIX v22: No longer changes the tray icon — only stores colors for
 * the custom themed context menu.
 */
function updateTrayThemeColors(colors) {
  currentThemeColors = colors;
}

/**
 * Reset tray icon to the default app icon.
 * FIX v22: Always resets to default icon (no themed icon anymore).
 */
function resetTrayIcon() {
  if (!tray) return;
  const iconPath = path.join(__dirname, '../assets/icon.ico');
  try {
    const icon = nativeImage.createFromPath(iconPath);
    if (!icon.isEmpty()) {
      tray.setImage(icon);
    }
  } catch (err) {
    log.warn('[tray] Failed to reset tray icon:', err.message);
  }
}

/**
 * Destroy the tray (for cleanup).
 */
function destroyTray() {
  if (tray) {
    tray.destroy();
    tray = null;
  }
  storeRef = null;
}

module.exports = {
  createTray,
  updateTrayTooltip,
  updateTrayTrack,
  updateTrayAlbumArt,
  resetTrayIcon,
  updateTrayThemeColors,
  buildTrayMenuData,
  handleTrayMenuAction,
  destroyTray
};
