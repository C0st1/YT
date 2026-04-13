/**
 * Tests for isBlockedHostname (from adblocker.js)
 */

const { isBlockedHostname, BLOCK_DOMAINS } = require('../src/adblocker');

describe('isBlockedHostname', () => {
  test('blocks exact domain match', () => {
    expect(isBlockedHostname('doubleclick.net')).toBe(true);
  });

  test('blocks subdomain of blocked domain', () => {
    expect(isBlockedHostname('pagead2.googlesyndication.com')).toBe(true);
  });

  test('blocks deeply nested subdomain', () => {
    expect(isBlockedHostname('ads.server.doubleclick.net')).toBe(true);
  });

  test('does not block non-blocked domain', () => {
    expect(isBlockedHostname('music.youtube.com')).toBe(false);
  });

  test('does not block empty string', () => {
    expect(isBlockedHostname('')).toBe(false);
  });

  test('blocks google-analytics.com', () => {
    expect(isBlockedHostname('google-analytics.com')).toBe(true);
  });

  test('blocks subdomain of google-analytics.com', () => {
    expect(isBlockedHostname('www.google-analytics.com')).toBe(true);
  });

  test('does not block youtube.com itself', () => {
    expect(isBlockedHostname('youtube.com')).toBe(false);
  });

  test('does not block music.youtube.com', () => {
    expect(isBlockedHostname('music.youtube.com')).toBe(false);
  });

  test('blocks connect.facebook.net', () => {
    expect(isBlockedHostname('connect.facebook.net')).toBe(true);
  });

  test('blocks criteo.com', () => {
    expect(isBlockedHostname('criteo.com')).toBe(true);
  });

  test('does not block safe domain', () => {
    expect(isBlockedHostname('github.com')).toBe(false);
  });

  test('does not block common CDN', () => {
    expect(isBlockedHostname('cdn.jsdelivr.net')).toBe(false);
  });
});

describe('BLOCK_DOMAINS', () => {
  test('is a Set', () => {
    expect(BLOCK_DOMAINS).toBeInstanceOf(Set);
  });

  test('has expected size', () => {
    // Just verify it's populated
    expect(BLOCK_DOMAINS.size).toBeGreaterThan(10);
  });

  test('contains key ad domains', () => {
    expect(BLOCK_DOMAINS.has('doubleclick.net')).toBe(true);
    expect(BLOCK_DOMAINS.has('googlesyndication.com')).toBe(true);
    expect(BLOCK_DOMAINS.has('google-analytics.com')).toBe(true);
  });
});
