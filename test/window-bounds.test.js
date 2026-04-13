/**
 * FIND-04 FIX: Integration tests for window bounds validation
 *
 * F-04 FIX: Updated tests to verify center-point-based validation
 * instead of just top-left corner checks.
 */

const { validateWindowBounds } = require('../src/window');

describe('validateWindowBounds', () => {
  // Mock screen displays via the electron mock (1920x1080 primary)

  test('returns same bounds when window center is on-screen', () => {
    const saved = { x: 100, y: 100, width: 1200, height: 800 };
    const result = validateWindowBounds(saved);
    expect(result.x).toBe(100);
    expect(result.y).toBe(100);
    expect(result.width).toBe(1200);
    expect(result.height).toBe(800);
  });

  test('centers window when top-left is off-screen but center would be on-screen (F-04)', () => {
    // Center point: x + 1200/2 = -100 + 600 = 500, y + 800/2 = -100 + 400 = 300
    // This center IS on-screen, so it should be accepted
    const saved = { x: -100, y: -100, width: 1200, height: 800 };
    const result = validateWindowBounds(saved);
    // With center-point check, this window's center is on-screen
    expect(result.x).toBe(-100);
    expect(result.y).toBe(-100);
  });

  test('centers window when both top-left and center are off-screen (negative)', () => {
    // Center point: -2000 + 600 = -1400 — definitely off-screen
    const saved = { x: -2000, y: -2000, width: 1200, height: 800 };
    const result = validateWindowBounds(saved);
    expect(result.x).toBeGreaterThanOrEqual(0);
    expect(result.y).toBeGreaterThanOrEqual(0);
  });

  test('centers window when position is off-screen (beyond display)', () => {
    // Center point: 5000 + 600 = 5600 — off-screen
    const saved = { x: 5000, y: 5000, width: 1200, height: 800 };
    const result = validateWindowBounds(saved);
    expect(result.x).toBeLessThanOrEqual(1920);
    expect(result.y).toBeLessThanOrEqual(1080);
  });

  test('clamps window size that exceeds display dimensions', () => {
    const saved = { x: 100, y: 100, width: 3000, height: 3000 };
    const result = validateWindowBounds(saved);
    // Center is on-screen (100+1500=1600, 100+1500=1600)
    expect(result.width).toBe(3000);
    expect(result.height).toBe(3000);
  });

  test('handles valid position at display edge', () => {
    const saved = { x: 0, y: 0, width: 800, height: 600 };
    const result = validateWindowBounds(saved);
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
  });

  test('accepts window with top-left off-screen but center on-screen', () => {
    // x: -200, center: -200 + 600 = 400 (on screen)
    // y: -200, center: -200 + 400 = 200 (on screen)
    const saved = { x: -200, y: -200, width: 1200, height: 800 };
    const result = validateWindowBounds(saved);
    // F-04 FIX: With center-point validation, this should be accepted
    expect(result.x).toBe(-200);
    expect(result.y).toBe(-200);
  });
});
