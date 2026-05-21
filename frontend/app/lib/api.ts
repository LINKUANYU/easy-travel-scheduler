import { z } from "zod";
import { getTripEditToken } from "./tripIndex";

// ─── 型別定義 ────────────────────────────────────────────────────────────────
// 同時是 Error,又額外有 status 和 payload 兩個屬性
export type ApiError = Error & { status?: number; payload?: any };

// apiFetch options 的型別
// S 捕捉傳入 schema 的實際型別，用於條件回傳型別推導
// ApiFetchOptions <S> 意思是呼叫時要塞什麼進來(method 一定要、body 選填、schema 選填...)
type ApiFetchOptions<S extends z.ZodType | undefined = undefined> = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: Record<string, unknown> | unknown[];
  cache?: RequestCache;
  // 選填的 Zod schema；有傳才驗證，沒傳維持舊行為
  schema?: S;
};

// 條件回傳型別：有傳 schema → 自動推導 z.infer<S>；沒傳 → 使用手動指定的 T
// ApiFetchResult<T, S> 告訴你:回傳值會吐什麼出來(根據有沒有傳 schema 決定型別)
type ApiFetchResult<T, S extends z.ZodType | undefined> =
  S extends z.ZodType ? z.infer<S> : T;

// ─── 私有輔助函式 ─────────────────────────────────────────────────────────────

// 依照 URL 中的 trip_id 自動帶上 X-Edit-Token，讓後端識別編輯權限
function getAuthHeaders(url: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  // 正則抓出 /api/trips/{id} 中的數字 id（例如 /api/trips/42/places → 42）
  const match = url.match(/\/api\/trips\/(\d+)/);
  if (match) {
    const tripId = Number(match[1]);
    const token = getTripEditToken(tripId);
    if (token) {
      headers["X-Edit-Token"] = token;
    }
  }

  return headers;
}

// 安全地解析回應 body：空 body → null；非 JSON → 原始字串；JSON → 物件
async function parseJsonSafe(res: Response) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// ─── 核心私有函式 apiFetch ────────────────────────────────────────────────────

// 所有公開 api* 函式的統一底層實作，負責：
//   1. 送出 fetch 請求
//   2. 解析回應 JSON
//   3. 拋出 HTTP 錯誤（4xx / 5xx）
//   4. 若有傳入 schema，驗證 payload 並拋出驗證錯誤
async function apiFetch<T = unknown, S extends z.ZodType | undefined = undefined>(
  url: string,
  options: ApiFetchOptions<S>
): Promise<ApiFetchResult<T, S>> {
  const { method, body, cache, schema } = options;

  const res = await fetch(url, {
    method,
    credentials: "include",
    headers: getAuthHeaders(url),
    body: body === undefined ? undefined : JSON.stringify(body),
    cache,
  });

  const payload = await parseJsonSafe(res);

  // HTTP 錯誤：後端回 4xx / 5xx → 拋出 ApiError
  if (!res.ok) {
    const err: ApiError = new Error(
      (payload && (payload.detail || payload.message)) ||
        `Request failed: ${res.status}`
    );
    err.status = res.status;
    err.payload = payload;
    throw err;
  }

  // Zod 驗證層（選填）：有傳 schema 才執行，失敗時拋出帶 cause: "validation" 的 Error
  // 與 HTTP 錯誤明確區分，呼叫端可用 err.cause 判斷錯誤類型
  if (schema) {
    try {
      // 用型別斷言明確告訴 TS：此處 schema 一定是 z.ZodType，排除 undefined
      return (schema as z.ZodType).parse(payload) as ApiFetchResult<T, S>;
    } catch (zodErr) {
      const err = new Error("API response validation failed", {
        cause: "validation",
      });
      // 把原始 Zod 錯誤掛在 err 上，方便除錯
      (err as any).zodError = zodErr;
      throw err;
    }
  }

  return payload as ApiFetchResult<T, S>;
}

// ─── 公開 API 函式 ────────────────────────────────────────────────────────────

export async function apiGet<T = unknown, S extends z.ZodType | undefined = undefined>(
  url: string,
  options?: { schema?: S }
): Promise<ApiFetchResult<T, S>> {
  return apiFetch<T, S>(url, { method: "GET", cache: "no-store", schema: options?.schema });
}

export async function apiPost<T = unknown, S extends z.ZodType | undefined = undefined>(
  url: string,
  body?: Record<string, unknown> | unknown[],
  options?: { schema?: S }
): Promise<ApiFetchResult<T, S>> {
  return apiFetch<T, S>(url, { method: "POST", body, schema: options?.schema });
}

export async function apiDelete<T = unknown, S extends z.ZodType | undefined = undefined>(
  url: string,
  options?: { schema?: S }
): Promise<ApiFetchResult<T, S>> {
  return apiFetch<T, S>(url, { method: "DELETE", schema: options?.schema });
}

export async function apiPut<T = unknown, S extends z.ZodType | undefined = undefined>(
  url: string,
  body?: Record<string, unknown> | unknown[],
  options?: { schema?: S }
): Promise<ApiFetchResult<T, S>> {
  return apiFetch<T, S>(url, { method: "PUT", body, schema: options?.schema });
}

export async function apiPatch<T = unknown, S extends z.ZodType | undefined = undefined>(
  url: string,
  body?: Record<string, unknown> | unknown[],
  options?: { schema?: S }
): Promise<ApiFetchResult<T, S>> {
  return apiFetch<T, S>(url, { method: "PATCH", body, schema: options?.schema });
}

// ─── 呼叫範例（供參考，不影響執行） ─────────────────────────────────────────

// 情況 A：舊寫法，沒傳 schema，手動指定泛型 T（現有呼叫端無需修改）
//
//   type Trip = { id: number; name: string };
//   const trip = await apiGet<Trip>("/api/trips/42");
//   // 回傳型別：Trip（payload as T，無驗證）

// 情況 B：新寫法，傳入 schema，型別由 Zod 自動推導，無需手動指定泛型
//
//   const TripSchema = z.object({ id: z.number(), name: z.string() });
//   const trip = await apiGet("/api/trips/42", { schema: TripSchema });
//   // 回傳型別：{ id: number; name: string }（由 z.infer<typeof TripSchema> 自動推導）
//   // 若後端回傳格式不符，會拋出 cause: "validation" 的 Error
