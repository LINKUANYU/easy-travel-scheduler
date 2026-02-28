"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
// QueryClient：這是 React Query 的核心，負責管理所有資料的「快取（Cache）」和「發送請求」
// QueryClientProvider：這是一個容器（元件），負責把這個「大腦」的功能分享給全專案。

import { useState } from "react";
// 白話解釋：拿出一塊「記憶空間」。
// 技術含意：這是 React 的基本 Hook。在這裡的作用是為了確保 QueryClient 建立後，會被穩定地存起來，不會因為畫面重新整理就消失

export default function Providers({ children }: { children: React.ReactNode }) {
// 白話解釋：定義一個名為 Providers 的盒子，裡面可以放「小孩」（其他 HTML 或元件）。
// 技術含意：children：這代表被這個盒子「包住」的所有內容。
// React.ReactNode：這是 TypeScript 的寫法，表示 children 可以是任何 React 能顯示的東西（HTML 標籤、文字、其他元件等）。

  const [client] = useState(() => new QueryClient());
  // 白話解釋：親自打造一個專屬的「資料管理員（client）」。
  // 技術含意：我們用 new QueryClient() 創立一個實例。
  // 放在 useState 裡面的原因：確保整個專案生命週期中，這個管理員只會被創建一次。如果直接寫在外面，每次畫面更新都會重新創一個，那之前的資料快取就會全部不見。
  
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  // 白話解釋：把管理員（client）安插到插座（Provider）上，並把所有的「小孩（children）」包進去。
  // 技術含意：// 這是 React 的 Context 模式。
  // 這行執行後，所有在 {children} 裡的元件（例如你的天氣預報頁面、旅遊行程清單），都能透過這條「隱形的線」連結到同一個 client 管理員，共享資料。


}

