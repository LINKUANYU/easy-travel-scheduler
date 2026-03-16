"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { upsertTripIndex } from "@/app/lib/tripIndex"
import { useAuth } from "@/app/context/AuthContext"
import { apiPost } from "@/app/lib/api"
import { useTripDraft } from "@/app/hooks/useTripDraft"


type CreateTripRes = { trip_id: number, edit_token: string} 

export default function StartPlanningButton(){
  const router = useRouter();
  const { user } = useAuth(); // 取得當前登入狀態

  const { draft, clear, activeTripId, setActiveTripId, clearActiveTrip } = useTripDraft();

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [days, setDays] = useState<number>(5);
  const [startDate, setStartDate] = useState<string>(""); // "YYYY-MM-DD" or ""
  const [submitting, setSubmitting] = useState(false);
  const [errMsg, setErrMsg] = useState<string>("");

  const draftCount = draft.length;

  // 去重(以防萬一) 如果沒景點，這裡就是空陣列 []
  const placeIds = useMemo(() => {
    const set = new Set<string>(); // 建立資料結構set
    for (const p of draft){
      if (p.google_place_id) set.add(p.google_place_id);
    }
    return Array.from(set);  // 把set轉成陣列
  }, [draft]);

  // const canOpen = draftCount > 0;

  const close = () => {
    setOpen(false);
    setErrMsg("");
  };

  // 以台灣時區為今天時間
  const todayStr = new Intl.DateTimeFormat('fr-CA').format(new Date());

  // ==========================================
  // 動作 1：建立全新行程 (情境 A)
  // ==========================================
  const handleCreateNewTrip = async () => {
    if (days < 1 || days > 60) {
      setErrMsg("請輸入天數 1~60天");
      return;
    }
    if (startDate && startDate < todayStr) {
      setErrMsg("開始日期不可為過去的日期");
      return;
    }

    setSubmitting(true);
    setErrMsg("");

    try {
      const payload = {
        title: title.trim() || "My trip",
        days,
        start_date: startDate ? startDate : null,
        places: placeIds.map((gpid) => ({ google_place_id: gpid }))
      };

      const out = await apiPost<CreateTripRes>("/api/trips", payload);

      // trip 資料寫入localstorage
      upsertTripIndex({
        trip_id: out.trip_id,
        title: payload.title,
        days: payload.days,
        start_date: payload.start_date ?? null,
        edit_token: out.edit_token,
      });

      // 設定當前活躍的行程 ID，並清空購物車
      setActiveTripId(out.trip_id);
      clear(); 
      setOpen(false);
      
      router.push(`/planner/${out.trip_id}`);

    } catch (e: any) {
      setErrMsg(e?.message ?? "建立旅程失敗");
    } finally {
      setSubmitting(false);
    }
  };


  // ==========================================
  // 動作 2：已有trip，追加景點 (情境 B)
  // ==========================================
  const handleAppendToActiveTrip = async () => {
    if (!activeTripId) return;

    // 如果購物車沒東西，直接跳回去就好
    if (placeIds.length === 0) {
      router.push(`/planner/${activeTripId}`);
      return;
    }

    setSubmitting(true);
    try {
      // 利用 Promise.all 同時發送多個追加景點的 API 請求
      // 對應你 trips.py 裡面的 add_trip_place (POST /api/trips/{trip_id}/places)
      await Promise.all(
        placeIds.map(gpid => 
          apiPost(`/api/trips/${activeTripId}/places`, { google_place_id: gpid })
        )
      );

      // 追加成功後，清空購物車，然後跳轉回編輯頁面
      clear();
      router.push(`/planner/${activeTripId}`);
    } catch (e: any) {
      alert(e?.message ?? "追加景點失敗，請稍後再試");
    } finally {
      setSubmitting(false);
    }
  };


  // ==========================================
  // UI 渲染邏輯
  // ==========================================
  
  // 情境 B：已經有正在編輯的行程
  if (activeTripId) {
    return (
      <div className="fixed bottom-8 right-8 z-50 flex items-center gap-2">
        {/* 放棄目前行程，開新行程的小按鈕 */}
        <button
          onClick={() => {
            if(confirm("確定要放棄目前編輯的行程，建立一個全新的嗎？")) {
              clearActiveTrip();
            }
          }}
          className="rounded-full bg-white px-4 py-3 text-gray-500 shadow-lg border border-gray-200 hover:bg-gray-50 transition text-sm font-bold"
        >
          ✕ 開新行程
        </button>

        {/* 核心動作按鈕 */}
        <button
          onClick={handleAppendToActiveTrip}
          disabled={submitting}
          className="rounded-full bg-indigo-600 px-5 py-3 text-white shadow-lg hover:bg-indigo-700 transition font-bold disabled:opacity-60"
        >
          {submitting 
            ? "處理中..." 
            : draftCount > 0 
              ? `追加 ${draftCount} 個景點至目前行程 ➔` 
              : "返回目前行程 ➔"}
        </button>
      </div>
    );
  }

  // 情境 A：沒有行程，顯示原本的「建立按鈕」與 Modal
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-8 right-8 z-50 rounded-full bg-blue-600 px-5 py-3 text-white shadow-lg hover:bg-blue-700 transition font-bold"
      >
        下一步：開始規劃（已加入{draftCount}個景點）
      </button>

      {/* 以下 Modal 的 HTML 完全不變，只有按鈕 onClick 改綁定 handleCreateNewTrip */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={submitting ? undefined : close} />
          <div className="relative w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h2 className="text-xl font-bold mb-4">建立旅程（Trip）</h2>
            <div className="space-y-3">
              {/* ... 中間的 input (title, days, startDate) 保持原樣 ... */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">旅程名稱</label>
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例：家族旅遊" className="w-full rounded-lg border border-gray-300 px-3 py-2" disabled={submitting} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">天數（1~60）</label>
                <input type="number" value={days} onChange={(e) => setDays(Number(e.target.value))} min={1} max={60} className="w-full rounded-lg border border-gray-300 px-3 py-2" disabled={submitting} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">開始日期（可選）</label>
                <input type="date" value={startDate} min={todayStr} onChange={(e) => setStartDate(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2" disabled={submitting} />
              </div>

              {errMsg && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{errMsg}</div>}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button onClick={close} className="rounded-lg border border-gray-300 px-4 py-2 hover:bg-gray-50" disabled={submitting}>取消</button>
                <button onClick={handleCreateNewTrip} className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-60" disabled={submitting}>
                  {submitting ? "建立中..." : "建立"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}