/**
 * Tests for isValidImageUrl (from discord-rpc.js)
 *
 * F-05 FIX: Updated to test suffix matching instead of includes().
 */

const { isValidImageUrl } = require('../src/discord-rpc');

describe('isValidImageUrl', () => {
  test('returns false for null', () => {
    expect(isValidImageUrl(null)).toBe(false);
  });

  test('returns false for undefined', () => {
    expect(isValidImageUrl(undefined)).toBe(false);
  });

  test('returns false for non-string', () => {
    expect(isValidImageUrl(123)).toBe(false);
  });

  test('returns false for empty string', () => {
    expect(isValidImageUrl('')).toBe(false);
  });

  test('returns false for ftp URL', () => {
    expect(isValidImageUrl('ftp://example.com/image.jpg')).toBe(false);
  });

  test('accepts known image host (ytimg.com)', () => {
    expect(isValidImageUrl('https://i.ytimg.com/vi/abc/default.jpg')).toBe(true);
  });

  test('accepts known image host (ggpht.com)', () => {
    expect(isValidImageUrl('https://ggpht.com/photo.jpg')).toBe(true);
  });

  test('accepts known image host (googleusercontent.com)', () => {
    expect(isValidImageUrl('https://googleusercontent.com/photo.png')).toBe(true);
  });

  test('accepts known image host (gstatic.com)', () => {
    expect(isValidImageUrl('https://gstatic.com/icon.png')).toBe(true);
  });

  test('accepts known image host (i.imgur.com)', () => {
    expect(isValidImageUrl('https://i.imgur.com/abc123.png')).toBe(true);
  });

  test('accepts http URL with known host', () => {
    expect(isValidImageUrl('http://i.ytimg.com/img.jpg')).toBe(true);
  });

  test('accepts URL with image extension and unknown host', () => {
    expect(isValidImageUrl('https://example.com/photo.jpg')).toBe(true);
  });

  test('accepts URL with .png extension', () => {
    expect(isValidImageUrl('https://example.com/image.png')).toBe(true);
  });

  test('accepts URL with .webp extension', () => {
    expect(isValidImageUrl('https://example.com/image.webp')).toBe(true);
  });

  test('accepts URL with .gif extension', () => {
    expect(isValidImageUrl('https://example.com/anim.gif')).toBe(true);
  });

  test('accepts URL with image extension and query params', () => {
    expect(isValidImageUrl('https://example.com/img.jpg?w=200&h=200')).toBe(true);
  });

  test('returns false for URL without image extension and unknown host', () => {
    expect(isValidImageUrl('https://example.com/page')).toBe(false);
  });

  test('returns false for malformed URL', () => {
    expect(isValidImageUrl('not-a-url')).toBe(false);
  });

  test('returns false for data: URL', () => {
    expect(isValidImageUrl('data:image/png;base64,abc')).toBe(false);
  });

  // F-05 FIX: New tests for suffix matching behavior
  test('F-05: blocks domain that includes known host but does not match suffix', () => {
    // "not-ytimg.com" should NOT match "ytimg.com" with suffix matching
    expect(isValidImageUrl('https://not-ytimg.com.evil.com/image.jpg')).toBe(false);
  });

  test('F-05: blocks domain where known host appears as substring but not as suffix', () => {
    // "myytimg.com" should NOT match "ytimg.com"
    expect(isValidImageUrl('https://myytimg.com/image.jpg')).toBe(false);
  });

  test('F-05: accepts exact domain match', () => {
    expect(isValidImageUrl('https://ytimg.com/image.jpg')).toBe(true);
  });

  test('F-05: accepts subdomain of known host via suffix match', () => {
    expect(isValidImageUrl('https://cdn.sub.ytimg.com/image.jpg')).toBe(true);
  });

  test('F-05: accepts subdomain of googleusercontent.com', () => {
    expect(isValidImageUrl('https://lh3.googleusercontent.com/photo.png')).toBe(true);
  });
});
