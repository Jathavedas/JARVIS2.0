import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    headers: {
      'Permissions-Policy': 'microphone=(self), speaker=(self), geolocation=(), camera=()'
    }
  }
})
