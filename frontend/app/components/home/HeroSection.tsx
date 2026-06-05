"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import SearchPanel from "@/app/components/home/SearchPanel";
import CreateTripModal from "@/app/components/home/CreateTripModal";
import AddPlacesToTripBtn from "@/app/components/home/AddPlacesToTripBtn";
import { useTripDraft } from "@/app/hooks/useTripDraft";

const BACKGROUND_IMAGES = [
  "/Home-bg/Home-bg-1.webp",
  "/Home-bg/Home-bg-2.webp",
  "/Home-bg/Home-bg-3.webp",
  "/Home-bg/Home-bg-4.webp",
  "/Home-bg/Home-bg-5.webp",
  "/Home-bg/Home-bg-6.webp",
  "/Home-bg/Home-bg-7.webp",
  "/Home-bg/Home-bg-8.webp",
  "/Home-bg/Home-bg-9.webp",
  "/Home-bg/Home-bg-10.webp",
  "/Home-bg/Home-bg-11.webp",
];

export default function HeroSection() {
  const router = useRouter();
  const { activeTripId } = useTripDraft();

  const [bgIndex, setBgIndex] = useState(0);
  const [destinationInput, setDestinationInput] = useState<string>("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchLoc, setSearchLoc] = useState("");

  useEffect(() => {
    const timer = setInterval(() => {
      setBgIndex((prev) => (prev + 1) % BACKGROUND_IMAGES.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  const handleSearch = async (location: string) => {
    if (!location.trim()) return toast.error("請輸入地點");
    setSearchLoc(location);
    if (!activeTripId) {
      setIsModalOpen(true);
    } else {
      router.push(`/search?location=${location}`);
    }
  };

  const handleModalSuccess = () => {
    setIsModalOpen(false);
    router.push(`/search?location=${searchLoc}`);
  };

  return (
    <>
      {/* --- 全螢幕背景圖層 --- */}
      <div className="fixed inset-0 z-0 w-full h-full bg-[#f9f9ff]">
        {BACKGROUND_IMAGES.map((src, index) => (
          <div
            key={src}
            className="absolute inset-0 bg-cover bg-center bg-no-repeat transition-opacity duration-[1500ms] ease-in-out"
            style={{
              backgroundImage: `url('${src}')`,
              opacity: index === bgIndex ? 0.8 : 0,
            }}
          />
        ))}
        <div className="absolute inset-0 bg-gradient-to-b from-[#f9f9ff]/60 via-transparent to-[#f9f9ff]/80" />
      </div>

      {/* Hero 搜尋框區塊 */}
      <section className="w-full max-w-5xl px-6 pt-24 pb-24 flex flex-col items-center">
        <div className="w-full max-w-3xl">
          <SearchPanel
            destination={destinationInput}
            onDestinationChange={setDestinationInput}
            onSearch={(city) => handleSearch(city || destinationInput)}
          />
        </div>
      </section>

      <CreateTripModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={handleModalSuccess}
      />

      {activeTripId && <AddPlacesToTripBtn />}
    </>
  );
}
