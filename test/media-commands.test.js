/**
 * Tests for isValidMediaCommand (from media-commands.js)
 */

const { isValidMediaCommand } = require('../src/media-commands');

describe('isValidMediaCommand', () => {
  test('accepts play-pause', () => {
    expect(isValidMediaCommand('play-pause')).toBe(true);
  });

  test('accepts next', () => {
    expect(isValidMediaCommand('next')).toBe(true);
  });

  test('accepts previous', () => {
    expect(isValidMediaCommand('previous')).toBe(true);
  });

  test('accepts stop', () => {
    expect(isValidMediaCommand('stop')).toBe(true);
  });

  test('rejects invalid command', () => {
    expect(isValidMediaCommand('invalid')).toBe(false);
  });

  test('rejects empty string', () => {
    expect(isValidMediaCommand('')).toBe(false);
  });

  test('rejects null', () => {
    expect(isValidMediaCommand(null)).toBe(false);
  });

  test('rejects undefined', () => {
    expect(isValidMediaCommand(undefined)).toBe(false);
  });

  test('rejects number', () => {
    expect(isValidMediaCommand(42)).toBe(false);
  });

  test('rejects partial match (play)', () => {
    expect(isValidMediaCommand('play')).toBe(false);
  });

  test('rejects case-sensitive variant (Play-Pause)', () => {
    expect(isValidMediaCommand('Play-Pause')).toBe(false);
  });

  test('rejects object', () => {
    expect(isValidMediaCommand({ command: 'next' })).toBe(false);
  });
});
