// Mock for electron module
module.exports = {
  app: {
    setName: jest.fn(),
    getPath: jest.fn(() => '/tmp/test-user-data'),
    whenReady: jest.fn(() => Promise.resolve()),
    quit: jest.fn(),
    on: jest.fn(),
    commandLine: { appendSwitch: jest.fn() }
  },
  BrowserWindow: jest.fn().mockImplementation(() => ({
    loadURL: jest.fn(() => Promise.resolve()),
    loadFile: jest.fn(() => Promise.resolve()),
    show: jest.fn(),
    hide: jest.fn(),
    close: jest.fn(),
    minimize: jest.fn(),
    maximize: jest.fn(),
    unmaximize: jest.fn(),
    isMaximized: jest.fn(() => false),
    isDestroyed: jest.fn(() => false),
    isVisible: jest.fn(() => true),
    focus: jest.fn(),
    getSize: jest.fn(() => [1200, 800]),
    getPosition: jest.fn(() => [100, 100]),
    setContentProtection: jest.fn(),
    setIcon: jest.fn(),
    on: jest.fn(),
    once: jest.fn(),
    removeListener: jest.fn(),
    webContents: {
      send: jest.fn(),
      on: jest.fn(),
      once: jest.fn(),
      executeJavaScript: jest.fn(() => Promise.resolve()),
      canGoBack: jest.fn(() => false),
      canGoForward: jest.fn(() => false),
      // F-03 FIX: Add navigationHistory mock for modern Electron API
      navigationHistory: {
        canGoBack: jest.fn(() => false),
        canGoForward: jest.fn(() => false)
      },
      goBack: jest.fn(),
      goForward: jest.fn(),
      getURL: jest.fn(() => 'https://music.youtube.com/'),
      setWindowOpenHandler: jest.fn(),
      isDestroyed: jest.fn(() => false),
      capturePage: jest.fn(() => Promise.resolve({ toPNG: jest.fn() }))
    },
    contentView: {
      addChildView: jest.fn()
    }
  })),
  WebContentsView: jest.fn().mockImplementation(() => ({
    webContents: {
      loadURL: jest.fn(() => Promise.resolve()),
      on: jest.fn(),
      once: jest.fn(),
      executeJavaScript: jest.fn(() => Promise.resolve()),
      insertCSS: jest.fn(() => Promise.resolve()),
      canGoBack: jest.fn(() => false),
      canGoForward: jest.fn(() => false),
      // F-03 FIX: Add navigationHistory mock for modern Electron API
      navigationHistory: {
        canGoBack: jest.fn(() => false),
        canGoForward: jest.fn(() => false)
      },
      goBack: jest.fn(),
      goForward: jest.fn(),
      getURL: jest.fn(() => 'https://music.youtube.com/'),
      setWindowOpenHandler: jest.fn(),
      sendInputEvent: jest.fn(),
      isDestroyed: jest.fn(() => false)
    },
    setBounds: jest.fn()
  })),
  ipcMain: {
    handle: jest.fn(),
    on: jest.fn()
  },
  Tray: jest.fn().mockImplementation(() => ({
    setToolTip: jest.fn(),
    setContextMenu: jest.fn(),
    on: jest.fn()
  })),
  Menu: {
    buildFromTemplate: jest.fn(() => ({}))
  },
  nativeImage: {
    createFromPath: jest.fn(() => ({ isEmpty: () => false })),
    createEmpty: jest.fn(() => ({ isEmpty: () => true }))
  },
  globalShortcut: {
    register: jest.fn(),
    unregisterAll: jest.fn()
  },
  Notification: jest.fn().mockImplementation(() => ({
    show: jest.fn()
  })),
  nativeTheme: {
    shouldUseDarkColors: false,
    on: jest.fn()
  },
  dialog: {
    showMessageBox: jest.fn()
  },
  session: {
    defaultSession: {
      webRequest: {
        onBeforeRequest: jest.fn(),
        onHeadersReceived: jest.fn()
      }
    }
  },
  webContents: {
    getAllWebContents: jest.fn(() => [])
  },
  screen: {
    getAllDisplays: jest.fn(() => [
      { workArea: { x: 0, y: 0, width: 1920, height: 1080 } }
    ]),
    getPrimaryDisplay: jest.fn(() => ({
      workArea: { x: 0, y: 0, width: 1920, height: 1080 }
    }))
  },
  shell: {
    openExternal: jest.fn()
  }
};
