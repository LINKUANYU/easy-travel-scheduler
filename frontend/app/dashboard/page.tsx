import DashboardTripList from "./trip-list-client";

export default function DashboardPage() {
  return (
    <main className="p-6 max-w-5xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">我的行程管理中心</h1>
        {/* 未來可以加一個 "新增行程" 的按鈕導回首頁 */}
      </div>
      
      {/* 載入客戶端清單元件 */}
      <DashboardTripList />
    </main>
  );
}