import { Suspense } from "react";
import HeroSection from "./components/home/HeroSection";
import ExploreSection from "./components/home/ExploreSection";

export default function Home() {
  return (
    <main className="flex flex-col items-center w-full bg-[#f9f9ff]">
      <div className="relative z-10 w-full flex flex-col items-center">
        <HeroSection />
        <Suspense fallback={<p className="text-gray-500 pb-32">載入中...</p>}>
          <ExploreSection />
        </Suspense>
      </div>
    </main>
  );
}
