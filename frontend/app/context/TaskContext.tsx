"use client";

import { createContext, useContext, useRef, useCallback } from "react";
import { apiGet } from "@/app/lib/api";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";

// 定義這個「廣播電台」會提供什麼服務。這裡說它會提供一個叫 startBackgroundPolling 的函數。
// 需要三個參數：任務id(計時器要去打後端)、地點、失敗的時候執行的函數
type TaskContextType = {
  startBackgroundPolling: (taskId: string, location: string, onTaskFailed?: () => void) => void;
};

// 創造出這個 Context（廣播頻道）。一開始裡面沒有東西（undefined），稍後會在 Provider 裡面把真正的函數放進去。
const TaskContext = createContext<TaskContextType | undefined>(undefined);

// TaskProvider：這是你要包在整個網站最外層的「發射站元件」。{ children } 代表被它包住的所有子網頁。
export function TaskProvider({ children }: { children: React.ReactNode }) {
  // 為什麼不用 useState 來存計時器？因為 useState 只要一改變，整個畫面就會重新渲染（閃爍）。
  // 我們只是想默默記住 setInterval 的號碼牌，以便隨時可以把它關掉（clearInterval），所以用 useRef
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const router = useRouter();

  
  // useCallback 運作原理： 當你用 useCallback 把函數包起來後，React 就會把這個函數「護貝」起來存放在記憶體裡。
  // 下次畫面重新整理時，React 會直接拿上次護貝好的那個函數來用，而不會浪費效能再去創造一個新的。
  const startBackgroundPolling = useCallback((taskId: string, location: string, onTaskFailed?: () => void) => {
    // 確保不會有多個計時器同時跑
    if (pollingRef.current) clearInterval(pollingRef.current);

    pollingRef.current = setInterval(async () => {
      try {
        const statusRes = await apiGet<any>(`/api/search/status/${taskId}`);
        if (statusRes.status === "completed") {
          clearInterval(pollingRef.current!);

          // 任務完成！跳出無限期存在的 Toast，直到使用者點擊
          toast.success((t) => (
            <div className="flex flex-col gap-3 min-w-[200px]">
              
              {/* 上半部：文字與打叉按鈕 */}
              <div className="flex items-start justify-between gap-4">
                <span className="font-bold text-gray-800">🎉「{location}」景點探索完成！</span>
                
                {/* 🌟 關閉 (X) 按鈕 */}
                <button
                  onClick={() => toast.dismiss(t.id)}
                  className="text-gray-400 hover:text-gray-700 transition p-1"
                  aria-label="關閉"
                >
                  ✕
                </button>
              </div>

              {/* 下半部：查看結果按鈕 */}
              <button
                onClick={() => {
                  toast.dismiss(t.id);
                  // 使用者點擊後，瞬間帶他回到結果頁
                  router.push(`/search?location=${location}`);
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-md text-sm font-medium transition shadow-sm"
              >
                點此查看結果
              </button>
            </div>
          ), 
          { 
            duration: Infinity 
          });

        } else if (statusRes.status === "failed") {
          clearInterval(pollingRef.current!);
          toast.error("搜尋失敗，請檢查輸入地點，或稍後再試");
          // 如果畫面有傳入失敗處理函式，就呼叫它來解除畫面的轉圈圈
          if (onTaskFailed) {
            onTaskFailed();
          }
        }
      } catch (e) {
        clearInterval(pollingRef.current!);
      }
    }, 3000);
  }, [router]);

/* 
router 其實已經設計得相對穩定了，不常發生變化。但 React 的檢查工具 (ESLint) 有一個鐵板紀律：「只要你的護貝函數裡面，
用到了從外面拿進來的變數或工具 (例如 router、taskId 等)，你就必須把它寫進監視名單 [] 裡交給 React 列管。」
這是一種防呆機制，確保只要外部工具一有風吹草動，React 就會馬上幫你撕毀舊的護貝，重新拍一張拿到「最新工具」的新照片。

舉例：
假設你的網站有中文版 (/zh/search) 和英文版 (/en/search)。
當使用者剛進來中文版時，你的 TaskProvider 被建立。這時候 useCallback 拍下了一張照片，照片裡的 router 是**「負責處理中文路徑的 Router A」**。
接著，使用者點擊了網站右上角的「切換為 English」。
為了切換語言，Next.js 底層會把整個系統的 router 抽換掉，換成**「負責處理英文路徑的 Router B」**。
如果你的 [] 裡面沒有寫 [router]： 你的護貝函數並不知道外面世界已經變了，它手裡握著的依然是舊照片裡的「Router A」。當任務完成，它執行 router.push('/search') 時，它會強行把你導向「中文版」的頁面，甚至引發程式錯誤！
*/


  return (
    <TaskContext.Provider value={{ startBackgroundPolling }}>
      {children}
    </TaskContext.Provider>
  );
}

// 自訂 Hook。以後任何元件需要啟動背景任務，只要寫 const { startBackgroundPolling } = useTask(); 就能直接使用
export const useTask = () => {
  const context = useContext(TaskContext);
  if (!context) throw new Error("useTask 必須使用在 TaskProvider 內");
  return context;
};