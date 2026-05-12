import type { TripData } from "@/app/types/trip";
import ExploreTripCard from "@/app/components/home/ExploreTripCard";

async function fetchExploreTrips(): Promise<TripData[]> {
  try {
    const baseUrl = process.env.API_BASE_URL ?? "http://backend:8000";
    const res = await fetch(`${baseUrl}/api/explore/trips`, {
      cache: "no-store",
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export default async function ExploreSection() {
  const trips = await fetchExploreTrips();

  return (
    <section className="w-full max-w-7xl px-8 pb-32">
      <div className="flex flex-col mb-12">
        <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">
          熱門行程推薦
        </h2>
        <div className="h-1 w-24 bg-slate-900 mt-4 rounded-full" />
      </div>

      {trips.length === 0 ? (
        <p className="text-gray-500">目前還沒有公開的行程喔！</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 w-full">
          {trips.map((trip) => (
            <ExploreTripCard key={trip.trip_id} trip={trip} />
          ))}
        </div>
      )}
    </section>
  );
}
