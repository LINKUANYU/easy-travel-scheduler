// app/components/home/AuthCorner.tsx
"use client";

import { useAuth } from "@/app/context/AuthContext";
import Link from "next/link";
import { useState, useEffect } from "react";
import { apiPost, apiPatch } from "@/app/lib/api";
import { readTripIndex, clearTripIndex } from "@/app/lib/tripIndex";
import { useTripDraft } from "@/app/hooks/useTripDraft";
import toast from "react-hot-toast";
import Button from "../ui/Button";
import { motion, AnimatePresence } from "framer-motion"; // 引入動畫元件
import { createPortal } from "react-dom";


const TEST_EMAIL = "test@mail.com";
const TEST_PASSWORD = "12345678";

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

  const [isMenuOpen, setIsMenuOpen] = useState(false); // 控制手機版選單開關
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

  const submitLogin = async (emailVal: string, passwordVal: string) => {
    setErrorMsg("");
    setIsSubmitting(true);

    const endpoint = authMode === "login" ? "/api/login" : "/api/signup";
    const payload = authMode === "login"
      ? { email: emailVal, password: passwordVal }
      : { email: emailVal, password: passwordVal, name };

    try {
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
          clearTripIndex();
          toast.success(`太棒了！您的行程已經儲存於帳號中囉！`);
        } catch (bindErr) {
          console.error("行程綁定失敗:", bindErr);
          // 不阻斷流程，因為使用者已經成功登入了
        }
      }

      // 清空表單
      setEmail("");
      setPassword("");
      setName("");
    } catch (err: any) {
      setErrorMsg(err.message || "發生錯誤，請檢查網路連線");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitLogin(email, password);
  };

  const handleFillDemo = () => {
    setEmail(TEST_EMAIL);
    setPassword(TEST_PASSWORD);
    setTimeout(() => submitLogin(TEST_EMAIL, TEST_PASSWORD), 300);
  };

  const { clear, clearActiveTrip } = useTripDraft();
  
  const handleFullLogout = async () => {
    // 1. 執行原有的 Context logout (清空 Cookie, 重製 user 狀態)
    await logout(); 

    // 2. 徹底洗淨所有 LocalStorage 狀態
    clearTripIndex(); // 清除影子帳號憑證 (雙重保險)
    clear(); // 清除景點草稿 (購物車)
    if (clearActiveTrip) clearActiveTrip(); // 清除當前編輯狀態
    
    // 3. 導向首頁，確保畫面狀態重置
    window.location.href = "/"; 
  };

  // --- 防止閃爍：載入中不顯示任何按鈕 ---
  if (isLoading) return <div className="w-20 h-8"></div>;


  return (
    <div className="relative">
      {/* --- 1. 桌機版 UI (md 以上顯示) --- */}
      <div className="hidden min-[1100px]:flex items-center gap-4">
        {user ? (
          <>
            <span className="text-sm font-medium text-gray-600">哈囉，{user.name}</span>
            <Link href="/dashboard">
              <Button variant="primary" size="md">我的行程</Button>
            </Link>
            <Button onClick={handleFullLogout} variant="secondary" size="md">登出</Button>
          </>
        ) : (
          <>
            <Button onClick={() => openAuthModal("login")} variant="secondary">登入</Button>
            <Button onClick={() => openAuthModal("register")} variant="primary">註冊</Button>
          </>
        )}
      </div>

      {/* --- 2. 手機版漢堡按鈕 (md 以下顯示) --- */}
      <div className="flex min-[1100px]:hidden items-center">
        <button 
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className="p-2 text-2xl text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
        >
          {isMenuOpen ? "✕" : "☰"}
        </button>
      </div>

      {/* --- 3. 手機版下拉直列清單 --- */}
      <AnimatePresence>
        {isMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute top-full right-0 mt-3 w-36 bg-white rounded-2xl shadow-xl border border-gray-100 p-4 z-[110] flex flex-col gap-4"
          >
            {user ? (
              <>
                <Link 
                  href="/dashboard" 
                  className="text-gray-600 hover:text-blue-600 font-medium px-2 text-center"
                  onClick={() => setIsMenuOpen(false)}
                >
                  我的行程
                </Link>
                <button 
                  onClick={() => { handleFullLogout(); setIsMenuOpen(false); }}
                  className="text-red-500 font-medium px-2 text-center"
                >
                  登出
                </button>
              </>
            ) : (
              <>
                <button 
                  onClick={() => { openAuthModal("login"); setIsMenuOpen(false); }}
                  className="text-gray-600 hover:text-blue-600 font-medium px-2 text-center"
                >
                  登入
                </button>
                <button 
                  onClick={() => { openAuthModal("register"); setIsMenuOpen(false); }}
                  className="text-gray-600 hover:text-blue-600 font-medium px-2 text-center"
                >
                  註冊
                </button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 判斷：只有在瀏覽器端 (document 存在) 且 Modal 開啟時，才使用 createPortal 渲染到 body */}
      {isModalOpen && typeof document !== "undefined" && createPortal(
      // 1. 在最外層背景加上 onClick 觸發關閉
      // 如果正在處理登入中 (isSubmitting)，可以判斷是否允許點擊關閉
      <div 
        className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm"
        onClick={isSubmitting ? undefined : closeAuthModal} 
      >
        {/* 2. 在中間的白色卡片加上 e.stopPropagation() */}
        {/* 這樣點擊卡片內部（輸入框、按鈕）時，點擊事件就不會傳遞到外層的背景圖層 */}
        <div 
          className="relative w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl mx-4"
          onClick={(e) => e.stopPropagation()} 
        >
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

              {authMode === "login" && (
                <button
                  type="button"
                  onClick={handleFillDemo}
                  disabled={isSubmitting}
                  className="w-full rounded-lg border border-blue-300 px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 transition disabled:opacity-40"
                >
                  使用測試帳號
                </button>
              )}
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
        </div>,
        document.body // 這是 createPortal 的第二個參數，指定要掛載到哪個 DOM 節點
      )}
    </div>
  );
}