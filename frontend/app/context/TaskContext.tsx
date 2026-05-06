"use client";

import { createContext, useContext, useRef, useCallback, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useState } from "react";
import Button from "../components/ui/Button";

// 定義這個「廣播電台」會提供什麼服務。
// startSSEConnection 取代舊版的 startBackgroundPolling，對外介面保持相同簽名，呼叫端不需要改
type TaskContextType = {
  taskState: TaskState;
  startBackgroundPolling: (taskId: string, location: string, onTaskFailed?: (msg: string) => void) => void;
};

const TaskContext = createContext<TaskContextType | undefined>(undefined);

// 定義任務可能的四種狀態：閒置、輪詢中、成功、失敗
type TaskState = "idle" | "polling" | "success" | "error";

export function TaskProvider({ children }: { children: React.ReactNode }) {

  // ── 用 useRef 儲存 EventSource 物件 ────────────────────────────────
  // 仿照舊版存 setInterval 的邏輯（pollingRef），現在改存 EventSource 連線物件
  // 使用 useRef 而非 useState 的原因：我們只需要「記住它以便關閉」，不需要觸發重新渲染
  const eventSourceRef = useRef<EventSource | null>(null);

  const router = useRouter();

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

  // ── 清除函式，關閉 SSE 連線並清空 ref ─────────────────────────────
  // 抽成獨立函式，避免在多個地方重複寫 close 邏輯
  const closeSSE = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  // ── 頁面卸載時自動清除，防止記憶體洩漏 ────────────────────────────
  useEffect(() => {
    return () => {
      closeSSE();
    };
  }, [closeSSE]);

  // ── 核心函式，建立 SSE 連線，監聽任務進度 ──────────────────────────
  // 函數名稱對外維持 startBackgroundPolling，讓所有呼叫端（search/page.tsx 等）不需要改
  const startBackgroundPolling = useCallback(
    (taskId: string, location: string, onTaskFailed?: (msg: string) => void) => {

      // 確保不會有多條 SSE 連線同時存在（對應舊版的 clearInterval）
      closeSSE();

      // 任務啟動，更新左下角 UI 狀態
      setTaskState("polling");
      setSearchLocation(location);
      setErrorMessage("");

      // ── 建立 SSE 連線 ────────────────────────────────────────────────
      // 瀏覽器會自動發送 GET 請求並保持連線，等待伺服器推送訊息
      const es = new EventSource(`/api/search/stream/${taskId}`);
      eventSourceRef.current = es;

      // ── 收到伺服器推送的訊息 ─────────────────────────────────────────
      // 每次後端 generator yield 一個值，這裡就會觸發一次
      es.onmessage = (event: MessageEvent) => {
        let data: { status: string; error?: string };

        // 安全解析 JSON，避免格式異常導致整個 callback 崩潰
        try {
          data = JSON.parse(event.data);
        } catch {
          console.error("[SSE] 無法解析訊息：", event.data);
          return;
        }

        if (data.status === "completed") {
          // 任務完成，關閉連線，更新狀態
          closeSSE();
          sessionStorage.removeItem(`crawling_task_${location}`);
          setTaskState("success");

          // ── 判斷使用者現在在哪個頁面，決定如何處理（邏輯與舊版完全相同）──
          const currentPath = currentPathRef.current;

          if (currentPath.startsWith("/search")) {
            // 在搜尋頁，直接強制重新載入，帶上時間戳確保不走快取
            router.push(`/search?location=${location}&t=${Date.now()}`);
          }
          // 不在搜尋頁（例如在 /edit），只更新左下角狀態為 success，等使用者點擊

        } else if (data.status === "failed") {
          // 任務失敗，關閉連線，更新狀態
          closeSSE();
          sessionStorage.removeItem(`crawling_task_${location}`);
          setTaskState("error");
          const errMsg = data.error || "爬蟲任務失敗，請稍後再試。";
          setErrorMessage(errMsg);
          if (onTaskFailed) onTaskFailed(errMsg);

        } else if (data.status === "timeout") {
          // 逾時（後端等了 10 分鐘沒有結果），視為失敗處理
          closeSSE();
          sessionStorage.removeItem(`crawling_task_${location}`);
          setTaskState("error");
          const errMsg = "探索時間過長，伺服器可能過載，請稍後再試。";
          setErrorMessage(errMsg);
          if (onTaskFailed) onTaskFailed(errMsg);
        }
      };

      // ── 連線發生錯誤 ─────────────────────────────────────────────────
      // 時機：網路中斷、後端重啟、或後端回傳非 200 的狀態碼
      // 注意：EventSource 預設會「自動重連」，onerror 不代表連線永久中斷
      // 但在這個場景（等待爬蟲完成），我們不需要重連，直接視為失敗
      es.onerror = () => {
        // 避免對已經主動關閉的連線再次處理
        if (!eventSourceRef.current) return;

        console.error("[SSE] 連線發生錯誤，task_id:", taskId);
        closeSSE();
        sessionStorage.removeItem(`crawling_task_${location}`);
        setTaskState("error");
        const errMsg = "連線發生錯誤，請稍後再試。";
        setErrorMessage(errMsg);
        if (onTaskFailed) onTaskFailed(errMsg);
      };
    },
    [closeSSE, router]
  );

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

      {/* 左下角浮動狀態指示器，與舊版相同，邏輯未改 */}
      {taskState !== "idle" && (
        <div className="fixed bottom-4 left-4 md:bottom-6 left-16 z-[9999] flex flex-col gap-2">

          {/* 狀態：搜尋中 */}
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
                setTaskState("idle");
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
                setTaskState("idle");
                router.push("/");
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
