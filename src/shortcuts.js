/**
 * shortcuts.js - Custom global keyboard shortcuts
 *
 * Allows users to bind their own hotkeys for media controls,
 * window management, and other actions. Shortcuts are persisted
 * via electron-store and re-registered on app start.
 */

const { globalShortcut } = require('electron');
const log = require('./logger');

// Default shortcut bindings (action → accelerator)
// FIX v22: Media keys (MediaPlayPause, MediaNextTrack, etc.) are NO LONGER
// registered as global shortcuts. They conflict with Chromium's built-in
// SMTC bridge on Windows 11. Chromium handles them natively through
// navigator.mediaSession. Only non-media-key shortcuts are registered.
// Media keys are kept here for display purposes in the shortcuts overlay.
const DEFAULT_SHORTCUTS = {
  'play-pause':    'MediaPlayPause',
  'next':          'MediaNextTrack',
  'previous':      'MediaPreviousTrack',
  'stop':          'MediaStop',
  'volume-up':     'VolumeUp',
  'volume-down':   'VolumeDown',
  'mute':          'VolumeMute',
  'mini-player':   'Ctrl+Shift+M',
  'minimize':      'Ctrl+M',
  'show-shortcuts':'Ctrl+/'
};

// Keys that should NOT be registered as global shortcuts because they
// conflict with Chromium's native SMTC/media key handling on Windows.
const MEDIA_KEY_ACCELERATORS = new Set([
  'MediaPlayPause', 'MediaNextTrack', 'MediaPreviousTrack', 'MediaStop',
  'VolumeUp', 'VolumeDown', 'VolumeMute'
]);

// Action definitions with labels
const SHORTCUT_ACTIONS = {
  'play-pause':     { label: 'Play / Pause',     requiresMedia: true },
  'next':           { label: 'Next Track',        requiresMedia: true },
  'previous':       { label: 'Previous Track',    requiresMedia: true },
  'stop':           { label: 'Stop',              requiresMedia: true },
  'volume-up':      { label: 'Volume Up',         requiresMedia: true },
  'volume-down':    { label: 'Volume Down',       requiresMedia: true },
  'mute':           { label: 'Mute / Unmute',     requiresMedia: true },
  'mini-player':    { label: 'Toggle Mini Player', requiresMedia: false },
  'show-shortcuts': { label: 'Show Shortcuts (Ctrl+/)', requiresMedia: false },
  'minimize':       { label: 'Minimize Window',   requiresMedia: false }
};

// Registered shortcut IDs for cleanup
let registeredIds = [];

// Callbacks for actions
let mediaCommandCallback = null;
let miniPlayerCallback = null;
let minimizeCallback = null;
let showShortcutsCallback = null;

/**
 * Get default shortcuts.
 */
function getDefaultShortcuts() {
  return { ...DEFAULT_SHORTCUTS };
}

/**
 * Get shortcut action definitions.
 */
function getShortcutActions() {
  return { ...SHORTCUT_ACTIONS };
}

/**
 * Load shortcuts from store, merging with defaults for any missing keys.
 */
function loadShortcuts(store) {
  try {
    const saved = store.get('shortcuts');
    if (saved && typeof saved === 'object') {
      return { ...DEFAULT_SHORTCUTS, ...saved };
    }
  } catch {
    // Store read failed
  }
  return { ...DEFAULT_SHORTCUTS };
}

/**
 * Save shortcuts to store.
 */
function saveShortcuts(store, shortcuts) {
  try {
    store.set('shortcuts', shortcuts);
    log.info('Custom shortcuts saved');
    return true;
  } catch (err) {
    log.error('Failed to save shortcuts:', err.message);
    return false;
  }
}

/**
 * Register all global shortcuts.
 */
function registerCustomShortcuts(store, callbacks) {
  mediaCommandCallback = callbacks.mediaCommand || null;
  miniPlayerCallback = callbacks.miniPlayer || null;
  minimizeCallback = callbacks.minimize || null;
  showShortcutsCallback = callbacks.showShortcuts || null;

  unregisterCustomShortcuts();

  const shortcuts = loadShortcuts(store);

  for (const [action, accelerator] of Object.entries(shortcuts)) {
    if (!accelerator || accelerator === '') continue;

    // FIX v22: Skip media key accelerators — they conflict with SMTC.
    // Chromium handles these natively through navigator.mediaSession.
    if (MEDIA_KEY_ACCELERATORS.has(accelerator)) {
      log.info('Skipping media key (handled by SMTC):', accelerator);
      continue;
    }

    try {
      const success = globalShortcut.register(accelerator, () => {
        handleShortcutAction(action);
      });

      if (success) {
        registeredIds.push(accelerator);
      } else {
        log.warn('Shortcut already registered:', accelerator, 'for', action);
      }
    } catch (err) {
      log.warn('Failed to register shortcut:', accelerator, 'for', action, '-', err.message);
    }
  }

  log.info('Custom shortcuts registered:', registeredIds.length);
}

/**
 * Handle a shortcut action.
 */
function handleShortcutAction(action) {
  switch (action) {
    case 'play-pause':
    case 'next':
    case 'previous':
    case 'stop':
    case 'volume-up':
    case 'volume-down':
    case 'mute':
      if (mediaCommandCallback) mediaCommandCallback(action);
      break;
    case 'mini-player':
      if (miniPlayerCallback) miniPlayerCallback();
      break;
    case 'minimize':
      if (minimizeCallback) minimizeCallback();
      break;
    case 'show-shortcuts':
      if (showShortcutsCallback) showShortcutsCallback();
      break;
    default:
      log.warn('Unknown shortcut action:', action);
  }
}

/**
 * Unregister all custom shortcuts.
 */
function unregisterCustomShortcuts() {
  for (const id of registeredIds) {
    try {
      globalShortcut.unregister(id);
    } catch {
      // May already be unregistered
    }
  }
  registeredIds = [];
}

/**
 * Update a single shortcut binding.
 */
function updateShortcut(store, action, newAccelerator) {
  const shortcuts = loadShortcuts(store);
  shortcuts[action] = newAccelerator;
  saveShortcuts(store, shortcuts);

  // Re-register all shortcuts with new binding
  registerCustomShortcuts(store, {
    mediaCommand: mediaCommandCallback,
    miniPlayer: miniPlayerCallback,
    minimize: minimizeCallback,
    showShortcuts: showShortcutsCallback
  });
}

module.exports = {
  getDefaultShortcuts,
  getShortcutActions,
  loadShortcuts,
  saveShortcuts,
  registerCustomShortcuts,
  unregisterCustomShortcuts,
  updateShortcut
};
