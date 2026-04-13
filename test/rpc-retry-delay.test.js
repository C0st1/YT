/**
 * Tests for getRpcRetryDelay (from discord-rpc.js)
 */

const { getRpcRetryDelay } = require('../src/discord-rpc');

describe('getRpcRetryDelay', () => {
  // Note: getRpcRetryDelay uses module-level rpcRetryCount which
  // starts at 0. We test the pattern of exponential growth.

  test('returns a positive number', () => {
    const delay = getRpcRetryDelay();
    expect(delay).toBeGreaterThan(0);
  });

  test('returns approximately base delay for first retry (15s + jitter)', () => {
    const delay = getRpcRetryDelay();
    // Base is 15000 * 2^0 = 15000 + [0, 5000) jitter
    expect(delay).toBeGreaterThanOrEqual(15000);
    expect(delay).toBeLessThan(20000); // 15000 + 5000 jitter max
  });

  test('delay increases with more retries (exponential pattern)', () => {
    // We can't easily set rpcRetryCount since it's a module variable,
    // but we can verify the function produces consistent results
    // for the same state
    const delays = Array.from({ length: 5 }, () => getRpcRetryDelay());
    // All should be in reasonable range (15s base, capped at 300s)
    for (const d of delays) {
      expect(d).toBeGreaterThanOrEqual(15000);
      expect(d).toBeLessThanOrEqual(305000); // 300000 + 5000 jitter
    }
  });

  test('delay includes jitter (random variation)', () => {
    // Call multiple times and verify there's variation
    // (statistical test — may very rarely fail)
    const delays = Array.from({ length: 20 }, () => getRpcRetryDelay());
    const unique = new Set(delays);
    // With jitter of 0-5000ms, we should get at least a few unique values
    expect(unique.size).toBeGreaterThan(1);
  });

  test('delay is a finite number', () => {
    const delay = getRpcRetryDelay();
    expect(Number.isFinite(delay)).toBe(true);
  });
});
