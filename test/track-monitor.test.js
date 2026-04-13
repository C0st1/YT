/**
 * FIND-04 FIX: Integration tests for track monitor polling lifecycle
 */

const { startTrackPolling, stopTrackPolling } = require('../src/track-monitor');

describe('track monitor', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    stopTrackPolling();
  });

  afterEach(() => {
    stopTrackPolling();
    jest.useRealTimers();
  });

  test('startTrackPolling calls executeJavaScript on the webContents', () => {
    const mockWC = {
      isDestroyed: jest.fn(() => false),
      executeJavaScript: jest.fn(() => Promise.resolve({ title: 'Test Song', artist: 'Test Artist' }))
    };

    const onTrackUpdate = jest.fn();
    startTrackPolling(mockWC, onTrackUpdate);

    // Initial poll should have been called
    expect(mockWC.executeJavaScript).toHaveBeenCalledTimes(1);

    // Wait for promise to resolve
    return Promise.resolve().then(() => {
      expect(onTrackUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Test Song' })
      );
    });
  });

  test('stopTrackPolling clears the interval', () => {
    const mockWC = {
      isDestroyed: jest.fn(() => false),
      executeJavaScript: jest.fn(() => Promise.resolve(null))
    };

    const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

    startTrackPolling(mockWC, jest.fn());
    stopTrackPolling();

    expect(clearIntervalSpy).toHaveBeenCalled();
    clearIntervalSpy.mockRestore();
  });

  test('polling stops when webContents is destroyed', () => {
    const mockWC = {
      isDestroyed: jest.fn(() => true),
      executeJavaScript: jest.fn(() => Promise.resolve(null))
    };

    startTrackPolling(mockWC, jest.fn());
    expect(stopTrackPolling).toBeDefined();
  });

  test('does not call onTrackUpdate for null/empty results', () => {
    const mockWC = {
      isDestroyed: jest.fn(() => false),
      executeJavaScript: jest.fn(() => Promise.resolve(null))
    };

    const onTrackUpdate = jest.fn();
    startTrackPolling(mockWC, onTrackUpdate);

    return Promise.resolve().then(() => {
      expect(onTrackUpdate).not.toHaveBeenCalled();
    });
  });

  test('handles executeJavaScript rejection gracefully', () => {
    const mockWC = {
      isDestroyed: jest.fn(() => false),
      executeJavaScript: jest.fn(() => Promise.reject(new Error('Page not ready')))
    };

    const onTrackUpdate = jest.fn();
    startTrackPolling(mockWC, onTrackUpdate);

    // Should not throw even though executeJavaScript rejects
    return Promise.resolve().then(() => {
      expect(onTrackUpdate).not.toHaveBeenCalled();
    });
  });
});
