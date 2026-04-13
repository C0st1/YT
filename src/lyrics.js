/**
 * lyrics.js - Lyrics overlay using lrclib.net API
 *
 * Fetches synced or unsynced lyrics from the free lrclib.net API
 * and sends them to the title bar / mini player for display.
 * Supports both synced (timestamped) and plain lyrics.
 */

const log = require('./logger');
const { LYRICS_CACHE_MAX_ENTRIES, LYRICS_NULL_CACHE_TTL_MS, LYRICS_MAX_RESPONSE_SIZE, LYRICS_API_TIMEOUT_MS } = require('./config');

const LRCLIB_API = 'https://lrclib.net/api/search';
const LRCLIB_GET = 'https://lrclib.net/api/get';

// Cache: track key → lyrics data
// Uses insertion-ordered keys for LRU eviction when cache exceeds
// LYRICS_CACHE_MAX_ENTRIES (defined in config.js).
// Null entries (failed searches) include a timestamp so they can
// expire after LYRICS_NULL_CACHE_TTL_MS, allowing retries.
let lyricsCache = {};
let cacheInsertionOrder = [];
let currentLyrics = null;
let currentTrackKey = null;

/**
 * Build a cache key from track info.
 */
function buildTrackKey(title, artist) {
  return `${(title || '').toLowerCase()}|${(artist || '').toLowerCase()}`;
}

/**
 * Search for lyrics on lrclib.net.
 */
async function searchLyrics(title, artist) {
  if (!title) return null;

  const key = buildTrackKey(title, artist);

  // Check cache first (respect TTL for null entries)
  if (lyricsCache[key] !== undefined) {
    const cached = lyricsCache[key];
    if (cached === null) {
      // Null entry — check if it has expired and should be retried
      const nullTimestamp = lyricsCache[key + ':nullTs'];
      if (nullTimestamp && (Date.now() - nullTimestamp) < LYRICS_NULL_CACHE_TTL_MS) {
        return null; // Still within TTL, don't retry
      }
      // TTL expired — remove and retry
      delete lyricsCache[key];
      delete lyricsCache[key + ':nullTs'];
      const idx = cacheInsertionOrder.indexOf(key);
      if (idx !== -1) cacheInsertionOrder.splice(idx, 1);
      log.info('[lyrics] Null cache TTL expired, retrying:', key);
    } else {
      return cached;
    }
  }

  try {
    const query = artist ? `${title} ${artist}` : title;
    const url = `${LRCLIB_API}?q=${encodeURIComponent(query)}`;

    const response = await fetch(url, {
      headers: { 'User-Agent': 'YoutubeMusicDesktop/1.0' },
      signal: AbortSignal.timeout(LYRICS_API_TIMEOUT_MS)
    });

    if (!response.ok) {
      log.warn('[lyrics] API returned status:', response.status);
      cacheNullEntry(key);
      return null;
    }

    // Validate response size before parsing to prevent memory issues
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > LYRICS_MAX_RESPONSE_SIZE) {
      log.warn('[lyrics] API response too large, skipping:', contentLength, 'bytes');
      cacheNullEntry(key);
      return null;
    }

    const responseText = await response.text();
    if (responseText.length > LYRICS_MAX_RESPONSE_SIZE) {
      log.warn('[lyrics] API response body too large, skipping:', responseText.length, 'chars');
      cacheNullEntry(key);
      return null;
    }

    let results;
    try {
      results = JSON.parse(responseText);
    } catch (parseErr) {
      log.warn('[lyrics] API returned invalid JSON:', parseErr.message);
      cacheNullEntry(key);
      return null;
    }

    if (!Array.isArray(results) || results.length === 0) {
      cacheNullEntry(key);
      return null;
    }

    // Prefer synced lyrics, then exact match
    let best = null;
    for (const result of results) {
      if (result.syncedLyrics) {
        best = result;
        break;
      }
      if (!best) {
        best = result;
      }
    }

    if (!best) {
      cacheNullEntry(key);
      return null;
    }

    const lyricsData = {
      id: best.id,
      title: best.trackName || title,
      artist: best.artistName || artist || '',
      album: best.albumName || '',
      synced: !!best.syncedLyrics,
      plainLyrics: best.plainLyrics || '',
      syncedLyrics: best.syncedLyrics || '',
      duration: best.duration || 0
    };

    lyricsCache[key] = lyricsData;
    evictCacheIfNeeded(key);
    log.info('[lyrics] Found lyrics for:', title, '(synced:', lyricsData.synced + ')');
    return lyricsData;

  } catch (err) {
    log.warn('[lyrics] Search failed:', err.message);
    cacheNullEntry(key);
    return null;
  }
}

/**
 * Parse synced lyrics (LRC format) into timestamped lines.
 * LRC format: [mm:ss.xx]text
 */
function parseSyncedLyrics(syncedLyrics) {
  if (!syncedLyrics) return [];

  const lines = [];
  const regex = /\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/;

  for (const line of syncedLyrics.split('\n')) {
    const match = line.match(regex);
    if (match) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      const ms = parseInt(match[3].padEnd(3, '0'), 10);
      const timeMs = (minutes * 60 + seconds) * 1000 + ms;
      const text = match[4].trim();
      if (text) {
        lines.push({ time: timeMs, text });
      }
    }
  }

  return lines.sort((a, b) => a.time - b.time);
}

/**
 * Get the current lyric line based on playback position.
 * Returns the current line and the next few lines for display.
 */
function getLyricsAtPosition(syncedLines, positionMs, contextLines = 3) {
  if (!syncedLines || syncedLines.length === 0) return null;

  let currentIndex = -1;
  for (let i = 0; i < syncedLines.length; i++) {
    if (syncedLines[i].time <= positionMs) {
      currentIndex = i;
    } else {
      break;
    }
  }

  if (currentIndex === -1) return null;

  const current = syncedLines[currentIndex].text;
  const upcoming = [];
  for (let i = 1; i <= contextLines && currentIndex + i < syncedLines.length; i++) {
    upcoming.push(syncedLines[currentIndex + i].text);
  }

  return { current, upcoming, lineIndex: currentIndex };
}

/**
 * Fetch and cache lyrics for a track.
 * Called from handleTrackChange when a new track starts.
 */
async function fetchLyrics(track) {
  if (!track || !track.title) {
    currentLyrics = null;
    currentTrackKey = null;
    return null;
  }

  const key = buildTrackKey(track.title, track.artist);
  if (key === currentTrackKey && currentLyrics) {
    return currentLyrics;
  }

  currentTrackKey = key;
  currentLyrics = await searchLyrics(track.title, track.artist);
  return currentLyrics;
}

/**
 * Get current lyrics data for display.
 */
function getCurrentLyrics() {
  return currentLyrics;
}

/**
 * Get parsed synced lines for current lyrics.
 */
function getSyncedLines() {
  if (!currentLyrics || !currentLyrics.syncedLyrics) return [];
  return parseSyncedLyrics(currentLyrics.syncedLyrics);
}

/**
 * Cache a null entry with a timestamp for TTL-based expiration.
 * After LYRICS_NULL_CACHE_TTL_MS, the null entry expires and the
 * lyrics search will be retried on the next request.
 */
function cacheNullEntry(key) {
  lyricsCache[key] = null;
  lyricsCache[key + ':nullTs'] = Date.now();
  evictCacheIfNeeded(key);
}

/**
 * Evict oldest cache entries when the cache exceeds LYRICS_CACHE_MAX_ENTRIES.
 * The most recently inserted key is preserved (moved to end of order).
 */
function evictCacheIfNeeded(latestKey) {
  // Move the latest key to the end of insertion order
  const idx = cacheInsertionOrder.indexOf(latestKey);
  if (idx !== -1) {
    cacheInsertionOrder.splice(idx, 1);
  }
  cacheInsertionOrder.push(latestKey);

  // Evict oldest entries that exceed the limit
  while (cacheInsertionOrder.length > LYRICS_CACHE_MAX_ENTRIES) {
    const oldestKey = cacheInsertionOrder.shift();
    if (oldestKey !== latestKey) {
      delete lyricsCache[oldestKey];
      delete lyricsCache[oldestKey + ':nullTs']; // Clean up null timestamp
      log.info('[lyrics] Cache eviction: removed', oldestKey);
    }
  }
}

/**
 * Clear the lyrics cache (for testing or memory management).
 */
function clearCache() {
  lyricsCache = {};
  cacheInsertionOrder = [];
  currentLyrics = null;
  currentTrackKey = null;
}

module.exports = {
  searchLyrics,
  fetchLyrics,
  parseSyncedLyrics,
  getLyricsAtPosition,
  getCurrentLyrics,
  getSyncedLines,
  clearCache
};
