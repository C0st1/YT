/**
 * main.js - Application entry point
 *
 * v23 — SMTC fix: AUMID uses Desktop App Converter format for proper
 *   app name + icon in Windows 11 volume tray. Media keys NOT registered
 *   as global shortcuts (conflicts with Chromium SMTC bridge).
 *   Shortcuts modal now works (removeMusicView/restoreMusicView).
 *   Shortcuts are editable in the modal.
 */

const { app, BrowserWindow, globalShortcut, ipcMain, nativeTheme } = require('electron');
const { execFile } = require('child_process');
const path = require('path');
const Store = require('electron-store');
const log = require('./logger');

// ── Windows SMTC integration ──
// Required for OS-level media controls (volume overlay, taskbar playback)
//
// FIX v23: The AUMID format matters for Windows 11 SMTC:
// - Using the Desktop App Converter format (Company.Product)
// ensures the app name AND icon appear correctly in the volume
// overlay. The AUMID must match the appId in electron-builder.
// - Setting app.name ensures the display name is correct.
// - Registry keys are written AFTER app.whenReady() to ensure
//   process.resourcesPath is properly set for the icon path.
if (process.platform === 'win32') {
  app.setAppUserModelId('com.youtube-music.desktop');
}

// Ensure MediaSessionService and hardware media key handling are enabled
// FIX v23: Also enable MediaSessionStorage for persistent session state
// which helps Windows 11 SMTC remember the app between sessions.
app.commandLine.appendSwitch('enable-features', 'HardwareMediaKeyHandling,MediaSessionService,MediaSessionStorage');

// Set the app name early so Windows SMTC shows the correct name
app.setName('Youtube Music Desktop');
const { setupGhosteryAdBlocker } = require('./adblocker');
const { initDiscordRPC, cleanupDiscordRPC, isDiscordAvailable } = require('./discord-rpc');
const { executeMediaCommand } = require('./media-commands');
const {
  createWindow,
  createSplashScreen,
  closeSplashScreen,
  saveWindowState,
  getMainWindow,
  getMusicView,
  setIsQuitting,
  getCurrentTheme,
  removeMusicView,
  restoreMusicView
} = require('./window');
const { createTray } = require('./tray');
const { registerIpcHandlers } = require('./ipc-handlers');
const { registerCustomShortcuts, unregisterCustomShortcuts } = require('./shortcuts');
const { toggleMiniPlayer, closeMiniPlayer, isMiniPlayerVisible } = require('./mini-player');
const { FIRST_RUN_DELAY_MS, NORMAL_DELAY_MS } = require('./config');


const IS_TEST_MODE = process.argv.includes('--test-screenshot');

// ============================================================
// Single Instance Lock
// ============================================================

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  log.info('Another instance is already running. Exiting.');
  app.quit();
} else {
  app.on('second-instance', (_event, _commandLine, _workingDirectory) => {
    log.info('Second instance detected, focusing existing window');
    const win = getMainWindow();
    if (win) {
      if (win.isMinimized()) { win.restore(); }
      win.show();
      win.focus();
    }
  });
}

// ============================================================
// Store
// ============================================================

let store;

try {
  store = new Store({
    defaults: {
      windowState: {
        width: 1200,
        height: 800,
        x: undefined,
        y: undefined,
        isMaximized: false
      },
      settings: {
        minimizeToTray: true,
        showNotifications: false,
        startMinimized: false,
        discordRpc: true,
        startOnBoot: false,
        showMiniPlayer: false,
        albumArtTrayIcon: false,
        showVisualizer: false,
        showLyrics: false,
        ytmTheme: 'none',
        theme: 'system'
      },
      shortcuts: {},
      customThemes: {},
      trayMenuItems: {},
      miniPlayerState: {},
      firstRun: true
    }
  });
} catch (err) {
  log.error('Failed to initialize store:', err.message);
  process.exit(1);
}

// ============================================================
// Media command dispatch
// ============================================================

function sendMediaCommand(command) {
  const musicView = getMusicView();

  // Volume commands need special JS injection
  if (command === 'volume-up' || command === 'volume-down' || command === 'mute') {
    if (musicView && !musicView.webContents.isDestroyed()) {
      const volumeJS = command === 'mute'
        ? `(function(){ var v=document.querySelector('video'); if(v) v.muted=!v.muted; })()`
        : `(function(){ var v=document.querySelector('video'); if(v) v.volume=Math.min(1,Math.max(0,Math.round((v.volume${command === 'volume-up' ? '+0.1' : '-0.1'})*10)/10)); })()`;
      musicView.webContents.executeJavaScript(volumeJS).catch(() => {});
    }
    return;
  }

  if (musicView && !musicView.webContents.isDestroyed()) {
    executeMediaCommand(musicView.webContents, command);
  }
}

// ============================================================
// Shortcuts modal visibility state
// ============================================================
let shortcutsModalVisible = false;

// ============================================================
// Global shortcuts (media keys + custom bindings)
// ============================================================

function registerShortcuts() {
  // FIX v22: Do NOT register media keys (MediaPlayPause, MediaNextTrack, etc.)
  // as global shortcuts. These conflict with Chromium's built-in SMTC bridge
  // on Windows 11. When Electron registers them, Chromium can't forward media
  // key events to the OS, breaking the volume overlay / system media controls.
  // Instead, let Chromium handle media keys natively — it will route them
  // through navigator.mediaSession which feeds the SMTC.
  log.info('Media keys left unregistered (SMTC bridge handles them natively)');

  // Register custom user shortcuts (non-media-key bindings only)
  registerCustomShortcuts(store, {
    mediaCommand: (cmd) => sendMediaCommand(cmd),
    miniPlayer: () => toggleMiniPlayer(store, (cmd) => sendMediaCommand(cmd)),
    minimize: () => {
      const win = getMainWindow();
      if (win) win.minimize();
    },
    showShortcuts: () => {
      const win = getMainWindow();
      if (!win) return;

      shortcutsModalVisible = !shortcutsModalVisible;

      if (shortcutsModalVisible) {
        // FIX v22: Remove the musicView entirely from the window so the
        // shortcuts modal in the title bar HTML is visible. Using
        // removeChildView is more reliable than setBounds({0,0,0,0}).
        removeMusicView();
      }

      win.webContents.send('toggle-shortcuts-modal');
      // When closing, the renderer sends 'shortcuts-modal-closed' IPC
      // which restores the musicView (see handler below).
    }
  });
}

function unregisterShortcuts() {
  globalShortcut.unregisterAll();
  unregisterCustomShortcuts();
}

// ============================================================
// Theme listener
// ============================================================

function setupThemeListener() {
  nativeTheme.on('updated', () => {
    const theme = getCurrentTheme(store);
    log.info('System theme changed to:', theme);
    const win = getMainWindow();
    if (win) {
      win.webContents.send('theme-changed', theme);
    }
  });
}

// ============================================================
// SMTC Registry Keys (Windows only)
// ============================================================

/**
 * Write SMTC registry keys using async execFile instead of execSync.
 * execSync blocks the main process event loop, freezing the UI for
 * 100-500ms per call. execFile runs the command asynchronously.
 */
async function writeSmtcRegistryKeys() {
  try {
    const aumid = app.getAppUserModelId();
    // Validate AUMID to prevent injection via reg.exe command
    if (!/^[a-zA-Z0-9.\-_]+$/.test(aumid)) {
      log.warn('[SMTC] Invalid AUMID format, skipping registry writes:', aumid);
      return;
    }
    const regKey = `HKCU\\Software\\Classes\\AppUserModelId\\${aumid}`;

    // Icon path: try multiple locations since the app can run from
    // different contexts (dev, NSIS install, portable, asar).
    const fs = require('fs');
    let iconPath = '';
    // assets/ is declared in asarUnpack, so it always lives as a real file
    // at resources/assets/ — no need to probe ASAR-internal paths.
    const candidatePaths = [
      path.join(process.resourcesPath, 'assets', 'icon.ico'),
      // Fallback for running un-packaged in dev (electron .)
      path.join(__dirname, '..', 'assets', 'icon.ico'),
    ];
    for (const p of candidatePaths) {
      try {
        if (fs.existsSync(p)) { iconPath = p; break; }
      } catch (err) {
        // Path check failed, try next candidate
      }
    }

    if (!iconPath) {
      log.warn('[SMTC] Could not locate icon.ico, skipping IconUri');
    } else {
      // Validate icon path doesn't contain suspicious characters
      if (iconPath.includes('"') || iconPath.includes('&') || iconPath.includes('|') ||
          iconPath.includes('`') || iconPath.includes('$')) {
        log.warn('[SMTC] Icon path contains suspicious characters, skipping IconUri');
        iconPath = '';
      }
    }

    // Helper: run reg.exe asynchronously
    const regAdd = (args) => new Promise((resolve, reject) => {
      execFile('reg', args, { windowsHide: true }, (err, stdout, stderr) => {
        if (err) reject(err);
        else resolve(stdout);
      });
    });

    // Write DisplayName
    await regAdd(['add', regKey, '/v', 'DisplayName', '/t', 'REG_SZ', '/d', 'Youtube Music Desktop', '/f']);
    log.info('[SMTC] DisplayName written to registry');

    // Write IconUri only if we found the icon file
    if (iconPath) {
      const winPath = iconPath.replace(/\//g, '\\\\');
      await regAdd(['add', regKey, '/v', 'IconUri', '/t', 'REG_SZ', '/d', winPath, '/f']);
      log.info('[SMTC] IconUri written to registry:', iconPath);
    }

    // Write RelaunchDisplayName for Start Menu / taskbar
    await regAdd(['add', regKey, '/v', 'RelaunchDisplayName', '/t', 'REG_SZ', '/d', 'Youtube Music Desktop', '/f']);

    log.info('[SMTC] Registry keys written successfully (AUMID:', aumid, ')');
  } catch (err) {
    log.warn('[SMTC] Failed to write registry keys:', err.message);
  }
}

// ============================================================
// Start on Boot
// ============================================================

function applyStartOnBootSetting() {
  try {
    const settings = store.get('settings');
    const startOnBoot = settings && settings.startOnBoot === true;
    app.setLoginItemSettings({
      openAtLogin: startOnBoot,
      path: app.getPath('exe'),
      args: []
    });
    log.info('Start on boot set to:', startOnBoot);
  } catch (err) {
    log.warn('Failed to set login item:', err.message);
  }
}

// ============================================================
// App lifecycle
// ============================================================

app.whenReady().then(async () => {
  log.info('Youtube Music Desktop v23 starting...');
  log.info('Electron version:', process.versions.electron);

  // Force notifications off for older installs
  try { store.set('settings.showNotifications', false); } catch (err) {
    log.warn('Failed to force-disable notifications:', err.message);
  }

  let settings;
  try { settings = store.get('settings'); } catch (err) {
    log.warn('Failed to read settings:', err.message);
    settings = {};
  }

  const firstRun = store.get('firstRun') === true;

  // Setup ad blocker (async)
  await setupGhosteryAdBlocker();

  // Initialize Discord Rich Presence
  if (isDiscordAvailable() && settings.discordRpc !== false) {
    initDiscordRPC();
  }

  // Apply start on boot setting
  applyStartOnBootSetting();

  // Show splash screen
  if (!settings.startMinimized && !IS_TEST_MODE) {
    // Initialize settings cache early so splash screen can read YTM theme
    const { initSettingsCache } = require('./settings-cache');
    initSettingsCache(store);
    createSplashScreen(store);
  }

  // Register IPC handlers
  registerIpcHandlers(store);

  // Setup theme listener
  setupThemeListener();

  // Write SMTC registry keys AFTER app.whenReady() so that
  // process.resourcesPath is resolved correctly.
  if (process.platform === 'win32') {
    writeSmtcRegistryKeys();
  }

  const delay = firstRun && !IS_TEST_MODE ? FIRST_RUN_DELAY_MS : NORMAL_DELAY_MS;
  setTimeout(() => {
    createWindow(store);

    createTray(store, (command) => sendMediaCommand(command));

    registerShortcuts();

    if (firstRun) {
      try { store.set('firstRun', false); } catch (err) {
        log.warn('Failed to set firstRun flag:', err.message);
      }
    }
  }, delay);

  app.on('activate', () => {
    const win = getMainWindow();
    if (win) {
      win.show();
      win.focus();
    } else if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(store);
    }
  });
});

app.on('window-all-closed', () => {
  // On Windows/Linux, closing all windows should NOT quit the app
  // if minimizeToTray is enabled — the tray icon is still active.
  // Only quit if minimizeToTray is disabled (or settings can't be read).
  if (process.platform !== 'darwin') {
    try {
      const settings = store.get('settings');
      if (settings && settings.minimizeToTray === true) {
        log.info('All windows closed but minimizeToTray is active, keeping app in tray');
        return; // Stay in tray
      }
    } catch (err) {
      log.warn('Failed to check minimizeToTray on window-all-closed:', err.message);
    }
    app.quit();
  }
});

// ── Shortcuts modal close handler ──
// When the renderer closes the shortcuts modal (Escape, close button,
// click outside), it sends 'shortcuts-modal-closed' so the main process
// can restore the musicView.
ipcMain.on('shortcuts-modal-closed', () => {
  shortcutsModalVisible = false;
  restoreMusicView();
});

app.on('before-quit', () => {
  setIsQuitting(true);
  shortcutsModalVisible = false;
  unregisterShortcuts();
  closeSplashScreen();
  closeMiniPlayer();

  saveWindowState(store);

  if (isDiscordAvailable()) {
    cleanupDiscordRPC().catch(() => {});
  }
});

process.on('uncaughtException', (err) => {
  log.error('Uncaught exception:', err);
  try {
    const { dialog } = require('electron');
    dialog.showErrorBox(
      'Unexpected Error',
      'Youtube Music Desktop encountered an unexpected error and needs to close.\n\n' +
      'Error: ' + (err.message || String(err)).substring(0, 200)
    );
  } catch {}
  setTimeout(() => process.exit(1), 1000);
});

process.on('unhandledRejection', (reason) => {
  log.error('Unhandled rejection:', reason);
  try {
    const { dialog } = require('electron');
    dialog.showErrorBox(
      'Unexpected Error',
      'Youtube Music Desktop encountered an unexpected error and needs to close.\n\n' +
      'Error: ' + (String(reason)).substring(0, 200)
    );
  } catch {}
  setTimeout(() => process.exit(1), 1000);
});
