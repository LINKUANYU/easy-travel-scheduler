import { getTripEditToken } from "./tripIndex";

export type ApiError = Error & { status?: number; payload?: any };

// 自動幫 Header 帶上edit_token的輔助函式
function getAuthHeaders(url: string) {
  const headers: Record<string, string> = { 
    "Content-Type": "application/json" 
  };
  
  // 利用正則表達式抓出 URL 裡面的 trip_id (例如從 /api/trips/42/places 抓出 42)
  const match = url.match(/\/api\/trips\/(\d+)/);
  if (match) {
    const tripId = Number(match[1]);
    const token = getTripEditToken(tripId);  // 找看有沒有edit_token
    
    if (token) {
      // 如果有，就把它塞進 Header (自訂標頭通常以 X- 開頭)
      headers["X-Edit-Token"] = token;
    }
  }
  
  return headers;
}


async function parseJsonSafe(res: Response) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    method: "GET",
    credentials: "include",
    headers: getAuthHeaders(url),
    cache: "no-store",
  });

  const payload = await parseJsonSafe(res);

  if (!res.ok) {
    const err: ApiError = new Error(
      (payload && (payload.detail || payload.message)) || `Request failed: ${res.status}`
    );
    err.status = res.status;
    err.payload = payload;
    throw err;
  }

  return payload as T;
}

export async function apiPost<T>(url: string, body?: any): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: getAuthHeaders(url), // 🌟 替換成動態產生 Header
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const payload = await parseJsonSafe(res);

  if (!res.ok) {
    const err: ApiError = new Error(
      (payload && (payload.detail || payload.message)) || `Request failed: ${res.status}`
    );
    err.status = res.status;
    err.payload = payload;
    throw err;
  }

  return payload as T;
}

export async function apiDelete<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    method: "DELETE",
    credentials: "include",
    headers: getAuthHeaders(url), // 🌟 替換成動態產生 Header
  });

  const payload = await parseJsonSafe(res);

  if (!res.ok) {
    const err: ApiError = new Error(
      (payload && (payload.detail || payload.message)) || `Request failed: ${res.status}`
    );
    err.status = res.status;
    err.payload = payload;
    throw err;
  }

  return payload as T;
}

export async function apiPut<T>(url: string, body?: any): Promise<T> {
  const res = await fetch(url ,{
    method: "PUT",
    headers: getAuthHeaders(url), // 🌟 替換成動態產生 Header
    credentials: "include",
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const payload = await parseJsonSafe(res);

  if (!res.ok) {
    const err: ApiError = new Error(
      (payload && (payload.detail || payload.message)) || `Request failed: ${res.status}`
    );
    err.status = res.status;
    err.payload = payload;
    throw err;
  }
  return payload as T;
}

export async function apiPatch<T>(url: string, body?: any): Promise<T> {
  const res = await fetch(url ,{
    method: "PATCH", 
    headers: getAuthHeaders(url), // 🌟 替換成動態產生 Header
    credentials: "include",
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const payload = await parseJsonSafe(res);

  if (!res.ok) {
    const err: ApiError = new Error(
      (payload && (payload.detail || payload.message)) || `Request failed: ${res.status}`
    );
    err.status = res.status;
    err.payload = payload;
    throw err;
  }
  return payload as T;
}