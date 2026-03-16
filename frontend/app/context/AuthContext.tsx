"use client";

import { createContext, useContext, useState, ReactNode, useEffect } from "react";
import { apiGet, apiPost } from "../lib/api";


export interface User {
  id: number;
  email: string;
  name: string;
}

// 定義 Context 的資料結構
interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isModalOpen: boolean;
  authMode: "login" | "register";
  openAuthModal: (mode?: "login" | "register") => void;
  closeAuthModal: () => void;
  checkAuth: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true); // 初始載入中狀態
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");

  const openAuthModal = (mode: "login" | "register" = "login") => {
    setAuthMode(mode);
    setIsModalOpen(true);
  };

  const closeAuthModal = () => {
    setIsModalOpen(false);
  };

  // 1. 檢查登入狀態 (使用 apiGet)
  const checkAuth = async () => {
    try {
      // apiGet 已經內建 credentials: "include"
      const data = await apiGet<User>("/api/me");
      setUser(data);
    } catch (error) {
      // 若後端回傳 401 (未登入)，apiGet 會 throw error 跑到這裡
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  // 2. 登出 (使用 apiPost)
  const logout = async () => {
    try {
      await apiPost("/api/logout");
      setUser(null);
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);



  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isModalOpen,
        authMode,
        openAuthModal,
        closeAuthModal,
        checkAuth,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// 建立一個 Custom Hook 方便其他元件呼叫
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}