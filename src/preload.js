/**
 * preload.js - Secure bridge between renderer and main process
 *
 * Includes all IPC channels for: window controls, settings, themes,
 * media commands, navigation, Discord, mini player, lyrics, visualizer,
 * and shortcuts.
 */

const { contextBridge, ipcRenderer } = require('electron');

// Store WRAPPER references for targeted removal (SEC-HIGH-1 FIX)
let _themeListener = null;
let _trackChangedListener = null;
let _loadingStateListener = null;
let _navigationStateListener = null;
let _miniPlayerTrackListener = null;
let _lyricsLoadedListener = null;
let _lyricsUpdateListener = null;
let _visualizerDataListener = null;
let _lyricsToggledListener = null;
let _visualizerToggledListener = null;
let _toggleShortcutsModalListener = null;
let _ytmThemeColorsListener = null;

contextBridge.exposeInMainWorld('electronAPI', {
  // ---- Window controls ----
  minimizeWindow: () => ipcRenderer.invoke('window-minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window-maximize'),
  closeWindow: () => ipcRenderer.invoke('window-close'),

  // ---- Settings ----
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),

  // ---- Theme ----
  getTheme: () => ipcRenderer.invoke('get-theme'),
  setTheme: (theme) => ipcRenderer.invoke('set-theme', theme),

  // ---- Notifications ----
  showNotification: (data) => ipcRenderer.invoke('show-notification', data),

  // ---- Tray ----
  updateTrayTooltip: (text) => ipcRenderer.invoke('update-tray-tooltip', text),

  // ---- Media commands ----
  mediaCommand: (command) => ipcRenderer.invoke('media-command', command),

  // ---- Navigation ----
  goBack: () => ipcRenderer.invoke('go-back'),
  goForward: () => ipcRenderer.invoke('go-forward'),
  getNavigationState: () => ipcRenderer.invoke('get-navigation-state'),

  // ---- Discord availability ----
  isDiscordAvailable: () => ipcRenderer.invoke('is-discord-available'),

  // ---- Mini Player ----
  closeMiniPlayer: () => ipcRenderer.invoke('close-mini-player'),

  // ---- Shortcuts ----
  getShortcuts: () => ipcRenderer.invoke('get-shortcuts'),
  updateShortcut: (action, accelerator) => ipcRenderer.invoke('update-shortcut', action, accelerator),

  // ---- YTM Themes ----
  getYtmThemes: () => ipcRenderer.invoke('get-ytm-themes'),
  setYtmTheme: (themeId) => ipcRenderer.invoke('set-ytm-theme', themeId),

  // ---- Lyrics ----
  getLyrics: () => ipcRenderer.invoke('get-lyrics'),

  // ---- Event listeners (main → renderer) ----

  onThemeChanged: (callback) => {
    _themeListener = (_event, theme) => callback(theme);
    ipcRenderer.on('theme-changed', _themeListener);
  },
  removeThemeChangedListener: () => {
    if (_themeListener) { ipcRenderer.removeListener('theme-changed', _themeListener); _themeListener = null; }
  },

  onTrackChanged: (callback) => {
    _trackChangedListener = (_event, track) => callback(track);
    ipcRenderer.on('track-changed', _trackChangedListener);
  },
  removeTrackChangedListener: () => {
    if (_trackChangedListener) { ipcRenderer.removeListener('track-changed', _trackChangedListener); _trackChangedListener = null; }
  },

  onLoadingState: (callback) => {
    _loadingStateListener = (_event, isLoading) => callback(isLoading);
    ipcRenderer.on('loading-state', _loadingStateListener);
  },
  removeLoadingStateListener: () => {
    if (_loadingStateListener) { ipcRenderer.removeListener('loading-state', _loadingStateListener); _loadingStateListener = null; }
  },

  onNavigationState: (callback) => {
    _navigationStateListener = (_event, state) => callback(state);
    ipcRenderer.on('navigation-state', _navigationStateListener);
  },
  removeNavigationStateListener: () => {
    if (_navigationStateListener) { ipcRenderer.removeListener('navigation-state', _navigationStateListener); _navigationStateListener = null; }
  },

  // Mini Player track updates
  onMiniPlayerTrackUpdate: (callback) => {
    _miniPlayerTrackListener = (_event, track) => callback(track);
    ipcRenderer.on('mini-player-track-update', _miniPlayerTrackListener);
  },

  // Lyrics events
  onLyricsLoaded: (callback) => {
    _lyricsLoadedListener = (_event, data) => callback(data);
    ipcRenderer.on('lyrics-loaded', _lyricsLoadedListener);
  },
  onLyricsUpdate: (callback) => {
    _lyricsUpdateListener = (_event, data) => callback(data);
    ipcRenderer.on('lyrics-update', _lyricsUpdateListener);
  },
  onLyricsToggled: (callback) => {
    _lyricsToggledListener = (_event, enabled) => callback(enabled);
    ipcRenderer.on('lyrics-toggled', _lyricsToggledListener);
  },

  // Visualizer events
  onVisualizerData: (callback) => {
    _visualizerDataListener = (_event, data) => callback(data);
    ipcRenderer.on('visualizer-data', _visualizerDataListener);
  },
  onVisualizerToggled: (callback) => {
    _visualizerToggledListener = (_event, enabled) => callback(enabled);
    ipcRenderer.on('visualizer-toggled', _visualizerToggledListener);
  },

  // Shortcuts modal toggle (from global shortcut)
  onToggleShortcutsModal: (callback) => {
    _toggleShortcutsModalListener = () => callback();
    ipcRenderer.on('toggle-shortcuts-modal', _toggleShortcutsModalListener);
  },
  removeToggleShortcutsModalListener: () => {
    if (_toggleShortcutsModalListener) { ipcRenderer.removeListener('toggle-shortcuts-modal', _toggleShortcutsModalListener); _toggleShortcutsModalListener = null; }
  },

  // Notify main process that shortcuts modal was closed (so it restores musicView)
  shortcutsModalClosed: () => ipcRenderer.send('shortcuts-modal-closed'),

  // YTM theme colors (for title bar / mini player to match the YTM theme)
  onYtmThemeColors: (callback) => {
    _ytmThemeColorsListener = (_event, colors) => callback(colors);
    ipcRenderer.on('ytm-theme-colors', _ytmThemeColorsListener);
  },
  removeYtmThemeColorsListener: () => {
    if (_ytmThemeColorsListener) { ipcRenderer.removeListener('ytm-theme-colors', _ytmThemeColorsListener); _ytmThemeColorsListener = null; }
  },

  // Get current YTM theme colors
  getYtmThemeColors: () => ipcRenderer.invoke('get-ytm-theme-colors'),

  // Tray menu popup window IPC
  getTrayMenuData: () => ipcRenderer.invoke('get-tray-menu-data'),
  trayMenuAction: (action) => ipcRenderer.invoke('tray-menu-action', action)
});
