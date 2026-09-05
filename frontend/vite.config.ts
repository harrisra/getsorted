import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Local-dev fallback for the build-SHA badge (see src/api/client.ts's
// GIT_SHA): CI passes VITE_GIT_SHA in as a real build-arg for deployed
// builds (see Dockerfile, .github/workflows/ci.yml), but `docker compose up`
// runs the Vite dev server straight from bind-mounted source with no build
// step to pass a build-arg into — so read it directly from git instead,
// using the repo's .git that docker-compose.yml bind-mounts in read-only.
// Silently left unset if that's not available (e.g. git isn't installed, or
// running outside Docker without .git nearby) — client.ts treats that as no
// badge, same as any other blank env var.
if (!process.env.VITE_GIT_SHA) {
  try {
    process.env.VITE_GIT_SHA = execSync('git rev-parse --short HEAD', {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim()
  } catch {
    // no .git here / git not installed — leave unset
  }
}

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
