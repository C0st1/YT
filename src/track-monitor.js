/**
 * track-monitor.js - Track information polling from YouTube Music
 *
 * Migrated from the renderer (index.html) to the main process as part
 * of the WebContentsView migration (SEC-HIGH-3 fix).
 *
 * Polls the YouTube Music page for track title, artist, album art,
 * current position, duration, and play/pause state.
 *
 * PERF-LOW-1 note: Polling is retained at 3s interval as it is
 * sufficient and has minimal overhead.
 */

const log = require('./logger');
const { TRACK_POLL_INTERVAL_MS, YTM_URL } = require('./config');

let trackPollTimer = null;

/**
 * JavaScript to execute in the YouTube Music page to extract track info.
 */
const GET_TRACK_SCRIPT = `
(function() {
  try {
    const titleEl = document.querySelector('.title.ytmusic-player-bar, ytmusic-player-bar .title, ytmusic-player-bar [class*="title"]');
    const artistEl = document.querySelector('.byline.ytmusic-player-bar, ytmusic-player-bar .byline, ytmusic-player-bar [class*="byline"]');
    const albumArtEl = document.querySelector('.image.ytmusic-player-bar, ytmusic-player-bar img.image, ytmusic-player-bar img');

    const title = titleEl ? titleEl.textContent.trim() : '';
    let artist = '';
    if (artistEl) {
      const bylineText = artistEl.textContent || '';
      artist = bylineText
                 .replace(/sponsored/gi, '')
                 .replace(/sponsorizat/gi, '')
                 .replace(/publicitate/gi, '')
                 .split('\\u2022')[0].split('\\u00b7')[0]
                 .replace(/\\s+/g, ' ')
                 .trim();
    }
    const albumArt = albumArtEl ? albumArtEl.src : '';

    const timeInfo = document.querySelector('.time-info.ytmusic-player-bar');
    let currentPosition = 0;
    let duration = 0;

    if (timeInfo) {
      const text = timeInfo.textContent.trim();
      const parts = text.split('/').map(p => p.trim());
      const parseTime = (str) => {
        const p = str.split(':').reverse();
        return p.reduce((acc, curr, i) => acc + curr * Math.pow(60, i), 0);
      };
      if (parts.length === 2) {
        currentPosition = parseTime(parts[0]);
        duration = parseTime(parts[1]);
      }
    }

    const video = document.querySelector('video');
    const isPaused = video ? video.paused : true;

    return { title, artist, albumArt, currentPosition, duration, isPaused };
  } catch (e) {
    return null;
  }
})();
`;

/**
 * Start polling track info from the YouTube Music WebContentsView.
 *
 * @param {Electron.WebContents} musicWC - webContents of the YTM WebContentsView
 * @param {function} onTrackUpdate - Callback: (track: object|null) => void
 */
function startTrackPolling(musicWC, onTrackUpdate) {
  stopTrackPolling();

  function poll() {
    if (!musicWC || musicWC.isDestroyed()) {
      stopTrackPolling();
      return;
    }

    // F-10 FIX: Skip polling if navigated away from YouTube Music domain.
    // This prevents wasting resources executing DOM queries against
    // non-YTM pages and avoids errors from unexpected page structures.
    try {
      const currentUrl = musicWC.getURL();
      if (currentUrl) {
        const urlObj = new URL(currentUrl);
        const isYtm = urlObj.hostname === 'music.youtube.com' ||
                      urlObj.hostname.endsWith('.youtube.com');
        if (!isYtm) {
          return; // Skip this poll cycle — will retry on next interval
        }
      }
    } catch {
      // URL parsing failed — proceed with poll anyway
    }

    musicWC.executeJavaScript(GET_TRACK_SCRIPT)
      .then(track => {
        if (track && track.title) {
          onTrackUpdate(track);
        }
      })
      .catch(() => {
        // Page not ready — silently ignore
      });
  }

  // Initial poll
  poll();
  trackPollTimer = setInterval(poll, TRACK_POLL_INTERVAL_MS);
  log.info('Track polling started (interval:', TRACK_POLL_INTERVAL_MS + 'ms)');
}

/**
 * Stop track polling.
 */
function stopTrackPolling() {
  if (trackPollTimer) {
    clearInterval(trackPollTimer);
    trackPollTimer = null;
  }
}

module.exports = {
  startTrackPolling,
  stopTrackPolling
};
