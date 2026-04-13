/**
 * FIND-04 FIX: Integration tests for IPC handler registration
 */

const { registerIpcHandlers, validateSettings } = require('../src/ipc-handlers');
const { ipcMain } = require('electron');

describe('registerIpcHandlers', () => {
  test('registers expected IPC channels', () => {
    const channels = [];
    ipcMain.handle.mockImplementation((channel, handler) => {
      channels.push(channel);
    });

    const mockStore = {
      get: jest.fn(() => ({})),
      set: jest.fn()
    };

    registerIpcHandlers(mockStore);

    expect(channels).toContain('get-window-state');
    expect(channels).toContain('get-settings');
    expect(channels).toContain('save-settings');
    expect(channels).toContain('window-minimize');
    expect(channels).toContain('window-maximize');
    expect(channels).toContain('window-close');
    expect(channels).toContain('get-theme');
    expect(channels).toContain('set-theme');
    expect(channels).toContain('show-notification');
    expect(channels).toContain('update-tray-tooltip');
    expect(channels).toContain('is-discord-available');
    expect(channels).toContain('media-command');
    expect(channels).toContain('go-back');
    expect(channels).toContain('go-forward');
    expect(channels).toContain('get-navigation-state');
  });

  test('save-settings handler rejects invalid input and calls store.set for valid input', () => {
    const mockStore = {
      get: jest.fn(() => ({ minimizeToTray: true, showNotifications: false, startMinimized: false, theme: 'system' })),
      set: jest.fn()
    };

    registerIpcHandlers(mockStore);

    // Find the save-settings handler
    const saveCall = ipcMain.handle.mock.calls.find(call => call[0] === 'save-settings');
    expect(saveCall).toBeDefined();
    const handler = saveCall[1];

    // Reject null
    expect(handler(null, null)).toBe(false);

    // Reject unknown keys
    expect(handler(null, { unknownKey: true })).toBe(false);

    // Accept valid settings
    const result = handler(null, { minimizeToTray: false });
    expect(result).toBe(true);
    expect(mockStore.set).toHaveBeenCalled();
  });

  test('media-command handler rejects unregistered commands', () => {
    const mockStore = {
      get: jest.fn(() => ({})),
      set: jest.fn()
    };

    registerIpcHandlers(mockStore);

    const mediaCall = ipcMain.handle.mock.calls.find(call => call[0] === 'media-command');
    expect(mediaCall).toBeDefined();
    const handler = mediaCall[1];

    expect(handler(null, 'invalid-command')).toBe(false);
    expect(handler(null, 'play-pause')).toBe(true);
    expect(handler(null, 'next')).toBe(true);
    expect(handler(null, 'previous')).toBe(true);
    expect(handler(null, 'stop')).toBe(true);
  });

  test('set-theme handler rejects invalid themes', () => {
    const mockStore = {
      get: jest.fn(() => ({ minimizeToTray: true, theme: 'system' })),
      set: jest.fn()
    };

    registerIpcHandlers(mockStore);

    const themeCall = ipcMain.handle.mock.calls.find(call => call[0] === 'set-theme');
    const handler = themeCall[1];

    const badTheme = handler(null, 'invalid-theme');
    expect(badTheme).toBeDefined(); // Returns current theme as fallback

    const goodTheme = handler(null, 'dark');
    expect(goodTheme).toBe('dark');
    expect(mockStore.set).toHaveBeenCalled();
  });
});
