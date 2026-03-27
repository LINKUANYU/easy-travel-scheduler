"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
// QueryClient：這是 React Query 的核心，負責管理所有資料的「快取（Cache）」和「發送請求」
// QueryClientProvider：這是一個容器（元件），負責把這個「大腦」的功能分享給全專案。

import { useState } from "react";
// 白話解釋：拿出一塊「記憶空間」。
// 技術含意：這是 React 的基本 Hook。在這裡的作用是為了確保 QueryClient 建立後，會被穩定地存起來，不會因為畫面重新整理就消失

import { Toaster } from "react-hot-toast";

import { PersistQueryClientProvider, type Persister } from "@tanstack/react-query-persist-client";
// 引入持久化專用的 Provider

const CACHE_KEY = "TRIP_QUERY_CACHE";
// 自訂一個快取的 Key 名稱

export default function Providers({ children }: { children: React.ReactNode }) {
// 白話解釋：定義一個名為 Providers 的盒子，裡面可以放「小孩」（其他 HTML 或元件）。
// 技術含意：children：這代表被這個盒子「包住」的所有內容。
// React.ReactNode：這是 TypeScript 的寫法，表示 children 可以是任何 React 能顯示的東西（HTML 標籤、文字、其他元件等）。

  // 1. 初始化 QueryClient (API 狀態管理大腦)
  // 使用 useState 確保 client 實例在元件生命週期內是唯一的，避免重新渲染時遺失快取
const [client] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60 * 60, // 1 小時內視為新鮮資料，不重複發送 API 請求
        gcTime: 1000 * 60 * 60 * 2, // 2 小時後若未使用，則從記憶體中清除 (Garbage Collection)
        retry: 1, // API 請求失敗時，預設自動重試 1 次
      },
    },
  }));

  // 2. 建立自訂的 Persister (持久化工具)
  // 負責將 React Query 的快取同步到瀏覽器的 sessionStorage 中
  const [persister] = useState<Persister>(() => ({
    // 寫入快取：將資料存入 sessionStorage
    persistClient: (cacheData) => {
      // 確保在瀏覽器環境下執行，避免 SSR 報錯
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
      }
    },
    // 讀取快取：網頁重新整理時，從 sessionStorage 把資料救回來
    restoreClient: () => {
      if (typeof window === "undefined") return undefined;
      const cache = window.sessionStorage.getItem(CACHE_KEY);
      if (!cache) return undefined;
      
      try {
        return JSON.parse(cache);
      } catch (e) {
        // 如果 JSON 壞了，就當作沒快取，避免前端大當機
        window.sessionStorage.removeItem(CACHE_KEY);
        return undefined;
      }
    },
    // 清除快取：當需要手動清除時調用
    removeClient: () => {
      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem(CACHE_KEY);
      }
    },
  }));
  
  return ( 
    // 3. 使用 PersistQueryClientProvider 將設定好的大腦與持久化工具提供給全域
    <PersistQueryClientProvider 
      client={client}
      persistOptions={{ 
        persister,
        // 設定快取的最大保存期限為 24 小時
        maxAge: 1000 * 60 * 60 * 24, 
      }}
    >
      {children}
      <Toaster 
        position="top-center" 
        toastOptions={{
          // 這裡可以做一些全域的預設樣式設定
          duration: 4000, // 預設 4 秒後消失
          style: {
            background: '#333',
            color: '#fff',
            fontSize: '14px',
          },
        }} 
      />
    </PersistQueryClientProvider>
  );

}

