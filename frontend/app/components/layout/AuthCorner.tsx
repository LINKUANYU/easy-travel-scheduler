// app/components/home/AuthCorner.tsx
"use client";

import { useState } from "react";
import Link from "next/link";

export default function AuthCorner() {
  // 暫時用來切換 UI 殼子的狀態，之後再串接真實的 Session
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // 控制 Modal 顯示的是「登入」還是「註冊」
  const [mode, setMode] = useState<"login" | "register">("login");

  // 關閉 Modal 並重置狀態
  const closeModal = () => {
    setIsModalOpen(false);
    setMode("login");
  };

  // --- 已登入狀態 UI ---
  if (isLoggedIn) {
    return (
      <div className="flex justify-end gap-3">
        <Link href="/planner">
          <button className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-bold text-white hover:bg-gray-800 transition">
            我的行程
          </button>
        </Link>
        <button 
          onClick={() => setIsLoggedIn(false)} // 模擬登出
          className="rounded-lg bg-gray-100 border border-gray-300 px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-200 transition"
        >
          會員登出
        </button>
      </div>
    );
  }

  // --- 未登入狀態 UI (包含 Modal) ---
  return (
    <>
      <div className="flex justify-end">
        <button
          onClick={() => setIsModalOpen(true)}
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-bold text-white hover:bg-gray-800 transition"
        >
          會員登入 / 註冊
        </button>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* 背景遮罩 */}
          <div className="absolute inset-0 bg-black/40" onClick={closeModal} />

          {/* Modal 內容 */}
          <div className="relative w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h2 className="text-xl font-bold mb-4">
              {mode === "login" ? "會員登入" : "註冊新帳號"}
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email 信箱
                </label>
                <input
                  type="email"
                  placeholder="example@email.com"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  密碼
                </label>
                <input
                  type="password"
                  placeholder="請輸入密碼"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                />
              </div>

              <button className="w-full rounded-lg bg-blue-600 px-4 py-2 font-bold text-white hover:bg-blue-700 transition">
                {mode === "login" ? "登入" : "註冊"}
              </button>

              <div className="text-center text-sm text-gray-500 mt-4">
                {mode === "login" ? "還沒有帳號嗎？ " : "已經有帳號了？ "}
                <button
                  type="button"
                  onClick={() => setMode(mode === "login" ? "register" : "login")}
                  className="text-blue-600 font-bold hover:underline"
                >
                  {mode === "login" ? "點此註冊" : "點此登入"}
                </button>
              </div>
            </div>
            
            {/* 右上角關閉按鈕 */}
            <button 
              onClick={closeModal}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 text-xl font-bold"
            >
              ×
            </button>
          </div>
        </div>
      )}
    </>
  );
}