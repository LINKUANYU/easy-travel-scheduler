"use client";

type Props = {
  destination: string;
  onDestinationChange: (value: string) => void;
  onSearch: () => void;
};

export default function SearchPanel({
  destination,
  onDestinationChange,
  onSearch,
}: Props) {


  return (
    <div className="relative bg-white/40 p-10 rounded-[2.5rem] shadow-[0_8px_30px_rgb(0,0,0,0.12)] max-w-2xl mx-auto border border-white/20">
      <h1 className="text-3xl font-extrabold text-slate-900 mb-8 text-center tracking-tight">
        這次想去哪個城市旅遊呢？
      </h1>

      <div className="relative flex items-center">
        <input
          type="text"
          value={destination}
          onChange={(e) => onDestinationChange(e.target.value)}
          placeholder="請輸入國家／城市（東京、巴黎、上海、洛杉磯）"
          className="w-full pl-6 pr-32 py-5 bg-white/80 border-none rounded-full focus:ring-2 focus:ring-blue-100 transition-all text-slate-700 placeholder:text-slate-400"
        />

        <button
          onClick={onSearch}
          className="absolute right-2 bg-slate-900/80 text-white px-8 py-3.5 rounded-full hover:bg-slate-800 transition-all font-bold text-sm"
        >
          出發搜尋
        </button>

      </div>
    </div>
  );
}