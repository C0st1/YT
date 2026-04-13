/**
 * adblocker.js - Ad blocking module (proactive)
 *
 * Architecture:
 *   Layer 1 — Network (Ghostery ElectronBlocker + domain blocklist)
 *     Blocks ad/tracking requests at the session level before they are
 *     even fetched. This is the most effective layer. Ghostery's
 *     COSMETIC filter injection is intentionally disabled here — those
 *     filters are calibrated for youtube.com (the video site) and break
 *     UI elements on music.youtube.com (wrong custom-element names).
 *     Domain blocklist adds YouTube-specific ad servers that generic
 *     filter lists may miss.
 *
 *   Layer 2 — CSS hiding (custom, surgical)
 *     Only targets known YTM ad custom-elements by their exact tag name
 *     and well-known YTP (YouTube Player) ad overlay class names.
 *     No [class*="ad"] wildcards, no player-bar selectors.
 *
 *   Layer 3 — JS proactive ad BLOCKER (injected JS)
 *     PREVENTS ads from playing in the first place by:
 *       • Intercepting YouTube's player config to strip ad parameters
 *       • Intercepting fetch/XHR to block ad network requests at the
 *         JavaScript level (Layer 1 only catches session-level requests;
 *         some ad URLs are dynamically constructed in-page)
 *       • Overriding HTMLMediaElement.play() to suppress ad video playback
 *       • Using MutationObserver to immediately REMOVE ad DOM elements
 *         before they can render or trigger playback
 *       • Fast-forward + mute safety net for any ads that slip through
 *
 *   Fallback — webRequest domain blocker
 *     Used when Ghostery fails to load (offline, corrupt cache, etc.).
 */

'use strict';

const { app, session } = require('electron');
const path = require('path');
const fs = require('fs');
const log = require('./logger');
const {
  AD_BLOCKER_NORMAL_INTERVAL_MS,
  AD_BLOCKER_ACTIVE_INTERVAL_MS,
  AD_BLOCKER_MUTE_DURATION_MS,
  AD_BLOCKER_DEBOUNCE_MS
} = require('./config');

let adBlocker = null;

// ─────────────────────────────────────────────────────────────
// Layer 1 helpers — network blocking
// ─────────────────────────────────────────────────────────────

/**
 * Domains whose requests should always be cancelled.
 * O(1) lookup via Set. Subdomain matching is done in isBlockedHostname().
 */
const BLOCK_DOMAINS = new Set([
  // Google / YouTube ad infrastructure
  'doubleclick.net',
  'doubleclick.com',
  'googletagservices.com',
  'googlesyndication.com',
  'googleadservices.com',
  'adservice.google.com',
  'ads.google.com',
  'pubads.g.doubleclick.net',
  'securepubads.g.doubleclick.net',
  'pagead2.googlesyndication.com',
  'tpc.googlesyndication.com',
  'imasdk.googleapis.com',  // YouTube IMA SDK — serves video ads
  's0.2mdn.net',            // Google/DoubleClick CDN
  // Additional YouTube-specific ad domains
  'youtube.com/api/stats/ads',       // YouTube ad stats reporting
  'youtube.com/pagead/',             // YouTube page-level ads
  'youtube.com/ptracking',           // YouTube playback tracking (ad-related)
  'googleads.g.doubleclick.net',     // Google Ads via DoubleClick
  'ad.doubleclick.net',              // DoubleClick ad serving
  'stats.g.doubleclick.net',         // DoubleClick stats
  'ads.youtube.com',                 // YouTube dedicated ad subdomain
  // Third-party ad networks
  'advertising.com',
  'adnxs.com',
  'adsrvr.org',
  'adform.net',
  'adroll.com',
  'criteo.com',
  'outbrain.com',
  'taboola.com',
  'amazon-adsystem.com',
  'quantserve.com',
  'krxd.net',
  'bluekai.com',
  // Analytics / tracking (phone-home requests)
  'google-analytics.com',
  'googletagmanager.com',
  'hotjar.com',
  'mixpanel.com',
  'segment.io',
  'scorecardresearch.com',
  'connect.facebook.net',
]);

/**
 * Return true if hostname (or any parent domain) is in BLOCK_DOMAINS.
 * Exported for unit testing.
 *
 * @param {string} hostname - already lowercased
 * @returns {boolean}
 */
function isBlockedHostname(hostname) {
  if (BLOCK_DOMAINS.has(hostname)) { return true; }
  const parts = hostname.split('.');
  for (let i = 1; i < parts.length - 1; i++) {
    if (BLOCK_DOMAINS.has(parts.slice(i).join('.'))) { return true; }
  }
  return false;
}

// ─────────────────────────────────────────────────────────────
// Layer 2 — CSS hiding (surgical, YTM-specific)
// ─────────────────────────────────────────────────────────────
//
// Rules to write:
//   ✓ Exact YTM custom-element tag names (ytmusic-*)
//   ✓ Exact YTP player overlay class names (.ytp-ad-*)
//   ✗ [class*="ad"]        — wildcard matches "load", "upload", "download"
//   ✗ ytmusic-player-bar  — hiding this breaks playback controls & buttons
//   ✗ height/width: 0     — collapses layout, shifts sibling UI elements
//
// We use `display: none` only. That removes the box from flow entirely
// without causing unexpected layout side-effects.

const AD_BLOCK_CSS = `
  /* ── YouTube Music ad-specific custom elements ── */

  /* Promoted / sponsored items injected into browse/playlist rows */
  ytmusic-paid-content-overlay-renderer,
  ytmusic-promoted-content-renderer,
  ytmusic-mealbar-promo-renderer,
  ytmusic-statement-banner-renderer,

  /* Ad slots in the player page */
  ytmusic-player-page-ad-slot-renderer,
  ytmusic-inline-playback-ad-renderer,
  ytmusic-visual-ad-renderer,

  /* ── YouTube Player (video) overlay ads ── */

  /* Banner / overlay ads rendered on top of the video */
  .ytp-ad-overlay-container,
  .ytp-ad-module,
  .ytp-ad-image-overlay,
  .ytp-ad-text-overlay,
  .ytp-ad-action-interstitial,
  .ytp-ad-player-overlay,
  .ytp-ad-player-overlay-instream-info,
  .ytp-ad-preview-container,
  .ytp-ad-preview-text-container,

  /* Ad progress bar and skip UI inside the video player */
  .ytp-ad-progress-list,
  .ytp-ad-skip-button-container,
  .ytp-ad-skip-button-slot,
  .ytp-ad-visit-advertiser-button,
  .ytp-ad-persistent-progress-bar-container,

  /* Generic video-ad wrapper used by YT across surfaces */
  .video-ads,

  /* ── Additional ad containers ── */

  /* YouTube ad slot renderers */
  ytd-ad-slot-renderer,
  ytd-banner-promo-renderer,
  ytd-statement-banner-renderer,
  ytd-in-feed-ad-layout-renderer,
  ytd-promoted-sparkles-web-renderer,
  ytd-display-ad-renderer,
  ytd-promoted-video-renderer,
  ytd-grid-ad-renderer,
  ytd-movie-offer-module-renderer,

  /* Companions and survey overlays */
  .ytp-ad-companion,
  .ytp-ad-survey,

  /* ── Masthead / banner ads (YTM home page) ── */
  #masthead-ad,
  #player-ads,
  #panels > ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-ads"] {
    display: none !important;
  }

  /* ── YouTube cookie consent dialog (GDPR popup) ── */
  /* Auto-dismissed by JS; hidden via CSS to prevent flash */
  ytd-consent-bump-v2-lightbox,
  yt-consent-bump-v2-lightbox,
  .consent-bump-v2-lightbox,
  ytd-enforcement-message-view-model,
  ytd-cookie-warning-renderer,
  #consent-bump-v2-lightbox,
  tp-yt-paper-dialog:has(ytd-consent-bump-v2-lightbox),
  tp-yt-paper-dialog:has(ytd-enforcement-message-view-model) {
    display: none !important;
    visibility: hidden !important;
    opacity: 0 !important;
    pointer-events: none !important;
  }

  /* ── Prevent ad-related elements from being visible even briefly ── */
  /* These use visibility+opacity instead of display so they don't
     cause layout shifts, but still prevent any visual flash */
  .ytp-ad-player-overlay,
  .ytp-ad-overlay-container {
    visibility: hidden !important;
    opacity: 0 !important;
    pointer-events: none !important;
  }

  /* ── Hide useless scrollbars in YTM popup menus and panels ── */
  ytmusic-menu-popup-renderer,
  ytmusic-multi-page-menu-renderer,
  ytmusic-item-section-renderer,
  ytmusic-setting-category-renderer,
  ytmusic-carousel-shelf-renderer,
  tp-yt-paper-dialog,
  tp-yt-paper-listbox,
  ytmusic-search-box,
  ytmusic-queue-sheet-renderer,
  ytmusic-guide-section-renderer,
  ytmusic-guide-renderer {
    scrollbar-width: none !important;
    -ms-overflow-style: none !important;
  }

  ytmusic-menu-popup-renderer::-webkit-scrollbar,
  ytmusic-multi-page-menu-renderer::-webkit-scrollbar,
  ytmusic-item-section-renderer::-webkit-scrollbar,
  ytmusic-setting-category-renderer::-webkit-scrollbar,
  ytmusic-carousel-shelf-renderer::-webkit-scrollbar,
  tp-yt-paper-dialog::-webkit-scrollbar,
  tp-yt-paper-listbox::-webkit-scrollbar,
  ytmusic-search-box::-webkit-scrollbar,
  ytmusic-queue-sheet-renderer::-webkit-scrollbar,
  ytmusic-guide-section-renderer::-webkit-scrollbar,
  ytmusic-guide-renderer::-webkit-scrollbar {
    display: none !important;
    width: 0 !important;
    height: 0 !important;
  }

  /* Also target general YTM scrollable containers */
  ytmusic-popup-container,
  #popup-container,
  .ytmusic-popup-container,
  iron-dropdown-content {
    scrollbar-width: none !important;
    -ms-overflow-style: none !important;
  }

  ytmusic-popup-container::-webkit-scrollbar,
  #popup-container::-webkit-scrollbar,
  .ytmusic-popup-container::-webkit-scrollbar,
  iron-dropdown-content::-webkit-scrollbar {
    display: none !important;
    width: 0 !important;
    height: 0 !important;
  }
`;

// ─────────────────────────────────────────────────────────────
// Layer 3 — Proactive ad BLOCKER (injected JS)
// ─────────────────────────────────────────────────────────────
//
// Strategy: PREVENT ads from playing, not skip them after.
//
//   • Intercept YouTube's player config to strip ad parameters before
//     the player can even request ad content.
//   • Intercept fetch() and XMLHttpRequest to block dynamically
//     constructed ad URLs at the JavaScript level (Layer 1 only
//     catches session-level requests; some URLs are built in-page).
//   • Override HTMLMediaElement.play() to suppress playback when an
//     ad is active — the video element simply doesn't start playing.
//   • MutationObserver immediately REMOVES ad DOM elements the instant
//     they appear, before they can render or trigger ad playback.
//   • Safety net: if an ad somehow starts, immediately fast-forward
//     to the end and mute. This is the fallback, not the primary.

const VIDEO_AD_BLOCKER_SCRIPT = `
(function () {
  if (window.__ytmAdBlocker) return;
  window.__ytmAdBlocker = true;

  // ═══════════════════════════════════════════════════════════
  // Ad URL detection — used by fetch/XHR interceptors
  // ═══════════════════════════════════════════════════════════

  const AD_URL_PATTERNS = [
    '/pagead/', '/adservice/', '/adserver/', '/get_midroll_',
    '/ptracking', '/get_video_info_with_ad', '/ad_break',
    '/api/stats/ads', 'doubleclick', '/googleads',
    '/googlesyndication', 'google_ad', 'ad_type=', 'ad_format=',
    'ad_slot=', 'googleads.g.doubleclick.net',
    '/generate_204', 'ad_device=', 'ad_flags=',
    'youtube.com/api/stats/ads', 'youtube.com/pagead/',
    '/youtube.com/ptracking', '/ad_companion', 'ad3_module',
  ];

  function isAdUrl(url) {
    if (!url || typeof url !== 'string') return false;
    const lower = url.toLowerCase();
    return AD_URL_PATTERNS.some(p => lower.includes(p));
  }

  // ═══════════════════════════════════════════════════════════
  // 1. Intercept YouTube player config — strip ad parameters
  // ═══════════════════════════════════════════════════════════

  function stripAdsFromPlayerConfig() {
    try {
      // ytplayer.config — legacy player config object
      if (window.ytplayer && window.ytplayer.config && window.ytplayer.config.args) {
        const args = window.ytplayer.config.args;
        delete args.ad3_module;
        delete args.ads_module;
        delete args.ad_device;
        delete args.ad_flags;
        delete args.ad_preroll;
        delete args.ad_slots;
        delete args.pyv_ad_channel;
        delete args.raw_player_response;
        args.ad_enabled = '0';
      }
    } catch (e) { /* non-critical */ }

    try {
      // ytInitialPlayerResponse — modern player response
      if (window.ytInitialPlayerResponse) {
        if (window.ytInitialPlayerResponse.adPlacements) {
          window.ytInitialPlayerResponse.adPlacements = [];
        }
        if (window.ytInitialPlayerResponse.playerAds) {
          window.ytInitialPlayerResponse.playerAds = [];
        }
        if (window.ytInitialPlayerResponse.playabilityStatus) {
          window.ytInitialPlayerResponse.playabilityStatus.status = 'OK';
          delete window.ytInitialPlayerResponse.playabilityStatus.messages;
        }
      }
    } catch (e) { /* non-critical */ }

    try {
      // ytInitialData — page-level data that can contain ad slots
      if (window.ytInitialData) {
        // Remove ad slots from the initial data
        const findAndRemoveAds = (obj) => {
          if (!obj || typeof obj !== 'object') return;
          if (obj.adSlotRenderer) delete obj.adSlotRenderer;
          if (obj.adPlacements) obj.adPlacements = [];
          if (obj.playerAds) obj.playerAds = [];
          for (const key of Object.keys(obj)) {
            if (typeof obj[key] === 'object' && obj[key] !== null) {
              findAndRemoveAds(obj[key]);
            }
          }
        };
        findAndRemoveAds(window.ytInitialData);
      }
    } catch (e) { /* non-critical */ }
  }

  // ═══════════════════════════════════════════════════════════
  // 2. Intercept fetch() — block ad requests at the JS level
  // ═══════════════════════════════════════════════════════════

  const origFetch = window.fetch;
  window.fetch = function (...args) {
    const url = typeof args[0] === 'string'
      ? args[0]
      : (args[0] && args[0].url) ? args[0].url : '';

    if (isAdUrl(url)) {
      console.debug('[ytm-adblocker] fetch blocked:', url);
      return Promise.resolve(new Response('', {
        status: 200,
        statusText: 'OK',
        headers: { 'Content-Type': 'text/plain' }
      }));
    }
    return origFetch.apply(this, args);
  };

  // ═══════════════════════════════════════════════════════════
  // 3. Intercept XMLHttpRequest — block ad requests at the JS level
  // ═══════════════════════════════════════════════════════════

  const origXhrOpen = XMLHttpRequest.prototype.open;
  const origXhrSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    if (typeof url === 'string' && isAdUrl(url)) {
      this.__ytmBlocked = true;
      console.debug('[ytm-adblocker] XHR blocked:', url);
    }
    return origXhrOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function (...args) {
    if (this.__ytmBlocked) {
      // Simulate a successful empty response
      Object.defineProperty(this, 'readyState', { value: 4, writable: true });
      Object.defineProperty(this, 'status', { value: 200, writable: true });
      Object.defineProperty(this, 'responseText', { value: '', writable: true });
      this.dispatchEvent(new Event('load'));
      this.dispatchEvent(new Event('loadend'));
      return;
    }
    return origXhrSend.apply(this, args);
  };

  // ═══════════════════════════════════════════════════════════
  // 4. Override HTMLMediaElement.play() — block ad video playback
  // ═══════════════════════════════════════════════════════════

  let _isAdPlaying = false;

  function checkAdActive() {
    _isAdPlaying = !!(
      document.querySelector('.ad-showing') ||
      document.querySelector('.ytp-ad-active') ||
      document.querySelector('.video-ads ytp-ad-player-overlay') ||
      document.querySelector('ytmusic-inline-playback-ad-renderer') ||
      document.querySelector('ytmusic-visual-ad-renderer')
    );
    return _isAdPlaying;
  }

  const origPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    checkAdActive();
    if (_isAdPlaying) {
      console.debug('[ytm-adblocker] blocked ad video play()');
      // Return a resolved promise (same as native play())
      return Promise.resolve();
    }
    return origPlay.apply(this, arguments);
  };

  // ═══════════════════════════════════════════════════════════
  // 5. Immediate ad element removal — MutationObserver
  // ═══════════════════════════════════════════════════════════

  const AD_ELEMENT_SELECTORS = [
    // YTM ad custom elements
    'ytmusic-paid-content-overlay-renderer',
    'ytmusic-promoted-content-renderer',
    'ytmusic-mealbar-promo-renderer',
    'ytmusic-statement-banner-renderer',
    'ytmusic-player-page-ad-slot-renderer',
    'ytmusic-inline-playback-ad-renderer',
    'ytmusic-visual-ad-renderer',
    // YTP video overlay ads
    '.ytp-ad-overlay-container',
    '.ytp-ad-module',
    '.ytp-ad-image-overlay',
    '.ytp-ad-text-overlay',
    '.ytp-ad-action-interstitial',
    '.ytp-ad-player-overlay',
    '.ytp-ad-player-overlay-instream-info',
    '.ytp-ad-preview-container',
    '.ytp-ad-preview-text-container',
    '.ytp-ad-progress-list',
    '.ytp-ad-persistent-progress-bar-container',
    '.ytp-ad-companion',
    '.ytp-ad-survey',
    // Generic video-ad wrapper
    '.video-ads',
    // Masthead / banner ads
    '#masthead-ad',
    'ytd-banner-promo-renderer',
    'ytd-ad-slot-renderer',
    'ytd-statement-banner-renderer',
    'ytd-in-feed-ad-layout-renderer',
    'ytd-promoted-sparkles-web-renderer',
    'ytd-display-ad-renderer',
    'ytd-promoted-video-renderer',
    'ytd-grid-ad-renderer',
    'ytd-movie-offer-module-renderer',
  ];

  function removeAdElements() {
    let removed = false;
    AD_ELEMENT_SELECTORS.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => {
        el.remove();
        removed = true;
      });
    });
    if (removed) {
      console.debug('[ytm-adblocker] removed ad elements from DOM');
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 6. Safety net — fast-forward + mute for ads that slip through
  // ═══════════════════════════════════════════════════════════

  const SKIP_SELECTOR = [
    '.ytp-skip-ad-button',
    '.ytp-ad-skip-button',
    '.ytp-ad-skip-button-modern',
  ].join(', ');

  const CLOSE_SELECTOR = '.ytp-ad-overlay-close-button, .ytp-ad-info-close-button';

  function neutralizeAds() {
    if (!checkAdActive()) return;

    const video = document.querySelector('video');
    if (video) {
      // Immediately seek to the end of the "video" (which is actually
      // the ad content when .ad-showing is present)
      const dur = video.duration;
      if (isFinite(dur) && dur > 0 && video.currentTime < dur - 0.1) {
        video.currentTime = dur;
        console.debug('[ytm-adblocker] ad video seeked to end');
      }
      // Mute immediately to prevent any audio leakage
      if (!video.muted) {
        video.muted = true;
        setTimeout(() => {
          if (video && !checkAdActive()) video.muted = false;
        }, ${AD_BLOCKER_MUTE_DURATION_MS});
      }
      // Pause the ad video
      video.pause();
    }

    // Click skip buttons (two clicks: focus then activate)
    const skipBtn = document.querySelector(SKIP_SELECTOR);
    if (skipBtn && skipBtn.offsetParent !== null) {
      skipBtn.click();
      skipBtn.click();
      console.debug('[ytm-adblocker] skip button clicked');
    }

    // Dismiss overlay close buttons
    document.querySelectorAll(CLOSE_SELECTOR).forEach(btn => {
      if (btn.offsetParent !== null) btn.click();
    });
  }

  // ═══════════════════════════════════════════════════════════
  // 7. Intercept YouTube player response via JSON.parse override
  // ═══════════════════════════════════════════════════════════

  const origJsonParse = JSON.parse;
  JSON.parse = function (text, reviver) {
    const result = origJsonParse.call(this, text, reviver);

    // Strip ad data from any parsed JSON that looks like a player response
    try {
      if (result && typeof result === 'object') {
        if (result.adPlacements) result.adPlacements = [];
        if (result.playerAds) result.playerAds = [];

        // Walk the object to find nested ad data
        const stripNestedAds = (obj, depth) => {
          if (!obj || typeof obj !== 'object' || depth > 10) return;
          for (const key of Object.keys(obj)) {
            if (key === 'adSlotRenderer' || key === 'adPlacements' ||
                key === 'playerAds' || key === 'adPlacements') {
              if (Array.isArray(obj[key])) {
                obj[key] = [];
              } else if (typeof obj[key] === 'object') {
                delete obj[key];
              }
            } else if (typeof obj[key] === 'object' && obj[key] !== null) {
              stripNestedAds(obj[key], depth + 1);
            }
          }
        };
        stripNestedAds(result, 0);
      }
    } catch (e) { /* non-critical — still return the parsed result */ }

    return result;
  };

  // ═══════════════════════════════════════════════════════════
  // 8. Periodic sweep — strip player config on a timer
  // ═══════════════════════════════════════════════════════════

  let pollInterval = ${AD_BLOCKER_NORMAL_INTERVAL_MS};
  let pollTimer = null;
  let adDetected = false;

  function sweep() {
    // Strip any ad configuration that YouTube re-injects
    stripAdsFromPlayerConfig();

    // Check for and remove ad elements
    removeAdElements();

    // Check if ad is currently playing and neutralize it
    const adActive = checkAdActive();
    if (adActive) {
      neutralizeAds();
      if (!adDetected) {
        adDetected = true;
        pollInterval = ${AD_BLOCKER_ACTIVE_INTERVAL_MS};
        restartPoll();
      }
    } else if (!adActive && adDetected) {
      adDetected = false;
      pollInterval = ${AD_BLOCKER_NORMAL_INTERVAL_MS};
      restartPoll();
    }
  }

  function restartPoll() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(sweep, pollInterval);
  }

  // ═══════════════════════════════════════════════════════════
  // 9. MutationObserver — immediate response to DOM changes
  // ═══════════════════════════════════════════════════════════

  let debounceTimer = null;
  new MutationObserver(() => {
    if (debounceTimer) return;
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      removeAdElements();
      neutralizeAds();
    }, ${AD_BLOCKER_DEBOUNCE_MS});
  }).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class'],
  });

  // ═══════════════════════════════════════════════════════════
  // Initialize
  // ═══════════════════════════════════════════════════════════

  // Strip ad config immediately on script injection
  stripAdsFromPlayerConfig();

  // Run initial sweep
  sweep();

  // Start periodic polling
  restartPoll();

  console.debug('[ytm-adblocker] proactive ad blocker active — ads are blocked, not skipped');
})();
`;

// ─────────────────────────────────────────────────────────────
// Layer 1 setup — Ghostery ElectronBlocker
// ─────────────────────────────────────────────────────────────

/**
 * Initialise Ghostery network-level blocking.
 *
 * @returns {Promise<boolean>} true on success, false if fell back
 */
async function setupGhosteryAdBlocker () {
  try {
    const { ElectronBlocker } = require('@ghostery/adblocker-electron');
    const ses = session.defaultSession;

    log.info('[adblocker] Loading Ghostery blocklists (EasyList + EasyPrivacy)...');

    adBlocker = await ElectronBlocker.fromPrebuiltAdsAndTracking(
      globalThis.fetch,
      {
        path: path.join(app.getPath('userData'), 'adblocker-cache'),
        read: fs.promises.readFile,
        write: fs.promises.writeFile,
      }
    );

    // Diagnostics: report serialised engine size instead of a filter count
    // (ElectronBlocker has no public getFilters() method).
    let filterInfo = 'loaded';
    try {
      const buf = adBlocker.serialize();
      filterInfo = `${(buf.byteLength / 1024).toFixed(0)} KB engine`;
    } catch (_) { /* serialize() may not exist in all builds */ }
    log.info('[adblocker] Ghostery blocker ready —', filterInfo);

    // Enable network-level request interception.
    adBlocker.enableBlockingInSession(ses);
    log.info('[adblocker] Network request blocking active (Ghostery)');

    // ── Cosmetic injection intentionally skipped ──
    // Ghostery's CSS cosmetic filters target youtube.com selectors.
    // On music.youtube.com they hide navigation buttons and player controls.
    // We use our own AD_BLOCK_CSS (injected by window.js) instead.
    log.info('[adblocker] Ghostery cosmetic injection skipped — using custom YTM CSS');

    return true;
  } catch (err) {
    log.warn('[adblocker] Ghostery failed — activating fallback:', err.message);
    return setupFallbackAdBlocker();
  }
}

// ─────────────────────────────────────────────────────────────
// Fallback — webRequest domain blocker
// ─────────────────────────────────────────────────────────────

/**
 * Used when Ghostery cannot be loaded (offline, corrupt cache, etc.).
 * Enhanced with more URL patterns to catch YouTube-specific ad requests.
 *
 * @returns {false}
 */
function setupFallbackAdBlocker () {
  const ses = session.defaultSession;

  const AD_URL_PATTERNS = [
    '/pagead/', '/adservice/', '/adserver/',
    'doubleclick', '/googleads', '/googlesyndication',
    'google_ad', 'ad_type=', 'ad_format=', 'ad_slot=',
    // Additional YouTube-specific ad patterns
    '/get_midroll_', '/ptracking', '/get_video_info_with_ad',
    '/ad_break', '/api/stats/ads', '/generate_204',
    'ad_device=', 'ad_flags=', 'ad3_module',
    'googleads.g.doubleclick.net', '/ad_companion',
  ];

  ses.webRequest.onBeforeRequest(
    { urls: ['*://*/*'] },
    (details, callback) => {
      if (details.resourceType === 'mainFrame') { return callback({}); }

      let hostname;
      try { hostname = new URL(details.url).hostname.toLowerCase(); }
      catch { return callback({}); }

      if (isBlockedHostname(hostname)) {
        log.debug('[adblocker][fallback] domain blocked:', hostname);
        return callback({ cancel: true });
      }

      const u = details.url.toLowerCase();
      for (const pat of AD_URL_PATTERNS) {
        if (u.includes(pat)) {
          log.debug('[adblocker][fallback] url-pattern blocked:', details.url);
          return callback({ cancel: true });
        }
      }

      callback({});
    }
  );

  log.warn('[adblocker] Fallback domain blocker active (Ghostery unavailable)');
  return false;
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

module.exports = {
  setupGhosteryAdBlocker,
  setupFallbackAdBlocker,
  getAdBlockCSS:            () => AD_BLOCK_CSS,
  getVideoAdBlockerScript:  () => VIDEO_AD_BLOCKER_SCRIPT,
  // Backward-compatible alias
  getVideoAdSkipperScript:  () => VIDEO_AD_BLOCKER_SCRIPT,
  // Kept for backwards-compat / unit tests
  isBlockedHostname,
  BLOCK_DOMAINS,
};
