// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
    rules: {
      // These React Compiler diagnostics treat Reanimated shared values and
      // imperative native players as immutable React values. They are false
      // positives for the APIs this app intentionally uses.
      'react-hooks/immutability': 'off',
      'react-hooks/refs': 'off',
      // Data loading and native subscriptions intentionally prime local state
      // when their effect starts.
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
    },
  }
]);
