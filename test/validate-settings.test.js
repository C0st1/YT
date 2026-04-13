/**
 * Tests for validateSettings (from ipc-handlers.js)
 */

const { validateSettings } = require('../src/ipc-handlers');

describe('validateSettings', () => {
  test('returns null for null input', () => {
    expect(validateSettings(null)).toBeNull();
  });

  test('returns null for undefined input', () => {
    expect(validateSettings(undefined)).toBeNull();
  });

  test('returns null for non-object input (string)', () => {
    expect(validateSettings('invalid')).toBeNull();
  });

  test('returns null for non-object input (number)', () => {
    expect(validateSettings(42)).toBeNull();
  });

  test('returns null for array input', () => {
    expect(validateSettings([1, 2, 3])).toBeNull();
  });

  test('returns null for empty object', () => {
    expect(validateSettings({})).toBeNull();
  });

  test('accepts valid boolean settings', () => {
    const result = validateSettings({ minimizeToTray: true, showNotifications: false });
    expect(result).toEqual({ minimizeToTray: true, showNotifications: false });
  });

  test('accepts valid string theme', () => {
    const result = validateSettings({ theme: 'dark' });
    expect(result).toEqual({ theme: 'dark' });
  });

  test('rejects wrong type for boolean field', () => {
    const result = validateSettings({ minimizeToTray: 'true' });
    expect(result).toBeNull();
  });

  test('rejects unknown keys (only keeps allowed)', () => {
    const result = validateSettings({ minimizeToTray: true, unknownKey: 'value' });
    expect(result).toEqual({ minimizeToTray: true });
    expect(result).not.toHaveProperty('unknownKey');
  });

  test('accepts all valid settings at once', () => {
    const input = {
      minimizeToTray: false,
      showNotifications: true,
      startMinimized: true,
      theme: 'light'
    };
    const result = validateSettings(input);
    expect(result).toEqual(input);
  });

  test('rejects theme with wrong type (number)', () => {
    const result = validateSettings({ theme: 123 });
    expect(result).toBeNull();
  });

  test('partial valid settings returns only valid ones', () => {
    const result = validateSettings({ minimizeToTray: true, showNotifications: 'not-a-boolean' });
    expect(result).toEqual({ minimizeToTray: true });
  });
});
