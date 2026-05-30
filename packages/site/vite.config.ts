import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules') || id.includes('/packages/core/src/')) {
            return 'engine'
          }
        },
      },
    },
  },
})
