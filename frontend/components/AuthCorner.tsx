"use client";

import { useEffect, useMemo, useState } from "react";
import type { SubmitEventHandler } from "react";

type Mode = "login" | "signup";

type User = {
  id: number;
  email: string;
  name: string;
};

type LogoutRes = { ok: true };

const API_BASE = "http://localhost:8000";

async function apiRequest<T>(  //所以你 return payload as T; 就是把回來的 JSON 當作 T 回傳
  method: "GET" | "POST",
  path: string,
  body?: unknown
): Promise<T> {
  const hasBody = method === "POST" && body !== undefined;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: hasBody ? { "content-type": "application/json" } : undefined,
    credentials: "include", // session cookie 必備
    body: hasBody ? JSON.stringify(body) : undefined,
  });

  let payload: any = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;  // 若真的不是 JSON（例如 502 HTML），避免直接爆掉
  }

  if (!res.ok) {
    // FastAPI: { detail: "..." } 或 detail: [...] (422)
    let msg = "Request failed";
    const detail = payload?.detail;

    if (typeof detail === "string") msg = detail;
    else if (Array.isArray(detail) && detail.length > 0) msg = detail[0]?.msg || msg;
    else if (typeof payload?.message === "string") msg = payload.message;

    const err = new Error(msg) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }

  return payload as T
}

// 定義兩個函式在呼叫時不用寫"GET" "POST"
function apiGet<T>(path: string) {
  return apiRequest<T>("GET", path);
}

function apiPost<T>(path: string, body?: unknown) {
  return apiRequest<T>("POST", path, body);
}

export default function AuthCorner() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("login");
  const [user, setUser] = useState<User | null>(null);

  // 表單狀態
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // UI 狀態
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const title = useMemo(() => (mode === "login" ? "登入" : "註冊"), [mode]);

  const resetForm = () => {
    setName("");
    setEmail("");
    setPassword("");
    setErrorMsg("");
  };

  const close = () => {
    setOpen(false);
    resetForm();
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    resetForm();
  };

useEffect(() => {
  async function loadMe() {
    try {
      const me = await apiGet<User>("/api/me");
      setUser(me);
    } catch (err:any) {
      if (err?.status === 401) return; // 未登入是正常狀態
      console.error(err);
    }
  }

  loadMe();
}, []);

const handleSubmit: SubmitEventHandler<HTMLFormElement> = async (e) => {
  e.preventDefault();
  setErrorMsg("");
  setSubmitting(true);

  try{
    const trimemail = email.trim();

    if (mode === "signup"){
      // 註冊，只建立User，不建立session
      await apiPost<User>("/api/signup", {
        name: name.trim(),
        email: trimemail,
        password,
      });
      // 立刻登入
      const loggedIn = await apiPost<User>("/api/login", {
        email: trimemail,
        password
      });
      
      setUser(loggedIn);
      close();
      return;
    }
    
    // 登入
    const loggedIn = await apiPost<User>("/api/login", {
      email: trimemail,
      password
    });
    setUser(loggedIn);
    close();
    return;
  } catch (err:any){
    setErrorMsg(err?.message || "登入/註冊失敗")
  } finally {
    setSubmitting(false);
  }
};

  const handleLogout = async () => {
    setErrorMsg("");
    setSubmitting(true);

    try {
      const out = await apiPost<LogoutRes>("/api/logout");
      if (out?.ok) setUser(null);
    } catch (err:any){
      setErrorMsg(err?.message || "登出失敗")
      setOpen(true); // 打開 modal 顯示錯誤
    } finally {
      setSubmitting(false)
    }
  };


  return (
    <>
      {/* 右上角 */}
      <div className="absolute top-6 right-6 z-50">
        {user ? (
          <div className="flex items-center gap-2">
            <div className="hidden sm:block text-sm text-gray-700">
              Hi, <span className="font-semibold">{user.name}</span>
            </div>
            <button
              onClick={handleLogout}
              disabled={submitting}
              className="rounded-md bg-gray-900 px-3 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-60"
            >
              {submitting ? "處理中..." : "登出"}
            </button>
          </div>
        ) : (
          <button
            onClick={() => setOpen(true)}
            className="rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-500"
          >
            登入 / 註冊
          </button>
        )}
      </div>

      {/* Modal */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900">{title}</h2>
                <p className="mt-1 text-sm text-gray-600">
                  API：{API_BASE}
                </p>
              </div>
              <button
                onClick={close}
                className="rounded-md px-2 py-1 text-gray-500 hover:bg-gray-100"
                aria-label="close"
              >
                ✕
              </button>
            </div>

            {/* Tabs */}
            <div className="mt-4 grid grid-cols-2 gap-2 rounded-lg bg-gray-100 p-1">
              <button
                onClick={() => switchMode("login")}
                className={`rounded-md py-2 text-sm font-semibold ${
                  mode === "login" ? "bg-white shadow" : "text-gray-600"
                }`}
              >
                登入
              </button>
              <button
                onClick={() => switchMode("signup")}
                className={`rounded-md py-2 text-sm font-semibold ${
                  mode === "signup" ? "bg-white shadow" : "text-gray-600"
                }`}
              >
                註冊
              </button>
            </div>

            {errorMsg && (
              <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-4 space-y-3">
              {mode === "signup" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700">名稱</label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 outline-none focus:border-blue-500"
                    placeholder="你的名字"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700">Email</label>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  required
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 outline-none focus:border-blue-500"
                  placeholder="you@example.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">密碼</label>
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  required
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 outline-none focus:border-blue-500"
                  placeholder="至少 8 碼"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="mt-2 w-full rounded-md bg-blue-600 py-2 font-semibold text-white hover:bg-blue-500 disabled:opacity-60"
              >
                {submitting ? "處理中..." : mode === "login" ? "登入" : "建立帳號"}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}