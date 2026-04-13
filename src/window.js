/**
 * window.js - Window management with WebContentsView
 *
 * Integrates: ad blocking, track monitoring, media session,
 * custom themes, lyrics, visualizer, and mini player.
 *
 * FIX v19: Visualizer uses scaleY() for artifact-free rendering.
 * FIX v19: Noise gate raised to 20, zeroed on pause/stop.
 * FIX v19: stopVisualizerPoll sends zero data to clear bars.
 */

const { BrowserWindow, WebContentsView, nativeTheme, screen, shell, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const log = require('./logger');
const { TITLE_BAR_HEIGHT, YTM_URL, MUSIC_VIEW_MAX_LISTENERS, WINDOW_BOUNDS_MIN_VISIBLE_RATIO, MAX_TITLE_LENGTH, MAX_BODY_LENGTH, VISUALIZER_FFT_SIZE, VISUALIZER_BAR_COUNT, VISUALIZER_POLL_INTERVAL_MS } = require('./config');
const settingsCache = require('./settings-cache');
const { getAdBlockCSS, getVideoAdBlockerScript } = require('./adblocker');
const { startTrackPolling, stopTrackPolling } = require('./track-monitor');
const { updateRichPresence, setLastKnownTrack, isDiscordRpcEnabled } = require('./discord-rpc');
const { updateTrayTooltip, updateTrayTrack } = require('./tray');
const { injectMediaSession } = require('./media-session');
const { applyYtmTheme, reInjectShadowStyles } = require('./themes');
const { fetchLyrics, getCurrentLyrics, getSyncedLines, parseSyncedLyrics, getLyricsAtPosition } = require('./lyrics');
const { updateMiniPlayerTrack } = require('./mini-player');

let mainWindow = null;
let musicView = null;
let splashWindow = null;
let isQuitting = false;

// Track state
let currentTrack = null;
let lastKnownTrackForRPC = null;

// F-08 FIX: Cache last visible window position
let lastVisibleBounds = null;

/**
 * Validate saved window bounds against available displays.
 */
function validateWindowBounds(savedState) {
  const displays = screen.getAllDisplays();
  let { x, y, width, height } = savedState;

  const centerX = x + width / 2;
  const centerY = y + height / 2;

  const isOnScreen = displays.some(display => {
    const { workArea } = display;
    return centerX >= workArea.x &&
           centerX <= workArea.x + workArea.width &&
           centerY >= workArea.y &&
           centerY <= workArea.y + workArea.height;
  });

  if (!isOnScreen) {
    log.warn('Window position is off-screen, centering instead');
    const primaryDisplay = screen.getPrimaryDisplay();
    const { workArea } = primaryDisplay;
    width = Math.min(width, workArea.width);
    height = Math.min(height, workArea.height);
    x = workArea.x + Math.floor((workArea.width - width) / 2);
    y = workArea.y + Math.floor((workArea.height - height) / 2);
  }

  return { x, y, width, height };
}

function generateNonce() {
  return crypto.randomBytes(16).toString('base64');
}

function getCurrentTheme(store) {
  try {
    const settings = store.get('settings');
    if (!settings || settings.theme === 'system' || !settings.theme) {
      return nativeTheme.shouldUseDarkColors === true ? 'dark' : 'light';
    }
    return settings.theme;
  } catch (err) {
    log.warn('Failed to get theme from store:', err.message);
    return nativeTheme.shouldUseDarkColors === true ? 'dark' : 'light';
  }
}

function generateSplashHTML(nonce, colors) {
  // Apply theme colors if a YTM theme is active; otherwise fall back to dark defaults
  const bg = colors ? colors.bg : '#0d0d0d';
  const bgNav = colors ? colors.bgNav : '#1a1a1a';
  const text = colors ? colors.text : '#ffffff';
  const textMuted = colors ? colors.textMuted : '#888888';
  const accent = colors ? colors.accent : '#ff0000';
  const bgInput = colors ? colors.bgInput : '#333333';
  const border = colors ? (colors.border || colors.bgInput) : '#333333';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; img-src 'self' data:;">
      <style nonce="${nonce}">
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          width: 400px; height: 300px;
          background: linear-gradient(135deg, ${bgNav} 0%, ${bg} 100%);
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          font-family: 'Segoe UI', sans-serif;
          border-radius: 12px; border: 1px solid ${border};
        }
        .logo { width: 80px; height: 80px; margin-bottom: 20px; animation: pulse 1.5s ease-in-out infinite; }
        .title { color: ${text}; font-size: 24px; font-weight: 600; margin-bottom: 8px; }
        .subtitle { color: ${textMuted}; font-size: 14px; margin-bottom: 30px; }
        .loader { width: 200px; height: 3px; background: ${bgInput}; border-radius: 2px; overflow: hidden; }
        .loader-bar { width: 30%; height: 100%; background: ${accent}; animation: loading 1.5s ease-in-out infinite; }
        @keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.05); } }
        @keyframes loading { 0% { transform: translateX(-100%); } 100% { transform: translateX(400%); } }
      </style>
    </head>
    <body>
      <svg class="logo" viewBox="0 0 24 24">
        <path fill="${accent}" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/>
      </svg>
      <div class="title">Youtube Music Desktop</div>
      <div class="subtitle">Loading...</div>
      <div class="loader"><div class="loader-bar"></div></div>
    </body>
    </html>`;
}

function createSplashScreen(store) {
  // Resolve YTM theme colors so the splash screen matches the app theme
  let splashColors = null;
  try {
    const ytmTheme = settingsCache.getSetting('ytmTheme', 'none');
    if (ytmTheme && ytmTheme !== 'none') {
      const { getThemeColors } = require('./themes');
      splashColors = getThemeColors(ytmTheme, store);
    }
  } catch (err) {
    log.warn('[splash] Failed to resolve YTM theme colors:', err.message);
  }

  splashWindow = new BrowserWindow({
    width: 400, height: 300, frame: false, transparent: true,
    alwaysOnTop: true, resizable: false,
    icon: path.join(__dirname, '../assets/icon.ico'),
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true }
  });
  const splashNonce = generateNonce();
  splashWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(generateSplashHTML(splashNonce, splashColors))}`);
  splashWindow.show();
  log.info('Splash screen shown');
}

function closeSplashScreen() {
  if (splashWindow) { splashWindow.close(); splashWindow = null; log.info('Splash screen closed'); }
}

function updateMusicViewBounds() {
  if (!mainWindow || !musicView) return;
  // If musicView was removed (shortcuts modal), re-add it first
  if (!mainWindow.contentView.children.includes(musicView)) {
    mainWindow.contentView.addChildView(musicView);
  }
  if (mainWindow.isMaximized()) {
    const contentBounds = mainWindow.getContentBounds();
    musicView.setBounds({ x: 0, y: TITLE_BAR_HEIGHT, width: contentBounds.width, height: contentBounds.height - TITLE_BAR_HEIGHT });
  } else {
    const [width, height] = mainWindow.getSize();
    musicView.setBounds({ x: 0, y: TITLE_BAR_HEIGHT, width, height: height - TITLE_BAR_HEIGHT });
  }
}

/**
 * Remove the musicView from the main window (used for shortcuts modal).
 * This is more reliable than setBounds({0,0,0,0}) because WebContentsView
 * can still paint even with zero-size bounds on some platforms.
 */
function removeMusicView() {
  if (!mainWindow || !musicView) return;
  try {
    if (mainWindow.contentView.children.includes(musicView)) {
      mainWindow.contentView.removeChildView(musicView);
    }
  } catch (err) {
    log.warn('Failed to remove musicView:', err.message);
  }
}

/**
 * Add the musicView back to the main window and restore its bounds.
 */
function restoreMusicView() {
  if (!mainWindow || !musicView) return;
  try {
    if (!mainWindow.contentView.children.includes(musicView)) {
      mainWindow.contentView.addChildView(musicView);
    }
    updateMusicViewBounds();
  } catch (err) {
    log.warn('Failed to restore musicView:', err.message);
  }
}

/**
 * Inject visualizer script into the YTM page to capture audio data.
 * FIX v19: Higher noise gate (20) to prevent faint bars causing
 * pixel artifacts. Uses smoothingTimeConstant for cleaner output.
 * AudioContext is suspended when video is paused to reduce noise.
 */
const VISUALIZER_INJECT_SCRIPT = `
(function() {
  if (window.__ytmVisualizer) return;
  window.__ytmVisualizer = true;

  function trySetup() {
    const video = document.querySelector('video');
    if (!video) {
      setTimeout(trySetup, 1000);
      return;
    }

    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioCtx.createMediaElementSource(video);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = ${VISUALIZER_FFT_SIZE};
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);
      analyser.connect(audioCtx.destination);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      const barCount = ${VISUALIZER_BAR_COUNT};

      function updateVisualizer() {
        analyser.getByteFrequencyData(dataArray);
        const bars = [];
        const step = Math.floor(bufferLength / barCount);
        let totalEnergy = 0;
        for (let i = 0; i < barCount; i++) {
          let sum = 0;
          for (let j = 0; j < step; j++) {
            sum += dataArray[i * step + j];
          }
          const avg = sum / step;
          totalEnergy += avg;
          // Noise gate: values below 20 are treated as silence
          // This prevents faint ghost bars from appearing
          bars.push(avg < 20 ? 0 : Math.round(avg));
        }
        // If total energy is very low (silence/paused), output all zeros
        if (totalEnergy / barCount < 5) {
          for (let i = 0; i < barCount; i++) bars[i] = 0;
        }
        window.__ytmVisualizerData = bars;
      }

      // Resume AudioContext when video plays, suspend when paused
      // This prevents noise from being reported when nothing is playing
      video.addEventListener('play', () => {
        if (audioCtx.state === 'suspended') audioCtx.resume();
      });
      video.addEventListener('pause', () => {
        // Don't suspend immediately — small delay to allow for brief pauses
        setTimeout(() => {
          if (video.paused) {
            // Zero out data when paused
            window.__ytmVisualizerData = new Array(barCount).fill(0);
          }
        }, 200);
      });

      setInterval(updateVisualizer, 50);
      updateVisualizer();
    } catch (e) {
      console.warn('[visualizer] Failed to set up:', e.message);
    }
  }

  trySetup();
})();
`;

/**
 * Auto-dismiss YouTube cookie consent / GDPR popup.
 *
 * On first launch (or after clearing the app's Roaming data) YouTube shows
 * a "Before you continue to YouTube" consent dialog.  This script watches
 * for the dialog and clicks "Reject all" automatically, so the user never
 * sees it.  A MutationObserver keeps watching in case YouTube re-injects
 * the dialog after SPA navigation.
 */
const CONSENT_AUTO_DISMISS_SCRIPT = `
(function () {
  if (window.__ytmConsentDismiss) return;
  window.__ytmConsentDismiss = true;

  function dismissConsent() {
    // Strategy 1: Click "Reject all" / "Reject all" button by text content
    const allButtons = document.querySelectorAll('button, yt-button-shape');
    for (const btn of allButtons) {
      const text = (btn.textContent || '').trim().toLowerCase();
      if (text === 'reject all') {
        btn.click();
        console.debug('[consent] Clicked Reject all button');
        return true;
      }
    }

    // Strategy 2: Click the consent dialog's action button via YTM custom elements
    const rejectBtn = document.querySelector(
      'ytd-consent-bump-v2-lightbox .reject-all-button, ' +
      'yt-consent-bump-v2-lightbox .reject-all-button, ' +
      'ytd-enforcement-message-view-model .reject-all-button, ' +
      '.consent-bump-v2-lightbox .reject-all-button'
    );
    if (rejectBtn) {
      rejectBtn.click();
      console.debug('[consent] Clicked .reject-all-button');
      return true;
    }

    // Strategy 3: Look for buttons inside the consent dialog paper-dialog
    const dialog = document.querySelector(
      'tp-yt-paper-dialog ytd-consent-bump-v2-lightbox, ' +
      'tp-yt-paper-dialog ytd-enforcement-message-view-model, ' +
      'tp-yt-paper-dialog yt-consent-bump-v2-lightbox'
    );
    if (dialog) {
      const buttons = dialog.querySelectorAll('button, yt-button-shape');
      for (const btn of buttons) {
        const text = (btn.textContent || '').trim().toLowerCase();
        if (text.includes('reject') || text.includes('decline')) {
          btn.click();
          console.debug('[consent] Clicked reject/decline inside dialog');
          return true;
        }
      }
      // Fallback: if only "Accept all" is found, click that to dismiss
      for (const btn of buttons) {
        const text = (btn.textContent || '').trim().toLowerCase();
        if (text === 'accept all') {
          btn.click();
          console.debug('[consent] Clicked Accept all as fallback');
          return true;
        }
      }
    }

    return false;
  }

  // Try immediately in case the dialog is already in the DOM
  dismissConsent();

  // Poll for a short period (the dialog may load asynchronously)
  let attempts = 0;
  const pollTimer = setInterval(() => {
    if (dismissConsent() || attempts > 30) {
      clearInterval(pollTimer);
    }
    attempts++;
  }, 500);

  // Also watch for the dialog being injected at any time via MutationObserver
  new MutationObserver(() => {
    dismissConsent();
  }).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  console.debug('[consent] Auto-dismiss script active');
})();
`;

/**
 * Script to extract visualizer data from the YTM page.
 */
const GET_VISUALIZER_DATA_SCRIPT = `
(function() {
  return window.__ytmVisualizerData || null;
})();
`;

/**
 * Setup all integrations for the music WebContentsView.
 */
function setupMusicViewIntegrations(store) {
  if (!musicView) return;
  const wc = musicView.webContents;

  // Block popups
  wc.setWindowOpenHandler(({ url }) => {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.toLowerCase();
      if (hostname === 'youtube.com' || hostname === 'www.youtube.com' ||
          hostname === 'youtu.be' || hostname === 'music.youtube.com' ||
          hostname.endsWith('.youtube.com')) {
        shell.openExternal(url);
      }
    } catch (err) {
      log.warn('[popup] Failed to parse popup URL:', err.message);
    }
    return { action: 'deny' };
  });

  wc.on('did-start-loading', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('loading-state', true);
    }
  });

  wc.on('did-finish-load', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('loading-state', false);
    }
    injectAdBlocking(wc);
    injectMediaSession(wc);
    startTrackPolling(wc, (track) => handleTrackChange(track, store));
    updateNavigationState();

    // Apply custom YTM theme (using cached settings)
    try {
      const ytmTheme = settingsCache.getSetting('ytmTheme', 'none');
      if (ytmTheme && ytmTheme !== 'none') {
        applyYtmTheme(wc, ytmTheme, store);
      }
    } catch (err) {
      log.warn('[window] Failed to apply YTM theme on load:', err.message);
    }

    // Inject visualizer if enabled (using cached settings)
    try {
      const showVisualizer = settingsCache.getSetting('showVisualizer', false);
      if (showVisualizer) {
        injectVisualizer(wc);
        startVisualizerPoll();
      }
    } catch (err) {
      log.warn('[window] Failed to inject visualizer on load:', err.message);
    }
  });

  wc.on('did-navigate', () => {
    injectAdBlocking(wc);
    injectMediaSession(wc);
    updateNavigationState();
    // Re-apply theme after navigation (using cached settings)
    try {
      const ytmTheme = settingsCache.getSetting('ytmTheme', 'none');
      if (ytmTheme && ytmTheme !== 'none') {
        applyYtmTheme(wc, ytmTheme, store);
      }
    } catch (err) {
      log.warn('[window] Failed to re-apply YTM theme after navigation:', err.message);
    }
    // Re-inject visualizer if enabled (using cached settings)
    try {
      const showVisualizer = settingsCache.getSetting('showVisualizer', false);
      if (showVisualizer) {
        injectVisualizer(wc);
      }
    } catch (err) {
      log.warn('[window] Failed to re-inject visualizer after navigation:', err.message);
    }
  });

  wc.on('did-navigate-in-page', () => {
    updateNavigationState();
    // Re-inject shadow DOM styles on SPA navigation (pushState).
    // The light DOM CSS from insertCSS persists, but shadow roots
    // may be recreated, so we need to re-walk the DOM.
    reInjectShadowStyles(wc, store);
  });

  wc.on('did-fail-load', (event) => {
    log.error('Music view failed to load:', event.errorDescription);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('loading-state', false);
    }
  });
}

function injectAdBlocking(wc) {
  wc.insertCSS(getAdBlockCSS())
    .then(() => log.info('[adblocker] Custom YTM ad-block CSS injected'))
    .catch(err => log.error('[adblocker] Failed to inject ad-block CSS:', err.message));

  wc.executeJavaScript(getVideoAdBlockerScript())
    .then(() => log.info('[adblocker] Proactive ad blocker injected'))
    .catch(err => log.error('[adblocker] Failed to inject ad blocker:', err.message));

  // Auto-dismiss YouTube cookie consent / GDPR popup
  wc.executeJavaScript(CONSENT_AUTO_DISMISS_SCRIPT)
    .then(() => log.info('[consent] Cookie consent auto-dismiss injected'))
    .catch(err => log.error('[consent] Failed to inject consent auto-dismiss:', err.message));
}

function injectVisualizer(wc) {
  if (!wc || wc.isDestroyed()) return;
  wc.executeJavaScript(VISUALIZER_INJECT_SCRIPT)
    .then(() => log.info('[visualizer] Audio visualizer injected'))
    .catch(err => log.error('[visualizer] Failed to inject:', err.message));
}

// Visualizer data polling
let visualizerPollTimer = null;

function startVisualizerPoll() {
  stopVisualizerPoll();
  visualizerPollTimer = setInterval(() => {
    if (!musicView || musicView.webContents.isDestroyed()) {
      stopVisualizerPoll();
      return;
    }
    musicView.webContents.executeJavaScript(GET_VISUALIZER_DATA_SCRIPT)
      .then(data => {
        if (data && mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('visualizer-data', data);
        }
      })
      .catch(() => {});
  }, VISUALIZER_POLL_INTERVAL_MS);
}

function stopVisualizerPoll() {
  if (visualizerPollTimer) {
    clearInterval(visualizerPollTimer);
    visualizerPollTimer = null;
  }
  // Send zeroed-out data to the title bar to clear all bars
  if (mainWindow && !mainWindow.isDestroyed()) {
    const zeroData = new Array(VISUALIZER_BAR_COUNT).fill(0);
    mainWindow.webContents.send('visualizer-data', zeroData);
  }
}

// Lyrics update interval
let lyricsPollTimer = null;

function startLyricsPoll() {
  stopLyricsPoll();
  lyricsPollTimer = setInterval(() => {
    // Check if lyrics are still enabled (using cached settings)
    try {
      const showLyrics = settingsCache.getSetting('showLyrics', false);
      if (!showLyrics) {
        stopLyricsPoll();
        return;
      }
    } catch (err) {
      log.warn('[lyrics] Failed to check settings during poll:', err.message);
    }

    if (!musicView || musicView.webContents.isDestroyed()) {
      stopLyricsPoll();
      return;
    }

    const lyrics = getCurrentLyrics();
    if (!lyrics || !lyrics.synced) return;

    // Get current position from the YTM page
    musicView.webContents.executeJavaScript(`
      (function() {
        var v = document.querySelector('video');
        return v ? v.currentTime : 0;
      })();
    `).then(posSec => {
      const posMs = (posSec || 0) * 1000;
      const syncedLines = parseSyncedLyrics(lyrics.syncedLyrics);
      const result = getLyricsAtPosition(syncedLines, posMs, 3);
      if (result && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('lyrics-update', result);
      }
    }).catch(err => log.warn('[lyrics] Failed to get playback position:', err.message));
  }, 500);
}

function stopLyricsPoll() {
  if (lyricsPollTimer) {
    clearInterval(lyricsPollTimer);
    lyricsPollTimer = null;
  }
}

// Store reference for lyrics poll settings check
let storeRef = null;

/**
 * Handle track change from the track monitor.
 */
function handleTrackChange(track, store) {
  if (!track || !track.title) return;

  if (!storeRef) storeRef = store;

  const trackKey = `${track.title}|${track.artist}`;
  const isNewTrack = trackKey !== currentTrack;

  const wasPaused = lastKnownTrackForRPC?.isPaused;
  const nowPaused = track.isPaused;
  const playStateChanged = !!wasPaused !== !!nowPaused;

  if (isNewTrack) {
    currentTrack = trackKey;

    // Show notification if enabled (using cached settings)
    try {
      const showNotifications = settingsCache.getSetting('showNotifications', false);
      if (showNotifications) {
        const title = typeof track.title === 'string' ? track.title.substring(0, MAX_TITLE_LENGTH) : 'Youtube Music Desktop';
        const body = typeof track.artist === 'string' ? track.artist.substring(0, MAX_BODY_LENGTH) : 'Now playing';
        const notification = new Notification({
          title, body,
          icon: path.join(__dirname, '../assets/icon.ico'),
          silent: true
        });
        notification.show();
      }
    } catch (err) {
      log.warn('Failed to show notification:', err.message);
    }

    // Update title bar track info
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('track-changed', track);
    }

    // Fetch lyrics for the new track (async, non-blocking)
    try {
      const showLyrics = settingsCache.getSetting('showLyrics', false);
      if (showLyrics) {
        fetchLyrics(track).then(lyrics => {
          if (lyrics && mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('lyrics-loaded', {
              title: lyrics.title,
              artist: lyrics.artist,
              synced: lyrics.synced,
              plainLyrics: lyrics.plainLyrics
            });
            if (lyrics.synced) {
              startLyricsPoll();
            }
          }
        }).catch(err => log.warn('[track] Failed to fetch lyrics:', err.message));
      }
    } catch (err) {
      log.warn('[track] Failed to check lyrics settings:', err.message);
    }

    // Start visualizer if enabled (using cached settings)
    try {
      const showVisualizer = settingsCache.getSetting('showVisualizer', false);
      if (showVisualizer) {
        startVisualizerPoll();
      }
    } catch (err) {
      log.warn('[track] Failed to check visualizer settings:', err.message);
    }
  }

  // Update Discord RPC
  if ((isNewTrack || playStateChanged) && isDiscordRpcEnabled()) {
    try {
      updateRichPresence(track);
      setLastKnownTrack(track);
      lastKnownTrackForRPC = track;
    } catch (err) {
      log.warn('[track] Failed to update Discord RPC:', err.message);
    }
  }

  // Update tray with full track info and play state
  try {
    updateTrayTrack(track);
  } catch (err) {
    log.warn('[track] Failed to update tray:', err.message);
  }

  // Update mini player
  try {
    updateMiniPlayerTrack(track);
  } catch (err) {
    log.warn('[track] Failed to update mini player:', err.message);
  }
}

function updateNavigationState() {
  if (!musicView || !mainWindow || mainWindow.isDestroyed()) return;
  const wc = musicView.webContents;
  const navHistory = wc.navigationHistory;
  const canGoBack = navHistory ? navHistory.canGoBack() : false;
  const canGoForward = navHistory ? navHistory.canGoForward() : false;
  mainWindow.webContents.send('navigation-state', { canGoBack, canGoForward });
}

function saveWindowState(store) {
  try {
    if (lastVisibleBounds) {
      store.set('windowState', lastVisibleBounds);
      return;
    }
    if (!mainWindow) return;
    const [width, height] = mainWindow.getSize();
    const [x, y] = mainWindow.getPosition();
    const isMaximized = mainWindow.isMaximized();
    store.set('windowState', { width, height, x, y, isMaximized });
  } catch (err) {
    log.warn('Failed to save window state:', err.message);
  }
}

function createWindow(store) {
  try {
    // Initialize the settings cache with the store reference
    settingsCache.initSettingsCache(store);

    const savedState = store.get('windowState') || {};
    const currentTheme = getCurrentTheme(store);
    const bgColor = currentTheme === 'dark' ? '#030303' : '#ffffff';
    const bounds = validateWindowBounds(savedState);
    const iconPath = path.join(__dirname, '../assets/icon.ico');

    mainWindow = new BrowserWindow({
      width: bounds.width, height: bounds.height,
      x: bounds.x, y: bounds.y,
      frame: false, backgroundColor: bgColor,
      icon: iconPath, title: 'Youtube Music Desktop',
      webPreferences: {
        nodeIntegration: false, contextIsolation: true,
        sandbox: true, webSecurity: true,
        preload: path.join(__dirname, 'preload.js')
      },
      show: false
    });

    try { mainWindow.setIcon(iconPath); } catch (err) { log.error('Failed to set window icon:', err.message); }

    const nonce = generateNonce();
    const htmlPath = path.join(__dirname, 'index.html');

    // Read HTML asynchronously to avoid blocking the main process event loop.
    // fs.readFileSync would freeze the UI for the duration of the disk read.
    fs.promises.readFile(htmlPath, 'utf8').then(htmlContent => {
      const finalHtml = htmlContent.replace(/NONCE_PLACEHOLDER/g, nonce);
      mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(finalHtml)}`)
        .then(() => log.info('Title bar HTML loaded'))
        .catch(err => log.error('Failed to load title bar HTML:', err.message));
    }).catch(err => {
      log.error('Failed to read index.html:', err.message);
      // Fallback: load with raw nonce placeholder (will fail CSP, but better than blank)
    });

    musicView = new WebContentsView({
      webPreferences: {
        nodeIntegration: false, contextIsolation: true,
        // NOTE: sandbox is intentionally set to false on the musicView.
        // This is required because the musicView loads YouTube Music content
        // and needs to execute JavaScript for:
        //   - AudioContext injection (audio visualizer via createMediaElementSource)
        //   - Ad blocker script injection (proactive ad blocker)
        //   - Custom theme CSS injection (insertCSS + shadow DOM traversal)
        //   - Track metadata polling (querying DOM elements)
        //   - Media session integration (navigator.mediaSession)
        //   - Volume control (video element manipulation)
        // Enabling sandbox would break themes, audio visualizer, shortcuts menu,
        // and all YTM page integrations. Context isolation is still enabled.
        sandbox: false, webSecurity: true,
        partition: 'persist:music'
      }
    });

    mainWindow.contentView.addChildView(musicView);
    musicView.webContents.setMaxListeners(MUSIC_VIEW_MAX_LISTENERS);
    musicView.webContents.loadURL(YTM_URL);
    log.info('Music WebContentsView created, loading:', YTM_URL);

    mainWindow.once('ready-to-show', () => {
      closeSplashScreen();
      if (savedState.isMaximized) mainWindow.maximize();
      updateMusicViewBounds();
      mainWindow.show();
      log.info('Window shown');
      mainWindow.webContents.send('theme-changed', getCurrentTheme(store));
      // Send YTM theme colors to title bar on startup (using cached settings)
      try {
        const ytmTheme = settingsCache.getSetting('ytmTheme', 'none');
        if (ytmTheme && ytmTheme !== 'none') {
          const { getThemeColors } = require('./themes');
          const colors = getThemeColors(ytmTheme, store);
          if (colors) mainWindow.webContents.send('ytm-theme-colors', colors);
          const { updateMiniPlayerThemeColors } = require('./mini-player');
          updateMiniPlayerThemeColors(colors);
          const { updateTrayThemeColors } = require('./tray');
          updateTrayThemeColors(colors);
        }
      } catch (err) {
        log.warn('[window] Failed to apply YTM theme colors on ready:', err.message);
      }
    });

    mainWindow.on('resize', () => { updateMusicViewBounds(); });
    mainWindow.on('maximize', () => { updateMusicViewBounds(); });
    mainWindow.on('unmaximize', () => { updateMusicViewBounds(); });

    setupMusicViewIntegrations(store);

    mainWindow.on('minimize', (event) => {
      try {
        const minimizeToTray = settingsCache.getSetting('minimizeToTray', true);
        if (minimizeToTray === true) {
          event.preventDefault();
          mainWindow.hide();
          return;
        }
      } catch (err) {
        log.warn('[window] Failed to check minimizeToTray on minimize:', err.message);
      }
    });

    mainWindow.on('close', (event) => {
      if (!isQuitting) {
        try {
          const minimizeToTray = settingsCache.getSetting('minimizeToTray', true);
          if (minimizeToTray === true) {
            event.preventDefault();
            mainWindow.hide();
            return;
          }
        } catch (err) {
          log.warn('[window] Failed to check minimizeToTray on close:', err.message);
        }
      }
    });

    const cacheVisibleBounds = () => {
      if (mainWindow && mainWindow.isVisible()) {
        const [w, h] = mainWindow.getSize();
        const [px, py] = mainWindow.getPosition();
        lastVisibleBounds = { width: w, height: h, x: px, y: py, isMaximized: mainWindow.isMaximized() };
      }
    };
    mainWindow.on('resize', cacheVisibleBounds);
    mainWindow.on('move', cacheVisibleBounds);
    mainWindow.on('show', cacheVisibleBounds);

    mainWindow.on('closed', () => {
      mainWindow = null;
      musicView = null;
      stopTrackPolling();
      stopVisualizerPoll();
      stopLyricsPoll();
    });

  } catch (err) {
    log.error('Failed to create window:', err.message);
  }
}

// ============================================================
// Getters for other modules
// ============================================================

function getMainWindow() { return mainWindow; }
function getMusicView() { return musicView; }
function setIsQuitting(val) { isQuitting = val; }
function getIsQuitting() { return isQuitting; }

module.exports = {
  createWindow,
  createSplashScreen,
  closeSplashScreen,
  saveWindowState,
  getCurrentTheme,
  updateMusicViewBounds,
  removeMusicView,
  restoreMusicView,
  handleTrackChange,
  updateNavigationState,
  getMainWindow,
  getMusicView,
  setIsQuitting,
  getIsQuitting,
  injectVisualizer,
  startVisualizerPoll,
  stopVisualizerPoll,
  startLyricsPoll,
  stopLyricsPoll
};
