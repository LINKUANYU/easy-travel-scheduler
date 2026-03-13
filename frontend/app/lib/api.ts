export type ApiError = Error & { status?: number; payload?: any };

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
    headers: { "Content-Type": "application/json" },
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
    headers: { "Content-Type": "application/json" },
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
    headers: { "Content-Type": "application/json" },
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
    headers: { "Content-Type": "application/json" },
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
    headers: { "Content-Type": "application/json" },
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