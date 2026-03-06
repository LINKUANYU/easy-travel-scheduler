import type { NextConfig } from "next";

const nextConfig: NextConfig = {
async rewrites() {
    return [
      {
        // 當你前端呼叫 /api/search 時
        source: "/api/:path*",
        // 轉發到本地後端 8000 Port
        destination: "http://localhost:8000/api/:path*",
      },
    ];
  },
};

export default nextConfig;

// 在 EC2 的生產環境中，通常的架構是這樣的：
// 外界請求： 使用者訪問 https://your-domain.com/api/search。
// 第一線 (Nginx)： Nginx 會先收到請求。在你的 Nginx 設定（location /api/）中，你已經設定將 /api 轉發到後端（例如 Port 8000）。
// 直接轉發： 請求在到達 Next.js 之前，就已經被 Nginx 攔截並送往後端了。
// 換句話說，Next.js 的 rewrites 在生產環境中根本「沒機會」執行，因為 Nginx 已經先處理掉了。