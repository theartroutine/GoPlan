"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { TripDetailResponse } from "@/features/trips/domain/types";
import { bffGetTrip } from "@/features/trips/infrastructure/trips-api";

type TripContextValue = {
  tripId: string;
  data: TripDetailResponse | null;
  loading: boolean;
  error: string | null;
  notFound: boolean;
  refresh: () => Promise<void>;
};

const TripContext = createContext<TripContextValue | null>(null);

export function useTripContext(): TripContextValue {
  const ctx = useContext(TripContext);
  if (!ctx) throw new Error("useTripContext must be used within TripProvider");
  return ctx;
}

export function TripProvider({
  tripId,
  children,
}: {
  tripId: string;
  children: React.ReactNode;
}) {
  const [data, setData] = useState<TripDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await bffGetTrip(tripId);
      setData(result);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 403 || status === 404) setNotFound(true);
      else setError("Failed to load trip.");
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <TripContext.Provider
      value={{ tripId, data, loading, error, notFound, refresh: load }}
    >
      {children}
    </TripContext.Provider>
  );
}
