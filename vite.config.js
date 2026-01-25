import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/rooster-v2/', // Replace 'rooster-v2' with your GitHub repo name
})
