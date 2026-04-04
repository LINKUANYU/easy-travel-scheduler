"use client";

import { createContext, useContext, useRef, useCallback, useEffect } from "react";
import { apiGet } from "@/app/lib/api";
import { useRouter, usePathname } from "next/navigation";
import { useState } from "react";
import Button from "../components/ui/Button";

// 定義這個「廣播電台」會提供什麼服務。這裡說它會提供一個叫 startBackgroundPolling 的函數。
// 需要三個參數：任務id(計時器要去打後端)、地點、失敗的時候執行的函數
type TaskContextType = {
  taskState: TaskState;
  startBackgroundPolling: (taskId: string, location: string, onTaskFailed?: (msg:string) => void) => void;
};

// 創造出這個 Context（廣播頻道）。一開始裡面沒有東西（undefined），稍後會在 Provider 裡面把真正的函數放進去。
const TaskContext = createContext<TaskContextType | undefined>(undefined);

// 定義任務可能的三種狀態：閒置、處理中、成功、失敗
type TaskState = "idle" | "polling" | "success" | "error";

// TaskProvider：這是你要包在整個網站最外層的「發射站元件」。{ children } 代表被它包住的所有子網頁。
export function TaskProvider({ children }: { children: React.ReactNode }) {
  // 為什麼不用 useState 來存計時器？因為 useState 只要一改變，整個畫面就會重新渲染（閃爍）。
  // 我們只是想默默記住 setInterval 的號碼牌，以便隨時可以把它關掉（clearInterval），所以用 useRef
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const router = useRouter();

  // === 新增：用來控制左下角 UI 的狀態 ===
  const [taskState, setTaskState] = useState<TaskState>("idle");
  const [searchLocation, setSearchLocation] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  // 取得目前的網址路徑 (例如: "/search" 或 "/edit")
  const pathname = usePathname();

  // 用 useRef 隨時抄寫最新的路徑。
  // 這樣 setInterval 裡面的程式碼才不會因為「閉包陷阱」而一直記到舊的路徑。
  const currentPathRef = useRef(pathname);
  
  useEffect(() => {
    currentPathRef.current = pathname;
  }, [pathname]);
  
  // useCallback 運作原理： 當你用 useCallback 把函數包起來後，React 就會把這個函數「護貝」起來存放在記憶體裡。
  // 下次畫面重新整理時，React 會直接拿上次護貝好的那個函數來用，而不會浪費效能再去創造一個新的。
  const startBackgroundPolling = useCallback((taskId: string, location: string, onTaskFailed?: (msg:string) => void) => {
    // 確保不會有多個計時器同時跑
    if (pollingRef.current) clearInterval(pollingRef.current);

    // 記錄任務開始的時間
    const pollingStartTime = Date.now();
    // 設定最大容忍時間
    const MAX_TIMEOUT_MS = 1000 * 60 *10;

    // 任務啟動，設定狀態為 polling，展開左下角 UI
    setTaskState("polling");
    setSearchLocation(location);
    setErrorMessage("");

    pollingRef.current = setInterval(async () => {
      // 先檢查任務時間是否超時，是的話直接判斷失敗
      if ((Date.now() - pollingStartTime) > MAX_TIMEOUT_MS) {
        clearInterval(pollingRef.current!);  // 清除計時器
        pollingRef.current = null;  // 清除計時器
        setTaskState("error");  // 設定任務狀態
        setErrorMessage("探索時間過長，伺服器可能過載，請稍後再試。");
        sessionStorage.removeItem(`crawling_task_${location}`);  // 清空紀錄，讓使用者可以重試

        // 如果畫面有傳入失敗處理函式，就呼叫它來解除畫面的轉圈圈
        if (onTaskFailed) onTaskFailed("探索時間過長，伺服器可能過載，請稍後再試。");
        return
      }

      try {
        const statusRes = await apiGet<any>(`/api/search/status/${taskId}`);
        if (statusRes.status === "completed") {
          clearInterval(pollingRef.current!);
          // 任務完成，把「爬蟲中」的記憶擦掉！
          sessionStorage.removeItem(`crawling_task_${location}`);

          // ==========================================
          // UX 分流：判斷使用者現在在哪裡？
          // ==========================================

          if (currentPathRef.current === "/search") {
            // 狀況 A：使用者在 /search 頁面等待
            // toast.success(`🎉 ${location} 景點探索完成！`, { duration: 3000 });
            
            // 自動強制刷新畫面！(帶上時間戳記穿透護城河)
            router.push(`/search?location=${location}&t=${Date.now()}`);
            setTaskState("idle");
          } else {
            // 狀況 B：使用者跑去 /edit 排行程了 (持久型 Toast)
            setTaskState("success");
          }
        } else if (statusRes.status === "failed") {
          clearInterval(pollingRef.current!);
          pollingRef.current = null;
          setTaskState("error");
          setErrorMessage(statusRes.error || "伺服器處理異常");
          sessionStorage.removeItem(`crawling_task_${location}`);

          // 如果畫面有傳入失敗處理函式，就呼叫它來解除畫面的轉圈圈
          if (onTaskFailed) onTaskFailed(statusRes.error);
        }
      } catch (e:any) {
        clearInterval(pollingRef.current!);
        pollingRef.current = null;
        sessionStorage.removeItem(`crawling_task_${location}`);
        setTaskState("error");
        setErrorMessage(e.message || "網路連線發生錯誤");
        if (onTaskFailed) onTaskFailed(e.message);
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
    <TaskContext.Provider value={{ taskState, startBackgroundPolling }}>
      {children}

      {/* ========================================== */}
      {/* 🚀 左下角浮動狀態指示器 (Floating Widget) */}
      {/* ========================================== */}
      {taskState !== "idle" && (
        <div className="fixed bottom-6 left-16 z-[9999] flex flex-col gap-2">
          
          {/* 狀態：搜尋中 (轉圈圈動畫) */}
          {taskState === "polling" && (
            <div className="bg-gray-900 text-white px-4 py-2.5 rounded-full shadow-lg text-sm font-medium flex items-center gap-2 transition-all opacity-90 cursor-default">
              <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              {/* 手機版顯示簡短文字，桌機版顯示完整文字 */}
              <span className="md:hidden">正在探索</span>
              <span className="hidden md:inline">正在探索「{searchLocation}」...</span>
            </div>
          )}

          {/* 狀態：成功 (點擊跳轉) */}
          {taskState === "success" && (
            <Button
              onClick={() => {
                setTaskState("idle"); // 點擊後隱藏按鈕
                router.push(`/search?location=${searchLocation}&t=${Date.now()}`);
              }}
              variant="primary"
              size="md"
            >
              <span className="md:hidden">🎉 搜尋完成</span>
              <span className="hidden md:inline">🎉 搜尋完成！點擊查看</span>
            </Button>
          )}

          {/* 狀態：失敗 (點擊回首頁) */}
          {taskState === "error" && (
            <button
              onClick={() => {
                setTaskState("idle"); // 點擊後隱藏按鈕
                router.push('/');
              }}
              className="bg-red-600 hover:bg-red-500 text-white px-4 py-2.5 rounded-full shadow-xl text-sm font-medium flex items-center gap-2 transition-transform hover:scale-105"
            >
              <span className="md:hidden">失敗，回首頁</span>
              <span className="hidden md:inline">❌ 搜尋失敗，回首頁重試 ({errorMessage})</span>
            </button>
          )}

        </div>
      )}
    </TaskContext.Provider>
  );
}

// 自訂 Hook。以後任何元件需要啟動背景任務，只要寫 const { startBackgroundPolling } = useTask(); 就能直接使用
export const useTask = () => {
  const context = useContext(TaskContext);
  if (!context) throw new Error("useTask 必須使用在 TaskProvider 內");
  return context;
};