import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [preact()],
  // Marken serves the client bundle from /static/, so emit absolute URLs that
  // Chrome's preload scanner resolves correctly (relative imports otherwise
  // get pre-scanned against the document base and 404 before the runtime
  // recovers).
  base: '/static/',
  build: {
    outDir: 'dist/static',
    emptyOutDir: false,
    target: 'es2020',
    cssCodeSplit: false,
    sourcemap: false,
    rollupOptions: {
      input: {
        client: resolve(__dirname, 'src/client/main.tsx'),
      },
      output: {
        entryFileNames: 'client.js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: (info) => {
          if (info.name?.endsWith('.css')) return 'app.css'
          return 'assets/[name]-[hash][extname]'
        },
      },
    },
  },
  esbuild: {
    legalComments: 'none',
  },
})
