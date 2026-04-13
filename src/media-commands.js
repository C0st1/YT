/**
 * media-commands.js - Media control commands for YouTube Music
 *
 * With WebContentsView (SEC-HIGH-3 fix), media commands are sent
 * DIRECTLY to the WebContentsView's webContents — no IPC round-trip
 * through the renderer, no webContents scanning fallback.
 *
 * FIX SEC-LOW-1: Validates commands against ALLOWED_MEDIA_COMMANDS.
 * FIX PERF-MEDIUM-1: No more getAllWebContents() scan.
 */

const {
  ALLOWED_MEDIA_COMMANDS
} = require('./config');

/**
 * Execute a media command directly on a WebContentsView's webContents.
 *
 * @param {Electron.WebContents} musicWC - webContents of the YouTube Music WebContentsView
 * @param {string} command - One of: play-pause, next, previous, stop
 */
function executeMediaCommand(musicWC, command) {
  if (!musicWC || musicWC.isDestroyed()) {return;}

  // play-pause: directly toggle the <video> element
  if (command === 'play-pause') {
    musicWC.executeJavaScript(`
      (function() {
        const video = document.querySelector('video');
        if (video) { video.paused ? video.play() : video.pause(); }
      })();
    `).catch(() => {});
    return;
  }

  // next / previous: Shift+N and Shift+P via sendInputEvent
  const keyMap = {
    'next':     { keyCode: 'N', modifiers: ['shift'] },
    'previous': { keyCode: 'P', modifiers: ['shift'] },
  };

  const evt = keyMap[command];
  if (evt) {
    musicWC.sendInputEvent({ type: 'keyDown', ...evt });
    musicWC.sendInputEvent({ type: 'keyUp',   ...evt });
    return;
  }

  // 'stop' has no YTM shortcut — use JS
  if (command === 'stop') {
    musicWC.executeJavaScript(`
      (function() {
        const video = document.querySelector('video');
        if (video) { video.pause(); video.currentTime = 0; }
      })();
    `).catch(() => {});
    return;
  }
}

/**
 * Validate a media command string.
 *
 * @param {any} command
 * @returns {boolean}
 */
function isValidMediaCommand(command) {
  return typeof command === 'string' && ALLOWED_MEDIA_COMMANDS.includes(command);
}

module.exports = {
  executeMediaCommand,
  isValidMediaCommand
};
