/**
 * mini-player.js - Compact always-on-top floating player
 *
 * FIX v20: Mini player now syncs its colors with the active YTM theme
 * (Rosé Pine, Tokyo Night, Nord, Midnight Emerald) via IPC, matching the
 * title bar and YTM page colors.
 */

const { BrowserWindow, nativeImage, screen } = require('electron');
const path = require('path');
const crypto = require('crypto');
const log = require('./logger');

let miniPlayerWindow = null;
let mediaCommandCallback = null;
let storeRef = null;

// Current YTM theme colors (for syncing mini player)
let currentThemeColors = null;

// Last sent track data for diffing — avoids sending identical IPC messages
// on every track poll (every 3s) when only currentPosition changes slightly.
let lastSentTrackData = null;

/**
 * Generate the mini player HTML with nonce-based CSP.
 * FIX v20: Uses CSS custom properties so theme colors can be
 * applied dynamically via IPC.
 */
function generateMiniPlayerHTML(nonce) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; img-src 'self' data: https: http:; connect-src https:;">
  <title>Mini Player</title>
  <style nonce="${nonce}">
    :root {
      --bg-primary: #0d0d0d;
      --bg-secondary: #1a1a1a;
      --text-primary: #ffffff;
      --text-secondary: #aaaaaa;
      --text-muted: #888888;
      --border-color: #333333;
      --accent: #ff0000;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: 100%; height: 100%;
      overflow: hidden;
      background: var(--bg-primary);
      font-family: 'Segoe UI', -apple-system, sans-serif;
      color: var(--text-primary);
      user-select: none;
      -webkit-app-region: drag;
    }
    .mini-player {
      display: flex; flex-direction: column;
      height: 100%; padding: 12px;
    }
    .top-row {
      display: flex; align-items: center; gap: 12px;
      margin-bottom: 8px;
    }
    .album-art {
      width: 60px; height: 60px;
      border-radius: 8px;
      background: var(--bg-secondary);
      flex-shrink: 0;
      object-fit: cover;
    }
    .track-details {
      flex: 1; overflow: hidden;
      min-width: 0;
    }
    .track-title {
      font-size: 13px; font-weight: 600;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      color: var(--text-primary);
    }
    .track-artist {
      font-size: 11px; color: var(--text-secondary);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .close-btn {
      -webkit-app-region: no-drag;
      background: transparent; border: none;
      color: var(--text-muted); cursor: pointer;
      width: 24px; height: 24px;
      display: flex; align-items: center; justify-content: center;
      font-size: 16px; border-radius: 4px;
    }
    .close-btn:hover { background: rgba(255,255,255,0.1); color: var(--text-primary); }
    .controls {
      display: flex; align-items: center; justify-content: center;
      gap: 16px;
      -webkit-app-region: no-drag;
      margin-top: auto;
      padding-bottom: 4px;
    }
    .ctrl-btn {
      background: transparent; border: none;
      color: var(--text-primary); cursor: pointer;
      width: 36px; height: 36px;
      display: flex; align-items: center; justify-content: center;
      border-radius: 50%; transition: background 0.15s;
    }
    .ctrl-btn:hover { background: rgba(255,255,255,0.1); }
    .ctrl-btn.play-btn {
      width: 42px; height: 42px;
      background: var(--accent); border-radius: 50%;
    }
    .ctrl-btn.play-btn:hover { filter: brightness(0.85); }
    .ctrl-btn svg { width: 20px; height: 20px; fill: currentColor; }
    .ctrl-btn.play-btn svg { width: 22px; height: 22px; }
    .progress-bar {
      height: 3px; background: var(--border-color); border-radius: 2px;
      margin-top: 8px; overflow: hidden; cursor: pointer;
      -webkit-app-region: no-drag;
    }
    .progress-fill {
      height: 100%; background: var(--accent); border-radius: 2px;
      transition: width 0.3s linear;
      width: 0%;
    }
  </style>
</head>
<body>
  <div class="mini-player">
    <div class="top-row">
      <img class="album-art" id="album-art" src="" alt="">
      <div class="track-details">
        <div class="track-title" id="track-title">Not Playing</div>
        <div class="track-artist" id="track-artist"></div>
      </div>
      <button class="close-btn" id="close-btn" title="Close Mini Player">&#x2715;</button>
    </div>
    <div class="progress-bar" id="progress-bar">
      <div class="progress-fill" id="progress-fill"></div>
    </div>
    <div class="controls">
      <button class="ctrl-btn" id="prev-btn" title="Previous">
        <svg viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
      </button>
      <button class="ctrl-btn play-btn" id="play-btn" title="Play/Pause">
        <svg viewBox="0 0 24 24" id="play-icon"><path d="M8 5v14l11-7z"/></svg>
      </button>
      <button class="ctrl-btn" id="next-btn" title="Next">
        <svg viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
      </button>
    </div>
  </div>
  <script nonce="${nonce}">
    const api = window.electronAPI;
    const playIcon = '<path d="M8 5v14l11-7z"/>';
    const pauseIcon = '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>';

    document.getElementById('prev-btn').addEventListener('click', () => api.mediaCommand('previous'));
    document.getElementById('next-btn').addEventListener('click', () => api.mediaCommand('next'));
    document.getElementById('play-btn').addEventListener('click', () => api.mediaCommand('play-pause'));
    document.getElementById('close-btn').addEventListener('click', () => api.closeMiniPlayer());

    // ── YTM Theme color sync ──
    function applyYtmThemeColors(colors) {
      const root = document.documentElement;
      if (!colors) {
        root.style.removeProperty('--bg-primary');
        root.style.removeProperty('--bg-secondary');
        root.style.removeProperty('--text-primary');
        root.style.removeProperty('--text-secondary');
        root.style.removeProperty('--text-muted');
        root.style.removeProperty('--border-color');
        root.style.removeProperty('--accent');
        return;
      }
      root.style.setProperty('--bg-primary', colors.bgNav);
      root.style.setProperty('--bg-secondary', colors.bgInput);
      root.style.setProperty('--text-primary', colors.text);
      root.style.setProperty('--text-secondary', colors.textMuted);
      root.style.setProperty('--text-muted', colors.textMuted);
      root.style.setProperty('--border-color', colors.bgInput);
      root.style.setProperty('--accent', colors.accent);
    }
    api.onYtmThemeColors((colors) => applyYtmThemeColors(colors));
    api.getYtmThemeColors().then((colors) => {
      if (colors) applyYtmThemeColors(colors);
    }).catch(() => {});

    api.onMiniPlayerTrackUpdate((track) => {
      if (track) {
        document.getElementById('track-title').textContent = track.title || 'Unknown';
        document.getElementById('track-artist').textContent = track.artist || '';
        document.getElementById('play-icon').innerHTML = track.isPaused ? playIcon : pauseIcon;
        if (track.albumArt) {
          document.getElementById('album-art').src = track.albumArt;
        } else {
          document.getElementById('album-art').src = '';
        }
        if (track.duration > 0 && track.currentPosition >= 0) {
          const pct = (track.currentPosition / track.duration) * 100;
          document.getElementById('progress-fill').style.width = pct + '%';
        }
      }
    });
  </script>
</body>
</html>`;
}

/**
 * Create and show the mini player window.
 */
function createMiniPlayer(store, mediaCallback) {
  if (miniPlayerWindow && !miniPlayerWindow.isDestroyed()) {
    miniPlayerWindow.show();
    miniPlayerWindow.focus();
    return;
  }

  storeRef = store;
  mediaCommandCallback = mediaCallback;

  const primaryDisplay = screen.getPrimaryDisplay();
  const { workArea } = primaryDisplay;

  const windowWidth = 280;
  const windowHeight = 150;

  const x = workArea.x + workArea.width - windowWidth - 20;
  const y = workArea.y + workArea.height - windowHeight - 20;

  const nonce = crypto.randomBytes(16).toString('base64');

  miniPlayerWindow = new BrowserWindow({
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
    icon: path.join(__dirname, '../assets/icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  const html = generateMiniPlayerHTML(nonce);
  miniPlayerWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

  miniPlayerWindow.once('ready-to-show', () => {
    miniPlayerWindow.show();
    // Send current theme colors to the mini player
    if (currentThemeColors) {
      miniPlayerWindow.webContents.send('ytm-theme-colors', currentThemeColors);
    }
    log.info('Mini player shown');
  });

  // Debounce position save to avoid lag during drag.
  // The 'move' event fires dozens of times per second while dragging,
  // and each store.set() is a synchronous disk write that blocks the
  // event loop. Debouncing ensures we only write once the user stops
  // dragging (after 300ms of no move events).
  let moveDebounceTimer = null;

  miniPlayerWindow.on('closed', () => {
    if (moveDebounceTimer) clearTimeout(moveDebounceTimer);
    miniPlayerWindow = null;
    lastSentTrackData = null;
    log.info('Mini player closed');
  });

  // Save mini player position
  let miniPlayerState = store.get('miniPlayerState') || {};
  if (miniPlayerState.x && miniPlayerState.y) {
    miniPlayerWindow.setPosition(miniPlayerState.x, miniPlayerState.y);
  }

  miniPlayerWindow.on('move', () => {
    if (miniPlayerWindow && !miniPlayerWindow.isDestroyed()) {
      if (moveDebounceTimer) clearTimeout(moveDebounceTimer);
      moveDebounceTimer = setTimeout(() => {
        if (miniPlayerWindow && !miniPlayerWindow.isDestroyed()) {
          const [mx, my] = miniPlayerWindow.getPosition();
          try {
            store.set('miniPlayerState', { x: mx, y: my });
          } catch (err) {
            log.warn('[mini-player] Failed to save position:', err.message);
          }
        }
        moveDebounceTimer = null;
      }, 300);
    }
  });
}

/**
 * Update mini player with current track info.
 * Diffing: only sends an IPC message if the track data has meaningfully
 * changed (new track, play state change, or position moved > 1 second).
 * This avoids flooding the mini player with IPC messages every 3 seconds
 * when only the playback position has slightly advanced.
 */
function updateMiniPlayerTrack(track) {
  if (!miniPlayerWindow || miniPlayerWindow.isDestroyed()) return;
  if (!track || !track.title) return;

  const trackData = {
    title: track.title,
    artist: track.artist || '',
    albumArt: track.albumArt || '',
    isPaused: !!track.isPaused,
    currentPosition: track.currentPosition || 0,
    duration: track.duration || 0
  };

  // Diff against last sent data — skip IPC if nothing meaningful changed
  if (lastSentTrackData) {
    const sameTrack = lastSentTrackData.title === trackData.title &&
                      lastSentTrackData.artist === trackData.artist &&
                      lastSentTrackData.albumArt === trackData.albumArt &&
                      lastSentTrackData.isPaused === trackData.isPaused &&
                      lastSentTrackData.duration === trackData.duration;
    // Only skip if position changed by less than 1 second (normal playback)
    const positionDelta = Math.abs(trackData.currentPosition - lastSentTrackData.currentPosition);
    if (sameTrack && positionDelta < 1) {
      return; // No meaningful change, skip IPC
    }
  }

  lastSentTrackData = trackData;
  miniPlayerWindow.webContents.send('mini-player-track-update', trackData);
}

/**
 * Update mini player with YTM theme colors.
 * Called when the YTM theme changes.
 */
function updateMiniPlayerThemeColors(colors) {
  currentThemeColors = colors;
  if (!miniPlayerWindow || miniPlayerWindow.isDestroyed()) return;
  miniPlayerWindow.webContents.send('ytm-theme-colors', colors);
}

/**
 * Close the mini player.
 */
function closeMiniPlayer() {
  if (miniPlayerWindow && !miniPlayerWindow.isDestroyed()) {
    miniPlayerWindow.close();
    miniPlayerWindow = null;
  }
}

/**
 * Check if mini player is visible.
 */
function isMiniPlayerVisible() {
  return miniPlayerWindow && !miniPlayerWindow.isDestroyed() && miniPlayerWindow.isVisible();
}

/**
 * Toggle mini player visibility.
 */
function toggleMiniPlayer(store, mediaCallback) {
  if (isMiniPlayerVisible()) {
    closeMiniPlayer();
  } else {
    createMiniPlayer(store, mediaCallback);
  }
}

module.exports = {
  createMiniPlayer,
  closeMiniPlayer,
  updateMiniPlayerTrack,
  updateMiniPlayerThemeColors,
  isMiniPlayerVisible,
  toggleMiniPlayer
};
