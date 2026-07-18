import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  base: './',
  root: 'src/renderer',
  publicDir: path.resolve(__dirname, 'public'),
  build: {
    outDir: '../../dist/renderer',
    emptyOutDir: true,
    sourcemap: false,
    minify: 'terser',
    terserOptions: {
      compress: { drop_console: false, drop_debugger: true },
      format: { comments: false },
    },
    rollupOptions: {
      output: {
        sourcemap: false,
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          // Three.js and its ecosystem: only loaded by DirectorStageModal (lazy)
          if (/[\\/](three|three-stdlib|@react-three|camera-controls)[\\/]/.test(id)) return 'three-vendor';
          // React Flow / xyflow: only Canvas (lazy)
          if (/[\\/](reactflow|@xyflow)[\\/]/.test(id)) return 'flow-vendor';
          // tldraw
          if (/[\\/](tldraw)[\\/]/.test(id)) return 'tldraw-vendor';
          // MUI/emotion together - only some pages use it
          if (/[\\/](@mui|@emotion)[\\/]/.test(id)) return 'mui-vendor';
          // React core + zustand share on every page
          if (/[\\/](react|react-dom|scheduler|use-sync-external-store|zustand)[\\/]/.test(id)) return 'react-vendor';
          return 'vendor';
        },
      },
    },
    chunkSizeWarningLimit: 4096,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5174,
    strictPort: true,
  },
  optimizeDeps: {
    exclude: ['react-markdown', 'remark-gfm', 'remark-parse', 'rehype-sanitize'],
  },
});
