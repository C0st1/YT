module.exports = {
  transports: {
    file: {
      level: 'info',
      maxSize: 5 * 1024 * 1024,
      format: '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}',
      resolvePathFn: jest.fn()
    },
    console: {
      level: 'debug',
      format: '[{level}] {text}'
    }
  },
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
};
