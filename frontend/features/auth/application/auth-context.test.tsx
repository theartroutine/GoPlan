import { render, screen, act } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";

import { AuthProvider, useAuth } from "@/features/auth/application/auth-context";
import { bffMe } from "@/features/auth/infrastructure/auth-api";

vi.mock("@/features/auth/infrastructure/auth-api", () => ({
  bffLogout: vi.fn(),
  bffMe: vi.fn(),
}));

vi.mock("@/features/auth/infrastructure/auth-channel", () => ({
  broadcastLogout: vi.fn(),
  broadcastProfileCompleted: vi.fn(),
  onAuthMessage: vi.fn(() => () => undefined),
}));

vi.mock("@/features/auth/infrastructure/token-manager", () => ({
  tokenManager: {
    clear: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
  },
}));

function StatusProbe() {
  const { status } = useAuth();
  return <div data-testid="auth-status">{status}</div>;
}

describe("AuthProvider", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("falls back to unauthenticated when bootstrap request never settles", async () => {
    vi.useFakeTimers();
    vi.mocked(bffMe).mockReturnValue(new Promise(() => undefined));

    render(
      <AuthProvider>
        <StatusProbe />
      </AuthProvider>,
    );

    expect(screen.getByTestId("auth-status").textContent).toBe("loading");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(13_000);
    });

    expect(screen.getByTestId("auth-status").textContent).toBe("unauthenticated");
    expect(bffMe).toHaveBeenCalledTimes(3);
  });
});
