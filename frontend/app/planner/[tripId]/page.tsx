import PlannerClient from "./planner-client";

// 1. 將函式標記為 async
export default async function TripPlannerPage({ 
  params 
}: { 
  params: Promise<{ tripId: string }> // 2. 型別定義改為 Promise
}) {
  // 3. 使用 await 拆解 params
  const { tripId } = await params;

  return (
    <main style={{ padding: 16 }}>
      <PlannerClient tripId={tripId} />
    </main>
  );
}