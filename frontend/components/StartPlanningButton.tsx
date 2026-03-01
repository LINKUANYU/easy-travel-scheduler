"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import type { DraftPlace } from "@/hooks/useTripDraft"
import { upsertTripIndex } from "@/lib/tripIndex"

type Props = {
  draft: DraftPlace[];
  onCreated: () => void; // 通常傳clear()
};

type CreateTripRes = { trip_id: number} 

export default function StartPlanningButton({ draft, onCreated }: Props){
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [days, setDays] = useState<number>(5);
  const [startDate, setStartDate] = useState<string>(""); // "YYYY-MM-DD" or ""
  const [submitting, setSubmitting] = useState(false);
  const [errMsg, setErrMsg] = useState<string>("");

  const draftCount = draft.length;

  // 去重(以防萬一)
  const placeIds = useMemo(() => {
    const set = new Set<string>(); // 建立資料結構set
    for (const p of draft){
      if (p.google_place_id) set.add(p.google_place_id);
    }
    return Array.from(set);  // 把set轉成陣列
  }, [draft]);

  const canOpen = draftCount > 0;

  const close = () => {
    setOpen(false);
    setErrMsg("");
  };

  // 以台灣時區為今天時間
  const todayStr = new Intl.DateTimeFormat('fr-CA').format(new Date());

  const submit = async() => {
    if (placeIds.length === 0) return;
    if (days < 1 || days > 60) {
      setErrMsg("請輸入天數 1~60天");
      return
    }

    if (startDate && startDate < todayStr) {
    setErrMsg("開始日期不可為過去的日期");
    return;
  }

    setSubmitting(true);
    setErrMsg("");

    try{
      const payload = {
        title: title.trim() || "My trip",
        days,
        startDate: startDate ? startDate : null,
        places: placeIds.map((gpid) => ({google_place_id: gpid}))
      }

      const res = await fetch("http://localhost:8000/api/trips", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      })

      const data = (await res.json().catch(() => ({}))) as any; // 如果catch 就丟出空物件{}
      if (!res.ok){
        const detail = data?.detail ?? data?.message ?? "建立旅程失敗";
        throw new Error(typeof detail === "string" ? detail : "建立旅程失敗");
      }

      const out = data as CreateTripRes;

      // ✅ 成功：建立trip、清空 draft、關 modal、跳轉
      upsertTripIndex({
        trip_id: out.trip_id,
        title: payload.title,
        days: payload.days,
        start_date: payload.startDate ?? null,
      });
      onCreated();
      setOpen(false);
      // 建立成功後（out.trip_id 由你後端回傳）
      router.push(`/planner/${out.trip_id}`)

    } catch (e:any){
      setErrMsg(e?.message ?? "建立旅程失敗")
    } finally {
      setSubmitting(false);
    }

  };

  // 沒有 draft 就不顯示按鈕
  if (!canOpen) return null;

  return (
    <>
      {/* 右下角浮動按鈕 */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-8 right-8 z-50 rounded-full bg-blue-600 px-5 py-3 text-white shadow-lg hover:bg-blue-700 transition"
      >
        開始規劃（{draftCount}）
      </button>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* 背景遮罩 */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={submitting ? undefined : close}
          />

          {/* 內容 */}
          <div className="relative w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h2 className="text-xl font-bold mb-4">建立旅程（Trip）</h2>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  旅程名稱
                </label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="例：家族旅遊"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  disabled={submitting}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  天數（1~60）
                </label>
                <input
                  type="number"
                  value={days}
                  onChange={(e) => setDays(Number(e.target.value))}
                  min={1}
                  max={60}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  disabled={submitting}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  開始日期（可選）
                </label>
                <input
                  type="date"
                  value={startDate}
                  min={todayStr} // 限制最小值為今天
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  disabled={submitting}
                />
              </div>

              {errMsg && (
                <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                  {errMsg}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  onClick={close}
                  className="rounded-lg border border-gray-300 px-4 py-2 hover:bg-gray-50"
                  disabled={submitting}
                >
                  取消
                </button>
                <button
                  onClick={submit}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-60"
                  disabled={submitting || placeIds.length === 0}
                >
                  {submitting ? "建立中..." : "建立並進入 Planner"}
                </button>
              </div>
            </div>

            <p className="mt-3 text-xs text-gray-500">
              本次會建立 Trip，並把你已加入的 {draftCount} 個景點一次加入 Trip 景點池。
            </p>
          </div>
        </div>
      )}
    </>
  )
}








