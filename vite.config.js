import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset URLs so the built site works from any path, not just the
  // server root — it can be dropped into a subdirectory or a static host.
  base: './',
  build: {
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 900,
  },
});
