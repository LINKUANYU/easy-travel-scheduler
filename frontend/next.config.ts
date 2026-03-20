import type { NextConfig } from "next";

const nextConfig: NextConfig = {
async rewrites() {
  // 讀取環境變數，如果沒設定，預設就退回到 docker 內部的名稱
  const apiBaseUrl = process.env.API_BASE_URL || "http://backend:8000";

    return [
      {
        // 當你前端呼叫 /api/search 時
        source: "/api/:path*",
        // 轉發到本地後端 8000 Port
        destination: `${apiBaseUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;

// 在本機開發時： 因為你沒有開 Nginx，所以由 Next.js 的伺服器兼職當總機，幫你把 /api 轉發給 localhost:8000。
// 在 EC2 上線時： Nginx 身為真正的總機，站在最前線就把 /api/ 攔截走並送給 FastAPI 了，根本不會輪到 Next.js 來處理轉發。

// 在 EC2 的生產環境中，通常的架構是這樣的：
// 外界請求： 使用者訪問 https://your-domain.com/api/search。
// 第一線 (Nginx)： Nginx 會先收到請求。在你的 Nginx 設定（location /api/）中，你已經設定將 /api 轉發到後端（例如 Port 8000）。
// 直接轉發： 請求在到達 Next.js 之前，就已經被 Nginx 攔截並送往後端了。
// 換句話說，Next.js 的 rewrites 在生產環境中根本「沒機會」執行，因為 Nginx 已經先處理掉了。