"use client";

type Props = {
  destination: string;
  onDestinationChange: (value: string) => void;
  onSearch: () => void;
  loading: boolean;
  responseMsg: string;
  isPolling?: boolean;
};

export default function SearchPanel({
  destination,
  onDestinationChange,
  onSearch,
  loading,
  responseMsg,
  isPolling = false, // 預設給false
}: Props) {

// 🌟 2. 只要是在 loading 或 polling 狀態，就鎖定輸入
  const isDisabled = loading || isPolling;  

  return (
    <div className="bg-white p-8 rounded-lg shadow-md">
      <h1 className="text-2xl font-bold text-gray-800 mb-6 text-center">
        這次想去哪個城市旅遊呢？
      </h1>

      <div className="flex flex-col gap-4">
        <input
          type="text"
          value={destination}
          onChange={(e) => onDestinationChange(e.target.value)}
          placeholder="請輸入國家／城市（東京、巴黎、上海、洛杉磯）"
          className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-700"
          disabled={isDisabled}
        />

        <button
          onClick={onSearch}
          disabled={isDisabled}
          className="w-full bg-blue-600 text-white p-3 rounded-lg hover:bg-blue-700 transition disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? "搜尋中..." : isPolling ? "背景探索中，請稍候..." : "出發搜尋"}
        </button>

        {responseMsg && (
          <div className="mt-2 p-3 bg-green-50 text-green-700 rounded-lg text-center">
            {responseMsg}
          </div>
        )}
      </div>
    </div>
  );
}