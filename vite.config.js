import fs from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import * as esbuild from 'esbuild'

// Every component in this project is a plain .js file containing JSX
// syntax, not .jsx. Three separate places in Vite's pipeline need to be
// told about this, or JSX-in-.js breaks in different ways depending on
// dev vs. production build:
//   1. esbuild.include below - covers `vite`/`vercel dev` (dev server)
//   2. optimizeDeps.esbuildOptions.loader - covers dependency pre-bundling
//   3. This custom Rollup plugin - covers `vite build` (production)
//      specifically. Without it, Rollup's own import-analysis step tries
//      to parse the raw file BEFORE any transform runs and fails with
//      "invalid JS syntax" even though esbuild.include is set correctly -
//      that config only affects esbuild's own transform hook, not
//      Rollup's separate pre-transform parse. Documented fix from
//      https://github.com/vitejs/vite/discussions/3448
const jsxInJsRollupPlugin = (matchers) => ({
  name: 'jsx-in-js',
  load(id) {
    if (matchers.some((matcher) => matcher.test(id))) {
      const file = fs.readFileSync(id, { encoding: 'utf-8' });
      // jsx: 'automatic' is critical here - without it, esbuild defaults
      // to the classic transform (compiles <App/> into
      // React.createElement(App), which requires React to be explicitly
      // imported in every file). None of our components import React
      // directly - they rely on the modern automatic runtime, same as
      // @vitejs/plugin-react uses everywhere else in this project. Without
      // this, the production bundle throws "ReferenceError: React is not
      // defined" at runtime, since the compiled code references a global
      // that was never imported.
      return esbuild.transformSync(file, { loader: 'jsx', jsx: 'automatic' });
    }
  },
});

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  build: {
    rollupOptions: {
      plugins: [jsxInJsRollupPlugin([/\/src\/.*\.js$/])],
    },
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
  esbuild: {
    loader: 'jsx',
    jsx: 'automatic',
    include: /src\/.*\.js$/,
    exclude: [],
  },
  optimizeDeps: {
    esbuildOptions: {
      loader: {
        '.js': 'jsx',
      },
    },
  },
})