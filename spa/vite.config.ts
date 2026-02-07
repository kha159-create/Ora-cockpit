import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(() => {
  return {
    // Relative base works well for GitHub Pages + HashRouter
    base: './',
    plugins: [react()],
    publicDir: 'public',
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      minify: 'terser',
      terserOptions: { compress: { drop_console: true, drop_debugger: true } },
      assetsDir: 'spa-assets',
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        output: {
          assetFileNames: 'spa-assets/[name]-[hash][extname]',
          chunkFileNames: 'spa-assets/[name]-[hash].js',
          entryFileNames: 'spa-assets/[name]-[hash].js',
          manualChunks: {
            'vendor-react': ['react', 'react-dom', 'react-router-dom'],
            'vendor-charts': ['recharts'],
            'vendor-xlsx': ['xlsx'],
          },
        },
      },
    },
    define: {
      '__BUILD_ID__': JSON.stringify(Date.now().toString()),
    },
  };
});
