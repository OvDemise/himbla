import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import { devGit } from './tools/devGit.mjs';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
  base: './',
  plugins: [devGit()], // (dev server only: the dev menu's GIT FETCH & PULL)
  define: { __APP_VERSION__: JSON.stringify(version) }, // shown on the title and pause screens
  // the runner model (src/assets/runner.glb, exported from Blender) is imported with ?inline
  assetsInclude: ['**/*.glb'],
  build: { chunkSizeWarningLimit: 2000 },
});
