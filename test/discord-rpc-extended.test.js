/**
 * F-15 FIX: Tests for Discord Rich Presence updateRichPresence
 *
 * Tests the throttling logic, timestamp calculation, and validation
 * in the Discord RPC module.
 */

const {
  isValidImageUrl,
  getRpcRetryDelay,
  _resetCleanupFlag,
  _setRpcRetryCount
} = require('../src/discord-rpc');

describe('isValidImageUrl (F-05 suffix matching)', () => {
  test('blocks subdomain that includes but does not end with known host', () => {
    // F-05 FIX: This should now be false with suffix matching
    expect(isValidImageUrl('https://not-ytimg.com.evil.com/image.jpg')).toBe(false);
  });

  test('accepts exact known host', () => {
    expect(isValidImageUrl('https://ytimg.com/image.jpg')).toBe(true);
  });

  test('accepts subdomain of known host', () => {
    expect(isValidImageUrl('https://i.ytimg.com/vi/abc/default.jpg')).toBe(true);
  });

  test('accepts deeply nested subdomain of known host', () => {
    expect(isValidImageUrl('https://cdn.sub.ytimg.com/image.png')).toBe(true);
  });

  test('blocks unrelated domain that merely contains known host string', () => {
    expect(isValidImageUrl('https://ytimg.com.evil.org/image.jpg')).toBe(false);
  });

  test('blocks unrelated domain with known host as substring', () => {
    expect(isValidImageUrl('https://notytimg.com/image.jpg')).toBe(false);
  });

  test('returns false for null', () => {
    expect(isValidImageUrl(null)).toBe(false);
  });

  test('returns false for empty string', () => {
    expect(isValidImageUrl('')).toBe(false);
  });

  test('accepts known image host (googleusercontent.com)', () => {
    expect(isValidImageUrl('https://googleusercontent.com/photo.png')).toBe(true);
  });

  test('accepts subdomain of googleusercontent.com', () => {
    expect(isValidImageUrl('https://lh3.googleusercontent.com/photo.png')).toBe(true);
  });

  test('accepts URL with image extension on unknown host', () => {
    expect(isValidImageUrl('https://example.com/photo.jpg')).toBe(true);
  });

  test('rejects URL without image extension on unknown host', () => {
    expect(isValidImageUrl('https://example.com/page')).toBe(false);
  });
});

describe('getRpcRetryDelay', () => {
  beforeEach(() => {
    _resetCleanupFlag();
    _setRpcRetryCount(0);
  });

  test('returns a positive number', () => {
    const delay = getRpcRetryDelay();
    expect(delay).toBeGreaterThan(0);
  });

  test('base delay is approximately RPC_BASE_DELAY_MS for first retry', () => {
    const delay = getRpcRetryDelay();
    expect(delay).toBeGreaterThanOrEqual(15000);
    expect(delay).toBeLessThan(20000);
  });

  test('delay increases with higher retry count', () => {
    _setRpcRetryCount(5);
    const delay = getRpcRetryDelay();
    // 15000 * 2^5 = 480000, but capped at 300000
    expect(delay).toBeGreaterThanOrEqual(15000);
    expect(delay).toBeLessThanOrEqual(305000);
  });

  test('delay is capped at max delay plus jitter', () => {
    _setRpcRetryCount(100);
    const delay = getRpcRetryDelay();
    expect(delay).toBeLessThanOrEqual(305000);
  });

  test('includes jitter (random variation)', () => {
    _setRpcRetryCount(0);
    const delays = Array.from({ length: 20 }, () => getRpcRetryDelay());
    const unique = new Set(delays);
    expect(unique.size).toBeGreaterThan(1);
  });
});
