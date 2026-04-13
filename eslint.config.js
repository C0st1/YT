// F-16 FIX: Added no-throw-literal rule and replaced manual globals
// list with globals.fromESVersion for maintainability.
const globals = require('globals');

module.exports = {
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'commonjs',
    globals: {
      // F-16 FIX: Use globals package for standard ES2021 + Node.js globals
      ...globals.es2021,
      ...globals.node,
      // Electron-specific globals not covered by the node env
      globalThis: 'readonly',
    },
    parserOptions: {
      ecmaFeatures: {}
    }
  },
  rules: {
    'no-console': 'off',
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    'no-undef': 'error',
    'no-var': 'error',
    'prefer-const': 'error',
    'eqeqeq': ['error', 'always'],
    'curly': ['error', 'all'],
    'no-constant-binary-expression': 'error',
    'no-restricted-globals': ['error', 'event'],
    // F-16 FIX: Prevent throwing non-Error values which lose stack traces
    'no-throw-literal': 'error'
  }
};
