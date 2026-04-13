/**
 * media-session.js - Windows System Media Transport Controls integration
 *
 * FIX v21: Complete rewrite. Previous versions OVERRODE YTM's native
 * mediaSession action handlers, which broke SMTC on Windows 11.
 *
 * New approach: NON-INTRUSIVE supplementation only.
 * 1. YTM already sets navigator.mediaSession natively (metadata + handlers).
 *    We NEVER override action handlers — YTM's native ones work correctly
 *    with Chromium's SMTC bridge.
 * 2. We only supplement metadata as a FALLBACK if YTM hasn't set it yet.
 * 3. We provide positionState updates (harmless, enables seek bar in SMTC).
 * 4. We NEVER set playbackState — YTM handles this natively.
 * 5. No MutationObserver, no aggressive intervals.
 *
 * Combined with the AUMID fix in main.js (now matches electron-builder
 * appId), SMTC should work on Windows 11.
 */

const log = require('./logger');

// Script to inject into the YTM page — minimal, non-intrusive
const MEDIA_SESSION_SCRIPT = `
(function() {
  if (window.__ytmMediaSessionSetup) return;

  function setupMediaSession() {
    const video = document.querySelector('video');
    if (!video) {
      setTimeout(setupMediaSession, 2000);
      return;
    }

    window.__ytmMediaSessionSetup = true;

    /**
     * Supplement metadata ONLY if YTM hasn't set it.
     * YTM's own metadata is more reliable (includes album, proper artwork
     * sizes, etc.) so we never overwrite it.
     */
    function supplementMetadata() {
      try {
        if (!('mediaSession' in navigator)) return;
        // If YTM already set metadata, leave it alone
        if (navigator.mediaSession.metadata && navigator.mediaSession.metadata.title) return;

        const titleEl = document.querySelector('.title.ytmusic-player-bar, ytmusic-player-bar .title');
        const artistEl = document.querySelector('.byline.ytmusic-player-bar, ytmusic-player-bar .byline');
        const albumArtEl = document.querySelector('.image.ytmusic-player-bar, ytmusic-player-bar img.image, ytmusic-player-bar img');

        const title = titleEl ? titleEl.textContent.trim() : '';
        let artist = '';
        if (artistEl) {
          const bylineText = artistEl.textContent || '';
          artist = bylineText.split('\\u2022')[0].split('\\u00b7')[0].replace(/\\s+/g, ' ').trim();
        }
        const albumArt = albumArtEl ? albumArtEl.src : '';

        if (title) {
          navigator.mediaSession.metadata = new MediaMetadata({
            title: title,
            artist: artist || 'Unknown Artist',
            album: '',
            artwork: albumArt ? [{ src: albumArt, sizes: '512x512', type: 'image/jpeg' }] : []
          });
        }
      } catch (e) {
        // Silently ignore
      }
    }

    /**
     * Update positionState for the SMTC seek bar.
     * This is harmless — if YTM already sets positionState, ours will just
     * update it with the same values. If YTM doesn't set it, we provide it.
     */
    function updatePositionState() {
      try {
        if (!('mediaSession' in navigator)) return;
        const vid = document.querySelector('video');
        if (!vid || !vid.duration || !isFinite(vid.duration) || vid.duration <= 0) return;
        navigator.mediaSession.setPositionState({
          duration: vid.duration,
          playbackRate: vid.playbackRate || 1,
          position: Math.min(Math.max(vid.currentTime, 0), vid.duration)
        });
      } catch (e) {
        // Position state may fail for certain values
      }
    }

    // Wait a bit for YTM to set its own mediaSession first,
    // then supplement only if needed
    setTimeout(supplementMetadata, 5000);

    // Update position state on video events (enables seek bar in SMTC)
    video.addEventListener('timeupdate', updatePositionState);
    video.addEventListener('play', () => {
      supplementMetadata();
      updatePositionState();
    });
    video.addEventListener('pause', updatePositionState);
    video.addEventListener('seeked', updatePositionState);

    console.debug('[media-session] Non-intrusive media session supplement initialized');
  }

  setupMediaSession();
})();
`;

/**
 * Inject Media Session script into the music WebContentsView.
 */
function injectMediaSession(wc) {
  if (!wc || wc.isDestroyed()) return;

  wc.executeJavaScript(MEDIA_SESSION_SCRIPT)
    .then(() => log.info('[media-session] Non-intrusive media session supplement injected'))
    .catch(err => log.error('[media-session] Failed to inject:', err.message));
}

module.exports = {
  injectMediaSession
};
