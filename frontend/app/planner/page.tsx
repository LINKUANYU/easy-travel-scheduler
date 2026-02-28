import TripListClient from "./trip-list-client";

export default function PlannerPage() {
  return (
    <main style={{ padding: 16 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700 }}>Trips（本裝置）</h1>
      <TripListClient />
    </main>
  );
}