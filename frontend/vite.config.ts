import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    host: true,
    watch: {
      // Bind-mounted source on Windows/Docker Desktop doesn't reliably
      // deliver inotify events into the container, so fall back to polling.
      usePolling: true,
      interval: 300,
    },
  },
})
