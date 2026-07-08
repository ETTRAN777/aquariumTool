import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// Base path matches the GitHub Pages repo name. Update if you rename the repo.
export default defineConfig({
  plugins: [react()],
  base: '/shrimp-tank-tracker/',
})
