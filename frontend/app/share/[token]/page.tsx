import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { SharedTripDataOut } from "@/app/types/trip";
import ShareWorkspace from "./ShareWorkspace";

async function fetchSharedTrip(token: string): Promise<SharedTripDataOut | null> {
  const baseUrl = process.env.API_BASE_URL;
  const res = await fetch(`${baseUrl}/api/share/${token}`);
  if (!res.ok) return null;
  return res.json();
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const data = await fetchSharedTrip(token);

  if (!data) {
    return { title: "找不到行程 | Easy Travel Scheduler" };
  }

  const { trip } = data;
  const images = [{ url: "/og-image.png" }];

  return {
    title: `${trip.title} | Easy Travel Scheduler`,
    description: `${trip.days} 天行程・快來看看這趟精彩旅程！`,
    openGraph: {
      title: `${trip.title} | Easy Travel Scheduler`,
      description: `${trip.days} 天行程・快來看看這趟精彩旅程！`,
      images,
    },
  };
}

export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const data = await fetchSharedTrip(token);

  if (!data) notFound();

  return <ShareWorkspace data={data} />;
}
