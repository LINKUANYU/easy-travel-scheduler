import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // 只要請求開頭是 /api，就觸發代理
      '/api': {
        target: 'http://localhost:8000', // 👈 這裡改成你本地後端跑的 Port (例如 5000 或 8080)
        changeOrigin: true,
        // 因為你後端本身就有 /api，所以這裡「不需要」rewrite
        secure: false, 
      }
    }
  }
})