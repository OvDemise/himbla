import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(version) }, // shown on the title and pause screens
  // the runner model (src/assets/runner.glb, exported from Blender) is imported with ?inline
  assetsInclude: ['**/*.glb'],
  build: { chunkSizeWarningLimit: 2000 },
});
