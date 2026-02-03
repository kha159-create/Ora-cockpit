import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(() => {
  return {
    // Relative base works well for GitHub Pages + HashRouter
    base: './',
    plugins: [react()],
    publicDir: 'public',
    build: {
      // Standard dist inside spa/ so deploy-spa-pages.yml can publish spa/dist
      outDir: 'dist',
      emptyOutDir: true,
      minify: 'terser',
      terserOptions: { compress: { drop_console: true, drop_debugger: true } },
      // Avoid clashing with existing legacy /assets
      assetsDir: 'spa-assets',
      rollupOptions: {
        output: {
          assetFileNames: 'spa-assets/[name]-[hash][extname]',
          chunkFileNames: 'spa-assets/[name]-[hash].js',
          entryFileNames: 'spa-assets/[name]-[hash].js'
        }
      }
    },
    define: {
      '__BUILD_ID__': JSON.stringify(Date.now().toString())
    }
  };
});

