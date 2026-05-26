# frontend/Dockerfile
FROM node:20-alpine

# 設定工作目錄
WORKDIR /app

# 複製 package.json 和 package-lock.json
COPY package*.json ./

# 安裝套件
RUN npm install

# 複製所有前端程式碼
COPY . .

# 宣告 build argument，讓 docker-compose 可以在 build 時期傳入
# NEXT_PUBLIC_* 必須在這個階段設定，否則值無法燒進 JS bundle
ARG NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
ENV NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=$NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

# 編譯 Next.js 專案 (變成 Production Ready 的靜態與優化檔案)
RUN npm run build

# 啟動 Next.js 伺服器
CMD ["npm", "start"]