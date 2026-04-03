"use client";

import { useState } from "react";
import { apiPost, apiPatch } from "@/app/lib/api";
import { useAuth } from "@/app/context/AuthContext";
import { useTripDraft } from "@/app/hooks/useTripDraft";
import { upsertTripIndex } from "@/app/lib/tripIndex";

type CreateTripRes = { trip_id: number; edit_token: string };

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (tripId: number) => void; // 成功後把 tripId 往外傳，交給呼叫者決定跳轉去哪
};

export default function CreateTripModal({ isOpen, onClose, onSuccess }: Props) {
  const { user } = useAuth();
  const { activeTripId, setActiveTripId, clear } = useTripDraft();

  const [title, setTitle] = useState("");
  const [days, setDays] = useState<number>(5);
  const [startDate, setStartDate] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [errMsg, setErrMsg] = useState<string>("");
  
  if(activeTripId) return null;
  if (!isOpen) return null;

  // 以台灣時區為今天時間
  const todayStr = new Intl.DateTimeFormat('fr-CA').format(new Date());

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
      };

      const out = await apiPost<CreateTripRes>("/api/trips", payload);

      // 有登入就綁定，沒登入就存本機
      if (user) {
        try {
          await apiPatch(`/api/trips/${out.trip_id}/bind`);
        } catch (bindErr) {
          console.error("行程建立成功，但綁定帳號時發生錯誤", bindErr);
        }
      } else {
        upsertTripIndex({
          trip_id: out.trip_id,
          title: payload.title,
          days: payload.days,
          start_date: payload.start_date ?? null,
          edit_token: out.edit_token,
        });
      }

      // 設定當前活躍的行程 ID，並清空草稿車確保乾淨
      setActiveTripId(out.trip_id);
      clear(); 
      
      // 把 trip_id 丟給外面的元件（首頁或按鈕）處理後續跳轉
      onSuccess(out.trip_id);

    } catch (e: any) {
      setErrMsg(e?.message ?? "建立旅程失敗");
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setErrMsg("");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      {/* 點擊背景關閉 */}
      <div 
        className="absolute inset-0 bg-black/40 backdrop-blur-sm" 
        onClick={submitting ? undefined : handleClose} 
      />
      <div className="relative w-[90%] max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h2 className="text-xl font-bold mb-4">建立旅程（Trip）</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">旅程名稱</label>
            <input 
              value={title} 
              onChange={(e) => setTitle(e.target.value)} 
              maxLength={20}
              placeholder="例：家族旅遊" 
              className="w-full rounded-lg border border-gray-300 px-3 py-2" 
              disabled={submitting} 
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">天數（1~60）</label>
            <input 
              type="text" // 放棄難用的原生 number，改用 text
              inputMode="numeric" // 確保手機點擊時，依然會彈出九宮格數字鍵盤
              pattern="[0-9]*"
              // 若天數為 0 或沒值時，顯示空字串，讓使用者可以整欄刪乾淨
              value={days === 0 ? "" : days} 
              onChange={(e) => {
                const val = e.target.value;
                
                // 1. 如果使用者把欄位清空，先設定為 0 (搭配上面的 value 判斷，畫面會是空的)
                if (val === "") {
                  setDays(0); 
                  return;
                }

                // 2. 只允許輸入數字，過濾掉 . - e 等奇怪符號
                if (/^\d+$/.test(val)) {
                  let num = parseInt(val, 10);
                  // 3. 即時限制最大值不能超過 60
                  if (num > 60) num = 60;
                  setDays(num);
                }
              }}
              onBlur={() => {
                // 4. 防呆：當使用者離開輸入框時，如果欄位是空的或小於 1，自動幫他補上 1
                if (!days || days < 1) {
                  setDays(1);
                }
              }}
              className="w-full rounded-lg border border-gray-300 px-3 py-2" 
              disabled={submitting} 
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">開始日期（可選）</label>
            <input 
              type="date" 
              value={startDate} 
              min={todayStr} 
              onChange={(e) => setStartDate(e.target.value)} 
              className="w-full rounded-lg border border-gray-300 px-3 py-2" 
              disabled={submitting} 
            />
          </div>

          {errMsg && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{errMsg}</div>}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button 
              onClick={handleClose} 
              className="rounded-lg border border-gray-300 px-4 py-2 hover:bg-gray-50 transition" 
              disabled={submitting}
            >
              取消
            </button>
            <button 
              onClick={handleCreateNewTrip} 
              className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 transition disabled:opacity-60" 
              disabled={submitting}
            >
              {submitting ? "建立中..." : "建立"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}