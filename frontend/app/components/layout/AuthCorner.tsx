// app/components/home/AuthCorner.tsx
"use client";

import { useAuth } from "@/app/context/AuthContext";
import Link from "next/link";
import { useState } from "react";
import { apiPost, apiPatch } from "@/app/lib/api";
import { readTripIndex } from "@/app/lib/tripIndex";


export default function AuthCorner() {
  const { 
    user, 
    isLoading,
    isModalOpen, 
    authMode, 
    openAuthModal, 
    closeAuthModal, 
    checkAuth,
    logout 
  } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const toggleMode = () => {
    openAuthModal(authMode === "login" ? "register" : "login");
    setErrorMsg("");
    setPassword("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setIsSubmitting(true);

    const endpoint = authMode === "login" ? "/api/login" : "/api/signup";
    const payload = authMode === "login" ? { email, password } : { email, password, name };

    try {
      // 執行登入或註冊，只需要這一行！因為你的 api.ts 已經把 error 拋出來了
      await apiPost(endpoint, payload);
      
      // 2. 更新全域使用者狀態
      await checkAuth();  // 打 api/me
      closeAuthModal();

      // 3. 利用 tripIndex 進行多重影子帳號認領
      const localTrips = readTripIndex(); // 讀取 LocalStorage 中的所有匿名行程
      
      if (localTrips.length > 0) {
        try {
          // 使用 Promise.all 同時發送所有認領請求
          await Promise.all(
            localTrips.map(trip => apiPatch(`/api/trips/${trip.trip_id}/bind`))
          );
          
          // 認領成功後，清空 LocalStorage 中的暫存紀錄，因為已經正式存入雲端帳號了
          // (對應你 tripIndex.ts 裡面設定的 KEY)
          localStorage.removeItem("easy_travel_trip_index_v1"); 
          
          alert(`成功將 ${localTrips.length} 個行程保存至您的帳號！`); 
        } catch (bindErr) {
          console.error("部分或全部行程綁定失敗:", bindErr);
          // 不阻斷流程，因為使用者已經成功登入了
        }
      }
      
      // 清空表單
      setEmail("");
      setPassword("");
      setName("");

    } catch (err: any) {
      // 你的 api.ts 已經把後端的 detail 塞進 err.message 裡了
      setErrorMsg(err.message || "發生錯誤，請檢查網路連線");
    } finally {
      setIsSubmitting(false);
    }
  };
// --- 防止閃爍：載入中不顯示任何按鈕 ---
  if (isLoading) return <div className="w-20 h-8"></div>;

  // --- 已登入狀態 UI ---
  if (user) {
    return (
      <div className="flex items-center gap-4">
        <span className="text-sm font-medium text-gray-600">
          哈囉，{user.name}
        </span>
        <div className="flex justify-end gap-3">
          <Link href="/planner">
            <button className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-bold text-white hover:bg-gray-800 transition">
              我的行程
            </button>
          </Link>
          <button 
            onClick={logout}
            className="rounded-lg bg-gray-100 border border-gray-300 px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-200 transition"
          >
            登出
          </button>
        </div>
      </div>
    );
  }

  // --- 未登入狀態 UI (包含 Modal) ---
  return (
    <>
      <div className="flex justify-end gap-3">
        <button 
          onClick={() => openAuthModal("login")}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50 transition"
        >
          登入
        </button>
        <button 
          onClick={() => openAuthModal("register")} 
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 transition"
        >
          註冊
        </button>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="relative w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
            <h2 className="text-2xl font-black text-gray-900 mb-6 text-center">
              {authMode === "login" ? "歡迎回來" : "建立新帳號"}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* 錯誤訊息提示區 */}
              {errorMsg && (
                <div className="p-3 text-sm text-red-600 bg-red-50 rounded-lg border border-red-200">
                  {errorMsg}
                </div>
              )}

              {/* 註冊模式才顯示姓名欄位 */}
              {authMode === "register" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    稱呼 (Name)
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="怎麼稱呼您？"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email 信箱
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="example@email.com"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  密碼
                </label>
                <input
                  type="password"
                  required
                  minLength={8} // 配合 schema.py 的長度限制
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="請輸入至少 8 碼密碼"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <button 
                type="submit"
                disabled={isSubmitting}
                className="w-full rounded-lg bg-blue-600 px-4 py-3 mt-4 font-bold text-white hover:bg-blue-700 transition disabled:bg-blue-300"
              >
                {isSubmitting ? "處理中..." : (authMode === "login" ? "登入" : "註冊")}
              </button>
            </form>

            <div className="text-center text-sm text-gray-500 mt-6">
              {authMode === "login" ? "還沒有帳號嗎？ " : "已經有帳號了？ "}
              <button
                type="button"
                onClick={toggleMode}
                className="text-blue-600 font-bold hover:underline"
              >
                {authMode === "login" ? "點此註冊" : "點此登入"}
              </button>
            </div>
            
            <button 
              onClick={closeAuthModal}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 text-xl"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </>
  );
}