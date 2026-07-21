/**
 * ESLint (flat config) — lehká pojistka na reálné chyby, ne na styl.
 * Syntaktické chyby hlídá i `npm run check:syntax` (node --check).
 */
const js = require('@eslint/js');

module.exports = [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        window: 'readonly', document: 'readonly', navigator: 'readonly', console: 'readonly',
        localStorage: 'readonly', sessionStorage: 'readonly',
        setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly',
        fetch: 'readonly', FileReader: 'readonly', Blob: 'readonly', URL: 'readonly', URLSearchParams: 'readonly',
        alert: 'readonly', prompt: 'readonly', confirm: 'readonly', requestAnimationFrame: 'readonly',
        MutationObserver: 'readonly', getComputedStyle: 'readonly', AbortController: 'readonly',
        Quill: 'readonly', DOMPurify: 'readonly', mammoth: 'readonly', diff_match_patch: 'readonly',
        lexisUI: 'writable', lexisCore: 'writable', LexisUI: 'writable', LexisCore: 'writable',
        LexisIcons: 'writable', LexisStorage: 'writable', SecureVault: 'writable',
        require: 'readonly', module: 'writable', exports: 'writable', process: 'readonly',
        __dirname: 'readonly', __filename: 'readonly', Buffer: 'readonly', global: 'readonly'
      }
    },
    rules: {
      // Necháváme jen skutečné chyby; styl a dynamické globály neřešíme.
      'no-undef': 'off',
      'no-unused-vars': 'off',
      'no-empty': 'off',
      'no-useless-escape': 'off',
      'no-control-regex': 'off',
      'no-prototype-builtins': 'off',
      'no-cond-assign': 'off',
      'no-fallthrough': 'off',
      // Tyto ZŮSTÁVAJÍ zapnuté (chytají reálné bugy):
      'no-dupe-keys': 'error',
      'no-dupe-args': 'error',
      'no-unreachable': 'error',
      'no-redeclare': 'warn',
      'getter-return': 'error',
      'no-func-assign': 'error'
    }
  },
  { ignores: ['node_modules/**', 'dist/**', 'build/**', 'vendor/**', 'playwright-report/**', 'test-results/**', 'chunk-*.js', '*-temp.js', 'temp_script.js'] }
];
