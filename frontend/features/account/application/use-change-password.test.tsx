import { act, renderHook } from "@testing-library/react";
import axios from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useChangePassword } from "@/features/account/application/use-change-password";

const accountApiMock = vi.hoisted(() => ({
  bffChangePassword: vi.fn(),
}));

const authContextMock = vi.hoisted(() => ({
  useAuth: vi.fn(),
}));

vi.mock("@/features/account/infrastructure/account-api", () => accountApiMock);
vi.mock("@/features/auth/application/auth-context", () => authContextMock);

const USER_PAYLOAD = {
  id: "11111111-1111-1111-1111-111111111111",
  email: "owner@example.com",
  first_name: "Quang",
  last_name: "Minh",
  display_name: "Quang Minh",
  identify_name: "quangminh",
  identify_code: "ABC123",
  identify_tag: "quangminh#ABC123",
  avatar_url: null,
  email_verified: true,
  is_profile_completed: true,
  requires_profile_setup: false,
};

describe("useChangePassword", () => {
  const loginSuccess = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    authContextMock.useAuth.mockReturnValue({ loginSuccess });
  });

  it("replaces auth state with the fresh access token after password change", async () => {
    accountApiMock.bffChangePassword.mockResolvedValue({
      user: USER_PAYLOAD,
      access_token: "fresh-access-token",
    });

    const { result } = renderHook(() => useChangePassword());

    let ok = false;
    await act(async () => {
      ok = await result.current.submit({
        current_password: "OldValidPw123!",
        new_password: "BrandNewPw456!",
      });
    });

    expect(ok).toBe(true);
    expect(accountApiMock.bffChangePassword).toHaveBeenCalledWith({
      current_password: "OldValidPw123!",
      new_password: "BrandNewPw456!",
    });
    expect(loginSuccess).toHaveBeenCalledWith(USER_PAYLOAD, "fresh-access-token");
    expect(result.current.error).toBeNull();
    expect(result.current.submitting).toBe(false);
  });

  it("surfaces the backend detail and keeps the existing auth state on failure", async () => {
    accountApiMock.bffChangePassword.mockRejectedValue(
      new axios.AxiosError(
        "Request failed",
        "ERR_BAD_REQUEST",
        undefined,
        undefined,
        {
          status: 400,
          statusText: "Bad Request",
          headers: {},
          config: { headers: new axios.AxiosHeaders() },
          data: {
            detail: "Current password is incorrect.",
            error_code: "INVALID_CURRENT_PASSWORD",
          },
        },
      ),
    );

    const { result } = renderHook(() => useChangePassword());

    let ok = true;
    await act(async () => {
      ok = await result.current.submit({
        current_password: "WrongCurrent!",
        new_password: "BrandNewPw456!",
      });
    });

    expect(ok).toBe(false);
    expect(loginSuccess).not.toHaveBeenCalled();
    expect(result.current.error).toBe("Current password is incorrect.");
    expect(result.current.submitting).toBe(false);
  });
});
