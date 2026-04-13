const mockStore = {
  _data: {
    windowState: { width: 1200, height: 800, x: 100, y: 100, isMaximized: false },
    settings: { minimizeToTray: true, showNotifications: false, startMinimized: false, theme: 'system' },
    firstRun: false
  },
  get: jest.fn(function(key) { return this._data[key]; }),
  set: jest.fn(function(key, val) { this._data[key] = val; })
};

module.exports = jest.fn(() => mockStore);
module.exports.mockStore = mockStore;
