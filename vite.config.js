import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    open: true
  },
  preview: {
    host: '0.0.0.0',
    port: 4173
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets'
  }
})
