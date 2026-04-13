/**
 * logger.js - Structured logging using electron-log
 *
 * ARCH-MEDIUM-5 FIX: Replaces all console.log/warn/error calls with
 * electron-log, which provides file-based logging, log levels,
 * automatic rotation, and timestamp formatting.
 */

const path = require('path');
const electronLog = require('electron-log');

// Configure electron-log
electronLog.transports.file.level = 'info';
electronLog.transports.file.maxSize = 5 * 1024 * 1024; // 5 MB rotation
electronLog.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';
electronLog.transports.console.level = 'debug';
electronLog.transports.console.format = '[{level}] {text}';

// Resolve log file path (inside userData)
electronLog.transports.file.resolvePathFn = (variables) => {
  return path.join(variables.electronDefaultDir, 'logs', 'main.log');
};

const log = electronLog;

module.exports = log;
