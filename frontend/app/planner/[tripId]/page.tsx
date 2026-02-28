import PlannerClient from "./planner-client";

// 1. 將函式標記為 async
export default async function TripPlannerPage(
  // 【參數部分：定義輸入】 // 方括號 [tripId] 就是一個動態參數，params 就會是一個包含 { tripId: "123" } 的物件。}: {  // : 後面接的是對前面參數的「規格說明」。
  // 這個函式的參數必須是一個物件，裡面要有一個名為 params 的 Key，而這個 params 的內容必須是一個會回傳 { tripId: 字串 } 的 Promise 物件。
  { params }: { params: Promise<{ tripId: string }> } 
) {
  // 3. 使用 await 拆解 params
  const { tripId } = await params;

  return (
    <main style={{ padding: 16 }}>
      <PlannerClient tripId={tripId} />
    </main>
  );
}