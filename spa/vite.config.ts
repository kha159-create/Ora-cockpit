import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(() => {
  return {
    // Relative base works well for GitHub Pages + HashRouter
    base: './',
    plugins: [react()],
    publicDir: 'public',
    build: {
      minify: 'terser',
      terserOptions: { compress: { drop_console: true, drop_debugger: true } },
      assetsDir: 'assets',
      rollupOptions: {
        output: {
          assetFileNames: 'assets/[name]-[hash][extname]',
          chunkFileNames: 'assets/[name]-[hash].js',
          entryFileNames: 'assets/[name]-[hash].js'
        }
      }
    },
    define: {
      '__BUILD_ID__': JSON.stringify(Date.now().toString())
    }
  };
});

