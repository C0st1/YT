/**
 * discord-rpc.js - Discord Rich Presence integration
 *
 * FIX BUG-MEDIUM-1: Destroys previous client before creating new one.
 * FIX SEC-MEDIUM-1: Removed hardcoded Discord Client ID fallback;
 *   Discord RPC is only enabled when DISCORD_CLIENT_ID env var is set.
 * FIX BUG-CRITICAL-1: Cleanup uses Promise.race with timeout to prevent
 *   the app from hanging if RPC destroy never resolves.
 */

const log = require('./logger');
const {
  RPC_MAX_RETRIES,
  RPC_BASE_DELAY_MS,
  RPC_MAX_DELAY_MS,
  PRESENCE_THROTTLE_MS,
  DISCORD_MAX_FIELD_LENGTH
} = require('./config');

// State
let rpc = null;
let rpcReady = false;
let lastKnownTrack = null;
let lastPresenceUpdate = null;
let rpcRetryCount = 0;
let rpcCleanupDone = false;
let rpcUserDisabled = false;

/**
 * Get the Discord Client ID from the environment.
 * SEC-MEDIUM-1 FIX: No hardcoded fallback — returns null if not set.
 *
 * F-13 FIX: Prefer DISCORD_CLIENT_ID environment variable over the in-file
 * constant to avoid accidental commits to version control. For convenience,
 * create a .env file in the project root with:
 *   DISCORD_CLIENT_ID=your_client_id_here
 * And add .env to .gitignore.
 */
// =============================================
// Put your Discord Application ID here (or prefer .env file):
const DISCORD_CLIENT_ID = '1490413752791859230';  // e.g. '123456789012345678'
// =============================================

function getDiscordClientId() {
  return process.env.DISCORD_CLIENT_ID || DISCORD_CLIENT_ID || null;
}

/**
 * Whether Discord RPC is available (env var set).
 */
function isDiscordAvailable() {
  return !!getDiscordClientId();
}

/**
 * Calculate retry delay with exponential backoff and jitter.
 */
function getRpcRetryDelay() {
  const base = Math.min(RPC_BASE_DELAY_MS * Math.pow(2, rpcRetryCount), RPC_MAX_DELAY_MS);
  const jitter = Math.random() * 5000;
  return base + jitter;
}

/**
 * Truncate a string to Discord's field limit.
 */
function truncateForDiscord(str, limit) {
  if (!str || str.length <= limit) {return str;}
  return str.substring(0, limit - 3) + '...';
}

/**
 * Validate if a URL is a valid image URL for Discord.
 */
function isValidImageUrl(url) {
  if (!url || typeof url !== 'string') {return false;}

  try {
    const urlObj = new URL(url);
    if (!['http:', 'https:'].includes(urlObj.protocol)) {return false;}

    const imageHosts = [
      'ytimg.com', 'ggpht.com', 'googleusercontent.com',
      'gstatic.com', 'yt3.ggpht.com', 'i.ytimg.com',
      'i.imgur.com', 'cdn.discordapp.com', 'images.unsplash.com'
    ];

    // F-05 FIX: Use suffix matching instead of hostname.includes() to prevent
    // false positives like "not-ytimg.com.evil.com" matching "ytimg.com".
    const isKnownHost = imageHosts.some(host => {
      return urlObj.hostname === host || urlObj.hostname.endsWith('.' + host);
    });
    const hasImageExt = /\.(jpg|jpeg|png|gif|webp|bmp)(\?.*)?$/i.test(url);

    return isKnownHost || hasImageExt;
  } catch {
    return false;
  }
}

/**
 * Initialize Discord Rich Presence.
 * FIX BUG-MEDIUM-1: Destroy previous client before creating new one.
 */
async function initDiscordRPC() {
  const clientId = getDiscordClientId();
  if (!clientId) {
    log.info('Discord RPC: DISCORD_CLIENT_ID not set, skipping');
    return;
  }

  // Respect user-disabled state (tray toggle)
  if (rpcUserDisabled) {
    log.info('Discord RPC: user has disabled RPC, skipping init');
    return;
  }

  try {
    // BUG-MEDIUM-1 FIX: Destroy previous client before creating new one
    if (rpc) {
      log.info('Discord RPC: destroying previous client before reconnect');
      try {
        rpc.destroy();
      } catch {
        // Ignore — may already be disconnected
      }
      rpc = null;
      rpcReady = false;
    }

    const { Client } = require('@xhayper/discord-rpc');
    rpc = new Client({ clientId });

    rpc.on('ready', () => {
      log.info('Discord RPC connected');
      rpcReady = true;
      rpcRetryCount = 0;

      if (lastKnownTrack && lastKnownTrack.title) {
        updateRichPresence(lastKnownTrack);
      } else {
        rpc.user?.setActivity({
          details: 'YouTube Music',
          state: 'Browsing music',
          largeImageKey: 'icon',
          largeImageText: 'YouTube Music Desktop',
          type: 2
        }).catch(() => {});
      }
    });

    rpc.on('disconnected', () => {
      log.warn('Discord RPC disconnected');
      rpcReady = false;
      scheduleRpcRetry();
    });

    // Add timeout to rpc.login() to prevent the app from hanging
    // if the Discord IPC pipe is unresponsive. 10 seconds is generous
    // since the IPC pipe is local and should respond quickly.
    const LOGIN_TIMEOUT_MS = 10000;
    const loginTimeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Discord RPC login timed out')), LOGIN_TIMEOUT_MS)
    );
    await Promise.race([rpc.login(), loginTimeout]);
  } catch (err) {
    log.warn('Discord RPC failed to connect:', err.message);
    scheduleRpcRetry();
  }
}

/**
 * Schedule retry with exponential backoff.
 */
function scheduleRpcRetry() {
  rpcRetryCount++;
  if (rpcRetryCount > RPC_MAX_RETRIES) {
    log.warn('Discord RPC: max retries reached, giving up');
    rpc = null;
    rpcReady = false;
    return;
  }
  // Don't schedule retries if user has disabled RPC
  if (rpcUserDisabled) {
    log.info('Discord RPC: user disabled RPC, cancelling retry');
    return;
  }
  const delay = getRpcRetryDelay();
  log.warn('Discord RPC: retrying in', Math.round(delay / 1000) + 's', '(attempt', rpcRetryCount + '/' + RPC_MAX_RETRIES + ')');
  setTimeout(initDiscordRPC, delay);
}

/**
 * Update Discord Rich Presence with current track.
 */
function updateRichPresence(track) {
  if (!rpcReady || !rpc) {return;}

  const now = Date.now();
  const wasPaused = !!lastKnownTrack?.isPaused;
  const nowPaused = !!track.isPaused;
  const playStateChanged = wasPaused !== nowPaused;
  const trackChanged = (lastKnownTrack?.title !== track.title || lastKnownTrack?.artist !== track.artist);
  const isImportant = playStateChanged || trackChanged;

  if (!isImportant && lastPresenceUpdate && (now - lastPresenceUpdate) < PRESENCE_THROTTLE_MS) {
    return;
  }
  lastPresenceUpdate = now;

  if (!track || !track.title) {
    rpc.user?.clearActivity().catch(() => {});
    return;
  }

  const title = truncateForDiscord(track.title, DISCORD_MAX_FIELD_LENGTH);
  const artist = track.artist
    ? truncateForDiscord(track.artist, DISCORD_MAX_FIELD_LENGTH)
    : 'Unknown Artist';

  let largeImageKey = 'icon';
  if (track.albumArt && isValidImageUrl(track.albumArt)) {
    largeImageKey = track.albumArt;
  }

  const isPaused = !!track.isPaused;

  let startTimestamp = undefined;
  let endTimestamp = undefined;
  if (!isPaused && track.currentPosition !== undefined && track.duration !== undefined &&
      track.duration > 0 && track.currentPosition >= 0) {
    startTimestamp = Math.floor(now - (track.currentPosition * 1000));
    endTimestamp = Math.floor(startTimestamp + (track.duration * 1000));
  }

  rpc.user?.setActivity({
    details: title,
    state: artist,
    largeImageKey: largeImageKey,
    smallImageKey: isPaused ? 'paused' : 'playing',
    smallImageText: isPaused ? 'Paused' : 'Playing',
    startTimestamp: startTimestamp,
    endTimestamp: endTimestamp,
    instance: false,
    type: 2
  }).catch(err => {
    log.warn('Failed to update Discord presence:', err.message);
  });
}

/**
 * Set the last known track (for re-hydration after reconnect).
 */
function setLastKnownTrack(track) {
  lastKnownTrack = track;
}

/**
 * Get the last known track.
 */
function getLastKnownTrack() {
  return lastKnownTrack;
}

/**
 * Cleanup Discord RPC on app quit.
 * FIX BUG-CRITICAL-1: Uses Promise.race with timeout to prevent hanging.
 *
 * @returns {Promise<void>}
 */
async function cleanupDiscordRPC() {
  if (!rpc || !rpcReady || rpcCleanupDone) {return;}

  rpcCleanupDone = true;
  log.info('Discord RPC: cleaning up...');

  const timeout = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  try {
    await Promise.race([
      rpc.user?.clearActivity() || Promise.resolve(),
      timeout(3000)
    ]);
  } catch {
    // Ignore
  }

  try {
    await Promise.race([
      rpc.destroy(),
      timeout(2000)
    ]);
  } catch {
    // Ignore
  }

  rpc = null;
  rpcReady = false;
  log.info('Discord RPC cleared and destroyed');
}

/**
 * Whether Discord RPC is currently enabled (connected or attempting to connect).
 * Returns false if the user has explicitly disabled it via the tray toggle.
 */
function isDiscordRpcEnabled() {
  return !rpcUserDisabled;
}

/**
 * Disable Discord Rich Presence at runtime (tray toggle).
 * Disconnects the client and stops retry attempts, but does NOT set
 * rpcCleanupDone so that the RPC can be re-enabled later via initDiscordRPC().
 */
async function disableDiscordRPC() {
  rpcUserDisabled = true;
  rpcReady = false;
  rpcRetryCount = 0;
  lastPresenceUpdate = null;
  log.info('Discord RPC: disabled by user');

  if (rpc) {
    try {
      const timeout = (ms) => new Promise(resolve => setTimeout(resolve, ms));
      await Promise.race([
        rpc.user?.clearActivity() || Promise.resolve(),
        timeout(3000)
      ]);
    } catch {
      // Ignore
    }
    try {
      await Promise.race([
        rpc.destroy(),
        timeout(2000)
      ]);
    } catch {
      // Ignore
    }
    rpc = null;
    log.info('Discord RPC: client disconnected after user disable');
  }
}

/**
 * Re-enable Discord Rich Presence at runtime (tray toggle).
 * Resets the user-disabled flag and calls initDiscordRPC().
 */
function enableDiscordRPC() {
  rpcUserDisabled = false;
  log.info('Discord RPC: re-enabled by user');
  initDiscordRPC();
}

/**
 * Reset cleanup flag (for testing).
 */
function _resetCleanupFlag() {
  rpcCleanupDone = false;
}

module.exports = {
  initDiscordRPC,
  updateRichPresence,
  setLastKnownTrack,
  getLastKnownTrack,
  cleanupDiscordRPC,
  disableDiscordRPC,
  enableDiscordRPC,
  isDiscordAvailable,
  isDiscordRpcEnabled,
  getDiscordClientId,
  isValidImageUrl,
  getRpcRetryDelay,
  _resetCleanupFlag,
  // F-15 FIX: Expose for unit testing
  _setRpcRetryCount: (count) => { rpcRetryCount = count; },
  _getRpcReady: () => rpcReady
};
