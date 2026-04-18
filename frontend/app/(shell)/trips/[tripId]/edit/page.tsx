"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { EditTripForm } from "@/features/trips/presentation/edit-trip-form";
import { useTripContext } from "@/features/trips/presentation/trip-context";

export default function EditTripPage() {
  const { data } = useTripContext();
  const router = useRouter();

  useEffect(() => {
    if (data && data.my_membership.role !== "CAPTAIN") {
      router.replace(`/trips/${data.trip.id}/overview`);
    }
  }, [data, router]);

  if (!data || data.my_membership.role !== "CAPTAIN") return null;

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-6 text-xl font-bold">Edit Trip</h1>
      <EditTripForm trip={data.trip} />
    </div>
  );
}
