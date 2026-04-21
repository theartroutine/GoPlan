"use client";

import axios from "axios";
import { useCallback, useEffect, useState } from "react";

import type { TripListItem } from "@/features/trips/domain/types";
import { bffListTrips } from "@/features/trips/infrastructure/trips-api";

const LOAD_TRIPS_ERROR_MESSAGE = "Failed to load trips.";
const RETRY_DELAYS_MS = [150, 400];
const SOFT_AUTH_ERROR_CODE = "refresh_auth_soft_failed";

type ErrorPayload = {
  code?: unknown;
};

function extractErrorCode(data: unknown): string | null {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return null;
  }

  const code = (data as ErrorPayload).code;
  return typeof code === "string" ? code : null;
}

function isRetryableTripLoadError(error: unknown): boolean {
  if (!axios.isAxiosError(error)) {
    return true;
  }

  const status = error.response?.status;
  if (typeof status !== "number") {
    return true;
  }

  if (status === 401) {
    return extractErrorCode(error.response?.data) === SOFT_AUTH_ERROR_CODE;
  }

  return status === 429 || status >= 500;
}

type UseDashboardTripsResult = {
  trips: TripListItem[];
  loading: boolean;
  error: string | null;
  retry: () => void;
};

export function useDashboardTrips(): UseDashboardTripsResult {
  const [trips, setTrips] = useState<TripListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requestVersion, setRequestVersion] = useState(0);

  const retry = useCallback(() => {
    setLoading(true);
    setError(null);
    setRequestVersion((currentVersion) => currentVersion + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    async function loadTrips(attempt = 0) {
      try {
        const data = await bffListTrips();
        if (cancelled) return;

        setTrips(data.results);
        setError(null);
        setLoading(false);
      } catch (error) {
        if (cancelled) return;

        const shouldRetry =
          attempt < RETRY_DELAYS_MS.length &&
          isRetryableTripLoadError(error);

        if (shouldRetry) {
          retryTimer = setTimeout(() => {
            if (!cancelled) {
              void loadTrips(attempt + 1);
            }
          }, RETRY_DELAYS_MS[attempt]);
          return;
        }

        setError(LOAD_TRIPS_ERROR_MESSAGE);
        setLoading(false);
      }
    }

    void loadTrips();

    return () => {
      cancelled = true;
      if (retryTimer) {
        clearTimeout(retryTimer);
      }
    };
  }, [requestVersion]);

  return { trips, loading, error, retry };
}
