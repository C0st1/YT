module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/test/**/*.test.js'],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/main.js',
    '!src/preload.js'
  ],
  // Electron modules cannot be required in tests; mock them
  moduleNameMapper: {
    '^electron$': '<rootDir>/test/__mocks__/electron.js',
    '^electron-store$': '<rootDir>/test/__mocks__/electron-store.js',
    '^@ghostery/adblocker-electron$': '<rootDir>/test/__mocks__/adblocker-electron.js',
    '^@xhayper/discord-rpc$': '<rootDir>/test/__mocks__/discord-rpc.js',
    '^electron-log$': '<rootDir>/test/__mocks__/electron-log.js'
  }
};
