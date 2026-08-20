import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import generouted from '@generouted/react-router/plugin'
import { cloudflare } from '@cloudflare/vite-plugin'
import { deepspaceBuild } from 'deepspace/build'

export default defineConfig({
  // deepspaceBuild() owns the build-time wiring the SDK is responsible for:
  // the app-id define, the client dedupe list (react / react-dom / better-auth),
  // and deleting the plaintext preview `.dev.vars` the Cloudflare plugin drops
  // beside the built worker. It runs last so that cleanup follows cloudflare().
  plugins: [
    react(),
    generouted(),
    cloudflare(),
    deepspaceBuild({ appDir: fileURLToPath(new URL('.', import.meta.url)) }),
  ],
})
