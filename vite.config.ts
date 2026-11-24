import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      // popup.html: redirect page for pop-up sign-in inside the HLWT Hub.
      input: { main: resolve(__dirname, 'index.html'), popup: resolve(__dirname, 'popup.html') },
    },
  },
})
