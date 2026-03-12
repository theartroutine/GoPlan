"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import axios from "axios";

import type { AuthAction, AuthState, AuthUser } from "@/features/auth/domain/types";
import { tokenManager } from "@/features/auth/infrastructure/token-manager";
import { bffLogout, bffMe } from "@/features/auth/infrastructure/auth-api";
import {
  broadcastLogout,
  broadcastProfileCompleted,
  onAuthMessage,
} from "@/features/auth/infrastructure/auth-channel";

const initialState: AuthState = {
  user: null,
  status: "idle",
};

const BOOTSTRAP_RETRY_DELAYS_MS = [150, 400];
const SOFT_AUTH_ERROR_CODE = "refresh_auth_soft_failed";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isRetryableBootstrapError(error: unknown): boolean {
  if (!axios.isAxiosError(error)) {
    return true;
  }

  const status = error.response?.status;
  if (typeof status !== "number") {
    return true;
  }

  if (status === 401) {
    const payload = error.response?.data;
    if (typeof payload === "object" && payload !== null && !Array.isArray(payload)) {
      const code = (payload as { code?: unknown }).code;
      return code === SOFT_AUTH_ERROR_CODE;
    }
    return false;
  }

  return status === 429 || status >= 500;
}

function resolveAuthStatus(user: AuthUser): "authenticated" | "pending_profile" {
  return user.requires_profile_setup ? "pending_profile" : "authenticated";
}

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case "AUTH_LOADING":
      return { ...state, status: "loading" };
    case "AUTH_SUCCESS":
      return { user: action.user, status: "authenticated" };
    case "AUTH_PENDING_PROFILE":
      return { user: action.user, status: "pending_profile" };
    case "AUTH_PROFILE_COMPLETED":
      return { user: action.user, status: "authenticated" };
    case "AUTH_LOGOUT":
      return { user: null, status: "unauthenticated" };
  }
}

type AuthContextValue = AuthState & {
  loginSuccess: (user: AuthUser, accessToken: string) => void;
  profileUpdateSuccess: (user: AuthUser) => void;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, initialState);

  // Bootstrap session on mount
  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      dispatch({ type: "AUTH_LOADING" });

      for (let attempt = 0; attempt <= BOOTSTRAP_RETRY_DELAYS_MS.length; attempt += 1) {
        try {
          const data = await bffMe();
          if (cancelled) return;
          tokenManager.set(data.access_token);

          const status = resolveAuthStatus(data.user);
          if (status === "pending_profile") {
            dispatch({ type: "AUTH_PENDING_PROFILE", user: data.user });
          } else {
            dispatch({ type: "AUTH_SUCCESS", user: data.user });
          }
          return;
        } catch (error) {
          if (cancelled) return;

          const shouldRetry =
            attempt < BOOTSTRAP_RETRY_DELAYS_MS.length &&
            isRetryableBootstrapError(error);

          if (!shouldRetry) {
            break;
          }

          await sleep(BOOTSTRAP_RETRY_DELAYS_MS[attempt]);
          if (cancelled) return;
        }
      }

      tokenManager.clear();
      dispatch({ type: "AUTH_LOGOUT" });
    }

    void bootstrap();
    return () => { cancelled = true; };
  }, []);

  // Multi-tab sync
  useEffect(() => {
    return onAuthMessage((msg) => {
      if (msg.type === "logout") {
        tokenManager.clear();
        dispatch({ type: "AUTH_LOGOUT" });
      }
      if (msg.type === "profile_completed") {
        // Re-bootstrap to get fresh user data in other tabs
        void bffMe()
          .then((data) => {
            tokenManager.set(data.access_token);
            dispatch({ type: "AUTH_PROFILE_COMPLETED", user: data.user });
          })
          .catch(() => {
            // Best-effort sync; user can reload manually
          });
      }
      if (msg.type === "email_verified") {
        // Re-bootstrap: refresh cookie is now available after verification
        void bffMe()
          .then((data) => {
            tokenManager.set(data.access_token);
            const authStatus = resolveAuthStatus(data.user);
            if (authStatus === "pending_profile") {
              dispatch({ type: "AUTH_PENDING_PROFILE", user: data.user });
            } else {
              dispatch({ type: "AUTH_SUCCESS", user: data.user });
            }
          })
          .catch(() => {
            // Best-effort; user can reload manually
          });
      }
    });
  }, []);

  const loginSuccess = useCallback((user: AuthUser, accessToken: string) => {
    tokenManager.set(accessToken);

    const status = resolveAuthStatus(user);
    if (status === "pending_profile") {
      dispatch({ type: "AUTH_PENDING_PROFILE", user });
    } else {
      dispatch({ type: "AUTH_SUCCESS", user });
    }
  }, []);

  const profileUpdateSuccess = useCallback((user: AuthUser) => {
    dispatch({ type: "AUTH_PROFILE_COMPLETED", user });
    broadcastProfileCompleted();
  }, []);

  const logout = useCallback(async () => {
    try {
      await bffLogout();
    } catch {
      // Best-effort
    }
    tokenManager.clear();
    dispatch({ type: "AUTH_LOGOUT" });
    broadcastLogout();
  }, []);

  const value = useMemo(
    () => ({ ...state, loginSuccess, profileUpdateSuccess, logout }),
    [state, loginSuccess, profileUpdateSuccess, logout],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
